import Phaser from 'phaser';
import { HtmlOverlay } from './htmlOverlay';

export const PALETTE: number[] = [
  0x00000000, 0xff000000, 0xff1a1a2e, 0xff16213e, 0xff0f3460, 0xff533483,
  0xffe94560, 0xffff6b6b, 0xffff9f43, 0xffffd700, 0xff2ecc71, 0xff1abc9c,
  0xff3498db, 0xff9b59b6, 0xffffffff, 0xffcccccc, 0xff888888, 0xff444444,
  0xff8b6914, 0xff5c4033, 0xff2d6a4f, 0xff40916c, 0xffb7e4c7, 0xff4a4e69,
];

const SWATCH = 28;
const SWATCH_COLS = 6;

export interface ColorPanelConfig {
  scene: Phaser.Scene;
  overlay: HtmlOverlay;
  /** Left edge of the panel (label, hex row, swatches, HSV, recent). */
  x: number;
  /** Y of the hex-input row ('COLOR' label sits 22px above). */
  paletteY: number;
  /** Y of the 'CUSTOM COLOR' label (spectrum starts 18px below). */
  hsvY: number;
  /** Y of the 'RECENT' label (swatches start 16px below). */
  recentY: number;
  /** Width of the HSV spectrum / hue / alpha strips. */
  width: number;
  onStatus?: (msg: string) => void;
}

/**
 * Shared color-selection panel: 24-swatch palette, rrggbbaa hex input,
 * HSV spectrum + hue + alpha strips, recent-color row.
 * Extracted from TileEditorScene; used by tile and sprite editors.
 */
export class ColorPanel {
  color = 0xff000000;

  private scene: Phaser.Scene;
  private overlay: HtmlOverlay;
  private cfg: ColorPanelConfig;

  private hexInputEl?: HTMLInputElement;
  private swatchHighlight?: Phaser.GameObjects.Graphics;

  // HSV color picker state
  private hsvH = 0;           // 0–360
  private hsvS = 0;           // 0–1
  private hsvV = 1;           // 0–1
  private hsvA = 255;         // 0–255
  private specEl?: HTMLCanvasElement;
  private hueEl?: HTMLCanvasElement;
  private alphaEl?: HTMLCanvasElement;

  private recentColors: number[] = [];
  private recentGfxList: Phaser.GameObjects.Graphics[] = [];
  private static readonly MAX_RECENT = 12;

  constructor(cfg: ColorPanelConfig) {
    this.cfg = cfg;
    this.scene = cfg.scene;
    this.overlay = cfg.overlay;

    this.buildPaletteUI();
    this.buildColorPicker();
    this.buildRecentColors();
  }

  /** Externally set the current color (e.g. from an eyedropper). */
  setColor(argb: number, addRecent = false): void {
    this.color = argb;
    if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(argb);
    this.syncHsvFromColor(argb);
    this.redrawColorPicker();
    if (addRecent) this.addToRecent(argb);
    const matchIdx = PALETTE.indexOf(argb);
    if (matchIdx >= 0) {
      this.updateSwatchHighlight(matchIdx);
    } else {
      this.swatchHighlight?.destroy();
      this.swatchHighlight = undefined;
    }
  }

  // ─── Palette UI ────────────────────────────────────────────────────────────

