import Phaser from 'phaser';
import { RoomManager } from './RoomManager';
import { RoomStateManager } from './RoomStateManager';
import { DEPTH, GAME_CONFIG, INTERACT_CONFIG, USE_MIDI_MUSIC } from '@utils/Constants';
import { InputState } from '@/types';
import { MusicManager } from './MusicManager';
import { AudioManager } from './AudioManager';

export class DebugManager {
  private scene: Phaser.Scene;
  private roomManager: RoomManager;
  private stateManager: RoomStateManager;
  
  private overlayContainer: Phaser.GameObjects.Container;
  private debugGraphics: Phaser.GameObjects.Graphics;
  private infoText: Phaser.GameObjects.Text;
  
  private isVisible: boolean = false;
  private showVisuals: boolean = false;
  private isEditorMode: boolean = false;

  private currentReverbIndex: number = 0;
  private reverbMix: number = 0.3;

  private keys: {
    R: Phaser.Input.Keyboard.Key;
    OPEN_BRACKET: Phaser.Input.Keyboard.Key;
    CLOSED_BRACKET: Phaser.Input.Keyboard.Key;
    MINUS: Phaser.Input.Keyboard.Key;
    EQUALS: Phaser.Input.Keyboard.Key;
    L: Phaser.Input.Keyboard.Key;
    U: Phaser.Input.Keyboard.Key;
    C: Phaser.Input.Keyboard.Key;
    SHIFT: Phaser.Input.Keyboard.Key;
  };
  
  constructor(scene: Phaser.Scene, roomManager: RoomManager, stateManager: RoomStateManager) {
    this.scene = scene;
    this.roomManager = roomManager;
    this.stateManager = stateManager;

    const kb = this.scene.input.keyboard!;
    this.keys = {
      R: kb.addKey(Phaser.Input.Keyboard.KeyCodes.R),
      OPEN_BRACKET: kb.addKey(Phaser.Input.Keyboard.KeyCodes.OPEN_BRACKET),
      CLOSED_BRACKET: kb.addKey(Phaser.Input.Keyboard.KeyCodes.CLOSED_BRACKET),
      MINUS: kb.addKey(Phaser.Input.Keyboard.KeyCodes.MINUS),
      EQUALS: kb.addKey(Phaser.Input.Keyboard.KeyCodes.PLUS),
      L: kb.addKey(Phaser.Input.Keyboard.KeyCodes.L),
      U: kb.addKey(Phaser.Input.Keyboard.KeyCodes.U),
      C: kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    };
    
    // Graphics for visual debug (collision, triggers, etc)
    this.debugGraphics = this.scene.add.graphics();
    this.debugGraphics.setDepth(DEPTH.UI + 100);
    this.debugGraphics.setVisible(false);
    
    // Container for the HUD overlay
    this.overlayContainer = this.scene.add.container(2, 2);
    this.overlayContainer.setDepth(DEPTH.UI + 101);
    this.overlayContainer.setScrollFactor(0);
    this.overlayContainer.setVisible(false);
    
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x000000, 0.9);
    bg.fillRect(0, 0, 160, 190);
    this.overlayContainer.add(bg);
    
