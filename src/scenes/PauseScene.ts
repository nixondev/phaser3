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
      .text(w / 2, h / 2 - 40, 'PAUSED', {
        fontSize: '20px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const controls = [
      'WASD / Arrows : Move',
      'E : Interact / Select',
      'F : Toggle Flashlight',
      'TAB : Inventory',
      'Q : Drop Item',
      'ESC : Resume Game'
    ].join('\n');

    this.add
      .text(w / 2, h / 2 + 10, controls, {
        fontSize: '10px',
        color: '#cccccc',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 4
      })
      .setOrigin(0.5);

    const hint = this.add
      .text(w / 2, h / 2 + 60, 'Press ESC to resume', {
        fontSize: '10px',
        color: '#888888',
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
