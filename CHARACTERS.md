# WARDEN — Character Registry & Skin Assignment Plan (CHARACTERS.md)

Design + implementation plan for a first-class **character registry**
(`characters.json`), the cure→home→recovery progression rebuilt on top of it,
and an in-game **skin picker** for assigning spritesheets to characters.

Companion docs: `CLAUDE.md` (architecture), `SPRITEEDITOR.md` (the `$` editor
this feeds), `AUTHORING.md`, `WORDS.md`.

Status: **Group A implemented** (2026-07-17) — registry, data migration, and
engine rewiring are in; typecheck + production build pass. Groups B–D
(cure-path consolidation, F4 picker, docs) pending. Manual pass A7 pending.

Deviations from plan, group A:
- The startup audit checks refs/rooms/npc ids synchronously; sheet-PNG
  existence is not audited in-browser (a missing file surfaces as a Phaser
  loader error). A node-side check verified all referenced sheets exist.
- `SpriteEditorScene`'s non-dev fallback list and initial sheet selection now
  derive from the registry (were hardcoded).
- The `?` editor's afflicted snippet now emits `afflictedSheet` (extras
  shape) instead of `name/role/variant`.
- Doc updates to AFFLICTED.md / PARADIGM.md / WORDS.md examples were pulled
  forward from group D since the ids they showed no longer exist.

---

## 1. Motivation

Characters exist everywhere in the engine but nowhere in the data model:

- **Identity is duplicated and drifts.** A cast member with an
  `associatedRoom` needs a second afflicted entry in that room just to carry
  spawn coordinates — and that copy must duplicate `name` / `role` /
  `variant` / `playerVariant` for the entity constructor.
  `GameScene.findFullAfflictedDef()` reconciles the copies by guessing
  ("longest backstory wins"). Kai and Maren are each defined twice today.
- **The protagonist isn't data.** Texture `'player'` ← `player-good.png`
  hardcoded in `PreloadScene`, roster entry hardcoded in `GameScene`, bare
  anim keys (`walk-down`) special-cased in three branches of `Player.ts` —
  while the death-succession design treats the protag as one peer among the
  cast.
- **Sheets are hardcoded arrays** in `PreloadScene`; a freshly painted sheet
  from the `$` editor is invisible until someone edits source. Test-driving a
  skin on the main player requires editing `PreloadScene.ts:48`.
- **Five systems reference character ids with nothing to anchor to**:
  conversations.json `npc`, thoughts WHO, `character`/`trait` require
  conditions, per-character inventories, the planned 2-items-per-cure
  economy.
- **Anim-building is copy-pasted 4×** (Player ×2, Afflicted ×2) plus the
  sprite editor's preview variant.
- **Naming confuses**: `variant` = afflicted skin, `playerVariant` = human
  skin, and the file loaded as `'player'` is `player-good.png` (key ≠ file).

---

## 2. Data model

### 2.1 `src/data/characters.json` — the cast

One entry per named, curable/playable person. Keyed by character slug
(matches `words/dialog/<slug>/` namespaces).

```json
{
  "player": {
    "name": "…",
    "sheet": "player-good"
  },
  "kai": {
    "name": "Kai",
    "role": "Former Lab Technician",
    "sheet": "player-ranger",
    "afflictedSheet": "afflicted-walker",
    "home": { "room": "house-b", "x": 576, "y": 320 },
    "curedClue": "…",
    "backstory": ["words:dialog/kai/backstory-1", "…"],
    "recoveredItems": [ { "name": "Lab Keycard", "…": "…" } ],
    "traits": []
  }
}
```

Fields (all identity fields move here from `AfflictedDef`):

| Field | Notes |
|-------|-------|
| `name`, `role` | display identity |
| `sheet` | human spritesheet — **full basename = texture key** (`player-ranger`) |
| `afflictedSheet` | afflicted spritesheet basename; omit for never-afflicted (protag) |
| `home` | `{room,x,y}` — where they appear after cure. **Replaces `associatedRoom` + the duplicate room entry.** Omit → they recover in place. |
| `curedClue`, `backstory`, `recoveredItems`, `traits` | as today |
| `conversationRequires`, `conversationDialog`, `conversationProduces` | shared-memory dialog hooks, as today |

Dropped entirely: `cureCondition`, `recoveryUnlock` (declared in types,
never read — dead), `associatedRoom` (subsumed by `home`), `playerVariant`
and `variant` (replaced by full-basename `sheet` / `afflictedSheet`).

**Sheet naming rule:** a sheet field always holds the PNG basename, which is
also the Phaser texture key. No prefix assembly (`player-${v}`) anywhere.

### 2.2 `rooms.json` afflicted entries become placements

Two shapes, discriminated by the `character` field:

```json
// Cast placement — identity lives in the registry
{ "id": "kai", "character": "kai", "x": 1600, "y": 2000,
  "behaviorLoop": "wander" }

// Extra — anonymous ambience/hazard, identity inline, never joins the cast
{ "id": "street-sentinel-1", "name": "Unknown",
  "afflictedSheet": "afflicted-walker", "x": 2600, "y": 1400,
  "behaviorLoop": "sentinel" }
```