  private buildPaletteUI(): void {
    const { x, paletteY } = this.cfg;
    const swatchY = paletteY + 36;

    this.scene.add.text(x, paletteY - 22, 'COLOR', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    // ── hex input row ──────────────────────────────────────────────────
    this.scene.add.text(x, paletteY, '#', {
      fontSize: '18px', color: '#889aaa', fontFamily: 'monospace',
    });

    // Draw a frame for the input so it visually fits the scene
    const inputFrameGfx = this.scene.add.graphics();
    const inputFX = x + 14;
    const inputFY = paletteY - 2;
    const inputFW = SWATCH_COLS * (SWATCH + 2) - 16;
    const inputFH = 26;
    inputFrameGfx.fillStyle(0x0d0d1a, 1);
    inputFrameGfx.fillRect(inputFX, inputFY, inputFW, inputFH);
    inputFrameGfx.lineStyle(1, 0x334466, 1);
    inputFrameGfx.strokeRect(inputFX, inputFY, inputFW, inputFH);

    // Actual HTML input element — handles paste, cursor, keyboard properly
    this.hexInputEl = this.createHexInputElement(inputFX, inputFY, inputFW, inputFH);

    // ── palette swatches ───────────────────────────────────────────────
    PALETTE.forEach((argb, i) => {
      const col = i % SWATCH_COLS;
      const row = Math.floor(i / SWATCH_COLS);
      const sx = x + col * (SWATCH + 2);
      const sy = swatchY + row * (SWATCH + 4);

      const g = this.scene.add.graphics();
      const a = ((argb >>> 24) & 0xff) / 255;

      if (a < 0.01) {
        g.fillStyle(0xbbbbbb, 1); g.fillRect(sx, sy, SWATCH / 2, SWATCH / 2);
        g.fillStyle(0xbbbbbb, 1); g.fillRect(sx + SWATCH / 2, sy + SWATCH / 2, SWATCH / 2, SWATCH / 2);
        g.fillStyle(0x777777, 1); g.fillRect(sx + SWATCH / 2, sy, SWATCH / 2, SWATCH / 2);
        g.fillStyle(0x777777, 1); g.fillRect(sx, sy + SWATCH / 2, SWATCH / 2, SWATCH / 2);
      } else {
        g.fillStyle(argb & 0x00ffffff, a);
        g.fillRect(sx, sy, SWATCH, SWATCH);
      }
      g.lineStyle(1, 0x334455, 1);
      g.strokeRect(sx, sy, SWATCH, SWATCH);

      g.setInteractive(new Phaser.Geom.Rectangle(sx, sy, SWATCH, SWATCH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => {
        this.color = argb;
        this.updateSwatchHighlight(i);
        if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(argb);
        this.syncHsvFromColor(argb);
        this.redrawColorPicker();
        this.addToRecent(argb);
        const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
        this.cfg.onStatus?.(`color: #${hex}  α:${Math.round(a * 100)}%`);
      });
    });

    // default black selected
    this.updateSwatchHighlight(1);
    if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(0xff000000);
  }

  private createHexInputElement(lx: number, ly: number, lw: number, lh: number): HTMLInputElement {
    const el = document.createElement('input');
    el.type = 'text';
    el.maxLength = 8;
    el.placeholder = 'rrggbbaa';
    el.spellcheck = false;

    el.style.position = 'fixed';
    el.style.background = 'transparent';
    el.style.color = '#aaccff';
    el.style.border = 'none';
    el.style.outline = 'none';
    el.style.fontFamily = 'monospace';
    el.style.boxSizing = 'border-box';
    el.style.padding = '2px 4px';
    el.style.letterSpacing = '1px';
    el.style.zIndex = '1000';

    this.overlay.add(el, lx, ly, lw, lh);

    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
      const v = el.value;
      if (v.length === 6 || v.length === 8) this.applyHexColor(v);
      // full rrggbbaa entered — hand the keyboard back to the editor
      if (v.length === 8) el.blur();
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { el.blur(); e.preventDefault(); }
      e.stopPropagation(); // keep Phaser from swallowing alphanumeric keys
    });

    return el;
  }

  private colorToHex8(argb: number): string {
    const r = ((argb >>> 16) & 0xff).toString(16).padStart(2, '0');
    const g = ((argb >>>  8) & 0xff).toString(16).padStart(2, '0');
    const b = ( argb         & 0xff).toString(16).padStart(2, '0');
    const a = ((argb >>> 24) & 0xff).toString(16).padStart(2, '0');
    return `${r}${g}${b}${a}`;
  }

