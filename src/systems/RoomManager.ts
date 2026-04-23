import Phaser from 'phaser';
import { GAME_CONFIG, DEPTH } from '@utils/Constants';
import { RoomDefinition, RoomsData } from '@/types';
import { debug } from '@utils/Debug';
import roomsDataRaw from '@/data/rooms.json';

const roomsData = roomsDataRaw as unknown as RoomsData;

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
}
