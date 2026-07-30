import Phaser from 'phaser';
import { Direction } from './Direction';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';

/** Soft contact shadow drawn beneath every sprite-driven character. */
export const CHARACTER_SHADOW_FEET_OFFSET = 30; // px below sprite centre — sits at the feet (body bottom)
const CHARACTER_SHADOW_RINGS = [
  { w: 26, h: 8,  alpha: 0.34 },
  { w: 34, h: 11, alpha: 0.16 },
  { w: 42, h: 14, alpha: 0.07 },
] as const;

/** Stamp the concentric-ellipse contact shadow into a graphics object at its origin. */
export function drawCharacterShadow(g: Phaser.GameObjects.Graphics): void {
  for (const r of CHARACTER_SHADOW_RINGS) {
    g.fillStyle(0x000000, r.alpha);
    g.fillEllipse(0, 0, r.w, r.h);
  }
}

export class Entity extends Phaser.Physics.Arcade.Sprite {
  protected direction: Direction = Direction.DOWN;
  private shadow: Phaser.GameObjects.Graphics;
  private hostScene: Phaser.Scene;

  constructor(scene: Phaser.Scene, x: number, y: number, texture: string, frame?: number) {
    super(scene, x, y, texture, frame);
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(DEPTH.ENTITIES);

    // Scale down from upscaled asset size to logical game size, then apply entity scale
    this.setScale(GAME_CONFIG.ENTITY_WORLD_SCALE);

    // Concentric ellipses give a soft edge without a blur pass. Drawn once at
    // the origin; repositioned/depth-synced under the sprite each frame.
    this.shadow = scene.add.graphics();
    drawCharacterShadow(this.shadow);

    // Sync on POST_UPDATE, not preUpdate: arcade physics writes the body's
    // position back onto the sprite during POST_UPDATE, so anything reading
    // this.x earlier in the frame gets the PREVIOUS frame's position and the
    // shadow trails the sprite by one frame (very visible when fps dips).
    // Arcade's own POST_UPDATE handler is registered at scene boot, so ours
    // always runs after it.
    this.hostScene = scene;
    scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncShadow, this);
  }

  private syncShadow(): void {
    // Track the sprite, tuck just under its depth, and mirror its visibility.
    this.shadow.setPosition(this.x, this.y + CHARACTER_SHADOW_FEET_OFFSET);
    this.shadow.setDepth(this.depth - 0.5);
    this.shadow.setVisible(this.visible);
  }

  destroy(fromScene?: boolean): void {
    this.hostScene.events.off(Phaser.Scenes.Events.POST_UPDATE, this.syncShadow, this);
    this.shadow.destroy();
    super.destroy(fromScene);
  }

  getDirection(): Direction {
    return this.direction;
  }
}
