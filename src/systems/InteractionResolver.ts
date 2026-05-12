import { RequireCondition, ProduceEffect, DroppedItemState, FlagCondition, RoomDefinition } from '@/types';
import { RoomStateManager } from './RoomStateManager';
import { RoomManager } from './RoomManager';

export interface ResolveResult {
  /** true when all requires were met */
  met: boolean;
  /** human-readable message; shown as dialog either way */
  message: string;
  /** items to drop into the current room (caller creates sprites) */
  droppedItems: DroppedItemState[];
}

/**
 * Check a requires[] list against current game state.
 * Returns the first unmet condition with a hint message, or met=true.
 */
export function checkRequires(
  conditions: RequireCondition[],
  rsm: RoomStateManager,
): { met: boolean; message: string } {
  for (const cond of conditions) {
    if (cond.type === 'item') {
      const slot = rsm.getInventory().findIndex(
        i => i !== null && (i.keyId === cond.value || i.name === cond.value),
      );
      if (slot < 0) return { met: false, message: 'Something here, but not like this.' };
    } else if (cond.type === 'character') {
      if (rsm.getActiveCharacterId() !== cond.value)
        return { met: false, message: 'Someone else might know what to do here.' };
    } else if (cond.type === 'flag') {
      if (!rsm.hasFlag(cond.value))
        return { met: false, message: 'Something here, but not like this.' };
    }
  }
  return { met: true, message: '' };
}

/**
 * Consume items from requires[] that have consume:true.
 * Call only after checkRequires returns met=true.
 */
export function consumeRequires(conditions: RequireCondition[], rsm: RoomStateManager): void {
  for (const cond of conditions) {
    if (cond.type === 'item' && cond.consume) {
      const slot = rsm.getInventory().findIndex(
        i => i !== null && (i.keyId === cond.value || i.name === cond.value),
      );
      if (slot >= 0) rsm.removeFromInventory(slot);
    }
  }
}

/**
 * Apply produces[] effects to game state.
 * Returns any items that should be dropped into the world (caller handles sprites).
 */
export function applyProduces(
  effects: ProduceEffect[],
  rsm: RoomStateManager,
  roomId: string,
): DroppedItemState[] {
  const newDropped: DroppedItemState[] = [];

  for (const effect of effects) {
    switch (effect.type) {
      case 'setFlag':
        rsm.setFlag(effect.value);
        break;
      case 'clearFlag':
        rsm.clearFlag(effect.value);
        break;
      case 'unlockDoor':
        rsm.unlockDoor(effect.value);
        break;
      case 'dropItem': {
        if (!effect.item) break;
        const dropped: DroppedItemState = {
          item: effect.item,
          x: effect.x ?? 0,
          y: effect.y ?? 0,
          instanceId: `${effect.value}-${Date.now()}`,
        };
        rsm.addDroppedItem(roomId, dropped);
        newDropped.push(dropped);
        break;
      }
    }
  }

  return newDropped;
}

/**
 * Called every time a room is loaded. Reads the room's `flagConditions` and,
 * for each condition whose flag is currently set, applies the effects to the
 * live tilemap and world state. Must be called after RoomManager.loadRoom().
 */
export function applyFlagConditions(
  roomDef: RoomDefinition,
  rsm: RoomStateManager,
  roomManager: RoomManager,
): void {
  if (!roomDef.flagConditions) return;
  const map = roomManager.getMap();
  if (!map) return;

  for (const condition of roomDef.flagConditions) {
    if (!rsm.hasFlag(condition.flag)) continue;
    for (const effect of condition.effects) {
      switch (effect.type) {
        case 'removeTile':
          if (effect.x !== undefined && effect.y !== undefined && effect.layer) {
            map.removeTileAt(effect.x, effect.y, true, true, effect.layer);
          }
          break;
        case 'setTile':
          if (effect.x !== undefined && effect.y !== undefined && effect.layer && effect.tileIndex !== undefined) {
            map.putTileAt(effect.tileIndex, effect.x, effect.y, true, effect.layer);
          }
          break;
        case 'unlockDoor':
          if (effect.doorId) rsm.unlockDoor(effect.doorId);
          break;
        case 'hideInteractable':
          // Mark the interactable as collected so createWorldItemSprites skips it
          if (effect.interactableId) rsm.collectItem(effect.interactableId);
          break;
      }
    }
  }
}
