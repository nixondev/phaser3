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
- Flashlight + cone detection, dark rooms.
- Editor: paint, layer isolation, drag afflicted, resize, save-to-disk
  via dev endpoints. Tile palette (P), flood fill (F), rectangle (R),
  undo/redo (Ctrl+Z), warp picker (F4), maze audit (F5), door pairer (O),
  default stamp (T).
- Debug HUD (F1) and visual overlays (F3).
- Persistent dropped items per room.
- `RoomStateManager` singleton tracking inventory, collected items,
  unlocked doors, cured/recovered residents, dropped items, visited
  rooms, fuel, character roster, active character, per-character inventories.
- **Cure flow**: auto-cure on collision if cure item in inventory; cure
  item usable from inventory menu on adjacent afflicted.
- **Cure clue dialog**: `curedClue` in afflicted def is shown in the cure
  message, hinting where to find them after recovery.
- **Home-room teleport**: cured/recovered afflicted with `associatedRoom`
  only spawn in that room, disappearing from their original location.
- **Recovery conversation**: multi-page `backstory[]` paged via E; final
  page transitions to recovered, hands two `recoveredItems` into the
  character's inventory.
- **Character roster + switching**: recovered residents join a roster.
  Keys `1`/`2`/`3`/`4` (or avatar bar click) switch the active character.
  Switching saves the outgoing position, swaps inventories, and
  teleports control (cross-room if needed).
- **Avatar bar**: bottom-left HUD shows portrait icons for every roster
  member. Active character highlighted in yellow. Clickable.
- **Parked bodies**: inactive roster members present in the current room
  render as static portrait sprites at their last position, so the player
  can see where they left each character.
- **Door unlock on cure**: curing an afflicted with an `associatedRoom`
  automatically unlocks any door in the world that leads to that room,
  so the player can follow the clue immediately.
- **Two authored characters**: Kai (Former Lab Technician, house-b,
  Lab Keycard + Compound Sample) and Maren (Local Shopkeeper, house-c,
  Store Key + Supply Manifest).

---

## Phase 0 — Town-building tools (DONE)

The town-building tools are complete. You can author the *entire town
blockout* at speed without touching the interaction engine.

**Shipped:**

- `npm run new-room <id> [w] [h]` CLI script — creates the rooms.json
  stub, default tilemap (perimeter walls + floor), and the
  `public/music/<id>/` directory (with a `.gitkeep`, ready for
  `track.mid` / `instruments.sf2` overrides). Atomic.
- F4 warp picker — Up/Down to select a room, Enter to teleport (full
  transition), Esc to cancel. Player movement is suspended while the
  picker is open.
- Door pairing — `O` opens the target-room picker (`,` / `.` cycle,
  Enter confirms), then two clicks (one in each room) emit a paired
  pair of door snippets with cross-referenced ids, inferred
  directions, and sensible spawn points. Auto-warps between rooms
  in the middle of the flow.
- F5 map overview — dumps the full room graph to clipboard + console,
  shows summary stats on screen ([OK]/[TODO]/[BROKEN]/[ONEWAY] door
  counts, unreachable rooms, orphan rooms). Audits the maze.
- Unwired-door visual flag — in the F3 overlay, doors with TODO or
  missing targetRoom/targetDoor now render in red instead of cyan.
  Spot the unfinished portals at a glance as you walk the city.
- Tile palette UI (`P`) — clickable thumbnail grid of every tileset
  frame, top-right of the viewport. Select with a click; selection
  highlights with a yellow outline; Q/E and eyedropper still work
  and the highlight tracks all selection sources.
- Default-room stamp (`T`) — re-baselines the active room with the
  `npm run new-room` content (floor everywhere on Ground, walls on
  the Collision perimeter, Above cleared). Useful for starting over
  on a room without losing its `rooms.json` entry or door wiring.

**Next:** Phase 1 — tighten and unify the interaction primitive.

---

## Phase 1 — Tighten and unify the interaction primitive

Once the town is laid out, the game loop is the universal `[E]` +
item-on-target rule. Get it airtight before anything else.

- Fold the parallel `interactable` / `dropped` / `afflicted` branches
  in `GameScene.checkInteractables` into a single resolver:
  *what is the nearest E-target, and what does pressing E do to it?*
- Standardize the "*nothing happens*" feedback. Same short string
  whatever the target. Centralized.
- Generalize `requiredKey` / `requiredKeys` into a `requires: string[]`.
  Single-item locks are just a 1-element list.
- Mark items as **consumed-on-use** vs. **not consumed** on the item
  definition, not on the lock.
- Treat dropped items as a special case of interactable (response =
  "pick up"). One target schema for everything.

After this, every interaction in the game is the same shape.

---

## Phase 2 — Rich `requires` and `produces`

Direct extension of Phase 1. Every interactable gets:

- **`requires`**: a list of conditions, ALL of which must be true.
  Each condition is one of:
  - an item id in the active character's inventory
  - the active character being a specific roster member
  - a world-state flag being set
- **`produces`**: a list of effects that fire on a successful E.
  Each effect is one of:
  - consume an item (or several)
  - set/clear a world flag
  - drop an item into the world at a position
  - transform the target's own state (the door becomes "unlocked",
    the planter becomes "planted")

