import Phaser from 'phaser';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';

interface Cloud {
  gfx: Phaser.GameObjects.Graphics;
  x: number;
  y: number;
  speed: number;
  w: number;
  h: number;
}

export class CloudEffect {
  private clouds: Cloud[] = [];
  private running = false;

  constructor(scene: Phaser.Scene) {
    // Three rows, two clouds each. Same speed per row so spacing never drifts.
    // Random phase start per row so each load looks different.
    const W = GAME_CONFIG.WIDTH;
    const rows: Array<[yBase: number, speed: number, w: number, h: number]> = [
      [  10, 14, 640, 176],
      [ 200, 20, 660, 200],
      [ 370, 16, 650, 184],
    ];

    for (const [yBase, speed, cw, ch] of rows) {
      const halfCycle = (W + 2 * cw) / 2;
      // Random start anywhere in the full wrap range so they scatter naturally
      const phaseA = Math.random() * (W + cw) - cw;
      const phaseB = phaseA + halfCycle;

      for (let i = 0; i < 2; i++) {
        const x = i === 0 ? phaseA : phaseB;
        // Small random y offset within the row band
        const y = yBase + (Math.random() - 0.5) * 40;
        const gfx = scene.add.graphics();
        gfx.setScrollFactor(0);
        gfx.setDepth(DEPTH.WEATHER - 1);
        CloudEffect.drawCloud(gfx, cw, ch);
        gfx.setPosition(x, y);
        gfx.setVisible(false);
        this.clouds.push({ gfx, x, y, speed, w: cw, h: ch });
      }
    }
  }

  private static drawCloud(gfx: Phaser.GameObjects.Graphics, w: number, h: number): void {
    gfx.fillStyle(0x111620, 0.92);
    gfx.fillRect(0,        h * 0.45, w,        h * 0.55);
    gfx.fillRect(w * 0.08, h * 0.22, w * 0.32, h * 0.40);
    gfx.fillRect(w * 0.35, 0,        w * 0.40, h * 0.55);
    gfx.fillRect(w * 0.68, h * 0.28, w * 0.26, h * 0.38);
    gfx.fillStyle(0x1e2840, 0.45);
    gfx.fillRect(w * 0.35, 0,        w * 0.40, h * 0.12);
    gfx.fillRect(w * 0.08, h * 0.22, w * 0.32, h * 0.10);
  }

  update(delta: number): void {
    if (!this.running) return;
    const dt = delta / 1000;
    const W = GAME_CONFIG.WIDTH;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > W + c.w) c.x = -c.w;
      c.gfx.setPosition(c.x, c.y);
    }
  }

  show(): void {
    this.running = true;
    this.clouds.forEach(c => c.gfx.setVisible(true));
  }

  hide(): void {
    this.running = false;
    this.clouds.forEach(c => c.gfx.setVisible(false));
  }

  destroy(): void {
    this.clouds.forEach(c => c.gfx.destroy());
    this.clouds = [];
  }
}
