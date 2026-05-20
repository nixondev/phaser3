
import Phaser from 'phaser';
import { GAME_CONFIG } from '@utils/Constants';
import { BootScene } from '@scenes/BootScene';
import { PreloadScene } from '@scenes/PreloadScene';
import { MenuScene } from '@scenes/MenuScene';
import { GameScene } from '@scenes/GameScene';
import { UIScene } from '@scenes/UIScene';
import { PauseScene } from '@scenes/PauseScene';
import { EditorScene } from '@scenes/EditorScene';
import { DocumentReaderScene } from '@scenes/DocumentReaderScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_CONFIG.WIDTH,
  height: GAME_CONFIG.HEIGHT,
  zoom: 1,
  parent: 'game-container',
  pixelArt: true,
  antialias: true,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: GAME_CONFIG.DEBUG,
    },
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene, PauseScene, EditorScene, DocumentReaderScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
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
