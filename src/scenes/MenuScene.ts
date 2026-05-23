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
  private collisionLayer: Phaser.Tilemaps.TilemapLayer | null = null;
  private edgeShadows?: Phaser.GameObjects.RenderTexture;

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

    const wardTitle = this.add
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
      } as any)
      .setOrigin(0.5)
      .setDepth(TEXT_DEPTH);

    // Sporadic glitch flash — single or double, three colour variants
    const FLASH_COLORS = [
      { r: 184, g: 255, b: 48  },  // chartreuse-lime
      { r: 120, g: 255, b: 100 },  // electric lime (greener)
      { r: 236, g: 255, b: 28  },  // acid yellow
    ];

    const doFlash = (color: { r: number; g: number; b: number }, onDone: () => void) => {
      this.tweens.addCounter({
        from: 0, to: 100,
        duration: 70,
        yoyo: true,
        ease: 'Sine.easeOut',
        onUpdate: (tween) => {
          const t = (tween.getValue() ?? 0) / 100;
          const r = Math.round(255 + (color.r - 255) * t);
          const g = Math.round(255 + (color.g - 255) * t);
          const b = Math.round(255 + (color.b - 255) * t);
          wardTitle.setTint(Phaser.Display.Color.GetColor(r, g, b));
        },
        onComplete: () => {
          wardTitle.setTint(0xffffff);
          onDone();
        },
      });
    };

    const scheduleFlash = () => {
      const delay = 800 + Math.random() * 4200;
      this.time.delayedCall(delay, () => {
        if (!wardTitle.active) return;
        const pick = () => FLASH_COLORS[Math.floor(Math.random() * FLASH_COLORS.length)];
        const color1 = pick();

        if (Math.random() < 0.35) {
          // Double flash: two different colours with a brief glitch gap
          let color2 = pick();
          while (color2 === color1) color2 = pick();
          doFlash(color1, () => {
            this.time.delayedCall(30 + Math.random() * 70, () => {
              if (!wardTitle.active) return;
              doFlash(color2, scheduleFlash);
            });
          });
        } else {
          doFlash(color1, scheduleFlash);
        }
      });
    };
    scheduleFlash();

    const prompt = this.add
      .text(w / 2, h * 0.62, 'PRESS SPACE OR ENTER', {
        fontSize: '20px',
        fontFamily: 'Silkscreen',
        color: '#aabbcc',
        stroke: '#1a2a3a',
        strokeThickness: 2,
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
      alpha: 0.55,
      duration: 1100,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.rain?.destroy();
      this.rain = null;
      this.cloudEffect?.destroy();
      this.cloudEffect = null;
      this.wanderers = [];
      this.edgeShadows?.destroy();
      this.edgeShadows = undefined;
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
      // Depth assigned by convention; any extra layers slot in between
      const layerDepths: Record<string, number> = {
        Ground:    DEPTH.GROUND,
        Collision: DEPTH.GROUND + 1,
        Above:     DEPTH.ABOVE,
      };

      for (const layerData of map.layers) {
        const depth = layerDepths[layerData.name] ?? DEPTH.GROUND + 2;
        const layer = map.createLayer(layerData.name, ts, 0, 0);
        if (!layer) continue;
        layer.setDepth(depth).setScrollFactor(0);
        if (layerData.name === 'Collision') {
          this.collisionLayer = layer;
        }
      }
    } else {
      console.warn('[MenuScene] title-screen tilemap not in cache — restart dev server');
    }

    this.buildEdgeShadows(map.width, map.height);

    this.wanderers.push(this.makeWanderer(320, 450, 'afflicted-walker', 0x5577cc));
    this.wanderers.push(this.makeWanderer(900, 560, 'afflicted-husk',   0x997755));
  }

  private buildEdgeShadows(mapWidth: number, mapHeight: number): void {
    if (this.edgeShadows) {
      this.edgeShadows.destroy();
      this.edgeShadows = undefined;
    }
    if (!this.collisionLayer) return;

    const TILE = GAME_CONFIG.TILE_SIZE;
    const roomW = mapWidth * TILE;
    const roomH = mapHeight * TILE;

    const rt = this.add.renderTexture(0, 0, roomW, roomH);
    rt.setOrigin(0, 0);
    rt.setDepth(DEPTH.GROUND + 0.5);
    rt.setScrollFactor(0);
    rt.setAlpha(0.75);

    const gfx = this.make.graphics();
    gfx.fillStyle(0x000000, 1);

    const layerData = this.collisionLayer.layer.data;
    for (let ty = 0; ty < mapHeight; ty++) {
      for (let tx = 0; tx < mapWidth; tx++) {
        const tile = layerData[ty]?.[tx];
        if (!tile || tile.index < 0) continue;
        gfx.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }

    rt.draw(gfx, 0, 0);
    gfx.destroy();

    rt.postFX.addBlur(100, 25, 25, 0.2, 0x000000, 5);

    this.edgeShadows = rt;
  }

  private makeWanderer(x: number, y: number, texture: string, tint: number): WanderSprite {
    const sprite = this.add.sprite(x, y, texture, 0);
    sprite.setDepth(DEPTH.ENTITIES);
    sprite.setTint(tint);
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

      const nx = w.sprite.x + w.vx * dt;
      const ny = w.sprite.y + w.vy * dt;

      const hitX = this.isSolid(nx, w.sprite.y);
      const hitY = this.isSolid(w.sprite.x, ny);

      if (hitX) { w.vx = -w.vx; } else { w.sprite.x = nx; }
      if (hitY) { w.vy = -w.vy; } else { w.sprite.y = ny; }

      // Hard screen-edge clamp as fallback
      if (w.sprite.x < margin)     { w.sprite.x = margin;     w.vx =  Math.abs(w.vx); }
      if (w.sprite.x > W - margin) { w.sprite.x = W - margin; w.vx = -Math.abs(w.vx); }
      if (w.sprite.y < margin)     { w.sprite.y = margin;     w.vy =  Math.abs(w.vy); }
      if (w.sprite.y > H - margin) { w.sprite.y = H - margin; w.vy = -Math.abs(w.vy); }
    }
  }

  private isSolid(x: number, y: number): boolean {
    if (!this.collisionLayer) return false;
    const tile = this.collisionLayer.getTileAtWorldXY(x, y);
    return tile !== null && tile.index > 0;
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
