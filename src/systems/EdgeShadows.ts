import Phaser from 'phaser';
import roomsData from '@/data/rooms.json';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';
import { tilesetSpritesheetKey } from '@utils/TilesetResolver';
import { EdgeShadowSettings } from '@/types';

/**
 * Edge shadows — the soft dark rim around collision geometry that makes
 * walls read as raised above the floor. One builder for all three hosts
 * (GameScene, the ? editor's actual view, MenuScene) so the look can't
 * drift, fed by BOTH collision sources: real Collision-layer tiles and
 * color tiles painted on the Collision layer (which replace real tiles
 * and previously cast no shadow at all).
 *
 * Settings are global (rooms.json top-level `edgeShadows`), adjustable
 * live from the ? editor and persisted via /__editor/save-shadows.
 */

const DEFAULTS: EdgeShadowSettings = {
  enabled: true,
  alpha: 0.6,
  blurOn: true,
  blurQuality: 1,
  blurX: 20,
  blurY: 20,
  blurStrength: 1,
  blurSteps: 5,
  shadowOn: false,
  shadowX: 4,
  shadowY: -4,
  shadowDecay: 0.006,
  shadowPower: 1,
  shadowSamples: 6,
  shadowIntensity: 0.5,
  borderOn: false,
  borderWidth: 3,
  borderJitter: 4,
  borderGrain: 8,
  borderAlpha: 0.8,
};

let current: EdgeShadowSettings = {
  ...DEFAULTS,
  ...((roomsData as { edgeShadows?: Partial<EdgeShadowSettings> }).edgeShadows ?? {}),
};

export function getEdgeShadowSettings(): EdgeShadowSettings {
  return { ...current };
}

export function setEdgeShadowSettings(patch: Partial<EdgeShadowSettings>): EdgeShadowSettings {
  current = { ...current, ...patch };
  return { ...current };
}

export interface EdgeShadowSource {
  widthTiles: number;
  heightTiles: number;
  /** Collision tilemap layer data — tiles with index > 0 cast shadow. */
  collisionData: Phaser.Tilemaps.Tile[][];
  /** Required for 'silhouette' style: resolves each tile's spritesheet frame. */
  tilesets?: Phaser.Tilemaps.Tileset[];
  /** Color-collision cells (tile coords) — shadow like solid tiles. */
  colorCells?: { x: number; y: number }[];
}

export interface EdgeShadowOptions {
  /** 'silhouette' stamps the actual tile art tinted black; 'blocks' fills plain squares. */
  style?: 'silhouette' | 'blocks';
  scrollFactor?: number;
  /** Raw postFX blur override (MenuScene's heavy vignette); default derives from settings.blur. */
  fx?: { quality: number; x: number; y: number; strength: number; color: number; steps: number };
}

/**
 * True if a room-sized RenderTexture is within the GPU's texture limit.
 * Warns (once per size) with the numbers needed to act on it.
 */
const warnedSizes = new Set<string>();
function fitsInGpu(scene: Phaser.Scene, src: EdgeShadowSource): boolean {
  const renderer = scene.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer;
  if (typeof renderer.getMaxTextureSize !== 'function') return true; // canvas renderer

  const max = renderer.getMaxTextureSize();
  if (!max) return true;

  const TILE = GAME_CONFIG.TILE_SIZE;
  const w = src.widthTiles * TILE;
  const h = src.heightTiles * TILE;
  if (w <= max && h <= max) return true;

  const key = `${w}x${h}`;
  if (!warnedSizes.has(key)) {
    warnedSizes.add(key);
    console.warn(
      `[EdgeShadows] disabled for this room: needs a ${w}x${h} RenderTexture but ` +
      `this GPU caps textures at ${max}x${max}. The room renders without edge ` +
      `shadows. Shrink the map, or build the shadow from tile-sized chunks.`,
    );
  }
  return false;
}

