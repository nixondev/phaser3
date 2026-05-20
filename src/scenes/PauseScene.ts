import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';

export class PauseScene extends Phaser.Scene {
  private volumeText!: Phaser.GameObjects.Text;
  private volumeBar!: Phaser.GameObjects.Graphics;
  private readonly BAR_WIDTH = 400;
  private readonly BAR_HEIGHT = 40;

  constructor() {
    super(SCENES.PAUSE);
  }

  create(): void {
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.6);

    this.add
      .text(w / 2, h / 2 - 380, 'PAUSED', {
        fontSize: '80px',
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
      'ESC : Resume Game',
      '',
      '[ - / + ] : Adjust Volume'
    ].join('\n');

    this.add
      .text(w / 2, h / 2 - 60, controls, {
        fontSize: '40px',
        color: '#cccccc',
        fontFamily: 'monospace',
        align: 'center',
        lineSpacing: 16
      })
      .setOrigin(0.5);

    this.volumeBar = this.add.graphics();

    this.volumeText = this.add
      .text(w / 2, h / 2 + 220, '', {
        fontSize: '40px',
        color: '#ffdd44',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.updateVolumeUI();

    const hint = this.add
      .text(w / 2, h / 2 + 340, 'Press ESC to resume', {
        fontSize: '40px',
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

    this.input.keyboard!.on('keydown-MINUS', () => this.changeVolume(-0.1));
    this.input.keyboard!.on('keydown-PLUS', () => this.changeVolume(0.1));
    this.input.keyboard!.on('keydown-EQUALS', () => this.changeVolume(0.1));
  }

  private changeVolume(delta: number): void {
    const audio = AudioManager.getInstance();
    audio.setVolume(audio.getVolume() + delta);
    MusicManager.getInstance().resume();
    this.updateVolumeUI();
  }

  private updateVolumeUI(): void {
    const vol = AudioManager.getInstance().getVolume();
    this.volumeText.setText(`Master Volume: ${Math.round(vol * 100)}%`);

    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;
    const x = w / 2 - this.BAR_WIDTH / 2;
    const y = h / 2 + 260;

    this.volumeBar.clear();
    this.volumeBar.fillStyle(0x333333);
    this.volumeBar.fillRect(x, y, this.BAR_WIDTH, this.BAR_HEIGHT);
    this.volumeBar.fillStyle(0xffdd44);
    this.volumeBar.fillRect(x, y, this.BAR_WIDTH * vol, this.BAR_HEIGHT);
    this.volumeBar.lineStyle(4, 0xffffff, 0.5);
    this.volumeBar.strokeRect(x, y, this.BAR_WIDTH, this.BAR_HEIGHT);
  }
}
