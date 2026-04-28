import Phaser from 'phaser';
import { GAME_CONFIG, DEPTH } from '@utils/Constants';
import { RoomDefinition, RoomsData } from '@/types';
import { debug } from '@utils/Debug';
import roomsDataRaw from '@/data/rooms.json';
import { RoomStateManager } from './RoomStateManager';

const roomsData = roomsDataRaw as unknown as RoomsData;

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
    collision: Phaser.Tilemaps.TilemapLayer;
    above: Phaser.Tilemaps.TilemapLayer;
  } | null = null;
  private doorZones: Phaser.GameObjects.Zone[] = [];
  private currentRoomId: string = '';

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  static getRoomsData(): RoomsData {
    return roomsData;
  }

  loadRoom(roomId: string): void {
    this.unloadCurrentRoom();

    const room = roomsData.rooms[roomId];
    if (!room) {
      throw new Error(`Room not found: ${roomId}`);
    }

    debug('Loading room:', roomId);

    this.currentMap = this.scene.make.tilemap({ key: room.mapKey });
    const tileset = this.currentMap.addTilesetImage('tileset', 'tileset');
    if (!tileset) {
      throw new Error('Failed to add tileset image');
    }

    const ground = this.currentMap.createLayer('Ground', tileset, 0, 0);
    const collision = this.currentMap.createLayer('Collision', tileset, 0, 0);
    const above = this.currentMap.createLayer('Above', tileset, 0, 0);

    if (!ground || !collision || !above) {
      throw new Error('Failed to create tilemap layers — check layer names: Ground, Collision, Above');
    }

    const visualScale = 1 / GAME_CONFIG.ASSET_SCALE;
    ground.setScale(visualScale);
    collision.setScale(visualScale);
    above.setScale(visualScale);

    this.currentLayers = { ground, collision, above };

    ground.setDepth(DEPTH.GROUND);
    collision.setDepth(DEPTH.GROUND + 1);
    above.setDepth(DEPTH.ABOVE);

    collision.setCollisionByExclusion([-1]);

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

    this.currentRoomId = roomId;
    debug('Room loaded:', roomId, `(${roomW}x${roomH}px)`);
  }

  unloadCurrentRoom(): void {
    this.doorZones.forEach((z) => z.destroy());
    this.doorZones = [];

    if (this.currentLayers) {
      this.currentLayers.ground.destroy();
      this.currentLayers.collision.destroy();
      this.currentLayers.above.destroy();
      this.currentLayers = null;
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

  getCurrentRoomDef(): RoomDefinition {
    return roomsData.rooms[this.currentRoomId];
  }

  getMap(): Phaser.Tilemaps.Tilemap | null { return this.currentMap; }

  getGroundLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.ground || null; }

  getAboveLayer(): Phaser.Tilemaps.TilemapLayer | null { return this.currentLayers?.above || null; }

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
      for (let y = 0; y < oldH; y++) {
        const row: number[] = [];
        for (let x = 0; x < oldW; x++) {
          const tile = layer.getTileAt(x, y, true);
          row.push(tile && tile.index !== -1 ? tile.index : -1);
        }
        data.push(row);
      }
      return data;
    };

    const groundData = captureLayer(this.currentLayers.ground);
    const collisionData = captureLayer(this.currentLayers.collision);
    const aboveData = captureLayer(this.currentLayers.above);

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

    // Shift dropped items belonging to this room
    const rsm = RoomStateManager.getInstance();
    const dropped = rsm.getDroppedItems(this.currentRoomId);
    for (const d of dropped) {
      d.x += pixelOffsetX;
      d.y += pixelOffsetY;
    }

    // Tear down old map
    this.doorZones.forEach((z) => z.destroy());
    this.doorZones = [];
    this.currentLayers.ground.destroy();
    this.currentLayers.collision.destroy();
    this.currentLayers.above.destroy();
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
    const tileset = newMap.addTilesetImage('tileset', 'tileset');
    if (!tileset) {
      throw new Error('Failed to add tileset image during resize');
    }

    const ground = newMap.createBlankLayer('Ground', tileset, 0, 0, newWidth, newHeight);
    const collision = newMap.createBlankLayer('Collision', tileset, 0, 0, newWidth, newHeight);
    const above = newMap.createBlankLayer('Above', tileset, 0, 0, newWidth, newHeight);
    if (!ground || !collision || !above) {
      throw new Error('Failed to create blank tilemap layers during resize');
    }

    const visualScale = 1 / GAME_CONFIG.ASSET_SCALE;
    ground.setScale(visualScale);
    collision.setScale(visualScale);
    above.setScale(visualScale);
    ground.setDepth(DEPTH.GROUND);
    collision.setDepth(DEPTH.GROUND + 1);
    above.setDepth(DEPTH.ABOVE);

    const restoreLayer = (layer: Phaser.Tilemaps.TilemapLayer, data: number[][]): void => {
      for (let y = 0; y < data.length; y++) {
        const ny = y + offsetY;
        if (ny < 0 || ny >= newHeight) continue;
        const row = data[y];
        for (let x = 0; x < row.length; x++) {
          const idx = row[x];
          if (idx === -1) continue;
          const nx = x + offsetX;
          if (nx < 0 || nx >= newWidth) continue;
          layer.putTileAt(idx, nx, ny);
        }
      }
    };
    restoreLayer(ground, groundData);
    restoreLayer(collision, collisionData);
    restoreLayer(above, aboveData);

    collision.setCollisionByExclusion([-1]);
    this.currentMap = newMap;
    this.currentLayers = { ground, collision, above };

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

