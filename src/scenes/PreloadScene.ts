import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, USE_MIDI_MUSIC } from '@utils/Constants';
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

    const upscale = GAME_CONFIG.TILE_SIZE * GAME_CONFIG.ASSET_SCALE;

    this.load.image('tileset', 'assets/tilemaps/tileset.png');
    this.load.spritesheet('tileset-sprites', 'assets/tilemaps/tileset.png', {
      frameWidth: upscale,
      frameHeight: upscale,
    });
    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: upscale,
      frameHeight: upscale,
    });

    const roomsData = RoomManager.getRoomsData();
    for (const room of Object.values(roomsData.rooms)) {
      debug('Queuing tilemap:', room.mapKey, room.tilemapPath);
      this.load.tilemapTiledJSON(room.mapKey, room.tilemapPath);
    }

    // Title screen always uses MP3; in-game music uses MIDI when flag is on
    this.load.audio('bgm-title', 'assets/audio/gametheme-003.mp3');
    if (!USE_MIDI_MUSIC) {
      this.load.audio('bgm-main', 'assets/audio/gamemusic-001.mp3');
    }
  }

  create(): void {
    this.scene.start(SCENES.MENU);
  }
}
