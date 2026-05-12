import { RoomStateManager } from '@systems/RoomStateManager';

const SAVE_KEY = 'warden-save-v1';

export const SaveManager = {
  save(rsm: RoomStateManager): void {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(rsm.serialize()));
    } catch {
      // Storage full or unavailable — fail silently, game continues.
    }
  },

  load(rsm: RoomStateManager): boolean {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    try {
      rsm.loadFrom(JSON.parse(raw));
      return true;
    } catch {
      return false;
    }
  },

  hasSave(): boolean {
    return localStorage.getItem(SAVE_KEY) !== null;
  },

  clear(): void {
    localStorage.removeItem(SAVE_KEY);
  },
};
