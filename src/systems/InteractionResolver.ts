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

function hasItem(inv: (import('@/types').ItemDef | null)[], value: string): boolean {
  return inv.some(i => i !== null && (i.keyId === value || i.name === value));
}

/**
 * Check a single RequireCondition. Returns true if met.
 * roomId is required for room-scoped conditions (characterPresent, itemInRoom, characterCount).
 */
function checkOne(cond: RequireCondition, rsm: RoomStateManager, roomId: string): boolean {
  switch (cond.type) {
    case 'item':
      return hasItem(rsm.getInventory(), cond.value);
    case 'itemAbsent':
      return !hasItem(rsm.getInventory(), cond.value);
    case 'itemInRoom':
      return rsm.getDroppedItems(roomId).some(
        d => d.item.keyId === cond.value || d.item.name === cond.value,
      );
    case 'character':
      return rsm.getActiveCharacterId() === cond.value;
    case 'characterPresent': {
      const state = rsm.getCharacterState(cond.value);
      return state !== undefined && state.roomId === roomId;
    }
    case 'characterCarries': {
      if (!cond.characterId) return false;
      return hasItem(rsm.getCharacterInventory(cond.characterId), cond.value);
    }
    case 'characterCount': {
      const count = rsm.getRoster().filter(
        c => c.id !== rsm.getActiveCharacterId() && c.roomId === roomId,
      ).length;
      if (cond.min !== undefined && count < cond.min) return false;
      if (cond.max !== undefined && count > cond.max) return false;
      return true;
    }
    case 'flag':
      return rsm.hasFlag(cond.value);
    case 'flagAbsent':
      return !rsm.hasFlag(cond.value);
    case 'trait':
      return rsm.getActiveCharacterTraits().includes(cond.value);
    case 'traitPresent':
      return rsm.anyInRoomHasTrait(roomId, cond.value);
    default:
      return false;
  }
}

function hintFor(cond: RequireCondition): string {
  switch (cond.type) {
    case 'character':
    case 'characterPresent':
    case 'characterCarries':
    case 'characterCount':
    case 'trait':
    case 'traitPresent':
      return 'Someone else might know what to do here.';
    default:
      return 'Something here, but not like this.';
  }
}

/**
 * Check a requires[] list (AND logic). Returns met=true only if all pass.
 * roomId must be the current room for room-scoped conditions.
 */
export function checkRequires(
  conditions: RequireCondition[],
  rsm: RoomStateManager,
  roomId = '',
): { met: boolean; message: string } {
  for (const cond of conditions) {
    if (!checkOne(cond, rsm, roomId)) {
      return { met: false, message: hintFor(cond) };
    }
  }
  return { met: true, message: '' };
}

/**
 * Check a requiresAny[] list (OR logic). Returns met=true if any single condition passes.
 */
export function checkRequiresAny(
  conditions: RequireCondition[],
  rsm: RoomStateManager,
  roomId = '',
): { met: boolean; message: string } {
  if (conditions.length === 0) return { met: true, message: '' };
  for (const cond of conditions) {
    if (checkOne(cond, rsm, roomId)) return { met: true, message: '' };
  }
  return { met: false, message: 'Something here, but not like this.' };
}

/**
 * Consume items from requires[] that have consume:true.
 * Handles both active-character items and characterCarries consumption.
 * Call only after checkRequires returns met=true.
 */
export function consumeRequires(conditions: RequireCondition[], rsm: RoomStateManager): void {
  for (const cond of conditions) {
    if (cond.type === 'item' && cond.consume) {
      const slot = rsm.getInventory().findIndex(
        i => i !== null && (i.keyId === cond.value || i.name === cond.value),
      );
      if (slot >= 0) rsm.removeFromInventory(slot);
    } else if (cond.type === 'characterCarries' && cond.consume && cond.characterId) {
      rsm.removeFromCharacterInventory(cond.characterId, cond.value);
    }
  }
}

/**
 * Apply produces[] effects to game state.
 * scene is required for setFlagAfterDelay (uses Phaser time.delayedCall).
 * Returns any items that should be dropped into the world (caller handles sprites).
 */
export function applyProduces(
  effects: ProduceEffect[],
  rsm: RoomStateManager,
  roomId: string,
  scene?: Phaser.Scene,
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
      case 'toggleFlag':
        if (rsm.hasFlag(effect.value)) rsm.clearFlag(effect.value);
        else rsm.setFlag(effect.value);
        break;
      case 'setFlagDuration':
        rsm.setFlagWithDuration(effect.value, effect.duration ?? 5000);
        break;
      case 'setFlagAfterDelay':
        if (scene) {
          scene.time.delayedCall(effect.duration ?? 0, () => rsm.setFlag(effect.value));
        } else {
          setTimeout(() => rsm.setFlag(effect.value), effect.duration ?? 0);
        }
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
      case 'giveCharacterItem': {
        if (!effect.item || !effect.characterId) break;
        rsm.addToCharacterInventory(effect.characterId, effect.item);
        break;
      }
      case 'consumeCharacterItem': {
        if (!effect.characterId) break;
        rsm.removeFromCharacterInventory(effect.characterId, effect.value);
        break;
      }
      case 'grantTrait':
        rsm.grantTrait(effect.value);
        break;
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
