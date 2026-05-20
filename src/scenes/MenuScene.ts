import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { RoomStateManager } from '@systems/RoomStateManager';

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
        fontSize: '112px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    const prompt = this.add
      .text(w / 2, h * 0.55, 'Press SPACE or ENTER', {
        fontSize: '40px',
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
      .text(w / 2, h - 112, 'Arrow Keys / WASD to move', {
        fontSize: '32px',
        color: '#666666',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.add
      .text(w / 2, h - 56, '? — room editor     # — tile editor', {
        fontSize: '32px',
        color: '#888866',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.input.keyboard!.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard!.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.key === '?') this.openEditor();
      if (event.key === '#') this.openTileEditor();
    });
    this.input.on('pointerdown', () => this.resumeAudio());
  }

  private openEditor(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start(SCENES.EDITOR);
  }

  private openTileEditor(): void {
    if (this.started) return;
    this.started = true;
    this.scene.start(SCENES.TILE_EDITOR);
  }

  private resumeAudio(): void {
    MusicManager.getInstance().resume();
  }

  private startGame(): void {
    if (this.started) return;
    this.resumeAudio();
    this.started = true;
    RoomStateManager.getInstance().reset();
    this.scene.start(SCENES.GAME);
    this.scene.launch(SCENES.UI);
  }
}
