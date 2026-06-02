# WARDEN — CLAUDE.md

Companion docs (read in the right context):
- This file (`CLAUDE.md`) — design intent and architecture reference.
- `EDITORGUIDE.md` — short how-tos for the editor (start here if you're
  new to the tools).
- `AUTHORING.md` — practical recipes for the editor and the full
  rooms.json field reference (requires, produces, flags, holds, etc.).
- `PARADIGM.md` — design grammar: what puzzle patterns the engine
  supports and how to compose paths from them. Read before designing.
- `ROADMAP.md` — build sequence: what's shipped, what's next.
- `TESTING.md` — editor and game test checklists. Run this after any
  significant authoring or engine change.

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

6. **The flashlight is the primary relationship**
   - The flashlight is the player's only defense (repel), their only light source in dark rooms, and — once the spectra-vision adapter is found — their tool for reading the hidden infrastructure of the city.
   - Battery management is the moment-to-moment tension of the game.
   - The arc from survival tool → world reader is intentional. The same object that kept the afflicted away eventually reveals what the afflicted are.
   - The spectra-vision adapter does not replace the repel function. It adds a reading mode. The player must choose when to use each.

7. **Characters remember together what they can't remember alone**
   - Recovered residents can have conversations with each other that neither could have with the protagonist alone.
   - These conversations surface memories, realizations, or information that only emerges from two specific people being in the same room and talking.
   - Example: the lab technician and the maintenance worker together remember an access route or a procedure that neither recalls independently.
   - This mechanic rewards curing multiple residents and positioning them together — another dimension of the multi-body puzzle language.
   - Mechanically: pressing E on a recovered resident while another specific recovered resident is in the same room triggers a different dialog tree than pressing E on them alone. No new verb. Same grammar.

---

## Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:8080
npm run build        # tsc + vite build (outputs to /dist)
npm run preview      # Serve production build
npm run setup        # Full asset setup (generate maps + build tileset)
npm run build-tiles  # Compose individual PNGs into tileset.png
npm run regenerate-tiles # Procedurally recreate base tile source images
npm run migrate-tiles # Extract combined tileset into individual files
```

---

## Tech Stack

- **Phaser 3** (v3.90.0) — game engine, arcade physics, tilemaps, scene management
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
| `src/scenes/MenuScene.ts` | Title screen and main menu |
| `src/scenes/BootScene.ts` | Minimal scene for initial engine setup |
| `src/scenes/PreloadScene.ts` | Asset loading (sprites, tilemaps, MIDI files, instruments) |
| `src/systems/RoomStateManager.ts` | Singleton — all persistent game state |
| `src/systems/RoomManager.ts` | Tilemap loading, collision layers, door zone setup, runtime `resizeMap()` |
| `src/systems/InputManager.ts` | Keyboard input; `getState()` for continuous, `getTapState()` for menus |
| `src/systems/TransitionManager.ts` | Fade-in/out between rooms |
| `src/systems/MusicManager.ts` | MIDI music player — singleton; supports parallel proximity layers; reverb cycle |
| `src/systems/WeatherManager.ts` | Creates and destroys weather effects on room transitions; data-driven from `rooms.json` |
| `src/systems/RainEffect.ts` | Screen-space rain overlay (mild / hard modes) using Phaser Graphics |
| `src/systems/DrippingEffect.ts` | World-space drip particles for cave/pipe rooms using Phaser Graphics |
| `src/systems/DarknessOverlay.ts` | Full-screen RenderTexture darkness layer; erases ambient + flashlight cone each frame |
| `src/systems/Flashlight.ts` | Cone detection, battery drain, glow rendering, screen-space RT mask for darkness |
| `src/systems/DebugManager.ts` | F1 info HUD, F3 visual overlays, audio mixing & global debug shortcuts |
| `src/systems/RoomEditorManager.ts` | F2 live tile/object editor: paint, layer isolation, drag, resize, save |
| `src/lib/SpessaSynthPlayer.ts` | Wrapper for SpessaSynth MIDI/SF2 engine. |
| `src/systems/AudioEffectsManager.ts`| Web Audio reverb and spatial processing. |
| `src/entities/Player.ts` | Player sprite, movement, animations |
| `src/entities/Afflicted.ts` | Afflicted resident entity — state machine, wandering AI, agitation |
| `src/entities/Entity.ts` | Base sprite class (Player extends this) |
| `src/entities/Direction.ts` | Enum: UP, DOWN, LEFT, RIGHT |
| `src/utils/Constants.ts` | All numeric constants |
| `src/types/index.ts` | All TypeScript interfaces and types |
| `src/data/rooms.json` | World definition — rooms, doors, items, afflicted, interactables |
| `vite.config.ts` | Build config + dev-only `editorSavePlugin` (POST /__editor/save-* endpoints) |

---

### Room Loading & Navigation

Rooms are defined in `src/data/rooms.json`. `RoomManager` handles the instantiation of tilemaps and collision layers based on these definitions.

1.  **Tilemap Layers**: Every room tilemap must have three layers: `Ground`, `Collision`, and `Above`.
2.  **Door Zones**: Doors are defined with `targetRoom` and `targetDoor`. `RoomManager` creates invisible zones; when the player overlaps one, `TransitionManager` handles the visual fade and `RoomManager` swaps the map.
3.  **Interactables**: Static objects defined in `rooms.json` that the player can interact with (E prompt).
4.  **Parallel UI**: `UIScene` runs alongside `GameScene`. Communication is handled via the Phaser event bus (`this.events.emit` in `GameScene`, `this.gameScene.events.on` in `UIScene`).

---

### State Persistence

`RoomStateManager` (singleton) tracks everything that survives a room transition:

- **Inventory**: A fixed 12-slot array (`(ItemDef | null)[]`).
- **World State**: Sets of IDs for `visitedRooms`, `collectedItems`, `unlockedDoors`, `curedResidents`, `recoveredResidents`, `poweredDevices`.
- **Dropped Items**: A `Map<roomId, DroppedItemState[]>` that stores items dropped by the player in specific rooms.

---

### Input Management

`InputManager` abstracts keyboard handling:
- `getState()`: Used for continuous movement (isDown).
- `getTapState()`: Used for menu navigation and one-shot actions (JustDown).

---

### Audio & Proximity Systems
The game uses a modern SoundFont-based MIDI synthesis system via `SpessaSynth`.

- **Engine**: SpessaSynth (SoundFont-native, low-latency AudioWorklet).
- **MusicManager**: Singleton managing background music, room-specific assets, and parallel proximity layers.
- **AudioEffectsManager**: Manages Web Audio effects like room-specific Reverb using `ConvolverNode`.
- **Proximity Implementation**: Logic for distance-based volume is in `MusicManager.updateProximityVolume` and called from `Afflicted.ts` or `GameScene.updateClinicProximity`. Note: Proximity players currently use the `global.sf2` SoundFont.

### Audio Workflow & Asset Structure

#### Directory Structure
Audio assets are organized by `room-id` (from `rooms.json`) in the `public/music/` directory:
- `public/music/global.sf2`: The master fallback SoundFont.
- `public/music/main_theme.mid`: The master fallback MIDI track (also used for the City).
- `public/music/[room-id]/track.mid`: Room-specific musical theme.
- `public/music/[room-id]/instruments.sf2`: Room-specific SoundFont override.
- `public/music/reverb/[type].wav`: Impulse Response files for environmental reverb.

#### Overriding Assets
1.  **Music**: To change a room's music, place a MIDI file named `track.mid` in `public/music/[room-id]/`.
2.  **Instruments**: To use specific sounds for a room, place an SF2 file named `instruments.sf2` in `public/music/[room-id]/`.
3.  **Fallback**: If a room folder is empty (except for `.gitkeep`), the engine uses `global.sf2` and `main_theme.mid`.

#### Setting Room Reverb
Reverb is **data-driven from `src/data/rooms.json`**. Each room may declare:
- `reverb`: one of `city`, `indoor`, `sewer`, `hospital`, `substation` (omit for the `city` fallback).
- `reverbMix`: optional 0..1 wet mix (defaults to **0.3**).

`MusicManager.playRoomMusic(roomId)` reads these on every door transition, so updating `rooms.json` is the only thing needed to change a room's acoustic. Live mixing (R / `[` / `]`) in debug mode overrides the data temporarily for the rest of the session.

#### Composer Workflow
1.  Use **Sforzando** (VST) with the `global.sf2` or your specific `.sf2` in your DAW to compose.
2.  Export the MIDI as `track.mid`.
3.  (Optional) Use **Polyphone** to strip unused instruments from your `.sf2` to create a lightweight `instruments.sf2` for that specific room.
4.  Drop files into the corresponding `public/music/[room-id]/` folder.

---

### Asset & Tileset Workflow

The project supports a **core tileset** shared by all rooms plus **room-specific tilesets** loaded on demand. All tilesets follow the same format: 8-column PNG grids of 64×64 tiles at `public/assets/tilemaps/<name>.png`.

#### Core tileset pipeline (`tileset.png`)
- **Individual Source Tiles**: Source images in `assets_src/tiles/` as individual PNGs named with a numeric prefix (`00_pavement.png`, `01_brick_wall.png`, …).
- **Composer**: `npm run build-tiles` combines them into `public/assets/tilemaps/tileset.png` (8×16 grid, 128 tiles). Tile slot = numeric prefix.
- **Regeneration**: `npm run regenerate-tiles` recreates procedural source tiles.
- **Migration**: `npm run migrate-tiles` extracts `tileset.png` back into individual files.
- **Generation**: `npm run generate-assets` creates Tiled JSON stubs but does NOT overwrite the PNG.

#### Adding a tile to the core tileset
1. Add a 64×64 PNG to `assets_src/tiles/` with the desired slot prefix (e.g. `51_new_floor.png`).
2. `npm run build-tiles` — recomposes `tileset.png`.
3. The tile is available immediately in the editor palette and via `tileFrame: 51`.

#### Room-specific tilesets
Any room can declare additional tilesets alongside the core. Each is loaded automatically at startup.

**rooms.json:**
```json
{
  "id": "clinic",
  "tilesets": ["clinic-tiles"],
  ...
}
```

**Requirements:**
- PNG at `public/assets/tilemaps/clinic-tiles.png` (same 8-col 64px format).
- The room's Tiled JSON must list `clinic-tiles` as a second tileset with the correct `firstgid` (core ends at 128, so room tileset starts at 129).
- In Tiled: add the PNG as a tileset, paint with it, export the JSON.

**Referencing room-specific tiles in items/interactables:**
```json
{ "tileFrame": 3, "tilesetKey": "clinic-tiles" }
```
Omit `tilesetKey` to use the core tileset (all existing content is unaffected).

**`TilesetResolver.ts`** (`src/utils/TilesetResolver.ts`) — maps `(tileFrame, tilesetKey)` → `{key, frame}` for sprite rendering. Used by GameScene world sprites, UIScene inventory icons, EditorScene placeholders.

#### Tileset conventions
- `tileFrame` = 0-indexed local frame within the tileset (not the Tiled GID).
- Tiled GID = `firstgid + tileFrame`. The engine handles this automatically.
- Core tileset: `firstgid: 1`, frames 0–127, GIDs 1–128.
- First room tileset: `firstgid: 129`, frames 0–N, GIDs 129–128+N.
- The editor palette shows all tilesets for the current room with labelled sections.

#### Visual Notes
- **Maintenance Tunnel**: The "black rectangle" in narrow rooms like `substation-tunnel` is `Exterior Wall` (GID 2). Edit `assets_src/tiles/01_exterior_wall.png` to change its look.


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

State machine with 5 states:

- **wandering** — drifts slowly near origin point, blue tint, gentle wobble. Emits proximity sound.
- **agitated** — triggered at 240px player proximity, chases the player, red tint, fast wobble (300px/s). Calms at 480px distance. Emits proximity sound.
- **frightened** — triggered when the flashlight cone hits a wandering or agitated afflicted. They flee (400px/s). Transitions back to wandering when far enough from player (600px). Sentinels are immune to this state.
- **cured** — stands still, green tint. Interactable (E prompt). Proximity sound stops.
- **recovered** — stands still, no tint. Interactable (repeat dialog / role delivery / character unlock logic). No proximity sound.

**Current implementation behavior:** If the player overlaps with an agitated / wandering Afflicted, the screen shakes, fades out, and the player respawns at the `protag-house`.

**Current design direction under consideration:** the full game may eventually become harsher, including the possibility of a full-run reset on death. If that happens, the design must ensure that:
- solved early-game content becomes fast to replay,
- failed runs still teach something useful,
- the game remains fair because knowledge meaningfully compresses future runs.

Each afflicted is defined in `rooms.json` with fields like: `id`, `name`, `role`, `x`, `y`, `behaviorLoop`.

On room entry, `GameScene` spawns afflicted and checks `RoomStateManager` to set initial state.

**`associatedRoom` spawn rule:** If an afflicted has an `associatedRoom` field, they are *excluded* from that room until they are cured. Once cured, they *only* appear in that room and vanish from their original location. This means the same afflicted entry can exist in both rooms in `rooms.json` — the engine gates visibility by cure state automatically.

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
Depth:      GROUND=0, ENTITIES=10, PLAYER=20, ABOVE=30, HIDDEN=31,
            LIGHTING=35, WEATHER=37, UI=40, TRANSITION=50
```

