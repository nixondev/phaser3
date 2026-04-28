# WARDEN — Design Paradigm

A reference for designing puzzle paths through the city. CLAUDE.md says
*what the game is*. ROADMAP.md says *what to build next*. AUTHORING.md
and EDITORGUIDE.md say *how to use the tools*. This file says *what
sentences you can write with the words the engine gives you* — so you
can design specific paths without reaching for new mechanics.

If a path you imagine can't be built from the patterns below, it's
either:
1. an invitation to extend the engine (one of the ROADMAP phases), or
2. a sign the path wants to be expressed differently using existing
   patterns.

The goal is **never** to write bespoke code per puzzle. Every puzzle is
data, composed from a small grammar.

---

## The game in one sentence

WARDEN is a sealed-city puzzle box where every interaction is `E + the
right item(s) on the right thing`, where every solved interaction can
permanently change the world or release new items, and where curing
afflicted residents introduces new playable bodies and new items into
the mix.

That's the whole rule. Everything below is variations.

## Locked constraints (read first)

The mechanical decisions that bound this grammar live in
`ROADMAP.md` § "Locked-in mechanics" — that's the canonical list. The
ones most relevant to puzzle design:

- **One verb (E), item-based, hint-shaped fail message.** A failed E
  confirms the target exists without telling the player what's
  needed. Mystery, not cruelty.
- **Per-character inventory; drop-and-pickup is the only hand-off.**
  Hand-offs are *geometry* puzzles — character A walks the item to a
  spot, character B walks there to retrieve it.
- **Event-tick time + one bespoke wall-clock deadline.** Every other
  timer ticks on game events, not seconds. Exactly one place in the
  city has a real-time pulse.
- **Full-snapshot save on key events; respawn-at-house on death.**
  No missable items, no unwinnable runs. The game is forgiving;
  the puzzles are the difficulty.
- **Every published target renders a sprite.** No invisible
  interactables. The maze is legible; the *solutions* aren't.
- **No bespoke code per puzzle.** Every puzzle is composed from the
  patterns below as data.

---

## The player's verbs

The complete list of what the player can do at any moment:

