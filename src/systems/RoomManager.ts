import Phaser from 'phaser';
import { GAME_CONFIG, DEPTH, LAYER_NAMES, LayerName, LAYER_CONFIG } from '@utils/Constants';
import { RoomDefinition, RoomsData } from '@/types';
import { debug } from '@utils/Debug';
import roomsDataRaw from '@/data/rooms.json';
import { RoomStateManager } from './RoomStateManager';

// Deep clone so runtime mutations (e.g., RoomEditorManager resizes) always
// take effect — Vite / esbuild may export the imported JSON as a frozen
// object, which would silently drop our `room.width = newWidth` writes.
const roomsData = JSON.parse(JSON.stringify(roomsDataRaw)) as RoomsData;

// Color tiles render just above their own tile layer (+0.05) but below the
// next layer, so a Ground color sits under the player and an Above color over it.
const COLOR_OVERLAY_DEPTH: Record<string, number> = {
  [LAYER_NAMES.GROUND]: DEPTH.GROUND + 0.05,
  [LAYER_NAMES.ON_GROUND]: DEPTH.ON_GROUND + 0.05,
  [LAYER_NAMES.COLLISION]: DEPTH.COLLISION + 0.05,
  [LAYER_NAMES.ON_COLLISION]: DEPTH.ON_COLLISION + 0.05,
  [LAYER_NAMES.ABOVE]: DEPTH.ABOVE + 0.05,
  [LAYER_NAMES.ON_ABOVE]: DEPTH.ABOVE + 0.55,
  [LAYER_NAMES.SPECTRA]: DEPTH.HIDDEN + 0.05,
};

export interface ResizeResult {
  pixelOffsetX: number;
  pixelOffsetY: number;
  newWidth: number;
  newHeight: number;
}

export class RoomManager {
  private scene: Phaser.Scene;
  private currentMap: Phaser.Tilemaps.Tilemap | null = null;
  private currentLayers: {
    ground: Phaser.Tilemaps.TilemapLayer;
    onGround: Phaser.Tilemaps.TilemapLayer | null;
    collision: Phaser.Tilemaps.TilemapLayer;
    onCollision: Phaser.Tilemaps.TilemapLayer | null;
    above: Phaser.Tilemaps.TilemapLayer;
    onAbove: Phaser.Tilemaps.TilemapLayer | null;
    spectra: Phaser.Tilemaps.TilemapLayer | null;
  } | null = null;
  private doorZones: Phaser.GameObjects.Zone[] = [];
  private currentRoomId: string = '';

  // Color tiles: persistent solid-color squares that behave like real tiles.
  // layerName -> ("x,y" -> rgbInt). Rendered via per-layer Graphics; collision
  // layers get invisible static bodies. See COLOR_TILES_PLAN.md.
  private colorTiles: Map<string, Map<string, number>> = new Map();
  private colorGraphics: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private colorCollisionBodies: Phaser.GameObjects.Zone[] = [];
  private editorDimActiveLayer: string | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  static getRoomsData(): RoomsData {
    return roomsData;
  }

