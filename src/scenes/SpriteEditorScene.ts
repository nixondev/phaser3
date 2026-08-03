import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, PLAYER_CONFIG } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { HtmlOverlay } from '@/editor/htmlOverlay';
import { ColorPanel } from '@/editor/ColorPanel';
import { EditorButtons } from '@/editor/EditorButtons';
import { PixelCanvas, PixelCanvasView, PixelTool, PenStyle, RegionClip } from '@/editor/PixelCanvas';
import { collectReferencedSheets, getCharacter, allCharacters, applySheetAssignment } from '@systems/CharacterRegistry';
import { drawCharacterShadow, CHARACTER_SHADOW_FEET_OFFSET } from '@entities/Entity';
// Same module the dev server and the bake-depth CLI run — see shade.mjs.
import { shadeSheet, DEFAULTS as SHADE_DEFAULTS } from '../../scripts/lib/shade.mjs';

const FRAME     = 64;    // frame size in px
const SHEET_PX  = 256;   // sheet is 256×256
const SHEET_COLS = 4;
const SHEET_FRAMES = 16;

const WORK_KEY   = 'spriteedit-work';
const SRC_KEY    = 'spriteedit-src';
/** Live-shaded mirror of WORK_KEY. Preview only — never saved. */
const SHADED_KEY = 'spriteedit-shaded';

/**
 * Sliders under the SHADE button. `get`/`set` map between a flat slider value
 * and the shading options object, so light direction can be steered as an
 * angle + elevation rather than three raw vector components.
 */
interface ShadeSlider {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  hint: string;
}
const SHADE_SLIDERS: ShadeSlider[] = [
  { key: 'amount', label: 'AMOUNT', min: 0, max: 1,   step: 0.05, hint: 'how much shading, overall' },
  { key: 'light',  label: 'LIGHT',  min: 0, max: 360, step: 5,    hint: 'where the light comes from (°)' },
  { key: 'shape',  label: 'SHAPE',  min: 0, max: 1,   step: 0.05, hint: '0 = one body, 1 = each outlined part' },
  { key: 'soft',   label: 'SOFT',   min: 1, max: 20,  step: 1,    hint: 'tight rim ← → broad wash (px)' },
  { key: 'color',  label: 'COLOR',  min: 0, max: 0.7, step: 0.05, hint: 'cool shadows, warm highlights' },
  { key: 'tones',  label: 'TONES',  min: 0, max: 4,   step: 1,    hint: 'smooth gradient ← → few flat pixel tones' },
];

/**
 * TONES positions → band size fed to the shader (0 = smooth). Dithering across
 * band edges switches on automatically whenever bands are.
 */
const TONE_STEPS  = [0, 0.18, 0.25, 0.35, 0.5];
const TONE_LABELS = ['smooth', '~5', '~4', '~3', '~2'];

/** Default direction expressed as bearing + elevation, matching SHADE_DEFAULTS.dir. */
const DEFAULT_AZIMUTH   = 116.6;
const DEFAULT_ELEVATION = 0.805;

const DIRS = ['down', 'left', 'right', 'up'] as const;
type Dir = typeof DIRS[number];

// ── Layout (1280×960) ────────────────────────────────────────────────────────
// Left picker is kept compact so the draw canvas can run at scale 10 (640px)
// between it and the right-hand preview/colour column.
const LABEL_X = 8;                       // direction row labels
const GRID_X  = 50;                      // frame picker grid
const GRID_Y  = 100;
const CELL    = 56;                      // 52px thumb + 4px gap
const THUMB   = CELL - 4;                // scaled thumbnail size (native frame is 64px)

const DRAW_X = 288, DRAW_Y = 100;
const DRAW_SCALE = 10;                   // 64 × 10 = 640px draw area
const DRAW_SIZE  = FRAME * DRAW_SCALE;   // ends at x=928, clear of the panel at 940
const FOCUS_CANVAS_DEPTH = 1_000_000;
const FOCUS_BUTTON_DEPTH = 1_000_001;
const DEFAULT_UI_DEPTH = 3;

const PREV_X = 940, PREV_Y = 100;
const PREV_W = 330, PREV_H = 300;
const PREV_SPRITE_SCALE = 3;             // 64 → 192px character
const PREV_SPRITE_SCALE_ACTUAL = 1;      // matches in-game ENTITY_WORLD_SCALE (native 64px)
const AUTO_CYCLE_MS = 1200;
const PREV_CTRL_Y = PREV_Y + PREV_H + 12;            // 412

const PANEL_X   = 940;
const PALETTE_Y = 468;                   // hex row; swatches below
const HSV_Y     = 644;                   // spectrum + strips
const RECENT_Y  = 868;

const TOOLS_Y  = DRAW_Y + DRAW_SIZE + 32;   // 772 — TOOL + SIZE row
const STYLE_Y  = TOOLS_Y + 58;              // 830 — STYLE gets its own row
const UTILS_Y  = STYLE_Y + 54;              // 884 — COPY/PASTE/FLIP/… row
const STATUS_Y = UTILS_Y + 38;              // 922

// Non-dev fallback (no list-sprites endpoint): whatever character sheets the
// game itself loaded — the registry-referenced set.
const FALLBACK_SHEETS = [...collectReferencedSheets()];

interface ToolBtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  tool: PixelTool;
}

interface StyleBtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  style: PenStyle;
}

export class SpriteEditorScene extends Phaser.Scene {
  private canvas!: PixelCanvas;
  private panel!: ColorPanel;
  private overlay!: HtmlOverlay;

  private workTex!: Phaser.Textures.CanvasTexture;
  private currentSheet = '';
  private selectedFrame = 0;
  private dirty = false;
  private pendingSwitch?: string;
  private pendingSwitchAt = 0;
  private clipboard:
    | { kind: 'frame'; pixels: Uint32Array }
    | { kind: 'region'; clip: RegionClip }
    | null = null;
  private onionOn = false;

  private dropdownEl?: HTMLSelectElement;
  private thumbs: Phaser.GameObjects.Image[] = [];
  private pickerSel!: Phaser.GameObjects.Graphics;
  private frameLabel!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private toolBtns: ToolBtnEntry[] = [];
  private sizeBtns: { gfx: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number; size: number }[] = [];
  private styleBtns: StyleBtnEntry[] = [];
  private onionBtnGfx!: Phaser.GameObjects.Graphics;
  private mirrorBtnGfx!: Phaser.GameObjects.Graphics;
  private focusBtnGfx!: Phaser.GameObjects.Graphics;
  private focusBtnText!: Phaser.GameObjects.Text;
  private focusMode = false;
  private savedCanvasView?: PixelCanvasView;
  private savedCanvasDepth?: number;
  private btn!: EditorButtons;
  private dirtyMark!: Phaser.GameObjects.Text;
  private saveBtnTint?: (col?: number) => void;
  private pendingExitAt = 0;
  private assignContainer?: Phaser.GameObjects.Container;

  // ── shading panel ────────────────────────────────────────────────────────
  private shadeTex?: Phaser.Textures.CanvasTexture;
  private liveShading = false;
  private shadeValues: Record<string, number> = {
    amount: 0.3,
    light:  DEFAULT_AZIMUTH,
    shape:  0.2,
    soft:   SHADE_DEFAULTS.blur,
    color:  SHADE_DEFAULTS.hue,
    tones:  0,
    palette: 0,   // PAL toggle — 0/1 to share this record
  };
  private shadeSliderEls = new Map<string, HTMLInputElement>();
  private shadeValueLabels = new Map<string, Phaser.GameObjects.Text>();
  /**
   * Preset-supplied values the coupled slider mapping can't reach: DITHER/HUE
   * want a milder floor/ceiling than AMOUNT 0.5 derives. floor/ceiling are
   * cleared as soon as AMOUNT moves (the slider takes both ends back).
   *
   * `emboss` is a MODE, not a value: while set (BEVEL preset), shadeOptions()
   * bypasses the dome mapping entirely — AMOUNT becomes rim depth, SOFT rim
   * width, LIGHT still aims it; SHAPE/COLOR/TONES are inert. Only another
   * preset (or RESET) leaves the mode.
   */
  private shadeOverrides: Partial<{ floor: number; ceiling: number; emboss: boolean }> = {};
  private liveCheckboxEl?: HTMLInputElement;
  /** Re-shade is deferred to update() so a paint drag doesn't run it per pixel. */
  private shadePreviewDirty = false;
  private shadePreviewTimer = 0;

  // preview state
  private previewSprite!: Phaser.GameObjects.Sprite;
  private previewShadow!: Phaser.GameObjects.Graphics;
  private previewBorder!: Phaser.GameObjects.Graphics;
  private previewBg!: Phaser.GameObjects.Graphics;
  private previewBgIdx = 0;
  private previewPaused = false;
  private pauseBtnGfx!: Phaser.GameObjects.Graphics;
  private previewActualSize = false;
  private actualSizeBtnGfx!: Phaser.GameObjects.Graphics;
  private previewHint!: Phaser.GameObjects.Text;
  private previewLabel!: Phaser.GameObjects.Text;
  private fpsLabel!: Phaser.GameObjects.Text;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private pointerIn = false;
  private previewDir: Dir = 'down';
  private pinnedDir: Dir | null = null;
  private autoDirIdx = 0;
  private dirTimer = 0;
  private fps: number = PLAYER_CONFIG.ANIM_FPS;

