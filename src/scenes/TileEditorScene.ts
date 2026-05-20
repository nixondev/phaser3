import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';

const TILE = 64;
const DRAW_SCALE = 7;   // 64 × 7 = 448 px draw area
const PREV_SCALE = 2;   // 3×3 wrap preview at 2× = 384 px

// Horizontal layout
const PICKER_X   = 12;
const PICKER_Y   = 80;
const PICKER_COLS = 2;
const PICKER_CELL = 64;
const PICKER_VIS  = 13; // rows visible in scroll window

const DRAW_X    = PICKER_X + PICKER_COLS * PICKER_CELL + 16;  // 156
const DRAW_Y    = 60;
const DRAW_SIZE = TILE * DRAW_SCALE;   // 448

const PREV_X    = DRAW_X + DRAW_SIZE + 16;  // 620
const PREV_Y    = DRAW_Y;
const PREV_TILE = TILE * PREV_SCALE;         // 128
const PREV_SIZE = PREV_TILE * 3;             // 384

const PALETTE_X = PREV_X;
const PALETTE_Y = PREV_Y + PREV_SIZE + 20;  // 464
const SWATCH    = 28;
const SWATCH_COLS = 6;

const TOOLS_Y = DRAW_Y + DRAW_SIZE + 32;    // 540

type Tool = 'pencil' | 'eraser' | 'eyedropper';

interface BtnEntry {
  gfx: Phaser.GameObjects.Graphics;
  x: number; y: number; w: number; h: number;
  tool: Tool;
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
  private swatchHighlight?: Phaser.GameObjects.Graphics;
  private pickerSprites: Phaser.GameObjects.Image[] = [];
  private statusText!: Phaser.GameObjects.Text;
  private frameLabel!: Phaser.GameObjects.Text;
  private wrapBtn!: { gfx: Phaser.GameObjects.Graphics; x: number; y: number; w: number; h: number };

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
    this.buildToolButtons();
    this.buildActionButtons();

    this.statusText = this.add.text(DRAW_X, DRAW_Y + DRAW_SIZE + 8, '', {
      fontSize: '16px', color: '#667799', fontFamily: 'monospace',
    });

    this.loadTileIntoPixels(0);
    this.redrawAll();
    this.setupInput();

    this.input.keyboard!.on('keydown-ESC', () => this.scene.start(SCENES.MENU));
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
    this.add.text(PALETTE_X, PALETTE_Y - 20, 'COLOR', {
      fontSize: '16px', color: '#667788', fontFamily: 'monospace',
    });

    PALETTE.forEach((argb, i) => {
      const col = i % SWATCH_COLS;
      const row = Math.floor(i / SWATCH_COLS);
      const sx = PALETTE_X + col * (SWATCH + 2);
      const sy = PALETTE_Y + row * (SWATCH + 2);

      const g = this.add.graphics();
      const a = ((argb >>> 24) & 0xff) / 255;

      if (a < 0.01) {
        // checkerboard for transparent
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
        const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
        this.statusText?.setText(`color: #${hex}  α:${Math.round(a * 100)}%`);
      });
    });

    // default black selected
    this.updateSwatchHighlight(1);
  }

  private updateSwatchHighlight(index: number): void {
    this.swatchHighlight?.destroy();
    const col = index % SWATCH_COLS;
    const row = Math.floor(index / SWATCH_COLS);
    const sx = PALETTE_X + col * (SWATCH + 2) - 1;
    const sy = PALETTE_Y + row * (SWATCH + 2) - 1;
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
  }

  private drawBtn(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, active: boolean): void {
    g.clear();
    g.fillStyle(active ? 0x1e3a5e : 0x181828, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, active ? 0x4499ff : 0x334455, 1);
    g.strokeRect(x, y, w, h);
  }

  // ─── Action buttons ────────────────────────────────────────────────────────

  private buildActionButtons(): void {
    const BW = 88, BH = 28;
    const bx = DRAW_X + DRAW_SIZE - BW * 2 - 12;

    this.makeBtn('CLEAR', bx, TOOLS_Y, BW, BH, 0x6e1c1c, () => {
      this.pixels.fill(0);
      this.redrawAll();
      this.statusText.setText('canvas cleared');
    });
    this.makeBtn('SAVE', bx + BW + 12, TOOLS_Y, BW, BH, 0x1c3c6e, () => this.saveTile());
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
      this.isDrawing = true;
      this.applyTool(p.x, p.y);
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!this.isDrawing || !p.isDown) return;
      this.applyTool(p.x, p.y);
    });
    this.input.on('pointerup', () => { this.isDrawing = false; });
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
      this.setPx(tx, ty, this.currentColor);
    } else if (this.tool === 'eraser') {
      this.setPx(tx, ty, 0);
    } else if (this.tool === 'eyedropper') {
      this.currentColor = this.px(tx, ty);
      // highlight the closest palette match if any, otherwise clear highlight
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
          // reload textures so picker and future loads reflect the change
          this.textures.remove('tileset');
          this.textures.remove('tileset-sprites');
          this.load.image('tileset', 'assets/tilemaps/tileset.png');
          this.load.spritesheet('tileset-sprites', 'assets/tilemaps/tileset.png', {
            frameWidth: TILE, frameHeight: TILE,
          });
          this.load.once('complete', () => {
            this.refreshPickerSprites();
            this.statusText.setText(`saved tile #${this.selectedFrame} ✓`);
          });
          this.load.start();
        } else {
          this.statusText.setText(`save failed: ${resp.status}`);
        }
      } catch (e: unknown) {
        this.statusText.setText(`save error: ${(e as Error).message ?? e}`);
      }
    }, 'image/png');
  }
}
