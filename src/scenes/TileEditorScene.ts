import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';

const TILE = 64;
const DRAW_SCALE = 11;  // 64 × 11 = 704 px draw area
const PREV_SCALE = 2;   // 3×3 wrap preview at 2× = 384 px

// Horizontal layout (1280 wide)
// picker(150) + draw(704) + gap(14) + preview(384) + margin(28) = 1280
const PICKER_X    = 8;
const PICKER_Y    = 70;
const PICKER_COLS = 2;
const PICKER_CELL = 64;
const PICKER_VIS  = 10;  // 10 rows × 64px = 640px, fits within draw height

const DRAW_X    = PICKER_X + PICKER_COLS * PICKER_CELL + 14;  // 150
const DRAW_Y    = 50;
const DRAW_SIZE = TILE * DRAW_SCALE;   // 704

const PREV_X    = DRAW_X + DRAW_SIZE + 14;   // 868
const PREV_Y    = DRAW_Y;
const PREV_TILE = TILE * PREV_SCALE;          // 128
const PREV_SIZE = PREV_TILE * 3;              // 384

const PALETTE_X   = PREV_X;
const PALETTE_Y   = PREV_Y + PREV_SIZE + 24;  // 458
const SWATCH_Y    = PALETTE_Y + 36;           // 494
const SWATCH      = 28;
const SWATCH_COLS = 6;
const ACTIONS_R_Y = SWATCH_Y + 4 * (SWATCH + 4) + 14;  // 638

const TOOLS_Y   = DRAW_Y + DRAW_SIZE + 52;   // 806

// ACTIONS_R_Y(638) + 38(gap) + 18(spec label+pad) + 150(spec) + 7 + 16(hue) + 7 + 16(alpha) + 10
const RECENT_Y  = ACTIONS_R_Y + 38 + 18 + 150 + 7 + 16 + 7 + 16 + 10;  // 900

type Tool = 'pencil' | 'eraser' | 'eyedropper' | 'fill' | 'blur';

interface BtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  tool: Tool;
}

interface SizeBtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  size: number;
}

const PALETTE: number[] = [
  0x00000000, 0xff000000, 0xff1a1a2e, 0xff16213e, 0xff0f3460, 0xff533483,
  0xffe94560, 0xffff6b6b, 0xffff9f43, 0xffffd700, 0xff2ecc71, 0xff1abc9c,
  0xff3498db, 0xff9b59b6, 0xffffffff, 0xffcccccc, 0xff888888, 0xff444444,
  0xff8b6914, 0xff5c4033, 0xff2d6a4f, 0xff40916c, 0xffb7e4c7, 0xff4a4e69,
];

export class TileEditorScene extends Phaser.Scene {
  private pixels!: Uint32Array;
  private selectedFrame = 0;
  private pickerScroll = 0;

  private drawGfx!: Phaser.GameObjects.Graphics;
  private previewGfx!: Phaser.GameObjects.Graphics;
  private pickerGfx!: Phaser.GameObjects.Graphics;

  private currentColor = 0xff000000;
  private tool: Tool = 'pencil';
  private wrapMode = true;
  private isDrawing = false;

