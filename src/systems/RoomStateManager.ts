import { ItemDef, DroppedItemState, CharacterState } from '@/types';

export class RoomStateManager {
  private static instance: RoomStateManager;
  private visitedRooms: Set<string> = new Set();
  private currentRoom = '';
  private collectedItems: Set<string> = new Set();
  private unlockedDoors: Set<string> = new Set();
  private curedResidents: Set<string> = new Set();
  private recoveredResidents: Set<string> = new Set();
  private poweredDevices: Set<string> = new Set();
  private generatorFuel = 0;
  private inventory: (ItemDef | null)[] = new Array(12).fill(null);
  private droppedItems: Map<string, DroppedItemState[]> = new Map();
  private roster: CharacterState[] = [];
  private activeCharacterId = 'player';
  private characterInventories: Map<string, (ItemDef | null)[]> = new Map();
  private worldFlags: Set<string> = new Set();
  private flagExpiries: Map<string, number> = new Map();
  private flagPending: Map<string, number> = new Map();
  private readThoughts: Set<string> = new Set();

  static getInstance(): RoomStateManager {
    if (!RoomStateManager.instance) {
      RoomStateManager.instance = new RoomStateManager();
    }
    return RoomStateManager.instance;
  }

  // ── Rooms ───────────────────────────────────────────────────────────────

  getVisitedCount(): number { return this.visitedRooms.size; }

  getUnlockedCount(): number { return this.unlockedDoors.size; }

  getCuredCount(): number { return this.curedResidents.size; }

  getPoweredCount(): number { return this.poweredDevices.size; }

  visitRoom(roomId: string): void {
    this.visitedRooms.add(roomId);
    this.currentRoom = roomId;
  }

  hasVisited(roomId: string): boolean {
    return this.visitedRooms.has(roomId);
  }

  getCurrentRoom(): string {
    return this.currentRoom;
  }

  // ── Collected items ─────────────────────────────────────────────────────

  collectItem(itemId: string): void {
    this.collectedItems.add(itemId);
  }

  isItemCollected(itemId: string): boolean {
    return this.collectedItems.has(itemId);
  }

  // ── Doors ───────────────────────────────────────────────────────────────

  unlockDoor(doorId: string): void {
    this.unlockedDoors.add(doorId);
  }

  isDoorUnlocked(doorId: string): boolean {
    return this.unlockedDoors.has(doorId);
  }

  // ── Afflicted residents ──────────────────────────────────────────────────

  cureResident(residentId: string): void {
    this.curedResidents.add(residentId);
  }

  isResidentCured(residentId: string): boolean {
    return this.curedResidents.has(residentId);
  }

  recoverResident(residentId: string): void {
    this.recoveredResidents.add(residentId);
  }

  isResidentRecovered(residentId: string): boolean {
    return this.recoveredResidents.has(residentId);
  }

  getRecoveredCount(): number {
    return this.recoveredResidents.size;
  }

  // ── Power ───────────────────────────────────────────────────────────────

  addFuel(amount: number): void {
    this.generatorFuel += amount;
  }

  getFuel(): number {
    return this.generatorFuel;
  }

  powerDevice(deviceId: string): boolean {
    if (this.generatorFuel <= 0) return false;
    this.generatorFuel--;
    this.poweredDevices.add(deviceId);
    return true;
  }

  isDevicePowered(deviceId: string): boolean {
    return this.poweredDevices.has(deviceId);
  }

  // ── Inventory ───────────────────────────────────────────────────────────

  addToInventory(item: ItemDef): number {
    const slot = this.inventory.indexOf(null);
    if (slot === -1) return -1;
    this.inventory[slot] = { ...item };
    return slot;
  }

  removeFromInventory(slot: number): ItemDef | null {
    const item = this.inventory[slot];
    this.inventory[slot] = null;
    return item;
  }

  setSlot(index: number, item: ItemDef | null): void {
    this.inventory[index] = item ? { ...item } : null;
  }

  getInventory(): (ItemDef | null)[] {
    return this.inventory;
  }

