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
  private tutorialShown = false;
  private roster: CharacterState[] = [];
  private activeCharacterId = 'player';
  private characterInventories: Map<string, (ItemDef | null)[]> = new Map();

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
    // Stash current inventory under the outgoing character
    this.characterInventories.set(this.activeCharacterId, [...this.inventory]);
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

  getCharacterInventory(id: string): (ItemDef | null)[] {
    if (!this.characterInventories.has(id)) {
      this.characterInventories.set(id, new Array(12).fill(null));
    }
    return this.characterInventories.get(id)!;
  }

  // ── Tutorial ────────────────────────────────────────────────────────────

  isTutorialShown(): boolean {
    return this.tutorialShown;
  }

  setTutorialShown(shown: boolean): void {
    this.tutorialShown = shown;
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
    this.tutorialShown = false;
    this.roster = [];
    this.activeCharacterId = 'player';
    this.characterInventories.clear();
  }
}

