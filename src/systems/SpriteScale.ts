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
 * Adjustable from the $ editor's SIZE slider (live in its 1:1 preview);
 * persisted via /__editor/save-sprite-scale. The game reads it at entity
 * construction, so a running game needs a reload to reflect a new value.
 */
const MIN = 0.5, MAX = 2;

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
