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
  private virtualState: Partial<InputState> = {};

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
    this.virtualState[key] = isDown;
  }

  /** Movement keys use isDown (continuous), action keys use JustDown (tap). */
  getState(): InputState {
    return {
      up: this.cursors.up.isDown || this.wasd.W.isDown || !!this.virtualState.up,
      down: this.cursors.down.isDown || this.wasd.S.isDown || !!this.virtualState.down,
      left: this.cursors.left.isDown || this.wasd.A.isDown || !!this.virtualState.left,
      right: this.cursors.right.isDown || this.wasd.D.isDown || !!this.virtualState.right,
      action: Phaser.Input.Keyboard.JustDown(this.actionKey) || !!this.virtualState.action,
      menu: Phaser.Input.Keyboard.JustDown(this.escKey) || !!this.virtualState.menu,
      inventory: Phaser.Input.Keyboard.JustDown(this.tabKey) || !!this.virtualState.inventory,
      drop: Phaser.Input.Keyboard.JustDown(this.dropKey) || !!this.virtualState.drop,
      flashlight: Phaser.Input.Keyboard.JustDown(this.flashlightKey) || !!this.virtualState.flashlight,
      debug: Phaser.Input.Keyboard.JustDown(this.f1Key) || !!this.virtualState.debug,
      editor: false,
      visuals: Phaser.Input.Keyboard.JustDown(this.f3Key) || !!this.virtualState.visuals,
      char1: Phaser.Input.Keyboard.JustDown(this.charKeys[0]) || !!this.virtualState.char1,
      char2: Phaser.Input.Keyboard.JustDown(this.charKeys[1]) || !!this.virtualState.char2,
      char3: Phaser.Input.Keyboard.JustDown(this.charKeys[2]) || !!this.virtualState.char3,
      char4: Phaser.Input.Keyboard.JustDown(this.charKeys[3]) || !!this.virtualState.char4,
    };
  }

  /** All keys use JustDown — for menus/inventory cursor navigation. */
  getTapState(): InputState {
    return {
      up: Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W) || !!this.virtualState.up,
      down: Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S) || !!this.virtualState.down,
      left: Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A) || !!this.virtualState.left,
      right: Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D) || !!this.virtualState.right,
      action: Phaser.Input.Keyboard.JustDown(this.actionKey) || !!this.virtualState.action,
      menu: Phaser.Input.Keyboard.JustDown(this.escKey) || !!this.virtualState.menu,
      inventory: Phaser.Input.Keyboard.JustDown(this.tabKey) || !!this.virtualState.inventory,
      drop: Phaser.Input.Keyboard.JustDown(this.dropKey) || !!this.virtualState.drop,
      flashlight: Phaser.Input.Keyboard.JustDown(this.flashlightKey) || !!this.virtualState.flashlight,
      debug: Phaser.Input.Keyboard.JustDown(this.f1Key) || !!this.virtualState.debug,
      editor: false,
      visuals: Phaser.Input.Keyboard.JustDown(this.f3Key) || !!this.virtualState.visuals,
      char1: Phaser.Input.Keyboard.JustDown(this.charKeys[0]) || !!this.virtualState.char1,
      char2: Phaser.Input.Keyboard.JustDown(this.charKeys[1]) || !!this.virtualState.char2,
      char3: Phaser.Input.Keyboard.JustDown(this.charKeys[2]) || !!this.virtualState.char3,
      char4: Phaser.Input.Keyboard.JustDown(this.charKeys[3]) || !!this.virtualState.char4,
    };
  }
}
