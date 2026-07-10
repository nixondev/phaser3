import Phaser from 'phaser';

/**
 * Tracks HTML elements overlaid on the Phaser canvas (inputs, selects,
 * picker canvases) and positions them in canvas-logical coordinates.
 * All tracked elements are removed automatically on scene shutdown.
 */
export class HtmlOverlay {
  private els: HTMLElement[] = [];

  constructor(private scene: Phaser.Scene) {
    scene.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  /** Appends `el` to the document, positions it, and tracks it for cleanup. */
  add<T extends HTMLElement>(el: T, lx: number, ly: number, lw: number, lh: number): T {
    document.body.appendChild(el);
    this.position(el, lx, ly, lw, lh);
    this.els.push(el);
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

  getElements(): HTMLElement[] {
    return [...this.els];
  }

  destroy(): void {
    this.els.forEach(el => el.remove());
    this.els = [];
  }
}