  constructor() {
    super(SCENES.SPRITE_EDITOR);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().stopMusic();
    MusicManager.getInstance().stop();

    this.overlay = new HtmlOverlay(this);

    this.add.rectangle(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT, 0x12121f).setOrigin(0, 0);
    this.add.text(GAME_CONFIG.WIDTH / 2, 16, 'SPRITE EDITOR', {
      fontSize: '28px', color: '#aaccff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add.text(GAME_CONFIG.WIDTH - 12, 16, 'ESC — back', {
      fontSize: '18px', color: '#446688', fontFamily: 'monospace',
    }).setOrigin(1, 0);
    this.dirtyMark = this.add.text(LABEL_X + 62, 34, '● unsaved', {
      fontSize: '14px', color: '#ffaa44', fontFamily: 'monospace',
    }).setVisible(false);
    this.btn = new EditorButtons(this);

    this.buildWorkTexture();

    this.canvas = new PixelCanvas({
      scene: this,
      size: FRAME,
      x: DRAW_X,
      y: DRAW_Y,
      scale: DRAW_SCALE,
      wrapBrush: false,          // character frames don't tile
      getColor: () => this.panel.color,
      onEyedrop: (argb) => this.panel.setColor(argb, true),
      onChange: () => this.syncFrameToTexture(),
      onToolChange: () => this.refreshToolButtons(),
      onStatus: (msg) => this.statusText?.setText(msg),
      backdrop: () => this.onionBackdrop(),
    });
    this.canvas.wrapSample = false;

    this.add.text(DRAW_X, DRAW_Y - 20, 'DRAW', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    this.buildFramePicker();
    this.buildPreviewPane();
    this.panel = new ColorPanel({
      scene: this,
      overlay: this.overlay,
      x: PANEL_X,
      paletteY: PALETTE_Y,
      hsvY: HSV_Y,
      recentY: RECENT_Y,
      width: PREV_W,
      onStatus: (msg) => this.statusText?.setText(msg),
    });
    this.buildToolButtons();
    this.buildUtilButtons();
    this.buildFocusButton();

    this.statusText = this.add.text(DRAW_X, STATUS_Y, '', {
      fontSize: '16px', color: '#667799', fontFamily: 'monospace',
    });

    this.buildAnims(this.fps);
    this.setupKeyboard();

    void this.initSheets();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      for (const d of DIRS) {
        this.anims.remove(`spriteedit-walk-${d}`);
        this.anims.remove(`spriteedit-idle-${d}`);
      }
      if (this.textures.exists(WORK_KEY)) this.textures.remove(WORK_KEY);
      if (this.textures.exists(SRC_KEY)) this.textures.remove(SRC_KEY);
      if (this.textures.exists(SHADED_KEY)) this.textures.remove(SHADED_KEY);
    });
  }

  // ─── Work texture & animations ─────────────────────────────────────────────

  private buildWorkTexture(): void {
    if (this.textures.exists(WORK_KEY)) this.textures.remove(WORK_KEY);
    this.workTex = this.textures.createCanvas(WORK_KEY, SHEET_PX, SHEET_PX)!;
    for (let i = 0; i < SHEET_FRAMES; i++) {
      const col = i % SHEET_COLS;
      const row = Math.floor(i / SHEET_COLS);
      this.workTex.add(i, 0, col * FRAME, row * FRAME, FRAME, FRAME);
    }
  }

  private buildAnims(fps: number): void {
    // Bound to whichever texture is previewing (raw or live-shaded), so both
    // walk and idle must be rebuilt — not just created once — or toggling live
    // shading would leave idle pointing at the old texture.
    const texKey = this.previewTexKey();
    DIRS.forEach((dir, row) => {
      const start = row * 4;
      const walkKey = `spriteedit-walk-${dir}`;
      const idleKey = `spriteedit-idle-${dir}`;
      this.anims.remove(walkKey);
      this.anims.create({
        key: walkKey,
        frames: [0, 1, 2, 3].map(i => ({ key: texKey, frame: start + i })),
        frameRate: fps,
        repeat: -1,
      });
      this.anims.remove(idleKey);
      this.anims.create({
        key: idleKey,
        frames: [{ key: texKey, frame: start }],
        frameRate: 1,
        repeat: -1,
      });
    });
  }

  // ─── Shading panel ─────────────────────────────────────────────────────────

  /**
   * LIVE checkbox + one slider per shading parameter, under the SHADE button.
   * The sliders drive both the live preview and what SHADE writes, so what you
   * tune is exactly what you get.
   */
  private buildShadingPanel(x: number, shadeY: number, bw: number, bh: number, gap: number): void {
    // LIVE toggle sits beside SHADE so the pairing is obvious; PAL (snap the
    // output to the sheet's own palette) beside it as the other boolean.
    const liveX = x + bw * 2 + gap + 8;
    this.add.text(liveX + 19, shadeY + 6, 'LIVE', {
      fontSize: '14px', color: '#aaccff', fontFamily: 'monospace',
    });
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.style.cssText = 'position:fixed;z-index:1000;cursor:pointer;margin:0;accent-color:#c8963c';
    cb.addEventListener('change', () => this.setLiveShading(cb.checked));
    this.liveCheckboxEl = this.overlay.add(cb, liveX, shadeY + 7, 15, 15);

    const palX = liveX + 62;
    this.add.text(palX + 19, shadeY + 6, 'PAL', {
      fontSize: '14px', color: '#aaccff', fontFamily: 'monospace',
    });
    const pal = document.createElement('input');
    pal.type = 'checkbox';
    pal.style.cssText = 'position:fixed;z-index:1000;cursor:pointer;margin:0;accent-color:#c8963c';
    pal.title = 'snap shaded pixels to colours already in the sheet';
    pal.addEventListener('change', () => {
      this.shadeValues.palette = pal.checked ? 1 : 0;
      if (this.liveShading) this.shadePreviewDirty = true;
    });
    this.overlay.add(pal, palX, shadeY + 7, 15, 15);

    // Six rows — the full parameter set lives in the lib/CLI; the editor
    // deliberately maps everything onto these few (see shadeOptions).
    const PITCH = 30;
    const rowY = (i: number): number => shadeY + bh + 10 + i * PITCH;

    SHADE_SLIDERS.forEach((s, i) => {
      const y = rowY(i);
      this.add.text(x, y, s.label, {
        fontSize: '13px', color: '#667788', fontFamily: 'monospace',
      });

      const el = document.createElement('input');
      el.type = 'range';
      el.min = String(s.min);
      el.max = String(s.max);
      el.step = String(s.step);
      el.value = String(this.shadeValues[s.key]);
      el.title = s.hint;
      el.style.cssText = 'position:fixed;z-index:1000;cursor:pointer;accent-color:#c8963c;background:transparent';
      el.addEventListener('input', () => {
        this.shadeValues[s.key] = Number(el.value);
        if (s.key === 'amount') { delete this.shadeOverrides.floor; delete this.shadeOverrides.ceiling; }
        this.shadeValueLabels.get(s.key)?.setText(this.formatShadeValue(s));
        // Re-shade on the next update() tick rather than per input event —
        // dragging a slider fires these far faster than a full sheet re-shade.
        if (this.liveShading) this.shadePreviewDirty = true;
      });
      this.overlay.add(el, x + 72, y - 1, 126, 14);
      this.shadeSliderEls.set(s.key, el);

      this.shadeValueLabels.set(s.key, this.add.text(x + 204, y, this.formatShadeValue(s), {
        fontSize: '13px', color: '#c8963c', fontFamily: 'monospace',
      }));
    });

    // Presets — full slider records, so each is a reproducible starting point.
    const py = rowY(SHADE_SLIDERS.length) + 2;
    const py2 = py + bh - 2;
    this.btn.make('BEVEL',  x, py, bw, bh - 6, 0x6e4c1c, () => this.applyShadePreset('bevel'));
    this.btn.make('SOFT',   x + bw + gap, py, bw, bh - 6, 0x2f4f5f, () => this.applyShadePreset('soft'));
    this.btn.make('DITHER', x + (bw + gap) * 2, py, bw, bh - 6, 0x4f2f5f, () => this.applyShadePreset('dither'));
    this.btn.make('HUE',    x, py2, bw, bh - 6, 0x4f2f5f, () => this.applyShadePreset('hue'));
    this.btn.make('RESET',  x + bw + gap, py2, bw, bh - 6, 0x2f4f5f, () => this.applyShadePreset('reset'));
  }

  private formatShadeValue(s: ShadeSlider): string {
    const v = this.shadeValues[s.key];
    if (s.key === 'light') return `${Math.round(v)}°`;
    if (s.key === 'tones') return TONE_LABELS[Math.round(v)] ?? 'smooth';
    if (s.key === 'soft')  return `${Math.round(v)}px`;
    return v.toFixed(2);
  }

  private applyShadePreset(name: 'bevel' | 'soft' | 'dither' | 'hue' | 'reset'): void {
    const presets: Record<string, Record<string, number>> = {
      // Emboss: sprite raised off the surface — lit rim toward the light,
      // dark rim opposite, interior untouched. AMOUNT = depth, SOFT = width.
      // Width 3 user-picked from the rendered sweep 2026-08-01.
      bevel: { amount: 0.4, light: DEFAULT_AZIMUTH, shape: 0, soft: 3, color: 0.25, tones: 0 },
      // One gentle wash over the whole body, smooth, more colour movement.
      soft:  { amount: 0.5, light: DEFAULT_AZIMUTH, shape: 0.2, soft: 14, color: 0.4, tones: 0 },
      // Retro banded wash with grain: 5 tones + Bayer dither, strong colour
      // movement. Picked by the user from rendered candidates 2026-08-01
      // ("B": strength 1.3, floor .55, ceiling 1.35 — hence the ramp override).
      dither: { amount: 0.5, light: DEFAULT_AZIMUTH, shape: 0.2, soft: 7, color: 0.45, tones: 1 },
      // Same candidate sheet's "HUE": DITHER's ramp, smooth (no bands), hue
      // pushed harder — warm-gold highlights, cool-blue shadows.
      hue:   { amount: 0.5, light: DEFAULT_AZIMUTH, shape: 0.2, soft: 7, color: 0.6, tones: 0 },
      // RESET = the locked house style (matches lib DEFAULTS / bare CLI).
      reset: { amount: 0.3, light: DEFAULT_AZIMUTH, shape: 0.2, soft: SHADE_DEFAULTS.blur, color: SHADE_DEFAULTS.hue, tones: 0 },
    };
    this.shadeOverrides =
      name === 'dither' || name === 'hue' ? { floor: 0.55, ceiling: 1.35 }
      : name === 'bevel'                  ? { emboss: true }
      : {};
    Object.assign(this.shadeValues, presets[name]);
    for (const s of SHADE_SLIDERS) {
      const el = this.shadeSliderEls.get(s.key);
      if (el) el.value = String(this.shadeValues[s.key]);
      this.shadeValueLabels.get(s.key)?.setText(this.formatShadeValue(s));
    }
    if (this.liveShading) this.shadePreviewDirty = true;
    const hint = name === 'bevel' ? 'emboss: AMOUNT=depth SOFT=width — ' : '';
    this.statusText?.setText(`${name} preset — ${hint}${this.liveShading ? 'preview updated' : 'tick LIVE to preview'}`);
  }

  // ─── Live shading preview ──────────────────────────────────────────────────

  /** Which texture the preview pane is showing — shaded mirror or raw work. */
  private previewTexKey(): string {
    return this.liveShading ? SHADED_KEY : WORK_KEY;
  }

  /** Slider values → the option object shade.mjs expects. */
  /**
   * Map the six intuitive controls onto the full shader parameter set (the
   * lib and the CLI keep every knob; the editor deliberately exposes few).
   *
   *   AMOUNT → strength, plus floor/ceiling widened in step so the range is
   *            always usable but can never crush to black or blow to white
   *   LIGHT  → direction (elevation fixed at the tuned default)
   *   SHAPE  → volume/parts blend (0 = one body … 1 = per-outline parts)
   *   SOFT   → dome radius
   *   COLOR  → hue shift
   *   TONES  → band size, with dithering auto-enabled alongside bands
   */
  private shadeOptions(): Record<string, number | number[] | boolean> {
    const v = this.shadeValues;
    const rad = (v.light * Math.PI) / 180;
    const dir = [Math.cos(rad), Math.sin(rad), DEFAULT_ELEVATION];
    if (this.shadeOverrides.emboss) {
      // BEVEL preset: raised-sticker rim only, dome model bypassed.
      return {
        bevel:      Math.max(1, Math.round(v.soft)),
        bevelDepth: v.amount,
        palette:    v.palette > 0,
        dir,
      };
    }
    const steps = TONE_STEPS[Math.round(v.tones)] ?? 0;
    return {
      strength: 2.6 * v.amount,
      floor:    this.shadeOverrides.floor   ?? Math.max(0.3, 1 - 1.15 * v.amount),
      ceiling:  this.shadeOverrides.ceiling ?? 1 + v.amount,
      volume:   1 - v.shape,
      parts:    v.shape,
      blur:     Math.max(1, Math.round(v.soft)),
      hue:      v.color,
      steps,
      dither:   steps > 0 ? 0.7 : 0,
      detail:   SHADE_DEFAULTS.detail,
      falloff:  SHADE_DEFAULTS.falloff,
      palette:  v.palette > 0,
      dir,
    };
  }

  private buildShadedTexture(): void {
    if (this.textures.exists(SHADED_KEY)) this.textures.remove(SHADED_KEY);
    this.shadeTex = this.textures.createCanvas(SHADED_KEY, SHEET_PX, SHEET_PX)!;
    for (let i = 0; i < SHEET_FRAMES; i++) {
      this.shadeTex.add(i, 0, (i % SHEET_COLS) * FRAME, Math.floor(i / SHEET_COLS) * FRAME, FRAME, FRAME);
    }
  }

  /**
   * Re-shade the whole sheet into the mirror texture. Runs the same
   * `shadeSheet` the SHADE button and the CLI use, so what the preview shows is
   * what gets written — no separate preview approximation to fall out of sync.
   */
  private refreshShadedPreview(): void {
    if (!this.shadeTex) this.buildShadedTexture();
    const dst = this.shadeTex!;
    dst.context.clearRect(0, 0, SHEET_PX, SHEET_PX);
    dst.context.drawImage(this.workTex.canvas, 0, 0);
    const img = dst.context.getImageData(0, 0, SHEET_PX, SHEET_PX);
    try {
      shadeSheet(img.data, SHEET_PX, SHEET_PX, this.shadeOptions());
    } catch { /* non-conforming sheet size — leave the copy unshaded */ }
    dst.context.putImageData(img, 0, 0);
    dst.refresh();
  }

  private setLiveShading(on: boolean): void {
    this.liveShading = on;
    if (on) this.refreshShadedPreview();
    // Anims are bound to a texture key, so they have to be rebuilt against
    // whichever mirror is now driving the preview.
    this.buildAnims(this.fps);
    this.previewSprite.setTexture(this.previewTexKey(), this.previewPaused ? this.selectedFrame : 0);
    if (!this.previewPaused) this.previewSprite.play(`spriteedit-walk-${this.previewDir}`, true);
    this.statusText?.setText(on ? 'live shading on — preview only, SAVE is unaffected' : 'live shading off');
  }

  private setFps(fps: number): void {
    this.fps = Phaser.Math.Clamp(fps, 2, 16);
    this.fpsLabel.setText(`fps ${this.fps}`);
    this.previewSprite.anims.stop();
    this.buildAnims(this.fps);
    if (this.previewPaused) {
      this.previewSprite.setTexture(this.previewTexKey(), this.selectedFrame);
      return;
    }
    this.previewSprite.play(`spriteedit-walk-${this.previewDir}`, true);
  }

  // ─── Sheet loading ─────────────────────────────────────────────────────────

  private async initSheets(): Promise<void> {
    let names: string[] = [];
    if (import.meta.env.DEV) {
      try {
        const resp = await fetch('/__editor/list-sprites');
        if (resp.ok) {
          const data = await resp.json() as { sprites: { name: string; width: number; height: number }[] };
          names = data.sprites
            .filter(s => s.width === SHEET_PX && s.height === SHEET_PX)
            .map(s => s.name)
            // `_n` normal maps are the same size as their sheet but aren't
            // paintable art. `-shaded` sheets stay listed — they're meant to
            // be selectable and assignable once the art is finished.
            .filter(n => !n.endsWith('_n'))
            .sort();
        }
      } catch { /* dev server endpoint unavailable — fall through */ }
    }
    if (names.length === 0) names = FALLBACK_SHEETS.filter(n => this.textures.exists(n));

    this.buildSheetDropdown(names);

    const protagSheet = getCharacter('player')?.sheet ?? 'player-good';
    const initial = names.includes(protagSheet) ? protagSheet : names[0];
    if (initial) {
      await this.loadSheet(initial);
    } else {
      this.statusText?.setText('no 256×256 sheets found');
    }
  }

  private buildSheetDropdown(names: string[]): void {
    this.add.text(LABEL_X, 34, 'SHEET', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    const el = document.createElement('select');
    el.style.cssText = [
      'position:fixed', 'z-index:1000', 'cursor:pointer',
      'font-family:monospace', 'font-size:11px',
      'background:#1a1a2e', 'color:#aaccff',
      'border:1px solid #334466', 'padding:1px 3px',
      'box-sizing:border-box', 'width:100%',
    ].join(';');

    for (const name of names) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.text  = name;
      el.appendChild(opt);
    }

    el.addEventListener('change', () => {
      this.trySelectSheet(el.value);
      el.blur(); // hand the keyboard back to the editor
    });
    el.addEventListener('keydown', (e) => e.stopPropagation());

    this.overlay.add(el, LABEL_X, 56, GRID_X - LABEL_X + SHEET_COLS * CELL - 4, 18);
    this.dropdownEl = el;
  }

  /** Insert a freshly created sheet into the dropdown, keeping it sorted. */
  private addSheetOption(name: string): void {
    if (!this.dropdownEl) return;
    const names = Array.from(this.dropdownEl.options).map(o => o.value);
    if (names.includes(name)) return;
    names.push(name);
    names.sort();
    this.dropdownEl.innerHTML = '';
    for (const n of names) {
      const opt = document.createElement('option');
      opt.value = n;
      opt.text = n;
      this.dropdownEl.appendChild(opt);
    }
  }

  /**
   * NEW / DUPE: write a fresh 256×256 PNG to disk via the save-sprite
   * endpoint and open it. DUPE forks the open sheet's current (even
   * unsaved) state; the original file on disk is left untouched.
   */
  private async createSheet(duplicate: boolean): Promise<void> {
    if (!import.meta.env.DEV) {
      this.statusText.setText('sheet creation only available in dev mode');
      return;
    }
    if (duplicate && !this.currentSheet) {
      this.statusText.setText('no sheet loaded to duplicate');
      return;
    }
    // Stamp any float BEFORE the dirty guard — a hovering paste is unsaved
    // work and must trip the prompt, not vanish when the sheet swaps.
    this.canvas.stampFloating();
    if (!duplicate && this.dirty) {
      this.statusText.setText('unsaved changes — SAVE (or discard) before creating a new sheet');
      return;
    }
    const name = (window.prompt(
      duplicate ? `duplicate "${this.currentSheet}" as (letters, digits, dashes):` : 'new sheet name (letters, digits, dashes):',
    ) ?? '').trim();
    if (!name) return;
    if (!/^[a-z0-9][a-z0-9-]*$/i.test(name)) {
      this.statusText.setText('invalid name — letters, digits, dashes only');
      return;
    }
    if (this.dropdownEl && Array.from(this.dropdownEl.options).some(o => o.value === name)) {
      this.statusText.setText(`sheet "${name}" already exists`);
      return;
    }

    const cv = document.createElement('canvas');
    cv.width = SHEET_PX;
    cv.height = SHEET_PX;
    if (duplicate) cv.getContext('2d')!.drawImage(this.workTex.canvas, 0, 0);

    const blob = await new Promise<Blob | null>(res => cv.toBlob(res, 'image/png'));
    if (!blob) {
      this.statusText.setText('png encode failed');
      return;
    }
    try {
      const resp = await fetch(`/__editor/save-sprite?sheet=${encodeURIComponent(name)}`, {
        method: 'POST',
        body: blob,
      });
      if (!resp.ok) {
        this.statusText.setText(`create failed: ${resp.status}`);
        return;
      }
    } catch (e) {
      this.statusText.setText(`create failed: ${String(e)}`);
      return;
    }

    this.addSheetOption(name);
    await this.loadSheet(name);
    this.statusText.setText(`${duplicate ? 'duplicated to' : 'created'} ${name}.png ✓ — ASSIGN to a character when ready`);
  }

  /**
   * SHADE button — bake the fixed top-left key light into `<sheet>-shaded.png`.
   * The original is never modified, and the shaded sheet becomes selectable in
   * the dropdown so it can be ASSIGNed to a character.
   *
   * Server-side (see `/__editor/shade-sprite`) so the button and the
   * `npm run bake-depth` CLI run the same `scripts/lib/shade.cjs`.
   */
  private async createShadedVersion(): Promise<void> {
    if (!import.meta.env.DEV) {
      this.statusText.setText('shading only available in dev mode');
      return;
    }
    if (!this.currentSheet) {
      this.statusText.setText('no sheet loaded');
      return;
    }
    if (this.currentSheet.endsWith('-shaded')) {
      this.statusText.setText('already a shaded sheet — open the original');
      return;
    }
    // Shading reads the PNG on disk, so unsaved work would silently be left
    // out of the result. Better to say so than to shade a stale sheet.
    if (this.dirty) {
      this.statusText.setText('unsaved changes — SAVE first, then SHADE');
      return;
    }

    const name = `${this.currentSheet}-shaded`;
    this.statusText.setText(`shading ${this.currentSheet}…`);
    try {
      const resp = await fetch(
        `/__editor/shade-sprite?sheet=${encodeURIComponent(this.currentSheet)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // Exactly the options the live preview is using, so the written file
          // matches what you were looking at.
          body: JSON.stringify(this.shadeOptions()),
        },
      );
      const body = await resp.json().catch(() => ({})) as { error?: string; frames?: number };
      if (!resp.ok) {
        this.statusText.setText(`shade failed: ${body.error ?? resp.status}`);
        return;
      }
      this.addSheetOption(name);
      this.statusText.setText(`created ${name}.png ✓ (${body.frames ?? 0} frames) — reload page to open it`);
    } catch (e: unknown) {
      this.statusText.setText(`shade error: ${(e as Error).message ?? e}`);
    }
  }

  private trySelectSheet(name: string): void {
    if (name === this.currentSheet) return;
    // A hovering paste is real work: stamp it NOW so it sets the dirty flag
    // and gets the unsaved-changes prompt below — otherwise switching sheets
    // with a float up discarded it silently past the guard.
    this.canvas?.stampFloating();
    const now = this.time.now;
    if (this.dirty && !(this.pendingSwitch === name && now - this.pendingSwitchAt < 3000)) {
      this.pendingSwitch = name;
      this.pendingSwitchAt = now;
      if (this.dropdownEl) this.dropdownEl.value = this.currentSheet;
      this.statusText?.setText('unsaved changes — select again to discard');
      return;
    }
    this.pendingSwitch = undefined;
    void this.loadSheet(name);
  }

  private async loadSheet(name: string): Promise<void> {
    // Stamp any floating region into the outgoing sheet before the work
    // texture is rebuilt — a float must never land on the incoming sheet.
    this.canvas?.stampFloating();
    this.statusText?.setText(`loading ${name}…`);

    let srcKey = name;
    if (!this.textures.exists(name)) {
      // Sheet exists on disk but was never preloaded — load it at runtime.
      srcKey = SRC_KEY;
      if (this.textures.exists(SRC_KEY)) this.textures.remove(SRC_KEY);
      await new Promise<void>((resolve) => {
        this.load.image(SRC_KEY, `assets/sprites/${name}.png`);
        this.load.once(Phaser.Loader.Events.COMPLETE, () => resolve());
        this.load.start();
      });
      if (!this.textures.exists(SRC_KEY)) {
        this.statusText?.setText(`failed to load ${name}.png`);
        return;
      }
    }

    const src = this.textures.get(srcKey).getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    const ctx = this.workTex.context;
    ctx.clearRect(0, 0, SHEET_PX, SHEET_PX);
    ctx.drawImage(src, 0, 0);
    this.workTex.refresh();

    this.currentSheet = name;
    this.setDirty(false);
    // The shaded mirror is a copy of the work texture, so a sheet swap leaves
    // it showing the PREVIOUS sheet until something else dirties it. Rebuild
    // straight away rather than waiting for the next slider nudge.
    if (this.liveShading) this.refreshShadedPreview();
    this.shadePreviewDirty = false;
    if (this.dropdownEl && this.dropdownEl.value !== name) this.dropdownEl.value = name;
    this.selectFrame(0);
    this.statusText?.setText(`sheet: ${name}`);
  }

  // ─── Frame picker ──────────────────────────────────────────────────────────

  private buildFramePicker(): void {
    this.add.text(LABEL_X, GRID_Y - 20, 'FRAMES', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    // cell backgrounds
    const bg = this.add.graphics();
    for (let i = 0; i < SHEET_FRAMES; i++) {
      const col = i % SHEET_COLS;
      const row = Math.floor(i / SHEET_COLS);
      const cx = GRID_X + col * CELL;
      const cy = GRID_Y + row * CELL;
      bg.fillStyle(0x1a1a2e, 0.6);
      bg.fillRect(cx, cy, CELL - 4, CELL - 4);
      bg.lineStyle(1, 0x334455, 1);
      bg.strokeRect(cx, cy, CELL - 4, CELL - 4);
    }

    // direction row labels
    DIRS.forEach((dir, row) => {
      this.add.text(LABEL_X, GRID_Y + row * CELL + 20, dir, {
        fontSize: '13px', color: '#556677', fontFamily: 'monospace',
      });
    });

    // live thumbnails from the work texture (native frame is 64px → scaled to fit the cell)
    for (let i = 0; i < SHEET_FRAMES; i++) {
      const col = i % SHEET_COLS;
      const row = Math.floor(i / SHEET_COLS);
      const thumb = this.add.image(GRID_X + col * CELL, GRID_Y + row * CELL, WORK_KEY, i)
        .setOrigin(0, 0)
        .setScale(THUMB / FRAME);
      // hit area is in the image's local (pre-scale) space, so it stays 64×64
      thumb.setInteractive(new Phaser.Geom.Rectangle(0, 0, FRAME, FRAME), Phaser.Geom.Rectangle.Contains);
      thumb.input!.cursor = 'pointer';
      thumb.on('pointerdown', () => this.selectFrame(i));
      this.thumbs.push(thumb);
    }

    this.pickerSel = this.add.graphics();

    this.frameLabel = this.add.text(LABEL_X, GRID_Y + 4 * CELL + 8, 'frame: 0 (down-0)', {
      fontSize: '16px', color: '#4488aa', fontFamily: 'monospace',
    });

    this.updatePickerSelection();
  }

  private updatePickerSelection(): void {
    const col = this.selectedFrame % SHEET_COLS;
    const row = Math.floor(this.selectedFrame / SHEET_COLS);
    const g = this.pickerSel;
    g.clear();
    g.lineStyle(2, 0x4499ff, 1);
    g.strokeRect(GRID_X + col * CELL - 1, GRID_Y + row * CELL - 1, CELL - 2, CELL - 2);
  }

  private selectFrame(i: number): void {
    // Stamp any floating region into the outgoing frame first (syncs via onChange)
    this.canvas?.stampFloating();
    this.selectedFrame = ((i % SHEET_FRAMES) + SHEET_FRAMES) % SHEET_FRAMES;
    const col = this.selectedFrame % SHEET_COLS;
    const row = Math.floor(this.selectedFrame / SHEET_COLS);

    // read the frame's pixels back from the work canvas (the source of truth)
    const data = this.workTex.context.getImageData(col * FRAME, row * FRAME, FRAME, FRAME).data;
    for (let p = 0; p < FRAME * FRAME; p++) {
      const r = data[p * 4], g = data[p * 4 + 1], b = data[p * 4 + 2], a = data[p * 4 + 3];
      this.canvas.pixels[p] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
    this.canvas.clearHistory();
    this.canvas.redraw();

    this.updatePickerSelection();
    this.frameLabel?.setText(`frame: ${this.selectedFrame} (${DIRS[row]}-${col})`);

    // pin the preview to the row being edited (until the pane is next hovered)
    this.pinnedDir = DIRS[row];

    if (this.previewPaused) {
      this.previewSprite?.setFrame(this.selectedFrame);
      this.previewLabel?.setText(`paused — frame ${this.selectedFrame}`);
    }
  }

  /** Writes the edit buffer into the work texture at the selected frame. */
  private syncFrameToTexture(): void {
    const col = this.selectedFrame % SHEET_COLS;
    const row = Math.floor(this.selectedFrame / SHEET_COLS);
    const ctx = this.workTex.context;
    const img = ctx.createImageData(FRAME, FRAME);
    for (let p = 0; p < FRAME * FRAME; p++) {
      const argb = this.canvas.pixels[p];
      img.data[p * 4]     = (argb >>> 16) & 0xff;
      img.data[p * 4 + 1] = (argb >>>  8) & 0xff;
      img.data[p * 4 + 2] =  argb         & 0xff;
      img.data[p * 4 + 3] = (argb >>> 24) & 0xff;
    }
    ctx.putImageData(img, col * FRAME, row * FRAME);
    this.workTex.refresh();
    this.shadePreviewDirty = true;
    this.setDirty(true);
  }

  private setDirty(v: boolean): void {
    if (this.dirty === v) return;
    this.dirty = v;
    this.dirtyMark?.setVisible(v);
    this.saveBtnTint?.(v ? 0x2f6e1c : 0x1c3c6e);
  }

  // ─── Onion skin ────────────────────────────────────────────────────────────

  private onionBackdrop(): Uint32Array | null {
    if (!this.onionOn) return null;
    const col = this.selectedFrame % SHEET_COLS;
    const row = Math.floor(this.selectedFrame / SHEET_COLS);
    const ctx = this.workTex.context;
    const out = new Uint32Array(FRAME * FRAME);

    // nearest neighbour frames first so they win overlaps
    const order = [0, 1, 2, 3]
      .filter(c => c !== col)
      .sort((a, b) => Math.abs(a - col) - Math.abs(b - col));

    for (const c of order) {
      const tint = c < col ? 0x6688ff : 0xff7766;   // blue = earlier, red = later
      const data = ctx.getImageData(c * FRAME, row * FRAME, FRAME, FRAME).data;
      for (let p = 0; p < FRAME * FRAME; p++) {
        if (data[p * 4 + 3] === 0) continue;
        if (out[p] !== 0) continue;
        out[p] = ((0x38 << 24) | tint) >>> 0;
      }
    }
    return out;
  }

  // ─── Preview pane ──────────────────────────────────────────────────────────

  private buildPreviewPane(): void {
    this.add.text(PREV_X, PREV_Y - 20, 'PREVIEW (hover = WASD)', {
      fontSize: '16px', color: '#446655', fontFamily: 'monospace',
    });

    this.previewBg = this.add.graphics();
    this.drawPreviewBg();

    this.previewBorder = this.add.graphics();
    this.drawPreviewBorder(false);

    // Contact shadow beneath the character — same look as in-game, so the
    // preview reads the way the sprite will on the floor.
    this.previewShadow = this.add.graphics();
    drawCharacterShadow(this.previewShadow);
    this.updatePreviewShadow();

    this.previewSprite = this.add.sprite(PREV_X + PREV_W / 2, PREV_Y + PREV_H / 2, WORK_KEY, 0)
      .setScale(PREV_SPRITE_SCALE);

    this.previewHint = this.add.text(PREV_X + PREV_W / 2, PREV_Y + PREV_H - 14, 'WASD — walk', {
      fontSize: '15px', color: '#88aaff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2).setVisible(false);

    this.previewLabel = this.add.text(PREV_X, PREV_CTRL_Y + 4, 'auto — down', {
      fontSize: '16px', color: '#667799', fontFamily: 'monospace',
    });

    // fps stepper
    const FY = PREV_CTRL_Y;
    this.btn.make('−', PREV_X + 190, FY, 24, 24, 0x1c3c6e, () => this.setFps(this.fps - 1));
    this.fpsLabel = this.add.text(PREV_X + 224, FY + 12, `fps ${this.fps}`, {
      fontSize: '16px', color: '#88aacc', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    this.btn.make('+', PREV_X + 296, FY, 24, 24, 0x1c3c6e, () => this.setFps(this.fps + 1));

    // pause — lock the preview to the selected frame (edits stay live)
    this.pauseBtnGfx = this.add.graphics();
    this.btn.draw(this.pauseBtnGfx, PREV_X + 330, FY, 40, 24, false);
    this.add.text(PREV_X + 350, FY + 12, '⏸', {
      fontSize: '16px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.btn.bind(this.pauseBtnGfx, PREV_X + 330, FY, 40, 24, () => this.togglePreviewPause());

    // actual-size toggle — matches the in-game ENTITY_WORLD_SCALE (native 64px)
    // vs the enlarged 3x default used for painting/preview clarity.
    const asx = PREV_X + PREV_W - 56, asy = PREV_Y + 4;
    this.actualSizeBtnGfx = this.add.graphics();
    this.btn.draw(this.actualSizeBtnGfx, asx, asy, 24, 24, this.previewActualSize);
    this.add.text(asx + 12, asy + 12, '1:1', {
      fontSize: '11px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.btn.bind(this.actualSizeBtnGfx, asx, asy, 24, 24, () => this.toggleActualSize());

    // backdrop cycle — light sprites are invisible on the default dark pane
    const bgBtn = this.add.graphics();
    const bbx = PREV_X + PREV_W - 28, bby = PREV_Y + 4;
    this.btn.draw(bgBtn, bbx, bby, 24, 24, false);
    this.add.text(bbx + 12, bby + 12, '▦', {
      fontSize: '16px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.btn.bind(bgBtn, bbx, bby, 24, 24, () => {
      this.previewBgIdx = (this.previewBgIdx + 1) % SpriteEditorScene.PREVIEW_BGS.length;
      this.drawPreviewBg();
      this.statusText?.setText(`preview bg: ${SpriteEditorScene.PREVIEW_BGS[this.previewBgIdx]}`);
    });
  }

  private static readonly PREVIEW_BGS = ['dark', 'checker', 'light', 'grass'] as const;

  private drawPreviewBg(): void {
    const g = this.previewBg;
    g.clear();
    const mode = SpriteEditorScene.PREVIEW_BGS[this.previewBgIdx];
    if (mode === 'checker') {
      const cs = 12;
      for (let y = 0; y < PREV_H; y += cs) {
        for (let x = 0; x < PREV_W; x += cs) {
          g.fillStyle((x / cs + y / cs) % 2 === 0 ? 0x2e2e3e : 0x383848, 1);
          g.fillRect(PREV_X + x, PREV_Y + y, Math.min(cs, PREV_W - x), Math.min(cs, PREV_H - y));
        }
      }
    } else {
      const col = mode === 'dark' ? 0x181828 : mode === 'light' ? 0xaab4be : 0x2d6a4f;
      g.fillStyle(col, 1);
      g.fillRect(PREV_X, PREV_Y, PREV_W, PREV_H);
    }
  }

  /** Toggle the preview sprite between the enlarged 3x view and true in-game (1x, native 64px) size. */
  private toggleActualSize(): void {
    this.previewActualSize = !this.previewActualSize;
    const asx = PREV_X + PREV_W - 56, asy = PREV_Y + 4;
    this.btn.draw(this.actualSizeBtnGfx, asx, asy, 24, 24, this.previewActualSize);
    this.previewSprite.setScale(this.previewActualSize ? PREV_SPRITE_SCALE_ACTUAL : PREV_SPRITE_SCALE);
    this.updatePreviewShadow();
    this.statusText?.setText(this.previewActualSize ? 'preview: actual size (1x)' : 'preview: enlarged (3x)');
  }

  /** Size + park the contact shadow under the (stationary) preview sprite for the current zoom. */
  private updatePreviewShadow(): void {
    const scale = this.previewActualSize ? PREV_SPRITE_SCALE_ACTUAL : PREV_SPRITE_SCALE;
    this.previewShadow.setScale(scale);
    this.previewShadow.setPosition(
      PREV_X + PREV_W / 2,
      PREV_Y + PREV_H / 2 + CHARACTER_SHADOW_FEET_OFFSET * scale,
    );
  }

  /** Pause locks the preview to the currently selected frame (still live-updating with edits). */
  private togglePreviewPause(): void {
    this.previewPaused = !this.previewPaused;
    this.btn.draw(this.pauseBtnGfx, PREV_X + 330, PREV_CTRL_Y, 40, 24, this.previewPaused);
    if (this.previewPaused) {
      this.previewSprite.anims.stop();
      this.previewSprite.setPosition(PREV_X + PREV_W / 2, PREV_Y + PREV_H / 2);
      this.previewSprite.setFrame(this.selectedFrame);
      this.previewLabel.setText(`paused — frame ${this.selectedFrame}`);
    } else {
      this.previewSprite.play(`spriteedit-walk-${this.previewDir}`, true);
      this.previewLabel.setText(`auto — ${this.previewDir}`);
    }
  }

  private drawPreviewBorder(active: boolean): void {
    const g = this.previewBorder;
    g.clear();
    g.lineStyle(active ? 2 : 1, active ? 0x4499ff : 0x446644, 1);
    g.strokeRect(PREV_X, PREV_Y, PREV_W, PREV_H);
  }

  private setupKeyboard(): void {
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard!.on('keydown-ESC', () => {
      if (this.assignContainer) {
        this.closeAssignPicker();
        return;
      }
      const now = this.time.now;
      if (this.dirty && !(this.pendingExitAt > 0 && now - this.pendingExitAt < 3000)) {
        this.pendingExitAt = now;
        this.statusText?.setText('unsaved changes — ESC again to discard');
        return;
      }
      this.scene.start(SCENES.MENU);
    });
    this.input.keyboard!.on('keydown-S', (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      this.saveSheet();
    });
    this.input.keyboard!.on('keydown-Q', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      this.selectFrame(this.selectedFrame - 1);
    });
    this.input.keyboard!.on('keydown-E', (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      this.selectFrame(this.selectedFrame + 1);
    });
    this.input.keyboard!.on('keydown-Z', (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.shiftKey ? this.canvas.redo() : this.canvas.undo();
    });
  }

  // ─── Character assignment picker (ASSIGN button) ─────────────────────────
  // Assign the currently open sheet to a cast member's human or afflicted
  // slot in characters.json. The game reflects it on next full reload.

  private toggleAssignPicker(): void {
    if (this.assignContainer) {
      this.closeAssignPicker();
      return;
    }
    if (!this.currentSheet) {
      this.statusText.setText('no sheet loaded');
      return;
    }

    const rows: { id: string; field: 'sheet' | 'afflictedSheet'; label: string }[] = [];
    for (const [id, def] of Object.entries(allCharacters())) {
      rows.push({ id, field: 'sheet', label: `${def.name} (${id}) — human` });
      if (id !== 'player') {
        rows.push({ id, field: 'afflictedSheet', label: `${def.name} (${id}) — afflicted` });
      }
    }

    const W = 640;
    const rowH = 34;
    const H = 104 + rows.length * rowH;
    const c = this.add.container(
      GAME_CONFIG.WIDTH / 2 - W / 2,
      GAME_CONFIG.HEIGHT / 2 - H / 2,
    ).setDepth(2000);

    const bg = this.add.rectangle(0, 0, W, H, 0x0d0d18, 0.96)
      .setOrigin(0, 0).setStrokeStyle(2, 0x4499ff);
    bg.setInteractive(); // swallow clicks under the panel
    c.add(bg);
    c.add(this.add.text(W / 2, 14, `ASSIGN  ${this.currentSheet}  →`, {
      fontSize: '20px', color: '#aaccff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0));
    c.add(this.add.text(W / 2, 42, 'click a slot — writes characters.json; reload the game to see it', {
      fontSize: '14px', color: '#667799', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));

    rows.forEach((row, i) => {
      const y = 74 + i * rowH;
      const current = allCharacters()[row.id]?.[row.field];
      const already = current === this.currentSheet;
      const rowBg = this.add.rectangle(12, y, W - 24, rowH - 6, 0x1a1a2e, 1)
        .setOrigin(0, 0).setStrokeStyle(1, 0x333355);
      rowBg.setInteractive({ useHandCursor: true });
      rowBg.on('pointerover', () => rowBg.setFillStyle(0x24365a, 1));
      rowBg.on('pointerout', () => rowBg.setFillStyle(0x1a1a2e, 1));
      rowBg.on('pointerdown', () => void this.assignSheet(row.id, row.field));
      c.add(rowBg);
      c.add(this.add.text(24, y + 5, row.label, {
        fontSize: '18px', color: already ? '#88dd88' : '#ccccdd', fontFamily: 'monospace',
      }));
      c.add(this.add.text(W - 24, y + 8, already ? '● current' : (current ?? '—'), {
        fontSize: '14px', color: already ? '#88dd88' : '#556677', fontFamily: 'monospace',
      }).setOrigin(1, 0));
    });

    c.add(this.add.text(W / 2, H - 28, 'ESC — close', {
      fontSize: '14px', color: '#556677', fontFamily: 'monospace',
    }).setOrigin(0.5, 0));
    this.assignContainer = c;
  }

  private closeAssignPicker(): void {
    this.assignContainer?.destroy();
    this.assignContainer = undefined;
  }

  private async assignSheet(id: string, field: 'sheet' | 'afflictedSheet'): Promise<void> {
    if (!import.meta.env.DEV) {
      this.statusText.setText('assignment only available in dev mode');
      return;
    }
    try {
      const resp = await fetch('/__editor/save-character', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, field, value: this.currentSheet }),
      });
      if (resp.ok) {
        applySheetAssignment(id, field, this.currentSheet);
        this.statusText.setText(`assigned ${this.currentSheet} → ${id} (${field}) ✓  reload the game to see it`);
        this.closeAssignPicker();
      } else {
        const err = await resp.json().catch(() => ({} as { error?: string }));
        this.statusText.setText(`assign failed: ${(err as { error?: string }).error ?? resp.status}`);
      }
    } catch (e) {
      this.statusText.setText(`assign failed: ${String(e)}`);
    }
  }

  update(_time: number, delta: number): void {
    if (!this.previewSprite) return;

    // Coalesce re-shades: a slider drag or a paint stroke can dirty this many
    // times per frame, and a full-sheet shade is far too heavy to run per event.
    if (this.liveShading && this.shadePreviewDirty) {
      this.shadePreviewTimer += delta;
      if (this.shadePreviewTimer >= 120) {
        this.shadePreviewTimer = 0;
        this.shadePreviewDirty = false;
        this.refreshShadedPreview();
      }
    }

    if (this.previewPaused) return; // locked to the selected frame — no auto/drive

    const p = this.input.activePointer;
    const inPane = !this.canvas.drawing &&
      p.x >= PREV_X && p.x < PREV_X + PREV_W &&
      p.y >= PREV_Y && p.y < PREV_Y + PREV_H;

    if (inPane && !this.pointerIn) {
      // enter drive mode
      this.pinnedDir = null;
      this.previewHint.setVisible(true);
      this.drawPreviewBorder(true);
    } else if (!inPane && this.pointerIn) {
      // leave drive mode
      this.previewHint.setVisible(false);
      this.drawPreviewBorder(false);
    }
    this.pointerIn = inPane;

    if (inPane) {
      this.drivePreview();
      this.previewLabel.setText(`drive — ${this.previewDir}`);
    } else {
      this.dirTimer += delta;
      if (this.dirTimer > AUTO_CYCLE_MS) {
        this.dirTimer = 0;
        this.autoDirIdx = (this.autoDirIdx + 1) % DIRS.length;
      }
      const dir = this.pinnedDir ?? DIRS[this.autoDirIdx];
      this.previewDir = dir;
      this.previewSprite.play(`spriteedit-walk-${dir}`, true);
      this.previewLabel.setText(`${this.pinnedDir ? 'pinned' : 'auto'} — ${dir}`);
    }
  }

  /** Sprite stays centred in the pane; WASD only picks the facing + walk/idle anim. */
  private drivePreview(): void {
    const k = this.keys;
    let vx = 0;
    let vy = 0;
    if (k.A?.isDown || k.LEFT?.isDown)  vx -= 1;
    if (k.D?.isDown || k.RIGHT?.isDown) vx += 1;
    if (k.W?.isDown || k.UP?.isDown)    vy -= 1;
    if (k.S?.isDown || k.DOWN?.isDown)  vy += 1;

    const s = this.previewSprite;
    if (vx !== 0 || vy !== 0) {
      // same facing rule as Player.update(): vertical wins ties
      if (Math.abs(vy) >= Math.abs(vx)) {
        this.previewDir = vy < 0 ? 'up' : 'down';
      } else {
        this.previewDir = vx < 0 ? 'left' : 'right';
      }
      s.play(`spriteedit-walk-${this.previewDir}`, true);
    } else {
      s.play(`spriteedit-idle-${this.previewDir}`, true);
    }
  }

  // ─── Tool / utility buttons ────────────────────────────────────────────────

  private buildToolButtons(): void {
    const BW = 64, BH = 28;
    this.add.text(DRAW_X, TOOLS_Y - 20, 'TOOL', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    const tools: { tool: PixelTool; label: string }[] = [
      { tool: 'pencil',     label: 'PEN' },
      { tool: 'eraser',     label: 'ERA' },
      { tool: 'eyedropper', label: 'EYE' },
      { tool: 'fill',       label: 'FILL' },
      { tool: 'blur',       label: 'BLUR' },
      { tool: 'select',     label: 'SEL' },
    ];

    tools.forEach(({ tool, label }, i) => {
      const bx = DRAW_X + i * (BW + 8);
      const g = this.add.graphics();
      this.btn.draw(g, bx, TOOLS_Y, BW, BH, tool === this.canvas.tool);
      this.add.text(bx + BW / 2, TOOLS_Y + BH / 2, label, {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      this.btn.bind(g, bx, TOOLS_Y, BW, BH, () => {
        if (this.canvas.tool === 'select' && tool !== 'select') this.canvas.stampFloating();
        this.canvas.tool = tool;
        this.refreshToolButtons();
      });
      this.toolBtns.push({ gfx: g, x: bx, y: TOOLS_Y, w: BW, h: BH, tool });
    });

    // Pen size buttons
    const SBW = 36, SBH = 28, SGAP = 6;
    const sizeStartX = DRAW_X + tools.length * (BW + 8) + 24;
    this.add.text(sizeStartX, TOOLS_Y - 20, 'SIZE', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });
    [1, 2, 3, 4].forEach((size, i) => {
      const bx = sizeStartX + i * (SBW + SGAP);
      const g = this.add.graphics();
      this.btn.draw(g, bx, TOOLS_Y, SBW, SBH, size === this.canvas.penSize);
      this.add.text(bx + SBW / 2, TOOLS_Y + SBH / 2, String(size), {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      this.btn.bind(g, bx, TOOLS_Y, SBW, SBH, () => {
        this.canvas.penSize = size;
        this.sizeBtns.forEach(b => this.btn.draw(b.gfx, b.x, b.y, b.w, b.h, b.size === this.canvas.penSize));
      });
      this.sizeBtns.push({ gfx: g, x: bx, y: TOOLS_Y, w: SBW, h: SBH, size });
    });

    const styleY = STYLE_Y;
    const STW = 66, STG = 6;
    const styles: { style: PenStyle; label: string }[] = [
      { style: 'classic', label: 'CLASS' },
      { style: 'feltTip', label: 'FELT' },
      { style: 'pencil', label: 'PENCIL' },
      { style: 'marker', label: 'MARK' },
      { style: 'spraypaint', label: 'SPRAY' },
    ];
    const styleStartX = DRAW_X + Math.max(0, Math.floor((DRAW_SIZE - (styles.length * STW + (styles.length - 1) * STG)) / 2));
    this.add.text(styleStartX, styleY - 20, 'STYLE', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });
    styles.forEach(({ style, label }, i) => {
      const bx = styleStartX + i * (STW + STG);
      const g = this.add.graphics();
      this.btn.draw(g, bx, styleY, STW, BH, style === this.canvas.penStyle);
      this.add.text(bx + STW / 2, styleY + BH / 2, label, {
        fontSize: '14px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      this.btn.bind(g, bx, styleY, STW, BH, () => {
        this.canvas.penStyle = style;
        this.refreshStyleButtons();
        this.statusText.setText(`style: ${label.toLowerCase()}`);
      });
      this.styleBtns.push({ gfx: g, x: bx, y: styleY, w: STW, h: BH, style });
    });
  }

  private refreshStyleButtons(): void {
    this.styleBtns.forEach(b => this.btn.draw(b.gfx, b.x, b.y, b.w, b.h, b.style === this.canvas.penStyle));
  }

  private buildUtilButtons(): void {
    // 8 buttons of 74+6 = 640px — exactly the draw-area width
    const BW = 74, BH = 30, GAP = 6;
    const bx = (i: number): number => DRAW_X + i * (BW + GAP);

    const LBW = 50;
    const LGAP = 6;
    const leftBlockX = LABEL_X;
    const leftMirrorY = GRID_Y + CELL * 4 + 56;   // clears the frame label above
    const leftNudgeY = leftMirrorY + 52;

    this.add.text(leftBlockX, leftMirrorY - 20, 'TRANSFORM', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });

    this.btn.make('CLEAR', leftBlockX, leftMirrorY, BW, BH, 0x6e1c1c, () => {
      this.canvas.clearSelection();
      this.canvas.pushHistory();
      this.canvas.pixels.fill(0);
      this.canvas.redraw();
      this.syncFrameToTexture();
      this.statusText.setText('frame cleared');
    });

    this.btn.make('COPY', bx(0), UTILS_Y, BW, BH, 0x1c3c6e, () => {
      const region = this.canvas.copyRegion();
      if (region) {
        this.clipboard = { kind: 'region', clip: region };
        this.statusText.setText(`copied ${region.w}×${region.h} region`);
      } else {
        this.clipboard = { kind: 'frame', pixels: this.canvas.pixels.slice() };
        this.statusText.setText(`copied frame ${this.selectedFrame}`);
      }
    });
    this.btn.make('PASTE', bx(1), UTILS_Y, BW, BH, 0x1c3c6e, () => this.pasteClipboard(false));
    this.btn.make('PASTE⇄', bx(2), UTILS_Y, BW, BH, 0x1c3c6e, () => this.pasteClipboard(true));
    this.btn.make('FLIP', bx(3), UTILS_Y, BW, BH, 0x1c3c6e, () => this.flipFrameHorizontal());
    const mx = leftBlockX + BW + GAP;
    this.mirrorBtnGfx = this.add.graphics();
    this.btn.draw(this.mirrorBtnGfx, mx, leftMirrorY, BW, BH, this.canvas.mirrorX);
    this.add.text(mx + BW / 2, leftMirrorY + BH / 2, 'MIRROR', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.btn.bind(this.mirrorBtnGfx, mx, leftMirrorY, BW, BH, () => {
      this.canvas.mirrorX = !this.canvas.mirrorX;
      this.btn.draw(this.mirrorBtnGfx, mx, leftMirrorY, BW, BH, this.canvas.mirrorX);
      this.statusText.setText(`mirror ${this.canvas.mirrorX ? 'on' : 'off'}`);
    });

    // Region cut — pairs with the SEL tool; COPY/PASTE are selection-aware
    this.btn.make('CUT', mx + BW + GAP, leftMirrorY, BW, BH, 0x6e4c1c, () => {
      const clip = this.canvas.cutRegion();
      if (!clip) {
        this.statusText.setText('no selection — use the SEL tool first');
        return;
      }
      this.clipboard = { kind: 'region', clip };
      this.statusText.setText(`cut ${clip.w}×${clip.h} region`);
    });

    this.add.text(leftBlockX, leftNudgeY - 18, 'NUDGE', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });
    this.btn.make('←', leftBlockX + (LBW + LGAP) * 0, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(-1, 0));
    this.btn.make('↑', leftBlockX + (LBW + LGAP) * 1, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(0, -1));
    this.btn.make('↓', leftBlockX + (LBW + LGAP) * 2, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(0, 1));
    this.btn.make('→', leftBlockX + (LBW + LGAP) * 3, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(1, 0));

    // Character assignment — give the open sheet to a cast member (characters.json)
    const leftAssignY = leftNudgeY + 52;
    this.add.text(leftBlockX, leftAssignY - 18, 'CHARACTER', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });
    this.btn.make('ASSIGN', leftBlockX, leftAssignY, BW, BH, 0x3c2a6e, () => this.toggleAssignPicker());

    // Sheet creation — a blank sheet, or fork the open sheet under a new name
    const leftSheetY = leftAssignY + 52;
    this.add.text(leftBlockX, leftSheetY - 18, 'SHEET', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });
    this.btn.make('NEW', leftBlockX, leftSheetY, BW, BH, 0x1c5c3c, () => void this.createSheet(false));
    this.btn.make('DUPE', leftBlockX + BW + GAP, leftSheetY, BW, BH, 0x1c5c3c, () => void this.createSheet(true));

    // Bake the key light into a sibling <sheet>-shaded.png, using whatever the
    // sliders below are set to. Reads what's on disk, so unsaved edits aren't
    // included — hence the save-first guard in createShadedVersion().
    const leftShadeY = leftSheetY + 52;
    this.add.text(leftBlockX, leftShadeY - 18, 'SHADING', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });
    this.btn.make('SHADE', leftBlockX, leftShadeY, BW * 2 + GAP, BH, 0x6e4c1c,
      () => void this.createShadedVersion());
    this.buildShadingPanel(leftBlockX, leftShadeY, BW, BH, GAP);

    this.btn.make('UNDO', bx(4), UTILS_Y, BW, BH, 0x2f4f5f, () => this.canvas.undo());
    this.btn.make('REDO', bx(5), UTILS_Y, BW, BH, 0x2f4f5f, () => this.canvas.redo());
    this.saveBtnTint = this.btn.make('SAVE', bx(6), UTILS_Y, BW, BH, 0x1c3c6e, () => this.saveSheet());

    // Onion toggle
    const ox = bx(7);
    this.onionBtnGfx = this.add.graphics();
    this.btn.draw(this.onionBtnGfx, ox, UTILS_Y, BW, BH, this.onionOn);
    this.add.text(ox + BW / 2, UTILS_Y + BH / 2, 'ONION', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.btn.bind(this.onionBtnGfx, ox, UTILS_Y, BW, BH, () => {
      this.onionOn = !this.onionOn;
      this.btn.draw(this.onionBtnGfx, ox, UTILS_Y, BW, BH, this.onionOn);
      this.canvas.redraw();
      this.statusText.setText(`onion skin ${this.onionOn ? 'on' : 'off'}`);
    });
  }

  private pasteClipboard(flipped: boolean): void {
    if (!this.clipboard) { this.statusText.setText('clipboard empty'); return; }

    // Region paste: floats at its original coordinates, selected for nudging.
    if (this.clipboard.kind === 'region') {
      const src = this.clipboard.clip;
      let clip = src;
      if (flipped) {
        const pixels = new Uint32Array(src.w * src.h);
        for (let j = 0; j < src.h; j++) {
          for (let i = 0; i < src.w; i++) {
            pixels[j * src.w + i] = src.pixels[j * src.w + (src.w - 1 - i)];
          }
        }
        clip = { ...src, pixels };
      }
      this.canvas.tool = 'select';
      this.refreshToolButtons();
      this.canvas.pasteRegion(clip);
      return;
    }

    const framePixels = this.clipboard.pixels;
    this.canvas.stampFloating();
    this.canvas.pushHistory();
    if (flipped) {
      for (let y = 0; y < FRAME; y++) {
        for (let x = 0; x < FRAME; x++) {
          this.canvas.pixels[y * FRAME + x] = framePixels[y * FRAME + (FRAME - 1 - x)];
        }
      }
    } else {
      this.canvas.pixels.set(framePixels);
    }
    this.canvas.redraw();
    this.syncFrameToTexture();
    this.statusText.setText(`pasted${flipped ? ' flipped' : ''} onto frame ${this.selectedFrame}`);
  }

  private nudgeFrame(dx: number, dy: number): void {
    if (this.canvas.nudgeSelection(dx, dy)) {
      const r = this.canvas.getSelectionRect();
      if (r) this.statusText.setText(`selection at (${r.x},${r.y}) — click away to stamp`);
      return;
    }
    this.canvas.pushHistory();
    const next = this.canvas.pixels.slice();
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        const sx = (x - dx + FRAME) % FRAME;
        const sy = (y - dy + FRAME) % FRAME;
        next[y * FRAME + x] = this.canvas.pixels[sy * FRAME + sx];
      }
    }
    this.canvas.pixels.set(next);
    this.canvas.redraw();
    this.syncFrameToTexture();
    this.statusText.setText(`nudged ${dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'}`);
  }

  private flipFrameHorizontal(): void {
    this.canvas.stampFloating();
    this.canvas.pushHistory();
    const next = this.canvas.pixels.slice();
    for (let y = 0; y < FRAME; y++) {
      for (let x = 0; x < FRAME; x++) {
        next[y * FRAME + x] = this.canvas.pixels[y * FRAME + (FRAME - 1 - x)];
      }
    }
    this.canvas.pixels.set(next);
    this.canvas.redraw();
    this.syncFrameToTexture();
    this.statusText.setText('frame flipped horizontally');
  }

  private buildFocusButton(): void {
    const x = DRAW_X + DRAW_SIZE + 8;
    const y = DRAW_Y + 4;
    const w = 24;
    const h = 24;
    this.focusBtnGfx = this.add.graphics();
    this.btn.draw(this.focusBtnGfx, x, y, w, h, false);
    this.focusBtnText = this.add.text(x + w / 2, y + h / 2, '»', {
      fontSize: '16px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(DEFAULT_UI_DEPTH);
    this.focusBtnGfx.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    this.focusBtnGfx.input!.cursor = 'pointer';
    this.focusBtnGfx.on('pointerdown', () => this.toggleFocusMode());
    this.focusBtnText.setInteractive({ useHandCursor: true });
    this.focusBtnText.on('pointerdown', () => this.toggleFocusMode());
    this.focusBtnGfx.setDepth(DEFAULT_UI_DEPTH);
  }

  private toggleFocusMode(): void {
    const canvasGraphics = this.canvas.getGraphicsObject();
    if (!this.focusMode) {
      this.focusMode = true;
      this.savedCanvasView = this.canvas.getView();

      const focusX = LABEL_X;
      const focusY = 56;
      const focusPad = 12;
      // height capped above the utils row so its buttons stay usable
      const maxScale = Math.max(1, Math.floor(Math.min(
        (GAME_CONFIG.WIDTH - focusX - focusPad) / FRAME,
        (UTILS_Y - focusPad - focusY) / FRAME,
      )));
      if (this.dropdownEl) this.overlay.setVisible(this.dropdownEl, false);
      const size = FRAME * maxScale;
      this.canvas.setView({
        x: focusX,
        y: focusY,
        scale: maxScale,
        containerX: focusX,
        containerY: focusY,
        containerSize: size,
      });
      this.savedCanvasDepth = canvasGraphics.depth;
      canvasGraphics.setDepth(FOCUS_CANVAS_DEPTH);
      canvasGraphics.setInteractive(new Phaser.Geom.Rectangle(focusX, focusY, size, size), Phaser.Geom.Rectangle.Contains);
      this.btn.draw(this.focusBtnGfx, focusX + size + 8, focusY + 4, 24, 24, true);
      this.focusBtnGfx.setInteractive(new Phaser.Geom.Rectangle(focusX + size + 8, focusY + 4, 24, 24), Phaser.Geom.Rectangle.Contains);
      this.focusBtnGfx.input!.cursor = 'pointer';
      this.focusBtnGfx.setDepth(FOCUS_BUTTON_DEPTH);
      this.focusBtnText.setDepth(FOCUS_BUTTON_DEPTH);
      this.focusBtnText.setPosition(focusX + size + 20, focusY + 16).setText('«');
      this.statusText?.setText(`focus mode on (${maxScale}x)`);
      return;
    }

    this.focusMode = false;
    if (this.dropdownEl) this.overlay.setVisible(this.dropdownEl, true);
    if (this.savedCanvasView) {
      this.canvas.setView(this.savedCanvasView);
      this.savedCanvasView = undefined;
    }
    canvasGraphics.disableInteractive();
    canvasGraphics.setDepth(this.savedCanvasDepth ?? 0);
    this.savedCanvasDepth = undefined;
    this.btn.draw(this.focusBtnGfx, DRAW_X + DRAW_SIZE + 8, DRAW_Y + 4, 24, 24, false);
    this.focusBtnGfx.setInteractive(new Phaser.Geom.Rectangle(DRAW_X + DRAW_SIZE + 8, DRAW_Y + 4, 24, 24), Phaser.Geom.Rectangle.Contains);
    this.focusBtnGfx.input!.cursor = 'pointer';
    this.focusBtnGfx.setDepth(DEFAULT_UI_DEPTH);
    this.focusBtnText.setDepth(DEFAULT_UI_DEPTH);
    this.focusBtnText.setPosition(DRAW_X + DRAW_SIZE + 20, DRAW_Y + 16).setText('»');
    this.statusText?.setText('focus mode off');
  }

  private refreshToolButtons(): void {
    this.toolBtns.forEach(b => this.btn.draw(b.gfx, b.x, b.y, b.w, b.h, b.tool === this.canvas.tool));
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  private saveSheet(): void {
    // Commit any floating region so what's saved is what's on screen
    this.canvas.stampFloating();
    if (!import.meta.env.DEV) {
      this.statusText.setText('save only available in dev mode');
      return;
    }
    if (!this.currentSheet) {
      this.statusText.setText('no sheet loaded');
      return;
    }

    this.statusText.setText('saving…');

    this.workTex.canvas.toBlob(async (blob) => {
      if (!blob) { this.statusText.setText('blob conversion failed'); return; }
      try {
        const buf = await blob.arrayBuffer();
        const resp = await fetch(`/__editor/save-sprite?sheet=${encodeURIComponent(this.currentSheet)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: buf,
        });
        if (resp.ok) {
          this.setDirty(false);
          this.statusText.setText(`saved ${this.currentSheet}.png ✓  (reload page to see in-game)`);
        } else {
          this.statusText.setText(`save failed: ${resp.status}`);
        }
      } catch (e: unknown) {
        this.statusText.setText(`save error: ${(e as Error).message ?? e}`);
      }
    }, 'image/png');
  }
}
