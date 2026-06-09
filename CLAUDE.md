# WARDEN — CLAUDE.md

Companion docs: `EDITORGUIDE.md`, `AUTHORING.md`, `PARADIGM.md`, `ROADMAP.md`, `TESTING.md`.

## Project Overview

2D top-down exploration / puzzle-box game. TypeScript + Phaser 3. No combat.
Player wakes in a sealed city, cures afflicted residents, each cure adds a character + 2 items + a new body for sequencing puzzles. **Short to execute, long to understand.**

Retro pixel-art, 320×240 @ 3× zoom.

---

## Commands

```bash
npm run dev              # Vite dev server at localhost:8080
npm run build            # tsc + vite build → /dist
npm run preview          # Serve production build
npm run setup            # Full asset setup (generate maps + build tileset)
npm run build-tiles      # Compose assets_src/tiles/ PNGs → tileset.png
npm run regenerate-tiles # Recreate procedural source tiles
npm run migrate-tiles    # Extract tileset.png back into individual files
```

---

## Tech Stack

- **Phaser 3** v3.90.0 — game engine, arcade physics, tilemaps, scenes
- **TypeScript 5.4** — strict mode, ES2020
- **Vite 5.4** — dev server + bundler
- Assets: Tiled JSON tilemaps, PNG spritesheets (16×16 tiles)

## Path Aliases

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
| `src/scenes/PreloadScene.ts` | Asset loading (sprites, tilemaps, MIDI, instruments) |
| `src/systems/RoomStateManager.ts` | Singleton — all persistent game state |
| `src/systems/RoomManager.ts` | Tilemap loading, collision layers, door zones, `Spectra` layer, `resizeMap()` |
| `src/systems/InputManager.ts` | Keyboard input: `getState()` continuous, `getTapState()` one-shot |
| `src/systems/TransitionManager.ts` | Fade-in/out between rooms |
| `src/systems/MusicManager.ts` | MIDI music — singleton, proximity layers, reverb cycle |
| `src/systems/WeatherManager.ts` | Weather effects on room transitions (data-driven from `rooms.json`) |
| `src/systems/RainEffect.ts` | Screen-space rain overlay (mild / hard) |
| `src/systems/DrippingEffect.ts` | World-space drip particles |
| `src/systems/DarknessOverlay.ts` | Full-screen RenderTexture darkness; erases ambient + flashlight cone |
| `src/systems/Flashlight.ts` | Cone detection, battery drain, glow, RT mask |
| `src/systems/DebugManager.ts` | F1 info HUD, F3 visual overlays, global debug shortcuts |
| src/systems/RoomEditorManager.ts | #/? editor logic: select mode, color tiles, smart save, drag, resize |
| `src/lib/SpessaSynthPlayer.ts` | SpessaSynth MIDI/SF2 wrapper |
| `src/systems/AudioEffectsManager.ts` | Web Audio reverb via `ConvolverNode` |
| `src/entities/Player.ts` | Player sprite, movement, animations |
| `src/entities/Afflicted.ts` | Afflicted entity — state machine, wandering AI |
| `src/entities/Entity.ts` | Base sprite class |
| `src/utils/Constants.ts` | All numeric constants |
| `src/types/index.ts` | All TypeScript interfaces and types |
| `src/data/rooms.json` | World definition — rooms, doors, items, afflicted, interactables |
| `vite.config.ts` | Build config + dev-only `editorSavePlugin` |

---

## State Management

`RoomStateManager.getInstance()` tracks everything that survives a room transition:

```text
inventory: (ItemDef | null)[]         — 12-slot array (2×6)
collectedItems: Set<string>           — by interactable id
unlockedDoors: Set<string>            — by door id
curedResidents: Set<string>
recoveredResidents: Set<string>       — cured residents who entered the playable cast
poweredDevices: Set<string>
generatorFuel: number
droppedItems: Map<roomId, DroppedItemState[]>
visitedRooms: Set<string>
tutorialShown: boolean
```

Future state to support: character roster / active character, per-character item ownership, persistent world changes, soft-doom states.

---

## Afflicted Entity (`src/entities/Afflicted.ts`)

5-state machine:

| State | Behavior |
|-------|----------|
| **wandering** | Drifts near origin, blue tint, 240px agitation radius |
| **agitated** | Chases player 300px/s, red tint; calms at 480px |
| **frightened** | Flees flashlight cone 400px/s; returns to wandering at 600px. Sentinels immune. |
| **cured** | Still, green tint, interactable (E). Proximity sound stops. |
| **recovered** | Still, no tint, interactable (dialog / character unlock). |

On overlap (agitated/wandering): screen shake, fade, respawn at `protag-house`.

