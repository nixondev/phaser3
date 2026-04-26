# WARDEN — CLAUDE.md

## Project Overview

A 2D top-down exploration / puzzle-box game built with TypeScript + Phaser 3.

The player wakes alone in a sealed city, discovers that the afflicted residents can be cured, and gradually turns the city from an empty machine into a navigable web of people, tools, shortcuts, and knowledge. There is no combat. The game is intended to be **short to execute, long to understand**: a first successful run should feel like solving a grand mechanism, while later runs collapse into elegant mastery.

Retro pixel-art aesthetic at 320×240 resolution with 3× zoom.

---

## Core Design Pillars

1. **Knowledge is the real progression**
   - The player is learning the city, not grinding stats.
   - A solved run should be dramatically faster than a blind one.
   - Notes, routes, code fragments, and system understanding matter more than raw accumulation.

2. **Characters introduce tools**
   - Curing a resident adds a new playable character.
   - Each newly recovered character introduces **two themed items** into the global puzzle economy.
   - Those items fit the character's role / identity, but are not permanently bound to that character.

3. **Items are swappable, inventory is the constraint**
   - If a character can carry an item, they can use it.
   - Puzzle complexity comes from **loadout decisions**, **item distribution**, and **where items are currently cached or dropped**.
   - Inventory pressure is a core puzzle tool.

4. **Multiple bodies matter**
   - The game is not just about having the right item.
   - Many puzzles should require two or more characters to act in sequence, in different places, or with different item loadouts.
   - Character switching is part of the puzzle language.

5. **The city is a sealed puzzle box**
   - The outer city map is an abstraction of the entire city exterior.
   - Building shells, sealed gates, rooftops, tunnels, hidden passages, and future interiors all feed the same world-scale mechanism.
   - The final exit should feel like the culmination of many threads, not a detached final level.

---

## Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:8080
npm run build        # tsc + vite build (outputs to /dist)
npm run preview      # Serve production build
npm run setup        # Generate placeholder assets (scripts/generate-assets.cjs)
npm run drums        # Build custom drum patches (scripts/build-drums.cjs)
npm run midi         # Generate custom MIDI files (scripts/generate-goblins-midi.cjs)
```

---

## Tech Stack

- **Phaser 3** (v3.80.1) — game engine, arcade physics, tilemaps, scene management
- **TypeScript 5.4** — strict mode, ES2020 target
- **Vite 5.4** — dev server and bundler
- Assets: Tiled JSON tilemaps, PNG spritesheets (16×16 tiles)

---

## Path Aliases (tsconfig.json)

```text
@/        → src/
@scenes/  → src/scenes/
@entities/→ src/entities/
@systems/ → src/systems/
@utils/   → src/utils/
```

---

## Architecture

### Scene Stack

```text
Boot → Preload → Menu → Game (+ UI in parallel) → [Pause overlay]
```

`GameScene` and `UIScene` run in parallel — UI listens to events emitted by Game.

### Key Files

| File | Purpose |
|------|---------|
| `src/scenes/GameScene.ts` | Main loop: movement, afflicted AI, inventory, room transitions, dialog, interaction |
| `src/scenes/UIScene.ts` | HUD: room name, interact prompt, dialog box, inventory grid |
| `src/systems/RoomStateManager.ts` | Singleton — all persistent game state |
| `src/systems/RoomManager.ts` | Tilemap loading, collision layers, door zone setup |
| `src/systems/InputManager.ts` | Keyboard input; `getState()` for continuous, `getTapState()` for menus |
| `src/systems/TransitionManager.ts` | Fade-in/out between rooms |
| `src/systems/MusicManager.ts` | MIDI music player — singleton; supports parallel proximity layers |
| `src/lib/Timidity.ts` | WebAssembly MIDI synthesizer wrapper with GainNode control |
| `src/entities/Player.ts` | Player sprite, movement, animations |
| `src/entities/Afflicted.ts` | Afflicted resident entity — state machine, wandering AI, agitation |
| `src/entities/Entity.ts` | Base sprite class (Player extends this) |
| `src/entities/Direction.ts` | Enum: UP, DOWN, LEFT, RIGHT |
| `src/utils/Constants.ts` | All numeric constants |
| `src/types/index.ts` | All TypeScript interfaces and types |
| `src/data/rooms.json` | World definition — rooms, doors, items, afflicted, interactables |

---

### Audio & Proximity Systems

The game uses a custom WebAssembly-based MIDI synthesis system via `libtimidity`.

- **MusicManager:** Singleton that handles global background music and parallel "proximity" audio players.
- **Proximity Layers:** Allows multiple MIDI tracks to play in sync, with volumes controlled by distance to game objects (e.g., Afflicted residents or specific landmarks like the Clinic door).
- **Custom Assets:** MIDI files are often generated via scripts (e.g., `scripts/generate-goblins-midi.cjs`) to target specific FreePats instruments.

---

### Customizing Audio Assets

The game uses GUS-compatible `.pat` files for instrument synthesis. You can override any MIDI instrument or drum sample.

#### Overriding via freepats.cfg
1.  **Locate `public/timidity/freepats.cfg`**: This file maps MIDI program numbers (bank) and drum notes (drumset) to `.pat` files.
2.  **Edit mapping**:
    - For instruments: `[program_number] [path_to_pat]` (e.g., `0 Tone_000/my_piano.pat`)
    - For drums: Inside a `drumset 0` block, `[midi_note] [path_to_pat]` (e.g., `35 Custom_000/my_kick.pat`)
3.  **Volume/Panning**: You can add optional parameters like `amp=120` or `pan=center` to the config line.

#### Converting WAV to .pat
The project includes a utility to convert 16-bit mono WAV files into GUS patches:
```bash
node scripts/wav2pat.cjs -n <midi_note> <input.wav> <output.pat>
```
- `-n`: Sets the root MIDI note (default 60/Middle C). For drums, this should match the GM drum note.
- **Requirements**: WAV must be 16-bit PCM, mono.

#### Batch Conversion (Drums)
`scripts/build-drums.cjs` automates converting a folder of drum samples:
1.  Uses `ffmpeg` to normalize/downsample (44100Hz mono).
2.  Calls `wav2pat.cjs` for each sample.
3.  Backs up and rewrites `freepats.cfg` with the new `Custom_000/` paths.

---

## State Management

`RoomStateManager` is a singleton (`RoomStateManager.getInstance()`). It currently tracks / should continue to support:

- `inventory: (ItemDef | null)[]` — 12-slot array (2×6)
- `collectedItems: Set<string>` — by interactable `id`
- `unlockedDoors: Set<string>` — by door `id`
- `curedResidents: Set<string>` — afflicted who have been cured
- `recoveredResidents: Set<string>` — cured residents who have spoken and entered the playable cast
- `poweredDevices: Set<string>` — devices the generator has powered
- `generatorFuel: number` — fuel available for the generator
- `droppedItems: Map<roomId, DroppedItemState[]>`
- `visitedRooms: Set<string>`
- `tutorialShown: boolean` — whether the initial control help has been displayed

### Important future state direction

As the puzzle-box design solidifies, state should also be able to support:

- **character roster / active character switching**
- **which character is currently carrying which item**
- **persistent world changes** (gates opened, relays activated, passages revealed, power rerouted)
- **run-critical knowledge variables** if any are surfaced in-world
- **soft-doom states** if a run becomes non-winning but still informative

The long-term goal is that **world state is persistent, but player understanding is the real metaprogression**.

---

## Afflicted Entity (`src/entities/Afflicted.ts`)

State machine with 4 states:

- **wandering** — drifts slowly near origin point, blue tint, gentle wobble. Emits proximity sound.
- **agitated** — triggered at 40px player proximity, flees from player, red tint, fast wobble. Calms at 80px distance. Faster than wandering. Emits proximity sound.
- **cured** — stands still, green tint. Interactable (E prompt). Proximity sound stops.
- **recovered** — stands still, no tint. Interactable (repeat dialog / role delivery / character unlock logic). No proximity sound.

**Current implementation behavior:** If the player overlaps with an agitated / wandering Afflicted, the screen shakes, fades out, and the player respawns at the `protag-house`.

**Current design direction under consideration:** the full game may eventually become harsher, including the possibility of a full-run reset on death. If that happens, the design must ensure that:
- solved early-game content becomes fast to replay,
- failed runs still teach something useful,
- the game remains fair because knowledge meaningfully compresses future runs.

Each afflicted is defined in `rooms.json` with fields like: `id`, `name`, `role`, `x`, `y`, `behaviorLoop`.

On room entry, `GameScene` spawns afflicted and checks `RoomStateManager` to set initial state.

---

## Character / Item Model

### Core rule

**Unlocking a new recovered character introduces two new items into the game.**

Those items:
- should match the character's role / vibe,
- are initially associated with that character,
- can later be dropped, picked up, and used by other characters,
- are constrained by inventory space.

### Design implications

This means:

- **characters introduce possibility**
- **items enable actions**
- **multiple bodies enable sequencing**

Recovered characters matter because they are:
- narrative identities,
- the source of new tools,
- additional bodies that can be positioned in the world,
- participants in multi-step puzzles.

### Example

A rooftop / maintenance-oriented character might introduce:
- **grappling hook**
- **maintenance key**

The grappling hook is item-gated, not character-gated:
- anyone can access a grapple point,
- but only if they are carrying the grappling hook.

A scientist might introduce:
- **scanner** (reveals hidden passages / secret seams / concealed conduits)
- **lab credential** or other research-related item

Again, those tools can be swapped between characters once introduced.

---

## Item Categories

| Category | Purpose |
|----------|---------|
| `key` | Unlocks a door or keyed system by `keyId` |
| `component` | Piece of something larger, useless alone or used in crafted/systemic puzzles |
| `fuel` | Powers the generator or a specific device |
| `cure` | Applied to an afflicted resident (mechanic TBD) |
| `document` | Readable lore — has `content` field with text |
| `tool` | Traversal / utility / puzzle-solving item |
| `credential` *(optional)* | Institutional access token / badge / pass if later separated from generic keys |

`ItemDef` fields: `name`, `tileFrame`, `category`, `keyId?`, `useTarget?`, `content?`

### Tool design guideline

Every major tool should be documented with:
- what it unlocks,
- where it can be used,
- what inventory cost it imposes,
- whether it is a required route, an alternate route, or a shortcut tool,
- what other items it meaningfully competes with.

---

## Puzzle Grammar

The game should feel nonlinear to the player, but be built from a small number of repeatable puzzle types.

### Core puzzle types

1. **Single-tool unlock**
   - One item, one obstacle, one immediate result.
   - Used to teach a tool.

2. **Tool plus route**
   - One item grants access to a space that matters elsewhere.

3. **Loadout tradeoff**
   - One character cannot carry every needed item.
   - The puzzle is in deciding who carries what.

4. **Two-body succession**
   - Two characters must do related actions in sequence, often in different places.

5. **Persistent world-change puzzle**
   - One action permanently changes the city for all future traversal in the run.

6. **Late-game simultaneous dependency**
   - Multiple characters, each with specific items, must complete a coordinated chain across multiple locations.

### Design rule

Prefer:
- **solution branches** (multiple ways to solve or approach the same problem)

Over:
- **content branches** (large amounts of unique one-off content)

This keeps the puzzle box deep without exploding scope.

---

## Final Exit / Ending Structure

### Current direction

The final exit should be a **convergence point** reached by understanding the city, not by simply filling a population quota.

The likely shape is:

- one final exit or gate,
- one code / mechanism that unlocks it,
- many threads across the city that reveal how to derive or assemble that final solution.

### Important principle

The final code should not feel like a random scavenger hunt.

Instead, it should function as:
- a summary of what the player has learned,
- the culmination of multiple story / infrastructure / character threads,
- proof that the player understands how the city works.

### Note-taking and knowledge

A likely direction is to allow / encourage:
- player memory,
- personal note-taking,
- reconstruction through repeated discovery,

without over-automating the solve in UI.

The game can ask the player to **remember and synthesize**.
It should not ask them to **guess because crucial information was presented unfairly**.

### Endings

Multiple endings should ideally come from:
- world state,
- who was cured,
- what systems were activated,
- what truths were discovered,
- what final choice was made at the exit,

rather than from building totally separate endgame zones.

---

## Run Structure / Failure Philosophy

### Target feeling

The game should be:

**short to execute, long to understand**

A fully informed run may be very short. That is a feature, not a flaw, if the first successful solve feels earned.

### Failure philosophy under consideration

The game may eventually support:
- hard resets on death,
- doomed runs,
- soft-lock-like states that are informative rather than unfair,
- learning runs vs winning runs.

### Important distinction

Avoid hidden unwinnable states that simply waste time.

Better forms of failure:
- the player realizes a route is compromised,
- a resource was misused,
- the run is no longer the winning run,
- but the player still learns something important before restarting.

This keeps restart compatible with the knowledge-game structure.

---

## Key Constants (`src/utils/Constants.ts`)

```text
Display:    320×240 @ 3× zoom, 16px tiles
Player:     80 px/s speed, 8 fps animations
Interact:   28px range
Inventory:  2 rows × 6 cols, 14px slots
Depth:      GROUND=0, ENTITIES=10, PLAYER=20, ABOVE=30, UI=40, TRANSITION=50
```

---

## Input Bindings

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move |
| E | Interact / use item / dismiss dialog |
| F | Toggle Flashlight |
| TAB | Toggle inventory |
| Q | Drop selected inventory item |
| ESC | Pause menu |
| - / + | Adjust Volume (in Pause menu) |

### Likely future bindings / interactions

As character switching becomes real, reserve room in the control scheme for:
- switching active character,
- selecting off-screen / inactive characters if needed,
- interacting with multi-character puzzle interfaces.

---

## Event Bus (GameScene → UIScene)

Events emitted by GameScene:
- `room-changed` — room name string
- `inventory-changed` — full inventory array
- `inventory-mode` / `inventory-cursor` — inventory UI state
- `show-interact-prompt` / `hide-interact-prompt`
- `dialog-open` / `dialog-close`
- `door-unlocked`

Likely future additions:
- `character-switched`
- `roster-changed`
- `world-state-changed`
- `run-reset`
- `tool-acquired`
- `passage-revealed`

---

## Room / World Data (`src/data/rooms.json`)

### World structure direction

The current outer city map is the **entire city exterior in compressed / abstracted form**, not just one district. Interiors can be much larger than their exterior footprints. This is intentional.

That means:
- exterior shells are symbolic / navigational,
- interior maps are allowed to expand for better puzzle and atmosphere design,
- placeholder buildings can exist in the city long before their interiors are authored.

### Current practical structure

- **Outer city:** `city-street` — currently the main exterior puzzle field, sealed perimeter, building markers, future entrances, city landmarks
- **Residential interiors:** currently centered on the protagonist house and a small set of early apartments / community spaces
- **Future interiors:** can be added gradually without needing one-to-one exterior scale fidelity

### Authoring rule

Use the city exterior to imply:
- future buildings,
- future routes,
- sealed exits,
- rooftop access,
- tunnel access,
- hidden infrastructure,
- civic / commercial / residential identity,

even if the actual interiors come later.

This allows linear production while preserving puzzle-box breadth.

---

## Tilemap Conventions

- Tiled JSON format, 16×16 tiles
- Shared tileset `tileset.png`
- Layer named `Collision` is used for physics collisions
- Layer named `Above` renders above the player (depth 30)
- `mapKey` in `rooms.json` must match the key used in `PreloadScene` when loading the tilemap

### Current tileset direction

The expanded tileset now supports a stronger city blockout language, including:
- dark pavement / cracked pavement / overgrowth / rubble
- exterior wall / barricade / reinforced wall / locked gate
- street lamps / benches / trash / crates / cameras / dead screens
- manholes / generators / electrical panels
- door frames / dark windows / memorial marker

This should be used to make the outer city feel like a sealed, abruptly abandoned civic machine rather than an empty prototype arena.

---

## Recommended Design Documents

To keep the project buildable, each major system should have its own compact reference sheet.

### 1. Character sheet
For each recovered character:
- role / identity
- item A introduced
- item B introduced
- what each item unlocks
- what old spaces become newly meaningful
- what multi-body puzzle types this character enables

### 2. Puzzle sheet
For each major puzzle:
- name
- goal
- required bodies
- required items
- optional substitute items
- ordered steps
- persistent world changes
- what it unlocks next

### 3. Tool sheet
For each major tool:
- unlock language
- where usable
- inventory cost
- route type (required / optional / shortcut)
- tool conflicts / tradeoffs

### 4. Ending sheet
For each ending family:
- required knowledge
- required world state
- required characters / tools
- final choice
- epilogue conditions

---

## Roadmap

### Current implementation reality

- Basic exploration, room transitions, inventory, and afflicted state machine exist.
- The game already supports an eerie non-combat tone.
- The city exterior and a handful of interiors exist as the first blockout layer.
- Placeholder worldbuilding through documents / interactables is already a strong fit for the design.

### Near-term production priority

Build the project in this order:

1. **One canonical route**
   - protagonist
   - first cure
   - first newly introduced character
   - one meaningful new tool
   - one route to one ending state

2. **Character-switch foundation**
   - make the roster real
   - support swapping active characters
   - persist item ownership / current carrier / dropped items

3. **One example multi-body puzzle**
   - not just item possession
   - actual succession in different places

4. **One knowledge-based end condition**
   - code or equivalent mechanism derived from a few threads

5. **One alternate solve**
   - same destination, second method

Only after that should the design grow outward.

### Longer-term roadmap

- additional recovered characters
- additional tool families
- rooftop / scanner / tunnel puzzle language
- persistent world-state changes
- multiple ending states
- optional harsher run structure / restart-on-death if the shortened mastery loop is good enough to support it

---

## Open Design Decisions

These are the major questions still in motion:

- **Cure mechanic**
  - Is curing item-based, environmental, contextual, or hybrid?

- **Character switching**
  - Can switching happen anywhere, or only at safe points / linked bodies / specific stations?

- **Inventory model**
  - Are all items one-slot?
  - Are there large items?
  - Do key items compete with utility items in the same grid?

- **Dropped item persistence**
  - Are dropped items globally persistent within the run?
  - Can items be deliberately cached to create route planning?

- **Run reset severity**
  - Respawn to house vs full-run reset on death
  - At what point does the game become fair enough for harsher failure?

- **Final exit logic**
  - Code fragments?
  - Code derivation from multiple truths?
  - One gate with many outcomes, or one gate with branching consequences?

- **Soft-doom states**
  - How clearly should the game communicate that a run is still informative but no longer optimal / winnable?

---

## Game Design Reference

**Premise:** The player wakes alone in a sealed city and finds the afflicted residents still trapped inside. They can be cured. Each recovered person reintroduces tools, perspective, and presence back into the city's logic. The ultimate goal is to understand the city's hidden structure well enough to reach and open the forgotten exit.

**Tone:** Eerie, sad, and quiet. Not combat horror. Not gore. Dead tech everywhere — blank monitors, dark windows, cameras watching nothing. A city that was interrupted rather than destroyed.

**The afflicted:** They are not zombies. They are looping people — organized, repetitive, wrong. Disturbing because their behavior feels procedural and almost purposeful.

**Core twist:** Curing someone does not just "save an NPC." It expands the playable system:
- new character,
- two new themed items,
- new body for sequencing puzzles,
- new routes through the city.

**Lore delivery:** Mostly environmental. Documents, signage, silent rooms, power systems, sealed gates, partial records, recovered residents speaking in fragments.

**City philosophy:** The city should feel larger than what is currently explorable. Placeholder shells, sealed entries, rooftop silhouettes, tunnels, and hidden passages should imply a wider mechanism that can be filled in over time.

**Target feel:** A puzzle box that becomes elegant under mastery. First runs are exploratory and uncertain. Solved runs are sharp, deliberate, and surprisingly short.
