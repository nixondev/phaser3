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
    const defs: Array<[x: number, y: number, speed: number, w: number, h: number]> = [
      [  -40,   8, 14, 640, 176],
      [  640,   0, 22, 660, 176],
      [  260, 200, 28, 660, 200],
      [  940, 192, 16, 640, 200],
      [  -80, 376, 24, 640, 184],
      [  600, 368, 12, 660, 192],
    ];

    for (const [x, y, speed, cw, ch] of defs) {
      const gfx = scene.add.graphics();
      gfx.setScrollFactor(0);
      gfx.setDepth(DEPTH.WEATHER - 1);
      CloudEffect.drawCloud(gfx, cw, ch);
      gfx.setPosition(x, y);
      gfx.setVisible(false);
      this.clouds.push({ gfx, x, y, speed, w: cw, h: ch });
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
