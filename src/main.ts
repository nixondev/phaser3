
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
import { TileEditorScene } from '@scenes/TileEditorScene';
import { SpriteEditorScene } from '@scenes/SpriteEditorScene';
import { CastSenderController } from '@cast/CastSenderController';
import { CastReceiverInputBridge } from '@cast/CastReceiverInputBridge';
import { isCastReceiverMode, isCastSenderMode } from '@cast/runtime';
import { CAST_NAMESPACE } from '@cast/types';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_CONFIG.WIDTH,
  height: GAME_CONFIG.HEIGHT,
  zoom: 1,
  parent: 'game-container',
//   pixelArt: true,
//   antialias: true,
//   roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: GAME_CONFIG.DEBUG,
    },
  },
  scene: [BootScene, PreloadScene, MenuScene, GameScene, UIScene, PauseScene, EditorScene, DocumentReaderScene, TileEditorScene, SpriteEditorScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

function startGame(): Phaser.Game {
  const game = new Phaser.Game(config);
  // Dev-only handle for tooling/headless verification. Dynamic page-context
  // imports can land in a separate Vite module graph (fresh singletons), so
  // tests must reach the game's real instances through this handle instead.
  if (import.meta.env.DEV) {
    const handle: Record<string, unknown> = { game };
    (window as any).__warden = handle;
    void import('@systems/ConversationManager').then(m => { handle.cm = m; });
    void import('@systems/Words').then(m => { handle.words = m; });
  }
  return game;
}

let activeGame: Phaser.Game | null = null;

function bootSenderMode(): void {
  const root = document.getElementById('game-container');
  if (!root) return;
  const controller = new CastSenderController(root);
  controller.init();
}

function loadCastReceiverSdk(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '//www.gstatic.com/cast/sdk/libs/caf_receiver/v3/cast_receiver_framework.js';
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load Cast receiver SDK.'));
    document.head.appendChild(script);
  });
}

if (isCastSenderMode()) {
  bootSenderMode();
} else if (isCastReceiverMode()) {
  loadCastReceiverSdk()
    .then(() => {
      // Call start() immediately before Phaser loads — Cast times out if this is delayed
      const cast = (window as any).cast;
      if (cast?.framework) {
        const ctx = cast.framework.CastReceiverContext.getInstance();
        const bridge = new CastReceiverInputBridge();
        // Register listener before start() as required by CAF v3
        bridge.start();
        const opts = new cast.framework.CastReceiverOptions();
        opts.disableIdleTimeout = true;
        console.log('[cast:receiver] context.start() called from main.ts');
        ctx.start(opts);
      } else {
        console.error('[cast:receiver] cast.framework not available after SDK load');
      }
      activeGame = startGame();
    })
    .catch((error) => {
      console.error(error);
      activeGame = startGame();
    });
} else {
  activeGame = startGame();
}

document.addEventListener('visibilitychange', () => {
  const game = activeGame ?? undefined;
  if (!game) return;
  if (document.hidden) game.loop.sleep();
  else game.loop.wake();
});
