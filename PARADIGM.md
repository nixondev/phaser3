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
- **Full run reset on any character death.** Death wipes all state and
  restarts from the beginning. No respawn, no mid-run save. The game is
  difficult; the puzzles are the difficulty.
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
- **Switch active character** (`1`/`2`/`3`/`4` keys or avatar bar click —
  between recovered residents in the roster)
- **Introspect** (click the player or `T` — inner-monologue thought;
  narration only, never puzzle state; pattern #13)
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
- Rooms can have reverb / music / weather / dark properties (already wired).

### Tiles

- Seven layers per room: Ground, OnGround, Collision, OnCollision, Above, OnAbove, Spectra.
- Painted via the editor (press `?` on title). Persistent solid color tiles also supported.
- Collision tiles block movement. OnCollision, OnGround, OnAbove, and Spectra are decorative.
- Above and OnAbove render over the player. Spectra renders above those, visible only via Flashlight + Adapter.
  on `RoomDefinition` in `AUTHORING.md`.

### Interactables (E-targets)

Every E-target is an interactable. Types include:

- **Sign** — shows a fixed string when E'd.
- **Item pickup** — adds an item to the active character's inventory.
- **Recharge** — refills flashlight battery.
- **Generic interactable** — the universal shape: `requires` + `produces`.
  Can represent locks, generators, containers, levers, dispensers — any
  interaction that needs conditions and side-effects.

The runtime resolver (`InteractionResolver.ts`) reduces all of these to
`checkRequires → consumeRequires → applyProduces`. Full field reference
in `AUTHORING.md`.

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

- `tool` items may gate `visibilityRequires` conditions on interactables — meaning some targets are invisible and un-promptable until the right tool is in the active character's inventory. The spectra-vision adapter works this way: interactables tagged `visibilityRequires: [spectra_adapter]` are invisible in normal flashlight mode and only appear when the adapter is held.

### Generators and fuel

A generator is a machine entity with states `off → powered → depleted`. Powered state is temporary — it lasts for a fixed number of event-ticks (or until the player leaves and returns, whichever comes first). While powered, world flags set by the generator are active; doors or interactables reading those flags become passable.

Fuel is an item with `category: fuel`. Using a fuel item on a generator transitions it from `off` to `powered`.

**Fuel acquisition — the environmental source pattern:**
```
source_interactable.requires = [item with category: container, subcategory: empty]
source_interactable.produces = [swap empty_can → fuel_can]
```

An empty container left at (or used on) a source — a leaking pipe, a storage drum, a residue pool — becomes a filled fuel container. The source is fixed geography. Finding sources, routing fuel to the right generator, and timing powered windows are all puzzle dimensions.

> *This is a specialization of the container puzzle (#8). The container is the item; the source interactable is the "planter." The transformation trigger is immediate on E rather than time-based.*

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

### Characters

A roster of recovered residents the player can switch between. Each:

- Has their own 12-slot inventory (per-character — hand-offs become
  puzzles).
- Persists in whatever room they were left in.
- Switches in via `1`/`2`/`3`/`4` or clicking their avatar in the
  bottom-left bar. Cross-room switches trigger a fade transition.
- Can be required by a `requires` rule (some interactions only work
  for a specific role — Phase 2).

Switching characters teleports the camera/control, not the bodies.

A recovered resident's data in `rooms.json`:

```json
{
  "id": "street-wanderer-1",
  "name": "Kai",
  "role": "Former Lab Technician",
  "x": 400, "y": 500,
  "behaviorLoop": "wander",
  "variant": "walker",
  "playerVariant": "ranger",
  "associatedRoom": "house-b",
  "curedClue": "...mumbles about the north block... chemicals...",
  "backstory": [
    "Page one dialog string.",
    "Page two.",
    "Final page — triggers recovery + item handover."
  ],
  "recoveredItems": [
    { "name": "Lab Keycard", "tileFrame": 8, "category": "key", "keyId": "lab-door" },
    { "name": "Compound Sample", "tileFrame": 9, "category": "component" }
  ]
}
```

`associatedRoom` controls where the cured resident reappears after
their first cure (they vanish from the original room and only appear
in the associated one). `curedClue` is shown in the cure dialog.
`backstory` pages are shown E-by-E; the final page triggers the full
recovery, roster addition, and item handover.

### World flags

A `Set<string>` on `RoomStateManager`. Set and cleared by `produces`
effects. Flags survive room transitions and save/load.

Read by:
- Interactable `requires: [{type:'flag', value:'...'}]` — gates the
  interaction on flag state
- Room `flagConditions` — applies tile / door / interactable mutations
  at room-load time when the flag is set

Flags are how the past edits the present. Every cure, every powered
machine, every discovered passage is a flag.

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

### 11. Character-specific insight

```
interactable.visibilityRequires = [character_A]
```

The interactable (and its `[E]` prompt) only appears when character A
is active. To any other character, the tile appears inert.

> *Used to represent specialized knowledge or senses. A Lab Technician
> sees a "Console" where others see a "Metal Box"; a Resident with
> sharp eyes sees a "Loose Floorboard" where others see "Stone." This
> forces the player to sweep rooms with different characters to find
> hidden seams.*

### 12. Inter-character conversation

```
resident_A.conversationRequires = resident_B_id
// resident_B must be present in the same room (active or parked body)
pressing E on resident_A while resident_B is in the same room
→ unique dialog unavailable in solo interaction
→ may produce world flags, item drops, or new dialog trees on both residents
```

Two recovered residents in the same room remember something together that neither can surface alone. The player must position both characters in the same space — which may require cross-room switches and deliberate routing — to trigger the conversation.

> *This is the social equivalent of the two-body succession pattern (#5). Where #5 is about actions in sequence, #12 is about presence in the same place at the same time. The puzzle is in knowing which two people need to meet, and getting them both there.*

The mechanic uses no new verb. E on a resident checks for `conversationRequires` the same way a lock checks `requires`. If the condition is met, the richer dialog fires. If not, the standard solo dialog fires — the player may not even know a richer version exists until they try again with the right company.

### 13. Introspection (thoughts)

```
click player (or T)
→ engine selects highest-priority thought matching
  WHO (character id / trait / all) ×
  WHERE (room, optional spot radius) ×
  WHEN (flags, items — plain RequireCondition[])
→ inner-monologue dialog; a '…' glyph over the player telegraphs an
  unread match (per-thought `glyph` override for special cases)
```

A second channel, deliberately outside the E grammar: **no items, no
puzzle writes, no failure state**. Thoughts are *readers* of world
state, exactly like endings — there is no `produces` field, on purpose.
A place anchors a *stack* of thoughts; progress selects the layer, so
the same room says something new as flags accrue. Repeat modes: `never`
(one read, gone), `silent` (re-readable, notified once), `notify`
(glyph re-lights every visit).

> *This is pattern #11 (character-specific insight) turned inward:
> different bodies read the same room differently. It is how the city
> is narrated without signs or documents — and it must never name a
> solution. An oblique nudge is the ceiling. All data, in
> `src/data/thoughts.json`; field reference in `AUTHORING.md`.*

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

Creates the rooms.json stub + default tilemap + music dir. Refresh,
click the room in the editor's left panel to visit it instantly.

### Editor (press `?` on title)

- **Tile painting** (1-7 layers, Q/E to cycle, P palette, L-click
  paint, R-click erase, Alt/M-click eyedropper, Ctrl+Z undo).
- **Resize map** (Shift+Arrow expand, Ctrl+Shift+Arrow shrink).
- **Place interactable** (`I` + click — snippet to clipboard; add
  `requires`, `produces`, `consumed` in `rooms.json`).
- **Pair two doors** (`O` → pick target room → click in source →
  auto-warp → click in target — two snippets to clipboard).
- **Place afflicted** (`N` + click, Q/E cycles variant — snippet).
- **Drag afflicted** to reposition (auto-saves position in dev).
- **Save tilemap** (`X` — auto-saves in dev, clipboard fallback).
- **Inspect object** — click any placeholder sprite; Properties panel
  in the right sidebar shows its full JSON with a Copy button.
- **Warp picker** — right-panel button or F4; **Audit** — top-bar button.

### Audio (live mixing in editor)

- **R** cycles reverb profile.
- **`[`** / **`]`** adjust reverb wet mix.
- **`-`** / **`+`** adjust master volume.

### Saving content

Editor → clipboard → you paste into `rooms.json` or the tilemap file.
No background writes in non-dev builds. Git is the safety net.
Workflow: edit → paste → save → reload → `git diff` → commit.

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

**The endings should be designed last and discovered first.** Don't author the ending states until the full puzzle chain exists and you can walk it. But plant the flags that gate them from the beginning — every gun use, every cure, every cave room entered should set a flag. The endings are just readers of those flags. If the flags exist, the endings can be written at any time.

**The game never tells the player there are multiple endings.** No hint, no achievement, no new game plus unlock. A player who gets the escape-alone ending and puts the game down has had a complete experience. A player who replays and discovers the shape changes has had a different complete experience. Both are valid. The game doesn't prefer one over the other — it just reflects what you did.

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
