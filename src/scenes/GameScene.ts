import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, CAMERA_CONFIG, DEPTH, INTERACT_CONFIG, USE_MIDI_MUSIC } from '@utils/Constants';
import { Player } from '@entities/Player';
import { Afflicted } from '@entities/Afflicted';
import { Flashlight } from '@systems/Flashlight';
import { DarknessOverlay } from '@systems/DarknessOverlay';
import { InputManager } from '@systems/InputManager';
import { RoomManager } from '@systems/RoomManager';
import { TransitionManager } from '@systems/TransitionManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { DoorDefinition, InteractableDef, DroppedItemState, InputState, ItemDef, AfflictedStatus, CharacterState, AfflictedDef, DialogMessage, DialogMessageType } from '@/types';
import { debug } from '@utils/Debug';
import { WeatherManager } from '@systems/WeatherManager';
// SaveManager is intentionally not called — every run starts fresh.
// The serialize/loadFrom infrastructure is preserved for future use.
// import { SaveManager } from '@utils/SaveManager';
import { checkRequires, checkRequiresAny, consumeRequires, applyProduces, applyFlagConditions } from '@systems/InteractionResolver';
import { resolveTileSprite, tilesetSpritesheetKey } from '@utils/TilesetResolver';

const CLINIC_DOOR_X     = 672;
const CLINIC_DOOR_Y     = 1216;
const CLINIC_SOUND_DIST = 600;
const CLINIC_SOUND_ID   = 'clinic-hint';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private inputManager!: InputManager;
  private roomManager!: RoomManager;
  private transitionManager!: TransitionManager;
  private rsm!: RoomStateManager;
  private collider?: Phaser.Physics.Arcade.Collider;
  private onCollisionCollider?: Phaser.Physics.Arcade.Collider;
  private afflictedCollider?: Phaser.Physics.Arcade.Collider;
  private afflictedOnCollisionCollider?: Phaser.Physics.Arcade.Collider;
  private playerAfflictedCollider?: Phaser.Physics.Arcade.Collider;
  private doorOverlaps: Phaser.Physics.Arcade.Collider[] = [];
  private nearDoor: DoorDefinition | null = null;
  private isTransitioning = false;
  private dialogOpen = false;
  private messageQueue: DialogMessage[] = [];
  private cureCooldown = false;  // prevents multi-afflicted same-frame double-trigger
  private lockedDoorCooldown = 0;
  private itemSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private itemShadows: Map<string, Phaser.GameObjects.Graphics> = new Map();
  private hiddenSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();

  // Afflicted
  private afflictedGroup!: Phaser.Physics.Arcade.Group;

  // Flashlight (persistent across rooms — always available)
  private flashlight!: Flashlight;
  private darknessOverlay!: DarknessOverlay;

  // Inventory
  private inventoryMode = false;
  private inventoryCursor = 0;

  // Recovery conversation paging — tracks which backstory page each cured resident is on
  private recoveryPage: Map<string, number> = new Map();
  // Inter-character conversation paging — keyed by npc id
  private conversationPage: Map<string, number> = new Map();
  // Tracks which npc conversations have had their produces applied (session-only)
  private conversedWith: Set<string> = new Set();

  // Standing sprites for inactive roster members present in the current room
  private parkedBodies: Map<string, Phaser.GameObjects.Sprite> = new Map();

  private edgeShadows?: Phaser.GameObjects.RenderTexture;

  private weatherManager!: WeatherManager;

  // TODO: remove before ship — Ctrl+Shift+/ unlock-all debug keys
  private dbgCtrlKey?: Phaser.Input.Keyboard.Key;
  private dbgShiftKey?: Phaser.Input.Keyboard.Key;
  private dbgSlashKey?: Phaser.Input.Keyboard.Key;

  constructor() {
    super(SCENES.GAME);
  }

  public getInputManager(): InputManager {
    return this.inputManager;
  }

  create(): void {
    this.isTransitioning = false;
    this.dialogOpen = false;
    this.messageQueue = [];
    this.lockedDoorCooldown = 0;
    this.inventoryMode = false;
    this.inventoryCursor = 0;

    this.inputManager = new InputManager(this);
    // TODO: remove before ship — Ctrl+Shift+/ unlock-all debug shortcut
    const kb = this.input.keyboard!;
    this.dbgCtrlKey  = kb.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.dbgShiftKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT);
    this.dbgSlashKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH);
    this.roomManager = new RoomManager(this);
    this.transitionManager = new TransitionManager(this);
    this.rsm = RoomStateManager.getInstance();
    this.afflictedGroup = this.physics.add.group();
    this.flashlight = new Flashlight(this);
    this.darknessOverlay = new DarknessOverlay(this);
    this.weatherManager = new WeatherManager(this);

    // Always hand AudioManager the new scene (keeps volume control working).
    // Stop title MP3 before starting in-game music.
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().stopMusic();

    const startRoom = this.roomManager.getStartRoom();
    this.roomManager.loadRoom(startRoom);
    this.rsm.visitRoom(startRoom);
    this.weatherManager.updateForRoom(startRoom);

    const roomDef = this.roomManager.getCurrentRoomDef();
    this.darknessOverlay.setEnabled(roomDef.dark === true, roomDef.darkLevel);

    if (USE_MIDI_MUSIC) {
      const music = MusicManager.getInstance();
      const roomId = this.roomManager.getCurrentRoomId();
      music.playRoomMusic(roomId);
    } else if (roomDef.music) {
      AudioManager.getInstance().playMusic(roomDef.music);
    }

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (USE_MIDI_MUSIC) MusicManager.getInstance().stop();
      this.weatherManager.destroy();
      this.darknessOverlay.destroy();
    });

    this.events.on('character-switch-request', (id: string) => {
      this.switchToCharacter(id);
    });

    const spawn = roomDef.playerSpawn || { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
    this.player = new Player(this, spawn.x, spawn.y);

    this.rsm.initRoster({ id: 'player', textureKey: 'player', roomId: startRoom, x: spawn.x, y: spawn.y });

    this.setupCollisions();
    this.setupCamera();
    applyFlagConditions(roomDef, this.rsm, this.roomManager);
    this.buildEdgeShadows();
    this.createWorldItemSprites();
    this.spawnAfflicted();
    this.refreshParkedBodies();

    this.emitFullState(roomDef.name);
    debug('GameScene created, starting in room:', startRoom);

    if (!this.rsm.isTutorialShown()) {
      this.time.delayedCall(1000, () => {
        this.showTutorialDialog();
      });
    }
  }

  private paginateText(text: string, maxLines = 6): string[] {
    const lines = text.split('\n');
    if (lines.length <= maxLines) return [text];
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += maxLines) {
      pages.push(lines.slice(i, i + maxLines).join('\n'));
    }
    return pages;
  }

  private openDialog(text: string, type?: DialogMessageType): void {
    const pages = this.paginateText(text);
    if (this.dialogOpen) {
      for (const page of pages) this.messageQueue.push({ text: page, type });
      return;
    }
    this.dialogOpen = true;
    this.events.emit('dialog-open', { text: pages[0], type } as DialogMessage);
    for (let i = 1; i < pages.length; i++) this.messageQueue.push({ text: pages[i], type });
  }

  private showTutorialDialog(): void {
    this.rsm.setTutorialShown(true);
    this.openDialog("Welcome. Controls: WASD to move, E to interact, TAB for inventory, F to toggle Flashlight, ESC for menu.", 'system');
  }

  update(_time: number, delta: number): void {
    // TODO: remove before ship — Ctrl+Shift+/ unlocks all doors across all rooms
    if (this.dbgSlashKey && Phaser.Input.Keyboard.JustDown(this.dbgSlashKey) &&
        this.dbgCtrlKey?.isDown && this.dbgShiftKey?.isDown) {
      const allRooms = RoomManager.getRoomsData().rooms;
      let count = 0;
      Object.values(allRooms).forEach(room => room.doors.forEach(door => { this.rsm.unlockDoor(door.id); count++; }));
      this.openDialog(`[DEBUG] All ${count} doors unlocked.`, 'system');
    }

    this.weatherManager.update(delta);
    const cam = this.cameras.main;
    this.darknessOverlay.update(
      this.player.x - cam.scrollX,
      this.player.y - cam.scrollY,
      this.flashlight,
    );
    if (this.isTransitioning) return;
    if (this.lockedDoorCooldown > 0) this.lockedDoorCooldown--;

    // Inventory mode
    if (this.inventoryMode) {
      this.handleInventoryMode(delta);
      return;
    }

    const input = this.inputManager.getState();

    // Flashlight toggle — only if active character carries the flashlight item
    const hasFlashlight = this.rsm.hasItemWithKeyId('flashlight');
    if (!hasFlashlight) {
      this.flashlight.turnOff();
    } else if (input.flashlight) {
      this.flashlight.toggle();
    }

    // Character switching via number keys
    const roster = this.rsm.getRoster();
    if (input.char1 && roster[0]) this.switchToCharacter(roster[0].id);
    if (input.char2 && roster[1]) this.switchToCharacter(roster[1].id);
    if (input.char3 && roster[2]) this.switchToCharacter(roster[2].id);
    if (input.char4 && roster[3]) this.switchToCharacter(roster[3].id);

    // Dialog mode
    if (this.dialogOpen) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      this.player.playIdle();
      const origin = this.player.getFlashlightOrigin();
      this.flashlight.update(origin.x, origin.y, this.player.getFacingAngle(), delta);
      this.updateHiddenLayer();
      if (input.action || input.menu) {
        if (this.messageQueue.length > 0) {
          const next = this.messageQueue.shift()!;
          this.events.emit('dialog-open', next);
        } else {
          this.dialogOpen = false;
          this.events.emit('dialog-close');
        }
      }
      return;
    }

    // Toggle inventory
    if (input.inventory) {
      this.inventoryMode = true;
      this.events.emit('inventory-mode', true);
      this.events.emit('inventory-cursor', this.inventoryCursor);
      return;
    }

    this.player.update(input);

    // Update flashlight visual and check cone hits against afflicted
    const facingAngle = this.player.getFacingAngle();
    const origin = this.player.getFlashlightOrigin();
    this.flashlight.update(origin.x, origin.y, facingAngle, delta);
    if (this.flashlight.isOn) this.rsm.setFlag('flashlight-on');
    else this.rsm.clearFlag('flashlight-on');
    this.updateHiddenLayer();

    // Update afflicted AI
    this.afflictedGroup.getChildren().forEach((child) => {
      const afflicted = child as Afflicted;
      if (!afflicted.active) return;

      // Flashlight cone: frighten wandering or chasing afflicted
      if (this.flashlight.isOn) {
        const status = afflicted.getStatus();
        if (status === 'wandering' || status === 'agitated') {
          if (this.flashlight.isInCone(afflicted.x, afflicted.y)) {
            afflicted.setStatus('frightened');
            return;
          }
        }
      }

      afflicted.updateAI(this.player.x, this.player.y);
    });

    this.checkInteractables(input);
    this.updateClinicProximity();

    if (input.menu) {
      this.scene.pause();
      this.scene.launch(SCENES.PAUSE);
    }
  }

  // ── Afflicted ───────────────────────────────────────────────────────────

  // Returns the most complete def for an afflicted ID across all rooms —
  // the one with backstory/recoveredItems wins over minimal stub entries.
  private findFullAfflictedDef(id: string): AfflictedDef | null {
    const allRooms = RoomManager.getRoomsData().rooms;
    let best: AfflictedDef | null = null;
    for (const room of Object.values(allRooms)) {
      for (const d of room.afflicted || []) {
        if (d.id !== id) continue;
        if (!best || (d.backstory?.length ?? 0) > (best.backstory?.length ?? 0)) {
          best = d;
        }
      }
    }
    return best;
  }

  private spawnAfflicted(): void {
    // Clear existing and stop their proximity sounds
    this.afflictedGroup.getChildren().forEach((a) => {
      (a as Afflicted).destroy();
    });
    this.afflictedGroup.clear(true, true);
    if (this.afflictedCollider) this.afflictedCollider.destroy();
    if (this.afflictedOnCollisionCollider) { this.afflictedOnCollisionCollider.destroy(); this.afflictedOnCollisionCollider = undefined; }
    if (this.playerAfflictedCollider) this.playerAfflictedCollider.destroy();

    const roomDef = this.roomManager.getCurrentRoomDef();
    const currentRoomId = this.roomManager.getCurrentRoomId();
    for (const def of roomDef.afflicted || []) {
      let status: AfflictedStatus = 'wandering';
      const isCured = this.rsm.isResidentCured(def.id);
      const isRecovered = this.rsm.isResidentRecovered(def.id);
      if (isRecovered) status = 'recovered';
      else if (isCured) status = 'cured';

      // Recovered residents are represented by parked body sprites — never spawn as NPC
      if (isRecovered) continue;

      // Cured residents with an associatedRoom only appear in that room
      if (isCured && def.associatedRoom && def.associatedRoom !== currentRoomId) {
        continue;
      }

      // Uncured residents never appear in their associatedRoom — that space is reserved for after the cure
      if (!isCured && def.associatedRoom && def.associatedRoom === currentRoomId) {
        continue;
      }

      // The currently active character IS the player sprite — don't also spawn them as an NPC
      if (def.id === this.rsm.getActiveCharacterId()) {
        continue;
      }

      // Use the most complete def (the one with backstory/recoveredItems),
      // but keep the current room's x/y for positioning.
      const fullDef = this.findFullAfflictedDef(def.id);
      const spawnDef: AfflictedDef = fullDef ? { ...fullDef, x: def.x, y: def.y } : def;

      const afflicted = new Afflicted(this, spawnDef, status);
      this.afflictedGroup.add(afflicted);
    }

    // Collide afflicted with world
    const collisionLayer = this.roomManager.getCollisionLayer();
    this.afflictedCollider = this.physics.add.collider(this.afflictedGroup, collisionLayer);
    const onCollisionLayer = this.roomManager.getOnCollisionLayer();
    if (onCollisionLayer) {
      this.afflictedOnCollisionCollider = this.physics.add.collider(this.afflictedGroup, onCollisionLayer);
    }

    // Check for player reaching afflicted -> restart at home
    this.playerAfflictedCollider = this.physics.add.overlap(this.player, this.afflictedGroup, this.handleAfflictedCollision, undefined, this);
  }

  private handleAfflictedCollision(_player: any, afflictedObject: any): void {
    if (this.isTransitioning || this.cureCooldown) return;
    const afflicted = afflictedObject as Afflicted;
    const status = afflicted.getStatus();
    if (status === 'cured' || status === 'recovered') return;

    // If holding a cure, use it automatically rather than respawning
    const inventory = this.rsm.getInventory();
    const cureSlot = inventory.findIndex(item => item?.category === 'cure' &&
      (!item.useTarget || item.useTarget === afflicted.getId()));
    if (cureSlot !== -1) {
      this.cureCooldown = true;
      this.time.delayedCall(500, () => { this.cureCooldown = false; });
      const item = inventory[cureSlot]!;
      this.rsm.removeFromInventory(cureSlot);
      this.rsm.cureResident(afflicted.getId());
      afflicted.setStatus('cured');
      const associatedRoom = afflicted.getAssociatedRoom();
      if (associatedRoom) this.unlockDoorsToRoom(associatedRoom);
      this.cameras.main.shake(200, 0.006);
      this.emitInventoryChanged();
      this.dropHeldItems(afflicted);
      const clue = afflicted.getCuredClue();
      const msg = clue
        ? `The ${item.name} shattered on impact.\n${afflicted.getName()} slumps against the wall.\n\n${clue}`
        : `The ${item.name} shattered on impact.\n${afflicted.getName()} seems to be calming down.\nThey seem to need some time alone.`;
      this.openDialog(msg, 'narrative');

      return;
    }

    this.isTransitioning = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.cameras.main.shake(400, 0.01);

    this.time.delayedCall(400, () => {
      this.transitionManager.transition(() => {
        if (USE_MIDI_MUSIC) MusicManager.getInstance().stop();
        this.rsm.reset();
        this.scene.restart();
      });
    });
  }

  private getNearestAfflicted(): Afflicted | null {
    let nearest: Afflicted | null = null;
    let nearestDist = INTERACT_CONFIG.DISTANCE as number;
    this.afflictedGroup.getChildren().forEach((child) => {
      const a = child as Afflicted;
      if (!a.active) return;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = a;
      }
    });
    return nearest;
  }

  private updateClinicProximity(): void {
    if (!USE_MIDI_MUSIC) return;
    const roomDef = this.roomManager.getCurrentRoomDef();
    if (roomDef.id !== 'city-street' || this.rsm.hasVisited('clinic')) {
      MusicManager.getInstance().stopProximity(CLINIC_SOUND_ID);
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, CLINIC_DOOR_X, CLINIC_DOOR_Y);
    if (dist < CLINIC_SOUND_DIST) {
      MusicManager.getInstance().playProximity(CLINIC_SOUND_ID, 'miditheme-hint', 'city-street');
      const vol = Math.max(0, 1 - dist / CLINIC_SOUND_DIST);
      MusicManager.getInstance().updateProximityVolume(CLINIC_SOUND_ID, vol * 0.6); // Slightly quieter than main theme
    } else {
      MusicManager.getInstance().updateProximityVolume(CLINIC_SOUND_ID, 0);
    }
  }

  // ── Inventory mode ──────────────────────────────────────────────────────

  private handleInventoryMode(delta: number): void {
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.player.playIdle();
    const origin = this.player.getFlashlightOrigin();
    this.flashlight.update(origin.x, origin.y, this.player.getFacingAngle(), delta);
    this.updateHiddenLayer();

    const input = this.inputManager.getTapState();
    const cols = 6;

    const col = this.inventoryCursor % cols;
    const row = Math.floor(this.inventoryCursor / cols);
    if (input.right && col < cols - 1) this.inventoryCursor++;
    if (input.left && col > 0) this.inventoryCursor--;
    if (input.down && row < 1) this.inventoryCursor += cols;
    if (input.up && row > 0) this.inventoryCursor -= cols;

    this.events.emit('inventory-cursor', this.inventoryCursor);

    if (input.action) {
      this.useInventoryItem(this.inventoryCursor);
      return;
    }
    if (input.drop) {
      this.dropInventoryItem(this.inventoryCursor);
      return;
    }
    if (input.inventory || input.menu) {
      this.inventoryMode = false;
      this.events.emit('inventory-mode', false);
    }
  }

  private useInventoryItem(slot: number): void {
    const item = this.rsm.getSlot(slot);
    if (!item) return;

    if (item.category === 'key') {
      this.exitInventory();
      this.openDialog('Keys are used automatically\nat locked doors.', 'system');
      return;
    }

    if (item.category === 'cure') {
      this.exitInventory();
      this.openDialog('Walk into them to administer the cure.', 'system');
      return;
    }

    if (item.category === 'document') {
      this.exitInventory();
      this.scene.launch(SCENES.DOCUMENT_READER, { title: item.name, content: item.content ?? '' });
      return;
    }

    // Generic tool/fuel/component — show the item's text if available, then consume if flagged.
    this.exitInventory();
    this.openDialog(item.content ?? "Nothing to use this on right now.", item.content ? 'lore' : 'system');
    if (item.consumedOnUse) {
      this.rsm.removeFromInventory(slot);
      this.emitInventoryChanged();
    }
  }

  private dropInventoryItem(slot: number): void {
    const item = this.rsm.removeFromInventory(slot);
    if (!item) return;
    this.dropItemToWorld(item);
    this.emitInventoryChanged();
  }

  private dropItemToWorld(item: ItemDef): void {
    const roomId = this.rsm.getCurrentRoom();
    const instanceId = `drop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const dropX = this.player.x;
    const dropY = this.player.y + 12;
    this.rsm.addDroppedItem(roomId, { item, x: dropX, y: dropY, instanceId });
    const rd = resolveTileSprite(item.tileFrame, item.tilesetKey);
    this.createItemSprite(instanceId, rd.key, rd.frame, dropX, dropY);
  }

  private exitInventory(): void {
    this.inventoryMode = false;
    this.events.emit('inventory-mode', false);
  }

  private emitInventoryChanged(): void {
    this.events.emit('inventory-changed', this.rsm.getInventory());
  }

  // ── Interactables & item pickup ─────────────────────────────────────────

  private checkInteractables(input: InputState): void {
    if (this.isTransitioning) {
      this.nearDoor = null;
      this.events.emit('hide-interact-prompt');
      return;
    }

    const roomDef = this.roomManager.getCurrentRoomDef();
    const interactables = roomDef.interactables || [];
    const roomId = this.rsm.getCurrentRoom();
    const droppedItems = this.rsm.getDroppedItems(roomId);

    let nearestType: 'door' | 'interactable' | 'dropped' | 'afflicted' | null = null;
    let nearestDoor: DoorDefinition | null = null;
    let nearestInteractable: InteractableDef | null = null;
    let nearestDropped: DroppedItemState | null = null;
    let nearestAfflicted: Afflicted | null = null;
    let nearestDist = Infinity;
    const defaultRadius = INTERACT_CONFIG.DISTANCE as number;

    for (const zone of this.roomManager.getDoorZones()) {
      const doorDef = zone.getData('doorDef') as DoorDefinition;
      const radius = doorDef.interactRadius ?? defaultRadius;
      const zb = zone.body as Phaser.Physics.Arcade.StaticBody;
      const cx = zb.x + zb.width / 2;
      const cy = zb.y + zb.height / 2;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, cx, cy);
      if (dist < radius && dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'door';
        nearestDoor = doorDef;
        nearestInteractable = null;
        nearestDropped = null;
        nearestAfflicted = null;
      }
    }

    const adaptedMode = this.flashlight.isOn && this.rsm.hasItemWithKeyId('spectra-adapter');
    for (const inter of interactables) {
      if (inter.type === 'item' && this.rsm.isItemCollected(inter.id)) continue;
      if (inter.hidden && !adaptedMode) continue;
      const radius = inter.interactRadius ?? defaultRadius;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, inter.x, inter.y);
      if (dist < radius && dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'interactable';
        nearestInteractable = inter;
        nearestDoor = null;
        nearestDropped = null;
        nearestAfflicted = null;
      }
    }
    for (const dropped of droppedItems) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, dropped.x, dropped.y);
      if (dist < defaultRadius && dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'dropped';
        nearestDropped = dropped;
        nearestDoor = null;
        nearestInteractable = null;
        nearestAfflicted = null;
      }
    }
    for (const child of this.afflictedGroup.getChildren()) {
      const a = child as Afflicted;
      if (!a.active) continue;
      const status = a.getStatus();
      if (status !== 'cured' && status !== 'recovered') continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
      if (dist < defaultRadius && dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'afflicted';
        nearestAfflicted = a;
        nearestDoor = null;
        nearestInteractable = null;
        nearestDropped = null;
      }
    }

    this.nearDoor = nearestType === 'door' ? nearestDoor : null;

    if (nearestType) {
      this.events.emit('show-interact-prompt');
      if (input.action) {
        if (nearestType === 'door' && nearestDoor) {
          this.handleDoorTransition(nearestDoor);
        } else if (nearestType === 'interactable' && nearestInteractable) {
          this.handleInteractable(nearestInteractable);
        } else if (nearestType === 'dropped' && nearestDropped) {
          this.handleDroppedItemPickup(nearestDropped);
        } else if (nearestType === 'afflicted' && nearestAfflicted) {
          this.handleAfflictedInteract(nearestAfflicted);
        }
      }
    } else {
      this.events.emit('hide-interact-prompt');
    }
  }

  /**
   * Unified interactable handler. Routes through the requires/produces resolver
   * when those fields are present; falls back to legacy type-switch otherwise.
   */
  private handleInteractable(inter: InteractableDef): void {
    const roomId = this.rsm.getCurrentRoom();
    const hasRequires = inter.requires !== undefined;
    const hasRequiresAny = inter.requiresAny !== undefined && inter.requiresAny.length > 0;
    const hasProduces = inter.produces !== undefined && inter.produces.length > 0;
    const hasPages = inter.pages !== undefined && inter.pages.length > 0;

    if (hasRequires || hasRequiresAny || hasProduces || hasPages) {
      // Resolver path ──────────────────────────────────────────────────────

      // AND check — all must pass
      const conditions = inter.requires ?? [];
      const result = checkRequires(conditions, this.rsm, roomId);
      if (!result.met) {
        this.openDialog(result.message, 'system');
        this.events.emit('hide-interact-prompt');
        return;
      }

      // OR check — at least one must pass
      if (hasRequiresAny) {
        const anyResult = checkRequiresAny(inter.requiresAny!, this.rsm, roomId);
        if (!anyResult.met) {
          this.openDialog(anyResult.message, 'system');
          this.events.emit('hide-interact-prompt');
          return;
        }
      }

      // Conditions met — consume items, apply top-level effects
      consumeRequires(conditions, this.rsm);
      const newDropped = applyProduces(inter.produces ?? [], this.rsm, roomId, this);

      // If item-type pickup, also give the item
      if (inter.type === 'item' && inter.item) {
        const slot = this.rsm.addToInventory(inter.item);
        if (slot < 0) {
          this.openDialog('Inventory is full!\nDrop something first. (TAB)', 'system');
          return;
        }
        this.rsm.collectItem(inter.id);
        this.removeItemSprite(inter.id);
      }

      // Mark consumed interactables as collected so they disappear
      if (inter.consumed) {
        this.rsm.collectItem(inter.id);
        this.removeItemSprite(inter.id);
      }

      // Spawn world sprites for any dropped items
      for (const dropped of newDropped) {
        const r = resolveTileSprite(dropped.item.tileFrame, dropped.item.tilesetKey);
        this.createItemSprite(dropped.instanceId, r.key, r.frame, dropped.x, dropped.y);
      }

      // Pages: multi-page sequence with per-page requires and produces
      if (hasPages) {
        const texts: string[] = [];
        for (const rawPage of inter.pages!) {
          if (typeof rawPage === 'string') {
            texts.push(rawPage);
          } else {
            // Check per-page requires
            if (rawPage.requires && rawPage.requires.length > 0) {
              const pageCheck = checkRequires(rawPage.requires, this.rsm, roomId);
              if (!pageCheck.met) {
                if (rawPage.fallback) texts.push(rawPage.fallback);
                // No fallback → skip this page entirely
                continue;
              }
            }
            // Apply per-page produces immediately
            if (rawPage.produces && rawPage.produces.length > 0) {
              const pageDropped = applyProduces(rawPage.produces, this.rsm, roomId, this);
              for (const dropped of pageDropped) {
                const r = resolveTileSprite(dropped.item.tileFrame, dropped.item.tilesetKey);
                this.createItemSprite(dropped.instanceId, r.key, r.frame, dropped.x, dropped.y);
              }
            }
            texts.push(rawPage.text);
          }
        }
        if (texts.length > 0) {
          this.openDialog(texts[0], 'lore');
          for (let i = 1; i < texts.length; i++) {
            this.messageQueue.push({ text: texts[i], type: 'lore' });
          }
        }
      } else {
        this.openDialog(inter.text, 'lore');
      }

      this.events.emit('hide-interact-prompt');
      this.emitInventoryChanged();
      return;
    }

    // Legacy path — no requires/produces/pages ────────────────────────────
    if (inter.type === 'item') {
      this.handleItemPickup(inter);
    } else if (inter.type === 'recharge') {
      this.flashlight.recharge();
      this.openDialog(inter.text, 'lore');
      this.events.emit('hide-interact-prompt');
    } else {
      this.openDialog(inter.text, 'lore');
      this.events.emit('hide-interact-prompt');
    }
  }

  private handleAfflictedInteract(afflicted: Afflicted): void {
    const status = afflicted.getStatus();
    const name = afflicted.getName();
    const role = afflicted.getRole();
    const id = afflicted.getId();

    if (status === 'cured') {
      const associatedRoom = afflicted.getAssociatedRoom();
      const currentRoom = this.roomManager.getCurrentRoomId();

      // If they have a home room and we're not in it yet, they're just dazed.
      // The clue was already shown at cure time. Walk through a door to find them there.
      if (associatedRoom && associatedRoom !== currentRoom) {
        this.openDialog(`${name} stares past you. They seem distant.\nMaybe they need somewhere familiar.`, 'narrative');
        this.events.emit('hide-interact-prompt');
        return;
      }

      // We're in their home room — run the backstory conversation.
      const pages = afflicted.getBackstory();
      const page = this.recoveryPage.get(id) ?? 0;

      if (pages.length === 0 || page >= pages.length - 1) {
        // Final page (or no backstory): recover and hand over items
        const finalText = pages[page] ?? `${name} — ${role}\n"I'm ready to help. Let's go."`;
        this.rsm.recoverResident(id);
        afflicted.setStatus('recovered');
        this.recoveryPage.delete(id);

        const charState: CharacterState = {
          id,
          textureKey: `player-${afflicted.getPlayerVariant() ?? 'warden'}`,
          roomId: currentRoom,
          x: afflicted.x,
          y: afflicted.y,
          traits: afflicted.getTraits(),
        };
        this.rsm.addToRoster(charState);

        const items = afflicted.getRecoveredItems();
        const charInv = this.rsm.getCharacterInventory(id);
        items.forEach((item, i) => { charInv[i] = item; });

        // Remove the Afflicted NPC entity — they are now a parked body / roster member
        afflicted.destroy();
        this.afflictedGroup.remove(afflicted);
        this.refreshParkedBodies();

        this.openDialog(finalText, 'narrative');
        this.events.emit('hide-interact-prompt');
        this.events.emit('roster-changed', this.rsm.getRoster());
        this.events.emit('inventory-changed', this.rsm.getInventory());

      } else {
        // Still in conversation — show current page, advance counter
        this.openDialog(pages[page], 'narrative');
        this.events.emit('hide-interact-prompt');
        this.recoveryPage.set(id, page + 1);
      }
    } else if (status === 'recovered') {
      const requiredPartnerId = afflicted.getConversationRequires();
      const convDialog = afflicted.getConversationDialog();

      if (requiredPartnerId && convDialog.length > 0 && this.isRosterMemberPresent(requiredPartnerId)) {
        // Inter-character conversation path
        const page = this.conversationPage.get(id) ?? 0;
        const isLast = page >= convDialog.length - 1;
        this.openDialog(convDialog[page], 'narrative');
        this.events.emit('hide-interact-prompt');

        if (isLast) {
          this.conversationPage.delete(id);
          if (!this.conversedWith.has(id)) {
            this.conversedWith.add(id);
            const produces = afflicted.getConversationProduces();
            if (produces.length > 0) {
              applyProduces(produces, this.rsm, this.rsm.getCurrentRoom());
              this.emitInventoryChanged();
        
            }
          }
        } else {
          this.conversationPage.set(id, page + 1);
        }
      } else {
        // Solo response — partner not present or no conversation defined
        this.openDialog(`${name}\n"I'm ready when you are."`, 'narrative');
        this.events.emit('hide-interact-prompt');
      }
    }
  }

  /** Returns true if the roster member with the given id is in the current room
   *  (either as the active character or as a parked body). */
  private isRosterMemberPresent(rosterId: string): boolean {
    if (rosterId === this.rsm.getActiveCharacterId()) return true;
    const state = this.rsm.getCharacterState(rosterId);
    return state?.roomId === this.roomManager.getCurrentRoomId();
  }

  public switchToCharacter(targetId: string): void {
    if (this.isTransitioning || this.dialogOpen) return;
    if (targetId === this.rsm.getActiveCharacterId()) return;

    const target = this.rsm.getCharacterState(targetId);
    if (!target) return;

    // Save current character's position
    const curId = this.rsm.getActiveCharacterId();
    this.rsm.updateCharacterPosition(curId, this.roomManager.getCurrentRoomId(), this.player.x, this.player.y);

    this.rsm.setActiveCharacter(targetId);

    const doSwitch = () => {
      // Remove any lingering Afflicted entity for the incoming character
      const toRemove: Afflicted[] = [];
      this.afflictedGroup.getChildren().forEach(child => {
        const a = child as Afflicted;
        if (a.getId() === targetId) toRemove.push(a);
      });
      toRemove.forEach(a => { a.destroy(); this.afflictedGroup.remove(a); });

      this.player.rebuildAnimations(target.textureKey);
      this.player.setPosition(target.x, target.y);

      // Brief cooldown so the player can't be killed the instant they teleport in
      this.cureCooldown = true;
      this.time.delayedCall(600, () => { this.cureCooldown = false; });

      this.events.emit('character-switched', targetId);
      this.events.emit('inventory-changed', this.rsm.getInventory());
    };

    if (target.roomId !== this.roomManager.getCurrentRoomId()) {
      this.isTransitioning = true;
      (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
      this.transitionManager.transition(() => {
        MusicManager.getInstance().stopProximity(CLINIC_SOUND_ID);
        this.roomManager.loadRoom(target.roomId);
        this.rsm.visitRoom(target.roomId);
        this.setupCollisions();
        this.setupCamera();
        this.buildEdgeShadows();
        this.createWorldItemSprites();
        this.spawnAfflicted();
        doSwitch();
        this.refreshParkedBodies();
        this.weatherManager.updateForRoom(target.roomId);
        const _td = this.roomManager.getCurrentRoomDef();
        this.darknessOverlay.setEnabled(_td.dark === true, _td.darkLevel);
        if (USE_MIDI_MUSIC) MusicManager.getInstance().playRoomMusic(target.roomId);
        this.events.emit('room-changed', this.roomManager.getCurrentRoomDef().name);
      }).then(() => { this.isTransitioning = false; });
    } else {
      doSwitch();
      this.refreshParkedBodies();
    }
  }

  private handleItemPickup(inter: InteractableDef): void {
    if (!inter.item) return;
    const slot = this.rsm.addToInventory(inter.item);
    if (slot < 0) {
      this.openDialog('Inventory is full!\nDrop something first. (TAB)', 'system');
      return;
    }
    this.rsm.collectItem(inter.id);
    this.removeItemSprite(inter.id);
    this.openDialog(inter.text, 'lore');
    this.events.emit('hide-interact-prompt');
    this.events.emit('inventory-changed', this.rsm.getInventory());

  }

  private handleDroppedItemPickup(dropped: DroppedItemState): void {
    const slot = this.rsm.addToInventory(dropped.item);
    if (slot < 0) {
      this.openDialog('Inventory is full!', 'system');
      return;
    }
    this.rsm.removeDroppedItem(this.rsm.getCurrentRoom(), dropped.instanceId);
    this.removeItemSprite(dropped.instanceId);
    this.events.emit('hide-interact-prompt');
    this.events.emit('inventory-changed', this.rsm.getInventory());

  }

  // ── World item sprites ──────────────────────────────────────────────────

  /** Drop any `holds` items from an afflicted entity into the world at their position. */
  private dropHeldItems(afflicted: Afflicted): void {
    const roomId = this.rsm.getCurrentRoom();
    for (const item of afflicted.getHolds()) {
      const dropped = {
        item,
        x: afflicted.x,
        y: afflicted.y + 8,
        instanceId: `holds-${item.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      };
      this.rsm.addDroppedItem(roomId, dropped);
      const r = resolveTileSprite(item.tileFrame, item.tilesetKey);
      this.createItemSprite(dropped.instanceId, r.key, r.frame, dropped.x, dropped.y);
    }
  }

  private unlockDoorsToRoom(targetRoomId: string): void {
    const allRooms = RoomManager.getRoomsData().rooms;
    for (const room of Object.values(allRooms)) {
      for (const door of room.doors) {
        if (door.targetRoom === targetRoomId) {
          this.rsm.unlockDoor(door.id);
        }
      }
    }
  }

  private refreshParkedBodies(): void {
    this.parkedBodies.forEach(s => s.destroy());
    this.parkedBodies.clear();

    const currentRoomId = this.roomManager.getCurrentRoomId();
    const activeId = this.rsm.getActiveCharacterId();

    for (const char of this.rsm.getRoster()) {
      if (char.id === activeId) continue;
      if (char.roomId !== currentRoomId) continue;

      const sprite = this.add.sprite(char.x, char.y, char.textureKey, 0)
        .setScale(1.0)
        .setDepth(DEPTH.ENTITIES);
      this.parkedBodies.set(char.id, sprite);
    }
  }

  private buildEdgeShadows(): void {
    if (this.edgeShadows) {
      this.edgeShadows.destroy();
      this.edgeShadows = undefined;
    }

    const map = this.roomManager.getMap();
    const collisionLayer = this.roomManager.getCollisionLayer();
    if (!map || !collisionLayer) return;

    const TILE = GAME_CONFIG.TILE_SIZE;
    const roomW = map.width * TILE;
    const roomH = map.height * TILE;

    const rt = this.add.renderTexture(0, 0, roomW, roomH);
    rt.setOrigin(0, 0);
    rt.setDepth(DEPTH.GROUND + 0.5);
    rt.setAlpha(0.6);

    const layerData = collisionLayer.layer.data;
    const tilesets = map.tilesets;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = layerData[ty]?.[tx];
        if (!tile || tile.index <= 0) continue;
        let owningTs = tilesets[0];
        for (const ts of tilesets) {
          if (ts.firstgid <= tile.index) owningTs = ts;
        }
        if (!owningTs) continue;
        const key = tilesetSpritesheetKey(owningTs.name);
        const frame = tile.index - owningTs.firstgid;
        const img = this.make.image({ x: 0, y: 0, key, frame, add: false });
        img.setTint(0x000000).setOrigin(0, 0);
        rt.draw(img, tx * TILE, ty * TILE);
        img.destroy();
      }
    }

    // A shadow effect with x, y offset provides the "3D" directional look
    // x=8, y=8 makes it cast towards the bottom-right (more prominent left/top edges)
    rt.postFX.addShadow(3, -3 , .006, 1, 0x000000, 15, 0.5);
    // Optional light blur to soften it further
    rt.postFX.addBlur(100, 20, 20, 0.2, 0x000000, 5);

    this.edgeShadows = rt;
  }

  private createWorldItemSprites(): void {
    this.itemSprites.forEach((s) => s.destroy());
    this.itemSprites.clear();
    this.itemShadows.forEach((s) => s.destroy());
    this.itemShadows.clear();
    this.hiddenSprites.forEach((s) => s.destroy());
    this.hiddenSprites.clear();

    const roomDef = this.roomManager.getCurrentRoomDef();
    for (const inter of roomDef.interactables || []) {
      if (inter.consumed && this.rsm.isItemCollected(inter.id)) continue;
      if (inter.hidden) {
        // Hidden interactable — sprite lives on HIDDEN layer, revealed by spectra-vision cone
        if (inter.tileFrame !== undefined) {
          const r = resolveTileSprite(inter.tileFrame, inter.tilesetKey);
          const s = this.add.sprite(inter.x, inter.y, r.key, r.frame);
          s.setDepth(DEPTH.HIDDEN);
          s.setScale(GAME_CONFIG.WORLD_SCALE);
          s.setAlpha(0);
          this.hiddenSprites.set(inter.id, s);
        }
        continue;
      }
      if (inter.type === 'item' && inter.item && !this.rsm.isItemCollected(inter.id)) {
        const r = resolveTileSprite(inter.item.tileFrame, inter.item.tilesetKey);
        this.createItemSprite(inter.id, r.key, r.frame, inter.x, inter.y);
      } else if (inter.tileFrame !== undefined && inter.type !== 'item') {
        const r = resolveTileSprite(inter.tileFrame, inter.tilesetKey);
        this.createSignSprite(inter.id, r.key, r.frame, inter.x, inter.y);
      }
    }
    for (const vis of roomDef.hiddenVisuals || []) {
      const r = resolveTileSprite(vis.tileFrame, vis.tilesetKey);
      const s = this.add.sprite(vis.x, vis.y, r.key, r.frame);
      s.setDepth(DEPTH.HIDDEN);
      s.setScale(GAME_CONFIG.WORLD_SCALE);
      s.setAlpha(0);
      this.hiddenSprites.set(vis.id, s);
    }
    for (const dropped of this.rsm.getDroppedItems(this.rsm.getCurrentRoom())) {
      const r = resolveTileSprite(dropped.item.tileFrame, dropped.item.tilesetKey);
      this.createItemSprite(dropped.instanceId, r.key, r.frame, dropped.x, dropped.y);
    }
  }

  private createItemSprite(id: string, textureKey: string, frame: number, x: number, y: number): void {
    const shadow = this.add.graphics();
    shadow.setPosition(x, y + 32);
    shadow.setDepth(DEPTH.ENTITIES - 1);
    const rings = [
      { w: 28, h: 9,  alpha: 0.38 },
      { w: 36, h: 13, alpha: 0.18 },
      { w: 44, h: 17, alpha: 0.09 },
      { w: 52, h: 21, alpha: 0.04 },
    ];
    for (const r of rings) {
      shadow.fillStyle(0x000000, r.alpha);
      shadow.fillEllipse(0, 0, r.w, r.h);
    }
    this.tweens.add({
      targets: shadow,
      scaleX: 0.55,
      scaleY: 0.55,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.itemShadows.set(id, shadow);

    const sprite = this.add.sprite(x, y, textureKey, frame);
    sprite.setScale(GAME_CONFIG.WORLD_SCALE);
    sprite.setDepth(DEPTH.ENTITIES);
    this.tweens.add({
      targets: sprite,
      y: y - 3,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.itemSprites.set(id, sprite);
  }

  private removeItemSprite(id: string): void {
    const sprite = this.itemSprites.get(id);
    if (sprite) { sprite.destroy(); this.itemSprites.delete(id); }
    const shadow = this.itemShadows.get(id);
    if (shadow) { shadow.destroy(); this.itemShadows.delete(id); }
  }

  private createSignSprite(id: string, textureKey: string, frame: number, x: number, y: number): void {
    const sprite = this.add.sprite(x, y, textureKey, frame);
    sprite.setScale(GAME_CONFIG.WORLD_SCALE);
    sprite.setDepth(DEPTH.ENTITIES);
    this.itemSprites.set(id, sprite);
  }

  // ── Collisions & camera ─────────────────────────────────────────────────

  private setupCollisions(): void {
    if (this.collider) this.collider.destroy();
    if (this.onCollisionCollider) { this.onCollisionCollider.destroy(); this.onCollisionCollider = undefined; }
    this.doorOverlaps.forEach((o) => o.destroy());
    this.doorOverlaps = [];

    const collisionLayer = this.roomManager.getCollisionLayer();
    this.collider = this.physics.add.collider(this.player, collisionLayer);

    const onCollisionLayer = this.roomManager.getOnCollisionLayer();
    if (onCollisionLayer) {
      this.onCollisionCollider = this.physics.add.collider(this.player, onCollisionLayer);
    }

    // Doors are now E-to-enter; nearDoor is updated each frame in checkInteractables.
  }

  private setupCamera(): void {
    const room = this.roomManager.getCurrentRoomDef();
    // Use the actual loaded tilemap dimensions — roomDef.width/height can be
    // mutated by resizeMap() and may not match the real tilemap after editing.
    const map = this.roomManager.getMap();
    const roomW = (map ? map.width : room.width) * GAME_CONFIG.TILE_SIZE;
    const roomH = (map ? map.height : room.height) * GAME_CONFIG.TILE_SIZE;

    this.physics.world.setBounds(0, 0, roomW, roomH);

    const cam = this.cameras.main;

    const fitsW = roomW <= GAME_CONFIG.WIDTH;
    const fitsH = roomH <= GAME_CONFIG.HEIGHT;
    const bX = fitsW ? -(GAME_CONFIG.WIDTH - roomW) / 2 : 0;
    const bY = fitsH ? -(GAME_CONFIG.HEIGHT - roomH) / 2 : 0;
    cam.setBounds(bX, bY, Math.max(roomW, GAME_CONFIG.WIDTH), Math.max(roomH, GAME_CONFIG.HEIGHT));
    cam.setBackgroundColor('#111111');

    if (fitsW && fitsH) {
      cam.stopFollow();
      cam.centerOn(roomW / 2, roomH / 2);
    } else {
      cam.startFollow(this.player, true,
        fitsW ? 0 : CAMERA_CONFIG.LERP, fitsH ? 0 : CAMERA_CONFIG.LERP);
      if (fitsW) cam.scrollX = bX;
      if (fitsH) cam.scrollY = bY;
    }
  }


  // ── Door transitions ────────────────────────────────────────────────────

  private handleDoorTransition(doorDef: DoorDefinition): void {
    if (this.isTransitioning || this.dialogOpen) return;

    // Check for keys — unified requiredKeys[] schema (requiredKey removed)
    const keys = doorDef.requiredKeys ?? [];
    const isLocked = keys.length > 0 && !this.rsm.isDoorUnlocked(doorDef.id);

    if (isLocked) {
      let keySlot = -1;
      let usedKeyId = '';
      for (const kid of keys) {
        keySlot = this.rsm.findKeyForDoor(kid);
        if (keySlot >= 0) { usedKeyId = kid; break; }
      }

      if (keySlot >= 0) {
        const keyItem = this.rsm.getSlot(keySlot);
        if (keyItem?.consumedOnUse !== false) this.rsm.removeFromInventory(keySlot);
        this.rsm.unlockDoor(doorDef.id);
        this.events.emit('door-unlocked', doorDef.unlockedMessage ?? 'Door unlocked!');
        this.events.emit('inventory-changed', this.rsm.getInventory());
      } else {
        if (this.lockedDoorCooldown > 0) return;
        this.lockedDoorCooldown = 90;
        this.openDialog(doorDef.lockedMessage ?? 'This door is locked.\nYou need a key to open it.', 'system');
        (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
        return;
      }
    }

    this.isTransitioning = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    this.transitionManager.transition(() => {
      MusicManager.getInstance().stopProximity(CLINIC_SOUND_ID);
      this.roomManager.loadRoom(doorDef.targetRoom);
      this.rsm.visitRoom(doorDef.targetRoom);
      const spawn = this.roomManager.getSpawnForDoor(doorDef.targetRoom, doorDef.targetDoor);
      this.player.setPosition(spawn.x, spawn.y);
      this.setupCollisions();
      this.setupCamera();
      applyFlagConditions(this.roomManager.getCurrentRoomDef(), this.rsm, this.roomManager);
      this.buildEdgeShadows();
      this.createWorldItemSprites();
      this.spawnAfflicted();
      this.refreshParkedBodies();
      this.weatherManager.updateForRoom(doorDef.targetRoom);
      const _dd = this.roomManager.getCurrentRoomDef();
      this.darknessOverlay.setEnabled(_dd.dark === true, _dd.darkLevel);

      if (USE_MIDI_MUSIC) {
        MusicManager.getInstance().playRoomMusic(doorDef.targetRoom);
      } else {
        const roomDef = this.roomManager.getCurrentRoomDef();
        if (roomDef.music) {
          AudioManager.getInstance().playMusic(roomDef.music);
        }
      }

      this.events.emit('room-changed', this.roomManager.getCurrentRoomDef().name);
    }).then(() => {
      this.isTransitioning = false;

    });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private updateHiddenLayer(): void {
    const adaptedMode = this.flashlight.isOn && this.rsm.hasItemWithKeyId('spectra-adapter');
    for (const [, sprite] of this.hiddenSprites) {
      sprite.setAlpha(adaptedMode && this.flashlight.isInCone(sprite.x, sprite.y) ? 1 : 0);
    }
  }

  private emitFullState(roomName: string): void {
    this.events.emit('room-changed', roomName);
    this.events.emit('inventory-changed', this.rsm.getInventory());
    // Delay one frame so UIScene's event listeners are registered before we fire
    this.time.delayedCall(0, () => {
      this.events.emit('roster-changed', this.rsm.getRoster());
      this.events.emit('character-switched', this.rsm.getActiveCharacterId());
    });
  }

  private getRoomStateManager(): RoomStateManager {
    return this.rsm;
  }
}
