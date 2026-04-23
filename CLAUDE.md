# The Hollow (working title) — CLAUDE.md

## Project Overview

A 2D top-down exploration/puzzle game built with TypeScript + Phaser 3. The player wakes alone in a sealed city, discovers the afflicted residents can be cured, and repopulates the city to find the way out. No combat. Retro pixel-art aesthetic at 320×240 resolution with 3× zoom.

## Commands

```bash
npm run dev          # Vite dev server with HMR at localhost:8080
npm run build        # tsc + vite build (outputs to /dist)
npm run preview      # Serve production build
npm run setup        # Generate placeholder assets (scripts/generate-assets.cjs)
```

## Tech Stack

- **Phaser 3** (v3.80.1) — game engine, arcade physics, tilemaps, scene management
- **TypeScript 5.4** — strict mode, ES2020 target
- **Vite 5.4** — dev server and bundler
- Assets: Tiled JSON tilemaps, PNG spritesheets (16×16 tiles)

## Path Aliases (tsconfig.json)

```
@/        → src/
@scenes/  → src/scenes/
@entities/→ src/entities/
@systems/ → src/systems/
@utils/   → src/utils/
```

## Architecture

### Scene Stack

```
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
| `src/entities/Player.ts` | Player sprite, movement, animations |
| `src/entities/Afflicted.ts` | Afflicted resident entity — state machine, wandering AI, agitation |
| `src/entities/Entity.ts` | Base sprite class (Player extends this) |
| `src/entities/Direction.ts` | Enum: UP, DOWN, LEFT, RIGHT |
| `src/utils/Constants.ts` | All numeric constants |
| `src/types/index.ts` | All TypeScript interfaces and types |
| `src/data/rooms.json` | World definition — rooms, doors, items, afflicted |

### State Management

`RoomStateManager` is a singleton (`RoomStateManager.getInstance()`). It tracks:
- `inventory: (ItemDef | null)[]` — 12-slot array (2×6)
- `collectedItems: Set<string>` — by interactable `id`
- `unlockedDoors: Set<string>` — by door `id`
- `curedResidents: Set<string>` — afflicted who have been cured
- `recoveredResidents: Set<string>` — cured residents who have spoken and given their unlock
- `poweredDevices: Set<string>` — devices the generator has powered
- `generatorFuel: number` — fuel available for the generator
- `droppedItems: Map<roomId, DroppedItemState[]>`
- `visitedRooms: Set<string>`
- `tutorialShown: boolean` — whether the initial control help has been displayed

### Afflicted Entity (`src/entities/Afflicted.ts`)

State machine with 4 states:
- **wandering** — drifts slowly near origin point, blue tint, gentle wobble
- **agitated** — triggered at 40px player proximity, flees from player, red tint, fast wobble. Calms at 80px distance. Faster than wandering.
- **cured** — stands still, green tint. Interactable (E prompt).
- **recovered** — stands still, no tint. Interactable (repeat dialog).

**Collision:** If the player overlaps with an agitated/wandering Afflicted, the screen shakes, fades out, and the player respawns at the `protag-house`.

Each afflicted is defined in `rooms.json` with: `id`, `name`, `role`, `x`, `y`, `behaviorLoop`.
On room entry, GameScene spawns afflicted and checks RoomStateManager to set initial state.

### Item Categories

| Category | Purpose |
|----------|---------|
| `key` | Single-use, unlocks a door by `keyId` |
| `component` | Piece of something larger, useless alone |
| `fuel` | Powers the generator or a specific device |
| `cure` | Applied to an afflicted resident (mechanic TBD) |
| `document` | Readable lore — has `content` field with text |
| `tool` | Single-purpose environmental use |

`ItemDef` fields: `name`, `tileFrame`, `category`, `keyId?`, `useTarget?`, `content?`

### Key Constants (`src/utils/Constants.ts`)

```
Display:    320×240 @ 3× zoom, 16px tiles
Player:     80 px/s speed, 8 fps animations
Interact:   28px range
Inventory:  2 rows × 6 cols, 14px slots
Depth:      GROUND=0, ENTITIES=10, PLAYER=20, ABOVE=30, UI=40, TRANSITION=50
```

### Input Bindings

| Key | Action |
|-----|--------|
| Arrow keys / WASD | Move |
| E | Interact / use item / dismiss dialog |
| F | Toggle Flashlight |
| TAB | Toggle inventory |
| Q | Drop selected inventory item |
| ESC | Pause menu |
| - / + | Adjust Volume (in Pause menu) |

### Event Bus (GameScene → UIScene)

Events emitted by GameScene:
- `room-changed` — room name string
- `inventory-changed` — full inventory array
- `inventory-mode` / `inventory-cursor` — inventory UI state
- `show-interact-prompt` / `hide-interact-prompt`
- `dialog-open` / `dialog-close`
- `door-unlocked`

### Room / World Data (`src/data/rooms.json`)

The world consists of a central hub and various interior locations:

- **Hub:** `city-street` — Large outdoor map (96x72) connecting all buildings. Populated with Afflicted.
- **Residential:** `protag-house` (Start), `house-b`, `house-c`, `apt-4a`, `east-block`.
- **Civic/Service:** `clinic`, `records-office`, `ration-office`, `utility-substation`, `depot`.
- **Commercial:** `market`, `laundromat`.
- **Secret:** `substation-tunnel` — Connects `utility-substation` and `laundromat`.

**Special Features:**
- `utility-substation` contains a **recharge** station for the flashlight.
- `clinic` contains the **skeleton-key** used to unlock most buildings.
- Locked doors support multiple keys (e.g., `["skeleton-key", "master-key"]`).

Door locking: `requiredKey: "some-key-id"` on the door; matching item needs `category: "key"` and `keyId: "some-key-id"`.

## Tilemap Conventions

- Tiled JSON format, 16×16 tiles, shared tileset `tileset.png`
- Layer named `Collision` is used for physics collisions
- Layer named `Above` renders above the player (depth 30)
- `mapKey` in rooms.json must match the key used in `PreloadScene` when loading the tilemap

---

## Migration Plan

### Completed

- [x] **Phase 1 — Strip combat** (steps 1-4): Removed projectiles, attack system, weapon/armor equipping, health/damage, Enemy.ts, all combat from GameScene/UIScene/Player/RoomStateManager/Constants/InputManager.
- [x] **Phase 2 — Update data model** (steps 5-7): New item categories, rooms.json rewritten for new tone, RoomStateManager has curedResidents/recoveredResidents/poweredDevices/generatorFuel.
- [x] **Phase 3 — New entity foundation** (steps 8-10): Afflicted.ts with 4-state machine, spawning wired into GameScene, placeholder interaction for cured/recovered residents. Two test afflicted in rooms.json.
- [x] **Phase 4 — Build out the city** (steps 11-12): Replaced prototype rooms with full city layout. `city-street` hub, 10+ interior rooms, tunnel system, and lock/key progression.

### Next up — Phase 5: Interaction & Polish

### Phase 5 — Design decisions needed

These block specific implementations. Can be answered in any order as the story develops:

- [ ] **13. Cure mechanic** — How does the player cure an afflicted? Options discussed:
  - Item-based (use specific cure item near them)
  - Environmental (lead them somewhere, trigger something)
  - Context-sensitive (different per resident)
  - The "accidental first cure" moment — scripted or emergent?

- [ ] **14. Recovery payloads** — What does each recovered resident unlock?
  - Knowledge (reveals a clue or combination)
  - Access (opens a door, shows a hidden path)
  - Ability (can fix something the player carries)
  - Each resident needs: name, role, cure condition, recovery dialog fragments, what they unlock

- [ ] **15. Generator/power system** — Two options:
  - Single-channel: player chooses what to power, unpowering previous device (puzzle mechanic)
  - Permanent: each fuel canister powers one device forever (resource management)
  - The first thing powered should be "something useless and almost funny"

- [ ] **16. Tunnel network** — Tunnels are rooms connecting building interiors underground:
  - Which buildings connect via tunnels?
  - How does the player discover/access tunnel entrances?
  - Are there hazards down there? (not combat — environmental)
  - The "vagrant cache of old equipment" — what's in it?

- [ ] **17. The forgotten exit** — Endgame:
  - Where is it? (likely tunnels or edge of city)
  - How many recovered residents needed?
  - "Opens from both sides" — what does this mean mechanically?
  - Player discovers it at the same moment the protagonist does — no cutscene

### Game Design Reference

**Premise:** Player wakes alone in a sealed mid-sized city. Everyone fled due to an affliction, sealed the city from outside, and forgot the player inside. One exit exists that the sealers didn't know about. Finding and using it is the goal.

**Tone:** Eerie, not horror. Sad, not gory. Dead tech everywhere — screens off, cameras watching nothing. A city that was reaching for something better.

**The afflicted:** Remaining residents taken by the condition. They wander, moving in wrong ways — too precise, too repetitive, like executing a loop. One sets a table over and over. One knocks on a door nobody answers. NOT zombies. NOT lethal. Eerie because they seem almost organized.

**Core twist:** The afflicted can be CURED. Each recovers as a named person with a former role. Each unlocks something tied to who they were — knowledge or access, not items. The city repopulates as you solve it. The ending requires enough recovered residents to open the exit together.

**Lore delivery:** No NPCs, no dialog trees. Story through environment: notes, half-finished meals, doors locked from outside, the same symbol scratched in three places. Recovered residents speak in fragments — they don't know what happened either.

**City districts:** Residential (start), Civic (records), Market/Warehouse (scavenging), Energy Facility (generator), Tunnel Network (underground connections, second puzzle layer).

**Target scope:** 3-6 hour game, ~10-15 unique afflicted residents, ~40-80 rooms total.
