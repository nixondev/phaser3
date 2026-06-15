import Phaser from 'phaser';
import { InputState } from '@/types';

export class InputManager {
  private cursors: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private actionKey: Phaser.Input.Keyboard.Key;
  private escKey: Phaser.Input.Keyboard.Key;
  private tabKey: Phaser.Input.Keyboard.Key;
  private dropKey: Phaser.Input.Keyboard.Key;
  private flashlightKey: Phaser.Input.Keyboard.Key;
  private f1Key: Phaser.Input.Keyboard.Key;
  private f3Key: Phaser.Input.Keyboard.Key;
  private charKeys: Phaser.Input.Keyboard.Key[];

  // Shared across all InputManager instances so Cast inputs work in any scene
  private static virtualState: Partial<InputState> = {};
  private static pendingTaps = new Set<keyof InputState>();

  constructor(scene: Phaser.Scene) {
    const kb = scene.input.keyboard!;
    this.cursors = kb.createCursorKeys();
    this.wasd = {
      W: kb.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: kb.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: kb.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: kb.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };
    this.actionKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.escKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);
    this.tabKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.TAB);
    this.dropKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.Q);
    this.flashlightKey = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F);
    this.f1Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F1);
    this.f3Key = kb.addKey(Phaser.Input.Keyboard.KeyCodes.F3);
    this.charKeys = [
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      kb.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR),
    ];
  }

  public setVirtualInput(key: keyof InputState, isDown: boolean) {
    InputManager.virtualState[key] = isDown;
  }

  public setVirtualTap(key: keyof InputState) {
    InputManager.pendingTaps.add(key);
  }

  // Called by CastReceiverInputBridge without needing an instance
  public static injectTap(key: keyof InputState): void {
    InputManager.pendingTaps.add(key);
  }

  public static injectInput(key: keyof InputState, isDown: boolean): void {
    InputManager.virtualState[key] = isDown;
  }

  /** Movement keys use isDown (continuous), action keys use JustDown (tap). */
  getState(): InputState {
    const taps = InputManager.pendingTaps;
    InputManager.pendingTaps = new Set();
    return {
      up: this.cursors.up.isDown || this.wasd.W.isDown || !!InputManager.virtualState.up,
      down: this.cursors.down.isDown || this.wasd.S.isDown || !!InputManager.virtualState.down,
      left: this.cursors.left.isDown || this.wasd.A.isDown || !!InputManager.virtualState.left,
      right: this.cursors.right.isDown || this.wasd.D.isDown || !!InputManager.virtualState.right,
      action: Phaser.Input.Keyboard.JustDown(this.actionKey) || taps.has('action') || !!InputManager.virtualState.action,
      menu: Phaser.Input.Keyboard.JustDown(this.escKey) || taps.has('menu') || !!InputManager.virtualState.menu,
      inventory: Phaser.Input.Keyboard.JustDown(this.tabKey) || taps.has('inventory') || !!InputManager.virtualState.inventory,
      drop: Phaser.Input.Keyboard.JustDown(this.dropKey) || taps.has('drop') || !!InputManager.virtualState.drop,
      flashlight: Phaser.Input.Keyboard.JustDown(this.flashlightKey) || taps.has('flashlight') || !!InputManager.virtualState.flashlight,
      debug: Phaser.Input.Keyboard.JustDown(this.f1Key) || taps.has('debug') || !!InputManager.virtualState.debug,
      editor: false,
      visuals: Phaser.Input.Keyboard.JustDown(this.f3Key) || taps.has('visuals') || !!InputManager.virtualState.visuals,
      char1: Phaser.Input.Keyboard.JustDown(this.charKeys[0]) || taps.has('char1') || !!InputManager.virtualState.char1,
      char2: Phaser.Input.Keyboard.JustDown(this.charKeys[1]) || taps.has('char2') || !!InputManager.virtualState.char2,
      char3: Phaser.Input.Keyboard.JustDown(this.charKeys[2]) || taps.has('char3') || !!InputManager.virtualState.char3,
      char4: Phaser.Input.Keyboard.JustDown(this.charKeys[3]) || taps.has('char4') || !!InputManager.virtualState.char4,
    };
  }

  /** All keys use JustDown — for menus/inventory cursor navigation. */
  getTapState(): InputState {
    const taps = InputManager.pendingTaps;
    InputManager.pendingTaps = new Set();
    return {
      up: Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W) || !!InputManager.virtualState.up,
      down: Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S) || !!InputManager.virtualState.down,
      left: Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A) || !!InputManager.virtualState.left,
      right: Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D) || !!InputManager.virtualState.right,
      action: Phaser.Input.Keyboard.JustDown(this.actionKey) || taps.has('action') || !!InputManager.virtualState.action,
      menu: Phaser.Input.Keyboard.JustDown(this.escKey) || taps.has('menu') || !!InputManager.virtualState.menu,
      inventory: Phaser.Input.Keyboard.JustDown(this.tabKey) || taps.has('inventory') || !!InputManager.virtualState.inventory,
      drop: Phaser.Input.Keyboard.JustDown(this.dropKey) || taps.has('drop') || !!InputManager.virtualState.drop,
      flashlight: Phaser.Input.Keyboard.JustDown(this.flashlightKey) || taps.has('flashlight') || !!InputManager.virtualState.flashlight,
      debug: Phaser.Input.Keyboard.JustDown(this.f1Key) || taps.has('debug') || !!InputManager.virtualState.debug,
      editor: false,
      visuals: Phaser.Input.Keyboard.JustDown(this.f3Key) || taps.has('visuals') || !!InputManager.virtualState.visuals,
      char1: Phaser.Input.Keyboard.JustDown(this.charKeys[0]) || taps.has('char1') || !!InputManager.virtualState.char1,
      char2: Phaser.Input.Keyboard.JustDown(this.charKeys[1]) || taps.has('char2') || !!InputManager.virtualState.char2,
      char3: Phaser.Input.Keyboard.JustDown(this.charKeys[2]) || taps.has('char3') || !!InputManager.virtualState.char3,
      char4: Phaser.Input.Keyboard.JustDown(this.charKeys[3]) || taps.has('char4') || !!InputManager.virtualState.char4,
    };
  }
}