`HIDDEN` (31) is reserved for objects the flashlight will reveal.
`LIGHTING` (35) is the darkness RenderTexture. `WEATHER` (37) sits above
the darkness so rain/drips are always visible regardless of dark state.

---

## Input Bindings

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move |
| E | Interact / use item / dismiss dialog |
| F | Toggle Flashlight (only if active character holds an item with `keyId: "flashlight"`) |
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

### Room atmosphere fields

Each room in `rooms.json` may declare:

| Field | Type | Effect |
|-------|------|--------|
| `weather` | `'rain-mild' \| 'rain-hard' \| 'dripping'` | Spawns the matching weather effect on room entry |
| `drips` | `Array<{x,y}>` | Explicit drip positions for `dripping` mode; auto-scattered if omitted |
| `dark` | `boolean` | Enables full-screen darkness overlay with ambient circle + flashlight cone cutout |
| `reverb` | string | Room acoustic profile |
| `reverbMix` | number 0..1 | Wet mix for reverb (default 0.3) |

**Dev workflow note:** `rooms.json` is a static import resolved when the Vite dev server starts. Adding a *new* field (e.g. `dark`, `weather`) requires a server restart (`Ctrl+C` → `npm run dev`) and hard browser refresh (`Ctrl+Shift+R`) before the new field is visible at runtime. Changing *existing* values (coordinates, text) hot-reloads normally.

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

