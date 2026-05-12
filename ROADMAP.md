# WARDEN — Build Roadmap

This is a building plan for the **tools and primitives** that let
content be authored creatively. The story, the cures, the puzzle
chains — those will be recognized when we're standing in front of
them. Nothing in this file picks names, places items, or designs
puzzles. It only describes the engine pieces that have to exist for
those decisions to be cheap when they happen.

Companion docs:
- `CLAUDE.md` — the design *intent* (the "why").
- `PARADIGM.md` — the design *grammar* (what sentences you can write
  with the engine; how to compose puzzle paths from existing patterns).
- `AUTHORING.md` — the practical *recipe* (which keys, which files,
  the hands-on workflow).

This file is the *sequence* — what to build next so the grammar in
PARADIGM.md becomes more expressive.

---

## Locked-in mechanics (don't relitigate)

These are decided. Treat them as constraints; build to them. This
section is the single source of truth — `PARADIGM.md` and `CLAUDE.md`
both reference it.

### Interaction model

- **Everything is item-based.** Every interaction either works because
  the player has the right item(s) on the right target, or it doesn't.
- **One verb: E.** Walking near anything usable shows a `[E]` prompt.
  Pressing E:
  - if the target needs no item, runs the interaction
  - if the target needs an item and the player has it, runs the
    interaction
  - if the target needs an item and the player doesn't, shows a short
    hint-shaped "*something here, but not like this*"-style message —
    confirming the target is real but never naming what's needed,
    never tutorializing
- **Targets are general.** Signs, locks, containers, planters,
  machines, afflicted, animals, dropped items — all resolve through
  the same code path.
- **Visible-target rule.** Every E-target in a published room must
  render a sprite (a tileset frame). No invisible interactables; the
  player must always be able to *see* something to press E on.

### Locks and rules

- **`requires` is a list.** Locks can require multiple items, a
  specific character, or world-state flags. A single-item lock is
  just a 1-element list.

### Items and transformation

- **Items have states and can transform.** Triggers: time elapsed,
  container state, holder state, world flags, room re-entry.
  Transformations can swap one item for another and release new items.
- **Things hold things.** Containers (planters, aquariums, drawers)
  hold items. Entities (afflicted, animals, machines) hold items
  internally; on the right state change, those items drop into the
  world.
- **Chains span rooms and time.** A solution started in one room can
  resolve elsewhere later; the simulation ticks while the player
  isn't looking.

### Time semantics

- **Event-tick is the universal clock.** Time-based transitions
  advance on chosen game events (room transitions, E-presses, door
  openings, character switches, etc.) — not wall-clock seconds.
  Save/load stays trivial; pause never has to gate timers.
- **One bespoke wall-clock deadline is allowed**, somewhere in the
  city, hard-coded, with a visible signal and a retry path. Not a
  generalized system. Session-active time only (closing the game
  pauses it). One moment of "the world has a pulse without me," not
  a pattern.

### Characters and inventory

- **Cured residents become switchable playable characters.** Their
  recovery introduces two themed items into the world economy.
  Items are not bound to characters — anyone holding them can use
  them.
- **Per-character inventory.** Each playable body has its own 12-slot
  grid; switching changes what you're carrying. Inventory pressure
  is a puzzle dimension.
- **Drop-and-pickup is the only hand-off.** Items move between
  characters by being dropped in the world and picked up by another
  character. No trade window, no shared stash, no "give to" verb.
  Hand-offs become geometry puzzles by design.

### Run state and persistence

- **Save: full snapshot to localStorage.** One JSON blob, full state
  every save. Save fires on door transition and on key state changes.
  No deltas, no partial saves.
- **Full run reset on death.** Any character death wipes all state
  (`RoomStateManager.reset()`) and restarts the scene from scratch.
  The player wakes again as the protagonist with an empty inventory.
  No mid-run save, no respawn point.

### Tone and surface

- **Modern under the hood, retro on the surface — but not retro-cruel.**
  Pixel art, single-verb interaction, atmospheric storytelling. *No*
  missable items, no unwinnable runs without warning, no real-time
  deadlines that punish slow players, no obscure secret combinations
  with zero in-world hint. Mystery, not cruelty.
- **Constrained by the tech we chose.** Phaser 3 + TypeScript + Tiled
  + Vite + SpessaSynth. We adapt the design to the stack, not the
  stack to the design.

