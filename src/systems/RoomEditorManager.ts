import Phaser from 'phaser';
import type { EditorUI } from '@scenes/EditorUI';
import { RoomManager } from './RoomManager';
import { RoomStateManager } from './RoomStateManager';
import { WeatherManager } from './WeatherManager';
import { DEPTH, DARKNESS_CONFIG, GAME_CONFIG, LAYER_NAMES, LayerName, LAYER_CONFIG } from '@utils/Constants';
import { DoorDefinition, InputState, InteractableDef } from '@/types';
import { tilesetSpritesheetKey } from '@utils/TilesetResolver';

/** Current editor selection, rendered as a thumbnail/swatch in the DOM panel. */
export type EditorPreviewState =
  | { kind: 'none' }
  | { kind: 'color'; rgb: number }
  | { kind: 'tile'; textureKey: string; frame: number; gid: number };

export class RoomEditorManager {
  private scene: Phaser.Scene;
  private roomManager: RoomManager;
  private stateManager: RoomStateManager;
  
  private isActive: boolean = false;
  private selectedObject: any = null;
  private selectedDoor: { zone: Phaser.GameObjects.Zone; doorId: string } | null = null;
  private selectedDoorSpawn: { zone: Phaser.GameObjects.Zone; doorId: string } | null = null;
  private doorHandles!: Phaser.GameObjects.Graphics;
  private dragOffset: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private wasPrimaryDown: boolean = false;
  private justDown: boolean = false;
  private pointerDownOnCanvas: boolean = false;

  /** Derived from selectedTiles[0][0] — always reflects the top-left tile of the current stamp. */
  private get selectedTileIndex(): number { return this.selectedTiles[0][0]; }
  private set selectedTileIndex(v: number) { this.selectedTiles = [[v]]; }
  private currentLayerName: LayerName = LAYER_NAMES.GROUND;
  private editorText: Phaser.GameObjects.Text;
  private tileCursor: Phaser.GameObjects.Graphics;
  private mapOutline: Phaser.GameObjects.Graphics;
  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;
  private darknessHint!: Phaser.GameObjects.Rectangle;
  private edgeShadows?: Phaser.GameObjects.RenderTexture;
  private weatherManager!: WeatherManager;

  // Tile palette (P key) — rendered as a DOM canvas in EditorUI
  private paletteVisible: boolean = false;
  private editorUI: EditorUI | null = null;

  // History for undo/redo
  private history: Array<{
    layer: LayerName,
    data: number[][]
  }> = [];
  private historyIndex: number = -1;
  private readonly MAX_HISTORY = 50;

  private keys: {
    ONE: Phaser.Input.Keyboard.Key;
    TWO: Phaser.Input.Keyboard.Key;
    THREE: Phaser.Input.Keyboard.Key;
    FOUR: Phaser.Input.Keyboard.Key;
    FIVE: Phaser.Input.Keyboard.Key;
    SIX: Phaser.Input.Keyboard.Key;
    SEVEN: Phaser.Input.Keyboard.Key;
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
    K: Phaser.Input.Keyboard.Key;
    G: Phaser.Input.Keyboard.Key;
    M: Phaser.Input.Keyboard.Key;
    ENTER: Phaser.Input.Keyboard.Key;
  };

  private dirtyObjects = new Map<string, {
    type: 'afflicted' | 'interactable' | 'door';
    id: string; x: number; y: number; spawnX?: number; spawnY?: number; create?: boolean;
    width?: number; height?: number;
    targetRoom?: string; targetDoor?: string; direction?: string;
    roomId?: string;
  }>();
  private pendingRoomSize: { width: number; height: number } | null = null;
  // True once tiles/colors have changed since the last save. Object-only moves
  // leave this false, so X can persist them without rewriting the tilemap (which
  // would trigger a Vite page reload).
  private tilemapDirty = false;

  private placementMode: 'interactable' | 'afflicted' | null = null;
  private activeTool: 'paint' | 'rect' | 'fill' | 'select' = 'select'; // open in safe Select mode
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

  // Color tile mode — paints solid-color squares via RoomManager (persistent,
  // game-rendered). The editor only holds the current color + mode flag.
  private colorMode: boolean = false;
  private selectedColor: number = 0xff4444;

