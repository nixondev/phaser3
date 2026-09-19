import Phaser from 'phaser';
import { DEPTH, GAME_CONFIG, DARKNESS_CONFIG } from '@utils/Constants';
import type { Flashlight } from '@systems/Flashlight';
import type { ScreenSpaceHost } from '@systems/ScreenSpace';

const AMBIENT_RADIUS = 72;

export class DarknessOverlay {
  private rt: Phaser.GameObjects.RenderTexture;
  private lightMask: Phaser.GameObjects.Graphics;
  private enabled = false;
  private darkLevel: number = DARKNESS_CONFIG.DEFAULT_LEVEL;

  constructor(scene: Phaser.Scene) {
    this.rt = scene.add.renderTexture(0, 0, GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT);
    this.rt.setOrigin(0, 0);
    this.rt.setScrollFactor(0);
    this.rt.setDepth(DEPTH.LIGHTING);
    this.rt.setVisible(false);
    // The RT is a screen-sized canvas: pinning it makes RT-local pixels equal
    // screen pixels at any camera zoom, which is what update() assumes.
    (scene as ScreenSpaceHost).pinScreenSpace?.(this.rt, 0, 0);

    // Must be visible (non-zero alpha, visible=true) for rt.erase() to render it,
    // but must NOT appear in the main camera — exclude it via cameraFilter so it
    // only participates in the RT's internal draw pass.
    this.lightMask = scene.add.graphics();
    this.lightMask.setDepth(-9999);
    this.lightMask.cameraFilter = scene.cameras.main.id;
  }

  setEnabled(enabled: boolean, level?: number): void {
    this.enabled = enabled;
    if (level !== undefined) this.darkLevel = Math.max(0, Math.min(1, level));
    this.rt.setVisible(enabled);
  }

  /**
   * @param playerScreenX/Y  player position in SCREEN pixels
   * @param scale            camera zoom — lit radii are world distances being
   *                         drawn onto a screen-space texture, so they grow
   *                         with zoom exactly like the world they reveal.
   */
  update(playerScreenX: number, playerScreenY: number, flashlight: Flashlight, scale: number = 1): void {
    if (!this.enabled) return;

    this.rt.clear();
    this.rt.fill(0x000000, this.darkLevel);

    // Erase ambient circle — everything in screen-space coords, no scroll offset needed
    this.lightMask.clear();
    this.lightMask.fillStyle(0xffffff, 1.0);
    this.lightMask.fillCircle(playerScreenX, playerScreenY, AMBIENT_RADIUS * scale);
    this.rt.erase(this.lightMask);

    // Erase flashlight cone in screen-space (no-op if flashlight is off)
    flashlight.renderMaskScreenSpace(this.rt, playerScreenX, playerScreenY, scale);
  }

  destroy(): void {
    this.rt.destroy();
    this.lightMask.destroy();
  }
}