  private applyHexColor(hex: string): void {
    let r = 0, g = 0, b = 0, a = 255;
    if (hex.length >= 6) {
      r = parseInt(hex.slice(0, 2), 16);
      g = parseInt(hex.slice(2, 4), 16);
      b = parseInt(hex.slice(4, 6), 16);
    }
    if (hex.length === 8) {
      a = parseInt(hex.slice(6, 8), 16);
    }
    this.color = (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
    this.syncHsvFromColor(this.color);
    this.redrawColorPicker();
    this.addToRecent(this.color);
    const matchIdx = PALETTE.indexOf(this.color);
    if (matchIdx >= 0) {
      this.updateSwatchHighlight(matchIdx);
    } else {
      this.swatchHighlight?.destroy();
      this.swatchHighlight = undefined;
    }
    const hex6 = (this.color & 0x00ffffff).toString(16).padStart(6, '0');
    this.cfg.onStatus?.(`color: #${hex6}  α:${Math.round(a / 255 * 100)}%`);
  }

  private updateSwatchHighlight(index: number): void {
    this.swatchHighlight?.destroy();
    const col = index % SWATCH_COLS;
    const row = Math.floor(index / SWATCH_COLS);
    const sx = this.cfg.x + col * (SWATCH + 2) - 1;
    const sy = this.cfg.paletteY + 36 + row * (SWATCH + 4) - 1;
    const g = this.scene.add.graphics();
    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(sx, sy, SWATCH + 2, SWATCH + 2);
    g.setDepth(10);
    this.swatchHighlight = g;
  }

  // ─── HSV Color picker ─────────────────────────────────────────────────────

  private buildColorPicker(): void {
    const PX = this.cfg.x;
    const PW = this.cfg.width;
    const PY = this.cfg.hsvY;
    const SPEC_H  = 150;
    const STRIP_H = 16;
    const GAP     = 7;

    this.scene.add.text(PX, PY - 4, 'CUSTOM COLOR', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    this.specEl  = this.makePickerCanvas(PX, PY + 18,                               PW, SPEC_H);
    this.hueEl   = this.makePickerCanvas(PX, PY + 18 + SPEC_H + GAP,               PW, STRIP_H);
    this.alphaEl = this.makePickerCanvas(PX, PY + 18 + SPEC_H + GAP * 2 + STRIP_H, PW, STRIP_H);

    const drag = (el: HTMLCanvasElement, cb: (e: MouseEvent) => void): void => {
      el.addEventListener('mousedown',  cb);
      el.addEventListener('mousemove',  (e) => { if (e.buttons & 1) cb(e); });
      el.addEventListener('touchstart', (e) => { e.preventDefault(); cb(this.touchToMouse(e)); }, { passive: false });
      el.addEventListener('touchmove',  (e) => { e.preventDefault(); cb(this.touchToMouse(e)); }, { passive: false });
    };

    drag(this.specEl,  (e) => {
      const r = this.specEl!.getBoundingClientRect();
      this.hsvS = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      this.hsvV = 1 - Math.max(0, Math.min(1, (e.clientY - r.top)  / r.height));
      this.commitHsv();
    });
    drag(this.hueEl,   (e) => {
      const r = this.hueEl!.getBoundingClientRect();
      this.hsvH = Math.max(0, Math.min(359.99, (e.clientX - r.left) / r.width * 360));
      this.commitHsv();
    });
    drag(this.alphaEl, (e) => {
      const r = this.alphaEl!.getBoundingClientRect();
      this.hsvA = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 255);
      this.commitHsv();
    });

    // add to recent on release from any HSV picker
    const onHsvRelease = (): void => { this.addToRecent(this.color); };
    for (const el of [this.specEl, this.hueEl, this.alphaEl]) {
      el.addEventListener('mouseup', onHsvRelease);
      el.addEventListener('touchend', onHsvRelease);
    }

    this.syncHsvFromColor(this.color);
    this.redrawColorPicker();
  }

  private makePickerCanvas(lx: number, ly: number, lw: number, lh: number): HTMLCanvasElement {
    const el = document.createElement('canvas');
    el.width  = lw;
    el.height = lh;
    el.style.position = 'fixed';
    el.style.zIndex   = '999';
    el.style.cursor   = 'crosshair';
    this.overlay.add(el, lx, ly, lw, lh);
    return el;
  }

  private touchToMouse(e: TouchEvent): MouseEvent {
    const t = e.touches[0] ?? e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY, buttons: 1 } as MouseEvent;
  }

