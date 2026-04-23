import { GAME_CONFIG } from './Constants';

export function debug(...args: unknown[]): void {
  if (GAME_CONFIG.DEBUG) {
    console.log('[Legend]', ...args);
  }
}