  loadRoom(roomId: string): void {
    this.unloadCurrentRoom();
    this.currentRoomId = roomId;

    const room = roomsData.rooms[roomId];
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    debug('Loading room:', roomId);

    this.currentMap = this.scene.make.tilemap({ key: room.mapKey });

    // Always load the core tileset first, then any room-specific tilesets.
    const coreTileset = this.currentMap.addTilesetImage('tileset', 'tileset');
    if (!coreTileset) {
      throw new Error('Failed to add core tileset image');
    }
    const tilesets: Phaser.Tilemaps.Tileset[] = [coreTileset];
    for (const tsName of room.tilesets ?? []) {
      const ts = this.currentMap.addTilesetImage(tsName, tsName);
      if (ts) tilesets.push(ts);
      else console.warn(`[RoomManager] Tileset "${tsName}" not found in tilemap "${room.mapKey}". ` +
        `Add it to the Tiled JSON and ensure the PNG is at assets/tilemaps/${tsName}.png`);
    }

    const ground = this.currentMap.createLayer(LAYER_NAMES.GROUND, tilesets, 0, 0);
    const collision = this.currentMap.createLayer(LAYER_NAMES.COLLISION, tilesets, 0, 0);
    const above = this.currentMap.createLayer(LAYER_NAMES.ABOVE, tilesets, 0, 0);
    const hasOnAbove = this.currentMap.getLayerIndexByName(LAYER_NAMES.ON_ABOVE) !== null;
    const onAbove = hasOnAbove ? this.currentMap.createLayer(LAYER_NAMES.ON_ABOVE, tilesets, 0, 0) ?? null : null;
    const hasOnGround = this.currentMap.getLayerIndexByName(LAYER_NAMES.ON_GROUND) !== null;
    const onGround = hasOnGround ? this.currentMap.createLayer(LAYER_NAMES.ON_GROUND, tilesets, 0, 0) ?? null : null;
    const hasOnCollision = this.currentMap.getLayerIndexByName(LAYER_NAMES.ON_COLLISION) !== null;
    const onCollision = hasOnCollision ? this.currentMap.createLayer(LAYER_NAMES.ON_COLLISION, tilesets, 0, 0) ?? null : null;
    const hasSpectra = this.currentMap.getLayerIndexByName(LAYER_NAMES.SPECTRA) !== null;
    const spectra = hasSpectra ? this.currentMap.createLayer(LAYER_NAMES.SPECTRA, tilesets, 0, 0) ?? null : null;

    if (!ground || !collision || !above) {
      throw new Error('Failed to create tilemap layers — check layer names: Ground, Collision, Above');
    }

    const visualScale = GAME_CONFIG.WORLD_SCALE;
    ground.setScale(visualScale);
    collision.setScale(visualScale);
    above.setScale(visualScale);
    if (onAbove) onAbove.setScale(visualScale);
    if (onGround) onGround.setScale(visualScale);
    if (onCollision) onCollision.setScale(visualScale);
    if (spectra) spectra.setScale(visualScale);

    this.currentLayers = { ground, onGround, collision, onCollision, above, onAbove, spectra };

    ground.setDepth(DEPTH.GROUND);
    collision.setDepth(DEPTH.COLLISION);
    above.setDepth(DEPTH.ABOVE);
    if (onAbove) {
      onAbove.setDepth(DEPTH.ABOVE + 0.5);
      onAbove.setAlpha(room.onAboveAlpha ?? LAYER_CONFIG.ON_ABOVE_DEFAULT_ALPHA);
    }
    if (onGround) {
      onGround.setDepth(DEPTH.ON_GROUND);
      onGround.setAlpha(room.onGroundAlpha ?? LAYER_CONFIG.ON_GROUND_DEFAULT_ALPHA);
    }
    if (onCollision) {
      // OnCollision is a decorative overlay (wall-top detail) — it never blocks.
      onCollision.setDepth(DEPTH.ON_COLLISION);
      onCollision.setAlpha(room.onCollisionAlpha ?? LAYER_CONFIG.ON_COLLISION_DEFAULT_ALPHA);
    }
    if (spectra) {
      spectra.setDepth(DEPTH.HIDDEN);
      spectra.setAlpha(0); // hidden until flashlight + spectra-adapter; editor overrides via updateLayerOpacities
    }

    collision.setCollisionByExclusion([-1]);

    this.loadColorTiles(room.mapKey);
    this.stripTilesUnderColors();
    this.renderColorTiles();

    const roomW = room.width * GAME_CONFIG.TILE_SIZE;
    const roomH = room.height * GAME_CONFIG.TILE_SIZE;
    this.scene.physics.world.setBounds(0, 0, roomW, roomH);

    this.doorZones = room.doors.map((door) => {
      const zone = this.scene.add.zone(
        door.x + door.width / 2,
        door.y + door.height / 2,
        door.width,
        door.height
      );
      this.scene.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
      zone.setData('doorDef', door);
      return zone;
    });

    debug('Room loaded:', roomId, `(${roomW}x${roomH}px)`);
  }

  unloadCurrentRoom(): void {
    this.doorZones.forEach((z) => z.destroy());
    this.doorZones = [];

    this.teardownColorTiles();

    if (this.currentLayers) {
      this.currentLayers.ground.destroy();
      this.currentLayers.onGround?.destroy();
      this.currentLayers.collision.destroy();
      this.currentLayers.onCollision?.destroy();
      this.currentLayers.above.destroy();
      this.currentLayers.onAbove?.destroy();
      this.currentLayers.spectra?.destroy();
    }

    if (this.currentMap) {
      this.currentMap.destroy();
      this.currentMap = null;
    }
  }

