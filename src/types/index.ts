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
  interactRadius?: number;
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
  type:
    | 'item'             // active character has item (keyId or name)
    | 'itemAbsent'       // active character does NOT have item (keyId or name)
    | 'itemInRoom'       // a dropped item with this keyId/name exists in current room
    | 'character'        // active character is this id
    | 'characterPresent' // named character's roomId matches current room (parked or active)
    | 'characterCarries' // named character (any, not just active) has item in their inventory
    | 'characterCount'   // number of roster members in current room satisfies min/max
    | 'flag'             // world flag is set
    | 'flagAbsent'       // world flag is NOT set
    | 'trait'            // active character has this trait
    | 'traitPresent';    // any roster member in the current room has this trait
  value: string;         // keyId / character id / flag name / trait name
  consume?: boolean;     // if true and type===item, remove from inventory on success
  characterId?: string;  // for characterCarries: whose inventory to check
  min?: number;          // for characterCount: minimum roster members present (inclusive)
  max?: number;          // for characterCount: maximum roster members present (inclusive)
}

/** One effect that fires after a successful interaction. */
export interface ProduceEffect {
  type:
    | 'setFlag'              // set a world flag permanently
    | 'clearFlag'            // clear a world flag
    | 'toggleFlag'           // flip a flag: set if absent, clear if present
    | 'setFlagDuration'      // set a flag that auto-clears after duration ms
    | 'setFlagAfterDelay'    // set a flag after a delay (duration ms)
    | 'unlockDoor'           // unlock a door by id
    | 'dropItem'             // drop an item into the world at x/y
    | 'giveCharacterItem'    // add item directly to a named character's inventory
    | 'consumeCharacterItem' // remove item (by keyId) from a named character's inventory
    | 'grantTrait';          // grant a trait to the active character
  value: string;        // flag name / door id / item keyId / character id / trait name
  duration?: number;    // milliseconds — used by setFlagDuration / setFlagAfterDelay
  x?: number;          // world position for dropItem
  y?: number;
  item?: ItemDef;       // item definition for dropItem / giveCharacterItem
  characterId?: string; // for giveCharacterItem / consumeCharacterItem: target character
}

export interface InteractableDef {
  id: string;
  x: number;
  y: number;
  type: string;
  text: string;
  interactRadius?: number;
  item?: ItemDef;
  tileFrame?: number;
  /** Which tileset spritesheet for the tileFrame sprite. Omit for the core 'tileset'. */
  tilesetKey?: string;
  /** All conditions must be true (AND). */
  requires?: RequireCondition[];
  /** At least one condition must be true (OR). Evaluated after requires passes. */
  requiresAny?: RequireCondition[];
  produces?: ProduceEffect[];
  consumed?: boolean;
  hint?: string;
  textAfter?: string;
  pages?: (string | InteractablePage)[];
  textSequence?: (string | TextSequenceEntry)[];
  /** If true, sprite renders at DEPTH.HIDDEN and is only visible inside the spectra-vision cone. */
  hidden?: boolean;
  /** If true, no world sprite is created. The interactable is still proximity-scanned and gives its item on E. */
  noSprite?: boolean;
}

export type AfflictedStatus = 'wandering' | 'agitated' | 'frightened' | 'cured' | 'recovered';

/**
 * wander   — drifts randomly within wanderRadius of origin; agitates on proximity.
 * sentinel — stands still; agitates on proximity; immune to flashlight-frighten.
 * drift    — roams widely (3× wanderRadius) with no pause; never agitates.
 * pace     — walks back and forth between origin and a point defined by paceAngle + paceLength.
 * circle   — orbits origin at wanderRadius; agitates on proximity.
 */
export type BehaviorLoop = 'wander' | 'sentinel' | 'drift' | 'pace' | 'circle';

export interface AfflictedDef {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  behaviorLoop: BehaviorLoop;
  variant?: string;
  playerVariant?: string;
  /** Radius from origin used for wander target picking. Default 128px. Drift uses 3×. Circle uses as orbit radius. */
  wanderRadius?: number;
  /** Speed multiplier applied to all movement speeds. Default 1.0. */
  speedMult?: number;
  /** Room ID passed to the proximity sound system. Defaults to 'city-street'. */
  soundRoom?: string;
  /** For 'pace': direction of the patrol path in degrees (0=right, 90=down). Default 0. */
  paceAngle?: number;
  /** For 'pace': distance from origin to the far end of the patrol path in pixels. Default 128. */
  paceLength?: number;
  /** For 'circle': orbital speed in degrees per second. Default 45. */
  circleSpeed?: number;
  /** For 'circle': starting angle on the orbit in degrees (0=right). Default 0. */
  circleStartAngle?: number;
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
  /** Trait tags copied to CharacterState on recovery. Used for trait require conditions. */
  traits?: string[];
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
  traits?: string[];
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
  onCollisionAlpha?: number;
  onAboveAlpha?: number;
  weather?: WeatherType | WeatherType[];
  drips?: Array<{ x: number; y: number }>;
  /** Applied at room load: if the flag is set, mutate the live tilemap/state. */
  flagConditions?: FlagCondition[];
  /** Purely decorative sprites revealed only inside the spectra-vision cone. No interaction. */
  hiddenVisuals?: Array<{ id: string; x: number; y: number; tileFrame: number; tilesetKey?: string }>;
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
  baseTilesets?: string[];
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
  introspect: boolean;
}



export interface InteractablePage {
  text: string;
  /** All conditions must pass for this page to be shown. If they fail, show fallback instead (or skip if no fallback). */
  requires?: RequireCondition[];
  /** Shown in place of text when requires conditions fail. Omit to skip the page entirely. */
  fallback?: string;
  produces?: ProduceEffect[];
}


export interface TextSequenceEntry {
  text: string;
  produces?: ProduceEffect[];
  afterDelay?: number;
}

export type DialogMessageType = 'narrative' | 'system' | 'lore' | 'thought';

export interface DialogMessage {
  text: string;
  type?: DialogMessageType;
}

/** Sub-room anchor for a thought — matches when the player is within r px of (x, y). */
export interface ThoughtSpot {
  x: number;
  y: number;
  r: number;
}

/**
 * A single introspection entry (pattern #13). Thoughts are READERS of game
 * state — deliberately no `produces` field; they never write puzzle state.
 */
export interface ThoughtDef {
  id: string;
  /** WHO — exact character id. Omit (with trait) = all characters. */
  character?: string;
  /** WHO — any character bearing this trait. Both given = AND. */
  trait?: string;
  /** WHERE — room id. Omit = fires anywhere (pure-progress thought). */
  room?: string;
  /** WHERE — sub-room anchor; only meaningful with room. */
  spot?: ThoughtSpot;
  /** WHEN — all must pass (checkRequires). */
  requires?: RequireCondition[];
  /** WHEN — at least one must pass (checkRequiresAny). */
  requiresAny?: RequireCondition[];
  /** Indicator override for special cases. Defaults to '…'. */
  glyph?: string;
  /** Joined with \n; openDialog paginates at 6 lines/page. */
  lines: string[];
  /** Higher wins; ties broken by file order (earlier wins). */
  priority: number;
  /**
   * never  — one read, then permanently out of the pool (per-run).
   * silent — always clickable; glyph lights only until first read.
   * notify — always clickable; glyph re-lights on every room entry.
   */
  repeat: 'never' | 'silent' | 'notify';
}

export interface ThoughtsData {
  thoughts: ThoughtDef[];
}