- Tiled JSON format, 16×16 tiles displayed (64×64 source).
- Every room must have three layers: `Ground`, `Collision`, `Above`.
- `Collision` layer drives physics collision (`setCollisionByExclusion([-1])`).
- `Above` renders over the player (depth 30).
- `mapKey` in `rooms.json` must match the key passed to `PreloadScene`.
- Multiple tilesets per room are supported — see **Asset & Tileset Workflow** above.

### Core tileset contents

128 tiles in an 8×16 grid. Covers the city blockout language:
- Pavement / cracked pavement / overgrown / rubble
- Exterior wall / interior wall / locked gate / barricade / reinforced wall
- Floor tiles (indoor, carpet, metal, sewer)
- Street furniture (lamp, bench, trash, crates, camera, dead screen)
- Infrastructure (manhole, generator, electrical panel, pipe H/V, grating)
- Signage (door frame, dark window, memorial marker)
- Nature (bush, dead tree, 3×3 large tree)
- Items (document, fuel canister, flashlight, flashlight charger)

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

For the canonical, current list of locked-in mechanics, see
`ROADMAP.md` § "Locked-in mechanics" — that's the source of truth.
This section captures only what's still genuinely undecided.

### Resolved (see ROADMAP.md for full text)

- Cure mechanic — **item-based**. Stand next to an afflicted, press E
  with the right cure item, they transition to cured.
- Character switching — **switching exists between recovered residents**;
  trigger pattern (anywhere vs. station-locked) settles during play.
