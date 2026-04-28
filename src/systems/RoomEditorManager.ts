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
  };
  
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
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN)
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
      
      this.updateLayerOpacities();
      this.updatePreview();

      if (!this.isActive && this.selectedObject) {
        this.deselect();
      }
    }
    
    if (!this.isActive) return;

    this.handleLayerSwitching(input);
    this.handleResize();
    this.updateHUD();
    this.handleSelection(justDown);
    this.handleDragging(justUp);
    this.handleTilePainting();
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

    const result = this.roomManager.resizeMap(newW, newH, offX, offY);
    if (!result) return;

    const scene = this.scene as any;
    if (typeof scene.refreshAfterResize === 'function') {
      scene.refreshAfterResize(result.pixelOffsetX, result.pixelOffsetY);
    }
    console.log(`[Editor] Resized map to ${newW}x${newH} (offset ${offX},${offY})`);
  }

  private updateHUD(): void {
    const map = this.roomManager.getMap();
    const dims = map ? `${map.width}x${map.height}` : '?';
    this.editorText.setText([
      `Editor: ON | Layer: ${this.currentLayerName} | Tile: ${this.selectedTileIndex} | Map: ${dims}`,
      `[1-3] Switch Layer | [Q/E] Tile | [M-Click/Alt] Eyedropper`,
      `[L-Click] Paint | [R-Click] Erase | [X] Export JSON`,
      `[Shift+Arrow] Expand edge | [Ctrl+Shift+Arrow] Shrink edge`
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

    if (import.meta.env.DEV) {
      fetch(`/__editor/save-tilemap?roomId=${encodeURIComponent(roomId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exportData)
      })
        .then(async r => {
          const body = await r.json().catch(() => ({}));
          if (r.ok) console.log(`[Editor] Saved tilemap → ${body.path ?? roomId + '.json'}`);
          else console.warn(`[Editor] save-tilemap failed (${r.status}):`, body);
        })
        .catch(err => console.warn('[Editor] save-tilemap error, falling back to download:', err));
    } else {
      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${roomId}_edited.json`;
      a.click();
      URL.revokeObjectURL(url);
      console.log('Tilemap exported to', a.download);
    }
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

    if (import.meta.env.DEV) {
      fetch('/__editor/save-object', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, kind: type, id, x, y })
      })
        .then(async r => {
          const body = await r.json().catch(() => ({}));
          if (r.ok) console.log(`[Editor] Saved ${type} ${id} → (${x}, ${y})`);
          else console.warn(`[Editor] save-object failed (${r.status}):`, body);
        })
        .catch(err => console.warn('[Editor] save-object error:', err));
    } else {
      console.log('Updated Object Position:');
      console.log(JSON.stringify({ id, x, y }, null, 2));
    }
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
    this.editorText?.destroy();
    this.tileCursor?.destroy();
    this.tilePreview?.destroy();
  }
}
