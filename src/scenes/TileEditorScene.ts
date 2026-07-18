import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';
import { RoomManager } from '@systems/RoomManager';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { HtmlOverlay } from '@/editor/htmlOverlay';
import { ColorPanel } from '@/editor/ColorPanel';
import { EditorButtons } from '@/editor/EditorButtons';
import { PixelCanvas, PixelTool, PenStyle } from '@/editor/PixelCanvas';

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

interface BtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  tool: PixelTool;
}

interface SizeBtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  size: number;
}

interface StyleBtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  style: PenStyle;
}

export class TileEditorScene extends Phaser.Scene {
  private canvas!: PixelCanvas;
  private panel!: ColorPanel;
  private overlay!: HtmlOverlay;

  private selectedFrame = 0;
  private pickerScroll = 0;
  private clipboard: Uint32Array | null = null;

  private previewGfx!: Phaser.GameObjects.Graphics;
  private pickerGfx!: Phaser.GameObjects.Graphics;

  private toolBtns: BtnEntry[] = [];
  private sizeBtns: SizeBtnEntry[] = [];
  private styleBtns: StyleBtnEntry[] = [];
  private pickerSprites: Phaser.GameObjects.Image[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private frameLabel!: Phaser.GameObjects.Text;
  private wrapBtn!: { gfx: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number };

  private activeTileset = 'tileset';
  private tilesetNames: string[] = [];

  private btn!: EditorButtons;
  private dirty = false;
  private dirtyMark!: Phaser.GameObjects.Text;
  private saveBtnTint?: (col?: number) => void;
  private pendingFrame: number | null = null;
  private pendingFrameAt = 0;
  private pendingTileset?: string;
  private pendingTilesetAt = 0;
  private pendingExitAt = 0;

  constructor() {
    super(SCENES.TILE_EDITOR);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().stopMusic();
    MusicManager.getInstance().stop();

    this.overlay = new HtmlOverlay(this);
    this.btn = new EditorButtons(this);

    this.add.rectangle(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT, 0x12121f).setOrigin(0, 0);
    this.add.text(GAME_CONFIG.WIDTH / 2, 16, 'TILE EDITOR', {
      fontSize: '28px', color: '#aaccff', fontFamily: 'monospace', fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.add.text(GAME_CONFIG.WIDTH - 12, 16, 'ESC — back', {
      fontSize: '18px', color: '#446688', fontFamily: 'monospace',
    }).setOrigin(1, 0);

    this.canvas = new PixelCanvas({
      scene: this,
      size: TILE,
      x: DRAW_X,
      y: DRAW_Y,
      scale: DRAW_SCALE,
      wrapBrush: true,
      getColor: () => this.panel.color,
      onEyedrop: (argb) => this.panel.setColor(argb, true),
      onChange: () => {
        this.redrawPreview();
        this.setDirty(true);
      },
      onToolChange: () => this.refreshToolButtons(),
      onStatus: (msg) => this.statusText?.setText(msg),
    });
    this.previewGfx = this.add.graphics();
    this.pickerGfx  = this.add.graphics();

    this.add.text(PREV_X, PREV_Y - 20, 'WRAP PREVIEW', {
      fontSize: '16px', color: '#446655', fontFamily: 'monospace',
    });
    this.add.text(DRAW_X, DRAW_Y - 20, 'DRAW', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });
    this.dirtyMark = this.add.text(DRAW_X + 56, DRAW_Y - 18, '● unsaved', {
      fontSize: '14px', color: '#ffaa44', fontFamily: 'monospace',
    }).setVisible(false);

    this.buildTilesetDropdown();
    this.buildPickerUI();
    this.panel = new ColorPanel({
      scene: this,
      overlay: this.overlay,
      x: PALETTE_X,
      paletteY: PALETTE_Y,
      hsvY: ACTIONS_R_Y + 38,
      recentY: RECENT_Y,
      width: PREV_SIZE,
      onStatus: (msg) => this.statusText?.setText(msg),
    });
    this.buildActionButtons();
    this.buildToolButtons();

    this.statusText = this.add.text(DRAW_X, DRAW_Y + DRAW_SIZE + 8, '', {
      fontSize: '16px', color: '#667799', fontFamily: 'monospace',
    });

    this.loadTileIntoPixels(0);
    this.redrawAll();

    this.input.keyboard!.on('keydown-ESC', () => {
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
      this.saveTile();
    });
    this.input.keyboard!.on('keydown-Z', (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.shiftKey ? this.canvas.redo() : this.canvas.undo();
    });
  }

  private setDirty(v: boolean): void {
    if (this.dirty === v) return;
    this.dirty = v;
    this.dirtyMark?.setVisible(v);
    this.saveBtnTint?.(v ? 0x2f6e1c : 0x1c3c6e);
  }

  // ─── Redraw ────────────────────────────────────────────────────────────────

  private redrawAll(): void {
    this.canvas.redraw();
    this.redrawPreview();
    this.redrawPicker();
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
            const argb = this.canvas.px(tx, ty);
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

  // ─── Tileset dropdown ──────────────────────────────────────────────────────

  private buildTilesetDropdown(): void {
    const roomsData = RoomManager.getRoomsData();
    this.tilesetNames = [...(roomsData.baseTilesets ?? ['tileset'])];
    for (const room of Object.values(roomsData.rooms))
      for (const ts of room.tilesets ?? [])
        if (!this.tilesetNames.includes(ts)) this.tilesetNames.push(ts);

    this.activeTileset = this.tilesetNames[0] ?? 'tileset';

    const el = document.createElement('select');
    el.style.cssText = [
      'position:fixed', 'z-index:1000', 'cursor:pointer',
      'font-family:monospace', 'font-size:11px',
      'background:#1a1a2e', 'color:#aaccff',
      'border:1px solid #334466', 'padding:1px 3px',
      'box-sizing:border-box', 'width:100%',
    ].join(';');

    for (const name of this.tilesetNames) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.text  = name;
      el.appendChild(opt);
    }

    el.addEventListener('change', () => {
      const name = el.value;
      el.blur(); // hand the keyboard back to the editor
      if (name === this.activeTileset) return;
      const now = this.time.now;
      if (this.dirty && !(this.pendingTileset === name && now - this.pendingTilesetAt < 3000)) {
        this.pendingTileset = name;
        this.pendingTilesetAt = now;
        el.value = this.activeTileset;
        this.statusText?.setText('unsaved tile — select again to discard');
        return;
      }
      this.pendingTileset = undefined;
      this.activeTileset = name;
      this.pickerScroll  = 0;
      this.selectedFrame = 0;
      this.canvas.clearHistory();
      this.loadTileIntoPixels(0);
      this.setDirty(false);
      this.frameLabel?.setText('frame: 0');
      this.refreshPickerSprites();
      this.redrawAll();
      this.statusText?.setText(`tileset: ${name}`);
    });
    el.addEventListener('keydown', (e) => e.stopPropagation());

    this.overlay.add(el, PICKER_X, PICKER_Y - 38, PICKER_COLS * PICKER_CELL, 18);
  }

  // ─── Picker UI ─────────────────────────────────────────────────────────────

  private get activeSpritesKey(): string { return `${this.activeTileset}-sprites`; }

  private getTotalFrames(): number {
    const key = this.activeSpritesKey;
    const tex = this.textures.exists(key) ? this.textures.get(key) : null;
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
    const upArrow   = this.add.text(PICKER_X + PICKER_COLS * PICKER_CELL - 18, PICKER_Y - 20, '▲', arrowStyle).setInteractive({ useHandCursor: true });
    const downArrow = this.add.text(PICKER_X + PICKER_COLS * PICKER_CELL - 18, PICKER_Y + PICKER_VIS * PICKER_CELL + 4, '▼', arrowStyle).setInteractive({ useHandCursor: true });

    upArrow.on('pointerdown', () => {
      if (this.pickerScroll > 0) { this.pickerScroll--; this.refreshPickerSprites(); }
    });
    downArrow.on('pointerdown', () => {
      const maxScroll = Math.ceil(this.getTotalFrames() / PICKER_COLS) - PICKER_VIS;
      if (this.pickerScroll < maxScroll) { this.pickerScroll++; this.refreshPickerSprites(); }
    });

    this.input.on('wheel', (p: Phaser.Input.Pointer, _go: unknown, _dx: number, dy: number) => {
      if (p.x >= DRAW_X) return; // picker column only — the draw canvas wheel-zooms
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

      const sprite = this.add.image(px, py, this.activeSpritesKey, frame)
        .setOrigin(0, 0)
        .setScale(SCALE);
      sprite.setInteractive(new Phaser.Geom.Rectangle(0, 0, TILE, TILE), Phaser.Geom.Rectangle.Contains);
      sprite.input!.cursor = 'pointer';
      sprite.on('pointerdown', () => this.selectFrame(frame));
      this.pickerSprites.push(sprite);
    }

    this.redrawPicker();
  }

  private selectFrame(frame: number): void {
    // switching tiles discards the edit buffer — confirm when there are unsaved changes
    const now = this.time.now;
    if (this.dirty && !(this.pendingFrame === frame && now - this.pendingFrameAt < 3000)) {
      this.pendingFrame = frame;
      this.pendingFrameAt = now;
      this.statusText?.setText('unsaved tile — click again to discard');
      return;
    }
    this.pendingFrame = null;
    this.selectedFrame = frame;
    this.loadTileIntoPixels(frame);
    this.canvas.clearHistory();
    this.setDirty(false);
    this.frameLabel?.setText(`frame: ${frame}`);
    this.statusText?.setText(`loaded tile #${frame}`);
    this.redrawAll();
  }

  // ─── Load tile pixels ──────────────────────────────────────────────────────

  private loadTileIntoPixels(frame: number): void {
    const key = this.activeSpritesKey;
    if (!this.textures.exists(key)) { this.canvas.pixels.fill(0); return; }
    const tex = this.textures.get(key);
    const frameObj = tex.get(frame);
    if (!frameObj || frameObj.name === '__BASE') { this.canvas.pixels.fill(0); return; }

    const source = frameObj.source.image as HTMLImageElement | HTMLCanvasElement;
    const tmp = document.createElement('canvas');
    tmp.width  = TILE;
    tmp.height = TILE;
    const ctx = tmp.getContext('2d')!;
    ctx.drawImage(source, frameObj.cutX, frameObj.cutY, TILE, TILE, 0, 0, TILE, TILE);
    const data = ctx.getImageData(0, 0, TILE, TILE).data;
    for (let i = 0; i < TILE * TILE; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2], a = data[i * 4 + 3];
      this.canvas.pixels[i] = ((a << 24) | (r << 16) | (g << 8) | b) >>> 0;
    }
  }

  // ─── Action buttons (clear / save) ─────────────────────────────────────────

  private buildActionButtons(): void {
    const BH = 30;
    const GAP = 6;
    const BTN_COUNT = 5;
    const BW = Math.floor((PREV_SIZE - GAP * (BTN_COUNT - 1)) / BTN_COUNT);
    const actionsStartX = PREV_X + Math.floor((PREV_SIZE - (BTN_COUNT * BW + (BTN_COUNT - 1) * GAP)) / 2);
    const bx = (i: number): number => actionsStartX + i * (BW + GAP);
    this.btn.make('UNDO', bx(0), ACTIONS_R_Y, BW, BH, 0x2f4f5f, () => this.canvas.undo());
    this.btn.make('REDO', bx(1), ACTIONS_R_Y, BW, BH, 0x2f4f5f, () => this.canvas.redo());
    this.btn.make('MIRROR', bx(2), ACTIONS_R_Y, BW, BH, 0x2f4f5f, () => {
      this.canvas.mirrorX = !this.canvas.mirrorX;
      this.statusText.setText(`mirror ${this.canvas.mirrorX ? 'on' : 'off'}`);
    });
    this.btn.make('CLEAR', bx(3), ACTIONS_R_Y, BW, BH, 0x6e1c1c, () => {
      this.canvas.pushHistory();
      this.canvas.pixels.fill(0);
      this.setDirty(true);
      this.redrawAll();
      this.statusText.setText('canvas cleared');
    });
    this.saveBtnTint = this.btn.make('SAVE', bx(4), ACTIONS_R_Y, BW, BH, 0x1c3c6e, () => this.saveTile());

    const NBW = 34, NBG = 6;
    const nudgeY = DRAW_Y + DRAW_SIZE + 4;
    const nudgeStartX = DRAW_X + DRAW_SIZE - (4 * NBW + 3 * NBG);
    this.add.text(nudgeStartX, nudgeY - 18, 'NUDGE', {
      fontSize: '15px', color: '#667788', fontFamily: 'monospace',
    });
    this.btn.make('←', nudgeStartX + (NBW + NBG) * 0, nudgeY, NBW, BH, 0x2f4f5f, () => this.nudgeTile(-1, 0));
    this.btn.make('↑', nudgeStartX + (NBW + NBG) * 1, nudgeY, NBW, BH, 0x2f4f5f, () => this.nudgeTile(0, -1));
    this.btn.make('↓', nudgeStartX + (NBW + NBG) * 2, nudgeY, NBW, BH, 0x2f4f5f, () => this.nudgeTile(0, 1));
    this.btn.make('→', nudgeStartX + (NBW + NBG) * 3, nudgeY, NBW, BH, 0x2f4f5f, () => this.nudgeTile(1, 0));
  }

  private nudgeTile(dx: number, dy: number): void {
    this.canvas.pushHistory();
    const next = this.canvas.pixels.slice();
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const sx = (x - dx + TILE) % TILE;
        const sy = (y - dy + TILE) % TILE;
        next[y * TILE + x] = this.canvas.pixels[sy * TILE + sx];
      }
    }
    this.canvas.pixels.set(next);
    this.setDirty(true);
    this.redrawAll();
    this.statusText.setText(`nudged ${dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down'}`);
  }

