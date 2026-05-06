import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, DEPTH, USE_MIDI_MUSIC } from '@utils/Constants';
import { RoomManager } from '@systems/RoomManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { RoomEditorManager } from '@systems/RoomEditorManager';
import { DebugManager } from '@systems/DebugManager';
import { InputManager } from '@systems/InputManager';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { InputState } from '@/types';
import { EditorUI } from './EditorUI';

const PAN_SPEED = 4 * GAME_CONFIG.TILE_SIZE; // tiles/sec * px/tile
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;

/**
 * Top-level editor scene launched from MenuScene via F1.
 *
 * Reuses RoomManager, RoomEditorManager, DebugManager, and InputManager
 * unchanged. Provides stubs for the scene-coupling points those classes
 * read off the host scene (`player`, `afflictedGroup`, `warpToRoom`,
 * `reloadRoom`, `refreshAfterResize`, `refreshCamera`).
 */
export class EditorScene extends Phaser.Scene {
  // ── Stubs read by RoomEditorManager / DebugManager ──
  public player: null = null;
  public afflictedGroup!: Phaser.GameObjects.Group;

  private roomManager!: RoomManager;
  private rsm!: RoomStateManager;
  private inputManager!: InputManager;
  private editorManager!: RoomEditorManager;
  private debugManager!: DebugManager;
  private editorUI!: EditorUI;
  private placeholderSprites = new Map<string, Phaser.GameObjects.Sprite>();

  private firstFrame = true;
  private panActive = false;
  private panLast = new Phaser.Math.Vector2();
  private panKeys?: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private wheelHandler?: (e: WheelEvent) => void;
  private contextMenuHandler?: (e: MouseEvent) => void;

