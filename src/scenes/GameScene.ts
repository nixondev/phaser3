import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, CAMERA_CONFIG, DEPTH, INTERACT_CONFIG, USE_MIDI_MUSIC } from '@utils/Constants';
import { Player } from '@entities/Player';
import { Afflicted } from '@entities/Afflicted';
import { Flashlight } from '@systems/Flashlight';
import { InputManager } from '@systems/InputManager';
import { RoomManager } from '@systems/RoomManager';
import { TransitionManager } from '@systems/TransitionManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { DebugManager } from '@systems/DebugManager';
import { RoomEditorManager } from '@systems/RoomEditorManager';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { DoorDefinition, InteractableDef, DroppedItemState, InputState, ItemDef, AfflictedStatus } from '@/types';
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
  private lockedDoorCooldown = 0;
  private itemSprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private darknessLayer?: Phaser.GameObjects.RenderTexture;

  // Afflicted
  private afflictedGroup!: Phaser.Physics.Arcade.Group;

  // Flashlight (persistent across rooms — always available)
  private flashlight!: Flashlight;
  private debugManager!: DebugManager;
  private editorManager!: RoomEditorManager;

  // Inventory
  private inventoryMode = false;
  private inventoryCursor = 0;

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
    this.debugManager = new DebugManager(this, this.roomManager, this.rsm);
    this.editorManager = new RoomEditorManager(this, this.roomManager, this.rsm);

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
      this.debugManager?.destroy();
      this.editorManager?.destroy();
    });

    const spawn = roomDef.playerSpawn || { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
    this.player = new Player(this, spawn.x, spawn.y);

    this.setupCollisions();
    this.setupCamera();
    this.setupLighting();
    this.createWorldItemSprites();
    this.spawnAfflicted();

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

    // While the debug warp picker is open, suspend gameplay input so
    // arrow keys are consumed by the picker, not by the player.
    if (this.debugManager?.isModalOpen()) {
      const body = this.player.body as Phaser.Physics.Arcade.Body;
      body.setVelocity(0, 0);
      this.player.playIdle();
      this.debugManager.update(input, delta);
      return;
    }

    // Flashlight toggle — available in all non-transition states
    if (input.flashlight) {
      this.flashlight.toggle();
    }

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

    this.debugManager.update(input, delta);
    this.editorManager.update(input);

    if (input.menu) {
      this.scene.pause();
      this.scene.launch(SCENES.PAUSE);
    }
  }

  public reloadRoom(): void {
    const roomId = this.roomManager.getCurrentRoomId();
    this.transitionManager.transition(() => {
      this.roomManager.loadRoom(roomId);
      this.setupCollisions();
      this.setupCamera();
      this.createWorldItemSprites();
      this.spawnAfflicted();

      const roomDef = this.roomManager.getCurrentRoomDef();
      this.events.emit('room-changed', roomDef.name);
    });
  }

  /**
   * Editor hook: after RoomManager.resizeMap mutates the tilemap and
   * room metadata, this re-binds physics, camera, sprites, and entities
   * to the new geometry. Player is shifted by the same pixel offset so
   * they stay over the same logical tile.
   */
  public refreshAfterResize(pixelOffsetX: number, pixelOffsetY: number): void {
    if (this.player && (pixelOffsetX !== 0 || pixelOffsetY !== 0)) {
      this.player.setPosition(this.player.x + pixelOffsetX, this.player.y + pixelOffsetY);
    }
    this.setupCollisions();
    this.setupCamera();
    this.setupLighting();
    this.createWorldItemSprites();
    this.spawnAfflicted();
    this.events.emit('room-changed', this.roomManager.getCurrentRoomDef().name);
  }

  /** Lighter editor hook: re-applies camera bounds/follow without rebuilding entities. */
  public refreshCamera(): void {
    this.setupCamera();
  }

  /**
   * Debug warp: jump to any room's playerSpawn with a transition,
   * mirroring the door-transition setup path. No-op if already in
   * the target room or mid-transition.
   */
  public warpToRoom(roomId: string): void {
    if (this.isTransitioning || this.dialogOpen) return;
    if (this.roomManager.getCurrentRoomId() === roomId) return;
    if (!this.roomManager.getRoomDef(roomId)) {
      console.warn(`[Warp] Unknown room id: ${roomId}`);
      return;
    }
    this.isTransitioning = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);
    this.transitionManager.transition(() => {
      MusicManager.getInstance().stopProximity(CLINIC_SOUND_ID);
      this.roomManager.loadRoom(roomId);
      this.rsm.visitRoom(roomId);
      const room = this.roomManager.getCurrentRoomDef();
      const spawn = room.playerSpawn || { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
      this.player.setPosition(spawn.x, spawn.y);
      this.setupCollisions();
      this.setupCamera();
      this.setupLighting();
      this.createWorldItemSprites();
      this.spawnAfflicted();
      if (USE_MIDI_MUSIC) MusicManager.getInstance().playRoomMusic(roomId);
      this.events.emit('room-changed', room.name);
    }).then(() => { this.isTransitioning = false; });
  }

  // ── Afflicted ───────────────────────────────────────────────────────────

  private spawnAfflicted(): void {
    // Clear existing and stop their proximity sounds
    this.afflictedGroup.getChildren().forEach((a) => {
      (a as Afflicted).destroy();
    });
    this.afflictedGroup.clear(true, true);
    if (this.afflictedCollider) this.afflictedCollider.destroy();
    if (this.playerAfflictedCollider) this.playerAfflictedCollider.destroy();

    const roomDef = this.roomManager.getCurrentRoomDef();
    for (const def of roomDef.afflicted || []) {
      let status: AfflictedStatus = 'wandering';
      if (this.rsm.isResidentRecovered(def.id)) status = 'recovered';
      else if (this.rsm.isResidentCured(def.id)) status = 'cured';
      const afflicted = new Afflicted(this, def, status);
      this.afflictedGroup.add(afflicted);
    }

    // Collide afflicted with world
    const collisionLayer = this.roomManager.getCollisionLayer();
    this.afflictedCollider = this.physics.add.collider(this.afflictedGroup, collisionLayer);

    // Check for player reaching afflicted -> restart at home
    this.playerAfflictedCollider = this.physics.add.overlap(this.player, this.afflictedGroup, this.handleAfflictedCollision, undefined, this);
  }

  private handleAfflictedCollision(_player: any, afflictedObject: any): void {
    if (this.isTransitioning) return;
    const afflicted = afflictedObject as Afflicted;
    const status = afflicted.getStatus();
    if (status === 'cured' || status === 'recovered') return;

    this.isTransitioning = true;
    (this.player.body as Phaser.Physics.Arcade.Body).setVelocity(0, 0);

    // Visual/Audio effect (shake camera)
    this.cameras.main.shake(400, 0.01);
    
    // Brief delay then transition back to start
    this.time.delayedCall(400, () => {
      this.transitionManager.transition(() => {
        MusicManager.getInstance().stopProximity(CLINIC_SOUND_ID);
        const startRoomId = this.roomManager.getStartRoom();
        this.roomManager.loadRoom(startRoomId);
        this.rsm.visitRoom(startRoomId);
        
        const roomDef = this.roomManager.getCurrentRoomDef();
        const spawn = roomDef.playerSpawn || { x: GAME_CONFIG.WIDTH / 2, y: GAME_CONFIG.HEIGHT / 2 };
        
        this.player.setPosition(spawn.x, spawn.y);
        this.player.playIdle();
        
        this.setupCollisions();
        this.setupCamera();
        this.createWorldItemSprites();
        this.spawnAfflicted();
        
        this.events.emit('room-changed', roomDef.name);
      }).then(() => {
        this.isTransitioning = false;
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
          this.exitInventory();
          this.dialogOpen = true;
          this.events.emit('dialog-open', `You applied the ${item.name}.\n${nearest.getName()} seems to be calming down.`);
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

    if (status === 'cured') {
      this.rsm.recoverResident(afflicted.getId());
      afflicted.setStatus('recovered');
      this.dialogOpen = true;
      this.events.emit('dialog-open', `${name} — ${role}\n"...where am I? What happened?"`);
      this.events.emit('hide-interact-prompt');
    } else if (status === 'recovered') {
      this.dialogOpen = true;
      this.events.emit('dialog-open', `${name} — ${role}\n"I'm still trying to remember..."`);
      this.events.emit('hide-interact-prompt');
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
  }

  private getRoomStateManager(): RoomStateManager {
    return this.rsm;
  }
}
