import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, DEPTH } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { RainEffect } from '@systems/RainEffect';

const TEXT_DEPTH = DEPTH.UI;

interface Cloud {
  gfx: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  speed: number;
  w: number;
  h: number;
}

export class MenuScene extends Phaser.Scene {
  private started = false;
  private rain: RainEffect | null = null;
  private clouds: Cloud[] = [];

  constructor() {
    super(SCENES.MENU);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().playMusic('bgm-title', true, 0.5);
    this.started = false;
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    this.buildClouds();

    this.rain = new RainEffect(this, 'hard');
    this.rain.show();

    // Subtle dark overlay between rain and text for readability
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.35)
      .setDepth(DEPTH.WEATHER + 1)
      .setScrollFactor(0);

    this.add
      .text(w / 2, h / 3, 'WARDEN', {
        fontSize: '112px',
        color: '#ffffff',
        fontFamily: 'monospace',
        fontStyle: 'bold',
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    const prompt = this.add
      .text(w / 2, h * 0.55, 'Press SPACE or ENTER', {
        fontSize: '40px',
        color: '#aaaaaa',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

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
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    this.add
      .text(w / 2, h - 56, '? — room editor     # — tile editor', {
        fontSize: '32px',
        color: '#888866',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.rain?.destroy();
      this.rain = null;
      this.clouds.forEach(c => c.gfx.destroy());
      this.clouds = [];
    });

    this.input.keyboard!.on('keydown-SPACE', () => this.startGame());
    this.input.keyboard!.on('keydown-ENTER', () => this.startGame());
    this.input.keyboard!.on('keydown', (event: KeyboardEvent) => {
      if (event.key === '?') this.openEditor();
      if (event.key === '#') this.openTileEditor();
    });
    this.input.on('pointerdown', () => this.resumeAudio());
  }

  update(_time: number, delta: number): void {
    this.rain?.update(delta);
    this.updateClouds(delta);
  }

  // ── Clouds ──────────────────────────────────────────────────────────────

  private buildClouds(): void {
    // Three loose rows of large storm clouds, staggered across the full width
    const defs: Array<[x: number, y: number, speed: number, w: number, h: number]> = [
      // top row — left half, right half
      [  -40,   8, 14, 640, 176],
      [  640,   0, 22, 660, 176],
      // middle row — staggered
      [  260, 200, 28, 660, 200],
      [  940, 192, 16, 640, 200],
      // lower row
      [  -80, 376, 24, 640, 184],
      [  600, 368, 12, 660, 192],
    ];
    for (const [x, y, speed, cw, ch] of defs) {
      const gfx = this.add.graphics();
      gfx.setScrollFactor(0);
      gfx.setDepth(DEPTH.WEATHER - 1);
      this.drawCloud(gfx, cw, ch);
      gfx.setPosition(x, y);
      this.clouds.push({ gfx, x, y, speed, w: cw, h: ch });
    }
  }

  private drawCloud(gfx: Phaser.GameObjects.Graphics, w: number, h: number): void {
    // Blocky pixel-art storm cloud
    gfx.fillStyle(0x111620, 0.92);
    gfx.fillRect(0,          h * 0.45, w,          h * 0.55); // base
    gfx.fillRect(w * 0.08,   h * 0.22, w * 0.32,   h * 0.40); // left bump
    gfx.fillRect(w * 0.35,   0,        w * 0.40,   h * 0.55); // centre bump (tallest)
    gfx.fillRect(w * 0.68,   h * 0.28, w * 0.26,   h * 0.38); // right bump
    // Slightly lighter top edge for a hint of volume
    gfx.fillStyle(0x1e2840, 0.45);
    gfx.fillRect(w * 0.35,   0,        w * 0.40,   h * 0.12);
    gfx.fillRect(w * 0.08,   h * 0.22, w * 0.32,   h * 0.10);
  }

  private updateClouds(delta: number): void {
    const dt = delta / 1000;
    const W  = GAME_CONFIG.WIDTH;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > W + c.w) c.x = -c.w;
      c.gfx.setPosition(c.x, c.y);
    }
  }

  // ── Navigation ──────────────────────────────────────────────────────────

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
