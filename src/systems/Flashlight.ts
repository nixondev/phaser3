import Phaser from 'phaser';
import { DEPTH, FLASHLIGHT_CONFIG } from '@utils/Constants';

const { RANGE, HALF_ANGLE, BATTERY_MAX, BATTERY_DRAIN_RATE } = FLASHLIGHT_CONFIG;
const CONE_STEPS = 20; // arc resolution

export class Flashlight {
  private scene: Phaser.Scene;
  private graphics: Phaser.GameObjects.Graphics;
  private maskGraphics: Phaser.GameObjects.Graphics;
  private cachedMask: Phaser.Display.Masks.GeometryMask | null = null;
  private on: boolean = false;
  private charge: number = BATTERY_MAX;

  // Last known position and angle, used for cone checks
  private lastX: number = 0;
  private lastY: number = 0;
  private lastAngle: number = 0;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(DEPTH.LIGHTING + 1); // Render beam glow on top of darkness
    this.maskGraphics = scene.add.graphics();
    this.maskGraphics.setVisible(false);
  }

  toggle(): void {
    if (!this.on && this.charge <= 0) return; // Cannot turn on if no charge
    this.on = !this.on;
    if (!this.on) this.graphics.clear();
  }

  turnOff(): void {
    if (!this.on) return;
    this.on = false;
    this.graphics.clear();
    this.maskGraphics.clear();
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

  update(originX: number, originY: number, facingAngle: number, delta: number): void {
    this.lastX     = originX;
    this.lastY     = originY;
    this.lastAngle = facingAngle;

    if (this.on) {
      this.charge -= (BATTERY_DRAIN_RATE * delta) / 1000;
      if (this.charge <= 0) {
        this.charge = 0;
        this.on = false;
        this.graphics.clear();
        this.maskGraphics.clear();
      }
      this.scene.events.emit('flashlight-battery', this.batteryPercent);
    }

    this.graphics.clear();
    this.maskGraphics.clear();
    if (!this.on) return;

    // Subtle edge glow — just enough to hint the cone boundary
    this.graphics.fillStyle(0xFFFFCC, 0.03);
    this.drawCone(this.graphics, originX, originY, facingAngle, RANGE * 1.15, HALF_ANGLE * 1.3);

    // Prepare mask graphics (for RenderTexture erase)
    this.maskGraphics.fillStyle(0xffffff, 0.3);
    this.drawCone(this.maskGraphics, originX, originY, facingAngle, RANGE * 1.2, HALF_ANGLE * 1.4);
    this.maskGraphics.fillStyle(0xffffff, 0.7);
    this.drawCone(this.maskGraphics, originX, originY, facingAngle, RANGE, HALF_ANGLE);
    this.maskGraphics.fillStyle(0xffffff, 1.0);
    this.drawCone(this.maskGraphics, originX, originY, facingAngle, RANGE * 0.7, HALF_ANGLE * 0.5);
  }

  /** Erases the flashlight cone from a screen-space RenderTexture.
   *  Pass screen-space coordinates so no scroll math is needed.
   */
  renderMaskScreenSpace(target: Phaser.GameObjects.RenderTexture, screenX: number, screenY: number): void {
    if (!this.on) return;
    this.maskGraphics.clear();
    this.maskGraphics.fillStyle(0xffffff, 0.45);
    this.drawCone(this.maskGraphics, screenX, screenY, this.lastAngle, RANGE * 1.2, HALF_ANGLE * 1.4);
    this.maskGraphics.fillStyle(0xffffff, 0.95);
    this.drawCone(this.maskGraphics, screenX, screenY, this.lastAngle, RANGE, HALF_ANGLE);
    this.maskGraphics.fillStyle(0xffffff, 1.0);
    this.drawCone(this.maskGraphics, screenX, screenY, this.lastAngle, RANGE * 0.7, HALF_ANGLE * 0.5);
    target.erase(this.maskGraphics);
  }

  private drawCone(
    g: Phaser.GameObjects.Graphics,
    x: number, y: number,
    angle: number,
    range: number,
    halfAngle: number,
  ): void {
    // Start the cone slightly ahead of the origin to avoid lighting the player
    const startDist = 4;
    const startX = x + Math.cos(angle) * startDist;
    const startY = y + Math.sin(angle) * startDist;

    g.beginPath();
    g.moveTo(startX, startY);
    for (let i = 0; i <= CONE_STEPS; i++) {
      const a = angle - halfAngle + (2 * halfAngle * i / CONE_STEPS);
      g.lineTo(startX + Math.cos(a) * range, startY + Math.sin(a) * range);
    }
    g.closePath();
    g.fillPath();
  }

  /** True if the point (tx, ty) falls within the current cone. */
  isInCone(tx: number, ty: number): boolean {
    if (!this.on) return false;

    // Use the stored origin for distance and angle checks
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

  /** Returns a GeometryMask for the current cone. Created once and reused. */
  getMask(): Phaser.Display.Masks.GeometryMask | null {
    if (!this.on) return null;
    if (!this.cachedMask) {
      this.cachedMask = this.maskGraphics.createGeometryMask();
    }
    return this.cachedMask;
  }

  destroy(): void {
    this.cachedMask?.destroy();
    this.cachedMask = null;
    this.graphics.destroy();
    this.maskGraphics.destroy();
  }
}
