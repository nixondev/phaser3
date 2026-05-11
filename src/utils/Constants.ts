export const GAME_CONFIG = {
  WIDTH: 320,
  HEIGHT: 240,
  TILE_SIZE: 16,
  ASSET_SCALE: 4,        // 16 * 4 = 64px upscaled assets
  WORLD_SCALE: 1 / 4,   // brings 64px assets down to 16px world units (= 1 / ASSET_SCALE)
  ENTITY_SCALE: 1.5,    // scale multiplier for characters relative to a tile
  ENTITY_WORLD_SCALE: 1.5 / 4, // entity sprite scale in world space (= ENTITY_SCALE / ASSET_SCALE)
  DEBUG: false,
} as const;

export const PLAYER_CONFIG = {
  SPEED: 80,
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
} as const;

export const ROOM_CONFIG = {
  DEFAULT_ROOM: 'entrance',
  TRANSITION_DURATION: 300,
  DOOR_ACTIVATION_DISTANCE: 8,
} as const;

export const CAMERA_CONFIG = {
  LERP: 0.1,
} as const;

export const INTERACT_CONFIG = {
  DISTANCE: 28,
} as const;

export const FLASHLIGHT_CONFIG = {
  RANGE: 96,            // pixels (~6 tiles)
  HALF_ANGLE: Math.PI / 5, // 36° each side = 72° total beam
  BATTERY_MAX: 100,
  BATTERY_DRAIN_RATE: 2.0, // percent per second
} as const;

export const INVENTORY_CONFIG = {
  ROWS: 2,
  COLS: 6,
  SLOT_SIZE: 14,
} as const;

export const USE_MIDI_MUSIC = true;
