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
  requiredKey?: string;
  requiredKeys?: string[];
}

export interface ItemDef {
  name: string;
  tileFrame: number;
  category: 'key' | 'component' | 'fuel' | 'cure' | 'document' | 'tool';
  keyId?: string;
  useTarget?: string;
  content?: string;
}

export interface DroppedItemState {
  item: ItemDef;
  x: number;
  y: number;
  instanceId: string;
}

export interface InteractableDef {
  id: string;
  x: number;
  y: number;
  type: string;
  text: string;
  item?: ItemDef;
  tileFrame?: number; // if set, render a static sprite at this position (for sign-type objects in the world)
}

export type AfflictedStatus = 'wandering' | 'agitated' | 'frightened' | 'cured' | 'recovered';

export interface AfflictedDef {
  id: string;
  name: string;
  role: string;
  x: number;
  y: number;
  behaviorLoop: string;
  cureCondition?: string;
  recoveryUnlock?: string;
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
}