  // ─── Tool buttons ──────────────────────────────────────────────────────────

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
      this.btn.draw(g, bx, TOOLS_Y, BW, BH, tool === this.canvas.tool);
      this.add.text(bx + BW / 2, TOOLS_Y + BH / 2, label, {
        fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      this.btn.bind(g, bx, TOOLS_Y, BW, BH, () => {
        this.canvas.tool = tool;
        this.refreshToolButtons();
      });
      this.toolBtns.push({ gfx: g, x: bx, y: TOOLS_Y, w: BW, h: BH, tool });
    });

    // Wrap toggle
    const wx = DRAW_X + tools.length * (BW + 8) + 16;
    const wg = this.add.graphics();
    this.btn.draw(wg, wx, TOOLS_Y, BW, BH, this.canvas.wrapSample);
    this.add.text(wx + BW / 2, TOOLS_Y + BH / 2, 'WRAP', {
      fontSize: '18px', color: '#aaccff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    this.btn.bind(wg, wx, TOOLS_Y, BW, BH, () => {
      this.canvas.wrapSample = !this.canvas.wrapSample;
      this.btn.draw(wg, wx, TOOLS_Y, BW, BH, this.canvas.wrapSample);
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

    const styleY = TOOLS_Y + BH + 8;
    const STW = 70, STG = 6;
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
        fontSize: '15px', color: '#aaccff', fontFamily: 'monospace',
      }).setOrigin(0.5).setDepth(2);
      this.btn.bind(g, bx, styleY, STW, BH, () => {
        this.canvas.penStyle = style;
        this.refreshStyleButtons();
        this.statusText.setText(`style: ${label.toLowerCase()}`);
      });
      this.styleBtns.push({ gfx: g, x: bx, y: styleY, w: STW, h: BH, style });
    });

    // EDIT row — copy / paste / flip the current tile
    const EBW = 92, EBH = 30, EGAP = 8;
    const editY = styleY + BH + 26;
    const ex = (i: number): number => DRAW_X + i * (EBW + EGAP);
    this.add.text(DRAW_X, editY - 20, 'EDIT', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });
    this.btn.make('COPY',   ex(0), editY, EBW, EBH, 0x1c3c6e, () => this.copyTile());
    this.btn.make('PASTE',  ex(1), editY, EBW, EBH, 0x1c3c6e, () => this.pasteTile(false));
    this.btn.make('MERGE',  ex(2), editY, EBW, EBH, 0x1c3c6e, () => this.pasteTile(true));
    this.btn.make('FLIP ↔', ex(3), editY, EBW, EBH, 0x2f4f5f, () => this.flipTile('h'));
    this.btn.make('FLIP ↕', ex(4), editY, EBW, EBH, 0x2f4f5f, () => this.flipTile('v'));
    this.btn.make('ROT ↻',  ex(5), editY, EBW, EBH, 0x2f4f5f, () => this.rotateTileCW());
  }

  private copyTile(): void {
    this.clipboard = this.canvas.pixels.slice();
    this.statusText.setText(`copied tile ${this.selectedFrame}`);
  }

  /** PASTE replaces the tile; MERGE composites the clipboard over what's there. */
  private pasteTile(merge: boolean): void {
    if (!this.clipboard) { this.statusText.setText('clipboard empty'); return; }
    this.canvas.pushHistory();
    if (merge) {
      const dst = this.canvas.pixels;
      for (let i = 0; i < dst.length; i++) dst[i] = this.compositeOver(this.clipboard[i], dst[i]);
    } else {
      this.canvas.pixels.set(this.clipboard);
    }
    this.setDirty(true);
    this.redrawAll();
    this.statusText.setText(`${merge ? 'merged' : 'pasted'} onto tile ${this.selectedFrame}`);
  }

  /** Alpha source-over: `src` painted on top of `dst`, both packed ARGB. */
  private compositeOver(src: number, dst: number): number {
    const sa = (src >>> 24) & 0xff;
    if (sa === 0) return dst;     // clipboard pixel is transparent — keep existing
    if (sa === 255) return src;   // fully opaque — plain overwrite
    const da = (dst >>> 24) & 0xff;
    const saf = sa / 255;
    const outAf = saf + (da / 255) * (1 - saf);
    if (outAf <= 0) return 0;
    const blend = (s: number, d: number): number =>
      Math.round((s * saf + d * (da / 255) * (1 - saf)) / outAf);
    const r = blend((src >>> 16) & 0xff, (dst >>> 16) & 0xff);
    const g = blend((src >>> 8) & 0xff, (dst >>> 8) & 0xff);
    const b = blend(src & 0xff, dst & 0xff);
    return (((Math.round(outAf * 255)) << 24) | (r << 16) | (g << 8) | b) >>> 0;
  }

  private flipTile(axis: 'h' | 'v'): void {
    this.canvas.pushHistory();
    const src = this.canvas.pixels.slice();
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const sx = axis === 'h' ? TILE - 1 - x : x;
        const sy = axis === 'v' ? TILE - 1 - y : y;
        this.canvas.pixels[y * TILE + x] = src[sy * TILE + sx];
      }
    }
    this.setDirty(true);
    this.redrawAll();
    this.statusText.setText(axis === 'h' ? 'flipped left/right' : 'flipped up/down');
  }

  /** Rotate the tile a quarter-turn clockwise (one step per press). */
  private rotateTileCW(): void {
    this.canvas.pushHistory();
    const src = this.canvas.pixels.slice();
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        // pixel at (x,y) comes from (y, TILE-1-x) in the source
        this.canvas.pixels[y * TILE + x] = src[(TILE - 1 - x) * TILE + y];
      }
    }
    this.setDirty(true);
    this.redrawAll();
    this.statusText.setText('rotated 90° cw');
  }

  private refreshToolButtons(): void {
    this.toolBtns.forEach(b => this.btn.draw(b.gfx, b.x, b.y, b.w, b.h, b.tool === this.canvas.tool));
  }

  private refreshStyleButtons(): void {
    this.styleBtns.forEach(b => this.btn.draw(b.gfx, b.x, b.y, b.w, b.h, b.style === this.canvas.penStyle));
  }

  // ─── Save ──────────────────────────────────────────────────────────────────

  private saveTile(): void {
    if (!import.meta.env.DEV) {
      this.statusText.setText('save only available in dev mode');
      return;
    }

    const key = this.activeSpritesKey;
    if (!this.textures.exists(key)) {
      this.statusText.setText('tileset not loaded');
      return;
    }

    const tex = this.textures.get(key);
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
      const argb = this.canvas.pixels[i];
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
        const resp = await fetch(`/__editor/save-tile?tileset=${encodeURIComponent(this.activeTileset)}&frame=${this.selectedFrame}`, {
          method: 'POST',
          headers: { 'Content-Type': 'image/png' },
          body: buf,
        });
        if (resp.ok) {
          this.setDirty(false);
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