  getSlot(index: number): ItemDef | null {
    return this.inventory[index] ?? null;
  }

  findKeyForDoor(requiredKey: string): number {
    return this.inventory.findIndex(
      (item) => item !== null && item.category === 'key' && item.keyId === requiredKey
    );
  }

  hasItemWithKeyId(keyId: string): boolean {
    return this.inventory.some((item) => item !== null && item.keyId === keyId);
  }

  hasItemWithCategory(category: string): boolean {
    return this.inventory.some((item) => item !== null && item.category === category);
  }

  // ── Dropped items ───────────────────────────────────────────────────────

  addDroppedItem(roomId: string, dropped: DroppedItemState): void {
    if (!this.droppedItems.has(roomId)) {
      this.droppedItems.set(roomId, []);
    }
    this.droppedItems.get(roomId)!.push(dropped);
  }

  removeDroppedItem(roomId: string, instanceId: string): void {
    const items = this.droppedItems.get(roomId);
    if (!items) return;
    const idx = items.findIndex((d) => d.instanceId === instanceId);
    if (idx >= 0) items.splice(idx, 1);
  }

  getDroppedItems(roomId: string): DroppedItemState[] {
    return this.droppedItems.get(roomId) || [];
  }

  // ── Roster / character switching ────────────────────────────────────────

  initRoster(protagonistState: CharacterState): void {
    if (this.roster.length === 0) {
      this.roster = [protagonistState];
      this.characterInventories.set('player', this.inventory);
    }
  }

  addToRoster(state: CharacterState): void {
    if (this.roster.find(c => c.id === state.id)) return;
    this.roster.push(state);
    this.characterInventories.set(state.id, new Array(12).fill(null));
  }

  getRoster(): CharacterState[] {
    return this.roster;
  }

  getActiveCharacterId(): string {
    return this.activeCharacterId;
  }

  setActiveCharacter(id: string): void {
    if (id === this.activeCharacterId) return;
    // Stash current inventory reference under the outgoing character
    this.characterInventories.set(this.activeCharacterId, this.inventory);
    // Load the incoming character's inventory into the active slot
    const incoming = this.characterInventories.get(id) ?? new Array(12).fill(null);
    this.inventory = incoming as (ItemDef | null)[];
    this.activeCharacterId = id;
  }

  updateCharacterPosition(id: string, roomId: string, x: number, y: number): void {
    const state = this.roster.find(c => c.id === id);
    if (state) {
      state.roomId = roomId;
      state.x = x;
      state.y = y;
    }
  }

  getCharacterState(id: string): CharacterState | undefined {
    return this.roster.find(c => c.id === id);
  }

  getActiveCharacterTraits(): string[] {
    const state = this.roster.find(c => c.id === this.activeCharacterId);
    return state?.traits ?? [];
  }

  grantTrait(trait: string): void {
    const state = this.roster.find(c => c.id === this.activeCharacterId);
    if (!state) return;
    if (!state.traits) state.traits = [];
    if (!state.traits.includes(trait)) state.traits.push(trait);
  }

  anyInRoomHasTrait(roomId: string, trait: string): boolean {
    return this.roster.some(c => c.roomId === roomId && c.traits?.includes(trait));
  }

  getCharacterInventory(id: string): (ItemDef | null)[] {
    if (id === this.activeCharacterId) return this.inventory;
    if (!this.characterInventories.has(id)) {
      this.characterInventories.set(id, new Array(12).fill(null));
    }
    return this.characterInventories.get(id)!;
  }

  addToCharacterInventory(id: string, item: ItemDef): number {
    const inv = this.getCharacterInventory(id);
    const slot = inv.indexOf(null);
    if (slot === -1) return -1;
    inv[slot] = { ...item };
    return slot;
  }

  removeFromCharacterInventory(id: string, keyId: string): boolean {
    const inv = this.getCharacterInventory(id);
    const slot = inv.findIndex(i => i !== null && (i.keyId === keyId || i.name === keyId));
    if (slot < 0) return false;
    inv[slot] = null;
    return true;
  }

