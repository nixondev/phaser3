import Phaser from 'phaser';
import { DEPTH, FLASHLIGHT_CONFIG } from '@utils/Constants';

const { RANGE, HALF_ANGLE, BATTERY_MAX, BATTERY_DRAIN_RATE } = FLASHLIGHT_CONFIG;
const CONE_STEPS = 20; // arc resolution

export class Flashlight {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private on: boolean = true;
  private charge: number = BATTERY_MAX;

  // Last known position and angle, used for cone checks
  private lastX: number = 0;
  private lastY: number = 0;
  private lastAngle: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(DEPTH.PLAYER - 1); // render just behind player sprite
  }

  toggle(): void {
    if (!this.on && this.charge <= 0) return; // Cannot turn on if no charge
    this.on = !this.on;
    if (!this.on) this.graphics.clear();
  }

  get isOn(): boolean {
    return this.on;
  }

  get batteryPercent(): number {
    return (this.charge / BATTERY_MAX) * 100;
  }

  recharge(): void {
    this.charge = BATTERY_MAX;
    this.scene.events.emit('flashlight-battery', this.batteryPercent);
  }

  update(playerX: number, playerY: number, facingAngle: number, delta: number): void {
    this.lastX     = playerX;
    this.lastY     = playerY;
    this.lastAngle = facingAngle;

    if (this.on) {
      this.charge -= (BATTERY_DRAIN_RATE * delta) / 1000;
      if (this.charge <= 0) {
        this.charge = 0;
        this.on = false;
        this.graphics.clear();
      }
      this.scene.events.emit('flashlight-battery', this.batteryPercent);
    }

    this.graphics.clear();
    if (!this.on) return;

    // Outer glow — wide, very faint
    this.graphics.fillStyle(0xFFFFCC, 0.06);
    this.drawCone(playerX, playerY, facingAngle, RANGE * 1.15, HALF_ANGLE * 1.3);

    // Main beam — normal range
    this.graphics.fillStyle(0xFFFFCC, 0.16);
    this.drawCone(playerX, playerY, facingAngle, RANGE, HALF_ANGLE);

    // Bright core — narrow inner band
    this.graphics.fillStyle(0xFFFFEE, 0.12);
    this.drawCone(playerX, playerY, facingAngle, RANGE * 0.6, HALF_ANGLE * 0.45);
  }

  private drawCone(
    x: number, y: number,
    angle: number,
    range: number,
    halfAngle: number,
  ): void {
    this.graphics.beginPath();
    this.graphics.moveTo(x, y);
    for (let i = 0; i <= CONE_STEPS; i++) {
      const a = angle - halfAngle + (2 * halfAngle * i / CONE_STEPS);
      this.graphics.lineTo(x + Math.cos(a) * range, y + Math.sin(a) * range);
    }
    this.graphics.closePath();
    this.graphics.fillPath();
  }

  /** True if the point (tx, ty) falls within the current cone. */
  isInCone(tx: number, ty: number): boolean {
    if (!this.on) return false;

    const dx   = tx - this.lastX;
    const dy   = ty - this.lastY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > RANGE || dist < 1) return false;

    // Angle difference between facing direction and target direction
    const targetAngle = Math.atan2(dy, dx);
    let diff = Math.abs(targetAngle - this.lastAngle);
    if (diff > Math.PI) diff = Math.PI * 2 - diff;

    return diff <= HALF_ANGLE;
  }

  destroy(): void {
    this.graphics.destroy();
  }
}