- Inventory model — **per-character 12-slot grid**, drop-and-pickup is
  the only hand-off mechanism.
- Dropped item persistence — **globally persistent within a run**,
  per-room. Items can be deliberately cached.
- Run reset severity — **respawn-at-house** on death. No full-run-reset
  for now; harsher mode is a maybe-later.
- Time semantics — **event-tick is universal**; exactly one bespoke
  session-active wall-clock deadline allowed.
- Save/load — **no save game**. Every run starts fresh; `rsm.reset()` fires
  on game start. The serialize/loadFrom infrastructure exists but is not
  wired — preserved in case the decision changes.
- Feedback when E does nothing — **a generic hint-shaped string**
  confirming the target is real but never identifying the right item.
- Visible-target rule — **every published interactable must render
  with a tileset frame**.

### Still open

- **Final exit logic — partially resolved.** The exit is a single physical location. What varies is the *state the player arrives in* — who they saved, what they understand, whether they went into the caves. These determine which ending plays. Endings are not announced or graded. The game never tells the player there are multiple endings. Confirmed ending shapes:
  - **Escape alone.** Exit found, minimal understanding, some or all residents unrecovered. The city stays sealed. You got out.
  - **Escape with hope.** Enough residents recovered, exit opened in a way that makes outside rescue possible. You didn't just escape — you made return possible.
  - **Escape with understanding.** Caves descended, the thing seen, spectra-vision read, all recoverable residents cured. The ending reflects complete knowledge of what Warden was and what happened. Not a better escape mechanically — a complete one.
  - **Stay.** A fourth ending for a player who understands everything and chooses resolution over escape. What resolution means for the thing in the caves is a late-game authoring decision.
  - The cure economy is the primary differentiator. Crystals are limited. The order and target of cures determines which endings remain reachable. The game never explains the consequences of any individual decision.
- **Soft-doom states.** How clearly should the game signal that a run
  is still informative but no longer winning? Not blocking anything.
- **Run-reset escalation.** Whether/when the game ever becomes
  fair enough to support a harsher death model. Re-evaluate after the
  first full solve loop exists.
- **Final canonical solve route.** Specific story / characters /
  items / room geography. Will be authored when the tools support it
  end-to-end (Phase 8 in `ROADMAP.md`).