- **Move** (WASD / arrows)
- **Press E** on the nearest target — the only interaction verb
- **Open inventory** (Tab) and select an item
- **Drop** the selected item (Q)
- **Toggle flashlight** (F)
- **Switch active character** (Phase 4 — between recovered residents)
- **Read a document** (Phase 7 — modal of the item's `content`)

That's it. No combat, no minigames, no QTEs, no "guess the right
combination." If the player is stuck, they're stuck on **what item to
use where**, not on *how to interact*.

---

## The world's nouns

Every puzzle is built from these elements. Adding a new puzzle never
requires adding a new noun — it requires arranging existing ones.

### Rooms

- Defined in `rooms.json`, instantiated from a tilemap.
- Connected by **paired doors** — each door names a target room and
  target door; the matching door in the target room points back.
- A door can have `requires`: items, characters, or world flags that
  must be true to pass.
- Rooms can have reverb / music / dark properties (already wired).

### Tiles

- Three layers per room: Ground, Collision, Above.
- Painted via the F2 editor.
- Collision tiles block movement. Above tiles render over the player.
- Tiles can change at room-load based on world flags (Phase 5).

### Interactables (E-targets)

Every E-target is an interactable. Types include:

- **Sign** — shows a fixed string when E'd.
- **Item pickup** — adds an item to the active character's inventory.
- **Recharge** — refills flashlight battery.
- **Lock** — refuses passage / state change unless `requires` is met.
- **Container / planter** (Phase 3) — has a slot that holds an item;
  contents may transform over time or via state.
- **Generic interactable** — the universal shape: `requires` + `produces`.

The runtime resolver (Phase 1) reduces all of these to one function:
`tryInteract(target, party, worldState) → { ok, effects[] }`.

### Items

Each item has:

- `category` — key, cure, fuel, document, tool, component, ...
- `tileFrame` — visual sprite
- Optional `keyId`, `useTarget`, `content`
- Optional `state` (Phase 3) — current state in its state machine
- Optional `consumeOnUse` (Phase 1) — does using it destroy it?

Items can be:

- Held by a character
- Dropped in a room (persists per `roomId`)
- Held inside a container's slot
- Held inside an entity (`holds` array on afflicted/animals/machines)

### Item state machines (Phase 3)

An item can declare states and transitions. Transitions trigger on:

- **Time elapsed** (event-tick based, not real-time)
- **The item's container changing state**
- **The item's holder changing state** (the holder dies, gets cured)
- **A world flag being set**
- **The player re-entering the room with the item present**

A transition can:

- Change the item to a new state (and visually swap its tileFrame)
- Replace the item with a different item entirely (seed → potato)
- Drop new items into the world
- Set/clear world flags

### Entities

Player-shaped things in the world: afflicted, animals, NPCs, machines.
Each has its own state machine. Examples:

- Afflicted: `wandering` → `agitated` → `cured` → `recovered`.
- Animal (e.g. snake): `alive` → `fed` → `dead` (releases `holds`).
- Machine (e.g. generator): `off` → `on` (sets a world flag).

Entities can hold items internally (`holds: ItemDef[]`). On the right
state change, those items drop into the world like any other dropped
item.

### Characters (Phase 4)

A roster of recovered residents the player can switch between. Each:

- Has their own 12-slot inventory (per-character — hand-offs become
  puzzles).
- Persists in whatever room they were left in.
- Can be required by a `requires` rule (some interactions only work
  for a specific role).

Switching characters teleports the camera/control, not the bodies.

### World flags (Phase 5)

A `Set<string>` (or `Map<string, value>`) on `RoomStateManager`. Set or
cleared by interaction effects. Read by:

- Door `requires` ("if `bridge_repaired` is set, this door's requires
  is empty")
- Interactable `requires` ("only respond if `generator_on`")
- Tilemap layers ("if `passage_open`, remove this collision tile")
- Entity spawns ("if `cleared_for_market`, spawn this NPC")

Flags are how the past edits the present.

---

## The puzzle grammar (sentences)

Every puzzle is one or more of these patterns, optionally chained.
Listed in roughly increasing complexity.

### 1. Single-tool unlock

```
target.requires = [item_X]
target.produces = [consume(item_X), unlock_self]
```

Player finds item X, uses it on target. Target opens. Done.

> *Used to introduce a tool. Should be the first instance of that tool
> the player ever sees.*

### 2. Tool plus route

Single-tool unlock that opens a *route*, not just an obstacle. The
target itself isn't the prize — what's behind it is.

> *Most doors with `requiredKey` today are this. The skeleton key
> opens "the gated wing", not "the gated thing."*

### 3. Multi-item unlock

```
target.requires = [item_X, item_Y]
```

Two or more items needed simultaneously. May need two characters to
have collected them, may be one character carrying both (loadout
pressure).

### 4. Loadout tradeoff

The player's inventory is finite (12 per character). Some puzzles
require you *not* to have something else, or to choose between two
useful items. The puzzle is in deciding **what to leave behind**.

> *No special engine support — emerges naturally from inventory
> capacity once the world has more items than slots.*

### 5. Two-body succession

```
character_A does X in room R1
character_B does Y in room R2
order matters
```

Switch character; the inactive one persists. Their position becomes
state.

> *The simplest example: A holds a button down (an interactable with a
> "is being pressed" state), B walks through a door that requires the
> flag "button_held".*

### 6. Persistent world change

```
target.produces = [set_flag("X"), ...]
later, anything that reads flag "X" behaves differently
```

The defining pattern of the run. Every cure, every powered device,
every revealed passage is this.

### 7. Item transformation chain

```
item I in state A → trigger → item I in state B
or item I in state A → trigger → item J (a different item)
```

The seed-snake-key chain is this. Each step is a transformation. Each
transformation is data on the item.

> *This is where the game's puzzle texture comes from. A path that's
> just locks-and-keys is a checklist. A path that runs three or four
> transformations is a puzzle.*

### 8. Container puzzle

```
container.requires = [item with category Z]
container holds the item, runs its state machine
later, retrieve transformed result
```

The planter that grows the seed. The aquarium that holds the snake.
The crucible that melts the metal.

### 9. Holding puzzle

```
entity holds [item X]
entity's state changes (cure / kill / feed)
items in entity.holds drop into the world
```

The snake swallows the key earlier (off-screen — it's just `holds:
[key]` in the entity's data). When the snake dies, the key is dropped.

### 10. Late-game convergence

Multiple characters, multiple items, multiple flags, multiple rooms,
all required at once. The final exit. Composed entirely of patterns 1
through 9 — no new mechanic.

---

## How a path is constructed

A *path* is the player's solution route from "they wake up in
protag-house" to "they reach the exit." Paths are made by chaining
patterns until they reach the ending state.

A minimal path always answers:

1. **What does the player have at the start?** (Their initial
   inventory, the protagonist character.)
2. **What's the first locked thing they encounter that they can
   unlock?** (Single-tool unlock, pattern 1.)
3. **What does unlocking it give them?** (A new item, a new room,
   sometimes both.)
4. **What does that lead to?** (Another lock, another character
   recovery, another transformation chain.)
5. **What's the exit condition?** (A flag set, an item delivered, a
   final lock opened.)

A *good* path:

- Teaches the grammar implicitly. The first cure is a single-tool
  unlock so the player learns "items go on things." The first
  transformation chain is short (2 steps) so they learn items have
  states. By late game they've seen each pattern at least once.
- Has alternative routes. Two ways to unlock a given door (different
  items, different characters, different orders). The maze branches.
- Converges on the ending. All paths feed into the final convergence
  pattern (#10). The ending isn't just "find the exit" — it's "find
  it with everything you need."

A *bad* path:

- Requires a pattern the engine doesn't yet support.
- Has missable items (one-shot pickups that you can lose forever).
- Has unwinnable states the player can enter without warning.
- Requires the player to guess based on something the world didn't
  show them.

---

## The tools that build it

The complete authoring stack as it exists today. If a path needs
something that isn't here, it's a ROADMAP item, not a content task.

### Spawning rooms

```
npm run new-room <id> [width] [height]
```

Creates the rooms.json stub + default tilemap. Reload, walk in.

### Editor (F2)

- **Tile painting** (1/2/3 layers, Q/E to cycle, L-click paint, R-click
  erase, Alt/M-click eyedropper).
- **Resize map** (Shift+Arrow expand, Ctrl+Shift+Arrow shrink).
- **Place interactable** (`I` + click — snippet to clipboard).
- **Pair two doors** (`O` → pick target room with `,` `.` and Enter
  → click in source → auto-warp → click in target — two snippets to
  clipboard).
- **Place afflicted** (`N` + click — snippet to clipboard).
- **Drag afflicted** to reposition (snippet on release).
- **Save tilemap** (`X` — full JSON to clipboard, paste manually).

### Debug (F1, F3, F4, F5)

- **F1** — info HUD (FPS, room id, player coords, cursor coords, tile
  GIDs under cursor).
- **F3** — visual overlays (collision in red, doors in cyan,
  interactables in yellow, afflicted radii in magenta).
- **F4** — warp picker (Up/Down + Enter to teleport between rooms).
- **F5** — map overview (room graph copied + console + stats toast).

### Audio (live mixing while debug or editor is on)

- **R** cycles reverb profile.
- **`[`** / **`]`** adjust reverb wet mix.
- **`-`** / **`+`** adjust master volume.

### Saving content

Editor → clipboard → you paste. No background writes. Git is the safety
net. Workflow: edit, paste, save, reload, `git diff`, commit.

---

## Honest thoughts on the design space

What I'd watch for as you start building paths:

**The first cure is the most important authoring decision.** It's the
moment the player learns the entire grammar. Whatever item cures the
first afflicted, that item has to be findable through atmosphere alone
— signs, environmental clues, a sense of "this thing might fit." If
the first cure requires reading a document buried three rooms away,
you've taught the player the wrong rule.

**Item transformation chains are the gravity well of the design.**
Once Phase 3 lands, every interesting puzzle wants to lean on chains.
Don't over-use them at first. Pattern 1 (single-tool) and 2 (tool +
route) should make up most early puzzles. Save chains for the
mid-game when the player trusts the grammar.

**The maze should be a graph, not a tree.** A tree (every room reached
through one parent door) makes paths linear. A graph (multiple
incoming doors per room) lets you converge on rooms from different
directions, which lets *paths* converge — which is what makes the
late-game convergence pattern (#10) feel earned. Phase 0's `F5` map
overview is partly a tool for catching trees-where-you-wanted-graphs.

**Inventory pressure is a feature, not a bug.** When the player has
to drop something to carry something else, hand-offs to a second
character become real. If you size the inventory generously enough
that nobody ever has to drop anything, you've removed a whole puzzle
dimension. 12 slots × character is probably right; don't expand it.

**Recovered characters should each unlock something a previous
character couldn't.** Two items per recovered character means the
roster *grows the verb space*. If a recovered character's two items
just open more doors with old patterns, the recovery felt like a
checklist. If their items enable a *new kind of move* — a grappling
hook lets you skip rooms, a scanner lets you see hidden seams, a
toolbelt lets you disassemble obstacles — the recovery feels
generative.

**Persistent world changes are how the city remembers you.** A door
that locks behind you forever is annoying. A bridge that stays down
once you repair it is satisfying. Use flags for the second category.
Use them sparingly for the first.

**The exit should be the last thing you build.** Every other pattern
exists to give the player tools and knowledge. The exit gates on
those tools and that knowledge. If you design the exit first you'll
work backward and end up with a tree.

---

## Path-design template

Copy this for each path you want to build. Fill in the blanks. If
you can't fill a blank without inventing a new mechanic, stop —
that's a ROADMAP gap, not a content gap.

```
PATH: <name / pithy description>

START STATE
  Active character: ___
  Inventory: ___
  Visited rooms: ___
  World flags set: ___

GOAL STATE
  Player has: ___
  Player is in: ___
  World flags set: ___

STEPS
  1. [pattern #__] In room ___, the player ___ using ___,
     producing ___.
  2. [pattern #__] ___
  3. ___

NEW ITEMS INTRODUCED
  - ___ (state machine if any)
  - ___

NEW ROOMS NEEDED
  - ___

WORLD FLAGS USED
  - ___ : set when ___, read by ___
  - ___

CHARACTERS REQUIRED
  - <id> : carrying ___, must ___ in room ___
  - ___

FAILURE MODES
  - If player tries ___ without ___ : *nothing happens*
  - If player skips step __ : ___ becomes inaccessible (acceptable / unwinnable?)
  - If player drops ___ in room ___ : recoverable? yes/no

TEACHES (or USES) WHICH PATTERN(S)
  - ___

ALTERNATE SOLVE
  - Same goal reachable via ___ instead of ___?
```

A run is several paths layered on top of each other. The shortest
paths are sub-paths within longer ones. The exit is the last path,
and it requires several earlier paths to have been completed.

---

## How to use this file

When you sit down to design a puzzle:

1. Open this file. Re-read the puzzle grammar.
2. Open AUTHORING.md if you need to remember a key combo.
3. Open ROADMAP.md if your puzzle wants something Phase 0–5 hasn't
   shipped yet — that's a signal to either redesign the puzzle or
   ship the missing primitive first.
4. Copy the path-design template into a scratch file. Fill it in.
5. Build it: new rooms, paint, place interactables, paste snippets.
6. Walk it. If it solves, commit. If it doesn't, the failure mode is
   data — change the JSON.

The discipline: **never invent a new mechanic to solve a puzzle.**
Compose from existing patterns. If you can't, the engine grows; not
the puzzle.