  getCollisionLayer(): Phaser.Tilemaps.TilemapLayer {
    return this.currentLayers!.collision;
  }

  getDoorZones(): Phaser.GameObjects.Zone[] {
    return this.doorZones;
  }

  // ── Color tiles ───────────────────────────────────────────────────────────

  /** Read persisted color tiles from the cached tilemap JSON's `colorTiles` key. */
  private loadColorTiles(mapKey: string): void {
    this.colorTiles = new Map();
    const cached: any = this.scene.cache.tilemap.get(mapKey);
    const ct = cached?.data?.colorTiles;
    if (!ct || typeof ct !== 'object') return;
    for (const [layerName, cells] of Object.entries(ct)) {
      if (!cells || typeof cells !== 'object') continue;
      const m = new Map<string, number>();
      for (const [key, val] of Object.entries(cells as Record<string, number>)) {
        if (typeof val === 'number') m.set(key, val);
      }
      if (m.size) this.colorTiles.set(layerName, m);
    }
  }

  private teardownColorTiles(): void {
    this.colorGraphics.forEach((g) => g.destroy());
    this.colorGraphics.clear();
    this.colorCollisionBodies.forEach((z) => z.destroy());
    this.colorCollisionBodies = [];
  }

  /**
   * Enforce the color/tile mutual-exclusion invariant: remove any real tile that
   * sits under a color cell. Cleans up legacy data where colors were painted as
   * an overlay on top of existing tiles (and keeps exports lean).
   */
  private stripTilesUnderColors(): void {
    if (!this.currentMap) return;
    for (const [layerName, cells] of this.colorTiles) {
      if (this.currentMap.getLayerIndexByName(layerName) === null) continue;
      for (const key of cells.keys()) {
        const ci = key.indexOf(',');
        const tx = parseInt(key, 10);
        const ty = parseInt(key.slice(ci + 1), 10);
        this.currentMap.removeTileAt(tx, ty, true, false, layerName);
      }
    }
  }

  private colorOverlayAlphaFor(layerName: string): number {
    const room = this.getCurrentRoomDef();
    let baseAlpha = 1.0;
    if (layerName === LAYER_NAMES.ON_GROUND) baseAlpha = room?.onGroundAlpha ?? LAYER_CONFIG.ON_GROUND_DEFAULT_ALPHA;
    if (layerName === LAYER_NAMES.ON_COLLISION) baseAlpha = room?.onCollisionAlpha ?? LAYER_CONFIG.ON_COLLISION_DEFAULT_ALPHA;
    if (layerName === LAYER_NAMES.ON_ABOVE) baseAlpha = room?.onAboveAlpha ?? LAYER_CONFIG.ON_ABOVE_DEFAULT_ALPHA;

    if (this.editorDimActiveLayer === null) return baseAlpha; // game mode: use base decorative alpha
    return layerName === this.editorDimActiveLayer ? baseAlpha : baseAlpha * LAYER_CONFIG.EDITOR_INACTIVE_ALPHA;
  }

  private getOrCreateColorGraphics(layerName: string): Phaser.GameObjects.Graphics {
    let g = this.colorGraphics.get(layerName);
    if (!g) {
      g = this.scene.add.graphics();
      g.setDepth(COLOR_OVERLAY_DEPTH[layerName] ?? DEPTH.GROUND + 0.05);
      this.colorGraphics.set(layerName, g);
    }
    return g;
  }

  /** Redraw one layer's color overlay in place (cheap; used during editor paint). */
  private redrawColorLayer(layerName: string): void {
    const cells = this.colorTiles.get(layerName);
    const existing = this.colorGraphics.get(layerName);
    if (!cells || !cells.size) {
      existing?.clear();
      return;
    }
    const g = this.getOrCreateColorGraphics(layerName);
    g.clear();
    const T = GAME_CONFIG.TILE_SIZE;
    const alpha = this.colorOverlayAlphaFor(layerName);
    for (const [key, color] of cells) {
      const ci = key.indexOf(',');
      const tx = parseInt(key, 10);
      const ty = parseInt(key.slice(ci + 1), 10);
      g.fillStyle(color, alpha);
      g.fillRect(tx * T, ty * T, T, T);
    }
  }