  // Actual-view: while held (`G` key or the UI button), render every layer at
  // full alpha (as in-game) and hide editor chrome for a quick preview.
  private actualView: boolean = false;
  private actualViewHeld: boolean = false; // set by the EditorUI button (press/release)

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
      FOUR: kb.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
      FIVE: kb.addKey(Phaser.Input.Keyboard.KeyCodes.FIVE),
      SIX: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SIX),
      SEVEN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SEVEN),
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
      K: kb.addKey(Phaser.Input.Keyboard.KeyCodes.K),
      G: kb.addKey(Phaser.Input.Keyboard.KeyCodes.G),
      M: kb.addKey(Phaser.Input.Keyboard.KeyCodes.M),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    };

    this.editorText = this.scene.add.text(4, GAME_CONFIG.HEIGHT - 200, '', {
      fontSize: '32px',
      color: '#ffff00',
      backgroundColor: '#000000cc',
      padding: { x: 16, y: 12 },
      fontFamily: 'monospace'
    }).setScrollFactor(0).setDepth(DEPTH.UI + 200).setVisible(false);

    this.tileCursor = this.scene.add.graphics();
    this.tileCursor.setDepth(DEPTH.UI + 199).setVisible(false);

    // Tile/color preview now lives in the DOM right panel (EditorUI), not on the
    // canvas — see getPreviewState() / EditorUI.setPreview().

    this.mapOutline = this.scene.add.graphics();
    this.mapOutline.setDepth(DEPTH.UI + 198).setVisible(false);

    this.rectGraphics = this.scene.add.graphics();
    this.rectGraphics.setDepth(DEPTH.UI + 199).setVisible(false);

    // Cyan crosshair drawn on each door zone so they can be grabbed in editor mode
    this.doorHandles = this.scene.add.graphics();
    this.doorHandles.setDepth(DEPTH.UI + 197).setVisible(false);

    this.toastText = this.scene.add.text(GAME_CONFIG.WIDTH / 2, 24, '', {
      fontSize: '32px',
      color: '#000000',
      backgroundColor: '#ffff66',
      padding: { x: 20, y: 12 },
      align: 'center'
    })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.UI + 220)
      .setAlpha(0);

    this.darknessHint = this.scene.add.rectangle(
      GAME_CONFIG.WIDTH / 2, GAME_CONFIG.HEIGHT / 2,
      GAME_CONFIG.WIDTH, GAME_CONFIG.HEIGHT,
      0x000000, 1
    ).setScrollFactor(0).setDepth(DEPTH.LIGHTING).setAlpha(0).setVisible(false);

    this.weatherManager = new WeatherManager(this.scene);

    // Install global debug helpers
    (window as any).dumpEditorState = () => {
      const data = this.buildExportData();
      console.log('[Editor] Current state:', data);
      return data;
    };
    (window as any).dumpRoomsData = () => {
      const data = RoomManager.getRoomsData();
      console.log('[Editor] roomsData:', data);
      return data;
    };

    this.scene.input.on('wheel', this.onWheel, this);
    // Track whether the current pointer press originated on the canvas, not on a DOM UI button.
    this.scene.input.on('pointerdown', () => { this.pointerDownOnCanvas = true; });
    this.scene.input.on('pointerup',   () => { this.pointerDownOnCanvas = false; });

    // Door-pair target-room picker (shown during pairPhase === 'pick-target').
    this.pairPickerContainer = this.scene.add.container(GAME_CONFIG.WIDTH / 2, 120);
    this.pairPickerContainer.setScrollFactor(0).setDepth(DEPTH.UI + 250).setVisible(false);
    const pickerBg = this.scene.add.graphics();
    pickerBg.fillStyle(0x000000, 0.92);
    pickerBg.fillRect(-380, -32, 760, 800);
    pickerBg.lineStyle(4, 0xffff00, 1);
    pickerBg.strokeRect(-380, -32, 760, 800);
    this.pairPickerContainer.add(pickerBg);
    const hint = this.scene.add.text(0, 0, 'Pair door target  Up/Down  Enter  Esc', {
      fontSize: '32px', color: '#ffff00', fontFamily: 'monospace'
    }).setOrigin(0.5, 0);
    this.pairPickerContainer.add(hint);
    this.pairPickerListText = this.scene.add.text(-360, 56, '', {
      fontSize: '32px', color: '#ffffff', fontFamily: 'monospace'
    });
    this.pairPickerContainer.add(this.pairPickerListText);
  }

  /** GameScene reads this to suspend gameplay input while a modal is open. */
  isModalOpen(): boolean {
    return this.pairPhase === 'pick-target' ||
           this.pairPhase === 'place-source' ||
           this.pairPhase === 'place-target';
  }

  /** True when the live editor is open — GameScene uses this to suppress 1/2/3 char switching. */
  isEditorActive(): boolean {
    return this.isActive;
  }

  /** Current tool ('paint' | 'rect' | 'fill' | 'select') — EditorUI reflects this on its buttons. */
  getActiveTool(): 'paint' | 'rect' | 'fill' | 'select' { return this.activeTool; }
  getColorMode(): boolean { return this.colorMode; }
  getCurrentLayerName(): string { return this.currentLayerName; }
  getPaletteVisible(): boolean { return this.paletteVisible; }
  getPlacementMode(): 'interactable' | 'afflicted' | null { return this.placementMode; }
  isPairActive(): boolean { return this.pairPhase !== 'idle'; }

  /**
   * Choosing a tile/color (palette, Q/E, wheel, color picker, color mode) is a
   * paint-intent action — leave Select mode so the choice is actually usable.
   * Rect/Fill are left alone: they legitimately use the selected tile.
   */
  private exitSelectForPaint(): void {
    if (this.activeTool === 'select') this.activeTool = 'paint';
  }

  /** Clear undo/redo history — call when loading a new room. */
  clearHistory(): void {
    this.history = [];
    this.historyIndex = -1;
  }
  
  update(input: InputState): void {
    this.weatherManager.update(this.scene.game.loop.delta);
    const pointer = this.scene.input.activePointer;
    const canvasDown = pointer.primaryDown && this.pointerDownOnCanvas;
    this.justDown = canvasDown && !this.wasPrimaryDown;
    const justDown = this.justDown;
    const justUp = !pointer.primaryDown && this.wasPrimaryDown;
    this.wasPrimaryDown = canvasDown;

    if (input.editor) {
      this.isActive = !this.isActive;
      this.editorText.setVisible(false); // status is shown in the DOM status bar
      this.tileCursor.setVisible(this.isActive);
      this.mapOutline.setVisible(this.isActive);
      this.doorHandles.setVisible(this.isActive);
      // Palette also hides when the editor closes; reopens on next P press.
      if (!this.isActive) {
        this.paletteVisible = false;
        this.editorUI?.setPaletteVisible(false);
        this.doorHandles.clear();
        this.selectedDoor = null;
        this.selectedDoorSpawn = null;
        this.colorMode = false;
        this.actualView = false;
        this.roomManager.setColorEditorDim(null); // restore full alpha for game view
      }

      this.updateLayerOpacities();
      this.updatePreview();
      this.redrawMapOutline();

      if (!this.isActive && this.selectedObject) {
        this.deselect();
      }
    }

    if (!this.isActive) return;

    // Actual-view freezes editing — it's a read-only in-game preview. Only the
    // toggle itself is processed so the user can flip back to editing.
    this.handleActualView();
    if (this.actualView) return;

    this.handleColorMode();
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
    this.redrawDoorHandles();
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

  private handleColorMode(): void {
    if (!Phaser.Input.Keyboard.JustDown(this.keys.K)) return;
    this.colorMode = !this.colorMode;
    if (this.colorMode) this.exitSelectForPaint(); // entering color = paint intent
    this.showToast(this.colorMode ? 'Color mode on  K to exit' : 'Tile mode');
    this.updatePreview();
  }

  /** Hold-to-preview: actual-view is on while `G` is held or the UI button is pressed. */
  private handleActualView(): void {
    const want = this.keys.G.isDown || this.actualViewHeld;
    if (want !== this.actualView) this.setActualView(want);
  }

  /** Called by the EditorUI button on press (true) / release (false). */
  public setActualViewHeld(held: boolean): void {
    this.actualViewHeld = held;
    this.handleActualView();
  }

  private setActualView(on: boolean): void {
    if (!this.isActive) return;
    this.actualView = on;
    // Hide editor chrome for a clean preview; restore it on exit.
    this.tileCursor.setVisible(!on);
    this.mapOutline.setVisible(!on);
    this.doorHandles.setVisible(!on);
    this.updateLayerOpacities(); // full alpha when on, dim when off (tiles + colors)
    const roomId = this.roomManager.getCurrentRoomId();
    if (on && roomId) {
      this.buildEdgeShadows();
      this.weatherManager.updateForRoom(roomId);
    } else {
      this.edgeShadows?.destroy();
      this.edgeShadows = undefined;
      this.weatherManager.destroy();
    }
    if (on) this.showToast('Actual view (hold)');
  }

  /** Called by EditorUI color picker — sets the overlay color and enters color mode. */
  public setCurrentColor(rgb: number): void {
    this.selectedColor = rgb;
    this.colorMode = true;
    this.exitSelectForPaint();
    this.updatePreview();
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
    if (Phaser.Input.Keyboard.JustDown(this.keys.M)) {
      this.activeTool = this.activeTool === 'select' ? 'paint' : 'select';
      this.showToast(this.activeTool === 'select' ? 'Tool: SELECT (no paint)' : 'Tool: PAINT');
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

  // â”€â”€ Door pairing (O key) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

    // Place-source: build source door in-memory, queue create-save, then warp
    // to the target room.
    if (this.pairPhase === 'place-source') {
      if (!this.pairTargetRoomId) { this.cancelPair(); return; }
      const sourceRoomId = this.roomManager.getCurrentRoomId();
      const sourceDoorId = this.generateUniqueDoorId(sourceRoomId);
      const targetDoorId = this.generateUniqueDoorId(this.pairTargetRoomId);
      const dir = this.inferEdgeDirection(tileX, tileY, mapW, mapH);
      const door = this.buildDoorRect(tileX, tileY, dir, T);

      const sourceDoor: DoorDefinition = {
        id: sourceDoorId,
        x: door.x, y: door.y,
        width: door.width, height: door.height,
        targetRoom: this.pairTargetRoomId,
        targetDoor: targetDoorId,
        direction: dir,
        spawnX: door.spawnX, spawnY: door.spawnY
      };

      if (!this.insertDoorInRoom(sourceRoomId, sourceDoor, 'source')) {
        this.cancelPair();
        return;
      }

      this.pairSource = { sourceRoomId, sourceDoorId, targetDoorId };
      this.pairPhase = 'place-target';
      const targetRoom = this.pairTargetRoomId;
      const scene = this.scene as any;
      if (typeof scene.warpToRoom === 'function') {
        scene.warpToRoom(targetRoom);
      }
      return;
    }

    // Place-target: build target door using the pre-generated cross-ref ids
    // and insert directly into room data.
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

      const targetDoor: DoorDefinition = {
        id: src.targetDoorId,
        x: door.x, y: door.y,
        width: door.width, height: door.height,
        targetRoom: src.sourceRoomId,
        targetDoor: src.sourceDoorId,
        direction: dir,
        spawnX: door.spawnX, spawnY: door.spawnY
      };

      if (!this.insertDoorInRoom(targetRoomId, targetDoor, 'target')) {
        this.cancelPair();
        return;
      }

      this.showToast(`Placed door pair ${src.sourceDoorId} <-> ${src.targetDoorId} — press X to save`);
      this.cancelPair();
    }
  }

  private generateUniqueDoorId(roomId: string): string {
    const room = this.roomManager.getRoomDef(roomId) as any;
    const existingIds = new Set(((room?.doors || []) as any[]).map(d => d?.id));
    let id = `door-${Math.random().toString(36).slice(2, 7)}`;
    while (existingIds.has(id)) {
      id = `door-${Math.random().toString(36).slice(2, 7)}`;
    }
    return id;
  }

  private insertDoorInRoom(roomId: string, newDoor: DoorDefinition, label: 'source' | 'target'): boolean {
    const data = RoomManager.getRoomsData();
    const room = data.rooms[roomId] as any;
    if (!room) {
      this.showToast(`Pairing failed: room "${roomId}" not found.`);
      return false;
    }
    if (!Array.isArray(room.doors)) room.doors = [];
    if (room.doors.some((d: any) => d?.id === newDoor.id)) {
      this.showToast(`Pairing failed: door id "${newDoor.id}" already exists in ${roomId}.`);
      return false;
    }

    room.doors.push(newDoor);

    const dirtyKey = `${roomId}:${newDoor.id}`;
    this.dirtyObjects.set(dirtyKey, {
      type: 'door',
      id: newDoor.id,
      x: newDoor.x,
      y: newDoor.y,
      spawnX: newDoor.spawnX,
      spawnY: newDoor.spawnY,
      create: true,
      width: newDoor.width,
      height: newDoor.height,
      targetRoom: newDoor.targetRoom,
      targetDoor: newDoor.targetDoor,
      direction: newDoor.direction,
      roomId
    });

    if (this.roomManager.getCurrentRoomId() === roomId) {
      const refreshPlaceholders = (this.scene as any).refreshEditorPlaceholders;
      if (typeof refreshPlaceholders === 'function') {
        refreshPlaceholders.call(this.scene);
      }
      this.redrawDoorHandles();
      this.showToast(`Placed ${label} door ${newDoor.id} — press X to save`);
    }
    return true;
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
      const room = this.roomManager.getCurrentRoomDef();
      if (!room) return;

      if (!Array.isArray(room.interactables)) room.interactables = [];

      const existingIds = new Set(room.interactables.map(i => i.id));
      let id = `inter-${rand}`;
      while (existingIds.has(id)) {
        id = `inter-${Math.random().toString(36).slice(2, 7)}`;
      }

      const interactable: InteractableDef = {
        id,
        x, y,
        type: 'sign',
        tileFrame: this.selectedTileIndex > 0 ? this.selectedTileIndex - 1 : 0,
        text: 'TODO: edit me',
        requires: []
      };
      room.interactables.push(interactable);

      const refreshPlaceholders = (this.scene as any).refreshEditorPlaceholders;
      if (typeof refreshPlaceholders === 'function') {
        refreshPlaceholders.call(this.scene);
      }

      const getInteractables = (this.scene as any).getInteractablePlaceholders;
      if (typeof getInteractables === 'function') {
        const sprites = getInteractables.call(this.scene) as Phaser.GameObjects.Sprite[];
        const placed = sprites.find(s => s.getData('def')?.id === id);
        if (placed) this.select(placed, 'interactable');
      }

      this.dirtyObjects.set(id, { type: 'interactable', id, x, y, create: true });

      this.showToast(`Placed ${id} — press X to save`);

      if (!import.meta.env.DEV) {
        const json = JSON.stringify(interactable, null, 2);
        this.copyAndToast(json, `Interactable added in-memory. DEV save endpoint unavailable.`);
      }

      this.placementMode = null;
      return;
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

  // â”€â”€ Tile palette (P key) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private handlePaletteToggle(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.P)) {
      this.paletteVisible = !this.paletteVisible;
      if (this.paletteVisible) this.exitSelectForPaint();
      this.editorUI?.setPaletteVisible(this.paletteVisible);
    }
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



  private redrawMapOutline(): void {
    if (!this.isActive) return;
    const map = this.roomManager.getMap();
    if (!map) return;
    const w = map.width * GAME_CONFIG.TILE_SIZE;
    const h = map.height * GAME_CONFIG.TILE_SIZE;
    this.mapOutline.clear();
    // Solid yellow outline at the room boundary
    this.mapOutline.lineStyle(4, 0xffff00, 0.9);
    this.mapOutline.strokeRect(0, 0, w, h);
    // Faint inner border one tile in, to reinforce the bound
    const inset = GAME_CONFIG.TILE_SIZE;
    this.mapOutline.lineStyle(4, 0xffff00, 0.25);
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
    try {
      const result = this.roomManager.resizeMap(newW, newH, offX, offY);
      if (!result) return;

      const scene = this.scene as any;
      if (typeof scene.refreshAfterResize === 'function') {
        scene.refreshAfterResize(result.pixelOffsetX, result.pixelOffsetY);
      }
      this.peekAtChangedEdge(oldW, oldH, newW, newH, offX, offY);
      console.log(`[Editor] Resized map ${oldW}x${oldH} -> ${newW}x${newH} (offset ${offX},${offY})`);
      this.pendingRoomSize = { width: newW, height: newH };
      this.tilemapDirty = true; // dimensions + tile data changed
      this.showToast(`Resized ${newW}×${newH} — press X to save`);
    } catch (err: any) {
      console.error('[Editor] Resize failed:', err);
      this.showToast(`Resize failed: ${err.message}`);
    }
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

  /** Returns the current editor status string for display in the DOM status bar. */
  public getStatusText(): string {
    const map = this.roomManager.getMap();
    const dims = map ? `${map.width}×${map.height}` : '?';
    if (this.actualView) {
      return `ACTUAL VIEW (in-game preview) — release G to resume editing  |  ${dims}`;
    }
    let ctx = '';
    if (this.placementMode) {
      ctx = `armed: ${this.placementMode}  (Esc cancel)`;
    } else if (this.pairPhase === 'pick-target') {
      ctx = 'pair: pick target room  (↑↓ Enter Esc)';
    } else if (this.pairPhase === 'place-source') {
      ctx = `pair: click source door  (target=${this.pairTargetRoomId})`;
    } else if (this.pairPhase === 'place-target') {
      ctx = `pair: click target door in ${this.pairTargetRoomId}`;
    }
    const tileInfo = this.colorMode
      ? `color #${this.selectedColor.toString(16).padStart(6, '0').toUpperCase()}`
      : `tile ${this.selectedTileIndex}`;
    const base = `${this.currentLayerName} · ${tileInfo} · ${this.activeTool} · ${dims}`;
    return ctx ? `${ctx}  |  ${base}` : base;
  }

  private updateHUD(): void {
    // Status text is now read by EditorScene and displayed in the DOM status bar.
    // editorText on the canvas is kept invisible; we still call updatePreview so
    // the tile thumbnail stays in sync.
    this.updatePreview();
  }
  
  private handleSelection(justDown: boolean): void {
    const pointer = this.scene.input.activePointer;

    if (justDown && !this.selectedObject && !this.selectedDoor && !this.selectedDoorSpawn) {
      const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
      const T = GAME_CONFIG.TILE_SIZE;
      const spawnRadius = Math.max(4, Math.floor(T / 4));

      // 0. Check door spawn handles first (small circle at spawnX/spawnY)
      for (const zone of this.roomManager.getDoorZones()) {
        const doorDef = zone.getData('doorDef') as { id?: string; spawnX?: number; spawnY?: number } | undefined;
        const spawnX = doorDef?.spawnX;
        const spawnY = doorDef?.spawnY;
        if (typeof spawnX !== 'number' || typeof spawnY !== 'number') continue;
        const dist = Phaser.Math.Distance.Between(worldPoint.x, worldPoint.y, spawnX, spawnY);
        if (dist <= spawnRadius + 4) {
          this.selectedDoorSpawn = { zone, doorId: doorDef?.id ?? '' };
          this.dragOffset.set(worldPoint.x - spawnX, worldPoint.y - spawnY);
          return;
        }
      }

      // 1. Check Afflicted
      const afflictedGroup = (this.scene as any).afflictedGroup as Phaser.GameObjects.Group;
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

      // 2. Check Interactables (placeholder sprites exposed by EditorScene)
      const getInteractables = (this.scene as any).getInteractablePlaceholders;
      if (typeof getInteractables === 'function') {
        const sprites = getInteractables.call(this.scene) as Phaser.GameObjects.Sprite[];
        const hit = sprites.find(s =>
          Phaser.Geom.Rectangle.Contains(s.getBounds(), worldPoint.x, worldPoint.y));
        if (hit) {
          this.select(hit, 'interactable');
          return;
        }
      }

      // 3. Check door zones (grab handle is 16×16 at zone center)
      for (const zone of this.roomManager.getDoorZones()) {
        const body = zone.body as Phaser.Physics.Arcade.StaticBody;
        if (Phaser.Geom.Rectangle.Contains(
          new Phaser.Geom.Rectangle(body.x, body.y, body.width, body.height),
          worldPoint.x, worldPoint.y
        )) {
          const doorDef = zone.getData('doorDef') as any;
          this.selectedDoor = { zone, doorId: doorDef?.id ?? '' };
          this.dragOffset.set(worldPoint.x - zone.x, worldPoint.y - zone.y);
          return;
        }
      }
    }
  }

  private handleDragging(justUp: boolean): void {
    const pointer = this.scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;

    // Afflicted / interactable drag — drop deselects so the next object is
    // immediately grabbable (doors already auto-deselect in releaseDoorDrag).
    if (this.selectedObject) {
      if (pointer.primaryDown) {
        this.selectedObject.sprite.x = worldPoint.x - this.dragOffset.x;
        this.selectedObject.sprite.y = worldPoint.y - this.dragOffset.y;
      } else {
        if (justUp) {
          this.logObjectSnippet();
          this.deselect();
        }
      }
      if (this.keys.ESC.isDown) this.deselect();
    }

    // Door drag — free placement, lands exactly where released (no grid snap).
    if (this.selectedDoor) {
      if (pointer.primaryDown) {
        const cx = worldPoint.x - this.dragOffset.x;
        const cy = worldPoint.y - this.dragOffset.y;
        this.selectedDoor.zone.setPosition(cx, cy);
        const body = this.selectedDoor.zone.body as Phaser.Physics.Arcade.StaticBody;
        body.reset(cx - body.width / 2, cy - body.height / 2);
      } else {
        if (justUp) this.releaseDoorDrag();
      }
      if (this.keys.ESC.isDown) this.selectedDoor = null;
    }

    // Door spawn drag — direct spawn handle placement.
    if (this.selectedDoorSpawn) {
      if (pointer.primaryDown) {
        const spawnX = worldPoint.x - this.dragOffset.x;
        const spawnY = worldPoint.y - this.dragOffset.y;
        const { zone, doorId } = this.selectedDoorSpawn;
        const roomId = this.roomManager.getCurrentRoomId();
        const data = RoomManager.getRoomsData();
        const room = data.rooms[roomId];
        if (!room) {
          this.selectedDoorSpawn = null;
          return;
        }
        const door = (room.doors || []).find((d: any) => d.id === doorId) as any;
        if (!door) {
          this.selectedDoorSpawn = null;
          return;
        }
        door.spawnX = Math.round(spawnX);
        door.spawnY = Math.round(spawnY);
        zone.setData('doorDef', { ...(zone.getData('doorDef') || {}), spawnX: door.spawnX, spawnY: door.spawnY });
      } else {
        if (justUp) this.releaseDoorSpawnDrag();
      }
      if (this.keys.ESC.isDown) this.selectedDoorSpawn = null;
    }
  }

  // â”€â”€ Door dragging â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private redrawDoorHandles(): void {
    this.doorHandles.clear();
    if (!this.isActive) return;
    const T = GAME_CONFIG.TILE_SIZE;
    for (const zone of this.roomManager.getDoorZones()) {
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      const isDragging = this.selectedDoor?.zone === zone;
      const isDraggingSpawn = this.selectedDoorSpawn?.zone === zone;
      const doorDef = zone.getData('doorDef') as { spawnX?: number; spawnY?: number } | undefined;
      // Outer square
      this.doorHandles.lineStyle(4, isDragging ? 0xffffff : 0x00ffff, isDragging ? 1 : 0.7);
      this.doorHandles.strokeRect(body.x, body.y, body.width, body.height);
      // Cross-hair so it's obvious the handle is clickable
      const cx = body.x + body.width / 2;
      const cy = body.y + body.height / 2;
      this.doorHandles.lineBetween(cx - T / 4, cy, cx + T / 4, cy);
      this.doorHandles.lineBetween(cx, cy - T / 4, cx, cy + T / 4);

      const spawnX = doorDef?.spawnX;
      const spawnY = doorDef?.spawnY;
      if (typeof spawnX === 'number' && typeof spawnY === 'number') {
        // Link door zone center to spawn point so transition geometry is visible.
        this.doorHandles.lineStyle(2, (isDragging || isDraggingSpawn) ? 0xff99ff : 0xff00ff, (isDragging || isDraggingSpawn) ? 1 : 0.8);
        this.doorHandles.lineBetween(cx, cy, spawnX, spawnY);
        // Spawn marker (filled + outline) for quick targeting while editing.
        this.doorHandles.fillStyle(0xff00ff, (isDragging || isDraggingSpawn) ? 0.9 : 0.7);
        this.doorHandles.fillCircle(spawnX, spawnY, Math.max(4, Math.floor(T / 4)));
        this.doorHandles.lineStyle(2, isDraggingSpawn ? 0xffffff : 0xff66ff, 1);
        this.doorHandles.strokeCircle(spawnX, spawnY, Math.max(4, Math.floor(T / 4)));
      }
    }
  }

  private releaseDoorSpawnDrag(): void {
    if (!this.selectedDoorSpawn) return;
    const { zone, doorId } = this.selectedDoorSpawn;
    const roomId = this.roomManager.getCurrentRoomId();
    const data = RoomManager.getRoomsData();
    const room = data.rooms[roomId];
    if (!room) { this.selectedDoorSpawn = null; return; }
    const door = (room.doors || []).find((d: any) => d.id === doorId) as any;
    if (door) {
      door.spawnX = Math.round(door.spawnX ?? zone.x);
      door.spawnY = Math.round(door.spawnY ?? zone.y);
      zone.setData('doorDef', { ...(zone.getData('doorDef') || {}), spawnX: door.spawnX, spawnY: door.spawnY });
      this.dirtyObjects.set(doorId, {
        type: 'door', id: doorId,
        x: Math.round(door.x ?? (zone.body as Phaser.Physics.Arcade.StaticBody).x),
        y: Math.round(door.y ?? (zone.body as Phaser.Physics.Arcade.StaticBody).y),
        spawnX: door.spawnX, spawnY: door.spawnY,
      });
      this.showToast(`Moved door spawn ${doorId} — press X to save`);
    }
    this.selectedDoorSpawn = null;
  }

  private releaseDoorDrag(): void {
    if (!this.selectedDoor) return;
    const { zone, doorId } = this.selectedDoor;
    const body = zone.body as Phaser.Physics.Arcade.StaticBody;
    const roomId = this.roomManager.getCurrentRoomId();
    const data = RoomManager.getRoomsData();
    const room = data.rooms[roomId];
    if (!room) { this.selectedDoor = null; return; }
    const door = (room.doors || []).find((d: any) => d.id === doorId);
    if (door) {
      // Exact placement — no tile snap. Spawn is offset one tile out from the
      // door's far edge along its direction (matches buildDoorRect's geometry).
      const T = GAME_CONFIG.TILE_SIZE;
      const w = body.width, h = body.height;
      const cx = body.x + w / 2, cy = body.y + h / 2;
      const dir = (door as any).direction ?? 'up';
      let spawnX = cx, spawnY = cy;
      if (dir === 'up')    { spawnY = body.y + h + T; spawnX = cx; }
      if (dir === 'down')  { spawnY = body.y - T;     spawnX = cx; }
      if (dir === 'left')  { spawnX = body.x + w + T; spawnY = cy; }
      if (dir === 'right') { spawnX = body.x - T;     spawnY = cy; }
      // Update the in-memory door (a live reference into rooms.json) and queue
      // it for disk save on X — same flow as interactables/afflicted.
      (door as any).x = Math.round(body.x);
      (door as any).y = Math.round(body.y);
      (door as any).spawnX = Math.round(spawnX);
      (door as any).spawnY = Math.round(spawnY);
      this.dirtyObjects.set(doorId, {
        type: 'door', id: doorId,
        x: (door as any).x, y: (door as any).y,
        spawnX: (door as any).spawnX, spawnY: (door as any).spawnY,
      });
      this.showToast(`Moved door ${doorId} — press X to save`);
    }
    this.selectedDoor = null;
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
      this.currentLayerName = LAYER_NAMES.GROUND;
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) {
      this.roomManager.ensureOnGroundLayer();
      this.currentLayerName = LAYER_NAMES.ON_GROUND;
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) {
      this.currentLayerName = LAYER_NAMES.COLLISION;
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) {
      this.roomManager.ensureOnCollisionLayer();
      this.currentLayerName = LAYER_NAMES.ON_COLLISION;
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.FIVE)) {
      this.currentLayerName = LAYER_NAMES.ABOVE;
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SIX)) {
      this.roomManager.ensureOnAboveLayer();
      this.currentLayerName = LAYER_NAMES.ON_ABOVE;
      layerChanged = true;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.SEVEN)) {
      this.roomManager.ensureSpectraLayer();
      this.currentLayerName = LAYER_NAMES.SPECTRA;
      layerChanged = true;
    }

    if (layerChanged) {
      this.updateLayerOpacities();
    }

    // Q/E cycle tile index — and always snap back to tile mode (skip while
    // arming an afflicted, where Q/E cycles the variant instead).
    if (this.placementMode !== 'afflicted') {
      if (input.drop) { // Q
        this.colorMode = false;
        this.exitSelectForPaint();
        this.selectedTileIndex = Math.max(1, this.selectedTileIndex - 1);
        this.updatePreview();
        this.editorUI?.updatePaletteHighlight([[this.selectedTileIndex]]);
      }
      if (input.action) { // E
        this.colorMode = false;
        this.exitSelectForPaint();
        this.selectedTileIndex = Math.min(this.selectedTileIndex + 1, this.maxTileIndex());
        this.updatePreview();
        this.editorUI?.updatePaletteHighlight([[this.selectedTileIndex]]);
      }
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

    map.fill(FLOOR, 0, 0, w, h, false, LAYER_NAMES.GROUND);
    map.fill(-1, 0, 0, w, h, false, LAYER_NAMES.ABOVE);
    map.fill(WALL, 0, 0, w, h, false, LAYER_NAMES.COLLISION);
    if (w > 2 && h > 2) {
      map.fill(-1, 1, 1, w - 2, h - 2, false, LAYER_NAMES.COLLISION);
    }
    this.refreshCollision();
    this.roomManager.clearAllColorTiles();
    this.tilemapDirty = true;
    this.showToast('Room stamped: floor + perimeter walls. Git to undo.');
  }

  private buildExportData(): any {
    const map = this.roomManager.getMap();
    if (!map) return null;
    const exportData: any = {
      compressionlevel: -1,
      height: map.height,
      infinite: false,
      layers: map.layers.map((layer, index) => {
        const data = layer.data.flat().map(tile => {
          if (!tile || tile.index === -1) return 0;
          if (tile.index >= 0x01000000) return 0; // safety: strip any stale color-tile GIDs
          return tile.index;
        });
        console.log(`[Editor] Exporting layer ${layer.name}: ${data.filter(d => d !== 0).length} non-zero tiles.`);
        return {
          data,
          height: layer.height,
          id: index + 1,
          name: layer.name,
          opacity: 1,
          type: 'tilelayer',
          visible: true,
          width: layer.width,
          x: 0,
          y: 0
        };
      }),
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

    // Persist color tiles as a side-channel key (Phaser ignores unknown keys;
    // layer `data` arrays stay valid Tiled GIDs). Omit when empty.
    const colorTiles = this.roomManager.getColorTilesData();
    if (Object.keys(colorTiles).length) {
      exportData.colorTiles = colorTiles;
    }

    return exportData;
  }

  private async exportTilemap(): Promise<void> {
    const roomId = this.roomManager.getCurrentRoomId();

    if (!import.meta.env.DEV) {
      const exportData = this.buildExportData();
      if (!exportData) return;
      const path = `public/assets/tilemaps/${roomId}.json`;
      const json = JSON.stringify(exportData, null, 2);
      console.log(`[Editor] Tilemap JSON for ${path}:\n`, exportData);
      this.copyAndToast(json, `Tilemap copied. Paste into:\n${path}`);
      return;
    }

    const hadObjects = this.dirtyObjects.size > 0 || this.pendingRoomSize !== null;

    // Object positions / room size write src/data/rooms.json, which is
    // watch-ignored (no reload). Do these first and await them — both so they
    // finish before any tilemap reload, and so concurrent writes don't clobber
    // each other in the read-modify-write endpoint.
    await this.flushDirtyState(roomId);

    if (this.tilemapDirty) {
      const exportData = this.buildExportData();
      if (exportData) {
        this.tilemapDirty = false;
        // Writes public/ → triggers a Vite full reload. Done last.
        await this.saveTilemapToDisk(roomId, exportData);
      }
    } else if (hadObjects) {
      this.showToast('Saved object positions.');
    } else {
      this.showToast('Nothing to save.');
    }
  }

  private async saveRoomSizeToDisk(roomId: string, width: number, height: number): Promise<void> {
    try {
      const resp = await fetch('/__editor/save-room-size', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, width, height })
      });
      const result = await resp.json();
      if (!result.ok) throw new Error(result.error || 'Unknown error');
      this.showToast(`Room size saved: ${width}×${height}`);
    } catch (err: any) {
      console.error('[Editor] Room size save failed:', err);
      this.showToast(`Room size save failed: ${err.message}`);
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

  private async flushDirtyState(roomId: string): Promise<void> {
    // Await sequentially: the endpoint does a read-modify-write on rooms.json,
    // so concurrent saves would clobber each other.
    if (this.pendingRoomSize) {
      const { width, height } = this.pendingRoomSize;
      await this.saveRoomSizeToDisk(roomId, width, height);
      this.pendingRoomSize = null;
    }
    for (const entry of this.dirtyObjects.values()) {
      await this.saveObjectToDisk(entry);
    }
    this.dirtyObjects.clear();
  }

  public clearDirtyState(): void {
    this.pendingRoomSize = null;
    // Preserve cross-room door creates while pairing (source room -> warp target).
    // EditorScene reload clears dirty state on room change, so without this the
    // first half of a newly created pair would be dropped before save.
    this.dirtyObjects = new Map(
      [...this.dirtyObjects.entries()].filter(([, entry]) =>
        entry.type === 'door' && entry.create === true && typeof entry.roomId === 'string'
      )
    );
    this.tilemapDirty = false;
  }

  private handleTilePainting(): void {
    const pointer = this.scene.input.activePointer;
    const map = this.roomManager.getMap();
    if (!map) {
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
    const tw = map.tileWidth * (map.layers[0]?.tilemapLayer?.scaleX || 1);
    const th = map.tileHeight * (map.layers[0]?.tilemapLayer?.scaleY || 1);
    const rows = this.selectedTiles.length;
    const cols = this.selectedTiles[0].length;
    this.tileCursor.setVisible(true);
    this.tileCursor.clear();

    if (this.activeTool === 'select') {
      // Select mode: a single-cell green outline signals "no painting".
      this.tileCursor.lineStyle(4, 0x44ff88, 0.9);
      this.tileCursor.strokeRect(tileX * tw, tileY * th, tw, th);
    } else {
      this.tileCursor.lineStyle(4, this.colorMode ? this.selectedColor : 0xffff00, 0.8);
      // Draw cursor for multi-tile selection
      this.tileCursor.strokeRect(tileX * tw, tileY * th, tw * cols, th * rows);
    }

    if (this.selectedObject) return; // Don't paint while dragging

    // Eyedropper: Middle Click or Alt + Left Click. Works in all tool modes.
    const isAlt = this.keys.ALT.isDown;
    if (pointer.middleButtonDown() || (pointer.leftButtonDown() && isAlt)) {
      const colorAt = this.roomManager.getColorTile(this.currentLayerName, tileX, tileY);
      const tile = map.getTileAt(tileX, tileY, true, this.currentLayerName);
      const tileIdx = (tile && tile.index !== -1) ? tile.index : null;
      const pickColor = () => { this.colorMode = true; this.selectedColor = colorAt!; };
      const pickTile  = () => { this.colorMode = false; this.selectedTileIndex = tileIdx!; };
      if (this.colorMode) {
        if (colorAt !== undefined) pickColor();
        else if (tileIdx !== null) pickTile();
      } else {
        if (tileIdx !== null) pickTile();
        else if (colorAt !== undefined) pickColor();
      }
      this.updatePreview();
      this.editorUI?.updatePaletteHighlight([[this.selectedTileIndex]]);
      return;
    }

    if (this.activeTool !== 'paint') return; // paint/erase only in paint mode

    let changed = false;

    // Left Click: Paint (only if NOT alt, and only if press originated on canvas)
    if (pointer.leftButtonDown() && this.pointerDownOnCanvas) {
      if (this.colorMode) {
        // Color paint: delegate to RoomManager (persistent, never touches tilemap data)
        this.roomManager.setColorTile(this.currentLayerName, tileX, tileY, this.selectedColor);
        this.tilemapDirty = true;
      } else {
        if (this.justDown) {
          this.pushHistory();
        }
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const tx = tileX + c;
            const ty = tileY + r;
            if (tx >= map.width || ty >= map.height) continue;

            const safeIndex = this.selectedTiles[r][c];
            const currentTile = map.getTileAt(tx, ty, true, this.currentLayerName);
            // currentTile is null when the slot was fully erased (removeTileAt with replaceWithNull=true).
            if (!currentTile || currentTile.index !== safeIndex) {
              if (safeIndex <= 0) {
                if (currentTile && currentTile.index !== -1) {
                  map.removeTileAt(tx, ty, true, true, this.currentLayerName);
                  changed = true;
                }
              } else {
                try {
                  map.putTileAt(safeIndex, tx, ty, true, this.currentLayerName);
                  // A real tile replaces any color in this cell (mutually exclusive).
                  this.roomManager.clearColorTile(this.currentLayerName, tx, ty);
                  changed = true;
                } catch (e) {
                  console.warn('[Editor] putTileAt failed', { safeIndex, tx, ty, layer: this.currentLayerName, err: e });
                }
              }
            }
          }
        }
      }
    }

    // Right Click: Erase
    if (pointer.rightButtonDown()) {
      if (this.colorMode) {
        this.roomManager.clearColorTile(this.currentLayerName, tileX, tileY);
        this.tilemapDirty = true;
      } else {
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
            // Erase clears a color cell too, regardless of mode.
            if (this.roomManager.getColorTile(this.currentLayerName, tx, ty) !== undefined) {
              this.roomManager.clearColorTile(this.currentLayerName, tx, ty);
              this.tilemapDirty = true;
            }
          }
        }
      }
    }

    if (changed) {
      this.tilemapDirty = true;
      if (this.currentLayerName === LAYER_NAMES.COLLISION || this.currentLayerName === LAYER_NAMES.ON_COLLISION) {
        this.refreshCollision();
      }
    }
  }

  private refreshCollision(): void {
    // Only the Collision layer blocks movement; OnCollision is decorative.
    const collisionLayer = this.roomManager.getCollisionLayer();
    if (collisionLayer) collisionLayer.setCollisionByExclusion([-1]);
  }
  private async saveObjectToDisk(entry: {
    type: 'afflicted' | 'interactable' | 'door';
    id: string; x: number; y: number; spawnX?: number; spawnY?: number; create?: boolean;
    width?: number; height?: number;
    targetRoom?: string; targetDoor?: string; direction?: string;
    roomId?: string;
  }): Promise<void> {
    if (!import.meta.env.DEV) return;
    const roomId = entry.roomId ?? this.roomManager.getCurrentRoomId();
    try {
      const resp = await fetch('/__editor/save-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId, kind: entry.type, id: entry.id, x: entry.x, y: entry.y,
          spawnX: entry.spawnX, spawnY: entry.spawnY,
          mode: entry.create ? 'create' : 'update',
          width: entry.width, height: entry.height,
          targetRoom: entry.targetRoom, targetDoor: entry.targetDoor, direction: entry.direction,
        })
      });
      const result = await resp.json();
      if (!result.ok) throw new Error(result.error || 'Unknown error');
      this.showToast(entry.create
        ? `Saved new ${entry.type} "${entry.id}".`
        : `Saved ${entry.type} "${entry.id}" position.`);
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

    // Update the in-memory def (a live reference into rooms.json) so the editor
    // reflects the new position immediately, even without a page reload.
    if (this.selectedObject.originalData) {
      this.selectedObject.originalData.x = x;
      this.selectedObject.originalData.y = y;
    }

    this.dirtyObjects.set(id, { type, id, x, y });
    this.showToast(`Moved ${id} — press X to save`);
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
    const onGround = this.roomManager.getOnGroundLayer();
    const collision = this.roomManager.getCollisionLayer();
    const onCollision = this.roomManager.getOnCollisionLayer();
    const above = this.roomManager.getAboveLayer();
    const onAbove = this.roomManager.getOnAboveLayer();
    const spectra = this.roomManager.getSpectraLayer();

    const layerMap: Record<string, Phaser.Tilemaps.TilemapLayer | null> = {
      [LAYER_NAMES.GROUND]: ground,
      [LAYER_NAMES.ON_GROUND]: onGround,
      [LAYER_NAMES.COLLISION]: collision,
      [LAYER_NAMES.ON_COLLISION]: onCollision,
      [LAYER_NAMES.ABOVE]: above,
      [LAYER_NAMES.ON_ABOVE]: onAbove,
      [LAYER_NAMES.SPECTRA]: spectra,
    };

    // In actual-view (or when the editor is closed), layers get game-accurate
    // alphas; otherwise the active layer is full alpha and the rest are dimmed.
    const showAll = !this.isActive || this.actualView;
    const room = this.roomManager.getCurrentRoomDef();

    if (showAll) {
      // Game-accurate alphas: OnGround uses its configured value; Spectra is
      // always hidden (revealed at runtime only with flashlight + spectra-adapter).
      const gameAlpha: Record<string, number> = {
        [LAYER_NAMES.GROUND]:       1,
        [LAYER_NAMES.ON_GROUND]:    room?.onGroundAlpha    ?? LAYER_CONFIG.ON_GROUND_DEFAULT_ALPHA,
        [LAYER_NAMES.COLLISION]:    1,
        [LAYER_NAMES.ON_COLLISION]: room?.onCollisionAlpha ?? LAYER_CONFIG.ON_COLLISION_DEFAULT_ALPHA,
        [LAYER_NAMES.ABOVE]:        1,
        [LAYER_NAMES.ON_ABOVE]:     room?.onAboveAlpha     ?? LAYER_CONFIG.ON_ABOVE_DEFAULT_ALPHA,
        [LAYER_NAMES.SPECTRA]:      0,
      };
      for (const [name, layer] of Object.entries(layerMap)) {
        layer?.setAlpha(gameAlpha[name] ?? 1);
      }

      // Darkness hint: a semi-transparent black overlay to approximate the
      // DarknessOverlay when previewing a dark room in actual-view mode.
      const isDark = this.actualView && room?.dark === true;
      const darkAlpha = isDark ? (room?.darkLevel ?? DARKNESS_CONFIG.DEFAULT_LEVEL) : 0;
      this.darknessHint.setVisible(isDark).setAlpha(darkAlpha);
    } else {
      this.darknessHint.setVisible(false);

      [ground, onGround, collision, onCollision, above, onAbove, spectra].forEach(layer => {
        if (!layer) return;
        const activeLayer = layerMap[this.currentLayerName];
        if (layer === activeLayer) {
          layer.setAlpha(1);
        } else {
          let layerName: string | undefined;
          for (const [name, obj] of Object.entries(layerMap)) {
            if (obj === layer) { layerName = name; break; }
          }

          let baseAlpha = 1.0;
          if (layerName === LAYER_NAMES.ON_GROUND)    baseAlpha = room?.onGroundAlpha    ?? LAYER_CONFIG.ON_GROUND_DEFAULT_ALPHA;
          if (layerName === LAYER_NAMES.ON_COLLISION) baseAlpha = room?.onCollisionAlpha ?? LAYER_CONFIG.ON_COLLISION_DEFAULT_ALPHA;
          if (layerName === LAYER_NAMES.ON_ABOVE)     baseAlpha = room?.onAboveAlpha     ?? LAYER_CONFIG.ON_ABOVE_DEFAULT_ALPHA;

          layer.setAlpha(baseAlpha * LAYER_CONFIG.EDITOR_INACTIVE_ALPHA);
        }
      });
    }

    // Mirror the dimming onto the color overlays (null = full alpha).
    this.roomManager.setColorEditorDim(showAll ? null : this.currentLayerName);
  }

  private buildEdgeShadows(): void {
    this.edgeShadows?.destroy();
    this.edgeShadows = undefined;

    const map = this.roomManager.getMap();
    const collisionLayer = this.roomManager.getCollisionLayer();
    if (!map || !collisionLayer) return;

    const TILE = GAME_CONFIG.TILE_SIZE;
    const rt = this.scene.add.renderTexture(0, 0, map.width * TILE, map.height * TILE);
    rt.setOrigin(0, 0).setDepth(DEPTH.GROUND + 0.5).setAlpha(0.6);

    const layerData = collisionLayer.layer.data;
    for (let ty = 0; ty < map.height; ty++) {
      for (let tx = 0; tx < map.width; tx++) {
        const tile = layerData[ty]?.[tx];
        if (!tile || tile.index <= 0) continue;
        let owningTs = map.tilesets[0];
        for (const ts of map.tilesets) {
          if (ts.firstgid <= tile.index) owningTs = ts;
        }
        if (!owningTs) continue;
        const img = this.scene.make.image({ x: 0, y: 0, key: tilesetSpritesheetKey(owningTs.name), frame: tile.index - owningTs.firstgid, add: false });
        img.setTint(0x000000).setOrigin(0, 0);
        rt.draw(img, tx * TILE, ty * TILE);
        img.destroy();
      }
    }

    try {
      rt.postFX.addShadow(3, -3, 0.006, 1, 0x000000, 15, 0.5);
      rt.postFX.addBlur(100, 20, 20, 0.2, 0x000000, 5);
    } catch (e) {
      console.warn('[Editor] postFX unavailable, edge shadows will render without blur:', e);
    }

    this.edgeShadows = rt;
  }

  /** Call when the active room changes so actual-view atmosphere and palette stay accurate. */
  public onRoomChanged(): void {
    this.updateLayerOpacities();
    if (this.actualView) {
      this.buildEdgeShadows();
      const roomId = this.roomManager.getCurrentRoomId();
      if (roomId) this.weatherManager.updateForRoom(roomId);
    }
    const map = this.roomManager.getMap();
    if (map?.tilesets) {
      this.editorUI?.buildPalette(map.tilesets);
      this.editorUI?.updatePaletteHighlight([[this.selectedTileIndex]]);
    }
  }

  /**
   * Preview is rendered in the DOM right panel now (EditorUI.setPreview), pulled
   * each frame via getPreviewState(). Kept as a no-op so the many call sites that
   * nudge "the preview changed" remain valid without extra plumbing.
   */
  private updatePreview(): void { /* see getPreviewState() + EditorUI.setPreview() */ }

  /** Current selection as a renderable preview for the DOM panel. */
  public getPreviewState(): EditorPreviewState {
    if (!this.isActive) return { kind: 'none' };
    if (this.colorMode) return { kind: 'color', rgb: this.selectedColor };

    const gid = this.selectedTileIndex;
    if (gid > 0) {
      // Resolve which tileset owns this GID and compute its local frame.
      const map = this.roomManager.getMap();
      const tilesets = map?.tilesets ?? [];
      let owningTs = tilesets[0];
      for (const ts of tilesets) {
        if (ts.firstgid <= gid) owningTs = ts;
      }
      const frame = owningTs ? gid - owningTs.firstgid : gid - 1;
      const textureKey = tilesetSpritesheetKey(owningTs?.name ?? 'tileset');
      return { kind: 'tile', textureKey, frame, gid };
    }
    return { kind: 'tile', textureKey: 'tileset-sprites', frame: 0, gid: 0 };
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
    if (this.historyIndex < 0) {
      this.showToast('Nothing to undo');
      return;
    }

    // history[historyIndex] is the pre-action snapshot; restore it then step back.
    this.applyHistoryState(this.history[this.historyIndex]);
    this.historyIndex--;
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

  private applyHistoryState(state: { layer: LayerName, data: number[][] }): void {
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

    if (state.layer === LAYER_NAMES.COLLISION || state.layer === LAYER_NAMES.ON_COLLISION) {
      this.refreshCollision();
    }
    this.tilemapDirty = true;
    this.updateLayerOpacities();
  }

  private handleFloodFill(): void {
    if (this.activeTool !== 'fill') return;
    if (!this.justDown) return;

    const map = this.roomManager.getMap();
    if (!map) return;

    const pointer = this.scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const tileX = map.worldToTileX(worldPoint.x);
    const tileY = map.worldToTileY(worldPoint.y);
    if (tileX === null || tileY === null) return;

    if (pointer.rightButtonDown()) {
      // Right-click flood-erase: clear color tile or remove tile at region.
      if (this.colorMode) {
        const layerName = this.currentLayerName;
        const targetColor = this.roomManager.getColorTile(layerName, tileX, tileY);
        if (targetColor === undefined) return;
        const stack: Array<[number, number]> = [[tileX, tileY]];
        const visited = new Set<string>();
        let count = 0;
        while (stack.length > 0) {
          const [x, y] = stack.pop()!;
          if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
          const key = `${x},${y}`;
          if (visited.has(key)) continue;
          visited.add(key);
          if (this.roomManager.getColorTile(layerName, x, y) !== targetColor) continue;
          this.roomManager.clearColorTile(layerName, x, y);
          count++;
          stack.push([x-1, y], [x+1, y], [x, y-1], [x, y+1]);
        }
        if (count > 0) this.tilemapDirty = true;
        this.showToast(`Color flood erase: ${count} tiles`);
      } else {
        // Tile flood-erase: treat as flood fill with empty (selectedTileIndex = 0).
        const savedIndex = this.selectedTileIndex;
        this.selectedTileIndex = 0;
        this.executeFloodFill(tileX, tileY);
        this.selectedTileIndex = savedIndex;
      }
      return;
    }

    this.executeFloodFill(tileX, tileY);
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

    const justDown = pointer.primaryDown && this.pointerDownOnCanvas && !this.wasPrimaryDown;
    const isDown = pointer.primaryDown && this.pointerDownOnCanvas;

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
    this.rectGraphics.lineStyle(8, 0xffff00, 1);
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

    const count = (endX - startX + 1) * (endY - startY + 1);

    if (this.colorMode) {
      for (let y = startY; y <= endY; y++) {
        for (let x = startX; x <= endX; x++) {
          this.roomManager.setColorTile(this.currentLayerName, x, y, this.selectedColor);
        }
      }
      this.tilemapDirty = true;
      this.showToast(`Color rect: ${count} tiles`);
      return;
    }

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
        this.roomManager.clearColorTile(layer, x, y); // tile replaces color
        changed = true;
      }
    }

    if (changed) {
      this.tilemapDirty = true;
      if (layer === LAYER_NAMES.COLLISION || layer === LAYER_NAMES.ON_COLLISION) this.refreshCollision();
      this.showToast(`Rect filled ${count} tiles`);
    }
  }

  private executeFloodFill(startX: number, startY: number): void {
    const map = this.roomManager.getMap();
    if (!map) return;

    if (this.colorMode) {
      const layerName = this.currentLayerName;
      const targetColor = this.roomManager.getColorTile(layerName, startX, startY);
      const fillColor = this.selectedColor;
      if (targetColor === fillColor) return;

      // When starting on a colorless cell, use the tile index as the fill boundary
      // so we don't spread across the entire layer (all colorless cells share undefined).
      const startTileIndex = targetColor === undefined
        ? (map.getTileAt(startX, startY, true, layerName)?.index ?? -1)
        : null;

      const stack: Array<[number, number]> = [[startX, startY]];
      const visited = new Set<string>();
      let count = 0;
      while (stack.length > 0) {
        const [x, y] = stack.pop()!;
        if (x < 0 || x >= map.width || y < 0 || y >= map.height) continue;
        const key = `${x},${y}`;
        if (visited.has(key)) continue;
        visited.add(key);
        if (this.roomManager.getColorTile(layerName, x, y) !== targetColor) continue;
        if (startTileIndex !== null) {
          const cellIndex = map.getTileAt(x, y, true, layerName)?.index ?? -1;
          if (cellIndex !== startTileIndex) continue;
        }
        this.roomManager.setColorTile(layerName, x, y, fillColor);
        count++;
        stack.push([x-1, y], [x+1, y], [x, y-1], [x, y+1]);
      }
      if (count > 0) this.tilemapDirty = true;
      this.showToast(`Color flood: ${count} tiles`);
      return;
    }

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
        this.roomManager.clearColorTile(layer, x, y); // tile replaces color
        count++;

        if (x > 0) stack.push([x - 1, y]);
        if (x < map.width - 1) stack.push([x + 1, y]);
        if (y > 0) stack.push([x, y - 1]);
        if (y < map.height - 1) stack.push([x, y + 1]);
      }
    }

    if (count > 0) {
      this.tilemapDirty = true;
      if (layer === LAYER_NAMES.COLLISION || layer === LAYER_NAMES.ON_COLLISION) this.refreshCollision();
    }
    this.showToast(`Filled ${count} tiles`);
  }
  private onWheel(_pointer: Phaser.Input.Pointer, _over: unknown[], _dx: number, dy: number): void {
    if (!this.isActive || !this.paletteVisible) return;
    this.colorMode = false;
    this.exitSelectForPaint();
    if (dy > 0) {
      this.selectedTileIndex = Math.min(this.selectedTileIndex + 1, this.maxTileIndex());
    } else if (dy < 0) {
      this.selectedTileIndex = Math.max(1, this.selectedTileIndex - 1);
    }
    this.updatePreview();
    this.editorUI?.updatePaletteHighlight([[this.selectedTileIndex]]);
  }

  destroy(): void {
    this.scene.input.off('wheel', this.onWheel, this);
    this.deselect();
    this.selectedDoor = null;
    this.selectedDoorSpawn = null;
    this.toastTween?.stop();
    this.editorText?.destroy();
    this.tileCursor?.destroy();
    this.mapOutline?.destroy();
    this.doorHandles?.destroy();
    this.toastText?.destroy();
    this.darknessHint?.destroy();
    this.edgeShadows?.destroy();
    this.weatherManager?.destroy();
    this.pairPickerContainer?.destroy();
  }

  public setEditorUI(ui: EditorUI): void {
    this.editorUI = ui;
    ui.onTileSelected = (gids, _first) => {
      this.selectedTiles = gids;
      this.colorMode = false;
      this.exitSelectForPaint();
      this.updatePreview();
    };
    const map = this.roomManager.getMap();
    if (map?.tilesets?.length) {
      ui.buildPalette(map.tilesets);
      ui.updatePaletteHighlight([[this.selectedTileIndex]]);
    }
  }
}

