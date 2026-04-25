import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';

export class MenuScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super(SCENES.MENU);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().playMusic('bgm-title', true, 0.5);
    this.started = false;
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    this.add
      .text(w / 2, h / 3, 'WARDEN', {
        fontSize: '28px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(w / 2, h * 0.55, 'Press SPACE or ENTER', {
        fontSize: '10px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(w / 2, h - 20, 'Arrow Keys / WASD to move', {
        fontSize: '8px',
        color: '#666666',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.input.keyboard!.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard!.on('keydown-ENTER', () => this.startGame());
    
  }


  private startGame(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start(SCENES.GAME);
    this.scene.launch(SCENES.UI);
  }
}
