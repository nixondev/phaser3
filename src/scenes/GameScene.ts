import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, CAMERA_CONFIG, DEPTH, INTERACT_CONFIG, USE_MIDI_MUSIC } from '@utils/Constants';
import { Player } from '@entities/Player';
import { Afflicted } from '@entities/Afflicted';
import { Flashlight } from '@systems/Flashlight';
import { InputManager } from '@systems/InputManager';
import { RoomManager } from '@systems/RoomManager';
import { TransitionManager } from '@systems/TransitionManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { DoorDefinition, InteractableDef, DroppedItemState, InputState, ItemDef, AfflictedStatus, CharacterState, AfflictedDef } from '@/types';
import { debug } from '@utils/Debug';

const CLINIC_DOOR_X     = 160;
const CLINIC_DOOR_Y     = 304;
const CLINIC_SOUND_DIST = 150;
const CLINIC_SOUND_ID   = 'clinic-hint';

export class GameScene extends Phaser.Scene {
  private player!: Player;
  private inputManager!: InputManager;
  private roomManager!: RoomManager;
  private transitionManager!: TransitionManager;
  private rsm!: RoomStateManager;
  private collider?: Phaser.Physics.Arcade.Collider;
  private afflictedCollider?: Phaser.Physics.Arcade.Collider;
  private playerAfflictedCollider?: Phaser.Physics.Arcade.Collider;
  private doorOverlaps: Phaser.Physics.Arcade.Collider[] = [];
  private isTransitioning = false;
  private dialogOpen = false;
  private cureCooldown = false;  // prevents multi-afflicted same-frame double-trigger
  private lockedDoorCooldown = 0;
  private itemSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private darknessLayer?: Phaser.GameObjects.RenderTexture;

  // Afflicted
  private afflictedGroup!: Phaser.Physics.Arcade.Group;

  // Flashlight (persistent across rooms — always available)
  private flashlight!: Flashlight;

  // Inventory
  private inventoryMode = false;
  private inventoryCursor = 0;

  // Recovery conversation paging — tracks which backstory page each cured resident is on
  private recoveryPage: Map<string, number> = new Map();

  // Standing sprites for inactive roster members present in the current room
  private parkedBodies: Map<string, Phaser.GameObjects.Sprite> = new Map();

  constructor() {
    super(SCENES.GAME);
  }