  constructor() {
    super(SCENES.EDITOR);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().stopMusic();

    this.roomManager = new RoomManager(this);
    this.rsm = RoomStateManager.getInstance();
    this.inputManager = new InputManager(this);
    this.afflictedGroup = this.add.group();

    this.editorManager = new RoomEditorManager(this, this.roomManager, this.rsm);
    this.debugManager = new DebugManager(this, this.roomManager, this.rsm);
    this.editorUI = new EditorUI(this);

    const startId = this.roomManager.getStartRoom();
    this.loadRoomInternal(startId);
    this.setupPanZoomInput();

    this.events.on(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  update(_time: number, delta: number): void {
    this.handleCameraPan(delta);
    const input = this.buildEditorInputState();
    this.debugManager.update(input, delta);
    this.editorManager.update(input);
  }

  // ── Stubs ────────────────────────────────────────────────────────────────

  /** Used by RoomEditorManager.executePairClick and DebugManager warp picker. */
  public warpToRoom(roomId: string): void {
    if (!this.roomManager.getRoomDef(roomId)) return;
    if (this.roomManager.getCurrentRoomId() === roomId) return;
    this.loadRoomInternal(roomId);
  }

  /** Used by DebugManager L key. */
  public reloadRoom(): void {
    const id = this.roomManager.getCurrentRoomId();
    if (!id) return;
    this.loadRoomInternal(id);
  }

  /** Used by RoomEditorManager.handleResize after resizing. */
  public refreshAfterResize(_dx: number, _dy: number): void {
    this.setupCameraForEditor();
    this.refreshPlaceholders();
  }

  /** Used by RoomEditorManager.peekAtChangedEdge when post-pan completes. */
  public refreshCamera(): void {
    this.setupCameraForEditor();
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private loadRoomInternal(roomId: string): void {
    this.roomManager.loadRoom(roomId);
    this.rsm.visitRoom(roomId);
    this.refreshPlaceholders();
    this.setupCameraForEditor();
    if (USE_MIDI_MUSIC) {
      MusicManager.getInstance().playRoomMusic(roomId);
    }
    this.editorUI?.onRoomChanged(roomId);
  }

  private setupCameraForEditor(): void {
    const room = this.roomManager.getCurrentRoomDef();
    if (!room) return;
    const cam = this.cameras.main;
    const T = GAME_CONFIG.TILE_SIZE;
    const w = room.width * T;
    const h = room.height * T;
    // Generous bounds — let the user pan past room edges (helpful when expanding maps).
    cam.setBounds(-w, -h, w * 3, h * 3);
    cam.stopFollow();
    cam.centerOn(w / 2, h / 2);
    cam.setZoom(1);
    cam.setBackgroundColor('#222222');
  }

  private setupPanZoomInput(): void {
    const kb = this.input.keyboard!;
    this.panKeys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Right-click drag to pan
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.rightButtonDown()) {
        this.panActive = true;
        this.panLast.set(pointer.x, pointer.y);
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.panActive && pointer.rightButtonDown()) {
        const cam = this.cameras.main;
        const dx = pointer.x - this.panLast.x;
        const dy = pointer.y - this.panLast.y;
        cam.scrollX -= dx / cam.zoom;
        cam.scrollY -= dy / cam.zoom;
        this.panLast.set(pointer.x, pointer.y);
      }
    });
    this.input.on('pointerup', () => { this.panActive = false; });

    // Suppress browser context menu on right-click so right-drag pan works.
    this.contextMenuHandler = (e: MouseEvent) => e.preventDefault();
    this.game.canvas.addEventListener('contextmenu', this.contextMenuHandler);

    // Ctrl+wheel zooms. Capture-phase + stopPropagation prevents Phaser's
    // wheel listeners (notably RoomEditorManager.onWheel which cycles tiles)
    // from firing when zooming.
    this.wheelHandler = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const cam = this.cameras.main;
      const factor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * factor, MIN_ZOOM, MAX_ZOOM));
    };
    this.game.canvas.addEventListener('wheel', this.wheelHandler, { capture: true, passive: false });
  }

  private handleCameraPan(delta: number): void {
    if (!this.panKeys) return;
    if (this.editorManager?.isModalOpen()) return; // don't pan while picker open
    const cam = this.cameras.main;
    const speed = (PAN_SPEED * delta) / 1000;
    let dx = 0, dy = 0;
    if (this.panKeys.W.isDown) dy -= speed;
    if (this.panKeys.S.isDown) dy += speed;
    if (this.panKeys.A.isDown) dx -= speed;
    if (this.panKeys.D.isDown) dx += speed;
    if (dx !== 0 || dy !== 0) {
      cam.scrollX += dx / cam.zoom;
      cam.scrollY += dy / cam.zoom;
    }
  }

  /**
   * Render placeholder sprites for interactables and afflicted at their
   * declared positions in `rooms.json`. Afflicted placeholders go into
   * `afflictedGroup` so RoomEditorManager.handleSelection can find them
   * via `afflictedGroup.getChildren().find(...)`.
   */
  private refreshPlaceholders(): void {
    this.placeholderSprites.forEach(s => s.destroy());
    this.placeholderSprites.clear();
    this.afflictedGroup.clear(true, true);

    const room = this.roomManager.getCurrentRoomDef();
    if (!room) return;

    for (const inter of room.interactables ?? []) {
      const tileFrame = (inter as any).tileFrame ?? 0;
      const sprite = this.add.sprite(inter.x, inter.y, 'tileset-sprites', tileFrame);
      sprite.setScale(1 / GAME_CONFIG.ASSET_SCALE);
      sprite.setDepth(DEPTH.ENTITIES);
      sprite.setData('def', inter);
      sprite.setData('kind', 'interactable');
      this.placeholderSprites.set(inter.id, sprite);
    }

    for (const aff of room.afflicted ?? []) {
      // Frame 10 (skeleton remains) is a serviceable NPC stand-in until we have
      // dedicated afflicted art available in the editor.
      const sprite = this.add.sprite(aff.x, aff.y, 'tileset-sprites', 10);
      sprite.setScale(1 / GAME_CONFIG.ASSET_SCALE);
      sprite.setDepth(DEPTH.ENTITIES);
      sprite.setData('def', aff);
      sprite.setData('kind', 'afflicted');
      // RoomEditorManager.logObjectSnippet looks for a getId() on the dragged sprite.
      (sprite as any).getId = () => aff.id;
      (sprite as any).getName = () => aff.name;
      this.afflictedGroup.add(sprite);
    }
  }

  /**
   * On the first frame, force editor/debug/visuals true so RoomEditorManager
   * flips to active and DebugManager's HUD + visual overlay turn on without
   * the user having to press F-keys. After that, suppress the editor toggle
   * (so F2 can't accidentally turn the editor off) but pass debug/visuals
   * through so F1/F3 still work as toggles.
   */
  private buildEditorInputState(): InputState {
    const state = this.inputManager.getState();
    if (this.firstFrame) {
      state.editor = true;
      state.debug = true;
      state.visuals = true;
      this.firstFrame = false;
    } else {
      state.editor = false;
    }
    return state;
  }

  // ── Public actions exposed to EditorUI ──

  public exitToMenu(): void {
    this.scene.start(SCENES.MENU);
  }

  public getRoomManager(): RoomManager { return this.roomManager; }
  public getEditorManager(): RoomEditorManager { return this.editorManager; }
  public getDebugManager(): DebugManager { return this.debugManager; }

  /** Synthesize a key tap so EditorUI buttons can drive the existing key handlers. */
  public synthesizeKey(keyCode: number): void {
    const kb = this.input.keyboard;
    if (!kb) return;
    const ev = new KeyboardEvent('keydown', { keyCode, code: '', bubbles: true });
    Object.defineProperty(ev, 'keyCode', { value: keyCode });
    window.dispatchEvent(ev);
  }

  // ── Cleanup ──

  private cleanup(): void {
    this.editorUI?.destroy();
    this.editorManager?.destroy();
    this.debugManager?.destroy();
    MusicManager.getInstance().stop();
    if (this.wheelHandler) {
      this.game.canvas.removeEventListener('wheel', this.wheelHandler, { capture: true } as EventListenerOptions);
    }
    if (this.contextMenuHandler) {
      this.game.canvas.removeEventListener('contextmenu', this.contextMenuHandler);
    }
  }
}
