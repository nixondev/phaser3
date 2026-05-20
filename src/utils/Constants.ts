export const GAME_CONFIG = {
  WIDTH: 1280,
  HEIGHT: 960,
  TILE_SIZE: 64,
  ASSET_SCALE: 1,        // tiles displayed at native 64px
  WORLD_SCALE: 1,        // no downscale — 64px assets = 64px world units
  ENTITY_SCALE: 1.5,     // scale multiplier for characters relative to a tile
  ENTITY_WORLD_SCALE: 1.5, // entity sprite scale in world space (= ENTITY_SCALE / ASSET_SCALE)
  DEBUG: false,
} as const;

export const PLAYER_CONFIG = {
  SPEED: 320,
  ANIM_FPS: 8,
} as const;

export const DEPTH = {
  GROUND: 0,
  ENTITIES: 10,
  PLAYER: 20,
  ABOVE: 30,
  HIDDEN: 31,   // reserved — things the flashlight will reveal
  LIGHTING: 35,
  WEATHER: 37,  // above darkness and flashlight beam, always visible
  UI: 40,
  TRANSITION: 50,
} as const;

export const SCENES = {
  BOOT: 'Boot',
  PRELOAD: 'Preload',
  MENU: 'Menu',
  GAME: 'Game',
  UI: 'UI',
  PAUSE: 'Pause',
  EDITOR: 'Editor',
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
  DISTANCE: 112,
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
