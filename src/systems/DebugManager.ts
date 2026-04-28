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
    F4: Phaser.Input.Keyboard.Key;
    F5: Phaser.Input.Keyboard.Key;
    UP: Phaser.Input.Keyboard.Key;
    DOWN: Phaser.Input.Keyboard.Key;
    ENTER: Phaser.Input.Keyboard.Key;
    ESC: Phaser.Input.Keyboard.Key;
  };

  private toastText!: Phaser.GameObjects.Text;
  private toastTween?: Phaser.Tweens.Tween;

  private warpOverlay!: Phaser.GameObjects.Container;
  private warpListText!: Phaser.GameObjects.Text;
  private warpHint!: Phaser.GameObjects.Text;
  private warpOpen: boolean = false;
  private warpIndex: number = 0;
  private warpRoomIds: string[] = [];
  
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
      SHIFT: kb.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      F4: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F4),
      F5: kb.addKey(Phaser.Input.Keyboard.KeyCodes.F5),
      UP: kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
      DOWN: kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
      ENTER: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ENTER),
      ESC: kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
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

    // Warp picker overlay (centered, hidden by default)
    this.warpOverlay = this.scene.add.container(GAME_CONFIG.WIDTH / 2, 30);
    this.warpOverlay.setScrollFactor(0).setDepth(DEPTH.UI + 250).setVisible(false);
    const warpBg = this.scene.add.graphics();
    warpBg.fillStyle(0x000000, 0.92);
    warpBg.fillRect(-95, -8, 190, 200);
    warpBg.lineStyle(1, 0xffff00, 1);
    warpBg.strokeRect(-95, -8, 190, 200);
    this.warpOverlay.add(warpBg);
    this.warpHint = this.scene.add.text(0, 0, 'Warp to room  [Up/Down] [Enter] [Esc]', {
      fontSize: '8px', color: '#ffff00', fontFamily: 'Verdana, Arial, sans-serif'
    }).setOrigin(0.5, 0);
    this.warpOverlay.add(this.warpHint);
    this.warpListText = this.scene.add.text(-90, 14, '', {
      fontSize: '8px', color: '#ffffff', fontFamily: 'Verdana, Arial, sans-serif'
    });
    this.warpOverlay.add(this.warpListText);

    this.toastText = this.scene.add.text(GAME_CONFIG.WIDTH / 2, 6, '', {
      fontSize: '8px',
      color: '#000000',
      backgroundColor: '#ffff66',
      padding: { x: 5, y: 3 },
      align: 'center',
      fontFamily: 'Verdana, Arial, sans-serif'
    })
      .setOrigin(0.5, 0)
      .setScrollFactor(0)
      .setDepth(DEPTH.UI + 220)
      .setAlpha(0);
  }

  /** GameScene reads this to suspend player movement / AI when warp picker is open. */
  isModalOpen(): boolean { return this.warpOpen; }
  
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

    // Warp picker (F4 toggles; while open, swallow nav keys for selection)
    if (Phaser.Input.Keyboard.JustDown(this.keys.F4)) {
      this.toggleWarpPicker();
    }
    if (this.warpOpen) {
      this.handleWarpInput();
      // Skip the rest of the debug update path so audio shortcuts don't fire while picking.
      if (this.isVisible) this.updateHUD(delta);
      if (this.showVisuals) this.drawVisualDebug();
      return;
    }

    // Map overview (F5): dump room graph to clipboard + console, summary on screen.
    if (Phaser.Input.Keyboard.JustDown(this.keys.F5)) {
      this.dumpMapGraph();
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
      MusicManager.getInstance().cycleReverb().then(next => {
        console.log('Reverb changed to:', next);
      });
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
      `Reverb: ${MusicManager.getInstance().getCurrentReverbType() ?? 'off'} (${Math.round(this.reverbMix * 100)}%)`,
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
    
    // Draw door zones — cyan if wired, red if unwired or broken.
    const allRooms = RoomManager.getRoomsData().rooms;
    this.roomManager.getDoorZones().forEach(zone => {
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      const door: any = zone.getData('doorDef') || {};
      const targetRoom = door.targetRoom;
      const targetDoor = door.targetDoor;
      const broken =
        targetRoom === 'TODO' || targetDoor === 'TODO' ||
        !allRooms[targetRoom] ||
        !(allRooms[targetRoom].doors || []).some((d: any) => d.id === targetDoor);
      this.debugGraphics.lineStyle(2, broken ? 0xff3333 : 0x00ffff, 0.9);
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

  // ── Map overview (F5) ──────────────────────────────────────────────────

  /**
   * Build a textual report of the room graph, copy it to the clipboard,
   * log it to the console, and show an on-screen summary toast. Flags:
   *   [OK]      target exists and points back to the matching door
   *   [TODO]    targetRoom or targetDoor is the literal "TODO"
   *   [MISS]    targetRoom or targetDoor doesn't exist
   *   [ONEWAY]  target exists but doesn't point back at this door
   */
  private dumpMapGraph(): void {
    const data = RoomManager.getRoomsData();
    const rooms = data.rooms;
    const ids = Object.keys(rooms).sort();
    const lines: string[] = [];
    let totalDoors = 0;
    let broken = 0, todo = 0, oneway = 0, ok = 0;
    const orphans: string[] = []; // rooms with no doors (or no doors leading TO them)
    const incoming: Record<string, number> = {};
    for (const id of ids) incoming[id] = 0;

    lines.push(`# Room graph (${ids.length} rooms, startRoom=${data.startRoom})`);
    lines.push('');

    for (const id of ids) {
      const r = rooms[id];
      const doors = r.doors || [];
      const tag = id === this.roomManager.getCurrentRoomId() ? ' (current)' : '';
      lines.push(`${id}${tag}  ${r.width}x${r.height}  doors=${doors.length}`);
      if (!doors.length) orphans.push(id);
      for (const d of doors) {
        totalDoors++;
        let status = '[OK]';
        const tRoom = (d as any).targetRoom;
        const tDoor = (d as any).targetDoor;
        if (tRoom === 'TODO' || tDoor === 'TODO') {
          status = '[TODO]'; todo++;
        } else if (!rooms[tRoom]) {
          status = '[MISS room]'; broken++;
        } else {
          incoming[tRoom] = (incoming[tRoom] || 0) + 1;
          const targetDoors = rooms[tRoom].doors || [];
          const matching = targetDoors.find((t: any) => t.id === tDoor);
          if (!matching) {
            status = '[MISS door]'; broken++;
          } else if ((matching as any).targetDoor !== d.id || (matching as any).targetRoom !== id) {
            status = '[ONEWAY]'; oneway++;
          } else {
            ok++;
          }
        }
        lines.push(`    ${d.id} -> ${tRoom}:${tDoor}  ${status}`);
      }
    }

    // Identify rooms with zero incoming doors (unreachable from elsewhere).
    const unreachable = ids.filter(id => incoming[id] === 0 && id !== data.startRoom);
    if (unreachable.length) {
      lines.push('');
      lines.push(`# Unreachable rooms (no incoming doors, not startRoom):`);
      for (const id of unreachable) lines.push(`  ${id}`);
    }
    if (orphans.length) {
      lines.push('');
      lines.push(`# Rooms with zero doors:`);
      for (const id of orphans) lines.push(`  ${id}`);
    }

    const text = lines.join('\n');
    console.log(text);

    const summary =
      `Map: ${ids.length}r ${totalDoors}d  ` +
      `[OK ${ok}] [TODO ${todo}] [BROKEN ${broken}] [ONEWAY ${oneway}]\n` +
      (unreachable.length ? `${unreachable.length} unreachable  ` : '') +
      (orphans.length ? `${orphans.length} orphan  ` : '') +
      `(full report copied + console)`;

    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch { /* ignore */ }
    this.showToast(copied ? summary : `${summary}\n(clipboard blocked)`);
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

  // ── Warp picker ────────────────────────────────────────────────────────

  private toggleWarpPicker(): void {
    this.warpOpen = !this.warpOpen;
    this.warpOverlay.setVisible(this.warpOpen);
    if (!this.warpOpen) return;

    const rooms = RoomManager.getRoomsData().rooms;
    this.warpRoomIds = Object.keys(rooms).sort();
    const currentId = this.roomManager.getCurrentRoomId();
    const i = this.warpRoomIds.indexOf(currentId);
    this.warpIndex = i >= 0 ? i : 0;
    this.renderWarpList();
  }

  private handleWarpInput(): void {
    if (!this.warpRoomIds.length) return;
    if (Phaser.Input.Keyboard.JustDown(this.keys.UP)) {
      this.warpIndex = (this.warpIndex - 1 + this.warpRoomIds.length) % this.warpRoomIds.length;
      this.renderWarpList();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.DOWN)) {
      this.warpIndex = (this.warpIndex + 1) % this.warpRoomIds.length;
      this.renderWarpList();
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.ESC)) {
      this.toggleWarpPicker();
      return;
    }
    if (Phaser.Input.Keyboard.JustDown(this.keys.ENTER)) {
      const target = this.warpRoomIds[this.warpIndex];
      this.toggleWarpPicker();
      const scene = this.scene as any;
      if (typeof scene.warpToRoom === 'function') {
        scene.warpToRoom(target);
      }
    }
  }

  private renderWarpList(): void {
    // Show a window of ~18 rooms around the selection so the list scrolls.
    const total = this.warpRoomIds.length;
    const window = 18;
    const half = Math.floor(window / 2);
    let start = Math.max(0, this.warpIndex - half);
    const end = Math.min(total, start + window);
    if (end - start < window) start = Math.max(0, end - window);
    const lines: string[] = [];
    for (let i = start; i < end; i++) {
      const id = this.warpRoomIds[i];
      const marker = i === this.warpIndex ? '>' : ' ';
      lines.push(`${marker} ${id}`);
    }
    this.warpListText.setText(lines.join('\n'));
  }

  destroy(): void {
    this.toastTween?.stop();
    this.debugGraphics?.destroy();
    this.infoText?.destroy();
    this.overlayContainer?.destroy();
    this.warpOverlay?.destroy();
    this.toastText?.destroy();
  }
}
