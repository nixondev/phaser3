import Phaser from 'phaser';
import { SCENES } from '@utils/Constants';

export class BootScene extends Phaser.Scene {
  constructor() {
    super(SCENES.BOOT);
  }

  create(): void {
    this.scene.start(SCENES.PRELOAD);
  }
}