  create(): void {
    this.isTransitioning = false;
    this.dialogOpen = false;
    this.lockedDoorCooldown = 0;
    this.inventoryMode = false;
    this.inventoryCursor = 0;

    this.inputManager = new InputManager(this);
    this.roomManager = new RoomManager(this);
    this.transitionManager = new TransitionManager(this);
    this.rsm = RoomStateManager.getInstance();
    this.afflictedGroup = this.physics.add.group();
    this.flashlight = new Flashlight(this);

    // Always hand AudioManager the new scene (keeps volume control working).
    // Stop title MP3 before starting in-game music.
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().stopMusic();

    const startRoom = this.roomManager.getStartRoom();
    this.roomManager.loadRoom(startRoom);
    this.rsm.visitRoom(startRoom);

    const roomDef = this.roomManager.getCurrentRoomDef();

    if (USE_MIDI_MUSIC) {
      const music = MusicManager.getInstance();
      const roomId = this.roomManager.getCurrentRoomId();
      music.playRoomMusic(roomId);
    } else if (roomDef.music) {
      AudioManager.getInstance().playMusic(roomDef.music);
    }

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (USE_MIDI_MUSIC) MusicManager.getInstance().stop();
    });

    this.events.on('character-switch-request', (id: string) => {
      this.switchToCharacter(id);
    });

    const spawn = roomDef.playerSpawn || { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
    this.player = new Player(this, spawn.x, spawn.y);

    this.rsm.initRoster({ id: 'player', textureKey: 'player', roomId: startRoom, x: spawn.x, y: spawn.y });

    this.setupCollisions();
    this.setupCamera();
    this.setupLighting();
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

  private showTutorialDialog(): void {
    this.rsm.setTutorialShown(true);
    this.dialogOpen = true;
    this.events.emit('dialog-open', "Welcome. Controls: WASD to move, E to interact, TAB for inventory, F to toggle Flashlight, ESC for menu.");
  }

  update(_time: number, delta: number): void {
    if (this.isTransitioning) return;
    if (this.lockedDoorCooldown > 0) this.lockedDoorCooldown--;

    // Inventory mode
    if (this.inventoryMode) {
      this.handleInventoryMode(delta);
      return;
    }

    const input = this.inputManager.getState();
    this.updateLighting();

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
      if (input.action || input.menu) {
        this.dialogOpen = false;
        this.events.emit('dialog-close');
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
    if (this.playerAfflictedCollider) this.playerAfflictedCollider.destroy();

    const roomDef = this.roomManager.getCurrentRoomDef();
    const currentRoomId = this.roomManager.getCurrentRoomId();
    for (const def of roomDef.afflicted || []) {
      let status: AfflictedStatus = 'wandering';
      const isCured = this.rsm.isResidentCured(def.id);
      const isRecovered = this.rsm.isResidentRecovered(def.id);
      if (isRecovered) status = 'recovered';
      else if (isCured) status = 'cured';

      // Cured/recovered residents with an associatedRoom only appear in that room
      if ((isCured || isRecovered) && def.associatedRoom && def.associatedRoom !== currentRoomId) {
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
      this.dialogOpen = true;
      const clue = afflicted.getCuredClue();
      const msg = clue
        ? `The ${item.name} shattered on impact.\n${afflicted.getName()} slumps against the wall.\n\n${clue}`
        : `The ${item.name} shattered on impact.\n${afflicted.getName()} seems to be calming down.\nThey seem to need some time alone.`;
      this.events.emit('dialog-open', msg);
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
      this.dialogOpen = true;
      this.events.emit('dialog-open', 'Keys are used automatically\nat locked doors.');
      return;
    }

    if (item.category === 'cure') {
      const nearest = this.getNearestAfflicted();
      if (nearest && (nearest.getStatus() === 'wandering' || nearest.getStatus() === 'agitated')) {
        if (!item.useTarget || item.useTarget === nearest.getId()) {
          this.rsm.removeFromInventory(slot);
          this.rsm.cureResident(nearest.getId());
          nearest.setStatus('cured');
          const associatedRoom = nearest.getAssociatedRoom();
          if (associatedRoom) this.unlockDoorsToRoom(associatedRoom);
          this.exitInventory();
          this.dialogOpen = true;
          const clue = nearest.getCuredClue();
          const msg = clue
            ? `You applied the ${item.name}.\n${nearest.getName()} slumps against the wall.\n\n${clue}`
            : `You applied the ${item.name}.\n${nearest.getName()} seems to be calming down.\nThey seem to need some time alone.`;
          this.events.emit('dialog-open', msg);
          this.emitInventoryChanged();
          return;
        } else {
          this.exitInventory();
          this.dialogOpen = true;
          this.events.emit('dialog-open', `This cure doesn't seem\nright for ${nearest.getName()}.`);
          return;
        }
      } else {
        this.exitInventory();
        this.dialogOpen = true;
        this.events.emit('dialog-open', 'Nobody nearby to cure.');
        return;
      }
    }

    this.exitInventory();
    this.dialogOpen = true;
    this.events.emit('dialog-open', "You can't use that here.");
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
    this.createItemSprite(instanceId, item.tileFrame, dropX, dropY);
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
    const roomDef = this.roomManager.getCurrentRoomDef();
    const interactables = roomDef.interactables || [];
    const roomId = this.rsm.getCurrentRoom();
    const droppedItems = this.rsm.getDroppedItems(roomId);

    let nearestType: 'interactable' | 'dropped' | 'afflicted' | null = null;
    let nearestInteractable: InteractableDef | null = null;
    let nearestDropped: DroppedItemState | null = null;
    let nearestAfflicted: Afflicted | null = null;
    let nearestDist = INTERACT_CONFIG.DISTANCE as number;

    for (const inter of interactables) {
      if (inter.type === 'item' && this.rsm.isItemCollected(inter.id)) continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, inter.x, inter.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'interactable';
        nearestInteractable = inter;
        nearestDropped = null;
        nearestAfflicted = null;
      }
    }
    for (const dropped of droppedItems) {
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, dropped.x, dropped.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'dropped';
        nearestDropped = dropped;
        nearestInteractable = null;
        nearestAfflicted = null;
      }
    }
    // Check afflicted (only cured/recovered are interactable)
    for (const child of this.afflictedGroup.getChildren()) {
      const a = child as Afflicted;
      if (!a.active) continue;
      const status = a.getStatus();
      if (status !== 'cured' && status !== 'recovered') continue;
      const dist = Phaser.Math.Distance.Between(this.player.x, this.player.y, a.x, a.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestType = 'afflicted';
        nearestAfflicted = a;
        nearestInteractable = null;
        nearestDropped = null;
      }
    }

    if (nearestType) {
      this.events.emit('show-interact-prompt');
      if (input.action) {
        if (nearestType === 'interactable' && nearestInteractable) {
          if (nearestInteractable.type === 'item') {
            this.handleItemPickup(nearestInteractable);
          } else if (nearestInteractable.type === 'recharge') {
            this.flashlight.recharge();
            this.dialogOpen = true;
            this.events.emit('dialog-open', nearestInteractable.text);
            this.events.emit('hide-interact-prompt');
          } else {
            this.dialogOpen = true;
            this.events.emit('dialog-open', nearestInteractable.text);
            this.events.emit('hide-interact-prompt');
          }
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
        this.dialogOpen = true;
        this.events.emit('dialog-open', `${name} stares past you. They seem distant.\nMaybe they need somewhere familiar.`);
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
        };
        this.rsm.addToRoster(charState);

        const items = afflicted.getRecoveredItems();
        const charInv = this.rsm.getCharacterInventory(id);
        items.forEach((item, i) => { charInv[i] = item; });

        this.dialogOpen = true;
        this.events.emit('dialog-open', finalText);
        this.events.emit('hide-interact-prompt');
        this.events.emit('roster-changed', this.rsm.getRoster());
      } else {
        // Still in conversation — show current page, advance counter
        this.dialogOpen = true;
        this.events.emit('dialog-open', pages[page]);
        this.events.emit('hide-interact-prompt');
        this.recoveryPage.set(id, page + 1);
      }
    } else if (status === 'recovered') {
      this.dialogOpen = true;
      this.events.emit('dialog-open', `${name}\n"I'm ready when you are."`);
      this.events.emit('hide-interact-prompt');
    }
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
        this.setupLighting();
        this.createWorldItemSprites();
        this.spawnAfflicted();
        doSwitch();
        this.refreshParkedBodies();
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
      this.dialogOpen = true;
      this.events.emit('dialog-open', 'Inventory is full!\nDrop something first. (TAB)');
      return;
    }
    this.rsm.collectItem(inter.id);
    const sprite = this.itemSprites.get(inter.id);
    if (sprite) { sprite.destroy(); this.itemSprites.delete(inter.id); }
    this.dialogOpen = true;
    this.events.emit('dialog-open', inter.text);
    this.events.emit('hide-interact-prompt');
    this.events.emit('inventory-changed', this.rsm.getInventory());
  }

  private handleDroppedItemPickup(dropped: DroppedItemState): void {
    const slot = this.rsm.addToInventory(dropped.item);
    if (slot < 0) {
      this.dialogOpen = true;
      this.events.emit('dialog-open', 'Inventory is full!');
      return;
    }
    this.rsm.removeDroppedItem(this.rsm.getCurrentRoom(), dropped.instanceId);
    const sprite = this.itemSprites.get(dropped.instanceId);
    if (sprite) { sprite.destroy(); this.itemSprites.delete(dropped.instanceId); }
    this.events.emit('hide-interact-prompt');
    this.events.emit('inventory-changed', this.rsm.getInventory());
  }

  // ── World item sprites ──────────────────────────────────────────────────

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

  private createWorldItemSprites(): void {
    this.itemSprites.forEach((s) => s.destroy());
    this.itemSprites.clear();
    const roomDef = this.roomManager.getCurrentRoomDef();
    for (const inter of roomDef.interactables || []) {
      if (inter.type === 'item' && inter.item && !this.rsm.isItemCollected(inter.id)) {
        this.createItemSprite(inter.id, inter.item.tileFrame, inter.x, inter.y);
      } else if ((inter.type === 'sign' || inter.type === 'recharge') && inter.tileFrame !== undefined) {
        this.createSignSprite(inter.id, inter.tileFrame, inter.x, inter.y);
      }
    }
    for (const dropped of this.rsm.getDroppedItems(this.rsm.getCurrentRoom())) {
      this.createItemSprite(dropped.instanceId, dropped.item.tileFrame, dropped.x, dropped.y);
    }
  }

  private createItemSprite(id: string, tileFrame: number, x: number, y: number): void {
    const sprite = this.add.sprite(x, y, 'tileset-sprites', tileFrame);
    sprite.setScale(1 / GAME_CONFIG.ASSET_SCALE);
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

  private createSignSprite(id: string, tileFrame: number, x: number, y: number): void {
    const sprite = this.add.sprite(x, y, 'tileset-sprites', tileFrame);
    sprite.setScale(1 / GAME_CONFIG.ASSET_SCALE);
    sprite.setDepth(DEPTH.ENTITIES);
    this.itemSprites.set(id, sprite);
  }

  // ── Collisions & camera ─────────────────────────────────────────────────

  private setupCollisions(): void {
    if (this.collider) this.collider.destroy();
    this.doorOverlaps.forEach((o) => o.destroy());
    this.doorOverlaps = [];

    const collisionLayer = this.roomManager.getCollisionLayer();
    this.collider = this.physics.add.collider(this.player, collisionLayer);

    this.doorOverlaps = this.roomManager.getDoorZones().map((zone) =>
      this.physics.add.overlap(this.player, zone, (_p, dz) => {
        this.handleDoorTransition((dz as Phaser.GameObjects.Zone).getData('doorDef') as DoorDefinition);
      }, undefined, this)
    );
  }

  private setupCamera(): void {
    const room = this.roomManager.getCurrentRoomDef();
    const roomW = room.width * GAME_CONFIG.TILE_SIZE;
    const roomH = room.height * GAME_CONFIG.TILE_SIZE;
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

  private setupLighting(): void {
    if (this.darknessLayer) {
      this.darknessLayer.destroy();
      this.darknessLayer = undefined;
    }

    const roomDef = this.roomManager.getCurrentRoomDef();
    if (roomDef.dark) {
      const roomW = roomDef.width * GAME_CONFIG.TILE_SIZE;
      const roomH = roomDef.height * GAME_CONFIG.TILE_SIZE;
      
      this.darknessLayer = this.add.renderTexture(0, 0, roomW, roomH);
      this.darknessLayer.setDepth(DEPTH.LIGHTING);
    }
  }

  private updateLighting(): void {
    if (!this.darknessLayer) return;

    this.darknessLayer.clear();
    this.darknessLayer.fill(0x000000, 0.95);
    this.flashlight.renderMask(this.darknessLayer);
  }

  // ── Door transitions ────────────────────────────────────────────────────

  private handleDoorTransition(doorDef: DoorDefinition): void {
    if (this.isTransitioning || this.dialogOpen) return;

    // Check for keys
    const isLocked = (doorDef.requiredKey && !this.rsm.isDoorUnlocked(doorDef.id)) ||
                     (doorDef.requiredKeys && doorDef.requiredKeys.length > 0 && !this.rsm.isDoorUnlocked(doorDef.id));

    if (isLocked) {
      let keySlot = -1;
      let usedKeyId = '';

      // Check single key
      if (doorDef.requiredKey) {
        keySlot = this.rsm.findKeyForDoor(doorDef.requiredKey);
        usedKeyId = doorDef.requiredKey;
      }

      // Check multiple keys if single key not found
      if (keySlot < 0 && doorDef.requiredKeys) {
        for (const kid of doorDef.requiredKeys) {
          keySlot = this.rsm.findKeyForDoor(kid);
          if (keySlot >= 0) {
            usedKeyId = kid;
            break;
          }
        }
      }

      if (keySlot >= 0) {
        if (usedKeyId !== 'skeleton-key') {
          this.rsm.removeFromInventory(keySlot);
        }
        this.rsm.unlockDoor(doorDef.id);
        this.events.emit('door-unlocked');
        this.events.emit('inventory-changed', this.rsm.getInventory());
      } else {
        if (this.lockedDoorCooldown > 0) return;
        this.lockedDoorCooldown = 90;
        this.dialogOpen = true;
        this.events.emit('dialog-open', 'This door is locked.\nYou need a key to open it.');
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
      this.setupLighting();
      this.createWorldItemSprites();
      this.spawnAfflicted();
      this.refreshParkedBodies();

      if (USE_MIDI_MUSIC) {
        MusicManager.getInstance().playRoomMusic(doorDef.targetRoom);
      } else {
        const roomDef = this.roomManager.getCurrentRoomDef();
        if (roomDef.music) {
          AudioManager.getInstance().playMusic(roomDef.music);
        }
      }

      this.events.emit('room-changed', this.roomManager.getCurrentRoomDef().name);
    }).then(() => { this.isTransitioning = false; });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

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