This is one function: `tryInteract(target, party, worldState) ->
{ ok, effects[] }`. Everything past this phase is a use of it.

---

## Phase 3 — Item states and entity holds

The piece that makes long puzzle chains possible.

- **Items have a `state` field** (default `'default'`). State
  transitions are defined as a small list on the item definition.
  Each transition: from state X, when trigger Y, go to state Z.
  Triggers include:
  - time elapsed since entering this state
  - the item's container changing state
  - the item's holder dying / changing state
  - a world flag being set
  - the player re-entering the room with the item present
- A transformed item may also drop new items (a sprout drops a potato,
  the original seed is consumed) or set world flags.
- **Entities can hold items.** Afflicted, animals, machines all get
  a `holds: ItemDef[]` field. On state change (cure, feed, kill,
  power-on), the entity can release `holds` into the world.
- **Containers are interactables with a slot.** A planter is an
  interactable whose `requires` is "an item with category seed" and
  whose `produces` is "stick the item in this slot." That slot's
  contents then run their own state machine.
- **The simulation needs to keep ticking when you're not in the
  room.** When a room is loaded, run any item-state transitions
  that should have already fired based on elapsed time. (Cheap: store
  `enteredStateAt` timestamps; on room load, advance any state whose
  trigger has been met.)

After this phase, "plant a seed, leave, come back, feed the result to
something, that something dies and drops a key" is buildable as data.

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
- Save/load (Phase 7) doesn't yet serialize roster or character
  inventories — will be wired when Phase 7 ships.
- Characters left in a different room don't have a visual indicator
  on the map (low priority until Phase 5 world flags exist).

---

## Phase 5 — World flags and persistent room changes

Without this, "you cured them" is a checkbox, not a felt thing.

- Add a `worldFlags: Set<string>` (or `Map<string, value>`) to
  `RoomStateManager`.
- `produces` effects can set/clear flags.
- Door zones, interactables, tilemap layers, and entity spawns can
  read flags at room-load time (and live, where it's cheap):
  - "if `bridge_repaired`, this collision tile is removed"
  - "if `generator_on`, this door's `requires` is empty"
  - "if `passage_open`, spawn this new interactable"
- Flag-driven changes happen on the `RoomManager.loadRoom` path that
  already places door zones from `rooms.json`.

---

## Phase 6 — Puzzle authoring tools

This is what makes content cheap. Every Phase 8 puzzle chain should
be authorable in the editor without leaving the running game. (The
*town-building* tools live in Phase 0; this phase adds the
puzzle-piece tools that need the engine work from Phases 1–5.)

- **Place / edit interactables.** Click an empty tile, pick a target
  type from a dropdown, fill `requires`, fill `produces`, fill text,
  save.
- **Place / move doors.** Drag a rectangle, pick target room and
  target door from existing options.
- **Place afflicted / animals / NPCs.** Click to drop, fill name,
  role, holds, state machine.
- **Place containers / planters.** Same shape as interactables,
  with a slot that can be pre-populated.
- **Define item state machines.** A small editor for item
  definitions: states, triggers, transitions, what each transition
  produces.
- **Toggle / inspect world flags.** A list view with toggles, so a
  flag-gated puzzle can be tested without playing through to it.
- **Tile palette UI.** Replace Q/E cycling with a clickable thumbnail
  grid. Single biggest UX win for tile painting.
- **Test-from-here.** A key in editor mode sets the next respawn
  point at the cursor.
- **State snapshot/restore.** F5 saves a full session snapshot
  (roster + active char + inventories + flags + visited + door state +
  item-state timestamps); F9 restores. Critical for testing late-chain
  state without redoing prerequisites.

All of these write back through the existing dev endpoints
(`/__editor/save-tilemap`, `/__editor/save-object`) or simple
extensions of them.

---

## Phase 7 — Document reader and lightweight save/load

Two small features. Out of strict-dependency order, but morale-
positive and immediate.

- **Document reader modal.** Selecting a `category: 'document'` item
  from inventory shows its `content` field full-screen until E.
- **`serialize()` / `deserialize()` on `RoomStateManager`.** Wire to
  `localStorage`. Save on door transition or inventory change. Single
  slot for now.

---

## Phase 8 — Build chains (content, not engineering)

Now the engineering is done. Phase 8 is *authoring*. It exercises
every primitive Phases 0–6 just built.

If you find yourself reaching for a code change to make a chain work,
that's a sign Phases 0–6 missed a primitive. Stop, add the primitive,
then come back. The editor + `rooms.json` should be able to express
any chain the design wants.

---

## Known issues to address in their phase

- **Master-key has no source.** Place one (Phase 8 content), drop the
  requirement on most of those doors (Phase 1 cleanup), or document
  them as deliberately gated for later content.
- **GameScene is ~920 lines doing everything.** Extract things only
  when a phase actually needs to. Phase 1 will likely pull out the
  interaction resolver.
- **Editor edits don't survive HMR.** Vite re-evaluates `rooms.json`
  on hot-reload and resets the in-memory clone. Workflow: save, then
  full-reload page. Acceptable.
- **Reverb hot-swap can click.** Cosmetic; address whenever audio
  comes back into focus.
- **F3 overlay redraws every frame.** Cheap today; cache later.

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