**`associatedRoom` rule:** afflicted excluded from `associatedRoom` until cured; after cure they only appear there and vanish from their spawn room. Same entry can exist in both rooms — engine gates by cure state.

---

## Item Categories

| Category | Purpose |
|----------|---------|
| `key` | Unlocks door/system by `keyId` |
| `component` | Piece of a larger puzzle |
| `fuel` | Powers generator or device |
| `cure` | Applied to afflicted resident |
| `document` | Readable lore (`content` field) |
| `tool` | Traversal / utility / puzzle |
| `credential` | Institutional access token |

`ItemDef` fields: `name`, `tileFrame`, `category`, `keyId?`, `useTarget?`, `content?`

---

## Key Constants (`src/utils/Constants.ts`)

```text
Display:    320×240 @ 3× zoom, 16px tiles
Player:     80 px/s, 8 fps animations
Interact:   28px range
Inventory:  2 rows × 6 cols, 14px slots
Depth:      GROUND=0, ENTITIES=10, PLAYER=20, ABOVE=30, HIDDEN=31,
            LIGHTING=35, WEATHER=37, UI=40, TRANSITION=50
```

`HIDDEN` (31) — objects flashlight reveals. `LIGHTING` (35) — darkness RT. `WEATHER` (37) — above darkness so rain is always visible.

---

## Input Bindings

| Key | Action |
|-----|--------|
| Arrow / WASD | Move |
| E | Interact / use item / dismiss dialog |
| F | Toggle flashlight (requires item with `keyId: "flashlight"`) |
| TAB | Toggle inventory |
| Q | Drop selected item |
| ESC | Pause menu |

---

## Event Bus (GameScene → UIScene)

```text
room-changed          — room name string
inventory-changed     — full inventory array
inventory-mode / inventory-cursor
show-interact-prompt / hide-interact-prompt
dialog-open / dialog-close
door-unlocked
```

---

## Room / World Data

Rooms in `src/data/rooms.json`. Every tilemap: three layers `Ground`, `Collision`, `Above`.
`Collision` drives physics (`setCollisionByExclusion([-1])`). `Above` depth 30.
`mapKey` must match key in `PreloadScene`.

### Room atmosphere fields

| Field | Type | Effect |
|-------|------|--------|
| `weather` | `'rain-mild' \| 'rain-hard' \| 'dripping'` | Weather effect on room entry |
| `drips` | `Array<{x,y}>` | Explicit drip positions; auto-scattered if omitted |
| `dark` | `boolean` | Full-screen darkness overlay |
| `reverb` | string | `city` / `indoor` / `sewer` / `hospital` / `substation` |
| `reverbMix` | 0..1 | Reverb wet mix (default 0.3) |

**Dev note:** Adding a new `rooms.json` field requires server restart + hard browser refresh. Changing existing values hot-reloads.

---

## Audio System

SpessaSynth (SoundFont-native AudioWorklet). Assets in `public/music/`:

```text
public/music/global.sf2                   — master fallback SoundFont
public/music/main_theme.mid               — master fallback MIDI
public/music/[room-id]/track.mid          — room music
public/music/[room-id]/instruments.sf2    — room SoundFont override
public/music/reverb/[type].wav            — impulse response files
```

Empty room folder → falls back to `global.sf2` + `main_theme.mid`.
`MusicManager.playRoomMusic(roomId)` reads reverb settings from `rooms.json` on every transition.
Live debug mixing: R (cycle reverb), `[`/`]` (mix ±5%), `-`/`+` (volume).

---

## Tileset Workflow

All tilesets: 8-column PNG grid of 64×64 tiles at `public/assets/tilemaps/<name>.png`.

**Core tileset** (`tileset.png`): 128 tiles, `firstgid: 1`, frames 0–127.
- Sources: `assets_src/tiles/NN_name.png` (numeric prefix = slot index).
- Rebuild: `npm run build-tiles`.

**Adding a core tile:** add `NN_name.png` to `assets_src/tiles/`, run `npm run build-tiles`.

**Room-specific tilesets:**
```json
{ "id": "clinic", "tilesets": ["clinic-tiles"] }
```
- PNG at `public/assets/tilemaps/clinic-tiles.png`.
- Tiled JSON must list it with `firstgid: 129`.
- Reference: `{ "tileFrame": 3, "tilesetKey": "clinic-tiles" }` (omit `tilesetKey` for core).
- `TilesetResolver.ts` maps `(tileFrame, tilesetKey)` → `{key, frame}` for rendering.

**Conventions:**
- `tileFrame` = 0-indexed local frame (not Tiled GID).
- Tiled GID = `firstgid + tileFrame`. Engine handles this.
- Maintenance Tunnel black rectangle = Exterior Wall (GID 2). Edit `assets_src/tiles/01_exterior_wall.png`.