  /** Full rebuild of every layer's overlay + collision bodies. */
  renderColorTiles(): void {
    this.teardownColorTiles();
    for (const layerName of this.colorTiles.keys()) {
      this.redrawColorLayer(layerName);
    }
    this.rebuildColorCollision();
  }

  /** Recreate invisible static bodies for color cells on the Collision layer. */
  private rebuildColorCollision(): void {
    this.colorCollisionBodies.forEach((z) => z.destroy());
    this.colorCollisionBodies = [];
    const T = GAME_CONFIG.TILE_SIZE;
    // Only the Collision layer blocks; OnCollision is decorative.
    for (const layerName of [LAYER_NAMES.COLLISION]) {
      const cells = this.colorTiles.get(layerName);
      if (!cells) continue;
      for (const key of cells.keys()) {
        const ci = key.indexOf(',');
        const tx = parseInt(key, 10);
        const ty = parseInt(key.slice(ci + 1), 10);
        const zone = this.scene.add.zone(tx * T + T / 2, ty * T + T / 2, T, T);
        this.scene.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
        this.colorCollisionBodies.push(zone);
      }
    }
  }

  getColorCollisionBodies(): Phaser.GameObjects.Zone[] {
    return this.colorCollisionBodies;
  }

  getColorTile(layerName: string, tileX: number, tileY: number): number | undefined {
    return this.colorTiles.get(layerName)?.get(`${tileX},${tileY}`);
  }

  setColorTile(layerName: string, tileX: number, tileY: number, rgb: number): void {
    let cells = this.colorTiles.get(layerName);
    if (!cells) {
      cells = new Map();
      this.colorTiles.set(layerName, cells);
    }
    cells.set(`${tileX},${tileY}`, rgb);
    // A color tile replaces any real tile in the same cell — they are mutually
    // exclusive, so the underlying tile must not linger in the layer data.
    this.currentMap?.removeTileAt(tileX, tileY, true, false, layerName);
    this.redrawColorLayer(layerName);
    if (layerName === LAYER_NAMES.COLLISION) {
      this.rebuildColorCollision();
    }
  }

  clearColorTile(layerName: string, tileX: number, tileY: number): void {
    const cells = this.colorTiles.get(layerName);
    if (!cells) return;
    if (cells.delete(`${tileX},${tileY}`)) {
      this.redrawColorLayer(layerName);
      if (layerName === LAYER_NAMES.COLLISION || layerName === LAYER_NAMES.ON_COLLISION) {
        this.rebuildColorCollision();
      }
    }
  }

  clearAllColorTiles(): void {
    this.colorTiles = new Map();
    this.renderColorTiles();
  }

