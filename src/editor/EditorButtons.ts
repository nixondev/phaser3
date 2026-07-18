import Phaser from 'phaser';

/**
 * Shared button helpers for the editor scenes: filled action buttons with
 * hover feedback (make), interactive hookup with hover outline + hand cursor
 * for toggle/tool buttons (bind), and the active/inactive box style (draw).
 * Extracted from SpriteEditorScene; used by tile and sprite editors.
 */
export class EditorButtons {
  private readonly scene: Phaser.Scene;
  private readonly hoverGfx: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.hoverGfx = scene.add.graphics().setDepth(5);
  }

  /** Filled action button. Returns a redraw fn that can retint it later (e.g. dirty SAVE). */
  make(label: string, x: number, y: number, w: number, h: number, col: number, cb: () => void): (newCol?: number) => void {
    const g = this.scene.add.graphics();
    let baseCol = col;
    let hover = false;
    const draw = (): void => {
      g.clear();
      g.fillStyle(baseCol, hover ? 1 : 0.85);
      g.fillRect(x, y, w, h);
      g.lineStyle(1, hover ? 0x88bbff : baseCol, 1);
      g.strokeRect(x, y, w, h);
    };
    draw();
    this.scene.add.text(x + w / 2, y + h / 2, label, {
      fontSize: '18px', color: '#ffffff', fontFamily: 'monospace',
    }).setOrigin(0.5).setDepth(2);
    g.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    g.input!.cursor = 'pointer';
    g.on('pointerover', () => { hover = true; draw(); });
    g.on('pointerout',  () => { hover = false; draw(); });
    g.on('pointerdown', cb);
    return (newCol?: number) => {
      if (newCol !== undefined) baseCol = newCol;
      draw();
    };
  }

  /** Interactive hookup for draw()-style buttons: hand cursor + hover outline. */
  bind(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, cb: () => void): void {
    g.setInteractive(new Phaser.Geom.Rectangle(x, y, w, h), Phaser.Geom.Rectangle.Contains);
    g.input!.cursor = 'pointer';
    g.on('pointerover', () => {
      this.hoverGfx.clear();
      this.hoverGfx.lineStyle(1, 0x88bbff, 1);
      this.hoverGfx.strokeRect(x, y, w, h);
    });
    g.on('pointerout', () => this.hoverGfx.clear());
    g.on('pointerdown', cb);
  }

  /** Active/inactive box used by tool, size, style and toggle buttons. */
  draw(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, active: boolean): void {
    g.clear();
    g.fillStyle(active ? 0x1e3a5e : 0x181828, 1);
    g.fillRect(x, y, w, h);
    g.lineStyle(1, active ? 0x4499ff : 0x334455, 1);
    g.strokeRect(x, y, w, h);
  }
}
