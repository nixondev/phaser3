import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';
import { RoomManager } from '@systems/RoomManager';
import { debug } from '@utils/Debug';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super(SCENES.PRELOAD);
  }

  preload(): void {
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    const progressBox = this.add.rectangle(w / 2, h / 2, w * 0.6, 20, 0x222222).setOrigin(0.5);
    const progressBar = this.add
      .rectangle(w / 2 - (w * 0.6) / 2 + 2, h / 2, 0, 16, 0x4488ff)
      .setOrigin(0, 0.5);
    const loadingText = this.add
      .text(w / 2, h / 2 - 30, 'Loading assets...', {
        fontSize: '12px',
        color: '#cccccc',
        fontFamily: 'monospace',
      })
      .setOrigin(0.5);

    this.load.on('progress', (value: number) => {
      progressBar.width = (w * 0.6 - 4) * value;
    });

    this.load.on('complete', () => {
      progressBox.destroy();
      progressBar.destroy();
      loadingText.destroy();
      debug('All assets loaded');
    });

    this.load.image('tileset', 'assets/tilemaps/tileset.png');
    this.load.spritesheet('tileset-sprites', 'assets/tilemaps/tileset.png', {
      frameWidth: 16,
      frameHeight: 16,
    });
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 16,
      frameHeight: 16,
    });

    const roomsData = RoomManager.getRoomsData();
    for (const room of Object.values(roomsData.rooms)) {
      debug('Queuing tilemap:', room.mapKey, room.tilemapPath);
      this.load.tilemapTiledJSON(room.mapKey, room.tilemapPath);
    }
  }

  create(): void {
    this.scene.start(SCENES.MENU);
  }
}
