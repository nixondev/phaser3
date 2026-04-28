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
    COMMA: Phaser.Input.Keyboard.Key;
    PERIOD: Phaser.Input.Keyboard.Key;
    ENTER: Phaser.Input.Keyboard.Key;
  };

  private placementMode: 'interactable' | 'afflicted' | null = null;

  // Door-pairing state machine. `O` enters this flow.
  private pairPhase: 'idle' | 'pick-target' | 'place-source' | 'place-target' = 'idle';
  private pairRoomList: string[] = [];
  private pairTargetIndex: number = 0;
  private pairTargetRoomId: string | null = null;
  private pairSource: {
    roomId: string;
    doorId: string;
    x: number; y: number;
    width: number; height: number;
    direction: string;
    spawnX: number; spawnY: number;
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
      COMMA: kb.addKey(Phaser.Input.Keyboard.KeyCodes.COMMA),
      PERIOD: kb.addKey(Phaser.Input.Keyboard.KeyCodes.PERIOD),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER)
    };

    this.editorText = this.scene.add.text(10, GAME_CONFIG.HEIGHT - 45, '', {
      fontSize: '8px',
      color: '#ffff00',
      backgroundColor: '#000000aa',
      padding: { x: 4, y: 4 }
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

      this.updateLayerOpacities();
      this.updatePreview();
      this.redrawMapOutline();

      if (!this.isActive && this.selectedObject) {
        this.deselect();
      }
    }

    if (!this.isActive) return;

    this.handleLayerSwitching(input);
    this.handleResize();
    this.handlePlacementToggle();
    this.handlePairing();
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

  private handlePlacementToggle(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.I)) {
      this.placementMode = this.placementMode === 'interactable' ? null : 'interactable';
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.N)) {
      this.placementMode = this.placementMode === 'afflicted' ? null : 'afflicted';
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
      return;
    }

    // Picker phase: cycle target room, Enter to confirm
    if (this.pairPhase === 'pick-target') {
      if (Phaser.Input.Keyboard.JustDown(this.keys.COMMA)) {
        this.pairTargetIndex = (this.pairTargetIndex - 1 + this.pairRoomList.length) % this.pairRoomList.length;
        this.pairTargetRoomId = this.pairRoomList[this.pairTargetIndex];
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.PERIOD)) {
        this.pairTargetIndex = (this.pairTargetIndex + 1) % this.pairRoomList.length;
        this.pairTargetRoomId = this.pairRoomList[this.pairTargetIndex];
      }
      if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) {
        this.pairPhase = 'place-source';
      }
    }
  }

  private cancelPair(): void {
    this.pairPhase = 'idle';
    this.pairTargetRoomId = null;
    this.pairSource = null;
    this.pairRoomList = [];
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

    // Place-source: capture this room's door, warp to target room
    if (this.pairPhase === 'place-source') {
      if (!this.pairTargetRoomId) { this.cancelPair(); return; }
      const sourceRoomId = this.roomManager.getCurrentRoomId();
      const sourceDoorId = `door-${Math.random().toString(36).slice(2, 7)}`;
      const dir = this.inferEdgeDirection(tileX, tileY, mapW, mapH);
      const door = this.buildDoorRect(tileX, tileY, dir, T);

      this.pairSource = {
        roomId: sourceRoomId,
        doorId: sourceDoorId,
        x: door.x, y: door.y,
        width: door.width, height: door.height,
        direction: dir,
        spawnX: door.spawnX,
        spawnY: door.spawnY
      };

      this.pairPhase = 'place-target';
      const targetRoom = this.pairTargetRoomId;
      const scene = this.scene as any;
      if (typeof scene.warpToRoom === 'function') {
        scene.warpToRoom(targetRoom);
      }
      return;
    }

    // Place-target: capture target room's door, emit both snippets
    if (this.pairPhase === 'place-target') {
      const src = this.pairSource;
      const targetRoomId = this.roomManager.getCurrentRoomId();
      if (!src || targetRoomId !== this.pairTargetRoomId) {
        // Got warped somewhere unexpected; bail safely.
        this.showToast('Pairing aborted (unexpected room).');
        this.cancelPair();
        return;
      }
      const targetDoorId = `door-${Math.random().toString(36).slice(2, 7)}`;
      const dir = this.inferEdgeDirection(tileX, tileY, mapW, mapH);
      const door = this.buildDoorRect(tileX, tileY, dir, T);

      const sourceSnippet = {
        id: src.doorId,
        x: src.x, y: src.y,
        width: src.width, height: src.height,
        targetRoom: targetRoomId,
        targetDoor: targetDoorId,
        direction: src.direction,
        spawnX: src.spawnX, spawnY: src.spawnY,
        requires: []
      };
      const targetSnippet = {
        id: targetDoorId,
        x: door.x, y: door.y,
        width: door.width, height: door.height,
        targetRoom: src.roomId,
        targetDoor: src.doorId,
        direction: dir,
        spawnX: door.spawnX, spawnY: door.spawnY,
        requires: []
      };

      const combined =
        `// Paste into rooms.${src.roomId}.doors:\n` +
        JSON.stringify(sourceSnippet, null, 2) +
        `\n\n// Paste into rooms.${targetRoomId}.doors:\n` +
        JSON.stringify(targetSnippet, null, 2);

      console.log(`[Editor] Door pair:\n${combined}`);
      this.copyAndToast(combined, `Door pair copied.\nAppend each block to its room's doors[].`);
      this.cancelPair();
    }
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

  private buildDoorRect(tileX: number, tileY: number, direction: string, T: number)
    : { x: number; y: number; width: number; height: number; spawnX: number; spawnY: number } {
    if (direction === 'up' || direction === 'down') {
      const x = tileX * T;
      const y = tileY * T;
      const width = 32, height = 16;
      const spawnX = x + Math.floor(width / 2);
      const spawnY = direction === 'up' ? y + height + T : y - T;
      return { x, y, width, height, spawnX, spawnY };
    }
    const x = tileX * T;
    const y = tileY * T;
    const width = 16, height = 32;
    const spawnX = direction === 'left' ? x + width + T : x - T;
    const spawnY = y + Math.floor(height / 2);
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
        behaviorLoop: 'wander'
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
    let status = '';
    if (this.placementMode) {
      status = `  ARMED: ${this.placementMode.toUpperCase()} (Esc)`;
    } else if (this.pairPhase === 'pick-target') {
      status = `  PAIR: pick target [, .] ${this.pairTargetRoomId} [Enter] [Esc]`;
    } else if (this.pairPhase === 'place-source') {
      status = `  PAIR: click this room's door (target=${this.pairTargetRoomId}) [Esc]`;
    } else if (this.pairPhase === 'place-target') {
      status = `  PAIR: click target's door [Esc]`;
    }
    this.editorText.setText([
      `Editor: ON | Layer: ${this.currentLayerName} | Tile: ${this.selectedTileIndex} | Map: ${dims}${status}`,
      `[1-3] Layer | [Q/E] Tile | [M-Click/Alt] Eyedrop | [L]Paint [R]Erase`,
      `[X] Export tilemap | [I] place Interact | [O] pair dOor | [N] place Npc`,
      `[Shift+Arrow] Expand | [Ctrl+Shift+Arrow] Shrink`
    ]);
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
    }
    if (input.action) { // E
      this.selectedTileIndex++;
      this.updatePreview();
    }

    if (Phaser.Input.Keyboard.JustDown(this.keys.X)) {
      this.exportTilemap();
    }
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
    console.log(`[Editor] Tilemap JSON for ${path}:\n`, exportData);
    this.copyAndToast(json, `Tilemap copied. Paste into:\n${path}`);
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
    this.tileCursor.setVisible(true);
    this.tileCursor.clear();
    this.tileCursor.lineStyle(1, 0xffff00, 0.8);
    const tw = map.tileWidth * (map.layers[0]?.tilemapLayer?.scaleX || 1);
    const th = map.tileHeight * (map.layers[0]?.tilemapLayer?.scaleY || 1);
    this.tileCursor.strokeRect(tileX * tw, tileY * th, tw, th);

    if (this.selectedObject) return; // Don't paint while dragging

    let changed = false;

    // Eyedropper: Middle Click or Alt + Left Click
    const isAlt = this.keys.ALT.isDown;
    if (pointer.middleButtonDown() || (pointer.leftButtonDown() && isAlt)) {
      const tile = map.getTileAt(tileX, tileY, true, this.currentLayerName);
      if (tile && tile.index !== -1) {
        this.selectedTileIndex = tile.index;
        this.updatePreview();
      }
    } 
    // Left Click: Paint (only if NOT alt)
    else if (pointer.leftButtonDown()) {
      const currentTile = map.getTileAt(tileX, tileY, true, this.currentLayerName);
      if (currentTile && currentTile.index !== this.selectedTileIndex) {
        map.putTileAt(this.selectedTileIndex, tileX, tileY, true, this.currentLayerName);
        changed = true;
      }
    }

    // Right Click: Erase
    if (pointer.rightButtonDown()) {
      const currentTile = map.getTileAt(tileX, tileY, true, this.currentLayerName);
      if (currentTile && currentTile.index !== -1) {
        map.removeTileAt(tileX, tileY, true, true, this.currentLayerName);
        changed = true;
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

    const listKey = type === 'afflicted' ? 'afflicted' : 'interactables';
    const path = `src/data/rooms.json → rooms.${roomId}.${listKey}[id="${id}"]`;
    const snippet = JSON.stringify({ id, x, y }, null, 2);
    console.log(`[Editor] Position update for ${path}:\n${snippet}`);
    this.copyAndToast(snippet, `Position copied. Update x/y in:\n${path}`);
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
      delay: 4500,
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

    // Position preview next to the "Tile: X" part of the text
    // The first line is roughly 140px wide at 8px font
    this.tilePreview.setPosition(this.editorText.x + 145, this.editorText.y + 6);
  }

  destroy(): void {
    this.deselect();
    this.toastTween?.stop();
    this.editorText?.destroy();
    this.tileCursor?.destroy();
    this.tilePreview?.destroy();
    this.mapOutline?.destroy();
    this.toastText?.destroy();
  }
}
