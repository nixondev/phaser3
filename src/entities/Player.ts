import { Entity } from './Entity';
import { Direction } from './Direction';
import { DEPTH, PLAYER_CONFIG, GAME_CONFIG } from '@utils/Constants';
import { InputState } from '@/types';

export class Player extends Entity {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'player', 0);
    this.setDepth(DEPTH.PLAYER);
    this.setScale(1.0);

    const body = this.body as Phaser.Physics.Arcade.Body;
    // The player's asset is now 24x24 (exactly the desired render size).
    // We use a 10x8 collision box at the feet.
    body.setSize(7, 6);
    body.setOffset(5, 10);
    body.setCollideWorldBounds(true);

    this.createAnimations();
    
    // Fix scaling distortion by using integer-friendly scale if possible
    // this.setScale is already called in Entity.ts constructor.
    // However, if the user sees distortion, we might want to ensure it's not anti-aliased.
    //this.texture.setFilter(Phaser.Textures.FilterMode.NEAREST);
  }

  private createAnimations(): void {
    const dirs: { key: Direction; row: number }[] = [
      { key: Direction.DOWN, row: 0 },
      { key: Direction.LEFT, row: 1 },
      { key: Direction.RIGHT, row: 2 },
      { key: Direction.UP, row: 3 },
    ];

    for (const { key, row } of dirs) {
      const start = row * 4;

      if (!this.scene.anims.exists(`walk-${key}`)) {
        this.scene.anims.create({
          key: `walk-${key}`,
          frames: this.scene.anims.generateFrameNumbers('player', {
            frames: [start, start + 1, start + 2, start + 3],
          }),
          frameRate: PLAYER_CONFIG.ANIM_FPS,
          repeat: -1,
        });
      }

      if (!this.scene.anims.exists(`idle-${key}`)) {
        this.scene.anims.create({
          key: `idle-${key}`,
          frames: [{ key: 'player', frame: start }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }
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
      this.play(`walk-${this.direction}`, true);
    } else {
      this.play(`idle-${this.direction}`, true);
    }
  }

  playIdle(): void {
    this.play(`idle-${this.direction}`, true);
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
    let offsetY = 1;

    switch (this.direction) {
      case Direction.UP:
        offsetX = 3;
        offsetY = -1;
        break;
      case Direction.DOWN:
        offsetX = -3;
        offsetY = 3;
        break;
      case Direction.LEFT:
        offsetX = -2;
        break;
      case Direction.RIGHT:
        offsetX = 2;
        break;
    }

    return {
      x: this.x + offsetX,
      y: this.y + offsetY,
    };
  }
}