### Authoring discipline

- **Manual save flow.** The editor copies edits to your clipboard
  with a target file path; you paste, save, reload. No background
  writes. Git is the safety net. Frequent commits, casual messages.
- **No bespoke code per puzzle.** Every puzzle composes from the
  patterns in `PARADIGM.md`. If a puzzle requires a code change,
  it's a missing primitive — fix the engine, then the puzzle.

---

## What works today (build on this)

- Room transitions, collision layers, door zones, tilemaps.
- 12-slot per-character inventory with category-aware items.
- Afflicted state machine (wandering → agitated → frightened → cured → recovered).
- Per-room reverb and music driven from `rooms.json`.
- **Weather system**: `rain-mild`, `rain-hard`, `dripping` — data-driven from `rooms.json`
  (`weather` field), rendered via screen-space Graphics. Extends to new types with one
  class + one switch case.
- **Darkness + flashlight**: `dark: true` on a room enables a full-screen RenderTexture
  darkness overlay. The flashlight is a **pickup item** (category `tool`, keyId `flashlight`,
  tileFrame 50). Toggling it (F key) only works if the active character carries the item;
  dropping it extinguishes it. Another character can pick it up and use it. The flashlight
  cuts a cone through darkness; a small ambient circle is always visible around the player.
  Depth stack: LIGHTING=35 (darkness), beam glow=36, WEATHER=37 (always above darkness).
- `associatedRoom` spawn gating: uncured afflicted are invisible in their associated room;
  cured afflicted only appear there.
- **Dedicated EditorScene** (press `?` on the title screen). Gameplay is gameplay; editor
  is editor — no in-game overlay modes. DOM panels (top bar, room list, layer/tool buttons,
  keyboard cheatsheet, live status bar) wrap the Phaser canvas. Camera pan via middle-click
  drag or WASD; Ctrl+Wheel zooms. Right-click erases tiles. Status bar shows current
  layer/tile/tool/room dimensions every frame.
- Editor primitives: paint, layer isolation, stamp tool (T), tile palette (P), flood fill (F),
  rectangle tool (R), eyedropper (Alt+click or middle-click), resize (Shift+Arrow /
  Ctrl+Shift+Arrow), undo/redo (Ctrl+Z / Ctrl+Shift+Z, up to 50 steps per session),
  door pairer (O), warp picker (button or F4), save-to-clipboard (X / Save button),
  map audit (Audit button), hot-reload (L / Reload button).
- `npm run new-room <id> [w] [h]` CLI — creates the rooms.json stub, default tilemap,
  and `public/music/<id>/` directory. Atomic.
- Persistent dropped items per room.
- `RoomStateManager` singleton: inventory, collected items, unlocked doors,
  cured/recovered residents, dropped items, visited rooms, fuel, character roster,
  active character, per-character inventories, and **world flags** (`setFlag/clearFlag/hasFlag`).
- **Interaction resolver** (`InteractionResolver.ts`) — `checkRequires`, `consumeRequires`,
  `applyProduces`. Any interactable in `rooms.json` can now declare `requires` and `produces`
  to drive item consumption, flag changes, door unlocks, and item drops — no code per puzzle.
- **Save/load infrastructure** — `RoomStateManager.serialize()` / `loadFrom()` and
  `SaveManager` utility exist but are intentionally not wired. Every run starts fresh
  with a full `rsm.reset()`. The infrastructure is preserved for future use if the
  design decision changes.
- **Cure flow**: auto-cure on collision if cure item in inventory; cure item usable from
  inventory menu on adjacent afflicted.
- **Cure clue dialog**: `curedClue` in afflicted def shown in the cure message.
- **Home-room teleport**: cured/recovered afflicted with `associatedRoom` only spawn
  in that room, disappearing from their original location.
- **Recovery conversation**: multi-page `backstory[]` paged via E; final page transitions
  to recovered, hands two `recoveredItems` into the character's inventory.
- **Character roster + switching**: recovered residents join a roster. Keys `1`/`2`/`3`/`4`
  (or avatar bar click) switch the active character. Switching saves outgoing position,
  swaps inventories, and teleports control (cross-room if needed).
- **Avatar bar**: bottom-left HUD shows portrait icons for every roster member. Active
  character highlighted in yellow. Clickable.
- **Parked bodies**: inactive roster members in the current room render as static portrait
  sprites at their last position.
