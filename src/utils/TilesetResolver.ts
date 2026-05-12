/**
 * Resolves a (tileFrame, tilesetKey) pair to the Phaser texture key and
 * frame index needed to render that tile as a sprite.
 *
 * Convention
 * ----------
 * - The core tileset is always named 'tileset' and its spritesheet key is
 *   'tileset-sprites'. All existing tileFrame values (0-indexed) reference
 *   this tileset when tilesetKey is omitted.
 * - Additional tilesets are named by their file stem (e.g. 'clinic-tiles')
 *   and their spritesheet key is '<name>-sprites'. A room-specific tile
 *   uses tilesetKey: 'clinic-tiles' with a 0-indexed local frame.
 *
 * Why local frames, not GIDs?
 * ---------------------------
 * tileFrame in rooms.json has always been the 0-indexed spritesheet frame —
 * what you see in the palette. Keeping that convention means existing content
 * never needs to change. The tilemap layer data uses GIDs (Tiled format) and
 * Phaser handles GID→local-frame automatically via firstgid offsets.
 */
export function resolveTileSprite(
  tileFrame: number,
  tilesetKey?: string,
): { key: string; frame: number } {
  const key = tilesetKey ? `${tilesetKey}-sprites` : 'tileset-sprites';
  return { key, frame: tileFrame };
}

/** Derive the image key (used in Phaser's texture cache) from a tileset name. */
export function tilesetImageKey(name: string): string {
  return name; // image key === tileset name by convention
}

/** Derive the spritesheet key from a tileset name. */
export function tilesetSpritesheetKey(name: string): string {
  return name === 'tileset' ? 'tileset-sprites' : `${name}-sprites`;
}
