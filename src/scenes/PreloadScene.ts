import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, USE_MIDI_MUSIC } from '@utils/Constants';
import { RoomManager } from '@systems/RoomManager';
import { collectReferencedSheets } from '@systems/CharacterRegistry';
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

    this.load.image('vial_cure', 'assets/sprites/vial_cure.png');

    // Character spritesheets: exactly what characters.json + room placements
    // reference. Texture key = PNG basename. (Dev additionally loads every
    // 256×256 sheet on disk in create(), so new art needs no registration.)
    for (const sheet of collectReferencedSheets()) {
      this.load.spritesheet(sheet, `assets/sprites/${sheet}.png`, {
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
      document.fonts.load('1em "Bitcount Ink"'),
      document.fonts.load('1em "Workbench"'),
      this.loadAllDevSheets(),
    ]).finally(() => {
      this.scene.start(SCENES.MENU);
    });
  }

  /**
   * Dev only: load every 256×256 sheet in public/assets/sprites/ so freshly
   * painted sheets are immediately usable (skin picker, characters.json edits)
   * without touching code. Production loads only referenced sheets.
   */
  private loadAllDevSheets(): Promise<void> {
    if (!import.meta.env.DEV) return Promise.resolve();
    return fetch('/__editor/list-sprites')
      .then(r => r.json())
      .then((data: { sprites: { name: string; width: number; height: number }[] }) => {
        let queued = 0;
        for (const s of data.sprites) {
          if (s.width !== 256 || s.height !== 256) continue;
          // `<sheet>_n.png` normal maps match a sheet's dimensions but are
          // data, not wearable art — keep them out of the skin picker.
          if (s.name.endsWith('_n')) continue;
          if (this.textures.exists(s.name)) continue;
          this.load.spritesheet(s.name, `assets/sprites/${s.name}.png`, {
            frameWidth: 64,
            frameHeight: 64,
          });
          queued++;
        }
        if (queued === 0) return;
        debug(`Dev: loading ${queued} additional character sheets`);
        return new Promise<void>(resolve => {
          this.load.once('complete', () => resolve());
          this.load.start();
        });
      })
      .catch(() => undefined);
  }
}
