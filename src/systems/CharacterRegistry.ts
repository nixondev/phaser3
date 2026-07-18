import charactersData from '@/data/characters.json';
import roomsData from '@/data/rooms.json';
import conversationsData from '@/data/conversations.json';
import { CharacterDef } from '@/types';

/**
 * The cast — every named, curable/playable person, keyed by slug.
 * Identity (name, sheets, home, backstory, recovered items) lives here;
 * rooms.json only places characters in the world. Anonymous extras never
 * appear in the registry.
 */
const characters = charactersData.characters as unknown as Record<string, CharacterDef>;

export function getCharacter(id: string): CharacterDef | null {
  return characters[id] ?? null;
}

export function isCast(id: string): boolean {
  return id in characters;
}

export function allCharacters(): Record<string, CharacterDef> {
  return characters;
}

/**
 * Every spritesheet basename the game references: cast sheets (human +
 * afflicted) plus inline extra sheets on room placements. PreloadScene loads
 * exactly this set in production.
 */
export function collectReferencedSheets(): Set<string> {
  const sheets = new Set<string>();
  for (const c of Object.values(characters)) {
    sheets.add(c.sheet);
    if (c.afflictedSheet) sheets.add(c.afflictedSheet);
  }
  for (const room of Object.values(roomsData.rooms)) {
    for (const p of (room as { afflicted?: { afflictedSheet?: string }[] }).afflicted ?? []) {
      if (p.afflictedSheet) sheets.add(p.afflictedSheet);
    }
  }
  return sheets;
}

/** Require/produce types whose `value` (or `characterId`) names a character. */
const CHARACTER_REF_TYPES = new Set(['character', 'characterPresent', 'characterCarries']);

function walkCharacterRefs(node: unknown, refs: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) walkCharacterRefs(item, refs);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.type === 'string' && CHARACTER_REF_TYPES.has(obj.type)) {
    if (typeof obj.value === 'string') refs.add(obj.value);
    if (typeof obj.characterId === 'string') refs.add(obj.characterId);
  }
  for (const value of Object.values(obj)) walkCharacterRefs(value, refs);
}

/**
 * Dev-only character hygiene check — the cast-side sibling of FlagAudit.
 * Warns on: placements referencing unknown characters, homes pointing at
 * unknown rooms, conversation npc ids not in the registry, and character
 * require-condition refs that match neither the registry nor a placement id.
 * (Sheet PNGs are not checked here; a missing file surfaces as a Phaser
 * loader error at startup.)
 */
export function auditCharacters(): string[] {
  const warnings: string[] = [];
  const roomIds = new Set(Object.keys(roomsData.rooms));
  const placementIds = new Set<string>();

  for (const [roomId, room] of Object.entries(roomsData.rooms)) {
    const placements = (room as { afflicted?: { id: string; character?: string }[] }).afflicted ?? [];
    for (const p of placements) {
      placementIds.add(p.id);
      if (p.character && !isCast(p.character)) {
        warnings.push(`room "${roomId}" places unknown character "${p.character}"`);
      }
    }
  }

  for (const [id, c] of Object.entries(characters)) {
    if (c.home && !roomIds.has(c.home.room)) {
      warnings.push(`character "${id}" has home in unknown room "${c.home.room}"`);
    }
    if (c.conversationRequires && !isCast(c.conversationRequires)) {
      warnings.push(`character "${id}" conversationRequires unknown character "${c.conversationRequires}"`);
    }
  }

  for (const conv of conversationsData.conversations) {
    if (!isCast(conv.npc)) {
      warnings.push(`conversation "${conv.id}" targets unknown npc "${conv.npc}"`);
    }
  }

  const refs = new Set<string>();
  walkCharacterRefs(roomsData, refs);
  walkCharacterRefs(conversationsData, refs);
  for (const ref of refs) {
    if (!isCast(ref) && !placementIds.has(ref)) {
      warnings.push(`character ref "${ref}" matches no registry entry or placement id`);
    }
  }

  for (const w of warnings) console.warn(`[characters] ${w}`);
  if (import.meta.env.DEV) {
    console.info(`[characters] audit: ${Object.keys(characters).length} cast, ${warnings.length} warnings`);
  }
  return warnings;
}
