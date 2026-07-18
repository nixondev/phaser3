import { Entity } from './Entity';
import { Direction } from './Direction';
import { DEPTH, PLAYER_CONFIG } from '@utils/Constants';
import { InputState } from '@/types';
import { ensureCharacterAnims } from './animHelpers';

export class Player extends Entity {
  constructor(scene: Phaser.Scene, x: number, y: number, sheetKey: string) {
    super(scene, x, y, sheetKey, 0);
    this.setDepth(DEPTH.PLAYER);
    this.setScale(1.0);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(28, 24);
    body.setOffset(18, 38);
    body.setCollideWorldBounds(true);

    ensureCharacterAnims(scene, sheetKey);
  }

  update(input: InputState): void {
    let vx = 0;
    let vy = 0;

    if (input.left) vx -= 1;
    if (input.right) vx += 1;
    if (input.up) vy -= 1;
    if (input.down) vy += 1;

    if (vx !== 0 && vy !== 0) {
      vx *= Math.SQRT1_2;
      vy *= Math.SQRT1_2;
    }

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(vx * PLAYER_CONFIG.SPEED, vy * PLAYER_CONFIG.SPEED);

    if (vx !== 0 || vy !== 0) {
      if (Math.abs(vy) >= Math.abs(vx)) {
        this.direction = vy < 0 ? Direction.UP : Direction.DOWN;
      } else {
        this.direction = vx < 0 ? Direction.LEFT : Direction.RIGHT;
      }
      this.play(`${this.texture.key}-walk-${this.direction}`, true);
    } else {
      this.play(`${this.texture.key}-idle-${this.direction}`, true);
    }
  }

  playIdle(): void {
    this.play(`${this.texture.key}-idle-${this.direction}`, true);
  }

  /** Swap this player onto another character sheet (character switch / skin change). */
  setSheet(sheetKey: string): void {
    ensureCharacterAnims(this.scene, sheetKey);
    this.setTexture(sheetKey, 0);
    this.play(`${sheetKey}-idle-${this.direction}`, true);
  }

  getCurrentTextureKey(): string {
    return this.texture.key;
  }

  getFacingAngle(): number {
    switch (this.direction) {
      case Direction.UP:    return -Math.PI / 2;
      case Direction.DOWN:  return  Math.PI / 2;
      case Direction.LEFT:  return  Math.PI;
      case Direction.RIGHT: return  0;
    }
  }

  /** Gets the flashlight origin point. */
  getFlashlightOrigin(): { x: number; y: number } {
    let offsetX = 0;
    let offsetY = 4;

    switch (this.direction) {
      case Direction.UP:
        offsetX = 12;
        offsetY = -4;
        break;
      case Direction.DOWN:
        offsetX = -12;
        offsetY = 12;
        break;
      case Direction.LEFT:
        offsetX = -8;
        break;
      case Direction.RIGHT:
        offsetX = 8;
        break;
    }

    return {
      x: this.x + offsetX,
      y: this.y + offsetY,
    };
  }
}
