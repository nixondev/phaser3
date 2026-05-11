import Phaser from 'phaser';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';
import type { Flashlight } from '@systems/Flashlight';

const AMBIENT_RADIUS = 18;

export class DarknessOverlay {
  private rt: Phaser.GameObjects.RenderTexture;
  private lightMask: Phaser.GameObjects.Graphics;
  private enabled = false;

  constructor(scene: Phaser.Scene) {
    this.rt = scene.add.renderTexture(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
    this.rt.setOrigin(0, 0);
    this.rt.setScrollFactor(0);
    this.rt.setDepth(DEPTH.LIGHTING);
    this.rt.setVisible(false);

    // Must be visible for rt.erase() to render it
    this.lightMask = scene.add.graphics();
    this.lightMask.setDepth(-9999);
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.rt.setVisible(enabled);
  }

  update(playerScreenX: number, playerScreenY: number, flashlight: Flashlight): void {
    if (!this.enabled) return;

    this.rt.clear();
    this.rt.fill(0x000000, 0.92);

    // Erase ambient circle — everything in screen-space coords, no scroll offset needed
    this.lightMask.clear();
    this.lightMask.fillStyle(0xffffff, 1.0);
    this.lightMask.fillCircle(playerScreenX, playerScreenY, AMBIENT_RADIUS);
    this.rt.erase(this.lightMask);

    // Erase flashlight cone in screen-space (no-op if flashlight is off)
    flashlight.renderMaskScreenSpace(this.rt, playerScreenX, playerScreenY);
  }

  destroy(): void {
    this.rt.destroy();
    this.lightMask.destroy();
  }
}