- **Door unlock on cure**: curing an afflicted with `associatedRoom` auto-unlocks any door
  leading to that room.
- **Two authored characters**: Kai (Former Lab Technician, house-b, Lab Keycard + Compound
  Sample) and Maren (Local Shopkeeper, house-c, Store Key + Supply Manifest).
- **Multi-tileset support**: core tileset (128 tiles, always loaded) + optional
  room-specific tilesets declared as `"tilesets": ["<name>"]` on any room. Each
  extra tileset is a PNG at `public/assets/tilemaps/<name>.png`. RoomManager loads
  all declared tilesets and passes them to `createLayer`. The editor palette shows
  all tilesets with labelled sections. Items/interactables reference room tiles with
  `"tilesetKey": "<name>"` + a local `tileFrame`. `TilesetResolver.ts` resolves
  `(tileFrame, tilesetKey)` → `{key, frame}` for all sprite-rendering paths.
- Core tileset: 128 tiles in an 8×16 grid (512×1024 PNG, 64px source / 16px display).
  Procedurally generated via `npm run regenerate-tiles`; composed by `npm run build-tiles`.

---

## Phase 0 — Town-building tools (DONE)

The town-building tools are complete. You can author the *entire town
blockout* at speed without touching the interaction engine.

**Shipped:**

- **Dedicated EditorScene** launched from the title screen via **`?`**.
  Gameplay and editor are fully separate scenes — no in-game toggle
  modes, no F1/F2/F3 overlays. DOM panels (top bar, room list,
  layer/tool buttons, cheatsheet, live status bar) wrap the Phaser
  canvas. Camera pan via middle-click drag or WASD; Ctrl+Wheel zooms;
  right-click erases tiles. `RoomEditorManager` and `DebugManager`
  reused via stub scene-coupling; `InputManager` not used in editor
  (avoids JustDown flag conflicts on shared keys).
- `npm run new-room <id> [w] [h]` CLI script — creates the rooms.json
  stub, default tilemap (perimeter walls + floor), and the
  `public/music/<id>/` directory. Atomic.
- Warp picker — button in UI or F4 shortcut. Up/Down to select a room,
  Enter to teleport (full transition), Esc to cancel. Player movement
  suspended while open.
- Door pairing — `O` opens the target-room picker (Up/Down, Enter),
  then two clicks (one in each room) emit a paired pair of door
  snippets with cross-referenced ids, inferred directions, and sensible
  spawn points. Auto-warps between rooms mid-flow.
- Map audit — Audit button. Dumps the full room graph to clipboard +
  console, shows summary stats ([OK]/[TODO]/[BROKEN]/[ONEWAY] door
  counts, unreachable rooms, orphan rooms).
- Tile palette UI (`P`) — clickable thumbnail grid of every tileset
  frame. Select with click; Q/E and eyedropper still track selection.
- Default-room stamp (`T`) — re-baselines the active room with
  `npm run new-room` content (floor everywhere on Ground, walls on
  Collision perimeter, Above cleared).
- Undo/redo — Ctrl+Z / Ctrl+Shift+Z, up to 50 steps. History cleared
  on room switch.
- NPC afflicted placement (`N`) — Q/E cycles through variant types
  (walker, bloater, crawler, husk, spitter, brute, ashrot, veinhost).
- Live status bar — shows current layer · tile index · tool ·
  room dimensions every frame in the DOM footer.

**Next:** Phase 1 — tighten and unify the interaction primitive.

---

## Phase 1 — Tighten and unify the interaction primitive (DONE)

**Shipped:**
- `handleInteractable()` unified dispatcher — routes through resolver when
  `requires`/`produces` are present, falls back to legacy type-switch.
- Dropped items and afflicted remain separate target types but resolve
  through the same priority/distance loop in `checkInteractables`.
- "Nothing reacts." feedback when E pressed with nothing in range.
- Door `requiredKey` removed; all locks use `requiredKeys: string[]` only.
- `consumedOnUse` flag on `ItemDef`; `consumed` flag on `InteractableDef`.
- Document reader (`DocumentReaderScene`) launched from inventory for
  `category: 'document'` items.

---

## Phase 2 — Rich `requires` and `produces` (DONE)

