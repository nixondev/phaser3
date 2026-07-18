import Phaser from 'phaser';

interface TrackedEl {
  el: HTMLElement;
  lx: number;
  ly: number;
  lw: number;
  lh: number;
}

/**
 * Tracks HTML elements overlaid on the Phaser canvas (inputs, selects,
 * picker canvases) and positions them in canvas-logical coordinates.
 * Tracked elements are re-positioned when the canvas is resized, blurred
 * when the game canvas is clicked (so overlay inputs can't trap the
 * keyboard), and removed automatically on scene shutdown.
 */
export class HtmlOverlay {
  private els: TrackedEl[] = [];
  private readonly onCanvasPointerDown = (): void => this.blurAll();
  private readonly onResize = (): void => this.repositionAll();

  constructor(private scene: Phaser.Scene) {
    scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
    scene.game.canvas.addEventListener('pointerdown', this.onCanvasPointerDown);
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize);
    window.addEventListener('resize', this.onResize);
  }

  /** Appends `el` to the document, positions it, and tracks it for cleanup. */
  add<T extends HTMLElement>(el: T, lx: number, ly: number, lw: number, lh: number): T {
    document.body.appendChild(el);
    this.position(el, lx, ly, lw, lh);
    this.els.push({ el, lx, ly, lw, lh });
    return el;
  }

  /** Positions a fixed-position element over the canvas using logical coords. */
  position(el: HTMLElement, lx: number, ly: number, lw: number, lh: number): void {
    const canvas = this.scene.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const sx = rect.width  / (this.scene.game.config.width  as number);
    const sy = rect.height / (this.scene.game.config.height as number);
    el.style.left   = `${rect.left + lx * sx}px`;
    el.style.top    = `${rect.top  + ly * sy}px`;
    el.style.width  = `${lw * sx}px`;
    el.style.height = `${lh * sy}px`;
    el.style.fontSize = `${13 * sx}px`;
  }

  /** Show/hide a tracked element (e.g. while focus mode covers its spot). */
  setVisible(el: HTMLElement, visible: boolean): void {
    el.style.display = visible ? '' : 'none';
  }

  /** Drops focus from any tracked element so keyboard input returns to Phaser. */
  blurAll(): void {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return;
    if (this.els.some(({ el }) => el === active || el.contains(active))) active.blur();
  }

  private repositionAll(): void {
    for (const { el, lx, ly, lw, lh } of this.els) this.position(el, lx, ly, lw, lh);
  }

  getElements(): HTMLElement[] {
    return this.els.map(({ el }) => el);
  }

  destroy(): void {
    this.scene.game.canvas.removeEventListener('pointerdown', this.onCanvasPointerDown);
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize);
    window.removeEventListener('resize', this.onResize);
    this.els.forEach(({ el }) => el.remove());
    this.els = [];
  }
}