    this.infoText = this.scene.add.text(3, 3, '', {
      fontSize: '8px',
      color: '#ffffff',
      fontFamily: 'Verdana, Arial, sans-serif'
    });
    this.overlayContainer.add(this.infoText);
  }
  
  update(input: InputState, delta: number): void {
    if (input.debug) {
      this.isVisible = !this.isVisible;
      this.overlayContainer.setVisible(this.isVisible);
    }
    
    if (input.visuals) {
      this.showVisuals = !this.showVisuals;
      this.debugGraphics.setVisible(this.showVisuals);
      if (!this.showVisuals) {
        this.debugGraphics.clear();
      }
    }

    if (input.editor) {
      this.isEditorMode = !this.isEditorMode;
      // In a real implementation, this might enable dragging or other tools
      console.log('Editor Mode:', this.isEditorMode ? 'ON' : 'OFF');
    }

    // Shift + Click Teleport (only in debug or editor mode)
    if ((this.isVisible || this.isEditorMode) && this.scene.input.activePointer.isDown && this.keys.SHIFT.isDown) {
      const pointer = this.scene.input.activePointer;
      const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
      const player = (this.scene as any).player;
      if (player) {
        player.setPosition(worldPoint.x, worldPoint.y);
      }
    }

    // Audio Editing (only in debug or editor mode)
    if (this.isVisible || this.isEditorMode) {
      this.handleAudioControls();
    }
    
    if (this.isVisible) {
      this.updateHUD(delta);
    }
    
    if (this.showVisuals) {
      this.drawVisualDebug();
    }
  }

  private handleAudioControls(): void {
    // Cycle Reverb (R)
    if (Phaser.Input.Keyboard.JustDown(this.keys.R)) {
      const music = MusicManager.getInstance();
      const types = music.getReverbTypes();
      this.currentReverbIndex = (this.currentReverbIndex + 1) % types.length;
      music.setReverb(types[this.currentReverbIndex] as any);
      console.log('Reverb changed to:', types[this.currentReverbIndex]);
    }

    // Reverb Mix ([ and ])
    if (Phaser.Input.Keyboard.JustDown(this.keys.OPEN_BRACKET)) {
      this.reverbMix = Math.max(0, this.reverbMix - 0.05);
      MusicManager.getInstance().getEffects().setMix(this.reverbMix);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.CLOSED_BRACKET)) {
      this.reverbMix = Math.min(1.0, this.reverbMix + 0.05);
      MusicManager.getInstance().getEffects().setMix(this.reverbMix);
    }

    // Master Volume (- and + / Equals)
    if (Phaser.Input.Keyboard.JustDown(this.keys.MINUS)) {
      const vol = AudioManager.getInstance().getVolume();
      AudioManager.getInstance().setVolume(vol - 0.05);
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.EQUALS)) {
      const vol = AudioManager.getInstance().getVolume();
      AudioManager.getInstance().setVolume(vol + 0.05);
    }

    // Hot Reload (L)
    if (Phaser.Input.Keyboard.JustDown(this.keys.L)) {
      (this.scene as any).reloadRoom();
    }

    // Unlock all doors in room (U)
    if (Phaser.Input.Keyboard.JustDown(this.keys.U)) {
      const room = this.roomManager.getCurrentRoomDef();
      room.doors.forEach(door => this.stateManager.unlockDoor(door.id));
      console.log('All doors in room unlocked');
    }

    // Cure all afflicted in room (C)
    if (Phaser.Input.Keyboard.JustDown(this.keys.C)) {
      const room = this.roomManager.getCurrentRoomDef();
      room.afflicted?.forEach(aff => this.stateManager.cureResident(aff.id));
      (this.scene as any).reloadRoom(); // Reload to reflect visual changes
      console.log('All residents in room cured');
    }
  }
  
  private updateHUD(delta: number): void {
    const fps = Math.round(1000 / delta);
    const room = this.roomManager.getCurrentRoomDef();
    const roomId = this.roomManager.getCurrentRoomId();
    const player = (this.scene as any).player; // Quick access for now
    
    const pointer = this.scene.input.activePointer;
    const worldPoint = pointer.positionToCamera(this.scene.cameras.main) as Phaser.Math.Vector2;
    const tileX = Math.floor(worldPoint.x / (GAME_CONFIG.TILE_SIZE / GAME_CONFIG.ASSET_SCALE));
    const tileY = Math.floor(worldPoint.y / (GAME_CONFIG.TILE_SIZE / GAME_CONFIG.ASSET_SCALE));
    
    let gids = '';
    const map = this.roomManager.getMap();
    if (map) {
      const layers = ['Ground', 'Collision', 'Above'];
      layers.forEach(layerName => {
        const tile = map.getTileAt(tileX, tileY, true, layerName);
        if (tile) {
          gids += `\n  ${layerName}: ${tile.index}`;
        }
      });
    }

    this.infoText.setText([
      `FPS: ${fps}`,
      `Room: ${roomId}`,
      `Size: ${room.width}x${room.height}`,
      `Music: ${room.music || 'none'}`,
      `Reverb: ${MusicManager.getInstance().getReverbTypes()[this.currentReverbIndex]} (${Math.round(this.reverbMix * 100)}%)`,
      `Volume: ${Math.round(AudioManager.getInstance().getVolume() * 100)}%`,
      'Player:',
      `  World: ${Math.round(player?.x)}, ${Math.round(player?.y)}`,
      `  Facing: ${player?.getFacingAngle()}`,
      'Cursor:',
      `  World: ${Math.round(worldPoint.x)}, ${Math.round(worldPoint.y)}`,
      `  Tile: ${tileX}, ${tileY}`,
      `  GIDs: ${gids}`,
      'Controls:',
      '  F1,F2,F3, L,U,C, R,[],-+,Sh+Clk'
    ]);
  }
  
  private drawVisualDebug(): void {
    this.debugGraphics.clear();
    
    // Draw collision layer
    const collisionLayer = this.roomManager.getCollisionLayer();
    if (collisionLayer) {
      this.debugGraphics.lineStyle(1, 0xff0000, 0.5);
      collisionLayer.forEachTile(tile => {
        if (tile.collides) {
          const x = tile.getLeft();
          const y = tile.getTop();
          const w = tile.width * collisionLayer.scaleX;
          const h = tile.height * collisionLayer.scaleY;
          this.debugGraphics.strokeRect(x, y, w, h);
        }
      });
    }
    
    // Draw door zones
    this.debugGraphics.lineStyle(2, 0x00ffff, 0.8);
    this.roomManager.getDoorZones().forEach(zone => {
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      this.debugGraphics.strokeRect(body.x, body.y, body.width, body.height);
    });

    // Draw interactables
    const roomDef = this.roomManager.getCurrentRoomDef();
    if (roomDef.interactables) {
      this.debugGraphics.lineStyle(1, 0xffff00, 0.6);
      roomDef.interactables.forEach(inter => {
        this.debugGraphics.strokeCircle(inter.x, inter.y, INTERACT_CONFIG.DISTANCE);
        this.debugGraphics.strokeRect(inter.x - 2, inter.y - 2, 4, 4);
      });
    }

    // Draw Afflicted radii
    const afflictedGroup = (this.scene as any).afflictedGroup as Phaser.Physics.Arcade.Group;
    if (afflictedGroup) {
      this.debugGraphics.lineStyle(1, 0xff00ff, 0.6);
      afflictedGroup.getChildren().forEach(child => {
        const a = child as any;
        // Draw wander range (if we had it easily accessible)
        // For now just draw a circle around them
        this.debugGraphics.strokeCircle(a.x, a.y, 32); 
      });
    }
  }
}