  private toolBtns: BtnEntry[] = [];
  private sizeBtns: SizeBtnEntry[] = [];
  private penSize = 1;
  private swatchHighlight?: Phaser.GameObjects.Graphics;
  private pickerSprites: Phaser.GameObjects.Image[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private frameLabel!: Phaser.GameObjects.Text;
  private wrapBtn!: { gfx: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number };
  private hexInputEl?: HTMLInputElement;
  private htmlEls: HTMLElement[] = [];

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

  private history: Uint32Array[] = [];
  private historyIndex = -1;
  private static readonly MAX_HISTORY = 50;

  constructor() {
    super(SCENES.TILE_EDITOR);
  }

  create(): void {
    this.pixels = new Uint32Array(TILE * TILE);

    this.add.rectangle(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT, 0x12121f).setOrigin(0, 0);
    this.add.text(GAME_CONFIG.WIDTH / 2, 16, 'TILE EDITOR', {
      fontSize: '28px', color: '#aaccff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add.text(GAME_CONFIG.WIDTH - 12, 16, 'ESC — back', {
      fontSize: '18px', color: '#446688', fontFamily: 'monospace',
    }).setOrigin(1, 0);

    this.drawGfx    = this.add.graphics();
    this.previewGfx = this.add.graphics();
    this.pickerGfx  = this.add.graphics();

    this.add.text(PREV_X, PREV_Y - 20, 'WRAP PREVIEW', {
      fontSize: '16px', color: '#446655', fontFamily: 'monospace',
    });
    this.add.text(DRAW_X, DRAW_Y - 20, 'DRAW', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    this.buildPickerUI();
    this.buildPaletteUI();
    this.buildColorPicker();
    this.buildRecentColors();
    this.buildToolButtons();

    this.statusText = this.add.text(DRAW_X, DRAW_Y + DRAW_SIZE + 8, '', {
      fontSize: '16px', color: '#667799', fontFamily: 'monospace',
    });

    this.loadTileIntoPixels(0);
    this.redrawAll();
    this.setupInput();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.hexInputEl?.remove();
      this.hexInputEl = undefined;
      this.htmlEls.forEach(el => el.remove());
      this.htmlEls = [];
    });

    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENES.MENU));
    this.input.keyboard!.on('keydown-Z', (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.shiftKey ? this.redo() : this.undo();
    });
  }

  // ─── Pixel helpers ─────────────────────────────────────────────────────────

  private px(x: number, y: number): number {
    return this.pixels[y * TILE + x] ?? 0;
  }

  private setPx(x: number, y: number, argb: number): void {
    if (x < 0 || x >= TILE || y < 0 || y >= TILE) return;
    this.pixels[y * TILE + x] = argb;
  }

  // ─── Redraw ────────────────────────────────────────────────────────────────

  private redrawAll(): void {
    this.redrawCanvas();
    this.redrawPreview();
    this.redrawPicker();
  }

  private redrawCanvas(): void {
    const g = this.drawGfx;
    g.clear();

    for (let ty = 0; ty < TILE; ty++) {
      for (let tx = 0; tx < TILE; tx++) {
        const even = (tx + ty) % 2 === 0;
        g.fillStyle(even ? 0x2e2e3e : 0x383848, 1);
        g.fillRect(DRAW_X + tx * DRAW_SCALE, DRAW_Y + ty * DRAW_SCALE, DRAW_SCALE, DRAW_SCALE);
      }
    }

    for (let ty = 0; ty < TILE; ty++) {
      for (let tx = 0; tx < TILE; tx++) {
        const argb = this.px(tx, ty);
        const a = (argb >>> 24) & 0xff;
        if (a === 0) continue;
        g.fillStyle(argb & 0x00ffffff, a / 255);
        g.fillRect(DRAW_X + tx * DRAW_SCALE, DRAW_Y + ty * DRAW_SCALE, DRAW_SCALE, DRAW_SCALE);
      }
    }

    // 8-pixel grid lines
    g.lineStyle(1, 0x555577, 0.35);
    for (let i = 0; i <= TILE; i += 8) {
      g.lineBetween(DRAW_X + i * DRAW_SCALE, DRAW_Y, DRAW_X + i * DRAW_SCALE, DRAW_Y + DRAW_SIZE);
      g.lineBetween(DRAW_X, DRAW_Y + i * DRAW_SCALE, DRAW_X + DRAW_SIZE, DRAW_Y + i * DRAW_SCALE);
    }
    g.lineStyle(1, 0x4488cc, 1);
    g.strokeRect(DRAW_X, DRAW_Y, DRAW_SIZE, DRAW_SIZE);
  }

  private redrawPreview(): void {
    const g = this.previewGfx;
    g.clear();

    for (let gy = 0; gy < 3; gy++) {
      for (let gx = 0; gx < 3; gx++) {
        const ox = PREV_X + gx * PREV_TILE;
        const oy = PREV_Y + gy * PREV_TILE;

        // checkerboard background
        for (let ty = 0; ty < TILE; ty++) {
          for (let tx = 0; tx < TILE; tx++) {
            g.fillStyle((tx + ty) % 2 === 0 ? 0x252535 : 0x2d2d3d, 1);
            g.fillRect(ox + tx * PREV_SCALE, oy + ty * PREV_SCALE, PREV_SCALE, PREV_SCALE);
          }
        }

        // pixels
        for (let ty = 0; ty < TILE; ty++) {
          for (let tx = 0; tx < TILE; tx++) {
            const argb = this.px(tx, ty);
            const a = (argb >>> 24) & 0xff;
            if (a === 0) continue;
            g.fillStyle(argb & 0x00ffffff, a / 255);
            g.fillRect(ox + tx * PREV_SCALE, oy + ty * PREV_SCALE, PREV_SCALE, PREV_SCALE);
          }
        }
      }
    }

    // outer border
    g.lineStyle(1, 0x446644, 1);
    g.strokeRect(PREV_X, PREV_Y, PREV_SIZE, PREV_SIZE);
    // center tile highlight
    g.lineStyle(1, 0x88aaff, 0.7);
    g.strokeRect(PREV_X + PREV_TILE, PREV_Y + PREV_TILE, PREV_TILE, PREV_TILE);
  }

  private redrawPicker(): void {
    const g = this.pickerGfx;
    g.clear();
    g.lineStyle(1, 0x334455, 1);

    const totalFrames = this.getTotalFrames();

    for (let i = 0; i < PICKER_VIS * PICKER_COLS; i++) {
      const frame = this.pickerScroll * PICKER_COLS + i;
      if (frame >= totalFrames) break;
      const col = i % PICKER_COLS;
      const row = Math.floor(i / PICKER_COLS);
      const px = PICKER_X + col * PICKER_CELL;
      const py = PICKER_Y + row * PICKER_CELL;
      if (frame === this.selectedFrame) {
        g.fillStyle(0x1a3366, 1);
        g.fillRect(px, py, PICKER_CELL - 2, PICKER_CELL - 2);
        g.lineStyle(2, 0x4499ff, 1);
        g.strokeRect(px, py, PICKER_CELL - 2, PICKER_CELL - 2);
        g.lineStyle(1, 0x334455, 1);
      } else {
        g.fillStyle(0x1a1a2e, 0.6);
        g.fillRect(px, py, PICKER_CELL - 2, PICKER_CELL - 2);
        g.strokeRect(px, py, PICKER_CELL - 2, PICKER_CELL - 2);
      }
    }
  }

  // ─── Picker UI ─────────────────────────────────────────────────────────────

  private getTotalFrames(): number {
    const tex = this.textures.exists('tileset-sprites') ? this.textures.get('tileset-sprites') : null;
    if (!tex) return 128;
    return Math.max(0, tex.frameTotal - 1); // minus __BASE
  }

  private buildPickerUI(): void {
    this.add.text(PICKER_X, PICKER_Y - 20, 'TILES', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    this.frameLabel = this.add.text(PICKER_X, PICKER_Y + PICKER_VIS * PICKER_CELL + 6, 'frame: 0', {
      fontSize: '16px', color: '#4488aa', fontFamily: 'monospace',
    });

    const arrowStyle = { fontSize: '20px', color: '#aaccff', fontFamily: 'monospace' };
    const upArrow   = this.add.text(PICKER_X + PICKER_COLS * PICKER_CELL - 18, PICKER_Y - 20, '▲', arrowStyle).setInteractive();
    const downArrow = this.add.text(PICKER_X + PICKER_COLS * PICKER_CELL - 18, PICKER_Y + PICKER_VIS * PICKER_CELL + 4, '▼', arrowStyle).setInteractive();

    upArrow.on('pointerdown', () => {
      if (this.pickerScroll > 0) { this.pickerScroll--; this.refreshPickerSprites(); }
    });
    downArrow.on('pointerdown', () => {
      const maxScroll = Math.ceil(this.getTotalFrames() / PICKER_COLS) - PICKER_VIS;
      if (this.pickerScroll < maxScroll) { this.pickerScroll++; this.refreshPickerSprites(); }
    });

    this.input.on('wheel', (_p: unknown, _go: unknown, _dx: number, dy: number) => {
      if (dy > 0 && this.pickerScroll < Math.ceil(this.getTotalFrames() / PICKER_COLS) - PICKER_VIS) {
        this.pickerScroll++;
        this.refreshPickerSprites();
      } else if (dy < 0 && this.pickerScroll > 0) {
        this.pickerScroll--;
        this.refreshPickerSprites();
      }
    });

    this.refreshPickerSprites();
  }

  private refreshPickerSprites(): void {
    this.pickerSprites.forEach(s => s.destroy());
    this.pickerSprites = [];

    const SCALE = (PICKER_CELL - 4) / TILE;
    const total = this.getTotalFrames();

    for (let i = 0; i < PICKER_VIS * PICKER_COLS; i++) {
      const frame = this.pickerScroll * PICKER_COLS + i;
      if (frame >= total) break;
      const col = i % PICKER_COLS;
      const row = Math.floor(i / PICKER_COLS);
      const px = PICKER_X + col * PICKER_CELL + 2;
      const py = PICKER_Y + row * PICKER_CELL + 2;

      const sprite = this.add.image(px, py, 'tileset-sprites', frame)
        .setOrigin(0, 0)
        .setScale(SCALE);
      sprite.setInteractive(new Phaser.Geom.Rectangle(0, 0, TILE, TILE), Phaser.Geom.Rectangle.Contains);
      sprite.on('pointerdown', () => this.selectFrame(frame));
      this.pickerSprites.push(sprite);
    }

    this.redrawPicker();
  }

  private selectFrame(frame: number): void {
    this.selectedFrame = frame;
    this.loadTileIntoPixels(frame);
    this.history = [];
    this.historyIndex = -1;
    this.frameLabel?.setText(`frame: ${frame}`);
    this.statusText?.setText(`loaded tile #${frame}`);
    this.redrawAll();
  }

  // ─── Load tile pixels ──────────────────────────────────────────────────────

  private loadTileIntoPixels(frame: number): void {
    if (!this.textures.exists('tileset-sprites')) { this.pixels.fill(0); return; }
    const tex = this.textures.get('tileset-sprites');
    const frameObj = tex.get(frame);
    if (!frameObj || frameObj.name === '__BASE') { this.pixels.fill(0); return; }

    const source = frameObj.source.image as HTMLImageElement | HTMLCanvasElement;
    const tmp = document.createElement('canvas');
    tmp.width  = TILE;
    tmp.height = TILE;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(source, frameObj.cutX, frameObj.cutY, TILE, TILE, 0, 0, TILE, TILE);
    const data = ctx.getImageData(0, 0, TILE, TILE).data;
    for (let i = 0; i < TILE * TILE; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
      this.pixels[i] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
  }

  // ─── Palette UI ────────────────────────────────────────────────────────────

  private buildPaletteUI(): void {
    this.add.text(PALETTE_X, PALETTE_Y - 22, 'COLOR', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    // ── hex input row ──────────────────────────────────────────────────
    this.add.text(PALETTE_X, PALETTE_Y, '#', {
      fontSize: '18px', color: '#889aaa', fontFamily: 'monospace',
    });

    // Draw a frame for the input so it visually fits the scene
    const inputFrameGfx = this.add.graphics();
    const inputFX = PALETTE_X + 14;
    const inputFY = PALETTE_Y - 2;
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
      const sx = PALETTE_X + col * (SWATCH + 2);
      const sy = SWATCH_Y + row * (SWATCH + 4);

      const g = this.add.graphics();
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
        this.currentColor = argb;
        this.updateSwatchHighlight(i);
        if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(argb);
        this.syncHsvFromColor(argb);
        this.redrawColorPicker();
        this.addToRecent(argb);
        const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
        this.statusText?.setText(`color: #${hex}  α:${Math.round(a * 100)}%`);
      });
    });

    // default black selected
    this.updateSwatchHighlight(1);
    if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(0xff000000);

    // ── clear / save in the right panel ───────────────────────────────
    const BW = 88, BH = 30;
    this.makeBtn('CLEAR', PALETTE_X, ACTIONS_R_Y, BW, BH, 0x6e1c1c, () => {
      this.pushHistory();
      this.pixels.fill(0);
      this.redrawAll();
      this.statusText.setText('canvas cleared');
    });
    this.makeBtn('SAVE', PALETTE_X + BW + 14, ACTIONS_R_Y, BW, BH, 0x1c3c6e, () => this.saveTile());
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

    document.body.appendChild(el);
    this.positionHtmlEl(el, lx, ly, lw, lh);

    el.addEventListener('input', () => {
      el.value = el.value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
      const v = el.value;
      if (v.length === 6 || v.length === 8) this.applyHexColor(v);
    });
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { el.blur(); e.preventDefault(); }
      e.stopPropagation(); // keep Phaser from swallowing alphanumeric keys
    });

    return el;
  }

  private positionHtmlEl(el: HTMLElement, lx: number, ly: number, lw: number, lh: number): void {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width  / (this.game.config.width  as number);
    const sy = rect.height / (this.game.config.height as number);
    el.style.left   = `${rect.left + lx * sx}px`;
    el.style.top    = `${rect.top  + ly * sy}px`;
    el.style.width  = `${lw * sx}px`;
    el.style.height = `${lh * sy}px`;
    el.style.fontSize = `${13 * sx}px`;
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
    this.currentColor = (((a << 24) | (r << 16) | (g << 8) | b) >>> 0);
    this.syncHsvFromColor(this.currentColor);
    this.redrawColorPicker();
    this.addToRecent(this.currentColor);
    const matchIdx = PALETTE.indexOf(this.currentColor);
    if (matchIdx >= 0) {
      this.updateSwatchHighlight(matchIdx);
    } else {
      this.swatchHighlight?.destroy();
      this.swatchHighlight = undefined;
    }
    const hex6 = (this.currentColor & 0x00ffffff).toString(16).padStart(6, '0');
    this.statusText?.setText(`color: #${hex6}  α:${Math.round(a / 255 * 100)}%`);
  }

  private updateSwatchHighlight(index: number): void {
    this.swatchHighlight?.destroy();
    const col = index % SWATCH_COLS;
    const row = Math.floor(index / SWATCH_COLS);
    const sx = PALETTE_X + col * (SWATCH + 2) - 1;
    const sy = SWATCH_Y + row * (SWATCH + 4) - 1;
    const g = this.add.graphics();
    g.lineStyle(2, 0xffffff, 1);
    g.strokeRect(sx, sy, SWATCH + 2, SWATCH + 2);
    g.setDepth(10);
    this.swatchHighlight = g;
  }

  // ─── Tool buttons ──────────────────────────────────────────────────────────

  private buildToolButtons(): void {
    const BW = 64, BH = 28;
    this.add.text(DRAW_X, TOOLS_Y - 20, 'TOOL', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    const tools: { tool: Tool; label: string }[] = [
      { tool: 'pencil',     label: 'PEN' },
      { tool: 'eraser',     label: 'ERA' },
      { tool: 'eyedropper', label: 'EYE' },
      { tool: 'fill',       label: 'FILL' },
      { tool: 'blur',       label: 'BLUR' },
    ];

    tools.forEach(({ tool, label }, i) => {
      const bx = DRAW_X + i * (BW + 8);
      const g = this.add.graphics();
      this.drawBtn(g, bx, TOOLS_Y, BW, BH, tool === this.tool);
      this.add.text(bx + BW / 2, TOOLS_Y + BH / 2, label, {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, TOOLS_Y, BW, BH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => {
        this.tool = tool;
        this.toolBtns.forEach(b => this.drawBtn(b.gfx, b.x, b.y, b.w, b.h, b.tool === this.tool));
      });
      this.toolBtns.push({ gfx: g, x: bx, y: TOOLS_Y, w: BW, h: BH, tool });
    });

    // Wrap toggle
    const wx = DRAW_X + tools.length * (BW + 8) + 16;
    const wg = this.add.graphics();
    this.drawBtn(wg, wx, TOOLS_Y, BW, BH, this.wrapMode);
    this.add.text(wx + BW / 2, TOOLS_Y + BH / 2, 'WRAP', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    wg.setInteractive(new Phaser.Geom.Rectangle(wx, TOOLS_Y, BW, BH), Phaser.Geom.Rectangle.Contains);
    wg.on('pointerdown', () => {
      this.wrapMode = !this.wrapMode;
      this.drawBtn(wg, wx, TOOLS_Y, BW, BH, this.wrapMode);
    });
    this.wrapBtn = { gfx: wg, x: wx, y: TOOLS_Y, w: BW, h: BH };

    // Pen size buttons — only relevant for pencil/eraser
    const SBW = 36, SBH = 28, SGAP = 6;
    const sizeStartX = wx + BW + 28;
    this.add.text(sizeStartX, TOOLS_Y - 20, 'SIZE', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });
    [1, 2, 3, 4].forEach((size, i) => {
      const bx = sizeStartX + i * (SBW + SGAP);
      const g = this.add.graphics();
      this.drawBtn(g, bx, TOOLS_Y, SBW, SBH, size === this.penSize);
      this.add.text(bx + SBW / 2, TOOLS_Y + SBH / 2, String(size), {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, TOOLS_Y, SBW, SBH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => {
        this.penSize = size;
        this.sizeBtns.forEach(b => this.drawBtn(b.gfx, b.x, b.y, b.w, b.h, b.size === this.penSize));
      });
      this.sizeBtns.push({ gfx: g, x: bx, y: TOOLS_Y, w: SBW, h: SBH, size });
    });
  }

  private drawBtn(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, active: boolean): void {
    g.clear();
    g.fillStyle(active ? 0x1e3a5e : 0x181828, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, active ? 0x4499ff : 0x334455, 1);
    g.strokeRect(x, y, w, h);
  }

  private makeBtn(label: string, x: number, y: number, w: number, h: number, col: number, cb: () => void): void {
    const g = this.add.graphics();
    g.fillStyle(col, 0.85);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, col, 1);
    g.strokeRect(x, y, w, h);
    this.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    g.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    g.on('pointerdown', cb);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.inDrawArea(p.x, p.y)) return;
      if (p.middleButtonDown()) { this.quickEyedrop(p.x, p.y); return; }
      if (p.rightButtonDown())  { this.pushHistory(); this.isDrawing = true; this.quickErase(p.x, p.y); return; }
      this.pushHistory();
      this.isDrawing = true;
      this.applyTool(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDrawing || !p.isDown) return;
      if (p.rightButtonDown()) { this.quickErase(p.x, p.y); return; }
      this.applyTool(p.x, p.y);
    });
    this.input.on('pointerup', () => { this.isDrawing = false; });
  }

  private quickErase(sx: number, sy: number): void {
    const tx = Math.floor((sx - DRAW_X) / DRAW_SCALE);
    const ty = Math.floor((sy - DRAW_Y) / DRAW_SCALE);
    this.paintBrush(tx, ty, 0);
    this.redrawAll();
  }

  private quickEyedrop(sx: number, sy: number): void {
    const tx = Math.floor((sx - DRAW_X) / DRAW_SCALE);
    const ty = Math.floor((sy - DRAW_Y) / DRAW_SCALE);
    this.currentColor = this.px(tx, ty);
    if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(this.currentColor);
    this.syncHsvFromColor(this.currentColor);
    this.redrawColorPicker();
    this.addToRecent(this.currentColor);
    const matchIdx = PALETTE.indexOf(this.currentColor);
    if (matchIdx >= 0) this.updateSwatchHighlight(matchIdx);
    else { this.swatchHighlight?.destroy(); this.swatchHighlight = undefined; }
    const hex = (this.currentColor & 0x00ffffff).toString(16).padStart(6, '0');
    const a   = Math.round(((this.currentColor >>> 24) & 0xff) / 255 * 100);
    this.statusText?.setText(`picked: #${hex}  α:${a}%`);
  }

  private inDrawArea(sx: number, sy: number): boolean {
    return sx >= DRAW_X && sx < DRAW_X + DRAW_SIZE && sy >= DRAW_Y && sy < DRAW_Y + DRAW_SIZE;
  }

  private applyTool(sx: number, sy: number): void {
    let tx = Math.floor((sx - DRAW_X) / DRAW_SCALE);
    let ty = Math.floor((sy - DRAW_Y) / DRAW_SCALE);

    // always clamp/wrap into valid range
    tx = ((tx % TILE) + TILE) % TILE;
    ty = ((ty % TILE) + TILE) % TILE;

    if (this.tool === 'pencil') {
      this.paintBrush(tx, ty, this.currentColor);
    } else if (this.tool === 'eraser') {
      this.paintBrush(tx, ty, 0);
    } else if (this.tool === 'blur') {
      this.applyBlur(tx, ty);
    } else if (this.tool === 'fill') {
      this.floodFill(tx, ty);
      this.isDrawing = false; // fill is one-shot, no drag-fill
    } else if (this.tool === 'eyedropper') {
      this.currentColor = this.px(tx, ty);
      if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(this.currentColor);
      this.syncHsvFromColor(this.currentColor);
      this.redrawColorPicker();
      this.addToRecent(this.currentColor);
      const matchIdx = PALETTE.indexOf(this.currentColor);
      if (matchIdx >= 0) {
        this.updateSwatchHighlight(matchIdx);
      } else {
        this.swatchHighlight?.destroy();
        this.swatchHighlight = undefined;
      }
      const hex = (this.currentColor & 0x00ffffff).toString(16).padStart(6, '0');
      const a   = Math.round(((this.currentColor >>> 24) & 0xff) / 255 * 100);
      this.statusText?.setText(`picked: #${hex}  α:${a}%`);
      // switch back to pencil so next click draws
      this.tool = 'pencil';
      this.toolBtns.forEach(b => this.drawBtn(b.gfx, b.x, b.y, b.w, b.h, b.tool === this.tool));
      return; // no pixel change, no need to redraw canvas
    }

    this.redrawAll();
  }

  // ─── Brush / fill ─────────────────────────────────────────────────────────

  private paintBrush(cx: number, cy: number, color: number): void {
    const off = Math.floor(this.penSize / 2);
    for (let dy = 0; dy < this.penSize; dy++) {
      for (let dx = 0; dx < this.penSize; dx++) {
        const px = ((cx - off + dx) % TILE + TILE) % TILE;
        const py = ((cy - off + dy) % TILE + TILE) % TILE;
        this.setPx(px, py, color);
      }
    }
  }

  private floodFill(startX: number, startY: number): void {
    const target = this.px(startX, startY);
    if (target === this.currentColor) return;
    const stack: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(TILE * TILE);
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = y * TILE + x;
      if (visited[key]) continue;
      visited[key] = 1;
      if (this.px(x, y) !== target) continue;
      this.setPx(x, y, this.currentColor);
      if (x > 0)        stack.push([x - 1, y]);
      if (x < TILE - 1) stack.push([x + 1, y]);
      if (y > 0)        stack.push([x, y - 1]);
      if (y < TILE - 1) stack.push([x, y + 1]);
    }
  }

  private applyBlur(cx: number, cy: number): void {
    const off = Math.floor(this.penSize / 2);
    const positions: [number, number][] = [];
    for (let dy = 0; dy < this.penSize; dy++) {
      for (let dx = 0; dx < this.penSize; dx++) {
        const px = ((cx - off + dx) % TILE + TILE) % TILE;
        const py = ((cy - off + dy) % TILE + TILE) % TILE;
        positions.push([px, py]);
      }
    }

    // Collect averaged values before writing (avoid reading back blurred pixels mid-pass)
    const blurred: number[] = positions.map(([px, py]) => {
      let ra = 0, ga = 0, ba = 0, aa = 0, count = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          let sx = px + kx, sy = py + ky;
          if (this.wrapMode) {
            sx = ((sx % TILE) + TILE) % TILE;
            sy = ((sy % TILE) + TILE) % TILE;
          } else {
            if (sx < 0 || sx >= TILE || sy < 0 || sy >= TILE) continue;
          }
          const argb = this.px(sx, sy);
          aa += (argb >>> 24) & 0xff;
          ra += (argb >>> 16) & 0xff;
          ga += (argb >>>  8) & 0xff;
          ba +=  argb         & 0xff;
          count++;
        }
      }
      if (count === 0) return this.px(px, py);
      return (((Math.round(aa / count) << 24) | (Math.round(ra / count) << 16) |
               (Math.round(ga / count) << 8)  |  Math.round(ba / count)) >>> 0);
    });

    for (let i = 0; i < positions.length; i++) {
      const [px, py] = positions[i];
      this.setPx(px, py, blurred[i]!);
    }
  }

  // ─── HSV Color picker ─────────────────────────────────────────────────────

  private buildColorPicker(): void {
    const PX = PALETTE_X;
    const PW = PREV_SIZE;   // 384 — match preview width
    const PY = ACTIONS_R_Y + 38;
    const SPEC_H  = 150;
    const STRIP_H = 16;
    const GAP     = 7;

    this.add.text(PX, PY - 4, 'CUSTOM COLOR', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    this.specEl  = this.makePickerCanvas(PX, PY + 18,                              PW, SPEC_H);
    this.hueEl   = this.makePickerCanvas(PX, PY + 18 + SPEC_H + GAP,              PW, STRIP_H);
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
    const onHsvRelease = (): void => { this.addToRecent(this.currentColor); };
    for (const el of [this.specEl, this.hueEl, this.alphaEl]) {
      el.addEventListener('mouseup', onHsvRelease);
      el.addEventListener('touchend', onHsvRelease);
    }

    this.syncHsvFromColor(this.currentColor);
    this.redrawColorPicker();
  }

  private makePickerCanvas(lx: number, ly: number, lw: number, lh: number): HTMLCanvasElement {
    const el = document.createElement('canvas');
    el.width  = lw;
    el.height = lh;
    el.style.position = 'fixed';
    el.style.zIndex   = '999';
    el.style.cursor   = 'crosshair';
    document.body.appendChild(el);
    this.positionHtmlEl(el, lx, ly, lw, lh);
    this.htmlEls.push(el);
    return el;
  }

  private touchToMouse(e: TouchEvent): MouseEvent {
    const t = e.touches[0] ?? e.changedTouches[0];
    return { clientX: t.clientX, clientY: t.clientY, buttons: 1 } as MouseEvent;
  }

  private commitHsv(): void {
    const [r, g, b] = this.hsvToRgb(this.hsvH, this.hsvS, this.hsvV);
    this.currentColor = ((this.hsvA << 24) | (r << 16) | (g << 8) | b) >>> 0;
    if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(this.currentColor);
    const matchIdx = PALETTE.indexOf(this.currentColor);
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
    const cx = (this.hsvH / 360) * w;
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
    const cx = (this.hsvA / 255) * w;
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
    this.add.text(PALETTE_X, RECENT_Y, 'RECENT', {
      fontSize: '14px', color: '#556677', fontFamily: 'monospace',
    });
    for (let i = 0; i < TileEditorScene.MAX_RECENT; i++) {
      this.recentGfxList.push(this.add.graphics());
    }
    this.redrawRecentColors();
  }

  private addToRecent(color: number): void {
    const idx = this.recentColors.indexOf(color);
    if (idx >= 0) this.recentColors.splice(idx, 1);
    this.recentColors.unshift(color);
    if (this.recentColors.length > TileEditorScene.MAX_RECENT) {
      this.recentColors.length = TileEditorScene.MAX_RECENT;
    }
    this.redrawRecentColors();
  }

  private redrawRecentColors(): void {
    const SY = RECENT_Y + 16;
    for (let i = 0; i < TileEditorScene.MAX_RECENT; i++) {
      const g = this.recentGfxList[i];
      if (!g) continue;
      g.clear();
      g.removeAllListeners();
      g.removeInteractive();
      const sx = PALETTE_X + i * (SWATCH + 2);
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
          this.currentColor = argb;
          if (this.hexInputEl) this.hexInputEl.value = this.colorToHex8(argb);
          this.syncHsvFromColor(argb);
          this.redrawColorPicker();
          const matchIdx = PALETTE.indexOf(argb);
          if (matchIdx >= 0) this.updateSwatchHighlight(matchIdx);
          else { this.swatchHighlight?.destroy(); this.swatchHighlight = undefined; }
          const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
          this.statusText?.setText(`color: #${hex}  α:${Math.round(a * 100)}%`);
        });
      }
    }
  }

  // ─── History ──────────────────────────────────────────────────────────────

  private pushHistory(): void {
    // discard any future states if we branched
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(this.pixels.slice());
    if (this.history.length > TileEditorScene.MAX_HISTORY) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  private undo(): void {
    if (this.historyIndex < 0) {
      this.statusText.setText('nothing to undo');
      return;
    }
    this.pixels.set(this.history[this.historyIndex]);
    this.historyIndex--;
    this.redrawAll();
    this.statusText.setText(`undo  (${this.historyIndex + 1}/${this.history.length})`);
  }

  private redo(): void {
    if (this.historyIndex >= this.history.length - 1) {
      this.statusText.setText('nothing to redo');
      return;
    }
    this.historyIndex++;
    this.pixels.set(this.history[this.historyIndex]);
    this.redrawAll();
    this.statusText.setText(`redo  (${this.historyIndex + 1}/${this.history.length})`);
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  private saveTile(): void {
    if (!import.meta.env.DEV) {
      this.statusText.setText('save only available in dev mode');
      return;
    }

    if (!this.textures.exists('tileset-sprites')) {
      this.statusText.setText('tileset not loaded');
      return;
    }

    const tex = this.textures.get('tileset-sprites');
    const frameObj = tex.get(0); // frame 0 to get source image
    const source = frameObj?.source?.image as HTMLImageElement | HTMLCanvasElement | undefined;
    if (!source) { this.statusText.setText('source image unavailable'); return; }

    // replicate full tileset PNG with updated tile
    const full = document.createElement('canvas');
    full.width  = (source as HTMLImageElement).naturalWidth  ?? (source as HTMLCanvasElement).width;
    full.height = (source as HTMLImageElement).naturalHeight ?? (source as HTMLCanvasElement).height;
    const fctx = full.getContext('2d')!;
    fctx.drawImage(source, 0, 0);

    // paint updated tile into its slot
    const selFrame = tex.get(this.selectedFrame);
    if (!selFrame) { this.statusText.setText('frame not found'); return; }
    const dx = selFrame.cutX;
    const dy = selFrame.cutY;

    const tileCanvas = document.createElement('canvas');
    tileCanvas.width = TILE; tileCanvas.height = TILE;
    const tc = tileCanvas.getContext('2d')!;
    const imgData = tc.createImageData(TILE, TILE);
    for (let i = 0; i < TILE * TILE; i++) {
      const argb = this.pixels[i];
      imgData.data[i * 4]     = (argb >>> 16) & 0xff;
      imgData.data[i * 4 + 1] = (argb >>>  8) & 0xff;
      imgData.data[i * 4 + 2] =  argb         & 0xff;
      imgData.data[i * 4 + 3] = (argb >>> 24) & 0xff;
    }
    tc.putImageData(imgData, 0, 0);
    fctx.clearRect(dx, dy, TILE, TILE);
    fctx.drawImage(tileCanvas, dx, dy);

    this.statusText.setText('saving…');

    full.toBlob(async (blob) => {
      if (!blob) { this.statusText.setText('blob conversion failed'); return; }
      try {
        const buf = await blob.arrayBuffer();
        const resp = await fetch(`/__editor/save-tile?frame=${this.selectedFrame}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: buf,
        });
        if (resp.ok) {
          this.statusText.setText(`saved tile #${this.selectedFrame} ✓  (reload page to see in-game)`);
        } else {
          this.statusText.setText(`save failed: ${resp.status}`);
        }
      } catch (e: unknown) {
        this.statusText.setText(`save error: ${(e as Error).message ?? e}`);
      }
    }, 'image/png');
  }
}
