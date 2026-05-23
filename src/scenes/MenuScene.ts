import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, DEPTH } from '@utils/Constants';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { RainEffect } from '@systems/RainEffect';
import { CloudEffect } from '@systems/CloudEffect';

const TEXT_DEPTH = DEPTH.UI;

interface WanderSprite {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  timer: number;
  changeInterval: number;
}

export class MenuScene extends Phaser.Scene {
  private started = false;
  private rain: RainEffect | null = null;
  private cloudEffect: CloudEffect | null = null;
  private wanderers: WanderSprite[] = [];

  constructor() {
    super(SCENES.MENU);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().playMusic('bgm-title', true, 0.5);
    this.started = false;
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    this.buildTitleRoom();

    this.cloudEffect = new CloudEffect(this);
    this.cloudEffect.show();

    this.rain = new RainEffect(this, 'hard');
    this.rain.show();

    // Subtle dark overlay between rain and text for readability
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.35)
      .setDepth(DEPTH.WEATHER + 1)
      .setScrollFactor(0);

    this.add
      .text(w / 2, h / 3, 'WARDEN', {
        fontSize: '220px',
        fontFamily: 'VT323',
        color: '#ffffff',
        fillGradientType: 1,
        fillGradientColor1: '#ffffff',
        fillGradientColor2: '#ffffff',
        fillGradientColor3: '#88aad0',
        fillGradientColor4: '#88aad0',
        stroke: '#3a0008',
        strokeThickness: 5,
        shadow: {
          offsetX: 0,
          offsetY: 0,
          color: '#4488ff',
          blur: 24,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    const prompt = this.add
      .text(w / 2, h * 0.62, 'PRESS SPACE OR ENTER', {
        fontSize: '52px',
        fontFamily: 'VT323',
        color: '#aabbcc',
        stroke: '#1a2a3a',
        strokeThickness: 3,
        shadow: {
          offsetX: 0,
          offsetY: 0,
          color: '#4488ff',
          blur: 10,
          fill: true,
        },
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    this.tweens.add({
      targets: prompt,
      alpha: 0.2,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.add
      .text(w / 2, h - 80, 'ARROW KEYS / WASD TO MOVE', {
        fontSize: '36px',
        fontFamily: 'VT323',
        color: '#556677',
        stroke: '#0a0a14',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.rain?.destroy();
      this.rain = null;
      this.cloudEffect?.destroy();
      this.cloudEffect = null;
      this.wanderers = [];
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
    this.cloudEffect?.update(delta);
    this.updateWanderers(delta);
  }

  // ── Title room background ────────────────────────────────────────────────

  private buildTitleRoom(): void {
    const map = this.make.tilemap({ key: 'title-screen' });
    const ts = map.addTilesetImage('tileset', 'tileset');
    if (ts) {
      map.createLayer('Ground',    ts, 0, 0)?.setDepth(DEPTH.GROUND).setScrollFactor(0);
      map.createLayer('Collision', ts, 0, 0)?.setDepth(DEPTH.GROUND + 1).setScrollFactor(0);
      map.createLayer('Above',     ts, 0, 0)?.setDepth(DEPTH.ABOVE).setScrollFactor(0);
    } else {
      console.warn('[MenuScene] title-screen tilemap not in cache — restart dev server');
    }

    this.wanderers.push(this.makeWanderer(320, 450, 'afflicted-walker'));
    this.wanderers.push(this.makeWanderer(900, 560, 'afflicted-husk'));
  }

  private makeWanderer(x: number, y: number, texture: string): WanderSprite {
    const sprite = this.add.sprite(x, y, texture, 0);
    sprite.setDepth(DEPTH.ENTITIES);
    sprite.setTint(0x4466cc);
    sprite.setScrollFactor(0);
    const angle = Math.random() * Math.PI * 2;
    const speed = 80 + Math.random() * 40;
    return {
      sprite,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      timer: 0,
      changeInterval: 2000 + Math.random() * 3000,
    };
  }

  private updateWanderers(delta: number): void {
    const dt = delta / 1000;
    const margin = 128;
    const W = GAME_CONFIG.WIDTH;
    const H = GAME_CONFIG.HEIGHT;

    for (const w of this.wanderers) {
      w.timer += delta;
      if (w.timer >= w.changeInterval) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 80 + Math.random() * 40;
        w.vx = Math.cos(angle) * speed;
        w.vy = Math.sin(angle) * speed;
        w.timer = 0;
        w.changeInterval = 2000 + Math.random() * 3000;
      }

      w.sprite.x += w.vx * dt;
      w.sprite.y += w.vy * dt;

      if (w.sprite.x < margin)     { w.sprite.x = margin;     w.vx =  Math.abs(w.vx); }
      if (w.sprite.x > W - margin) { w.sprite.x = W - margin; w.vx = -Math.abs(w.vx); }
      if (w.sprite.y < margin)     { w.sprite.y = margin;     w.vy =  Math.abs(w.vy); }
      if (w.sprite.y > H - margin) { w.sprite.y = H - margin; w.vy = -Math.abs(w.vy); }
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
