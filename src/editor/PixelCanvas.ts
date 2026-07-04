import Phaser from 'phaser';

export type PixelTool = 'pencil' | 'eraser' | 'eyedropper' | 'fill' | 'blur';
export type PenStyle = 'classic' | 'feltTip' | 'pencil' | 'marker' | 'spraypaint';

export interface PixelCanvasConfig {
  scene: Phaser.Scene;
  /** Pixels per side (square canvas, e.g. 64). */
  size: number;
  /** Screen origin of the draw area. */
  x: number;
  y: number;
  /** Screen pixels per canvas pixel. */
  scale: number;
  /** Brush placement wraps at edges (tile editor: true; sprite editor: false). */
  wrapBrush: boolean;
  /** Current paint color (ARGB). */
  getColor: () => number;
  /** Eyedropper picked a color (both the tool and middle-click). */
  onEyedrop: (argb: number) => void;
  /** Pixels mutated (stroke step, fill, blur, undo/redo). */
  onChange?: () => void;
  /** Tool switched internally (eyedropper snaps back to pencil). */
  onToolChange?: (tool: PixelTool) => void;
  onStatus?: (msg: string) => void;
  /** Optional ghost underlay (onion skin), same size, ARGB with alpha. */
  backdrop?: () => Uint32Array | null;
}

/**
 * Shared pixel-editing surface: checkerboard draw area, pencil / eraser /
 * eyedropper / fill / blur tools, pen sizes, undo/redo history.
 * Extracted from TileEditorScene; used by tile and sprite editors.
 */
export class PixelCanvas {
  pixels: Uint32Array;
  tool: PixelTool = 'pencil';
  penSize = 1;
  penStyle: PenStyle = 'classic';
  mirrorX = false;
  penOnlyDrawing = false;
  /** Blur kernel sampling wraps at edges (the tile editor's WRAP toggle). */
  wrapSample = true;

  private cfg: PixelCanvasConfig;
  private size: number;
  private drawSize: number;
  private gfx: Phaser.GameObjects.Graphics;
  private isDrawing = false;
  private drawingPointerId: number | null = null;
  private pinchStartDistance = 0;
  private pinchStartScale = 0;
  private pinchStartMidX = 0;
  private pinchStartMidY = 0;
  private pinchStartX = 0;
  private pinchStartY = 0;
  private readonly baseX: number;
  private readonly baseY: number;
  private readonly baseDrawSize: number;
  private readonly clipMaskGfx: Phaser.GameObjects.Graphics;
  private readonly clipMask: Phaser.Display.Masks.GeometryMask;

  private static readonly MIN_SCALE = 6;
  private static readonly MAX_SCALE = 18;

  private history: Uint32Array[] = [];
  private historyIndex = -1;
  private static readonly MAX_HISTORY = 50;

  constructor(cfg: PixelCanvasConfig) {
    this.cfg = cfg;
    this.size = cfg.size;
    this.drawSize = cfg.size * cfg.scale;
    this.baseX = cfg.x;
    this.baseY = cfg.y;
    this.baseDrawSize = this.drawSize;
    this.pixels = new Uint32Array(cfg.size * cfg.size);
    this.gfx = cfg.scene.add.graphics();
    this.clipMaskGfx = cfg.scene.add.graphics({ x: 0, y: 0 });
    this.clipMaskGfx.setVisible(false);
    this.clipMaskGfx.fillStyle(0xffffff, 1);
    this.clipMaskGfx.fillRect(this.baseX, this.baseY, this.baseDrawSize, this.baseDrawSize);
    this.clipMask = this.clipMaskGfx.createGeometryMask();
    this.gfx.setMask(this.clipMask);
    this.setupInput();
  }

  get drawing(): boolean {
    return this.isDrawing;
  }

  // ─── Pixel helpers ─────────────────────────────────────────────────────────

  px(x: number, y: number): number {
    return this.pixels[y * this.size + x] ?? 0;
  }

