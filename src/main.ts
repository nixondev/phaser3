
import Phaser from 'phaser';
import { GAME_CONFIG } from '@utils/Constants';
import { BootScene } from '@scenes/BootScene';
import { PreloadScene } from '@scenes/PreloadScene';
import { MenuScene } from '@scenes/MenuScene';
import { GameScene } from '@scenes/GameScene';
import { UIScene } from '@scenes/UIScene';
import { PauseScene } from '@scenes/PauseScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_CONFIG.WIDTH,
  height: GAME_CONFIG.HEIGHT,
  zoom: GAME_CONFIG.ZOOM,
  parent: 'game-container',
  pixelArt: true,
  antialias: false,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: GAME_CONFIG.DEBUG,
    },
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene, PauseScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.NO_CENTER,
  },
};

const game = new Phaser.Game(config);

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    game.loop.sleep();
  } else {
    game.loop.wake();
  }
});
