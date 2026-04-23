import Phaser from 'phaser';
import { Direction } from './Direction';
import { DEPTH } from '@utils/Constants';

export class Entity extends Phaser.Physics.Arcade.Sprite {
  protected direction: Direction = Direction.DOWN;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: number) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.ENTITIES);
  }

  getDirection(): Direction {
    return this.direction;
  }
}