  setPx(x: number, y: number, argb: number): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return;
    this.pixels[y * this.size + x] = argb;
  }

  // ─── Redraw ────────────────────────────────────────────────────────────────

  redraw(): void {
    const { x: DRAW_X, y: DRAW_Y, scale: DRAW_SCALE } = this.cfg;
    const size = this.size;
    const g = this.gfx;
    g.clear();

    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const even = (tx + ty) % 2 === 0;
        g.fillStyle(even ? 0x2e2e3e : 0x383848, 1);
        g.fillRect(DRAW_X + tx * DRAW_SCALE, DRAW_Y + ty * DRAW_SCALE, DRAW_SCALE, DRAW_SCALE);
      }
    }

    const backdrop = this.cfg.backdrop?.();
    if (backdrop) {
      for (let ty = 0; ty < size; ty++) {
        for (let tx = 0; tx < size; tx++) {
          const argb = backdrop[ty * size + tx] ?? 0;
          const a = (argb >>> 24) & 0xff;
          if (a === 0) continue;
          g.fillStyle(argb & 0x00ffffff, a / 255);
          g.fillRect(DRAW_X + tx * DRAW_SCALE, DRAW_Y + ty * DRAW_SCALE, DRAW_SCALE, DRAW_SCALE);
        }
      }
    }

    for (let ty = 0; ty < size; ty++) {
      for (let tx = 0; tx < size; tx++) {
        const argb = this.px(tx, ty);
        const a = (argb >>> 24) & 0xff;
        if (a === 0) continue;
        g.fillStyle(argb & 0x00ffffff, a / 255);
        g.fillRect(DRAW_X + tx * DRAW_SCALE, DRAW_Y + ty * DRAW_SCALE, DRAW_SCALE, DRAW_SCALE);
      }
    }

    // 8-pixel grid lines
    g.lineStyle(1, 0x555577, 0.35);
    for (let i = 0; i <= size; i += 8) {
      g.lineBetween(DRAW_X + i * DRAW_SCALE, DRAW_Y, DRAW_X + i * DRAW_SCALE, DRAW_Y + this.drawSize);
      g.lineBetween(DRAW_X, DRAW_Y + i * DRAW_SCALE, DRAW_X + this.drawSize, DRAW_Y + i * DRAW_SCALE);
    }
    g.lineStyle(1, 0x4488cc, 1);
    g.strokeRect(this.baseX, this.baseY, this.baseDrawSize, this.baseDrawSize);
  }

  // ─── Input ─────────────────────────────────────────────────────────────────

  private setupInput(): void {
    const input = this.cfg.scene.input;
    const requiredPointers = 3;
    const missingPointers = Math.max(0, requiredPointers - input.manager.pointersTotal);
    if (missingPointers > 0) input.addPointer(missingPointers);

    input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (!this.inDrawArea(p.x, p.y)) return;
      if (this.isTouchPointer(p)) {
        const pinch = this.getActiveTouchPair();
        if (pinch) {
          this.isDrawing = false;
          this.startPinch(pinch[0], pinch[1]);
          this.updatePinch(pinch[0], pinch[1]);
          return;
        }
      }
      if (this.penOnlyDrawing && this.isFingerTouchPointer(p) && !this.isLikelyStylusTouchPointer(p)) return;
      if (p.middleButtonDown()) { this.quickEyedrop(p.x, p.y); return; }
      if (p.rightButtonDown())  {
        this.pushHistory();
        this.isDrawing = true;
        this.drawingPointerId = p.id;
        this.quickErase(p.x, p.y);
        return;
      }
      this.pushHistory();
      this.isDrawing = true;
      this.drawingPointerId = p.id;
      this.applyTool(p.x, p.y);
    });
    input.on('pointermove', (p: Phaser.Input.Pointer) => {
      const pinch = this.getActiveTouchPair();
      if (pinch) {
        if (this.pinchStartDistance <= 0) this.startPinch(pinch[0], pinch[1]);
        this.isDrawing = false;
        this.updatePinch(pinch[0], pinch[1]);
        return;
      }
      if (this.pinchStartDistance > 0) {
        this.pinchStartDistance = 0;
        this.pinchStartScale = 0;
      }
      if (!this.isDrawing || !p.isDown || this.drawingPointerId !== p.id) return;
      if (this.penOnlyDrawing && this.isFingerTouchPointer(p) && !this.isLikelyStylusTouchPointer(p)) return;
      if (p.rightButtonDown()) { this.quickErase(p.x, p.y); return; }
      this.applyTool(p.x, p.y);
    });
    input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (this.drawingPointerId === null || this.drawingPointerId === p.id) {
        this.isDrawing = false;
        this.drawingPointerId = null;
      }
      const pinch = this.getActiveTouchPair();
      if (!pinch) {
        this.pinchStartDistance = 0;
        this.pinchStartScale = 0;
      }
    });
  }

  private isTouchPointer(p: Phaser.Input.Pointer): boolean {
    const evt = (p.event ?? null) as PointerEvent | null;
    return evt?.pointerType === 'touch' || (p as Phaser.Input.Pointer & { wasTouch?: boolean }).wasTouch === true;
  }

  private isFingerTouchPointer(p: Phaser.Input.Pointer): boolean {
    const evt = (p.event ?? null) as PointerEvent | null;
    return this.isTouchPointer(p) && evt?.pointerType !== 'pen';
  }

  private isLikelyStylusTouchPointer(p: Phaser.Input.Pointer): boolean {
    const evt = (p.event ?? null) as (PointerEvent & { changedTouches?: TouchList; touches?: TouchList }) | null;
    if (!evt) return false;
    if ((evt as PointerEvent).pointerType === 'pen') return true;

    const touch = evt.changedTouches?.[0] ?? evt.touches?.[0];
    if (touch && (touch as Touch & { touchType?: string }).touchType === 'stylus') return true;

    const tiltX = Math.abs(((evt as PointerEvent).tiltX ?? 0) as number);
    const tiltY = Math.abs(((evt as PointerEvent).tiltY ?? 0) as number);
    const twist = Math.abs(((evt as PointerEvent).twist ?? 0) as number);
    if (tiltX > 0 || tiltY > 0 || twist > 0) return true;

    return false;
  }

  private getActiveTouchPair(): [Phaser.Input.Pointer, Phaser.Input.Pointer] | null {
    const pointers = this.cfg.scene.input.manager.pointers
      .filter((ptr) => ptr.isDown && this.isTouchPointer(ptr));
    if (pointers.length < 2) return null;
    return [pointers[0], pointers[1]];
  }

  private startPinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    this.pinchStartDistance = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    this.pinchStartScale = this.cfg.scale;
    this.pinchStartMidX = (a.x + b.x) * 0.5;
    this.pinchStartMidY = (a.y + b.y) * 0.5;
    this.pinchStartX = this.cfg.x;
    this.pinchStartY = this.cfg.y;
  }

  private updatePinch(a: Phaser.Input.Pointer, b: Phaser.Input.Pointer): void {
    if (this.pinchStartDistance <= 0 || this.pinchStartScale <= 0) return;
    const dist = Phaser.Math.Distance.Between(a.x, a.y, b.x, b.y);
    if (dist <= 0) return;
    const nextScale = Phaser.Math.Clamp(
      Math.round(this.pinchStartScale * (dist / this.pinchStartDistance)),
      PixelCanvas.MIN_SCALE,
      PixelCanvas.MAX_SCALE,
    );
    const midX = (a.x + b.x) * 0.5;
    const midY = (a.y + b.y) * 0.5;
    const anchorU = (this.pinchStartMidX - this.pinchStartX) / this.pinchStartScale;
    const anchorV = (this.pinchStartMidY - this.pinchStartY) / this.pinchStartScale;
    const changedScale = nextScale !== this.cfg.scale;
    this.cfg.scale = nextScale;
    this.drawSize = this.size * nextScale;
    this.cfg.x = midX - anchorU * nextScale;
    this.cfg.y = midY - anchorV * nextScale;
    this.clampCanvasToContainer();
    this.redraw();
    if (changedScale) this.cfg.onStatus?.(`zoom ${nextScale}x`);
  }

  private clampCanvasToContainer(): void {
    const [minX, maxX] = this.getAxisBounds(this.baseX, this.baseDrawSize, this.drawSize);
    const [minY, maxY] = this.getAxisBounds(this.baseY, this.baseDrawSize, this.drawSize);
    this.cfg.x = Phaser.Math.Clamp(this.cfg.x, minX, maxX);
    this.cfg.y = Phaser.Math.Clamp(this.cfg.y, minY, maxY);
  }

  private getAxisBounds(base: number, containerSize: number, contentSize: number): [number, number] {
    if (contentSize >= containerSize) {
      return [base + containerSize - contentSize, base];
    }
    return [base, base + containerSize - contentSize];
  }

  private quickErase(sx: number, sy: number): void {
    const tx = Math.floor((sx - this.cfg.x) / this.cfg.scale);
    const ty = Math.floor((sy - this.cfg.y) / this.cfg.scale);
    this.paintBrush(tx, ty, 0);
    this.redraw();
    this.cfg.onChange?.();
  }

  private quickEyedrop(sx: number, sy: number): void {
    const tx = Math.floor((sx - this.cfg.x) / this.cfg.scale);
    const ty = Math.floor((sy - this.cfg.y) / this.cfg.scale);
    const argb = this.px(tx, ty);
    this.cfg.onEyedrop(argb);
    const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
    const a   = Math.round(((argb >>> 24) & 0xff) / 255 * 100);
    this.cfg.onStatus?.(`picked: #${hex}  α:${a}%`);
  }

  private inDrawArea(sx: number, sy: number): boolean {
    return sx >= this.cfg.x && sx < this.cfg.x + this.drawSize &&
           sy >= this.cfg.y && sy < this.cfg.y + this.drawSize;
  }

  private applyTool(sx: number, sy: number): void {
    const size = this.size;
    let tx = Math.floor((sx - this.cfg.x) / this.cfg.scale);
    let ty = Math.floor((sy - this.cfg.y) / this.cfg.scale);

    // always clamp/wrap into valid range
    tx = ((tx % size) + size) % size;
    ty = ((ty % size) + size) % size;

    if (this.tool === 'pencil') {
      this.paintBrush(tx, ty, this.cfg.getColor());
    } else if (this.tool === 'eraser') {
      this.paintBrush(tx, ty, 0);
    } else if (this.tool === 'blur') {
      this.applyBlur(tx, ty);
    } else if (this.tool === 'fill') {
      this.floodFill(tx, ty);
      this.isDrawing = false; // fill is one-shot, no drag-fill
    } else if (this.tool === 'eyedropper') {
      const argb = this.px(tx, ty);
      this.cfg.onEyedrop(argb);
      const hex = (argb & 0x00ffffff).toString(16).padStart(6, '0');
      const a   = Math.round(((argb >>> 24) & 0xff) / 255 * 100);
      this.cfg.onStatus?.(`picked: #${hex}  α:${a}%`);
      // switch back to pencil so next click draws
      this.tool = 'pencil';
      this.cfg.onToolChange?.(this.tool);
      return; // no pixel change, no need to redraw canvas
    }

    this.redraw();
    this.cfg.onChange?.();
  }

  // ─── Brush / fill ─────────────────────────────────────────────────────────

  private paintBrush(cx: number, cy: number, color: number): void {
    const size = this.size;
    const off = Math.floor(this.penSize / 2);
    for (let dy = 0; dy < this.penSize; dy++) {
      for (let dx = 0; dx < this.penSize; dx++) {
        const bx = cx - off + dx;
        const by = cy - off + dy;
        const dist = Math.hypot(dx - off, dy - off);
        const mask = this.brushMaskWeight(this.penStyle, dist, off, bx, by);
        if (mask <= 0) continue;
        if (this.cfg.wrapBrush) {
          const px = ((bx % size) + size) % size;
          const py = ((by % size) + size) % size;
          this.paintPixel(px, py, color, mask);
          if (this.mirrorX) {
            const mx = size - 1 - px;
            if (mx !== px) this.paintPixel(mx, py, color, mask);
          }
        } else {
          this.paintPixel(bx, by, color, mask);
          if (this.mirrorX) {
            const mx = size - 1 - bx;
            if (mx !== bx) this.paintPixel(mx, by, color, mask);
          }
        }
      }
    }
  }

  private paintPixel(x: number, y: number, color: number, mask: number): void {
    if (x < 0 || x >= this.size || y < 0 || y >= this.size) return;
    if (color === 0) {
      this.setPx(x, y, 0);
      return;
    }
    const alpha = Math.min(1, Math.max(0, mask));
    if (alpha >= 0.999) {
      this.setPx(x, y, color);
      return;
    }

    const dst = this.px(x, y);
    this.setPx(x, y, this.blendArgb(dst, color, alpha));
  }

  private blendArgb(dst: number, src: number, srcWeight: number): number {
    const sa = ((src >>> 24) & 0xff) * srcWeight;
    const da = (dst >>> 24) & 0xff;
    const srcA = sa / 255;
    const dstA = da / 255;
    const outA = srcA + dstA * (1 - srcA);
    if (outA <= 0) return 0;

    const sr = (src >>> 16) & 0xff;
    const sg = (src >>> 8) & 0xff;
    const sb = src & 0xff;
    const dr = (dst >>> 16) & 0xff;
    const dg = (dst >>> 8) & 0xff;
    const db = dst & 0xff;

    const outR = Math.round((sr * srcA + dr * dstA * (1 - srcA)) / outA);
    const outG = Math.round((sg * srcA + dg * dstA * (1 - srcA)) / outA);
    const outB = Math.round((sb * srcA + db * dstA * (1 - srcA)) / outA);
    const outAlpha = Math.round(outA * 255);

    return (((outAlpha << 24) | (outR << 16) | (outG << 8) | outB) >>> 0);
  }

  private brushMaskWeight(style: PenStyle, dist: number, off: number, x: number, y: number): number {
    const radius = Math.max(0.5, off + 0.5);
    const norm = dist / radius;
    switch (style) {
      case 'classic':
        return 1;
      case 'marker':
        return norm <= 0.9 ? 1 : norm <= 1.2 ? 0.75 : 0;
      case 'feltTip':
        return norm <= 1.2 ? Math.max(0, 0.85 - norm * 0.35) : 0;
      case 'pencil': {
        if (norm > 1.15) return 0;
        const grain = this.hash01(x, y, this.penSize * 17 + 3);
        const density = 0.35 + (1 - Math.min(norm, 1)) * 0.45;
        if (grain > density) return 0;
        return 0.2 + this.hash01(x + 11, y - 7, this.penSize * 29 + 5) * 0.45;
      }
      case 'spraypaint': {
        if (norm > 1.6) return 0;
        const chance = Math.max(0, 0.75 - norm * 0.45);
        const roll = this.hash01(x * 3, y * 5, this.penSize * 41 + 9);
        if (roll > chance) return 0;
        return 0.12 + this.hash01(x - 13, y + 19, this.penSize * 53 + 13) * 0.35;
      }
      default:
        return 1;
    }
  }

  private hash01(x: number, y: number, seed: number): number {
    let n = (x * 374761393 + y * 668265263 + seed * 362437) | 0;
    n = (n ^ (n >>> 13)) * 1274126177;
    n ^= n >>> 16;
    return (n >>> 0) / 0xffffffff;
  }

  private floodFill(startX: number, startY: number): void {
    const size = this.size;
    const color = this.cfg.getColor();
    const target = this.px(startX, startY);
    if (target === color) return;
    const stack: [number, number][] = [[startX, startY]];
    const visited = new Uint8Array(size * size);
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = y * size + x;
      if (visited[key]) continue;
      visited[key] = 1;
      if (this.px(x, y) !== target) continue;
      this.setPx(x, y, color);
      if (x > 0)        stack.push([x - 1, y]);
      if (x < size - 1) stack.push([x + 1, y]);
      if (y > 0)        stack.push([x, y - 1]);
      if (y < size - 1) stack.push([x, y + 1]);
    }
  }

  private applyBlur(cx: number, cy: number): void {
    const size = this.size;
    const off = Math.floor(this.penSize / 2);
    const positions: [number, number][] = [];
    for (let dy = 0; dy < this.penSize; dy++) {
      for (let dx = 0; dx < this.penSize; dx++) {
        if (this.cfg.wrapBrush) {
          const px = ((cx - off + dx) % size + size) % size;
          const py = ((cy - off + dy) % size + size) % size;
          positions.push([px, py]);
        } else {
          const px = cx - off + dx, py = cy - off + dy;
          if (px >= 0 && px < size && py >= 0 && py < size) positions.push([px, py]);
        }
      }
    }

    // Collect averaged values before writing (avoid reading back blurred pixels mid-pass)
    const blurred: number[] = positions.map(([px, py]) => {
      let ra = 0, ga = 0, ba = 0, aa = 0, count = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          let sx = px + kx, sy = py + ky;
          if (this.wrapSample) {
            sx = ((sx % size) + size) % size;
            sy = ((sy % size) + size) % size;
          } else {
            if (sx < 0 || sx >= size || sy < 0 || sy >= size) continue;
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

  // ─── History ──────────────────────────────────────────────────────────────

  pushHistory(): void {
    // discard any future states if we branched
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    this.history.push(this.pixels.slice());
    if (this.history.length > PixelCanvas.MAX_HISTORY) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  clearHistory(): void {
    this.history = [];
    this.historyIndex = -1;
  }

  undo(): void {
    if (this.historyIndex < 0) {
      this.cfg.onStatus?.('nothing to undo');
      return;
    }
    this.pixels.set(this.history[this.historyIndex]);
    this.historyIndex--;
    this.redraw();
    this.cfg.onChange?.();
    this.cfg.onStatus?.(`undo  (${this.historyIndex + 1}/${this.history.length})`);
  }

  redo(): void {
    if (this.historyIndex >= this.history.length - 1) {
      this.cfg.onStatus?.('nothing to redo');
      return;
    }
    this.historyIndex++;
    this.pixels.set(this.history[this.historyIndex]);
    this.redraw();
    this.cfg.onChange?.();
    this.cfg.onStatus?.(`redo  (${this.historyIndex + 1}/${this.history.length})`);
  }
}
