import roomsData from '@/data/rooms.json';

/**
 * Global character-sprite render scale — rooms.json top-level `spriteScale`.
 *
 * Governs how big ALL character sprites draw in world space: Player,
 * Afflicted, and parked roster bodies (items/signs/tiles are untouched).
 * Purely visual — Player/Afflicted divide their physics setSize/setOffset by
 * this value (arcade bodies multiply both by sprite scale), so collision,
 * interact ranges and touch-death stay identical at any size.
 *
 * Adjustable from the $ editor's SIZE slider (live in its 1:1 preview) and
 * from the ? editor's View panel (live in the room view, next to camera zoom —
 * the two together set how the world reads). Persisted via
 * /__editor/save-sprite-scale. The game reads it at entity construction, so a
 * running game needs a reload to reflect a new value.
 *
 * Distinct from `cameraZoom` (see CameraZoom.ts): zoom magnifies EVERYTHING,
 * this changes only how big characters are relative to the tiles.
 */
/** Deliberately wide so extreme proportions can be tried in the editors. */
export const SPRITE_SCALE_RANGE = { MIN: 0.25, MAX: 4 } as const;
const { MIN, MAX } = SPRITE_SCALE_RANGE;

let current: number = clamp((roomsData as { spriteScale?: number }).spriteScale ?? 1);

function clamp(v: number): number {
  return Math.min(MAX, Math.max(MIN, v));
}

export function getSpriteScale(): number {
  return current;
}

export function setSpriteScale(v: number): number {
  current = clamp(v);
  return current;
}