  // ── World flags (Phase 5) ───────────────────────────────────────────────

  setFlag(name: string): void {
    this.worldFlags.add(name);
    this.flagExpiries.delete(name);
    this.flagPending.delete(name);
    this.flagPending.delete(name);
  }

  setFlagWithDuration(name: string, durationMs: number): void {
    this.worldFlags.add(name);
    this.flagExpiries.set(name, Date.now() + durationMs);
  }

  clearFlag(name: string): void {
    this.worldFlags.delete(name);
    this.flagExpiries.delete(name);
    this.flagPending.delete(name);
    this.flagPending.delete(name);
  }

  hasFlag(name: string): boolean {
    if (!this.worldFlags.has(name)) return false;
    const expiry = this.flagExpiries.get(name);
    if (expiry !== undefined && Date.now() > expiry) {
      this.worldFlags.delete(name);
      this.flagExpiries.delete(name);
    this.flagPending.delete(name);
    this.flagPending.delete(name);
      return false;
    }
    return true;
  }

  getFlags(): Set<string> { return this.worldFlags; }


  // ── Thoughts (introspection channel) ────────────────────────────────────

  markThoughtRead(thoughtId: string): void {
    this.readThoughts.add(thoughtId);
  }

  isThoughtRead(thoughtId: string): boolean {
    return this.readThoughts.has(thoughtId);
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  serialize(): object {
    return {
      visitedRooms: [...this.visitedRooms],
      currentRoom: this.currentRoom,
      collectedItems: [...this.collectedItems],
      unlockedDoors: [...this.unlockedDoors],
      curedResidents: [...this.curedResidents],
      recoveredResidents: [...this.recoveredResidents],
      poweredDevices: [...this.poweredDevices],
      generatorFuel: this.generatorFuel,
      inventory: this.inventory,
      droppedItems: [...this.droppedItems.entries()],
      roster: this.roster,
      activeCharacterId: this.activeCharacterId,
      characterInventories: [...this.characterInventories.entries()],
      worldFlags: [...this.worldFlags],
      flagExpiries: [...this.flagExpiries.entries()],
      flagPending: [...this.flagPending.entries()],
      readThoughts: [...this.readThoughts],
    };
  }

  loadFrom(data: Record<string, any>): void {
    this.visitedRooms = new Set(data.visitedRooms ?? []);
    this.currentRoom = data.currentRoom ?? '';
    this.collectedItems = new Set(data.collectedItems ?? []);
    this.unlockedDoors = new Set(data.unlockedDoors ?? []);
    this.curedResidents = new Set(data.curedResidents ?? []);
    this.recoveredResidents = new Set(data.recoveredResidents ?? []);
    this.poweredDevices = new Set(data.poweredDevices ?? []);
    this.generatorFuel = data.generatorFuel ?? 0;
    this.inventory = data.inventory ?? new Array(12).fill(null);
    this.droppedItems = new Map(data.droppedItems ?? []);
    this.roster = data.roster ?? [];
    this.activeCharacterId = data.activeCharacterId ?? 'player';
    this.characterInventories = new Map(data.characterInventories ?? []);
    this.worldFlags = new Set(data.worldFlags ?? []);
    this.flagExpiries = new Map(data.flagExpiries ?? []);
    this.flagPending = new Map(data.flagPending ?? []);
    this.readThoughts = new Set(data.readThoughts ?? []);
  }

  // ── Reset ───────────────────────────────────────────────────────────────

  reset(): void {
    this.visitedRooms.clear();
    this.currentRoom = '';
    this.collectedItems.clear();
    this.unlockedDoors.clear();
    this.curedResidents.clear();
    this.recoveredResidents.clear();
    this.poweredDevices.clear();
    this.generatorFuel = 0;
    this.inventory = new Array(12).fill(null);
    this.droppedItems.clear();
    this.roster = [];
    this.activeCharacterId = 'player';
    this.characterInventories.clear();
    this.worldFlags.clear();
    this.flagExpiries.clear();
    this.flagPending.clear();
    this.readThoughts.clear();
  }
}

