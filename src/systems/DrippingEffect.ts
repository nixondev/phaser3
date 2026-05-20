import Phaser from 'phaser';
import { DEPTH } from '@utils/Constants';
import type { WeatherEffect } from '@systems/WeatherManager';

interface Drip {
  x: number;
  y: number;
  originY: number;
  maxY: number;
  speed: number;
  timer: number;
  delay: number;
  active: boolean;
}

function scatterPositions(scene: Phaser.Scene): Array<{ x: number; y: number }> {
  const b = scene.physics.world.bounds;
  return [0.18, 0.38, 0.61, 0.82].map(t => ({
    x: Math.floor(b.width  * t),
    y: Math.floor(b.height * 0.08),
  }));
}

export class DrippingEffect implements WeatherEffect {
  private graphics: Phaser.GameObjects.Graphics;
  private drips: Drip[] = [];
  private running = false;

  constructor(scene: Phaser.Scene, positions: Array<{ x: number; y: number }>) {
    this.graphics = scene.add.graphics();
    this.graphics.setScrollFactor(1);
    this.graphics.setDepth(DEPTH.WEATHER);
    this.graphics.setVisible(false);

    const pts = positions.length > 0 ? positions : scatterPositions(scene);
    const b = scene.physics.world.bounds;

    for (const p of pts) {
      this.drips.push({
        x:       p.x,
        y:       p.y,
        originY: p.y,
        maxY:    Math.min(p.y + Phaser.Math.Between(80, 192), b.height - 16),
        speed:   Phaser.Math.Between(120, 240),
        timer:   0,
        delay:   Phaser.Math.Between(800, 3500),
        active:  false,
      });
    }
  }

  update(delta: number): void {
    if (!this.running) return;
    const dt = Math.min(delta, 100) / 1000;

    this.graphics.clear();
    this.graphics.fillStyle(0xaaccff, 0.7);

    for (const d of this.drips) {
      if (!d.active) {
        d.timer += delta;
        if (d.timer >= d.delay) {
          d.active = true;
          d.y = d.originY;
          d.timer = 0;
          d.delay = Phaser.Math.Between(800, 3500);
        }
        continue;
      }

      d.y += d.speed * dt;
      // Draw an 8×8 drop
      this.graphics.fillRect(d.x - 4, d.y - 4, 8, 8);

      if (d.y >= d.maxY) {
        d.active = false;
        d.y = d.originY;
      }
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
    this.drips = [];
  }
}