  private commitHsv(): void {
    const [r, g, b] = this.hsvToRgb(this.hsvH, this.hsvS, this.hsvV);
    this.color = ((this.hsvA << 24) | (r << 16) | (g << 8) | b) >>> 0;
    if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(this.color);
    const matchIdx = PALETTE.indexOf(this.color);
    if (matchIdx >= 0) { this.updateSwatchHighlight(matchIdx); }
    else { this.swatchHighlight?.destroy(); this.swatchHighlight = undefined; }
    this.redrawColorPicker();
  }

  private syncHsvFromColor(argb: number): void {
    const r = (argb >>> 16) & 0xff;
    const g = (argb >>>  8) & 0xff;
    const b =  argb         & 0xff;
    this.hsvA = (argb >>> 24) & 0xff;
    [this.hsvH, this.hsvS, this.hsvV] = this.rgbToHsv(r, g, b);
  }

  private redrawColorPicker(): void {
    if (this.specEl)  this.drawSpectrum(this.specEl);
    if (this.hueEl)   this.drawHueStrip(this.hueEl);
    if (this.alphaEl) this.drawAlphaStrip(this.alphaEl);
  }

  private drawSpectrum(c: HTMLCanvasElement): void {
    const ctx = c.getContext('2d')!;
    const w = c.width, h = c.height;
    const [hr, hg, hb] = this.hsvToRgb(this.hsvH, 1, 1);
    ctx.fillStyle = `rgb(${hr},${hg},${hb})`;
    ctx.fillRect(0, 0, w, h);
    const wg = ctx.createLinearGradient(0, 0, w, 0);
    wg.addColorStop(0, 'rgba(255,255,255,1)');
    wg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, w, h);
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(0,0,0,0)');
    bg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // crosshair
    const cx = this.hsvS * w, cy = (1 - this.hsvV) * h;
    ctx.strokeStyle = (this.hsvV > 0.55 && this.hsvS < 0.75) ? '#222' : '#eee';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(cx, cy, 5, 0, Math.PI * 2); ctx.stroke();
  }

  private drawHueStrip(c: HTMLCanvasElement): void {
    const ctx = c.getContext('2d')!;
    const w = c.width, h = c.height;
    const g = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= 6; i++) g.addColorStop(i / 6, `hsl(${i * 60},100%,50%)`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const cx = Phaser.Math.Clamp((this.hsvH / 360) * w, 4, w - 4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - 4, 1, 8, h - 2);
  }

  private drawAlphaStrip(c: HTMLCanvasElement): void {
    const ctx = c.getContext('2d')!;
    const w = c.width, h = c.height;
    // checkerboard
    const cs = 6;
    for (let x = 0; x < w; x += cs)
      for (let y = 0; y < h; y += cs) {
        ctx.fillStyle = ((x / cs + y / cs) % 2 === 0) ? '#bbb' : '#888';
        ctx.fillRect(x, y, cs, cs);
      }
    const [r, g, b] = this.hsvToRgb(this.hsvH, this.hsvS, this.hsvV);
    const ag = ctx.createLinearGradient(0, 0, w, 0);
    ag.addColorStop(0, `rgba(${r},${g},${b},0)`);
    ag.addColorStop(1, `rgba(${r},${g},${b},1)`);
    ctx.fillStyle = ag; ctx.fillRect(0, 0, w, h);
    const cx = Phaser.Math.Clamp((this.hsvA / 255) * w, 4, w - 4);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.strokeRect(cx - 4, 1, 8, h - 2);
  }

  private hsvToRgb(h: number, s: number, v: number): [number, number, number] {
    const i = Math.floor(h / 60) % 6;
    const f = (h / 60) - Math.floor(h / 60);
    const p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
    const c = [[v,t,p],[q,v,p],[p,v,t],[p,q,v],[t,p,v],[v,p,q]][i] ?? [0,0,0];
    return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)];
  }

  private rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d > 0) {
      if      (max === r) h = ((g - b) / d + 6) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else                h = (r - g) / d + 4;
      h = (h / 6) * 360;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  // ─── Recent colors ────────────────────────────────────────────────────────

  private buildRecentColors(): void {
    this.scene.add.text(this.cfg.x, this.cfg.recentY, 'RECENT', {
      fontSize: '14px', color: '#556677', fontFamily: 'monospace',
    });
    for (let i = 0; i < ColorPanel.MAX_RECENT; i++) {
      this.recentGfxList.push(this.scene.add.graphics());
    }
    this.redrawRecentColors();
  }

  private addToRecent(color: number): void {
    const idx = this.recentColors.indexOf(color);
    if (idx >= 0) this.recentColors.splice(idx, 1);
    this.recentColors.unshift(color);
    if (this.recentColors.length > ColorPanel.MAX_RECENT) {
      this.recentColors.length = ColorPanel.MAX_RECENT;
    }
    this.redrawRecentColors();
  }

  private redrawRecentColors(): void {
    const SY = this.cfg.recentY + 16;
    for (let i = 0; i < ColorPanel.MAX_RECENT; i++) {
      const g = this.recentGfxList[i];
      if (!g) continue;
      g.clear();
      g.removeAllListeners();
      g.removeInteractive();
      const sx = this.cfg.x + i * (SWATCH + 2);
      const argb = this.recentColors[i];
      if (argb === undefined) {
        g.lineStyle(1, 0x252535, 1);
        g.strokeRect(sx, SY, SWATCH, SWATCH);
      } else {
        const a = ((argb >>> 24) & 0xff) / 255;
        if (a < 0.01) {
          g.fillStyle(0xbbbbbb, 1); g.fillRect(sx, SY, SWATCH / 2, SWATCH / 2);
          g.fillStyle(0xbbbbbb, 1); g.fillRect(sx + SWATCH / 2, SY + SWATCH / 2, SWATCH / 2, SWATCH / 2);
          g.fillStyle(0x777777, 1); g.fillRect(sx + SWATCH / 2, SY, SWATCH / 2, SWATCH / 2);
          g.fillStyle(0x777777, 1); g.fillRect(sx, SY + SWATCH / 2, SWATCH / 2, SWATCH / 2);
        } else {
          g.fillStyle(argb & 0x00ffffff, a);
          g.fillRect(sx, SY, SWATCH, SWATCH);
        }
        g.lineStyle(1, 0x334455, 1);
        g.strokeRect(sx, SY, SWATCH, SWATCH);
        g.setInteractive(new Phaser.Geom.Rectangle(sx, SY, SWATCH, SWATCH), Phaser.Geom.Rectangle.Contains);
        g.on('pointerdown', () => {
          this.color = argb;
          if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(argb);
          this.syncHsvFromColor(argb);
          this.redrawColorPicker();
          const matchIdx = PALETTE.indexOf(argb);
          if (matchIdx >= 0) this.updateSwatchHighlight(matchIdx);
          else { this.swatchHighlight?.destroy(); this.swatchHighlight = undefined; }
          const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
          this.cfg.onStatus?.(`color: #${hex}  α:${Math.round(a * 100)}%`);
        });
      }
    }
  }
}