/** Deterministic per-tooth pseudo-random in [0,1) — stable across rebuilds, no shimmer. */
function toothRand(x: number, y: number, i: number): number {
  let h = (x * 374761393 + y * 668265263 + i * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Builds the edge-shadow layers for one room. Two independent layers:
 * `enabled` gates the shadow (silhouette + blur/drop fx), `borderOn` gates
 * the border line — either can run alone. Returns every RenderTexture
 * created; callers own destroying them on rebuild. Empty when both are off.
 */
export function buildEdgeShadows(
  scene: Phaser.Scene,
  src: EdgeShadowSource,
  opts: EdgeShadowOptions = {},
): Phaser.GameObjects.RenderTexture[] {
  const out: Phaser.GameObjects.RenderTexture[] = [];

  // These RTs are sized to the whole room, so a big map can ask for a texture
  // larger than the GPU allows (city-street at 96x72 tiles wants 6144x4608;
  // plenty of integrated GPUs cap at 4096). Creating it silently yields a
  // broken texture and the room renders blank — so bail out with a loud
  // warning instead. Shadows are cosmetic; the room must still load.
  if (!fitsInGpu(scene, src)) return out;

  if (current.enabled) out.push(buildShadowLayer(scene, src, opts));
  if (current.borderOn) {
    const border = buildRoughBorder(scene, src, opts);
    if (border) out.push(border);
  }
  if (!out.length) return out;

  // Knockout: clip all layers out of the collision area, so shadows and
  // border only ever show OUTSIDE solid cells — walls with transparent
  // interiors (trim-outline shapes) must not collect their own drop shadow.
  // (Skipped for scrollFactor-0 hosts — the mask lives in world space.)
  if (opts.scrollFactor === undefined) {
    const TILE = GAME_CONFIG.TILE_SIZE;
    const maskGfx = scene.make.graphics();
    maskGfx.fillStyle(0xffffff, 1);
    for (let ty = 0; ty < src.heightTiles; ty++) {
      let run = -1;
      for (let tx = 0; tx <= src.widthTiles; tx++) {
        const tile = tx < src.widthTiles ? src.collisionData[ty]?.[tx] : null;
        const isSolid = !!(tile && tile.index > 0);
        if (isSolid && run < 0) run = tx;
        if (!isSolid && run >= 0) {
          maskGfx.fillRect(run * TILE, ty * TILE, (tx - run) * TILE, TILE);
          run = -1;
        }
      }
    }
    for (const cell of src.colorCells ?? []) {
      maskGfx.fillRect(cell.x * TILE, cell.y * TILE, TILE, TILE);
    }
    const mask = maskGfx.createGeometryMask();
    mask.invertAlpha = true;
    for (const layer of out) layer.setMask(mask);
    out[0].once(Phaser.GameObjects.Events.DESTROY, () => {
      mask.destroy();
      maskGfx.destroy();
    });
  }

  return out;
}

/** The shadow proper: black silhouette of the collision art + blur/drop fx. */
function buildShadowLayer(
  scene: Phaser.Scene,
  src: EdgeShadowSource,
  opts: EdgeShadowOptions,
): Phaser.GameObjects.RenderTexture {
  const TILE = GAME_CONFIG.TILE_SIZE;
  const style = opts.style ?? 'silhouette';

  const rt = scene.add.renderTexture(0, 0, src.widthTiles * TILE, src.heightTiles * TILE);
  rt.setOrigin(0, 0);
  rt.setDepth(DEPTH.GROUND + 0.5);
  rt.setAlpha(current.alpha);
  if (opts.scrollFactor !== undefined) rt.setScrollFactor(opts.scrollFactor);

  const blocks = scene.make.graphics();
  blocks.fillStyle(0x000000, 1);

  // One reusable stamp for the whole map. Allocating and destroying a Game
  // Object per solid tile costs seconds on a large room (city-street has
  // ~6900 tiles) and looks like the room failing to load.
  let stamp: Phaser.GameObjects.Image | undefined;

  for (let ty = 0; ty < src.heightTiles; ty++) {
    for (let tx = 0; tx < src.widthTiles; tx++) {
      const tile = src.collisionData[ty]?.[tx];
      if (!tile || tile.index <= 0) continue;

      if (style === 'silhouette' && src.tilesets?.length) {
        let owningTs = src.tilesets[0];
        for (const ts of src.tilesets) {
          if (ts.firstgid <= tile.index) owningTs = ts;
        }
        if (!stamp) {
          stamp = scene.make.image({ x: 0, y: 0, add: false });
          stamp.setTint(0x000000).setOrigin(0, 0);
        }
        stamp.setTexture(tilesetSpritesheetKey(owningTs.name), tile.index - owningTs.firstgid);
        rt.draw(stamp, tx * TILE, ty * TILE);
      } else {
        blocks.fillRect(tx * TILE, ty * TILE, TILE, TILE);
      }
    }
  }
  stamp?.destroy();

  // Color-collision cells block movement exactly like tiles — same shadow.
  for (const cell of src.colorCells ?? []) {
    blocks.fillRect(cell.x * TILE, cell.y * TILE, TILE, TILE);
  }

  rt.draw(blocks, 0, 0);
  blocks.destroy();

  // postFX needs full WebGL shader support — degrade to the sharp silhouette.
  try {
    if (opts.fx) {
      rt.postFX.addBlur(opts.fx.quality, opts.fx.x, opts.fx.y, opts.fx.strength, opts.fx.color, opts.fx.steps);
    } else {
      if (current.shadowOn) {
        rt.postFX.addShadow(
          current.shadowX,
          current.shadowY,
          current.shadowDecay,
          current.shadowPower,
          0x000000,
          Math.round(Phaser.Math.Clamp(current.shadowSamples, 1, 12)),
          current.shadowIntensity,
        );
      }
      if (current.blurOn) {
        rt.postFX.addBlur(
          Math.round(Phaser.Math.Clamp(current.blurQuality, 0, 2)),
          current.blurX,
          current.blurY,
          current.blurStrength,
          0xffffff,
          Math.round(current.blurSteps),
        );
      }
    }
  } catch (e) {
    console.warn('[EdgeShadows] postFX unavailable (limited GPU?), rendering without fx:', e);
  }

  return rt;
}

/**
 * The rough border: a jagged rim hugging the *art-level* silhouette of the
 * collision geometry — the same per-pixel shape the blurred shadow uses,
 * not whole 64px cells. The silhouette is rasterized to an offscreen canvas
 * at 1/DETECT_SCALE resolution; every solid pixel with an empty 4-neighbor
 * is a boundary, and teeth are stamped outward from those pixels. Crisp by
 * design — its own RT, no postFX, above the blurred shadow (GROUND + 0.6)
 * and below the wall tiles.
 */
const DETECT_SCALE = 4; // boundary detection at 1/4 res (16px per 64px tile)
const ALPHA_SOLID = 32; // art alpha threshold to count as solid

function buildRoughBorder(
  scene: Phaser.Scene,
  src: EdgeShadowSource,
  opts: EdgeShadowOptions,
): Phaser.GameObjects.RenderTexture | undefined {
  const TILE = GAME_CONFIG.TILE_SIZE;
  const S = DETECT_SCALE;
  const dTile = TILE / S;
  const dw = src.widthTiles * dTile;
  const dh = src.heightTiles * dTile;

  // 1) Rasterize the collision silhouette (tile art + color cells) downscaled.
  const canvas = document.createElement('canvas');
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return undefined;

  let any = false;
  for (let ty = 0; ty < src.heightTiles; ty++) {
    for (let tx = 0; tx < src.widthTiles; tx++) {
      const tile = src.collisionData[ty]?.[tx];
      if (!tile || tile.index <= 0) continue;
      any = true;
      if (src.tilesets?.length) {
        let owningTs = src.tilesets[0];
        for (const ts of src.tilesets) {
          if (ts.firstgid <= tile.index) owningTs = ts;
        }
        try {
          const frame = scene.textures.getFrame(
            tilesetSpritesheetKey(owningTs.name),
            tile.index - owningTs.firstgid,
          );
          ctx.drawImage(
            frame.source.image as CanvasImageSource,
            frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
            tx * dTile, ty * dTile, dTile, dTile,
          );
          continue;
        } catch { /* fall through to a solid block */ }
      }
      ctx.fillRect(tx * dTile, ty * dTile, dTile, dTile);
    }
  }
  for (const cell of src.colorCells ?? []) {
    any = true;
    ctx.fillRect(cell.x * dTile, cell.y * dTile, dTile, dTile);
  }
  if (!any) return undefined;

  const img = ctx.getImageData(0, 0, dw, dh).data;
  const solid = new Uint8Array(dw * dh);
  for (let i = 0; i < dw * dh; i++) {
    if (img[i * 4 + 3] >= ALPHA_SOLID) solid[i] = 1;
  }

  // 2) Stamp teeth at art-boundary pixels, oriented into the open side.
  //    The collision-cell knockout mask (see buildEdgeShadows) clips away
  //    anything falling inside solid cells, so only the outward rim shows.
  const rt = scene.add.renderTexture(0, 0, src.widthTiles * TILE, src.heightTiles * TILE);
  rt.setOrigin(0, 0);
  rt.setDepth(DEPTH.GROUND + 0.6);
  rt.setAlpha(current.borderAlpha);
  if (opts.scrollFactor !== undefined) rt.setScrollFactor(opts.scrollFactor);

  const g = scene.make.graphics();
  // TEMP: solid bright-yellow line while the border placement is being
  // fine-tuned — final color (and the jitter/grain roughness, whose settings
  // stay parked in EdgeShadowSettings) come back once the line sits right.
  g.fillStyle(0xffff00, 1);

  const width = Math.max(1, current.borderWidth);
  // Overlap 2px into the solid area so no seam shows against the art
  // (the collision-cell knockout mask clips whatever lands inside cells).
  const INSET = 2;

  const at = (x: number, y: number): number =>
    x < 0 || x >= dw || y < 0 || y >= dh ? 0 : solid[y * dw + x];

  for (let py = 0; py < dh; py++) {
    for (let px = 0; px < dw; px++) {
      if (!solid[py * dw + px]) continue;
      const x0 = px * S;
      const y0 = py * S;

      if (!at(px, py - 1)) g.fillRect(x0, y0 - width, S, width + INSET);
      if (!at(px, py + 1)) g.fillRect(x0, y0 + S - INSET, S, width + INSET);
      if (!at(px - 1, py)) g.fillRect(x0 - width, y0, width + INSET, S);
      if (!at(px + 1, py)) g.fillRect(x0 + S - INSET, y0, width + INSET, S);
    }
  }

  rt.draw(g, 0, 0);
  g.destroy();
  return rt;
}
