import Phaser from 'phaser';
import { RoomManager } from './RoomManager';
import { RoomStateManager } from './RoomStateManager';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';
import { InputState } from '@/types';

export class RoomEditorManager {
  private scene: Phaser.Scene;
  private roomManager: RoomManager;
  private stateManager: RoomStateManager;
  
  private isActive: boolean = false;
  private selectedObject: any = null;
  private dragOffset: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private wasPrimaryDown: boolean = false;

  private selectedTileIndex: number = 0;
  private currentLayerName: 'Ground' | 'Collision' | 'Above' = 'Ground';
  private editorText: Phaser.GameObjects.Text;
  private tileCursor: Phaser.GameObjects.Graphics;
  private tilePreview: Phaser.GameObjects.Image;
  private mapOutline: Phaser.GameObjects.Graphics;
  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;

  // Tile palette (P key)
  private paletteContainer!: Phaser.GameObjects.Container;
  private paletteHighlight!: Phaser.GameObjects.Graphics;
  private paletteVisible: boolean = false;
  private paletteBuilt: boolean = false;
  private readonly paletteThumb = 14;
  private readonly paletteCols = 8;
  private readonly palettePosX = GAME_CONFIG.WIDTH - 116;
  private readonly palettePosY = 4;
  private paletteWidth: number = 0;
  private paletteHeight: number = 0;
  private paletteSelectionStart: { x: number; y: number } | null = null;
  private paletteSelectionEnd: { x: number; y: number } | null = null;

  // History for undo/redo
  private history: Array<{
    layer: 'Ground' | 'Collision' | 'Above',
    data: number[][]
  }> = [];
  private historyIndex: number = -1;
  private readonly MAX_HISTORY = 50;

  private keys: {
    ONE: Phaser.Input.Keyboard.Key;
    TWO: Phaser.Input.Keyboard.Key;
    THREE: Phaser.Input.Keyboard.Key;
    X: Phaser.Input.Keyboard.Key;
    Q: Phaser.Input.Keyboard.Key;
    E: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
    ALT: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
    CTRL: Phaser.Input.Keyboard.Key;
    LEFT: Phaser.Input.Keyboard.Key;
    RIGHT: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    I: Phaser.Input.Keyboard.Key;
    O: Phaser.Input.Keyboard.Key;
    N: Phaser.Input.Keyboard.Key;
    P: Phaser.Input.Keyboard.Key;
    T: Phaser.Input.Keyboard.Key;
    F: Phaser.Input.Keyboard.Key;
    R: Phaser.Input.Keyboard.Key;
    Z: Phaser.Input.Keyboard.Key;
    ENTER: Phaser.Input.Keyboard.Key;
  };

  private placementMode: 'interactable' | 'afflicted' | null = null;
  private activeTool: 'paint' | 'rect' | 'fill' = 'paint';
  private afflictedVariantIndex: number = 0;
  private readonly afflictedVariants = [
    'walker',
    'bloater',
    'crawler',
    'husk',
    'spitter',
    'brute',
    'ashrot',
    'veinhost',
  ];

  private rectStart: { x: number; y: number } | null = null;
  private rectGraphics: Phaser.GameObjects.Graphics;
  private selectedTiles: number[][] = [[0]]; // 2D array of GIDs for stamping

  // Door-pairing state machine. `O` enters this flow.
  private pairPhase: 'idle' | 'pick-target' | 'place-source' | 'place-target' = 'idle';
  private pairRoomList: string[] = [];
  private pairTargetIndex: number = 0;
  private pairTargetRoomId: string | null = null;
  private pairPickerContainer!: Phaser.GameObjects.Container;
  private pairPickerListText!: Phaser.GameObjects.Text;
  private pairSource: {
    sourceRoomId: string;
    sourceDoorId: string;
    targetDoorId: string;
  } | null = null;
  
