import Phaser from 'phaser';
import { Direction } from './Direction';
import { PLAYER_CONFIG } from '@utils/Constants';

/** 4×4 sheet convention: one row per direction, 4 walk frames each. */
const DIR_ROWS: { dir: Direction; row: number }[] = [
  { dir: Direction.DOWN, row: 0 },
  { dir: Direction.LEFT, row: 1 },
  { dir: Direction.RIGHT, row: 2 },
  { dir: Direction.UP, row: 3 },
];

/**
 * Idempotently create `<sheet>-walk-<dir>` / `<sheet>-idle-<dir>` animations
 * for a 256×256 character sheet. Every character animation in the game goes
 * through this — anim keys are always prefixed with the sheet's texture key.
 */
export function ensureCharacterAnims(scene: Phaser.Scene, sheetKey: string): void {
  for (const { dir, row } of DIR_ROWS) {
    const start = row * 4;
    const walkKey = `${sheetKey}-walk-${dir}`;
    const idleKey = `${sheetKey}-idle-${dir}`;

    if (!scene.anims.exists(walkKey)) {
      scene.anims.create({
        key: walkKey,
        frames: scene.anims.generateFrameNumbers(sheetKey, {
          frames: [start, start + 1, start + 2, start + 3],
        }),
        frameRate: PLAYER_CONFIG.ANIM_FPS,
        repeat: -1,
      });
    }

    if (!scene.anims.exists(idleKey)) {
      scene.anims.create({
        key: idleKey,
        frames: [{ key: sheetKey, frame: start }],
        frameRate: 1,
        repeat: -1,
      });
    }
  }
}
