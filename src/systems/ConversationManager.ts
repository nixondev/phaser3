import { ConversationDef, ConversationsData } from '@/types';
import { RoomStateManager } from './RoomStateManager';
import { checkRequires, checkRequiresAny } from './InteractionResolver';
import conversationsRaw from '@/data/conversations.json';

/**
 * Speaker×listener conversation layer. Pure selection functions over
 * src/data/conversations.json — the third application of the thoughts
 * WHO/WHERE/WHEN pattern: given (npc, active character, world state),
 * pick the best matching entry. Prose lives in words/ via `words:` refs.
 *
 * Speaker gating is ordinary condition grammar in `requires`
 * ({ type: 'character' | 'trait' | 'flag' | … }); no dedicated fields.
 * Pool rule: a `repeat: 'never'` entry leaves the pool once read.
 * Selection: highest priority wins; ties broken by file order.
 */
const conversationsData = conversationsRaw as ConversationsData;

function matchesConversation(
  c: ConversationDef,
  rsm: RoomStateManager,
  roomId: string,
): boolean {
  if (c.requires && !checkRequires(c.requires, rsm, roomId).met) return false;
  if (c.requiresAny && !checkRequiresAny(c.requiresAny, rsm, roomId).met) return false;
  return true;
}

/** Pool = this NPC's matching entries minus read `repeat: 'never'` ones. */
function poolFor(rsm: RoomStateManager, roomId: string, npcId: string): ConversationDef[] {
  return conversationsData.conversations.filter(
    c =>
      c.npc === npcId &&
      !(c.repeat === 'never' && rsm.isConversationRead(c.id)) &&
      matchesConversation(c, rsm, roomId),
  );
}

/** Highest-priority entry; ties → earlier in file (filter preserves order). */
function best(pool: ConversationDef[]): ConversationDef | null {
  let winner: ConversationDef | null = null;
  for (const c of pool) {
    if (!winner || c.priority > winner.priority) winner = c;
  }
  return winner;
}

/**
 * What pressing E on a recovered resident plays: unread pool entries win
 * over read ones (the glyph's promise), then priority, then file order.
 * Read repeatables remain reachable as fallbacks. Null = no entry matches
 * (caller falls back to the stock solo line).
 */
export function selectConversation(
  rsm: RoomStateManager,
  roomId: string,
  npcId: string,
): ConversationDef | null {
  const pool = poolFor(rsm, roomId, npcId);
  return best(pool.filter(c => !rsm.isConversationRead(c.id))) ?? best(pool);
}

/**
 * Best pool entry the player hasn't been notified about — drives the `?`
 * glyph over the NPC. `repeat: 'notify'` checks the transient per-room-visit
 * set; never/silent check the persistent read set.
 */
export function selectNotifiableConversation(
  rsm: RoomStateManager,
  roomId: string,
  npcId: string,
  visitNotified: Set<string>,
): ConversationDef | null {
  const pool = poolFor(rsm, roomId, npcId).filter(c =>
    c.repeat === 'notify' ? !visitNotified.has(c.id) : !rsm.isConversationRead(c.id),
  );
  return best(pool);
}