  /** Serialize non-empty layers for export into the tilemap JSON's `colorTiles` key. */
  getColorTilesData(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const [layerName, cells] of this.colorTiles) {
      if (!cells.size) continue;
      const obj: Record<string, number> = {};
      for (const [key, color] of cells) obj[key] = color;
      out[layerName] = obj;
    }
    return out;
  }

  /** Editor: dim color overlays to match tile-layer dimming. null = game (full alpha). */
  setColorEditorDim(activeLayer: string | null): void {
    this.editorDimActiveLayer = activeLayer;
    for (const layerName of this.colorTiles.keys()) {
      this.redrawColorLayer(layerName);
    }
  }

  getCurrentRoomDef(): RoomDefinition {
    return roomsData.rooms[this.currentRoomId];
  }

  getMap(): Phaser.Tilemaps.Tilemap | null { return this.currentMap; }

  getGroundLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.ground || null; }

  getOnGroundLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.onGround ?? null; }

  /**
   * Returns the OnGround layer, creating it first if the current tilemap
   * was loaded from a JSON that predates this layer. Safe to call from the
   * editor at any time; no-ops if the layer already exists.
   */
  ensureOnGroundLayer(): Phaser.Tilemaps.TilemapLayer | null {
    if (!this.currentMap || !this.currentLayers) return null;
    if (this.currentLayers.onGround) return this.currentLayers.onGround;

    const tilesets = this.currentMap.tilesets;
    if (!tilesets.length) return null;

    const onGround = this.currentMap.createBlankLayer(
      LAYER_NAMES.ON_GROUND, tilesets, 0, 0,
      this.currentMap.width, this.currentMap.height
    );
    if (!onGround) return null;

    onGround.setScale(GAME_CONFIG.WORLD_SCALE);
    onGround.setDepth(DEPTH.ON_GROUND);
    const roomDef = this.getCurrentRoomDef();
    onGround.setAlpha(roomDef.onGroundAlpha ?? LAYER_CONFIG.ON_GROUND_DEFAULT_ALPHA);
    this.currentLayers.onGround = onGround;
    return onGround;
  }

  getOnCollisionLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.onCollision ?? null; }

  /**
   * Returns the OnCollision layer, creating it first if it doesn't exist yet.
   * Same on-demand pattern as ensureOnGroundLayer. Collision is enabled immediately.
   */
  ensureOnCollisionLayer(): Phaser.Tilemaps.TilemapLayer | null {
    if (!this.currentMap || !this.currentLayers) return null;
    if (this.currentLayers.onCollision) return this.currentLayers.onCollision;

    const tilesets = this.currentMap.tilesets;
    if (!tilesets.length) return null;

    const onCollision = this.currentMap.createBlankLayer(
      LAYER_NAMES.ON_COLLISION, tilesets, 0, 0,
      this.currentMap.width, this.currentMap.height
    );
    if (!onCollision) return null;

    onCollision.setScale(GAME_CONFIG.WORLD_SCALE);
    onCollision.setDepth(DEPTH.ON_COLLISION);
    const room = this.getCurrentRoomDef();
    onCollision.setAlpha(room?.onCollisionAlpha ?? LAYER_CONFIG.ON_COLLISION_DEFAULT_ALPHA);
    // OnCollision is decorative — no collision.
    this.currentLayers.onCollision = onCollision;
    return onCollision;
  }

  getAboveLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.above || null; }

  getOnAboveLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.onAbove ?? null; }

  getSpectraLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.spectra ?? null; }

  /**
   * Returns the Spectra layer, creating it first if it doesn't exist yet.
   */
  ensureSpectraLayer(): Phaser.Tilemaps.TilemapLayer | null {
    if (!this.currentMap || !this.currentLayers) return null;
    if (this.currentLayers.spectra) return this.currentLayers.spectra;

    const tilesets = this.currentMap.tilesets;
    if (!tilesets.length) return null;

    const spectra = this.currentMap.createBlankLayer(
      LAYER_NAMES.SPECTRA, tilesets, 0, 0,
      this.currentMap.width, this.currentMap.height
    );
    if (!spectra) return null;

    spectra.setScale(GAME_CONFIG.WORLD_SCALE);
    spectra.setDepth(DEPTH.HIDDEN);
    this.currentLayers.spectra = spectra;
    return spectra;
  }

  /**
   * Returns the OnAbove layer, creating it first if it doesn't exist yet.
   */
  ensureOnAboveLayer(): Phaser.Tilemaps.TilemapLayer | null {
    if (!this.currentMap || !this.currentLayers) return null;
    if (this.currentLayers.onAbove) return this.currentLayers.onAbove;

    const tilesets = this.currentMap.tilesets;
    if (!tilesets.length) return null;

    const onAbove = this.currentMap.createBlankLayer(
      LAYER_NAMES.ON_ABOVE, tilesets, 0, 0,
      this.currentMap.width, this.currentMap.height
    );
    if (!onAbove) return null;

    onAbove.setScale(GAME_CONFIG.WORLD_SCALE);
    onAbove.setDepth(DEPTH.ABOVE + 0.5);
    const room = this.getCurrentRoomDef();
    onAbove.setAlpha(room?.onAboveAlpha ?? LAYER_CONFIG.ON_ABOVE_DEFAULT_ALPHA);
    this.currentLayers.onAbove = onAbove;
    return onAbove;
  }

  getCurrentRoomId(): string {
    return this.currentRoomId;
  }

  getRoomDef(roomId: string): RoomDefinition {
    return roomsData.rooms[roomId];
  }

  getStartRoom(): string {
    return roomsData.startRoom;
  }

  getSpawnForDoor(roomId: string, doorId: string): { x: number; y: number } {
    const room = roomsData.rooms[roomId];
    const door = room.doors.find((d) => d.id === doorId);
    if (door) {
      return { x: door.spawnX, y: door.spawnY };
    }
    return room.playerSpawn || { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
  }

  /**
   * Resize the active tilemap. `offsetX/offsetY` are tile-coordinate offsets:
   * the existing tile at (oldX, oldY) ends up at (oldX + offsetX, oldY + offsetY).
   * Tiles that fall outside the new bounds are dropped. Doors, interactables,
   * afflicted spawns, the player spawn, and dropped items in this room are all
   * shifted by the equivalent pixel offset so the room stays internally consistent.
   * The caller is responsible for re-running collision setup, camera bounds, item
   * sprites, and afflicted spawning after this returns.
   */
  resizeMap(newWidth: number, newHeight: number, offsetX: number = 0, offsetY: number = 0): ResizeResult | null {
    if (!this.currentMap || !this.currentLayers) return null;
    if (newWidth < 1 || newHeight < 1) return null;
    if (newWidth === this.currentMap.width && newHeight === this.currentMap.height && offsetX === 0 && offsetY === 0) {
      return null;
    }

    const oldMap = this.currentMap;
    const oldW = oldMap.width;
    const oldH = oldMap.height;
    const sourceTileW = oldMap.tileWidth;
    const sourceTileH = oldMap.tileHeight;

    const captureLayer = (layer: Phaser.Tilemaps.TilemapLayer): number[][] => {
      const data: number[][] = [];
      let nonZeroCount = 0;
      let firstFew: number[] = [];
      for (let y = 0; y < oldH; y++) {
        const row: number[] = [];
        for (let x = 0; x < oldW; x++) {
          const tile = layer.getTileAt(x, y, true);
          const idx = tile && tile.index !== -1 ? tile.index : 0;
          row.push(idx);
          if (idx !== 0) {
            nonZeroCount++;
            if (firstFew.length < 5) firstFew.push(idx);
          }
        }
        data.push(row);
      }
      console.log(`[RoomManager] Captured layer ${layer.name}: ${nonZeroCount} non-zero tiles. Samples: ${firstFew.join(', ')}`);
      return data;
    };

    const groundData = captureLayer(this.currentLayers.ground);
    const onGroundData = this.currentLayers.onGround ? captureLayer(this.currentLayers.onGround) : null;
    const collisionData = captureLayer(this.currentLayers.collision);
    const onCollisionData = this.currentLayers.onCollision ? captureLayer(this.currentLayers.onCollision) : null;
    const aboveData = captureLayer(this.currentLayers.above);
    const onAboveData = this.currentLayers.onAbove ? captureLayer(this.currentLayers.onAbove) : null;
    const spectraData = this.currentLayers.spectra ? captureLayer(this.currentLayers.spectra) : null;

    const pixelOffsetX = offsetX * GAME_CONFIG.TILE_SIZE;
    const pixelOffsetY = offsetY * GAME_CONFIG.TILE_SIZE;
    const newPixelW = newWidth * GAME_CONFIG.TILE_SIZE;
    const newPixelH = newHeight * GAME_CONFIG.TILE_SIZE;

    const room = roomsData.rooms[this.currentRoomId];
    if (!room) return null;

    room.width = newWidth;
    room.height = newHeight;

    const shift = <T extends { x: number; y: number }>(obj: T): void => {
      obj.x += pixelOffsetX;
      obj.y += pixelOffsetY;
    };
    if (room.playerSpawn) shift(room.playerSpawn);
    for (const door of room.doors || []) {
      door.x += pixelOffsetX;
      door.y += pixelOffsetY;
      door.spawnX += pixelOffsetX;
      door.spawnY += pixelOffsetY;
    }
    for (const inter of room.interactables || []) shift(inter);
    for (const aff of room.afflicted || []) shift(aff);

    // Shift color tiles by the tile offset, dropping any that fall out of bounds.
    const shiftedColorTiles = new Map<string, Map<string, number>>();
    for (const [layerName, cells] of this.colorTiles) {
      const m = new Map<string, number>();
      for (const [key, color] of cells) {
        const ci = key.indexOf(',');
        const nx = parseInt(key, 10) + offsetX;
        const ny = parseInt(key.slice(ci + 1), 10) + offsetY;
        if (nx < 0 || nx >= newWidth || ny < 0 || ny >= newHeight) continue;
        m.set(`${nx},${ny}`, color);
      }
      if (m.size) shiftedColorTiles.set(layerName, m);
    }
    this.colorTiles = shiftedColorTiles;

    // Shift dropped items belonging to this room
    const rsm = RoomStateManager.getInstance();
    const dropped = rsm.getDroppedItems(this.currentRoomId);
    for (const d of dropped) {
      d.x += pixelOffsetX;
      d.y += pixelOffsetY;
    }

    // Store tileset info before destroying the old map
    const oldMapTilesets = oldMap.tilesets.map(ts => ({
      name: ts.name,
      tileWidth: ts.tileWidth,
      tileHeight: ts.tileHeight,
      tileMargin: ts.tileMargin,
      tileSpacing: ts.tileSpacing,
      firstgid: ts.firstgid
    }));

    // Tear down old map
    this.doorZones.forEach((z) => z.destroy());
    this.doorZones = [];
    this.teardownColorTiles();
    this.currentLayers.ground.destroy();
    this.currentLayers.onGround?.destroy();
    this.currentLayers.collision.destroy();
    this.currentLayers.onCollision?.destroy();
    this.currentLayers.above.destroy();
    this.currentLayers.onAbove?.destroy();
    this.currentLayers.spectra?.destroy();
    this.currentLayers = null;
    this.currentMap.destroy();
    this.currentMap = null;

    // Build new blank tilemap
    const newMap = this.scene.make.tilemap({
      tileWidth: sourceTileW,
      tileHeight: sourceTileH,
      width: newWidth,
      height: newHeight
    });
    
    // Preserve all tilesets from the old map
    console.log(`[RoomManager] Resizing. Old map tilesets: ${oldMapTilesets.map(t => t.name + " (" + t.firstgid + ")").join(', ')}`);
    for (const ts of oldMapTilesets) {
      // Explicitly pass firstgid to ensure tile indices (GIDs) remain consistent.
      const added = newMap.addTilesetImage(
        ts.name, 
        ts.name, 
        ts.tileWidth, 
        ts.tileHeight, 
        ts.tileMargin, 
        ts.tileSpacing, 
        ts.firstgid
      );
      if (added) {
        console.log(`[RoomManager] Added tileset "${ts.name}" during resize. New firstgid: ${added.firstgid} (Expected ${ts.firstgid})`);
      } else {
        console.error(`[RoomManager] Failed to add tileset "${ts.name}" during resize! Texture cache:`, this.scene.textures.getTextureKeys());
      }
    }
    
    if (newMap.tilesets.length === 0) {
      console.warn('[RoomManager] No tilesets in newMap after resize, adding fallback "tileset"');
      newMap.addTilesetImage('tileset', 'tileset', 64, 64, 0, 0, 1);
    }

    const tileset = newMap.tilesets[0]; // primary tileset for layer creation
    if (!tileset) {
      throw new Error(`Failed to add tileset image during resize for room "${this.currentRoomId}". Old map had ${oldMap.tilesets.length} tilesets.`);
    }

    const ground = newMap.createBlankLayer(LAYER_NAMES.GROUND, tileset, 0, 0, newWidth, newHeight);
    const onGround = onGroundData !== null
      ? (newMap.createBlankLayer(LAYER_NAMES.ON_GROUND, tileset, 0, 0, newWidth, newHeight) ?? null)
      : null;
    const collision = newMap.createBlankLayer(LAYER_NAMES.COLLISION, tileset, 0, 0, newWidth, newHeight);
    const onCollision = onCollisionData !== null
      ? (newMap.createBlankLayer(LAYER_NAMES.ON_COLLISION, tileset, 0, 0, newWidth, newHeight) ?? null)
      : null;
    const above = newMap.createBlankLayer(LAYER_NAMES.ABOVE, tileset, 0, 0, newWidth, newHeight);
    const onAbove = onAboveData !== null
      ? (newMap.createBlankLayer(LAYER_NAMES.ON_ABOVE, tileset, 0, 0, newWidth, newHeight) ?? null)
      : null;
    const spectra = spectraData !== null
      ? (newMap.createBlankLayer(LAYER_NAMES.SPECTRA, tileset, 0, 0, newWidth, newHeight) ?? null)
      : null;
    if (!ground || !collision || !above) {
      throw new Error('Failed to create blank tilemap layers during resize');
    }

    const visualScale = GAME_CONFIG.WORLD_SCALE;
    ground.setScale(visualScale);
    if (onGround) onGround.setScale(visualScale);
    collision.setScale(visualScale);
    if (onCollision) onCollision.setScale(visualScale);
    above.setScale(visualScale);
    if (onAbove) onAbove.setScale(visualScale);
    if (spectra) spectra.setScale(visualScale);
    ground.setDepth(DEPTH.GROUND);
    if (onGround) {
      onGround.setDepth(DEPTH.ON_GROUND);
      onGround.setAlpha(this.getCurrentRoomDef().onGroundAlpha ?? LAYER_CONFIG.ON_GROUND_DEFAULT_ALPHA);
    }
    collision.setDepth(DEPTH.COLLISION);
    if (onCollision) {
      onCollision.setDepth(DEPTH.ON_COLLISION); // decorative — no collision
      onCollision.setAlpha(room.onCollisionAlpha ?? LAYER_CONFIG.ON_COLLISION_DEFAULT_ALPHA);
    }
    above.setDepth(DEPTH.ABOVE);
    if (onAbove) {
      onAbove.setDepth(DEPTH.ABOVE + 0.5);
      onAbove.setAlpha(room.onAboveAlpha ?? LAYER_CONFIG.ON_ABOVE_DEFAULT_ALPHA);
    }
    if (spectra) {
      spectra.setDepth(DEPTH.HIDDEN);
      spectra.setAlpha(0);
    }

    const restoreLayer = (layer: Phaser.Tilemaps.TilemapLayer, data: number[][]): void => {
      let restoredCount = 0;
      let firstFew: number[] = [];
      for (let y = 0; y < data.length; y++) {
        const ny = y + offsetY;
        if (ny < 0 || ny >= newHeight) continue;
        const row = data[y];
        for (let x = 0; x < row.length; x++) {
          const idx = row[x];
          if (idx === 0) continue; // 0 means empty in Tiled
          const nx = x + offsetX;
          if (nx < 0 || nx >= newWidth) continue;
          
          layer.putTileAt(idx, nx, ny);
          restoredCount++;
          if (firstFew.length < 5) firstFew.push(idx);
        }
      }
    };
    restoreLayer(ground, groundData);
    if (onGround && onGroundData) restoreLayer(onGround, onGroundData);
    restoreLayer(collision, collisionData);
    if (onCollision && onCollisionData) restoreLayer(onCollision, onCollisionData);
    restoreLayer(above, aboveData);
    if (onAbove && onAboveData) restoreLayer(onAbove, onAboveData);
    if (spectra && spectraData) restoreLayer(spectra, spectraData);

    collision.setCollisionByExclusion([-1]);
    this.currentMap = newMap;
    this.currentLayers = { ground, onGround, collision, onCollision, above, onAbove, spectra };

    this.stripTilesUnderColors();
    this.renderColorTiles();

    this.scene.physics.world.setBounds(0, 0, newPixelW, newPixelH);

    this.doorZones = (room.doors || []).map((door) => {
      if (door.x < 0 || door.y < 0 || door.x > newPixelW || door.y > newPixelH) {
        console.warn(`[RoomManager] Door ${door.id} now outside map bounds (${newPixelW}x${newPixelH})`);
      }
      const zone = this.scene.add.zone(
        door.x + door.width / 2,
        door.y + door.height / 2,
        door.width,
        door.height
      );
      this.scene.physics.world.enable(zone, Phaser.Physics.Arcade.STATIC_BODY);
      zone.setData('doorDef', door);
      return zone;
    });

    debug('Room resized:', this.currentRoomId, `${oldW}x${oldH} -> ${newWidth}x${newHeight} (offset ${offsetX},${offsetY})`);

    return { pixelOffsetX, pixelOffsetY, newWidth, newHeight };
  }
}

