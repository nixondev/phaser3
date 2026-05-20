import Phaser from 'phaser';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';
import type { WeatherEffect } from '@systems/WeatherManager';

interface Drop { x: number; y: number; speed: number; }

export class RainEffect implements WeatherEffect {
  private graphics: Phaser.GameObjects.Graphics;
  private drops: Drop[] = [];
  private running = false;
  private readonly mild: boolean;

  constructor(scene: Phaser.Scene, mode: 'mild' | 'hard') {
    this.mild = mode === 'mild';
    const W = GAME_CONFIG.WIDTH;
    const H = GAME_CONFIG.HEIGHT;
    const count = this.mild ? 80 : 160;

    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(0);
    this.graphics.setDepth(DEPTH.WEATHER);
    this.graphics.setVisible(false);

    for (let i = 0; i < count; i++) {
      this.drops.push({
        x:     Math.random() * (W + 40) - 20,
        y:     Math.random() * H,
        speed: this.mild ? 400 + Math.random() * 280 : 920 + Math.random() * 400,
      });
    }
  }

  update(delta: number): void {
    if (!this.running) return;
    const dt    = Math.min(delta, 100) / 1000;
    const W     = GAME_CONFIG.WIDTH;
    const H     = GAME_CONFIG.HEIGHT;
    // streak length and horizontal slant per vertical pixel
    const len   = this.mild ? 16 : 24;
    const slant = this.mild ? 0 : len * 0.36;   // ~20° angle for hard rain
    const alpha = this.mild ? 0.35 : 0.55;

    this.graphics.clear();
    this.graphics.lineStyle(4, 0xaaccff, alpha);

    for (const d of this.drops) {
      d.y += d.speed * dt;
      if (!this.mild) d.x += d.speed * 0.36 * dt;

      if (d.y > H + len) {
        d.y = -len;
        d.x = Math.random() * (W + 40) - 20;
      }
      if (d.x > W + 30) d.x -= W + 60;

      // Draw streak trailing behind the drop head
      this.graphics.lineBetween(d.x - slant, d.y - len, d.x, d.y);
    }
  }

  show(): void {
    this.running = true;
    this.graphics.setVisible(true);
  }

  hide(): void {
    this.running = false;
    this.graphics.clear();
    this.graphics.setVisible(false);
  }

  destroy(): void {
    this.graphics.destroy();
    this.drops = [];
  }
}