- Placement keeps all **behavior** fields: `behaviorLoop`, `wanderRadius`,
  `speedMult`, `soundRoom`, `paceAngle`/`paceLength`,
  `circleSpeed`/`circleStartAngle`, `holds`.
- `id` stays (unique per room) so the `?` editor's drag/save-object flow is
  untouched. For cast placements `id` = character slug by convention.
- Extras cannot be cured into the roster (no `character` → no registry entry
  → cure leaves them `cured` in place with the stock "needs time alone"
  line, exactly like today's clue-less residents).
- **Home rooms get no afflicted entry at all.** house-b's and house-c's
  arrays are deleted.

### 2.3 Id migration

`street-wanderer-1` → `kai`, `street-wanderer-2` → `maren`, everywhere ids
are strings: rooms.json placements, `conversations.json` `npc` fields,
any `requires` values, `died/<id>` flag references. Words keys already use
the slugs. No save-file compat concerns (state is runtime-only). The startup
audit (§5) catches stragglers.

---

## 3. Progression state machine (rebuilt, behavior-preserving)

Explicit stages per cast member, derived exactly as today from
`curedResidents` / `recoveredResidents`:

```
afflicted ──cure──▶ cured ──backstory finished──▶ recovered (roster)
```

Spawn rules in `GameScene.spawnAfflicted()` collapse to:

1. **Extras**: spawn from placement; cure leaves them in place.
2. **Cast, afflicted**: spawn from placement, `afflictedSheet`.
3. **Cast, cured**: if `home` exists, spawn at `home` **only in the home
   room** (nowhere else — including their old placement rooms); if no
   `home`, spawn at placement. Wears `sheet`.
4. **Cast, recovered**: never spawn as NPC (parked bodies, as today).
5. Active character never spawns as NPC (as today).

Cure moment (unchanged behavior): unlock all doors targeting `home.room`,
drop `holds`, show `curedClue`. The just-cured entity stays in the room for
the rest of the session (the "dazed" beat); on next room load rule 3 takes
over. `findFullAfflictedDef()` and the three suppression conditionals are
deleted.

Recovery (unchanged behavior): backstory pages in the home room, final page
→ roster (`textureKey` = registry `sheet`), 2 `recoveredItems` into their
personal inventory, entity → parked body.

---

## 4. Cure trigger — keep touch, isolate for flexibility

Cure-on-touch is **intended and stays**. But the trigger and the effect get
separated so the trigger policy can change without rewiring:

- Single entry point `applyCure(afflicted, cureItem, source)` with
  `source: 'touch' | 'interact' | 'debug'` — owns inventory consumption,
  state change, door unlock, held-item drop, clue dialog, camera shake.
- `handleAfflictedCollision` and any E-path both call it; **Debug C
  (cure-all) routes through it too**, fixing today's parity gap where
  debug cures skip door unlocks and held drops.

**Reserved v2 idea (do not build now): bait curing.** Drop a cure item near
an afflicted → they attack/consume it → `applyCure(…, 'bait')`. The pieces
already exist (Q drops items into the world; afflicted have proximity
awareness). If adopted, a per-character or global `cureStyle` field decides
`touch` vs `bait`. The `source` parameter is the socket for this.

---

## 5. Engine modules

| File | Change |
|------|--------|
| `src/systems/CharacterRegistry.ts` | **new** — loads `characters.json`; `get(id)`, `isCast(id)`, sheet lookups; startup audit (dev): placement `character` refs unknown, `home.room` unknown, sheets missing from disk (via list-sprites), `conversations.json` npc ids unknown — same spirit as `FlagAudit` |
| `src/entities/animHelpers.ts` (or in Entity) | **new** — `ensureCharacterAnims(scene, sheetKey)`: idempotently creates `<sheet>-walk/idle-<dir>` from the 4×4 convention. Single implementation. |
| `src/entities/Player.ts` | constructor takes a sheet key; bare-key special case deleted; `createAnimations`/`rebuildAnimations` → `ensureCharacterAnims` + `setSheet(key)` |
| `src/entities/Afflicted.ts` | constructor takes `(placement, characterDef \| null, status)`; both anim blocks → helper; `variant`/`playerVariant` fields → `afflictedSheet`/`sheet` |
| `src/scenes/GameScene.ts` | spawn rules §3; recovery/cure read registry; roster init from registry `player` entry; `findFullAfflictedDef` deleted; `applyCure` §4 |
| `src/scenes/PreloadScene.ts` | hardcoded variant arrays deleted. Prod: load every sheet referenced by registry + extra placements. Dev: additionally fetch `/__editor/list-sprites` and load **all** 256×256 sheets (so the picker and freshly painted sheets need no code edits). |
| `src/scenes/SpriteEditorScene.ts` | preview anims optionally reuse the helper (keep `spriteedit-` prefix) |
| `src/types/index.ts` | `CharacterDef`, placement types; dead fields removed |
| `src/systems/DebugManager.ts` | C routes through `applyCure`; F4 picker (§6) |

Note: `Afflicted` line count shrinks; `Player.ts` loses all three
`tk === 'player'` branches. UIScene avatars already render from
`CharacterState.textureKey` — no change.

---

## 6. F4 skin picker (dev tool — the test drive)

Debug overlay on **F4** (fits F1/F3 family; letter keys collide with
movement):

- Lists every loaded 256×256 sheet with a live idle-frame thumbnail
  (dev loads all sheets per §5, so the list is complete and synchronous).
- **Target = active character** by default; while open, clicking an
  afflicted or parked body in the room retargets the picker to them.
- Apply (click/Enter): live swap — `ensureCharacterAnims` + `setSheet`, and
  update the roster member's `textureKey` in `RoomStateManager` so it
  survives room transitions, character switches, and the HUD avatar row.
  Session-only until saved.
- **SAVE**: persists the assignment —
  - cast target → `POST /__editor/save-character` patches `sheet` (or
    `afflictedSheet` when the target is currently afflicted) in
    `characters.json`;
  - extra target → existing `save-object` (extended) patches
    `afflictedSheet` on the placement in `rooms.json`.
- No prefix policing: any sheet can be test-driven on anyone (that's the
  point of creation mode). Save writes whatever was chosen.

### New dev endpoint (`vite.config.ts`, `editorSavePlugin`)

`POST /__editor/save-character?id=<slug>` — body `{ field, value }`,
`field ∈ {sheet, afflictedSheet}`; validates slug against registry file,
atomic tmp+rename write of `characters.json`. Add to the startup hint line.

---

## 7. Task list

Ordered; each group is a commit. Per project testing policy: verify with
`tsc` + production build; manual browser checks are handed off (⚠).

### A. Registry + engine rewiring (atomic — data and readers switch together)
- [x] A1. `characters.json` (player, kai, maren) + types; dead fields
      removed from `AfflictedDef`; placement types.
- [x] A2. `CharacterRegistry` + startup audit.
- [x] A3. rooms.json migration: placements slimmed, ids renamed
      (kai/maren), house-b & house-c afflicted arrays deleted,
      extras keep inline identity; `conversations.json` npc ids renamed.
- [x] A4. `ensureCharacterAnims` helper; Player + Afflicted rewired onto it;
      bare `'player'` anim keys and prefix-assembly deleted.
- [x] A5. GameScene: spawn rules §3, registry-driven cure/recovery/roster
      init, `findFullAfflictedDef` deleted.
- [x] A6. PreloadScene: registry-driven sheet loading (prod) + load-all
      (dev).
- [ ] A7. ⚠ MANUAL: full progression pass — cure Kai on street (touch,
      holding cure), clue + door unlock, dazed line, house-b spawn,
      backstory pages, recovery, roster switch (1–2), death-succession
      still works, title-screen extras still wander.

### B. Cure path consolidation
- [ ] B1. `applyCure(afflicted, item, source)`; collision + interact paths
      call it.
- [ ] B2. Debug C routes through `applyCure` (doors + held drops now fire).
- [ ] B3. ⚠ MANUAL: C in city-street cures both cast members and unlocks
      their house doors.

### C. F4 skin picker
- [ ] C1. `/__editor/save-character` endpoint (+ `save-object` accepts
      `afflictedSheet` for extras).
- [ ] C2. Picker overlay: sheet list + thumbnails, click-to-retarget,
      live apply (RSM write-through).
- [ ] C3. SAVE wiring per target kind; status feedback; non-dev fallback
      message ("save only available in dev mode").
- [ ] C4. ⚠ MANUAL: paint a scratch sheet in `$`, save, reload, F4-apply to
      protag, walk through a door and switch characters (skin persists),
      SAVE, reload page, skin is the new default.

### D. Documentation
- [ ] D1. `CLAUDE.md`: characters.json in Key Files + state section, F4 in
      debug table, endpoint list, Adding Content → "Character" recipe.
- [ ] D2. `AUTHORING.md`: authoring a cast member (registry entry +
      placement + words namespaces).
- [ ] D3. Update this file's status line.

### Deferred / v2 (do not build now)
- Bait curing (`cureStyle`) — socket exists via `applyCure` source param.
- Watched walk-home beat / delayed home arrival (flag-based).
- Per-character 2-item economy fields in the registry.
- Sprite-editor "test drive" button (live patch into a running game).

---

## 8. Acceptance criteria

1. No character identity field appears in more than one place in the data;
   deleting either of the old duplicate entries is impossible because they
   no longer exist.
2. The protagonist's skin is a data field; changing `player`'s `sheet` in
   `characters.json` (by hand or via F4 SAVE) changes the game with no code
   edit.
3. Full cure→home→recovery progression behaves exactly as before the
   refactor (A7 pass).
4. A brand-new 256×256 PNG dropped into `public/assets/sprites/` is
   test-drivable via F4 after a page reload, with zero source edits.
5. Startup audit (dev) reports unknown character refs, missing sheets,
   unknown home rooms, and unknown conversation npc ids to the console.
6. Debug C produces the same world state as touching each afflicted with a
   cure in hand.
