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
  }

  /** Movement keys use isDown (continuous), action keys use JustDown (tap). */
  getState(): InputState {
    return {
      up: this.cursors.up.isDown || this.wasd.W.isDown,
      down: this.cursors.down.isDown || this.wasd.S.isDown,
      left: this.cursors.left.isDown || this.wasd.A.isDown,
      right: this.cursors.right.isDown || this.wasd.D.isDown,
      action: Phaser.Input.Keyboard.JustDown(this.actionKey),
      menu: Phaser.Input.Keyboard.JustDown(this.escKey),
      inventory: Phaser.Input.Keyboard.JustDown(this.tabKey),
      drop: Phaser.Input.Keyboard.JustDown(this.dropKey),
      flashlight: Phaser.Input.Keyboard.JustDown(this.flashlightKey),
    };
  }

  /** All keys use JustDown — for menus/inventory cursor navigation. */
  getTapState(): InputState {
    return {
      up: Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.W),
      down: Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.S),
      left: Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.A),
      right: Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.D),
      action: Phaser.Input.Keyboard.JustDown(this.actionKey),
      menu: Phaser.Input.Keyboard.JustDown(this.escKey),
      inventory: Phaser.Input.Keyboard.JustDown(this.tabKey),
      drop: Phaser.Input.Keyboard.JustDown(this.dropKey),
      flashlight: Phaser.Input.Keyboard.JustDown(this.flashlightKey),
    };
  }
}
