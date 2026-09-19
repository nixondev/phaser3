import Phaser from 'phaser';
import { GAME_CONFIG, DEPTH, ROOM_CONFIG } from '@utils/Constants';
import type { ScreenSpaceHost } from '@systems/ScreenSpace';

export class TransitionManager {
  private scene: Phaser.Scene;
  private overlay: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.overlay = scene.add.rectangle(
      GAME_CONFIG.WIDTH / 2,
      GAME_CONFIG.HEIGHT / 2,
      GAME_CONFIG.WIDTH,
      GAME_CONFIG.HEIGHT,
      0x000000
    );
    this.overlay.setDepth(DEPTH.TRANSITION);
    this.overlay.setAlpha(0);
    this.overlay.setScrollFactor(0);
    // Origin is centred, so pin the rect's centre to the centre of the screen.
    (scene as ScreenSpaceHost).pinScreenSpace?.(
      this.overlay, GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2);
  }

  transition(onMidpoint: () => void): Promise<void> {
    return new Promise((resolve) => {
      this.scene.tweens.add({
        targets: this.overlay,
        alpha: 1,
        duration: ROOM_CONFIG.TRANSITION_DURATION,
        ease: 'Power2',
        onComplete: () => {
          onMidpoint();
          this.scene.tweens.add({
            targets: this.overlay,
            alpha: 0,
            duration: ROOM_CONFIG.TRANSITION_DURATION,
            ease: 'Power2',
            onComplete: () => resolve(),
          });
        },
      });
    });
  }
}
