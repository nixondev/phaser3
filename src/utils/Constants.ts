export const GAME_CONFIG = {
  WIDTH: 1280,
  HEIGHT: 960,
  TILE_SIZE: 64,
  ASSET_SCALE: 1,        // tiles displayed at native 64px
  WORLD_SCALE: 1,        // no downscale — 64px assets = 64px world units
  ENTITY_SCALE: 1.0,     // scale multiplier for characters relative to a tile
  ENTITY_WORLD_SCALE: 1.0, // entity sprite scale in world space — sprites are native 64px
  DEBUG: false,
} as const;

export const PLAYER_CONFIG = {
  SPEED: 220,
  ANIM_FPS: 8,
} as const;

export const DEPTH = {
  GROUND: 0,
  ON_GROUND: 0.3,
  COLLISION: 1,
  ON_COLLISION: 2,
  ENTITIES: 10,
  PLAYER: 20,
  ABOVE: 30,
  HIDDEN: 31,   // reserved — things the flashlight will reveal
  LIGHTING: 35,
  WEATHER: 37,  // above darkness and flashlight beam, always visible
  UI: 40,
  TRANSITION: 50,
} as const;

export const LAYER_NAMES = {
  GROUND: 'Ground',
  ON_GROUND: 'OnGround',
  COLLISION: 'Collision',
  ON_COLLISION: 'OnCollision',
  ABOVE: 'Above',
  ON_ABOVE: 'OnAbove',
  SPECTRA: 'Spectra',
} as const;

export type LayerName = typeof LAYER_NAMES[keyof typeof LAYER_NAMES];

export const LAYER_CONFIG = {
  ON_GROUND_DEFAULT_ALPHA: 0.2,
  ON_COLLISION_DEFAULT_ALPHA: 1.0,
  ON_ABOVE_DEFAULT_ALPHA: 1.0,
  EDITOR_INACTIVE_ALPHA: 0.2,
} as const;

export const DARKNESS_CONFIG = {
  DEFAULT_LEVEL: 0.92,
} as const;

export const AUDIO_CONFIG = {
  DEFAULT_REVERB_MIX: 0.3,
} as const;

export const FONTS = {
  SPEECH: '"Bitcount Ink", monospace', // people talking + inner voice
  TYPE: '"Workbench", monospace',              // typed/printed matter (lore, documents)
  UI: 'Silkscreen, monospace',                 // system/meta messages
} as const;

/**
 * Per-channel look for player-facing text. Keys = DialogMessageType plus
 * 'document' (the reader scene). Tune everything here — no scene edits.
 */
export const TEXT_STYLES = {
  narrative: { fontFamily: FONTS.SPEECH, fontSize: '35px', color: '#ffffff', fontStyle: 'normal', boxColor: 0x000000, boxAlpha: 0.75 },
  thought:   { fontFamily: FONTS.SPEECH,   fontSize: '35px', color: '#b8c4e8', fontStyle: 'italic', boxColor: 0x0c1424, boxAlpha: 0.78 },
  lore:      { fontFamily: FONTS.TYPE,   fontSize: '40px', color: '#d8d4c0', fontStyle: 'normal', boxColor: 0x0a0a06, boxAlpha: 0.80 },
  system:    { fontFamily: FONTS.UI,     fontSize: '28px', color: '#c9c9c9', fontStyle: 'normal', boxColor: 0x141414, boxAlpha: 0.85 },
  document:  { fontFamily: FONTS.TYPE,   fontSize: '34px', color: '#ccccbb', fontStyle: 'normal', boxColor: 0x0a0a0a, boxAlpha: 0.95 },
} as const;

export const SCENES = {
  BOOT: 'Boot',
  PRELOAD: 'Preload',
  MENU: 'Menu',
  GAME: 'Game',
  UI: 'UI',
  PAUSE: 'Pause',
  EDITOR: 'Editor',
  TILE_EDITOR: 'TileEditor',
  SPRITE_EDITOR: 'SpriteEditor',
  DOCUMENT_READER: 'DocumentReader',
} as const;

export const ROOM_CONFIG = {
  DEFAULT_ROOM: 'entrance',
  TRANSITION_DURATION: 300,
  DOOR_ACTIVATION_DISTANCE: 32,
} as const;

export const CAMERA_CONFIG = {
  LERP: 0.1,
} as const;

export const INTERACT_CONFIG = {
  DISTANCE: 75,
} as const;

export const FLASHLIGHT_CONFIG = {
  RANGE: 384,           // pixels (~6 tiles at 64px/tile)
  HALF_ANGLE: Math.PI / 5, // 36° each side = 72° total beam
  BATTERY_MAX: 100,
  BATTERY_DRAIN_RATE: 2.0, // percent per second
} as const;

export const INVENTORY_CONFIG = {
  ROWS: 2,
  COLS: 6,
  SLOT_SIZE: 56,
} as const;

export const USE_MIDI_MUSIC = true;
