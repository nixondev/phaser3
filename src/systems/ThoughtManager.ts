import Phaser from 'phaser';
import { ThoughtDef, ThoughtsData, ThoughtsSourceData } from '@/types';
import { RoomStateManager } from './RoomStateManager';
import { checkRequires, checkRequiresAny } from './InteractionResolver';
import { getLines } from './Words';
import thoughtsDataRaw from '@/data/thoughts.json';

/**
 * Introspection channel (pattern #13). Pure selection functions over
 * src/data/thoughts.json — thoughts READ game state and never write it.
 *
 * Gating: WHO (character id / trait / all), WHERE (room + optional spot),
 * WHEN (requires / requiresAny via InteractionResolver).
 * Pool rule: a `repeat: 'never'` thought leaves the pool once read.
 * Selection: highest priority wins; ties broken by file order.
 */
/** Prose lives in words/ (passage `thoughts/<id>`); inline `lines` still win if present. */
const thoughtsData: ThoughtsData = {
  thoughts: (thoughtsDataRaw as ThoughtsSourceData).thoughts.map(t => ({
    ...t,
    lines: t.lines ?? getLines(`thoughts/${t.id}`),
  })),
};

function matchesThought(
  t: ThoughtDef,
  rsm: RoomStateManager,
  roomId: string,
  x: number,
  y: number,
  characterId: string,
): boolean {
  // WHO — top-level fields, evaluated against the candidate character
  // (not the active one) so parked-body evaluation stays possible.
  if (t.character && t.character !== characterId) return false;
  if (t.trait) {
    const traits = rsm.getCharacterState(characterId)?.traits ?? [];
    if (!traits.includes(t.trait)) return false;
  }

  // WHERE
  if (t.room && t.room !== roomId) return false;
  if (t.spot && Phaser.Math.Distance.Between(x, y, t.spot.x, t.spot.y) > t.spot.r) {
    return false;
  }

  // WHEN
  if (t.requires && !checkRequires(t.requires, rsm, roomId).met) return false;
  if (t.requiresAny && !checkRequiresAny(t.requiresAny, rsm, roomId).met) return false;

  return true;
}

/** Pool = matching thoughts minus read `repeat: 'never'` entries. */
function poolFor(
  rsm: RoomStateManager,
  roomId: string,
  x: number,
  y: number,
  characterId: string,
): ThoughtDef[] {
  return thoughtsData.thoughts.filter(
    t =>
      !(t.repeat === 'never' && rsm.isThoughtRead(t.id)) &&
      matchesThought(t, rsm, roomId, x, y, characterId),
  );
}

/** Highest-priority entry; ties → earlier in file (filter preserves order). */
function best(pool: ThoughtDef[]): ThoughtDef | null {
  let winner: ThoughtDef | null = null;
  for (const t of pool) {
    if (!winner || t.priority > winner.priority) winner = t;
  }
  return winner;
}

/**
 * What a click / T press shows: unread pool entries win over read ones
 * (so the click always surfaces what the glyph is lit for), then priority,
 * then file order. Read repeatables remain reachable as fallbacks.
 */
export function selectThought(
  rsm: RoomStateManager,
  roomId: string,
  x: number,
  y: number,
  characterId: string = rsm.getActiveCharacterId(),
): ThoughtDef | null {
  const pool = poolFor(rsm, roomId, x, y, characterId);
  return best(pool.filter(t => !rsm.isThoughtRead(t.id))) ?? best(pool);
}

/**
 * Best pool entry the player hasn't been notified about — drives the glyph.
 * `repeat: 'notify'` checks the transient per-room-visit set; never/silent
 * check the persistent read set.
 */
export function selectNotifiableThought(
  rsm: RoomStateManager,
  roomId: string,
  x: number,
  y: number,
  visitNotified: Set<string>,
  characterId: string = rsm.getActiveCharacterId(),
): ThoughtDef | null {
  const pool = poolFor(rsm, roomId, x, y, characterId).filter(t =>
    t.repeat === 'notify' ? !visitNotified.has(t.id) : !rsm.isThoughtRead(t.id),
  );
  return best(pool);
}
