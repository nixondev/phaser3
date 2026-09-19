import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, DEPTH } from '@utils/Constants';
import { RoomManager } from '@systems/RoomManager';
import { RoomStateManager } from '@systems/RoomStateManager';
import { RoomEditorManager } from '@systems/RoomEditorManager';
import { DebugManager } from '@systems/DebugManager';
import { AudioManager } from '@systems/AudioManager';
import { MusicManager } from '@systems/MusicManager';
import { InputState } from '@/types';
import { EditorUI } from './EditorUI';
import { resolveTileSprite } from '@utils/TilesetResolver';
import { getCameraZoom } from '@systems/CameraZoom';
import { getSpriteScale } from '@systems/SpriteScale';
import { applyPin, repin, type PinnableObject, type ScreenSpacePin } from '@systems/ScreenSpace';
import { getCharacter } from '@systems/CharacterRegistry';
import { ensureCharacterAnims } from '@entities/animHelpers';
import { drawCharacterShadow, CHARACTER_SHADOW_FEET_OFFSET } from '@entities/Entity';

const PAN_SPEED = 4 * GAME_CONFIG.TILE_SIZE; // tiles/sec * px/tile
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.1;

/**
 * Top-level editor scene launched from MenuScene via `?`.
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
  private editorManager!: RoomEditorManager;
  private debugManager!: DebugManager;
  private editorUI!: EditorUI;
  private placeholderSprites = new Map<string, Phaser.GameObjects.Sprite>();

  private firstFrame = true;
  private hudKey?: Phaser.Input.Keyboard.Key;
  private visualsKey?: Phaser.Input.Keyboard.Key;
  private panActive = false;
  private panLast = new Phaser.Math.Vector2();
  private panKeys?: { W: Phaser.Input.Keyboard.Key; A: Phaser.Input.Keyboard.Key; S: Phaser.Input.Keyboard.Key; D: Phaser.Input.Keyboard.Key };
  private wheelHandler?: (e: WheelEvent) => void;
  private contextMenuHandler?: (e: MouseEvent) => void;

  /** Full-screen overlays (actual-view weather/darkness) held at 1:1 under zoom. */
  private screenPins: ScreenSpacePin[] = [];
  /** Optional stand-in protagonist, for judging sprite size against the tiles. */
  private refSprite?: Phaser.GameObjects.Sprite;
  private refShadow?: Phaser.GameObjects.Graphics;
  private showReference = false;

  constructor() {
    super(SCENES.EDITOR);
  }

  create(): void {
    AudioManager.getInstance().setScene(this);
    AudioManager.getInstance().stopMusic();
    MusicManager.getInstance().stop();

    this.roomManager = new RoomManager(this);
    this.rsm = RoomStateManager.getInstance();
    this.afflictedGroup = this.add.group();


    this.editorManager = new RoomEditorManager(this, this.roomManager, this.rsm);
    this.debugManager = new DebugManager(this, this.roomManager, this.rsm);
    this.editorUI = new EditorUI(this);
    this.editorManager.setEditorUI(this.editorUI);

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
    if (this.editorManager.isEditorActive()) {
      this.editorUI.setStatus(this.editorManager.getStatusText());
    }
    this.editorUI.setPreview(this.editorManager.getPreviewState());
    this.editorUI.setActiveTool(this.editorManager.getActiveTool());
    this.editorUI.setColorMode(this.editorManager.getColorMode());
    this.editorUI.setActiveLayer(this.editorManager.getCurrentLayerName());
    this.editorUI.setPaletteActive(this.editorManager.getPaletteVisible());
    this.editorUI.setPlacementMode(this.editorManager.getPlacementMode());
    this.editorUI.setPairActive(this.editorManager.isPairActive());
  }

  // ── Stubs ────────────────────────────────────────────────────────────────

  /** Used by RoomEditorManager.executePairClick and DebugManager warp picker. */
  public warpToRoom(roomId: string): void {
    if (!this.roomManager.getRoomDef(roomId)) return;
    if (this.roomManager.getCurrentRoomId() === roomId) return;
    this.loadRoomInternal(roomId);
  }

  // ── View settings (camera zoom + sprite size) ────────────────────────────

  /**
   * Re-apply the global view settings after the View panel moves a slider.
   * The editor camera deliberately sits at the game's zoom so rooms are
   * authored at the framing the player will actually get; ctrl+wheel still
   * overrides it freely for close-up work.
   */
  public applyViewSettings(): void {
    this.cameras.main.setZoom(getCameraZoom());
    this.rescaleCharacterPlaceholders();
    this.positionReferenceCharacter();
    this.repinScreenSpace();
  }

  /** Room size and the slice of it the game camera will show, for the readout. */
  public getViewInfo(): { roomW: number; roomH: number; viewW: number; viewH: number } {
    const map = this.roomManager.getMap();
    const room = this.roomManager.getCurrentRoomDef();
    const z = getCameraZoom();
    return {
      roomW: map ? map.width : (room?.width ?? 0),
      roomH: map ? map.height : (room?.height ?? 0),
      viewW: GAME_CONFIG.WIDTH / z / GAME_CONFIG.TILE_SIZE,
      viewH: GAME_CONFIG.HEIGHT / z / GAME_CONFIG.TILE_SIZE,
    };
  }

  /** View panel checkbox — drop a real character into the room for scale reference. */
  public setReferenceCharacterVisible(on: boolean): void {
    this.showReference = on;
    if (!on) {
      this.refSprite?.destroy();
      this.refShadow?.destroy();
      this.refSprite = undefined;
      this.refShadow = undefined;
      return;
    }
    if (this.refSprite) { this.positionReferenceCharacter(); return; }

    const sheet = getCharacter('player')?.sheet ?? 'player-good';
    if (!this.textures.exists(sheet)) return;
    ensureCharacterAnims(this, sheet);

    this.refShadow = this.add.graphics();
    drawCharacterShadow(this.refShadow);
    this.refShadow.setDepth(DEPTH.PLAYER - 0.5);

    this.refSprite = this.add.sprite(0, 0, sheet, 0);
    this.refSprite.setDepth(DEPTH.PLAYER);
    this.refSprite.play(`${sheet}-idle-down`, true);
    this.positionReferenceCharacter();
  }

  public isReferenceCharacterVisible(): boolean {
    return this.showReference;
  }

  /** Park the stand-in at the room's player spawn (room centre if it has none). */
  private positionReferenceCharacter(): void {
    if (!this.refSprite || !this.refShadow) return;
    const room = this.roomManager.getCurrentRoomDef();
    const map = this.roomManager.getMap();
    const w = (map ? map.width : room?.width ?? 0) * GAME_CONFIG.TILE_SIZE;
    const h = (map ? map.height : room?.height ?? 0) * GAME_CONFIG.TILE_SIZE;
    const x = room?.playerSpawn?.x ?? w / 2;
    const y = room?.playerSpawn?.y ?? h / 2;
    const s = getSpriteScale();
    this.refSprite.setPosition(x, y).setScale(s);
    this.refShadow.setPosition(x, y + CHARACTER_SHADOW_FEET_OFFSET * s).setScale(s);
  }

  /**
   * Afflicted markers stand in for characters, so they follow `spriteScale` —
   * otherwise the editor shows a size the game will never render.
   */
  private rescaleCharacterPlaceholders(): void {
    const s = getSpriteScale();
    for (const child of this.afflictedGroup.getChildren()) {
      (child as Phaser.GameObjects.Sprite).setScale(s);
    }
  }

  // ── Screen-space overlays (ScreenSpaceHost) ──────────────────────────────

  public pinScreenSpace(obj: PinnableObject, screenX: number, screenY: number, baseScale = 1): void {
    const pin: ScreenSpacePin = { obj, screenX, screenY, baseScale };
    this.screenPins.push(pin);
    applyPin(pin, this.cameras.main);
  }

  private repinScreenSpace(): void {
    this.screenPins = repin(this.screenPins, this.cameras.main);
  }

  /** Used by EditorUI's shadow controls — rebuild edge shadows after a settings change. */
  public refreshEdgeShadows(): void {
    this.editorManager.refreshEdgeShadows();
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
    this.positionReferenceCharacter();
    this.setupCameraForEditor();
    this.editorUI?.onRoomChanged(roomId);
    this.editorManager?.onRoomChanged();
    this.editorManager?.clearHistory();
    this.editorManager?.clearDirtyState();
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
    cam.setZoom(getCameraZoom());
    cam.setBackgroundColor('#222222');
    this.repinScreenSpace();
  }

  private setupPanZoomInput(): void {
    const kb = this.input.keyboard!;
    this.panKeys = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.hudKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.H);
    this.visualsKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.V);

    // Middle-click drag to pan (right-click is reserved for tile erase in RoomEditorManager)
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.middleButtonDown()) {
        this.panActive = true;
        this.panLast.set(pointer.x, pointer.y);
      }
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (this.panActive && pointer.middleButtonDown()) {
        const cam = this.cameras.main;
        const dx = pointer.x - this.panLast.x;
        const dy = pointer.y - this.panLast.y;
        cam.scrollX -= dx / cam.zoom;
        cam.scrollY -= dy / cam.zoom;
        cam.scrollX = Math.round(cam.scrollX);
        cam.scrollY = Math.round(cam.scrollY);
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
      cam.scrollX = Math.round(cam.scrollX);
      cam.scrollY = Math.round(cam.scrollY);
      this.repinScreenSpace();
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
      cam.scrollX = Math.round(cam.scrollX);
      cam.scrollY = Math.round(cam.scrollY);
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
      const tileFrame = inter.type === 'item'
        ? (inter.item?.tileFrame ?? inter.tileFrame ?? 0)
        : (inter.tileFrame ?? inter.item?.tileFrame ?? 0);
      const tilesetKey = inter.type === 'item'
        ? (inter.item?.tilesetKey ?? inter.tilesetKey)
        : (inter.tilesetKey ?? inter.item?.tilesetKey);
      const { key, frame } = resolveTileSprite(tileFrame, tilesetKey);
      const sprite = this.add.sprite(inter.x, inter.y, key, frame);
      sprite.setScale(GAME_CONFIG.WORLD_SCALE);
      sprite.setDepth(DEPTH.ENTITIES);
      sprite.setData('def', inter);
      sprite.setData('kind', 'interactable');
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        this.editorUI.showProperties(`interactable · ${inter.id}`, JSON.stringify(inter, null, 2));
      });
      this.placeholderSprites.set(inter.id, sprite);
    }

    for (const aff of room.afflicted ?? []) {
      const sprite = this.add.sprite(aff.x, aff.y, 'tileset-sprites', 10);
      // Character-sized marker — follows the global sprite scale, not WORLD_SCALE.
      sprite.setScale(getSpriteScale());
      sprite.setDepth(DEPTH.ENTITIES);
      sprite.setData('def', aff);
      sprite.setData('kind', 'afflicted');
      sprite.setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        this.editorUI.showProperties(`afflicted · ${aff.id}`, JSON.stringify(aff, null, 2));
      });
      (sprite as any).getId = () => aff.id;
      (sprite as any).getName = () => aff.name;
      this.afflictedGroup.add(sprite);
    }
  }

  /**
   * Build a minimal InputState for the editor's managers. InputManager is not
   * used here — it would consume JustDown flags on keys that RoomEditorManager
   * also reads (Q, E, 1/2/3, ESC…), causing them to silently drop.
   *
   * On the first frame, inject `editor=true` to auto-activate RoomEditorManager.
   * H (HUD) and V (Visuals) pass through on every frame so the debug overlays
   * are accessible via keyboard or the UI buttons. Everything else is false so
   * RoomEditorManager reads its own key objects uncontested.
   */
  private buildEditorInputState(): InputState {
    const editor = this.firstFrame;
    if (this.firstFrame) this.firstFrame = false;
    const debug = !!this.hudKey && Phaser.Input.Keyboard.JustDown(this.hudKey);
    const visuals = !!this.visualsKey && Phaser.Input.Keyboard.JustDown(this.visualsKey);
    return {
      up: false, down: false, left: false, right: false,
      action: false, menu: false, inventory: false, drop: false,
      flashlight: false, debug, visuals,
      editor,
      char1: false, char2: false, char3: false, char4: false,
      introspect: false,
    };
  }

  // ── Public actions exposed to EditorUI ──

  public exitToMenu(): void {
    this.scene.start(SCENES.MENU);
  }

  public getRoomManager(): RoomManager { return this.roomManager; }
  public getEditorManager(): RoomEditorManager { return this.editorManager; }
  public getDebugManager(): DebugManager { return this.debugManager; }

  /** Interactable placeholder sprites — RoomEditorManager.handleSelection hit-tests these. */
  public getInteractablePlaceholders(): Phaser.GameObjects.Sprite[] {
    return Array.from(this.placeholderSprites.values());
  }

  // ── Cleanup ──

  private cleanup(): void {
    this.setReferenceCharacterVisible(false);
    this.screenPins = [];
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