  constructor(scene: Phaser.Scene, roomManager: RoomManager, stateManager: RoomStateManager) {
    this.scene = scene;
    this.roomManager = roomManager;
    this.stateManager = stateManager;

    const kb = this.scene.input.keyboard!;
    this.keys = {
      ONE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      TWO: kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      THREE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      X: kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
      Q: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q),
      E: kb.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      ESC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC),
      ALT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ALT),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      CTRL: kb.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL),
      LEFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
      RIGHT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      I: kb.addKey(Phaser.Input.Keyboard.KeyCodes.I),
      O: kb.addKey(Phaser.Input.Keyboard.KeyCodes.O),
      N: kb.addKey(Phaser.Input.Keyboard.KeyCodes.N),
      P: kb.addKey(Phaser.Input.Keyboard.KeyCodes.P),
      T: kb.addKey(Phaser.Input.Keyboard.KeyCodes.T),
      F: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F),
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      Z: kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    };

    this.editorText = this.scene.add.text(4, GAME_CONFIG.HEIGHT - 50, '', {
      fontSize: '8px',
      color: '#ffff00',
      backgroundColor: '#000000cc',
      padding: { x: 4, y: 3 },
      fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(DEPTH.UI + 200).setVisible(false);

    this.tileCursor = this.scene.add.graphics();
    this.tileCursor.setDepth(DEPTH.UI + 199).setVisible(false);

    this.tilePreview = this.scene.add.image(GAME_CONFIG.WIDTH - 20, GAME_CONFIG.HEIGHT - 40, 'tileset-sprites')
      .setScrollFactor(0)
      .setDepth(DEPTH.UI + 201)
      .setVisible(false)
      .setScale(1.5 / GAME_CONFIG.ASSET_SCALE); // 1.5x tile size for better visibility

    this.mapOutline = this.scene.add.graphics();
    this.mapOutline.setDepth(DEPTH.UI + 198).setVisible(false);

    this.rectGraphics = this.scene.add.graphics();
    this.rectGraphics.setDepth(DEPTH.UI + 199).setVisible(false);

    this.toastText = this.scene.add.text(GAME_CONFIG.WIDTH / 2, 6, '', {
      fontSize: '8px',
      color: '#000000',
      backgroundColor: '#ffff66',
      padding: { x: 5, y: 3 },
      align: 'center'
    })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.UI + 220)
      .setAlpha(0);

    this.paletteContainer = this.scene.add.container(this.palettePosX, this.palettePosY);
    this.paletteContainer.setScrollFactor(0).setDepth(DEPTH.UI + 210).setVisible(false);
    this.paletteHighlight = this.scene.add.graphics();

    this.scene.input.on('wheel', this.onWheel, this);

    // Door-pair target-room picker (shown during pairPhase === 'pick-target').
    this.pairPickerContainer = this.scene.add.container(GAME_CONFIG.WIDTH / 2, 30);
    this.pairPickerContainer.setScrollFactor(0).setDepth(DEPTH.UI + 250).setVisible(false);
    const pickerBg = this.scene.add.graphics();
    pickerBg.fillStyle(0x000000, 0.92);
    pickerBg.fillRect(-95, -8, 190, 200);
    pickerBg.lineStyle(1, 0xffff00, 1);
    pickerBg.strokeRect(-95, -8, 190, 200);
    this.pairPickerContainer.add(pickerBg);
    const hint = this.scene.add.text(0, 0, 'Pair door target  Up/Down  Enter  Esc', {
      fontSize: '8px', color: '#ffff00', fontFamily: 'monospace'
    }).setOrigin(0.5, 0);
    this.pairPickerContainer.add(hint);
    this.pairPickerListText = this.scene.add.text(-90, 14, '', {
      fontSize: '8px', color: '#ffffff', fontFamily: 'monospace'
    });
    this.pairPickerContainer.add(this.pairPickerListText);
  }

  /** GameScene reads this to suspend gameplay input while a modal is open. */
  isModalOpen(): boolean {
    return this.pairPhase === 'pick-target';
  }
  
  update(input: InputState): void {
    const pointer = this.scene.input.activePointer;
    const justDown = pointer.primaryDown && !this.wasPrimaryDown;
    const justUp = !pointer.primaryDown && this.wasPrimaryDown;
    this.wasPrimaryDown = pointer.primaryDown;

    if (input.editor) {
      this.isActive = !this.isActive;
      this.editorText.setVisible(this.isActive);
      this.tileCursor.setVisible(this.isActive);
      this.tilePreview.setVisible(this.isActive);
      this.mapOutline.setVisible(this.isActive);
      // Palette also hides when the editor closes; reopens on next P press.
      if (!this.isActive) {
        this.paletteVisible = false;
        this.paletteContainer.setVisible(false);
        this.paletteHighlight.clear();
      }

      this.updateLayerOpacities();
      this.updatePreview();
      this.redrawMapOutline();

      if (!this.isActive && this.selectedObject) {
        this.deselect();
      }
    }

    if (!this.isActive) return;

    this.handleLayerSwitching(input);
    this.handleToolSwitching();
    this.handleResize();
    this.handlePlacementToggle();
    this.handlePairing();
    this.handlePaletteToggle();
    this.handleUndoRedo(input);
    this.handleFloodFill();
    this.handleRectangle();
    this.redrawMapOutline();
    this.updateHUD();

    // Door-pair clicks short-circuit normal painting/selection.
    if (this.pairPhase === 'place-source' || this.pairPhase === 'place-target') {
      if (justDown) this.executePairClick();
      return;
    }
    if (this.pairPhase === 'pick-target') {
      // Picker is open; consume input here to avoid painting tiles.
      return;
    }

    if (this.placementMode) {
      if (justDown) this.executePlacement();
      return;
    }
    this.handleSelection(justDown);
    this.handleDragging(justUp);
    this.handleTilePainting();
  }

  private handleToolSwitching(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.F)) {
      this.activeTool = this.activeTool === 'fill' ? 'paint' : 'fill';
      this.showToast(`Tool: ${this.activeTool.toUpperCase()}`);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      this.activeTool = this.activeTool === 'rect' ? 'paint' : 'rect';
      this.showToast(`Tool: ${this.activeTool.toUpperCase()}`);
    }
    if (this.keys.ESC.isDown) {
      if (this.activeTool !== 'paint') {
        this.activeTool = 'paint';
        this.showToast('Tool: PAINT');
      }
    }
  }

  private handlePlacementToggle(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.I)) {
      this.placementMode = this.placementMode === 'interactable' ? null : 'interactable';
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.N)) {
      this.placementMode = this.placementMode === 'afflicted' ? null : 'afflicted';
    }
    if (this.placementMode === 'afflicted') {
      if (Phaser.Input.Keyboard.JustDown(this.keys.Q)) {
        this.afflictedVariantIndex = (this.afflictedVariantIndex - 1 + this.afflictedVariants.length) % this.afflictedVariants.length;
        this.showToast(`Variant: ${this.afflictedVariants[this.afflictedVariantIndex].toUpperCase()}`);
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.E)) {
        this.afflictedVariantIndex = (this.afflictedVariantIndex + 1) % this.afflictedVariants.length;
        this.showToast(`Variant: ${this.afflictedVariants[this.afflictedVariantIndex].toUpperCase()}`);
      }
    }

    if (this.placementMode && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.placementMode = null;
    }
    // O is now wired to door-pairing in handlePairing(), not single-side door.
  }

  // ── Door pairing (O key) ───────────────────────────────────────────────

  private handlePairing(): void {
    // Esc cancels at any phase
    if (this.pairPhase !== 'idle' && Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.cancelPair();
      return;
    }

    // Press O when idle to start the pairing flow
    if (this.pairPhase === 'idle' && Phaser.Input.Keyboard.JustDown(this.keys.O)) {
      const allRooms = Object.keys(RoomManager.getRoomsData().rooms).sort();
      const currentId = this.roomManager.getCurrentRoomId();
      this.pairRoomList = allRooms.filter(id => id !== currentId);
      if (!this.pairRoomList.length) {
        this.showToast('Need at least 2 rooms to pair a door.');
        return;
      }
      this.pairPhase = 'pick-target';
      this.pairTargetIndex = 0;
      this.pairTargetRoomId = this.pairRoomList[0];
      this.placementMode = null; // mutually exclusive with placement
      this.deselect();
      this.pairPickerContainer.setVisible(true);
      this.renderPairPickerList();
      return;
    }

    // Picker phase: Up/Down to navigate, Enter to confirm
    if (this.pairPhase === 'pick-target') {
      if (Phaser.Input.Keyboard.JustDown(this.keys.UP)) {
        this.pairTargetIndex = (this.pairTargetIndex - 1 + this.pairRoomList.length) % this.pairRoomList.length;
        this.pairTargetRoomId = this.pairRoomList[this.pairTargetIndex];
        this.renderPairPickerList();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.DOWN)) {
        this.pairTargetIndex = (this.pairTargetIndex + 1) % this.pairRoomList.length;
        this.pairTargetRoomId = this.pairRoomList[this.pairTargetIndex];
        this.renderPairPickerList();
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) {
        this.pairPhase = 'place-source';
        this.pairPickerContainer.setVisible(false);
      }
    }
  }

  private renderPairPickerList(): void {
    const total = this.pairRoomList.length;
    const window = 18;
    const half = Math.floor(window / 2);
    let start = Math.max(0, this.pairTargetIndex - half);
    const end = Math.min(total, start + window);
    if (end - start < window) start = Math.max(0, end - window);
    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      const id = this.pairRoomList[i];
      const marker = i === this.pairTargetIndex ? '>' : ' ';
      lines.push(`${marker} ${id}`);
    }
    this.pairPickerListText.setText(lines.join('\n'));
  }

  private cancelPair(): void {
    this.pairPhase = 'idle';
    this.pairTargetRoomId = null;
    this.pairSource = null;
    this.pairRoomList = [];
    this.pairPickerContainer.setVisible(false);
  }

  private executePairClick(): void {
    const map = this.roomManager.getMap();
    if (!map) return;
    const pointer = this.scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const tileX = map.worldToTileX(worldPoint.x);
    const tileY = map.worldToTileY(worldPoint.y);
    if (tileX === null || tileY === null) return;
    const T = GAME_CONFIG.TILE_SIZE;
    const mapW = map.width;
    const mapH = map.height;

    // Place-source: build source door, emit the source room's full updated
    // entry, then warp to the target room.
    if (this.pairPhase === 'place-source') {
      if (!this.pairTargetRoomId) { this.cancelPair(); return; }
      const sourceRoomId = this.roomManager.getCurrentRoomId();
      const sourceDoorId = `door-${Math.random().toString(36).slice(2, 7)}`;
      const targetDoorId = `door-${Math.random().toString(36).slice(2, 7)}`;
      const dir = this.inferEdgeDirection(tileX, tileY, mapW, mapH);
      const door = this.buildDoorRect(tileX, tileY, dir, T);

      const sourceDoor = {
        id: sourceDoorId,
        x: door.x, y: door.y,
        width: door.width, height: door.height,
        targetRoom: this.pairTargetRoomId,
        targetDoor: targetDoorId,
        direction: dir,
        spawnX: door.spawnX, spawnY: door.spawnY,
        requires: []
      };

      this.emitRoomWithNewDoor(sourceRoomId, sourceDoor, 'source');

      this.pairSource = { sourceRoomId, sourceDoorId, targetDoorId };
      this.pairPhase = 'place-target';
      const targetRoom = this.pairTargetRoomId;
      const scene = this.scene as any;
      if (typeof scene.warpToRoom === 'function') {
        scene.warpToRoom(targetRoom);
      }
      return;
    }

    // Place-target: build target door using the pre-generated cross-ref ids,
    // emit the target room's full updated entry.
    if (this.pairPhase === 'place-target') {
      const src = this.pairSource;
      const targetRoomId = this.roomManager.getCurrentRoomId();
      if (!src || targetRoomId !== this.pairTargetRoomId) {
        this.showToast('Pairing aborted (unexpected room).');
        this.cancelPair();
        return;
      }
      const dir = this.inferEdgeDirection(tileX, tileY, mapW, mapH);
      const door = this.buildDoorRect(tileX, tileY, dir, T);

      const targetDoor = {
        id: src.targetDoorId,
        x: door.x, y: door.y,
        width: door.width, height: door.height,
        targetRoom: src.sourceRoomId,
        targetDoor: src.sourceDoorId,
        direction: dir,
        spawnX: door.spawnX, spawnY: door.spawnY,
        requires: []
      };

      this.emitRoomWithNewDoor(targetRoomId, targetDoor, 'target');
      this.cancelPair();
    }
  }

  /**
   * Build the full updated `"<roomId>": { ... }` JSON fragment for a room
   * with one new door appended to its `doors` array. Copies it to the
   * clipboard, logs it to the console, and toasts. The user pastes the
   * entire fragment over the matching entry in `src/data/rooms.json`.
   */
  private emitRoomWithNewDoor(roomId: string, newDoor: object, label: 'source' | 'target'): void {
    const data = RoomManager.getRoomsData();
    const room = data.rooms[roomId];
    if (!room) {
      console.warn(`[Editor] emitRoomWithNewDoor: room "${roomId}" not found`);
      return;
    }
    // Deep clone so we never mutate the live in-memory data.
    const updated: any = JSON.parse(JSON.stringify(room));
    updated.doors = [...(updated.doors || []), newDoor];
    const fragment = `"${roomId}": ${JSON.stringify(updated, null, 2)}`;
    const human = label === 'source' ? 'Source' : 'Target';
    console.log(`[Editor] (${label}) Updated room "${roomId}". Replace its entry in src/data/rooms.json:\n${fragment}`);
    this.copyAndToast(
      fragment,
      `${human} room JSON copied.\nReplace "${roomId}" entry in rooms.json.`
    );
  }

  private inferEdgeDirection(tileX: number, tileY: number, mapW: number, mapH: number): string {
    const distTop = tileY;
    const distBottom = mapH - 1 - tileY;
    const distLeft = tileX;
    const distRight = mapW - 1 - tileX;
    const m = Math.min(distTop, distBottom, distLeft, distRight);
    if (m === distTop) return 'up';
    if (m === distBottom) return 'down';
    if (m === distLeft) return 'left';
    return 'right';
  }

  /** Always emit a single 16x16 door zone — one tile. Place two side-by-side
   *  in `rooms.json` if you want a 2-tile-wide opening. Direction only
   *  affects which side of the door the player lands on (`spawnX/Y`). */
  private buildDoorRect(tileX: number, tileY: number, direction: string, T: number)
    : { x: number; y: number; width: number; height: number; spawnX: number; spawnY: number } {
    const x = tileX * T;
    const y = tileY * T;
    const width = T;
    const height = T;
    const cx = x + Math.floor(T / 2);
    const cy = y + Math.floor(T / 2);
    let spawnX = cx, spawnY = cy;
    if (direction === 'up')    { spawnY = y + T + T; spawnX = cx; }
    if (direction === 'down')  { spawnY = y - T;     spawnX = cx; }
    if (direction === 'left')  { spawnX = x + T + T; spawnY = cy; }
    if (direction === 'right') { spawnX = x - T;     spawnY = cy; }
    return { x, y, width, height, spawnX, spawnY };
  }

  private executePlacement(): void {
    const map = this.roomManager.getMap();
    if (!map) return;
    const pointer = this.scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const tileX = map.worldToTileX(worldPoint.x);
    const tileY = map.worldToTileY(worldPoint.y);
    if (tileX === null || tileY === null) return;
    const T = GAME_CONFIG.TILE_SIZE;
    // Snap to tile center
    const x = tileX * T + Math.floor(T / 2);
    const y = tileY * T + Math.floor(T / 2);
    const roomId = this.roomManager.getCurrentRoomId();
    const rand = Math.random().toString(36).slice(2, 7);

    let snippet: object;
    let path: string;
    let label: string;

    if (this.placementMode === 'interactable') {
      snippet = {
        id: `inter-${rand}`,
        x, y,
        type: 'sign',
        tileFrame: this.selectedTileIndex > 0 ? this.selectedTileIndex - 1 : 0,
        text: 'TODO: edit me',
        requires: []
      };
      path = `rooms.${roomId}.interactables`;
      label = 'Interactable';
    } else if (this.placementMode === 'afflicted') {
      snippet = {
        id: `aff-${rand}`,
        name: 'TODO',
        role: 'TODO',
        x, y,
        behaviorLoop: 'wander',
        variant: this.afflictedVariants[this.afflictedVariantIndex]
      };
      path = `rooms.${roomId}.afflicted`;
      label = 'Afflicted';
    } else {
      return;
    }

    const json = JSON.stringify(snippet, null, 2);
    console.log(`[Editor] ${label} snippet for ${path}:\n${json}`);
    this.copyAndToast(json, `${label} snippet copied. Append to:\n${path}`);
    this.placementMode = null; // Disarm after one placement
  }

  // ── Tile palette (P key) ───────────────────────────────────────────────

  private handlePaletteToggle(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.P)) {
      this.paletteVisible = !this.paletteVisible;
      if (this.paletteVisible && !this.paletteBuilt) this.buildPalette();
      this.paletteContainer.setVisible(this.paletteVisible);
      this.paletteHighlight.setVisible(this.paletteVisible);
      this.updatePaletteHighlight();
    }
  }

  /** Build the thumbnail grid lazily on first reveal so the tilemap is loaded. */
  private buildPalette(): void {
    const map = this.roomManager.getMap();
    const tileset = map?.tilesets?.[0];
    const tileCount = tileset?.total ?? 64;
    const T = this.paletteThumb;
    const cols = this.paletteCols;
    const rows = Math.ceil(tileCount / cols);
    this.paletteWidth = cols * T + 2;   // +2 for border padding
    this.paletteHeight = rows * T + 2;

    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.85);
    bg.fillRect(0, 0, this.paletteWidth, this.paletteHeight);
    bg.lineStyle(1, 0xffff00, 1);
    bg.strokeRect(0, 0, this.paletteWidth, this.paletteHeight);
    this.paletteContainer.add(bg);

    // Native frame size from the spritesheet config: TILE_SIZE * ASSET_SCALE = 64.
    const frameSize = GAME_CONFIG.TILE_SIZE * GAME_CONFIG.ASSET_SCALE;
    const scale = T / frameSize;

    const bgRect = new Phaser.Geom.Rectangle(0, 0, this.paletteWidth, this.paletteHeight);

    for (let i = 0; i < tileCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = 1 + col * T + Math.floor(T / 2);
      const y = 1 + row * T + Math.floor(T / 2);
      const thumb = this.scene.add.sprite(x, y, 'tileset-sprites', i);
      thumb.setScale(scale).setScrollFactor(0);
      thumb.setInteractive({ useHandCursor: true });
      
      thumb.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        const col = i % this.paletteCols;
        const row = Math.floor(i / this.paletteCols);
        
        if (pointer.button === 0) { // Left click
          this.paletteSelectionStart = { x: col, y: row };
          this.paletteSelectionEnd = { x: col, y: row };
          this.updateMultiTileSelection();
        }
      });

      thumb.on('pointerover', (pointer: Phaser.Input.Pointer) => {
        if (pointer.leftButtonDown() && this.paletteSelectionStart) {
          const col = i % this.paletteCols;
          const row = Math.floor(i / this.paletteCols);
          this.paletteSelectionEnd = { x: col, y: row };
          this.updateMultiTileSelection();
        }
      });

      this.paletteContainer.add(thumb);
    }

    this.scene.input.on('pointerup', () => {
      this.paletteSelectionStart = null;
    });

    this.paletteHighlight.setScrollFactor(0).setDepth(DEPTH.UI + 211);
    this.paletteBuilt = true;
  }

  private updateMultiTileSelection(): void {
    if (!this.paletteSelectionStart || !this.paletteSelectionEnd) return;

    const x1 = Math.min(this.paletteSelectionStart.x, this.paletteSelectionEnd.x);
    const y1 = Math.min(this.paletteSelectionStart.y, this.paletteSelectionEnd.y);
    const x2 = Math.max(this.paletteSelectionStart.x, this.paletteSelectionEnd.x);
    const y2 = Math.max(this.paletteSelectionStart.y, this.paletteSelectionEnd.y);

    const newTiles: number[][] = [];
    for (let row = y1; row <= y2; row++) {
      const rowData: number[] = [];
      for (let col = x1; col <= x2; col++) {
        const index = row * this.paletteCols + col;
        rowData.push(index + 1); // 1-indexed GID
      }
      newTiles.push(rowData);
    }

    this.selectedTiles = newTiles;
    this.selectedTileIndex = newTiles[0][0];
    this.updatePreview();
    this.updatePaletteHighlight();
  }

  private updatePaletteHighlight(): void {
    if (!this.paletteVisible || !this.paletteBuilt) {
      this.paletteHighlight.clear();
      return;
    }
    this.paletteHighlight.clear();
    
    // Draw highlight for all selected tiles
    const T = this.paletteThumb;
    const cols = this.selectedTiles[0].length;
    const rows = this.selectedTiles.length;
    
    // We need to find the top-left tile's position in the palette grid
    // Since we only track GIDs in selectedTiles, we should probably track the selection rect instead
    // But for now, let's assume the first tile in selectedTiles is the one we use for positioning if it's a single tile,
    // or we can just redraw based on the last known selection if we are in the middle of selecting.
    
    // Actually, let's just use a simpler way: find the range of indices
    let minCol = 999, maxCol = -1, minRow = 999, maxRow = -1;
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const gid = this.selectedTiles[r][c];
        if (gid <= 0) continue;
        const i = gid - 1;
        const col = i % this.paletteCols;
        const row = Math.floor(i / this.paletteCols);
        minCol = Math.min(minCol, col);
        maxCol = Math.max(maxCol, col);
        minRow = Math.min(minRow, row);
        maxRow = Math.max(maxRow, row);
      }
    }

    if (maxCol === -1) return;

    const x = this.palettePosX + 1 + minCol * T;
    const y = this.palettePosY + 1 + minRow * T;
    const w = (maxCol - minCol + 1) * T;
    const h = (maxRow - minRow + 1) * T;

    this.paletteHighlight.lineStyle(2, 0xffff00, 1);
    this.paletteHighlight.strokeRect(x, y, w, h);
  }

  /** Total valid GID across all tilesets in the current map. Phaser's
   * PutTileAt does `tiles[index][2]` and crashes on out-of-range indices,
   * so any code that touches `selectedTileIndex` should clamp through here.
   */
  private maxTileIndex(): number {
    const map = this.roomManager.getMap();
    if (!map) return 0;
    let total = 0;
    for (const ts of map.tilesets) total += ts.total;
    return total;
  }

  private isPointerOverPalette(): boolean {
    if (!this.paletteVisible) return false;
    const p = this.scene.input.activePointer;
    return (
      p.x >= this.palettePosX &&
      p.x < this.palettePosX + this.paletteWidth &&
      p.y >= this.palettePosY &&
      p.y < this.palettePosY + this.paletteHeight
    );
  }

  private redrawMapOutline(): void {
    if (!this.isActive) return;
    const map = this.roomManager.getMap();
    if (!map) return;
    const w = map.width * GAME_CONFIG.TILE_SIZE;
    const h = map.height * GAME_CONFIG.TILE_SIZE;
    this.mapOutline.clear();
    // Solid yellow outline at the room boundary
    this.mapOutline.lineStyle(1, 0xffff00, 0.9);
    this.mapOutline.strokeRect(0, 0, w, h);
    // Faint inner border one tile in, to reinforce the bound
    const inset = GAME_CONFIG.TILE_SIZE;
    this.mapOutline.lineStyle(1, 0xffff00, 0.25);
    this.mapOutline.strokeRect(inset, inset, Math.max(0, w - inset * 2), Math.max(0, h - inset * 2));
  }

  /**
   * Shift+Arrow expands the map by one tile on that edge.
   * Ctrl+Shift+Arrow shrinks the map by one tile on that edge.
   * Right/Down keep existing data anchored top-left; Left/Up shift existing
   * data right/down to make room (or drop the leftmost/topmost edge on shrink).
   */
  private handleResize(): void {
    const shift = this.keys.SHIFT.isDown;
    if (!shift) return;
    const ctrl = this.keys.CTRL.isDown;
    const map = this.roomManager.getMap();
    if (!map) return;

    let newW = map.width;
    let newH = map.height;
    let offX = 0;
    let offY = 0;

    if (Phaser.Input.Keyboard.JustDown(this.keys.RIGHT)) {
      if (ctrl) { newW = map.width - 1; }
      else      { newW = map.width + 1; }
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.LEFT)) {
      if (ctrl) { newW = map.width - 1; offX = -1; }
      else      { newW = map.width + 1; offX = 1; }
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.DOWN)) {
      if (ctrl) { newH = map.height - 1; }
      else      { newH = map.height + 1; }
    } else if (Phaser.Input.Keyboard.JustDown(this.keys.UP)) {
      if (ctrl) { newH = map.height - 1; offY = -1; }
      else      { newH = map.height + 1; offY = 1; }
    } else {
      return;
    }

    if (newW < 1 || newH < 1) {
      console.warn('[Editor] Cannot shrink map below 1 tile');
      return;
    }

    const oldW = map.width;
    const oldH = map.height;
    const result = this.roomManager.resizeMap(newW, newH, offX, offY);
    if (!result) return;

    const scene = this.scene as any;
    if (typeof scene.refreshAfterResize === 'function') {
      scene.refreshAfterResize(result.pixelOffsetX, result.pixelOffsetY);
    }
    this.peekAtChangedEdge(oldW, oldH, newW, newH, offX, offY);
    console.log(`[Editor] Resized map ${oldW}x${oldH} -> ${newW}x${newH} (offset ${offX},${offY})`);
  }

  /**
   * Briefly pan the camera so the user can SEE the edge that just changed,
   * then re-engage normal player-follow. Without this, expansion looks like
   * a no-op because the new edge is outside the current viewport and the
   * existing collision wall blocks the player from walking there.
   */
  private peekAtChangedEdge(oldW: number, oldH: number, newW: number, newH: number, offX: number, offY: number): void {
    const cam = this.scene.cameras.main;
    const T = GAME_CONFIG.TILE_SIZE;
    let targetX = cam.midPoint.x;
    let targetY = cam.midPoint.y;
    if (newW !== oldW) {
      targetX = offX > 0 ? T : (newW * T) - T;
    }
    if (newH !== oldH) {
      targetY = offY > 0 ? T : (newH * T) - T;
    }

    const player = (this.scene as any).player;
    cam.stopFollow();
    cam.pan(targetX, targetY, 350, 'Sine.easeOut', true);
    this.scene.time.delayedCall(900, () => {
      if (!player) return;
      cam.pan(player.x, player.y, 250, 'Sine.easeInOut', true, (_c, p) => {
        if (p < 1) return;
        const scene = this.scene as any;
        if (typeof scene.refreshCamera === 'function') scene.refreshCamera();
      });
    });
  }

  private updateHUD(): void {
    const map = this.roomManager.getMap();
    const dims = map ? `${map.width}x${map.height}` : '?';
    let statusLine = '';
    if (this.placementMode) {
      statusLine = `armed ${this.placementMode} (Esc cancel)`;
    } else if (this.pairPhase === 'pick-target') {
      statusLine = 'pair: pick target room (Up/Down, Enter, Esc)';
    } else if (this.pairPhase === 'place-source') {
      statusLine = `pair: click source door (target=${this.pairTargetRoomId})`;
    } else if (this.pairPhase === 'place-target') {
      statusLine = `pair: click target door in ${this.pairTargetRoomId}`;
    }
    const lines = [
      `TOOL: ${this.activeTool.toUpperCase()} | ${this.currentLayerName} layer | tile ${this.selectedTileIndex} | ${dims}`,
      `1/2/3 layer  Q/E tile  P palette  L-clk paint  R-clk erase`,
      `F fill  R rect  X save  I sign  O door-pair  N npc  T stamp`,
      `Sh+Arrow grow  Ctrl+Sh+Arrow shrink`
    ];
    if (statusLine) lines.unshift(`* ${statusLine}`);
    this.editorText.setText(lines);
    this.updatePreview();
  }
  
  private handleSelection(justDown: boolean): void {
    const pointer = this.scene.input.activePointer;
    
    // Only select on JUST DOWN to avoid grabbing while painting
    if (justDown && !this.selectedObject) {
      const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
      
      // Try to select an object
      // 1. Check Afflicted
      const afflictedGroup = (this.scene as any).afflictedGroup as Phaser.Physics.Arcade.Group;
      if (afflictedGroup) {
        const hit = afflictedGroup.getChildren().find(child => {
          const a = child as any;
          return Phaser.Geom.Rectangle.Contains(a.getBounds(), worldPoint.x, worldPoint.y);
        });
        if (hit) {
          this.select(hit, 'afflicted');
          return;
        }
      }
      
      // 2. Check Interactables
      // Note: We don't have sprites for all interactables, some are just zones
      // In a more complete editor we'd draw icons for these
    }
  }
  
  private handleDragging(justUp: boolean): void {
    if (!this.selectedObject) return;
    
    const pointer = this.scene.input.activePointer;
    if (pointer.primaryDown) {
      const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
      this.selectedObject.sprite.x = worldPoint.x - this.dragOffset.x;
      this.selectedObject.sprite.y = worldPoint.y - this.dragOffset.y;
    } else {
      if (justUp) {
        this.logObjectSnippet();
      }
    }
    
    if (this.keys.ESC.isDown) {
      this.deselect();
    }
  }
  
  private select(obj: any, type: string): void {
    this.selectedObject = { sprite: obj, type: type, originalData: obj.data?.get('def') };
    obj.setTint(0x00ff00);
    
    const worldPoint = this.scene.input.activePointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    this.dragOffset.set(worldPoint.x - obj.x, worldPoint.y - obj.y);
    
    console.log('Selected:', type, this.selectedObject.originalData);
  }
  
  private deselect(): void {
    if (this.selectedObject) {
      this.selectedObject.sprite.clearTint();
    }
    this.selectedObject = null;
  }
  
  private handleLayerSwitching(input: InputState): void {
    let layerChanged = false;
    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) {
      this.currentLayerName = 'Ground';
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) {
      this.currentLayerName = 'Collision';
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) {
      this.currentLayerName = 'Above';
      layerChanged = true;
    }

    if (layerChanged) {
      this.updateLayerOpacities();
    }

    // Use input state from InputManager to avoid JustDown consumption conflict
    if (input.drop) { // Q
      this.selectedTileIndex = Math.max(0, this.selectedTileIndex - 1);
      this.updatePreview();
      this.updatePaletteHighlight();
    }
    if (input.action) { // E
      this.selectedTileIndex = Math.min(this.selectedTileIndex + 1, this.maxTileIndex());
      this.updatePreview();
      this.updatePaletteHighlight();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.X)) {
      this.exportTilemap();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.T)) {
      this.stampDefaultRoom();
    }
  }

  /**
   * Reset the active room to a baseline: floor everywhere on Ground,
   * walls around the perimeter on Collision (interior cleared), and
   * Above cleared. Same content the `npm run new-room` script writes
   * for fresh rooms — useful for re-baselining a room mid-edit. Git
   * is the undo button.
   */
  private stampDefaultRoom(): void {
    const map = this.roomManager.getMap();
    if (!map) return;
    const w = map.width;
    const h = map.height;
    const FLOOR = 3;
    const WALL = 2;

    map.fill(FLOOR, 0, 0, w, h, false, 'Ground');
    map.fill(-1, 0, 0, w, h, false, 'Above');
    map.fill(WALL, 0, 0, w, h, false, 'Collision');
    if (w > 2 && h > 2) {
      map.fill(-1, 1, 1, w - 2, h - 2, false, 'Collision');
    }
    this.refreshCollision();
    this.showToast('Room stamped: floor + perimeter walls. Git to undo.');
  }

  private buildExportData(): any {
    const map = this.roomManager.getMap();
    if (!map) return null;
    return {
      compressionlevel: -1,
      height: map.height,
      infinite: false,
      layers: map.layers.map((layer, index) => ({
        data: layer.data.flat().map(tile => (tile && tile.index !== -1) ? tile.index : 0),
        height: layer.height,
        id: index + 1,
        name: layer.name,
        opacity: 1,
        type: 'tilelayer',
        visible: true,
        width: layer.width,
        x: 0,
        y: 0
      })),
      nextlayerid: map.layers.length + 1,
      nextobjectid: 1,
      orientation: 'orthogonal',
      renderorder: 'right-down',
      tiledversion: '1.10.2',
      tileheight: map.tileHeight,
      tilesets: map.tilesets.map(ts => ({
        columns: ts.columns,
        firstgid: ts.firstgid,
        image: ts.name + ".png",
        imageheight: ts.image ? (ts.image.getSourceImage() as any).height : 512,
        imagewidth: ts.image ? (ts.image.getSourceImage() as any).width : 512,
        margin: ts.tileMargin,
        name: ts.name,
        spacing: ts.tileSpacing,
        tilecount: ts.total,
        tileheight: ts.tileHeight,
        tilewidth: ts.tileWidth
      })),
      tilewidth: map.tileWidth,
      type: 'map',
      version: '1.10',
      width: map.width
    };
  }

  private exportTilemap(): void {
    const exportData = this.buildExportData();
    if (!exportData) return;
    const roomId = this.roomManager.getCurrentRoomId();
    const path = `public/assets/tilemaps/${roomId}.json`;
    const json = JSON.stringify(exportData, null, 2);
    
    // Auto-save attempt
    if (import.meta.env.DEV) {
      this.saveTilemapToDisk(roomId, exportData);
    } else {
      console.log(`[Editor] Tilemap JSON for ${path}:\n`, exportData);
      this.copyAndToast(json, `Tilemap copied. Paste into:\n${path}`);
    }
  }

  private async saveTilemapToDisk(roomId: string, data: any): Promise<void> {
    try {
      this.showToast(`Saving ${roomId}.json...`);
      const resp = await fetch(`/__editor/save-tilemap?roomId=${roomId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const result = await resp.json();
      if (result.ok) {
        this.showToast(`Saved to disk: ${result.path}`);
      } else {
        throw new Error(result.error || 'Unknown error');
      }
    } catch (err: any) {
      console.error('[Editor] Save failed:', err);
      const json = JSON.stringify(data, null, 2);
      this.copyAndToast(json, `Disk save failed: ${err.message}\nFallback: JSON copied to clipboard.`);
    }
  }

  private handleTilePainting(): void {
    const pointer = this.scene.input.activePointer;
    const map = this.roomManager.getMap();
    if (!map) {
      this.tileCursor.setVisible(false);
      return;
    }
    // If the cursor is over the palette overlay, swallow the click so we don't
    // paint a tile in the world while picking a thumbnail.
    if (this.isPointerOverPalette()) {
      this.tileCursor.setVisible(false);
      return;
    }

    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const tileX = map.worldToTileX(worldPoint.x);
    const tileY = map.worldToTileY(worldPoint.y);

    if (tileX === null || tileY === null) {
      this.tileCursor.setVisible(false);
      return;
    }

    // Update cursor
    this.tileCursor.setVisible(true);
    this.tileCursor.clear();
    this.tileCursor.lineStyle(1, 0xffff00, 0.8);
    const tw = map.tileWidth * (map.layers[0]?.tilemapLayer?.scaleX || 1);
    const th = map.tileHeight * (map.layers[0]?.tilemapLayer?.scaleY || 1);
    
    // Draw cursor for multi-tile selection
    const rows = this.selectedTiles.length;
    const cols = this.selectedTiles[0].length;
    this.tileCursor.strokeRect(tileX * tw, tileY * th, tw * cols, th * rows);

    if (this.selectedObject) return; // Don't paint while dragging
    if (this.activeTool !== 'paint') return; // Don't paint while using other tools

    let changed = false;

    // Eyedropper: Middle Click or Alt + Left Click
    const isAlt = this.keys.ALT.isDown;
    if (pointer.middleButtonDown() || (pointer.leftButtonDown() && isAlt)) {
      const tile = map.getTileAt(tileX, tileY, true, this.currentLayerName);
      if (tile && tile.index !== -1) {
        this.selectedTileIndex = tile.index;
        this.selectedTiles = [[tile.index]];
        this.updatePreview();
        this.updatePaletteHighlight();
      }
    } 
    // Left Click: Paint (only if NOT alt)
    else if (pointer.leftButtonDown()) {
      if (pointer.primaryDown) {
        this.pushHistory();
      }
      
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tx = tileX + c;
          const ty = tileY + r;
          if (tx >= map.width || ty >= map.height) continue;

          const safeIndex = this.selectedTiles[r][c];
          const currentTile = map.getTileAt(tx, ty, true, this.currentLayerName);
          if (currentTile && currentTile.index !== safeIndex) {
            if (safeIndex <= 0) {
              if (currentTile.index !== -1) {
                map.removeTileAt(tx, ty, true, true, this.currentLayerName);
                changed = true;
              }
            } else {
              try {
                map.putTileAt(safeIndex, tx, ty, true, this.currentLayerName);
                changed = true;
              } catch (e) {
                console.warn('[Editor] putTileAt failed', { safeIndex, tx, ty, layer: this.currentLayerName, err: e });
              }
            }
          }
        }
      }
    }

    // Right Click: Erase
    if (pointer.rightButtonDown()) {
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const tx = tileX + c;
          const ty = tileY + r;
          if (tx >= map.width || ty >= map.height) continue;
          
          const currentTile = map.getTileAt(tx, ty, true, this.currentLayerName);
          if (currentTile && currentTile.index !== -1) {
            map.removeTileAt(tx, ty, true, true, this.currentLayerName);
            changed = true;
          }
        }
      }
    }

    if (changed && this.currentLayerName === 'Collision') {
      this.refreshCollision();
    }
  }

  private refreshCollision(): void {
    const collisionLayer = this.roomManager.getCollisionLayer();
    if (collisionLayer) {
      collisionLayer.setCollisionByExclusion([-1]);
      // We might need to notify GameScene to update the collider, 
      // but usually Phaser's collider works on the layer itself which is now updated.
    }
  }
  private async saveObjectToDisk(kind: 'afflicted' | 'interactable', id: string, x: number, y: number): Promise<void> {
    if (!import.meta.env.DEV) return;
    const roomId = this.roomManager.getCurrentRoomId();
    try {
      const resp = await fetch('/__editor/save-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, kind, id, x, y })
      });
      const result = await resp.json();
      if (!result.ok) throw new Error(result.error || 'Unknown error');
      this.showToast(`Saved ${kind} "${id}" position.`);
    } catch (err: any) {
      console.error('[Editor] Object save failed:', err);
      this.showToast(`Disk save failed: ${err.message}`);
    }
  }

  private logObjectSnippet(): void {
    if (!this.selectedObject) return;
    const s = this.selectedObject.sprite;
    const type = this.selectedObject.type as 'afflicted' | 'interactable';
    const id: string | undefined =
      typeof s.getId === 'function' ? s.getId() :
      (this.selectedObject.originalData?.id);
    const x = Math.round(s.x);
    const y = Math.round(s.y);
    const roomId = this.roomManager.getCurrentRoomId();

    if (!id) {
      console.warn('[Editor] Cannot persist drag — selected object has no id');
      return;
    }

    if (import.meta.env.DEV) {
      this.saveObjectToDisk(type, id, x, y);
    } else {
      const listKey = type === 'afflicted' ? 'afflicted' : 'interactables';
      const path = `src/data/rooms.json → rooms.${roomId}.${listKey}[id="${id}"]`;
      const snippet = JSON.stringify({ id, x, y }, null, 2);
      console.log(`[Editor] Position update for ${path}:\n${snippet}`);
      this.copyAndToast(snippet, `Position copied. Update x/y in:\n${path}`);
    }
  }

  private async copyAndToast(text: string, message: string): Promise<void> {
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch {
      copied = false;
    }
    this.showToast(copied ? message : `${message}\n(clipboard blocked — see console)`);
  }

  private showToast(message: string): void {
    if (!this.toastText) return;
    this.toastTween?.stop();
    this.toastText.setText(message);
    this.toastText.setAlpha(1);
    this.toastTween = this.scene.tweens.add({
      targets: this.toastText,
      alpha: 0,
      duration: 600,
      delay: 2000, // Reduced delay for more responsive feedback
      ease: 'Sine.easeIn'
    });
  }

  private updateLayerOpacities(): void {
    const ground = this.roomManager.getGroundLayer();
    const collision = this.roomManager.getCollisionLayer();
    const above = this.roomManager.getAboveLayer();

    const layerMap: Record<string, Phaser.Tilemaps.TilemapLayer | null> = {
      'Ground': ground,
      'Collision': collision,
      'Above': above
    };

    [ground, collision, above].forEach(layer => {
      if (!layer) return;
      if (!this.isActive) {
        layer.setAlpha(1);
        return;
      }

      const activeLayer = layerMap[this.currentLayerName];
      if (layer === activeLayer) {
        layer.setAlpha(1);
      } else {
        layer.setAlpha(0.2); // Dim other layers
      }
    });
  }

  private updatePreview(): void {
    if (!this.isActive) {
      this.tilePreview.setVisible(false);
      return;
    }
    
    this.tilePreview.setVisible(true);
    
    // In Phaser Tilemaps, index 0 is usually empty, and index 1 is the first tile (frame 0).
    // We adjust for the 0-indexed spritesheet frames.
    if (this.selectedTileIndex > 0) {
      this.tilePreview.setFrame(this.selectedTileIndex - 1);
      this.tilePreview.setAlpha(1);
    } else {
      this.tilePreview.setAlpha(0.3); // Eraser/Empty preview
      this.tilePreview.setFrame(0); 
    }

    // Position preview next to the "TOOL: X" part of the text
    // The first line is roughly 160px wide now with TOOL: prefix
    this.tilePreview.setPosition(this.editorText.x + 185, this.editorText.y + 6);
  }

  private handleUndoRedo(input: InputState): void {
    const ctrl = this.keys.CTRL.isDown;
    const shift = this.keys.SHIFT.isDown;
    const z = Phaser.Input.Keyboard.JustDown(this.keys.Z);

    if (z) {
      if (ctrl && shift) {
        this.redo();
      } else if (ctrl) {
        this.undo();
      }
    }
  }

  private pushHistory(): void {
    const map = this.roomManager.getMap();
    if (!map) return;

    // Capture current layer state
    const layer = this.currentLayerName;
    const data: number[][] = [];
    const tilemapLayer = map.getLayer(layer)?.tilemapLayer;
    if (!tilemapLayer) return;

    for (let y = 0; y < map.height; y++) {
      const row: number[] = [];
      for (let x = 0; x < map.width; x++) {
        const tile = map.getTileAt(x, y, true, layer);
        row.push(tile ? tile.index : -1);
      }
      data.push(row);
    }

    // If we're not at the end of the stack, discard the future
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }

    this.history.push({ layer, data });
    if (this.history.length > this.MAX_HISTORY) {
      this.history.shift();
    } else {
      this.historyIndex++;
    }
  }

  private undo(): void {
    if (this.historyIndex <= 0) {
      this.showToast('Nothing to undo');
      return;
    }
    
    // To undo, we need to restore the state BEFORE the current action.
    // The history stack stores states AFTER actions.
    this.historyIndex--;
    this.applyHistoryState(this.history[this.historyIndex]);
    this.showToast(`Undo (${this.historyIndex + 1}/${this.history.length})`);
  }

  private redo(): void {
    if (this.historyIndex >= this.history.length - 1) {
      this.showToast('Nothing to redo');
      return;
    }
    this.historyIndex++;
    this.applyHistoryState(this.history[this.historyIndex]);
    this.showToast(`Redo (${this.historyIndex + 1}/${this.history.length})`);
  }

  private applyHistoryState(state: { layer: 'Ground' | 'Collision' | 'Above', data: number[][] }): void {
    const map = this.roomManager.getMap();
    if (!map) return;

    for (let y = 0; y < state.data.length; y++) {
      for (let x = 0; x < state.data[y].length; x++) {
        const idx = state.data[y][x];
        if (idx === -1) {
          map.removeTileAt(x, y, true, true, state.layer);
        } else {
          map.putTileAt(idx, x, y, true, state.layer);
        }
      }
    }

    if (state.layer === 'Collision') {
      this.refreshCollision();
    }
    this.updateLayerOpacities();
  }

  private handleFloodFill(): void {
    if (this.activeTool !== 'fill') return;
    
    const map = this.roomManager.getMap();
    if (!map) return;
    
    const pointer = this.scene.input.activePointer;
    if (pointer.primaryDown && !this.wasPrimaryDown) {
      const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
      const tileX = map.worldToTileX(worldPoint.x);
      const tileY = map.worldToTileY(worldPoint.y);

      if (tileX !== null && tileY !== null) {
        this.executeFloodFill(tileX, tileY);
      }
    }
  }

  private handleRectangle(): void {
    if (this.activeTool !== 'rect') {
      this.rectStart = null;
      this.rectGraphics.setVisible(false);
      return;
    }

    const map = this.roomManager.getMap();
    if (!map) return;

    const pointer = this.scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const tileX = map.worldToTileX(worldPoint.x);
    const tileY = map.worldToTileY(worldPoint.y);

    if (tileX === null || tileY === null) return;

    const justDown = pointer.primaryDown && !this.wasPrimaryDown;
    const isDown = pointer.primaryDown;

    if (justDown) {
      this.rectStart = { x: tileX, y: tileY };
      this.rectGraphics.setVisible(true);
    }

    if (isDown && this.rectStart) {
      this.updateRectGraphics(this.rectStart.x, this.rectStart.y, tileX, tileY);
    } else if (this.rectStart) {
      // Released
      this.executeRectangleFill(this.rectStart.x, this.rectStart.y, tileX, tileY);
      this.rectStart = null;
      this.rectGraphics.setVisible(false);
    }
  }

  private updateRectGraphics(x1: number, y1: number, x2: number, y2: number): void {
    const map = this.roomManager.getMap();
    if (!map) return;

    const startX = Math.min(x1, x2);
    const startY = Math.min(y1, y2);
    const endX = Math.max(x1, x2);
    const endY = Math.max(y1, y2);

    const tw = GAME_CONFIG.TILE_SIZE;
    const th = GAME_CONFIG.TILE_SIZE;

    this.rectGraphics.clear();
    this.rectGraphics.lineStyle(2, 0xffff00, 1);
    this.rectGraphics.strokeRect(
      startX * tw,
      startY * th,
      (endX - startX + 1) * tw,
      (endY - startY + 1) * th
    );
    this.rectGraphics.fillStyle(0xffff00, 0.3);
    this.rectGraphics.fillRect(
      startX * tw,
      startY * th,
      (endX - startX + 1) * tw,
      (endY - startY + 1) * th
    );
  }

  private executeRectangleFill(x1: number, y1: number, x2: number, y2: number): void {
    const map = this.roomManager.getMap();
    if (!map) return;

    const startX = Math.min(x1, x2);
    const startY = Math.min(y1, y2);
    const endX = Math.max(x1, x2);
    const endY = Math.max(y1, y2);

    this.pushHistory();

    const layer = this.currentLayerName;
    const fillIndex = this.selectedTileIndex;
    let changed = false;

    for (let y = startY; y <= endY; y++) {
      for (let x = startX; x <= endX; x++) {
        if (fillIndex <= 0) {
          map.removeTileAt(x, y, true, true, layer);
        } else {
          map.putTileAt(fillIndex, x, y, true, layer);
        }
        changed = true;
      }
    }

    if (changed) {
      if (layer === 'Collision') this.refreshCollision();
      this.pushHistory();
      const count = (endX - startX + 1) * (endY - startY + 1);
      this.showToast(`Rect filled ${count} tiles`);
    }
  }

  private executeFloodFill(startX: number, startY: number): void {
    const map = this.roomManager.getMap();
    if (!map) return;

    const layer = this.currentLayerName;
    const targetTile = map.getTileAt(startX, startY, true, layer);
    const targetIndex = targetTile ? targetTile.index : -1;
    const fillIndex = this.selectedTileIndex;

    if (targetIndex === fillIndex) return;

    // Save state before fill
    this.pushHistory();

    const stack: Array<[number, number]> = [[startX, startY]];
    const processed = new Set<string>();

    let count = 0;
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const key = `${x},${y}`;
      if (processed.has(key)) continue;
      processed.add(key);

      const tile = map.getTileAt(x, y, true, layer);
      const idx = tile ? tile.index : -1;

      if (idx === targetIndex) {
        if (fillIndex <= 0) {
          map.removeTileAt(x, y, true, true, layer);
        } else {
          map.putTileAt(fillIndex, x, y, true, layer);
        }
        count++;

        if (x > 0) stack.push([x - 1, y]);
        if (x < map.width - 1) stack.push([x + 1, y]);
        if (y > 0) stack.push([x, y - 1]);
        if (y < map.height - 1) stack.push([x, y + 1]);
      }
    }

    if (count > 0 && layer === 'Collision') {
      this.refreshCollision();
    }
    
    // Save state after fill (for undo)
    this.pushHistory();
    this.showToast(`Filled ${count} tiles`);
  }
  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number): void {
    if (!this.isActive) return;
    if (dy > 0) {
      this.selectedTileIndex = Math.min(this.selectedTileIndex + 1, this.maxTileIndex());
    } else if (dy < 0) {
      this.selectedTileIndex = Math.max(0, this.selectedTileIndex - 1);
    }
    this.updatePreview();
    this.updatePaletteHighlight();
  }

  destroy(): void {
    this.scene.input.off('wheel', this.onWheel, this);
    this.deselect();
    this.toastTween?.stop();
    this.editorText?.destroy();
    this.tileCursor?.destroy();
    this.tilePreview?.destroy();
    this.mapOutline?.destroy();
    this.toastText?.destroy();
    this.paletteContainer?.destroy();
    this.paletteHighlight?.destroy();
    this.pairPickerContainer?.destroy();
  }
}
