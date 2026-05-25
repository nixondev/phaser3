export type WeatherType = 'rain-mild' | 'rain-hard' | 'dripping' | 'clouds';

export interface Position {
  x: number;
  y: number;
}

export interface DoorDefinition {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  targetRoom: string;
  targetDoor: string;
  direction: string;
  spawnX: number;
  spawnY: number;
  requiredKeys?: string[];
  lockedMessage?: string;
  unlockedMessage?: string;
}

export interface ItemDef {
  name: string;
  tileFrame: number;
  /** Which tileset spritesheet to use. Omit for the core 'tileset'. */
  tilesetKey?: string;
  spriteKey?: string;
  category: 'key' | 'component' | 'fuel' | 'cure' | 'document' | 'tool';
  keyId?: string;
  useTarget?: string;
  content?: string;
  consumedOnUse?: boolean;
}

export interface DroppedItemState {
  item: ItemDef;
  x: number;
  y: number;
  instanceId: string;
}

/** One condition that must be true before an interaction can succeed. */
export interface RequireCondition {
  type: 'item' | 'character' | 'flag' | 'flagAbsent';
  value: string;        // keyId for item, character id, or flag name
  consume?: boolean;    // if true and type===item, remove from inventory on success
}

/** One effect that fires after a successful interaction. */
export interface ProduceEffect {
  type: 'setFlag' | 'clearFlag' | 'unlockDoor' | 'dropItem' | 'setFlagDuration' | 'setFlagAfterDelay' | 'toggleFlag';
  value: string;        // flag name / door id / item keyId
  duration?: number;    // milliseconds — used by setFlagDuration
  x?: number;          // world position for dropItem
  y?: number;
  item?: ItemDef;       // item definition for dropItem
}

export interface InteractableDef {
  id: string;
  x: number;
  y: number;
  type: string;
  text: string;
  item?: ItemDef;
  tileFrame?: number;
  /** Which tileset spritesheet for the tileFrame sprite. Omit for the core 'tileset'. */
  tilesetKey?: string;
  requires?: RequireCondition[];
  produces?: ProduceEffect[];
  consumed?: boolean;
  hint?: string;
  textAfter?: string;
  pages?: (string | InteractablePage)[];
  textSequence?: (string | TextSequenceEntry)[];
}

export type AfflictedStatus = 'wandering' | 'agitated' | 'frightened' | 'cured' | 'recovered';

export interface AfflictedDef {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  behaviorLoop: string;
  variant?: string;
  playerVariant?: string;
  cureCondition?: string;
  recoveryUnlock?: string;
  associatedRoom?: string;
  curedClue?: string;
  backstory?: string[];
  recoveredItems?: ItemDef[];
  /** Items dropped into the world at the afflicted's position when cured. */
  holds?: ItemDef[];
  /**
   * If set, pressing E on this recovered resident while the named roster member
   * is also in the current room triggers `conversationDialog` instead of the
   * default solo response. The named value is the other resident's `id`.
   */
  conversationRequires?: string;
  /** Multi-page dialog shown when conversationRequires partner is present. */
  conversationDialog?: string[];
  /** Effects applied once when the conversation reaches its final page. */
  conversationProduces?: ProduceEffect[];
}

/** One effect applied when a specific world flag is set, evaluated at room load. */
export interface FlagEffect {
  type: 'removeTile' | 'setTile' | 'unlockDoor' | 'hideInteractable';
  layer?: 'Ground' | 'Collision' | 'Above';
  x?: number;
  y?: number;
  tileIndex?: number;
  doorId?: string;
  interactableId?: string;
}

/** Evaluated at room load: if flag is set, apply effects to the live tilemap/state. */
export interface FlagCondition {
  flag: string;
  effects: FlagEffect[];
}

export interface CharacterState {
  id: string;
  textureKey: string;
  roomId: string;
  x: number;
  y: number;
}

export interface RoomDefinition {
  id: string;
  name: string;
  mapKey: string;
  tilemapPath: string;
  width: number;
  height: number;
  playerSpawn?: Position;
  doors: DoorDefinition[];
  interactables?: InteractableDef[];
  afflicted?: AfflictedDef[];
  music?: string;
  reverb?: string;
  reverbMix?: number;
  dark?: boolean;
  darkLevel?: number;
  onGroundAlpha?: number;
  weather?: WeatherType | WeatherType[];
  drips?: Array<{ x: number; y: number }>;
  /** Applied at room load: if the flag is set, mutate the live tilemap/state. */
  flagConditions?: FlagCondition[];
  /**
   * Additional tileset names for this room (beyond the core 'tileset').
   * Each entry must have a matching PNG at `assets/tilemaps/<name>.png`.
   * The tilemap JSON must list the same tilesets with correct firstgid values.
   * Room-specific tiles use `tilesetKey: "<name>"` on items/interactables.
   */
  tilesets?: string[];
}

export interface RoomsData {
  rooms: Record<string, RoomDefinition>;
  startRoom: string;
}

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  action: boolean;
  menu: boolean;
  inventory: boolean;
  drop: boolean;
  flashlight: boolean;
  debug: boolean;
  editor: boolean;
  visuals: boolean;
  char1: boolean;
  char2: boolean;
  char3: boolean;
  char4: boolean;
}



export interface InteractablePage {
  text: string;
  produces?: ProduceEffect[];
}


export interface TextSequenceEntry {
  text: string;
  produces?: ProduceEffect[];
  afterDelay?: number;
}
