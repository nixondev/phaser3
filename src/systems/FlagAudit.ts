import roomsData from '@/data/rooms.json';
import conversationsData from '@/data/conversations.json';

/**
 * Dev-only flag hygiene check — the state-side sibling of the missing-words
 * warning. Walks rooms.json + conversations.json generically, collecting
 * every flag CHECKED ({ type: 'flag' | 'flagAbsent' }) and every flag SET
 * ({ type: 'setFlag' | 'setFlagDuration' | 'setFlagAfterDelay' }), then
 * warns on orphans in both directions:
 *
 *   - checked but never set  → the gate can never open (likely a typo)
 *   - set but never checked  → dead weight (or checked in code; verify)
 *
 * Duration/delay flags also count as "set" — a gate on a transient flag is
 * legitimate. Flags set or checked directly in code won't be seen here, so
 * warnings are hints, not errors.
 */
const CHECK_TYPES = new Set(['flag', 'flagAbsent']);
const SET_TYPES = new Set(['setFlag', 'setFlagDuration', 'setFlagAfterDelay']);

function walk(node: unknown, checked: Set<string>, set: Set<string>): void {
  if (Array.isArray(node)) {
    for (const item of node) walk(item, checked, set);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const obj = node as Record<string, unknown>;
  if (typeof obj.type === 'string' && typeof obj.value === 'string') {
    if (CHECK_TYPES.has(obj.type)) checked.add(obj.value);
    if (SET_TYPES.has(obj.type)) set.add(obj.value);
  }
  for (const value of Object.values(obj)) walk(value, checked, set);
}

/** Run once at startup in dev; logs warnings, returns them for tooling. */
export function auditFlags(): string[] {
  const checked = new Set<string>();
  const set = new Set<string>();
  walk(roomsData, checked, set);
  walk(conversationsData, checked, set);

  const warnings: string[] = [];
  for (const flag of checked) {
    if (!set.has(flag)) warnings.push(`flag "${flag}" is checked but never set by any produces`);
  }
  for (const flag of set) {
    if (!checked.has(flag)) warnings.push(`flag "${flag}" is set but never checked by any requires`);
  }
  for (const w of warnings) console.warn(`[flags] ${w}`);
  if (import.meta.env.DEV) {
    console.info(`[flags] audit: ${set.size} set, ${checked.size} checked, ${warnings.length} warnings`);
  }
  return warnings;
}