**Shipped:**
- `RequireCondition` — `type: 'item'|'character'|'flag'`, `value`, optional `consume`.
- `ProduceEffect` — `type: 'setFlag'|'clearFlag'|'unlockDoor'|'dropItem'`.
- `InteractableDef` extended with `requires?`, `produces?`, `consumed?`.
- `InteractionResolver.ts` — `checkRequires`, `consumeRequires`, `applyProduces`.
  Pure functions; GameScene handles sprite side-effects after resolution.
- `consumed` interactables disappear after one successful interaction via
  `rsm.collectItem` + sprite removal.
- Dropped-item produces spawn world sprites immediately in the same frame.

**Still outstanding:**
- `visibilityRequires` — hide interactable entirely when conditions not met.
  Add to Phase 6 authoring tools when puzzle design needs it.
- **Inter-character conversation — SHIPPED.** `conversationRequires`, `conversationDialog`, and `conversationProduces` on `AfflictedDef`. Pressing E on a recovered resident while the named roster member is present in the same room (active or parked body) triggers the unique multi-page dialog. Partner absent → default solo response, no indication a richer version exists. `conversationProduces` apply once per session on first completion. Full field reference in `AUTHORING.md`.

---

## Phase 3 — Item states and entity holds (PARTIAL)

**Shipped:**
- `holds?: ItemDef[]` on `AfflictedDef`. Items listed in `holds` are
  dropped into the world at the afflicted's position the moment they
  are cured (collision auto-cure or inventory cure). Enables the
  "holding puzzle" pattern (#9) — hide an item inside an NPC without
  the player knowing until they cure them.

**Still outstanding — item state machines:**
- Full `state` field + transition list on `ItemDef`.
- Simulation ticking on room load (advance state transitions that
  should have fired while player was away).
- Container puzzle pattern (#8) — an interactable that accepts an item
  and holds it while its state machine runs.

Build item state machines when the first puzzle actually needs
time-based or holder-state-based item transformation.

---

## Phase 4 — Roster and switching (DONE)

Shipped. Character state persists across room transitions. Remaining
gaps to address organically during Phase 8 content authoring:

- `CharacterState` persists `{ id, textureKey, roomId, x, y }`.
- `RoomStateManager` holds `roster[]`, `activeCharacterId`, and
  `characterInventories` map. Switching swaps the inventory array.
- `1`/`2`/`3`/`4` keys and avatar bar clicks trigger `switchToCharacter`.
- Cross-room switches trigger a full fade transition and room load.
- Drop-and-pickup is the only hand-off; no trade verb.

**Still outstanding (not blocking):**
- Save/load infrastructure exists (serialize/loadFrom/SaveManager) but is
  not wired — by design. Every run starts fresh.
- Characters left in a different room don't have a visual indicator
  on the map (low priority until Phase 5 world flags exist).

---

## Phase 5 — World flags and persistent room changes (PARTIAL)

**Shipped:**
- `worldFlags: Set<string>` on `RoomStateManager` with `setFlag`, `clearFlag`,
  `hasFlag`, `getFlags`. Serialized and restored with save data.
- `produces: setFlag/clearFlag` effects wire flags from any interaction.
- `requires: [{type:'flag', value:'...'}]` gates interactions on flag state.

**Still outstanding — flag-driven room mutations:**
- Tilemap-layer changes on room load ("if `bridge_repaired`, remove collision tile X,Y").
- Door `requires` driven by flags at room-load time.
- Interactable visibility gated by flags (`visibilityRequires`).

These need a `flagConditions` field on `RoomDefinition` and a pass inside
`RoomManager.loadRoom` that reads flags and mutates the live tilemap.
Build when the first puzzle actually needs it.

---

## Phase 6 — Puzzle authoring tools (PARTIAL)

**Shipped:**
- **Properties inspector** — click any interactable or afflicted
  placeholder sprite in the editor canvas; right panel shows the
  object's full JSON with a Copy button. Read + manual-edit workflow.
- **NPC variant cycling** — Q/E while armed (`N`) cycles afflicted
  variants before placing.

**Still outstanding:**
- In-editor form for `requires` / `produces` (currently JSON text edit).
- World flag list/toggle panel (see current flags, force-set/clear for
  testing without playing through to them).
- Test-from-here — set next player spawn at cursor for mid-chain testing.
- State snapshot/restore — save a full session state (flags, inventory,
  roster) and restore on demand; critical for testing late-chain puzzles
  without re-running prerequisites.

---

## Phase 7 — Document reader and lightweight save/load

Two small features. Out of strict-dependency order, but morale-
positive and immediate.

- **Document reader modal.** Selecting a `category: 'document'` item
  from inventory shows its `content` field full-screen until E.
- **`serialize()` / `deserialize()` on `RoomStateManager`.** Wire to
  `localStorage`. Save on door transition or inventory change. Single
  slot for now. Must include roster and per-character inventories
  (currently omitted).

---

## Phase 8 — Build chains (content, not engineering)

Now the engineering is done. Phase 8 is *authoring*. It exercises
every primitive Phases 0–6 just built.

If you find yourself reaching for a code change to make a chain work,
that's a sign Phases 0–6 missed a primitive. Stop, add the primitive,
then come back. The editor + `rooms.json` should be able to express
any chain the design wants.

### Content items flagged for Phase 8

- **The one gun / one bullet.** A single firearm placed in the world, findable before the cure mechanic is understood. If used on an afflicted, that resident is permanently gone. No mechanical punishment — the game remembers via a world flag and absent recovery content. Requires: item with `category: tool`, a `worldFlag` set on use, and the afflicted's `associatedRoom` content simply never becoming available.
- **Spectra-vision adapter.** A flashlight attachment found in the facility or cave area. Activates a secondary flashlight mode that reveals hidden interactables, boundary markers, and environmental lore invisible in normal mode. Implemented as a `tool` category item that gates a `visibilityRequires` condition on a new class of interactables. No new verb — same E + item grammar.
- **Fuel acquisition chain.** Empty fuel cans + environmental sources (leaking pipes, storage drums) = filled cans. Uses the container puzzle pattern: place an empty can item at a source interactable, wait one event-tick or re-enter the room, retrieve a filled can. Sources are fixed geography — finding them is part of the puzzle. Multiple generators need fuel; routing fuel to the right generator at the right time is a two-body or loadout puzzle.
- **Multiple endings — no announcement.** The ending that plays is determined entirely by world state at the moment the exit is used: which residents were recovered, which were killed with the gun, whether the caves were descended, whether the contained thing was resolved. No ending selection screen. No grade. The player experiences one ending per run and may not know others exist. Flagged ending states:
  - `escaped_alone` — exit used, fewer than half of recoverable residents cured
  - `escaped_with_hope` — exit used, majority recovered, outside rescue made possible via a specific flag
  - `escaped_understanding` — exit used, all recoverable residents cured, caves fully explored, spectra-vision reading complete
  - `resolved` — fourth ending, requires all of the above plus a specific action in the containment chamber
  - World flags set by gun use gate endings by absence — missing residents mean missing knowledge mean certain flags never get set. The game never explains the connection.

---

## Known issues to address in their phase

- **Master-key has no source.** Place one (Phase 8 content), drop the
  requirement on most of those doors (Phase 1 cleanup), or document
  them as deliberately gated for later content.
- **GameScene is large and does too much.** Extract things only when a
  phase actually needs to. Phase 1 will likely pull out the interaction
  resolver.
- **Editor edits don't survive HMR.** Vite re-evaluates `rooms.json`
  on hot-reload and resets the in-memory clone. Workflow: save (X),
  then full-reload page. Acceptable.
- **Reverb hot-swap can click.** Cosmetic; address whenever audio
  comes back into focus.
- **Save format is v1.** If the save schema changes (new fields added to
  `RoomStateManager`), bump `SAVE_KEY` in `SaveManager.ts` so stale saves
  don't break deserialization.

---

## Deliberate non-goals

Off-roadmap until the roadmap forces them.

- Tests beyond a single shape-tripwire on `RoomStateManager` after
  Phase 4.
- `build-tiles.cjs` / `generate-assets.cjs` deduplication.
- Expanding the audio / MIDI / SF2 toolchain.
- Multiplayer, online, cloud anything.

---

## How to use this file

- When something ships, **delete it** — keep the doc tight.
- When a new gap appears, add it under the right phase.
- Phases are not sprints. Move on when the current phase is *done
  enough that it doesn't block you*.
- The keystone question (now): **"What's the smallest piece of the
  town I want next, and which authoring tool am I missing to build it
  in under a minute?"** Phase 0 exists to make that minute real.
- The keystone question (eventually): **"What's the smallest puzzle
  chain I want to build, and which primitive am I missing to build
  it as data?"** Phases 1–6 exist so the answer to the second half
  is "none."
