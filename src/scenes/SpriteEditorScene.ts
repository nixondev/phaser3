import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, PLAYER_CONFIG } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { HtmlOverlay } from '@/editor/htmlOverlay';
import { ColorPanel } from '@/editor/ColorPanel';
import { PixelCanvas, PixelCanvasView, PixelTool, PenStyle } from '@/editor/PixelCanvas';

const FRAME     = 64;    // frame size in px
const SHEET_PX  = 256;   // sheet is 256×256
const SHEET_COLS = 4;
const SHEET_FRAMES = 16;

const WORK_KEY = 'spriteedit-work';
const SRC_KEY  = 'spriteedit-src';

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

const FALLBACK_SHEETS = [
  'player',
  ...['warden', 'ranger', 'rogue', 'mystic', 'drifter', 'scavenger', 'ashwalker'].map(v => `player-${v}`),
  ...['walker', 'bloater', 'crawler', 'husk', 'spitter', 'brute', 'ashrot', 'veinhost'].map(v => `afflicted-${v}`),
];

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
  private clipboard: Uint32Array | null = null;
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

  // preview state
  private previewSprite!: Phaser.GameObjects.Sprite;
  private previewBorder!: Phaser.GameObjects.Graphics;
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
    DIRS.forEach((dir, row) => {
      const start = row * 4;
      const walkKey = `spriteedit-walk-${dir}`;
      const idleKey = `spriteedit-idle-${dir}`;
      this.anims.remove(walkKey);
      this.anims.create({
        key: walkKey,
        frames: [0, 1, 2, 3].map(i => ({ key: WORK_KEY, frame: start + i })),
        frameRate: fps,
        repeat: -1,
      });
      if (!this.anims.exists(idleKey)) {
        this.anims.create({
          key: idleKey,
          frames: [{ key: WORK_KEY, frame: start }],
          frameRate: 1,
          repeat: -1,
        });
      }
    });
  }

  private setFps(fps: number): void {
    this.fps = Phaser.Math.Clamp(fps, 2, 16);
    this.fpsLabel.setText(`fps ${this.fps}`);
    this.previewSprite.anims.stop();
    this.buildAnims(this.fps);
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
            .sort();
        }
      } catch { /* dev server endpoint unavailable — fall through */ }
    }
    if (names.length === 0) names = FALLBACK_SHEETS.filter(n => this.textures.exists(n));

    this.buildSheetDropdown(names);

    const initial = names.includes('player') ? 'player' : names[0];
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

    el.addEventListener('change', () => this.trySelectSheet(el.value));
    el.addEventListener('keydown', (e) => e.stopPropagation());

    this.overlay.add(el, LABEL_X, 56, GRID_X - LABEL_X + SHEET_COLS * CELL - 4, 18);
    this.dropdownEl = el;
  }

  private trySelectSheet(name: string): void {
    if (name === this.currentSheet) return;
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
    this.dirty = false;
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
    this.dirty = true;
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

    const bg = this.add.graphics();
    bg.fillStyle(0x181828, 1);
    bg.fillRect(PREV_X, PREV_Y, PREV_W, PREV_H);

    this.previewBorder = this.add.graphics();
    this.drawPreviewBorder(false);

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
    this.makeBtn('−', PREV_X + 190, FY, 24, 24, 0x1c3c6e, () => this.setFps(this.fps - 1));
    this.fpsLabel = this.add.text(PREV_X + 224, FY + 12, `fps ${this.fps}`, {
      fontSize: '16px', color: '#88aacc', fontFamily: 'monospace',
    }).setOrigin(0, 0.5);
    this.makeBtn('+', PREV_X + 296, FY, 24, 24, 0x1c3c6e, () => this.setFps(this.fps + 1));
  }

  private drawPreviewBorder(active: boolean): void {
    const g = this.previewBorder;
    g.clear();
    g.lineStyle(active ? 2 : 1, active ? 0x4499ff : 0x446644, 1);
    g.strokeRect(PREV_X, PREV_Y, PREV_W, PREV_H);
  }

  private setupKeyboard(): void {
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENES.MENU));
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

  update(_time: number, delta: number): void {
    if (!this.previewSprite) return;

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
    ];

    tools.forEach(({ tool, label }, i) => {
      const bx = DRAW_X + i * (BW + 8);
      const g = this.add.graphics();
      this.drawBtn(g, bx, TOOLS_Y, BW, BH, tool === this.canvas.tool);
      this.add.text(bx + BW / 2, TOOLS_Y + BH / 2, label, {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, TOOLS_Y, BW, BH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => {
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
      this.drawBtn(g, bx, TOOLS_Y, SBW, SBH, size === this.canvas.penSize);
      this.add.text(bx + SBW / 2, TOOLS_Y + SBH / 2, String(size), {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, TOOLS_Y, SBW, SBH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => {
        this.canvas.penSize = size;
        this.sizeBtns.forEach(b => this.drawBtn(b.gfx, b.x, b.y, b.w, b.h, b.size === this.canvas.penSize));
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
      this.drawBtn(g, bx, styleY, STW, BH, style === this.canvas.penStyle);
      this.add.text(bx + STW / 2, styleY + BH / 2, label, {
        fontSize: '14px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      g.setInteractive(new Phaser.Geom.Rectangle(bx, styleY, STW, BH), Phaser.Geom.Rectangle.Contains);
      g.on('pointerdown', () => {
        this.canvas.penStyle = style;
        this.refreshStyleButtons();
        this.statusText.setText(`style: ${label.toLowerCase()}`);
      });
      this.styleBtns.push({ gfx: g, x: bx, y: styleY, w: STW, h: BH, style });
    });
  }

  private refreshStyleButtons(): void {
    this.styleBtns.forEach(b => this.drawBtn(b.gfx, b.x, b.y, b.w, b.h, b.style === this.canvas.penStyle));
  }

  private buildUtilButtons(): void {
    const BW = 84, BH = 30, GAP = 8;
    const bx = (i: number): number => DRAW_X + i * (BW + GAP);

    const LBW = 50;
    const LGAP = 6;
    const leftBlockX = LABEL_X;
    const leftMirrorY = GRID_Y + CELL * 4 + 34;
    const leftNudgeY = leftMirrorY + 52;

    this.add.text(leftBlockX, leftMirrorY - 20, 'TRANSFORM', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });

    this.makeBtn('CLEAR', leftBlockX, leftMirrorY, BW, BH, 0x6e1c1c, () => {
      this.canvas.pushHistory();
      this.canvas.pixels.fill(0);
      this.canvas.redraw();
      this.syncFrameToTexture();
      this.statusText.setText('frame cleared');
    });

    this.makeBtn('COPY', bx(0), UTILS_Y, BW, BH, 0x1c3c6e, () => {
      this.clipboard = this.canvas.pixels.slice();
      this.statusText.setText(`copied frame ${this.selectedFrame}`);
    });
    this.makeBtn('PASTE', bx(1), UTILS_Y, BW, BH, 0x1c3c6e, () => {
      if (!this.clipboard) { this.statusText.setText('clipboard empty'); return; }
      this.canvas.pushHistory();
      this.canvas.pixels.set(this.clipboard);
      this.canvas.redraw();
      this.syncFrameToTexture();
      this.statusText.setText(`pasted onto frame ${this.selectedFrame}`);
    });
    this.makeBtn('FLIP', bx(2), UTILS_Y, BW, BH, 0x1c3c6e, () => this.flipFrameHorizontal());
    const mx = leftBlockX + BW + GAP;
    this.mirrorBtnGfx = this.add.graphics();
    this.drawBtn(this.mirrorBtnGfx, mx, leftMirrorY, BW, BH, this.canvas.mirrorX);
    this.add.text(mx + BW / 2, leftMirrorY + BH / 2, 'MIRROR', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.mirrorBtnGfx.setInteractive(new Phaser.Geom.Rectangle(mx, leftMirrorY, BW, BH), Phaser.Geom.Rectangle.Contains);
    this.mirrorBtnGfx.on('pointerdown', () => {
      this.canvas.mirrorX = !this.canvas.mirrorX;
      this.drawBtn(this.mirrorBtnGfx, mx, leftMirrorY, BW, BH, this.canvas.mirrorX);
      this.statusText.setText(`mirror ${this.canvas.mirrorX ? 'on' : 'off'}`);
    });

    this.add.text(leftBlockX, leftNudgeY - 18, 'NUDGE', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });
    this.makeBtn('←', leftBlockX + (LBW + LGAP) * 0, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(-1, 0));
    this.makeBtn('↑', leftBlockX + (LBW + LGAP) * 1, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(0, -1));
    this.makeBtn('↓', leftBlockX + (LBW + LGAP) * 2, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(0, 1));
    this.makeBtn('→', leftBlockX + (LBW + LGAP) * 3, leftNudgeY, LBW, BH, 0x2f4f5f, () => this.nudgeFrame(1, 0));

    // Onion toggle
    const ox = bx(6);
    this.onionBtnGfx = this.add.graphics();
    this.drawBtn(this.onionBtnGfx, ox, UTILS_Y, BW, BH, this.onionOn);
    this.add.text(ox + BW / 2, UTILS_Y + BH / 2, 'ONION', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.onionBtnGfx.setInteractive(new Phaser.Geom.Rectangle(ox, UTILS_Y, BW, BH), Phaser.Geom.Rectangle.Contains);
    this.onionBtnGfx.on('pointerdown', () => {
      this.onionOn = !this.onionOn;
      this.drawBtn(this.onionBtnGfx, ox, UTILS_Y, BW, BH, this.onionOn);
      this.canvas.redraw();
      this.statusText.setText(`onion skin ${this.onionOn ? 'on' : 'off'}`);
    });

    this.makeBtn('UNDO', bx(3), UTILS_Y, BW, BH, 0x2f4f5f, () => {
      this.canvas.undo();
      this.syncFrameToTexture();
    });
    this.makeBtn('REDO', bx(4), UTILS_Y, BW, BH, 0x2f4f5f, () => {
      this.canvas.redo();
      this.syncFrameToTexture();
    });
    this.makeBtn('SAVE', bx(5), UTILS_Y, BW, BH, 0x1c3c6e, () => this.saveSheet());
  }

  private nudgeFrame(dx: number, dy: number): void {
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
    this.drawBtn(this.focusBtnGfx, x, y, w, h, false);
    this.focusBtnText = this.add.text(x + w / 2, y + h / 2, '»', {
      fontSize: '16px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(DEFAULT_UI_DEPTH);
    this.focusBtnGfx.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
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
      const maxScale = Math.max(1, Math.floor(Math.min(
        (GAME_CONFIG.WIDTH - focusX - focusPad) / FRAME,
        (GAME_CONFIG.HEIGHT - focusY - focusPad) / FRAME,
      )));
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
      this.drawBtn(this.focusBtnGfx, focusX + size + 8, focusY + 4, 24, 24, true);
      this.focusBtnGfx.setInteractive(new Phaser.Geom.Rectangle(focusX + size + 8, focusY + 4, 24, 24), Phaser.Geom.Rectangle.Contains);
      this.focusBtnGfx.setDepth(FOCUS_BUTTON_DEPTH);
      this.focusBtnText.setDepth(FOCUS_BUTTON_DEPTH);
      this.focusBtnText.setPosition(focusX + size + 20, focusY + 16).setText('«');
      this.statusText?.setText(`focus mode on (${maxScale}x)`);
      return;
    }

    this.focusMode = false;
    if (this.savedCanvasView) {
      this.canvas.setView(this.savedCanvasView);
      this.savedCanvasView = undefined;
    }
    canvasGraphics.disableInteractive();
    canvasGraphics.setDepth(this.savedCanvasDepth ?? 0);
    this.savedCanvasDepth = undefined;
    this.drawBtn(this.focusBtnGfx, DRAW_X + DRAW_SIZE + 8, DRAW_Y + 4, 24, 24, false);
    this.focusBtnGfx.setInteractive(new Phaser.Geom.Rectangle(DRAW_X + DRAW_SIZE + 8, DRAW_Y + 4, 24, 24), Phaser.Geom.Rectangle.Contains);
    this.focusBtnGfx.setDepth(DEFAULT_UI_DEPTH);
    this.focusBtnText.setDepth(DEFAULT_UI_DEPTH);
    this.focusBtnText.setPosition(DRAW_X + DRAW_SIZE + 20, DRAW_Y + 16).setText('»');
    this.statusText?.setText('focus mode off');
  }

  private refreshToolButtons(): void {
    this.toolBtns.forEach(b => this.drawBtn(b.gfx, b.x, b.y, b.w, b.h, b.tool === this.canvas.tool));
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

  // ─── Save ──────────────────────────────────────────────────────────────────

  private saveSheet(): void {
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
          this.dirty = false;
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
