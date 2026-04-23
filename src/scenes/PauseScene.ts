import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';

export class PauseScene extends Phaser.Scene {
  constructor() {
    super(SCENES.PAUSE);
  }

  create(): void {
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6);

    this.add
      .text(w / 2, h / 2 - 16, 'PAUSED', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(w / 2, h / 2 + 16, 'Press ESC to resume', {
        fontSize: '10px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: hint,
      alpha: 0.4,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.input.keyboard!.once('keydown-ESC', () => {
      this.scene.stop();
      this.scene.resume(SCENES.GAME);
    });
  }
}