---

## Debug & Editor Systems

| Key | System | Purpose |
| **F1** | DebugManager | HUD: FPS, room, music, reverb, coords, GIDs |
| **F3** | DebugManager | Visual overlays: collision (red), doors (cyan), afflicted radii |
| **#** | TileEditorScene | Standalone tile atlas / painter |
| **?** | EditorScene | Main room editor: objects, layers (1-7), color tiles, smart save |

**Global shortcuts (active debug HUD or Editor):**

| Key | Action |
|-----|--------|
| R | Cycle reverb profile |
| [ / ] | Reverb wet mix ±5% |
| - / + | Master volume |
| L | Hot-reload room from disk |
| U | Unlock all doors in room |
| C | Cure all afflicted in room |
| Shift+Click | Teleport player to cursor |

**F2 editor:**
**? Editor (Select mode by default):**

| Key | Action |
|-----|--------|
| M | **Select mode** (safe; no paint/erase; drag objects) |
| G | **Actual view** (hold to peek in-game full alpha) |
| K | **Color mode** (paint solid persistent color tiles) |
| 1-7 | Switch layer (Gnd/OnGnd/Coll/OnColl/Abv/OnAbv/Spec) |
| Q / E | Cycle tile index (snaps back to tile mode) |
| L-Click | Paint (tile/color) or select object |
| R-Click | Erase (tile/color) |
| M-Click | Eyedropper (samples whatever is under cursor) |
| Shift+Arrow | Expand map one tile |
| Ctrl+Sh+Arrow | Shrink map one tile |
| X | **Smart Save** (awaits objects before tilemap reload) |

Resize and drag (Select mode) shift all fields (doors, interactables, afflicted) automatically.
- `POST /__editor/save-tilemap?roomId=<id>` → writes `public/assets/tilemaps/<id>.json`
- POST /__editor/save-tilemap?roomId=<id> -> writes public/assets/tilemaps/<id>.json
- POST /__editor/save-object -> patches {roomId, kind, id, x, y, spawnX, spawnY} in src/data/rooms.json (supports door, interactable, fflicted)
---

## Adding Content

### Room
1. Create Tiled JSON with layers `Ground`, `Collision`, `Above` → `public/assets/tilemaps/`.
   *(Alt: clone existing, resize with F2 + Shift+Arrow in-engine, X to save.)*
2. Add to `src/data/rooms.json`: `id`, `name`, `mapKey`, `tilemapPath`, `width`, `height`, `reverb`, doors, interactables, afflicted.
3. Register in `PreloadScene.ts`: `this.load.tilemapTiledJSON(room.mapKey, room.tilemapPath)`.

### Item
1. Add to interactable's `item` field or dropped item list in `rooms.json`.
2. Set `name`, `tileFrame`, `category`. Add `keyId` if key, `useTarget` if usable.

### Afflicted
1. Add to room's `afflicted` array in `rooms.json`, or drag in F2 editor (auto-saves x/y).
2. If new behavior needed: modify `src/entities/Afflicted.ts`.

---

## Design Pillars (brief)

1. **Knowledge is progression** — learning the city is the game.
2. **Characters introduce tools** — each cure adds 2 themed items to the economy.
3. **Items are swappable** — inventory pressure is the constraint, not character lock.
4. **Multiple bodies matter** — sequencing puzzles require positioning characters.
5. **Sealed puzzle box** — exterior implies interiors that can be filled in gradually.
6. **Flashlight arc** — survival tool → world reader via spectra-vision adapter.
7. **Shared memory** — two specific recovered residents together unlock dialogs neither has alone.

---

## World Lore (summary)

Warden is a company town built around a containment site. The original ritual was cargo-culted for generations without understanding. An inner circle attempted an improved ritual with incomplete knowledge — said it wrong. The affliction is the incomplete ritual echoing in the people who performed it. The evacuation alarm worked; everyone fled and sealed the gates. The player slept through it.

Three underground layers: mine (known to all), research labs (clearance circle), ritual place (inner circle, accessed through labs). Crystals from the lowest stratum cure affliction — the lab studied them without understanding. Spectra-vision adapter reveals raw crystals in mine walls and recontextualizes the city. The Brinks are the hereditary keeper family.

**Open:** what the ancient event was, the exact nature of the contained thing, whether cave descent is required for the winning exit.

**Endings:** Escape alone / Escape with hope / Escape with understanding / Stay. Cure economy (limited crystals) determines which remain reachable. Game never announces endings exist.

See `ROADMAP.md` for locked-in mechanics and build sequence.
