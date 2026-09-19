import roomsData from '@/data/rooms.json';

/**
 * Global camera zoom — rooms.json top-level `cameraZoom`.
 *
 * How magnified the world renders inside the fixed 1280×960 canvas. The window
 * never changes size; zoom only decides how much world fits in it:
 *
 *   visible world = 1280/zoom × 960/zoom px  =  (20/zoom) × (15/zoom) tiles
 *
 * Scales EVERYTHING in world space uniformly (tiles, characters, items, edge
 * shadows) — unlike `spriteScale`, which changes only how big characters are
 * *relative to* the tiles. Use the two together: zoom sets how close the camera
 * is, spriteScale sets the character-to-architecture proportion.
 *
 * Purely a view setting — physics, interact ranges, door zones and room
 * dimensions are all world units and are unaffected.
 *
 * Adjustable from the ? editor's View panel (live); persisted via
 * /__editor/save-camera-zoom. The game reads it in GameScene.setupCamera(),
 * so a running game picks it up on the next room load.
 */
export const CAMERA_ZOOM_RANGE = { MIN: 0.25, MAX: 4 } as const;

let current: number = clamp((roomsData as { cameraZoom?: number }).cameraZoom ?? 1);

function clamp(v: number): number {
  return Math.min(CAMERA_ZOOM_RANGE.MAX, Math.max(CAMERA_ZOOM_RANGE.MIN, v));
}

export function getCameraZoom(): number {
  return current;
}

export function setCameraZoom(v: number): number {
  current = clamp(v);
  return current;
}