- **Cave descent as win condition.** Whether reaching the exit requires descending to the containment chamber, or whether descent is optional depth. The answer affects the final convergence pattern (#10 in PARADIGM.md).
- **What the contained thing is.** Geological, biological, or stranger. Undecided. Will be answered when the cave rooms are authored.

---

---

## Debug & Editor Systems

Three orthogonal toggles, all wired through `InputState` from `InputManager`:

| Key | System | Purpose |
|-----|--------|---------|
| **F1** | `DebugManager` | Info HUD: FPS, room id/dims, music + reverb (live), volume, player + cursor coords, tile GIDs under cursor |
| **F2** | `RoomEditorManager` | Live tile painter + object editor (see below) |
| **F3** | `DebugManager` | Visual overlays: collision (red), door zones (cyan), interactables (yellow), afflicted radii (magenta) |

When F1 or F2 is active, these global debug shortcuts apply:

| Key | Action |
|-----|--------|
| **R** | Cycle reverb profile (`MusicManager.cycleReverb`) |
| **[ / ]** | Decrease / increase reverb wet mix (5% steps) |
| **- / +** | Decrease / increase master volume |
| **L** | Hot-reload current room from disk |
| **U** | Unlock all doors in current room |
| **C** | Cure all afflicted in current room |
| **Shift + Click** | Teleport player to cursor |

### Live Room Editor (F2)

| Key | Action |
|-----|--------|
| **1 / 2 / 3** | Switch active layer (Ground / Collision / Above); inactive layers dim to 20% |
| **Q / E** | Cycle selected tile index |
| **L-Click** | Paint selected tile |
| **R-Click** | Erase tile |
| **M-Click / Alt + L-Click** | Eyedropper (pick the tile under cursor) |
| **Shift + ←/→/↑/↓** | Expand the map by one tile on that edge |
| **Ctrl + Shift + ←/→/↑/↓** | Shrink the map by one tile on that edge |
| **L-Click + drag** on afflicted | Reposition (release saves to `rooms.json` in dev) |
| **X** | Save the current tilemap (writes `public/assets/tilemaps/<roomId>.json` in dev; downloads file in prod) |

Resizing rebuilds the underlying Phaser tilemap (which is otherwise fixed-dimension) and shifts every coord-bearing field of the room — doors, interactables, afflicted spawns, player spawn, dropped items — by the equivalent pixel offset, so the room stays internally consistent. The player is shifted too.

### Dev-only Save Endpoints

`vite.config.ts` registers an `editorSavePlugin` (`apply: 'serve'`, so it does not ship in production) that handles two POST routes:

- `POST /__editor/save-tilemap?roomId=<id>` — writes the JSON body to `public/assets/tilemaps/<id>.json` (atomic via tmp + rename).
- `POST /__editor/save-object` — body `{roomId, kind: 'afflicted'|'interactable', id, x, y}`; patches the matching entry in `src/data/rooms.json`.

`RoomEditorManager` calls these via `fetch()` when `import.meta.env.DEV` is true. With this in place, the editor flow is end-to-end: edit in-game → save → reload page → edits persist. `roomId` is regex-validated and writes are checked against the tilemaps directory to prevent path traversal.

---

## Workflow: Adding New Content

### Adding a Room
1.  **Create Tilemap**: Use Tiled to create a 16×16 tile JSON map. Include layers: `Ground`, `Collision`, `Above`. Export to `public/assets/tilemaps/`. *Alternative:* clone an existing tilemap, then enter the room in dev and use F2 + Shift+Arrow to resize and paint in-engine — `X` saves to disk.
2.  **Add to rooms.json**: Define the room in `src/data/rooms.json`.
    - Set `id`, `name`, `mapKey`, `tilemapPath`, `width`, `height`.
    - Set `reverb` (`city`/`indoor`/`sewer`/`hospital`/`substation`) and optional `reverbMix`.
    - Optionally set `dark: true` for a darkness overlay, `weather` for rain/dripping effects.
    - Add `doors`, `interactables`, and `afflicted` as needed.
    - **After adding any new field**, restart the dev server and hard-refresh the browser.
3.  **Register Asset**: In `src/scenes/PreloadScene.ts`, add the `this.load.tilemapTiledJSON(room.mapKey, room.tilemapPath)` call.

### Adding an Item
1.  **Define Item**: In `rooms.json`, add the item to an interactable's `item` field or a dropped item list.
2.  **Item Properties**: Set `name`, `tileFrame` (matching `spritesheet.png`), and `category`.
3.  **Interaction**: If it's a key, set `keyId`. If it has a use target, set `useTarget`.

### Adding/Modifying an Afflicted
1.  **Define in rooms.json**: Add entry to the room's `afflicted` array, *or* drag an existing afflicted in F2 editor mode — release saves the new x/y back to `rooms.json` in dev.
2.  **Entity Logic**: Modify `src/entities/Afflicted.ts` if a new behavior state is needed beyond the standard wander/agitate/cure/recover cycle.

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

---

## World Lore & Backstory

This section is the canonical record of Warden's narrative foundation. It should inform all content authoring, environmental storytelling, and character dialog.

### What Warden is

Warden is a company town — part scientific facility, part mining/industrial operation — built around a containment site. The city's original purpose was to house, study, and contain something discovered beneath the ground. Over many generations, the town became self-sustaining: residents were born here, worked here, raised families here. The original mission faded from living memory into institutional habit. People worked at the facility because their parents did. Protocols were still followed — mostly, by rote — by technicians who had inherited procedures without inheriting context.

The name predates anyone who can explain it. Nobody living in Warden knew why it was called that anymore. Finding out is part of what the player unravels.

### What happened

The affliction was not caused by simple proximity to a containment breach. It was caused by a botched ritual attempt. A small inner circle of residents had pieced together that a better, more complete version of the original containment ritual was possible — one that would actually resolve what was being managed rather than merely continue managing it. They attempted it without the complete picture. They said it wrong. The affliction is the consequence: the incomplete ritual still running in the people who performed it. Their looping behavior is the unfinished procedure, echoing in them indefinitely.

The original containment ritual had been performed for generations without anyone understanding what they were doing or why it worked. Pure inherited protocol — a cargo cult of rote procedure. Improved mining technology had recently broken into an older stratum, closer to whatever is below. The research labs found materials they couldn't classify. A small group began to understand that a different approach was possible. They went to the ritual place and tried. They were missing something. The something mattered.

The evacuation alarm sounded — the alarm that had been practiced for generations, the drill that most residents privately considered ceremonial. It worked. The city evacuated faithfully and completely, the outer gates were sealed by the people who fled.

Except for the player, who is a very deep sleeper.

### The afflicted

The afflicted are not zombies. They are the facility workers and residents who were nearest the containment breach. They are still alive, still themselves in some fundamental sense — but locked in a behavioral loop they cannot escape unaided. Their patterns feel almost purposeful. They are disturbing because they seem *organized*, not feral.

They can be cured. The player does not know this at the start.

### The caves

The cave system beneath Warden is the spine of the mystery. The surface town is the wreckage — empty homes, dead technology, afflicted wandering patterns. The caves are the answer. Every thread of the surface story points downward eventually.

The player is not required to descend to finish the game, but the caves are where full understanding lives. A player who leaves without going down knows how to escape. A player who goes down knows *why*.

There are three distinct underground layers, each with its own access culture:

- **The mine** — industrial, known to all residents. The site where improved mining technology broke into an older stratum closer to the contained thing. Miners who found unusual crystals in the walls brought them to the lab. They had no idea what they'd found.
- **The research labs underground** — known to a professional/clearance circle. Scientists and technicians studying what the mine breach exposed. They use a codename for whatever is below. Most lab personnel know the codename but not the deeper place.
- **The ritual place** — known only to the inner circle, accessed through the lab levels but not on any official map. Circle membership comes from three sources: heritage (families who have tended this site for generations), merit (people who figured out enough that the circle had to bring them in), and status (rank-based access, the least reliable). Each person's relationship to the knowledge is colored by how they entered.

### The crystals

The cure for affliction is a crystal native to the stratum below — of the same origin as whatever is contained there. The research lab had samples and was studying them as a material: spectrographic analysis, hardness, composition, anomalous energy readings. They had the answer in their hands and were asking the wrong questions about it. Raw crystals exist in the mine walls, invisible to normal light. The spectra-vision adapter reveals them. Processed samples exist in the lab.

### The Brink lineage

One family — the Brinks — has been part of the inner ritual circle for generations, their membership inherited rather than earned. They were the keepers. The name predates anyone who can explain its origin. The last Brink in the circle either knew more than anyone else or inherited the role without inheriting full understanding — this is an open question to resolve during character writing.

### The flashlight adapter (spectra-vision)

The spectra-vision adapter is not an invention — it is standard facility equipment. It was issued to personnel who understood what Warden was actually for, and used to read things invisible to the naked eye: resonance signatures, boundary conditions, the infrastructure of containment. The player finds one because someone who knew dropped it, or left it deliberately.

With the adapter, the player can see what the original wardens could see. This recontextualizes every room already visited. Some of what it reveals concerns the afflicted directly.

### The one gun

~~This mechanic has been cut.~~ The moral weight the gun was meant to carry is now handled by the cure economy: one crystal accessible in the city, limited additional crystals requiring the mine and the spectra-vision adapter to find. Resource scarcity and the order of cure decisions carry the consequence instead.

### Open narrative questions (not yet decided)

- **What the ancient event was** — thousands of years ago — that made the original ritual necessary. This is the spine the entire lore hangs on and should be developed before character writing begins.
- **The exact nature of what is in the cave** — geological, biological, or stranger. The ritual place should make this legible to a player who reaches it.
- **What the original ritual participants actually knew vs. what they were missing.** The gap between those two things is the game's central tragedy.
- Whether descending to the caves is required for the winning exit condition or strictly optional.
- The exact nature of the final exit and what knowing the city's full history does or doesn't change about it.
