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
    const roomsData = RoomManager.getRoomsData();

    // Load all base tilesets (tileset, tileset2, …) declared in rooms.json.
    for (const name of roomsData.baseTilesets ?? ['tileset']) {
      const tsPath = `assets/tilemaps/${name}.png`;
      this.load.image(name, tsPath);
      this.load.spritesheet(`${name}-sprites`, tsPath, { frameWidth: upscale, frameHeight: upscale });
    }

    this.load.spritesheet('player', 'assets/sprites/player.png', {
      frameWidth: 64,
      frameHeight: 64,
    });

    this.load.image('vial_cure', 'assets/sprites/vial_cure.png');

    const playerVariants = [
      'warden', 'ranger', 'rogue', 'mystic', 'drifter', 'scavenger', 'ashwalker',
    ];
    for (const v of playerVariants) {
      this.load.spritesheet(`player-${v}`, `assets/sprites/player-${v}.png`, {
        frameWidth: 64,
        frameHeight: 64,
      });
    }

    const afflictedVariants = [
      'walker',
      'bloater',
      'crawler',
      'husk',
      'spitter',
      'brute',
      'ashrot',
      'veinhost',
    ];
    for (const v of afflictedVariants) {
      this.load.spritesheet(`afflicted-${v}`, `assets/sprites/afflicted-${v}.png`, {
        frameWidth: 64,
        frameHeight: 64,
      });
    }

    const extraTilesets = new Set<string>();
    for (const room of Object.values(roomsData.rooms)) {
      debug('Queuing tilemap:', room.mapKey, room.tilemapPath);
      this.load.tilemapTiledJSON(room.mapKey, room.tilemapPath);
      for (const ts of room.tilesets ?? []) extraTilesets.add(ts);
    }

    // Load room-specific tilesets as both image (for tilemaps) and
    // spritesheet (for world/UI sprites). Convention: PNG lives at
    // assets/tilemaps/<name>.png, spritesheet key is <name>-sprites.
    for (const ts of extraTilesets) {
      const path = `assets/tilemaps/${ts}.png`;
      this.load.image(ts, path);
      this.load.spritesheet(`${ts}-sprites`, path, {
        frameWidth: upscale,
        frameHeight: upscale,
      });
      debug('Queuing room tileset:', ts, path);
    }

    // Title screen always uses MP3; in-game music uses MIDI when flag is on
    this.load.audio('bgm-title', 'assets/audio/gametheme-003.mp3');
    if (!USE_MIDI_MUSIC) {
      this.load.audio('bgm-main', 'assets/audio/gamemusic-001.mp3');
    }
  }

  create(): void {
    Promise.all([
      document.fonts.load('1em VT323'),
      document.fonts.load('1em Silkscreen'),
    ]).finally(() => {
      this.scene.start(SCENES.MENU);
    });
  }
}
