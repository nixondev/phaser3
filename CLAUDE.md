# WARDEN — CLAUDE.md

Companion docs: `EDITORGUIDE.md`, `AUTHORING.md`, `PARADIGM.md`, `ROADMAP.md`, `TESTING.md`, `WORDS.md`, `TOUR.md` (code-tour curriculum — check off sessions as taught).

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
npm run bake-depth -- <sheet>  # Write <sheet>-shaded.png with a baked key light
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
| `src/systems/ThoughtManager.ts` | Introspection channel (pattern #13): pure WHO/WHERE/WHEN thought selection |
| `src/data/thoughts.json` | Thought metadata (WHO/WHERE/WHEN); prose lives in `words/thoughts/` |
| `src/systems/Words.ts` | Prose registry — parses `words/**/*.twee` (Twee 3), resolves `words:<key>` refs |
| `src/systems/ConversationManager.ts` | Speaker×listener talk selection over `conversations.json` (thoughts pattern) |
| `src/data/conversations.json` | Conversation entries: npc + requires (speaker/flags) + priority → `words:` key |
| `src/systems/FlagAudit.ts` | Dev startup check: flags checked-but-never-set / set-but-never-checked |
| `words/` | All player-facing writing as twee passages — see `WORDS.md` |
| `src/systems/TransitionManager.ts` | Fade-in/out between rooms |
| `src/systems/MusicManager.ts` | MIDI music — singleton, proximity layers, reverb cycle |
| `src/systems/WeatherManager.ts` | Weather effects on room transitions (data-driven from `rooms.json`) |
| `src/systems/RainEffect.ts` | Screen-space rain overlay (mild / hard) |
| `src/systems/DrippingEffect.ts` | World-space drip particles |
| `src/systems/DarknessOverlay.ts` | Full-screen RenderTexture darkness; erases ambient + flashlight cone |
| `src/systems/Flashlight.ts` | Cone detection, battery drain, glow, RT mask |
| `src/systems/DebugManager.ts` | F1 info HUD, F3 visual overlays, global debug shortcuts |
| src/systems/RoomEditorManager.ts | #/? editor logic: select mode, color tiles, smart save, drag, resize |
| `src/scenes/SpriteEditorScene.ts` | $ editor: 256×256 character spritesheets, live animation preview (hover + WASD) |
| `src/editor/PixelCanvas.ts` | Shared pixel-edit surface: tools, brushes, fill, blur, undo history |
| `src/editor/ColorPanel.ts` | Shared color UI: palette, hex input, HSV picker, recent colors |
| `src/editor/htmlOverlay.ts` | Shared HTML-over-canvas element positioning + lifecycle |
| `src/lib/SpessaSynthPlayer.ts` | SpessaSynth MIDI/SF2 wrapper |
| `src/systems/AudioEffectsManager.ts` | Web Audio reverb via `ConvolverNode` |
| `src/entities/Player.ts` | Player sprite, movement, animations |
| `src/entities/Afflicted.ts` | Afflicted entity — state machine, wandering AI |
| `src/entities/Entity.ts` | Base sprite class |
| `src/utils/Constants.ts` | All numeric constants |
| `src/types/index.ts` | All TypeScript interfaces and types |
| `src/data/rooms.json` | World definition — rooms, doors, items, afflicted placements, interactables |
| `src/data/characters.json` | **Cast registry** — all character identity: name, sheets, home, backstory, recovered items (see `CHARACTERS.md`) |
| `src/systems/CharacterRegistry.ts` | characters.json lookups + dev startup audit (dangling refs) |
| `src/entities/animHelpers.ts` | `ensureCharacterAnims()` — single source of `<sheet>-walk/idle-<dir>` anims |
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
readThoughts: Set<string>             — introspection entries read this run
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

On overlap (agitated/wandering): **death**. The active character's items scatter in a ring at the death site, `died/<id>` world flag is set, they leave the roster permanently, and control passes to the next roster member (succession — you resume wherever that body was parked). Only when no other playable character exists: full run reset (`rsm.reset()` + scene restart).

**Home rule:** a cast member's post-cure location is the `home` field on
their `characters.json` entry — the home room has no afflicted placement.
Uncured: they spawn at their room placement. Cured: the placement empties
and they spawn at `home` (human sheet) until recovered. See `CHARACTERS.md`
and `AFFLICTED.md`.

**Cure path:** all cure triggers (touch; Ctrl+Shift+C debug; future bait)
route through `GameScene.applyCure(afflicted, cureSlot, source)`.

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
Player:     220 px/s, 8 fps animations
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
| T / click player | Introspect — inner-monologue thought (`…` glyph above player when unread) |
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
| `music` | string | Track name (folder under `public/music/`). Omit to use room ID as track name. |
| `weather` | `'rain-mild' \| 'rain-hard' \| 'dripping'` | Weather effect on room entry |
| `drips` | `Array<{x,y}>` | Explicit drip positions; auto-scattered if omitted |
| `dark` | `boolean` | Full-screen darkness overlay |
| `reverb` | string | `city` / `indoor` / `sewer` / `hospital` / `substation` |
| `reverbMix` | 0..1 | Reverb wet mix (default 0.3) |

**Global (top-level in rooms.json):** `edgeShadows: { enabled, alpha, blur }` —
the collision edge-shadow look, shared by game / `?`-editor actual view / title
screen via `src/systems/EdgeShadows.ts` (one builder; also shadows
color-collision cells). Tunable live in the `?` editor's left-panel Shadows
section (persists via `/__editor/save-shadows`). Also global: `spriteScale` —
render size of ALL character sprites (Player/Afflicted/parked bodies; items
and tiles untouched). Visual only: entity bodies divide setSize/setOffset by
it so collision never changes. Tuned via the `$` editor's SIZE slider (live
in the 1:1 preview; game reads it at entity construction → reload to apply).

**Dev note:** Adding a new `rooms.json` field requires server restart + hard browser refresh. Changing existing values hot-reloads.

---

## Words (Prose) System

All player-facing writing lives in `words/**/*.twee` (Twee 3 plain text; full doc in `WORDS.md`). Bundled via `import.meta.glob` in `src/systems/Words.ts` — creating a file is the only registration.

- Passage name = global key: `:: thoughts/protag-house-first [thought]`.
- Any text field in `rooms.json` may hold `"words:<key>"` — resolved at display time (`GameScene.openDialog`, `DocumentReaderScene`).
- `thoughts.json` omits `lines`; ThoughtManager auto-resolves passage `thoughts/<id>`.
- `---` on its own line = explicit page break in all text types; auto-split at 10 lines is the safety net.
- `[[label->target]]` links parse into `WordsPassage.links` (reserved for a future dialog runner) and are stripped from display text.
- Missing key → console warning + `[missing words: <key>]` in-game, never a crash.
- Key namespaces: `thoughts/<id>`, `documents/<slug>`, `dialog/<character>/<slug>`.

---

## Shaded Sprite Sheets

Creates a shaded copy of a character sheet — a directional key light baked in —
via `<sheet>-shaded.png`. Pure art pass: no engine support, no runtime cost.
The original is never modified; derived sheets (`-shaded`, `_n`) are refused as
inputs so shading can't stack.

**`$` editor → SHADING block**: SHADE button, LIVE checkbox (preview-only
shading of the preview pane; SAVE unaffected), PAL checkbox (snap output to the
sheet's own colours), six sliders, BEVEL/SOFT/DITHER + HUE/RESET presets.
SHADE writes with exactly what is being previewed. The editor deliberately
exposes FEW controls — `shadeOptions()` maps them onto the full parameter set.
DITHER (user-picked 2026-08-01: retro 5-tone banded wash, grain, strong hue)
and HUE (same ramp, smooth, hue 0.6) need a floor/ceiling pair AMOUNT's
coupled mapping can't produce, so presets may set overrides — released when
AMOUNT next moves. BEVEL is different in kind: it enters **emboss mode**
(`bevel > 0` in shade.mjs), which bypasses the dome model entirely — the
sprite is a flat sticker raised off the surface. Only pixels within `bevel`
px of transparency change: pushed up where the silhouette edge faces the
light, down opposite, scaling continuously with facing angle and fading
linearly across the width (chamfer, not slab). Interior bit-identical,
interior black lines ignored, #000000 outline pixels immune, outside a frame
cell counts as EMPTY (same rule as the dome blur: art nudged against the
frame boundary embosses exactly like art mid-cell — anything else loses the
head's top highlight on the walk-bob frame). In emboss mode AMOUNT = depth,
SOFT = width (3 = the
user-picked preset, 2026-08-01), LIGHT aims it; SHAPE/COLOR/TONES inert.
CLI: `npm run bake-depth -- <sheet> --bevel 3 --bevelDepth 0.4`.

| Slider | Means | Drives |
|---|---|---|
| AMOUNT | how much shading | strength, plus floor/ceiling widened in step |
| LIGHT  | light bearing (°) | dir (elevation fixed) |
| SHAPE  | one body ↔ per-outline parts | volume/parts blend |
| SOFT   | tight rim ↔ broad wash | blur radius |
| COLOR  | cool shadows / warm highlights | hue |
| TONES  | smooth ↔ few flat pixel tones | steps, dither auto-on |

Full parameter access stays on the CLI: `npm run bake-depth -- <sheet>` (every
DEFAULTS key is a flag automatically).

**House style (locked 2026-08-01).** `DEFAULTS` in `scripts/lib/shade.mjs` ARE
the project's shading style, picked by the user from rendered candidates: a
subtle, volume-led, smooth directional wash (strength 0.8, blur 6, volume 0.8 /
parts 0.2, hue 0.35, floor 0.65 / ceiling 1.3, falloff 1.2, no bands, no
texture) that adds light without fighting the art's existing hand shading.
Bare `npm run bake-depth -- <sheet>` and the editor's RESET produce exactly it.
Change it only at the user's direction — and update the `test-shade` defaults
assertion, which pins these values on purpose.

**The model** (`scripts/lib/shade.mjs`, shared verbatim by editor preview, dev
endpoint and CLI): one composite height field per 64×64 frame cell —

```
H = (VOLUME × dome(whole silhouette) + PARTS × dome(split at enclosing #000000 outlines))
    / (VOLUME + PARTS)  +  TEXTURE × high-passed luminance
```

shaded once with a directional light, then per-pixel: STRENGTH/TAPER shape the
ramp, HUE bends it (cool shadows / warm highlights via per-channel exponents —
m=1 is a fixed point, so flat interiors stay bit-identical), BANDS+DITHER
quantise it, FLOOR/CEILING clamp it, PAL snaps to the source palette.

Why composite: independent per-region domes are per-part *pillow shading* —
where two outlined regions touch (head on collar), each gets a full rim at the
shared edge and the parts pop apart. Blending a whole-body dome in makes
touching parts bumps on one hill; the shared edge becomes a fold.

**Convention, not inference: every opaque `#000000` pixel is an edge.** The
artist reserves pure black for outlines; a black-looking non-edge (a pupil, a
boot) is painted `#000001`, which is visually identical. `#000000` itself is
immune to shading either way (multiply and hue both fix 0).

Non-obvious invariants, all enforced by **`npm run test-shade`** (40 checks —
run it after any shader change):
- outside a frame cell = EMPTY in every blur, never edge-clamp (else the walk
  frame whose bob touches row 0 loses its highlight and flickers)
- alpha passes through untouched; source pixels are never blurred
- blur is radius-based prefix-sum (cost flat in radius); normal tilt scales
  with radius so STRENGTH means the same at every SPREAD
- the dev endpoint whitelists params from DEFAULTS itself — a hand-kept list
  went stale once and silently made SHADE output differ from the live preview

## Audio System

SpessaSynth (SoundFont-native AudioWorklet). Assets in `public/music/`:

```text
public/music/global.sf2                    — master fallback SoundFont
public/music/bgm-main/track.mid            — ultimate fallback MIDI (used when no track found)
public/music/[track-name]/track.mid        — named track
public/music/[track-name]/instruments.sf2  — optional per-track SoundFont override
public/music/reverb/[type].wav             — impulse response files
```

**Track resolution:** `MusicManager.playRoomMusic(roomId)` reads `room.music` from `rooms.json` to get the track name; if absent, the room ID is used as the track name. It then looks for `music/<trackname>/track.mid` and falls back to `music/bgm-main/track.mid`.

**No-restart sharing:** two rooms with the same effective track name continue playback without restarting on transition. Set `"music": "protag-house"` on any room to share that room's track.

Reverb is always updated on room change even when the track continues.
Live debug mixing: R (cycle reverb), `[`/`]` (mix ±5%), `-`/`+` (volume).

---

## Tileset Workflow

All tilesets: 8-column PNG grid of 64×64 tiles at `public/assets/tilemaps/<name>.png`.

**Base tilesets** (declared under `baseTilesets` in `rooms.json`): loaded into every room.
- `tileset` — `firstgid: 1`, frames 0–127. Sources: `assets_src/tiles/tile_N.png`.
- `tileset2` — `firstgid: 129`, frames 0–127. Sources: `assets_src/tiles/tileset2/tile_N.png`.
- Rebuild all: `npm run build-tiles`. Run `npm run patch-tilemaps` after adding a new base tileset.

**Room-specific tilesets** (declared under `room.tilesets` in `rooms.json`): loaded for that room only.
```json
{ "id": "clinic", "tilesets": ["clinic-tiles"] }
```
- PNG at `public/assets/tilemaps/clinic-tiles.png`.
- Tiled JSON must list it with `firstgid: 257` (= 1 + 2 base tilesets × 128).
- Sources: `assets_src/tiles/clinic-tiles/tile_N.png`. Rebuild: `npm run build-tiles`.
- Reference: `{ "tileFrame": 3, "tilesetKey": "clinic-tiles" }` (omit `tilesetKey` for base tilesets).
- `TilesetResolver.ts` maps `(tileFrame, tilesetKey)` → `{key, frame}` for rendering.
- Every room already has a blank `<roomId>-tiles.png` registered; add tiles to it as needed.

**Conventions:**
- `tileFrame` = 0-indexed local frame within its tileset (not Tiled GID).
- Tiled GID = `tileset.firstgid + tileFrame`. Engine handles this.
- Maintenance Tunnel black rectangle = Exterior Wall (GID 2). Edit `assets_src/tiles/tile_01.png`.

---

## Debug & Editor Systems

All debug/editor tooling lives in the standalone editors opened from the
title screen — there are no in-game function-key tools (early idea, removed).

| Key (title screen) | System | Purpose |
| **#** | TileEditorScene | Standalone tile atlas / painter |
| **$** | SpriteEditorScene | Spritesheet editor: paint 64×64 frames, live walk-cycle preview (hover pane + WASD), ASSIGN button → give the open sheet to a cast member (characters.json), SHADE button → bake a key light into `<sheet>-shaded.png` |
| **?** | EditorScene | Main room editor: objects, layers (1-7), color tiles, smart save |

Inside the `?` editor, DebugManager provides **F1** (info HUD), **F3**
(visual overlays: collision, doors, afflicted radii), **F4** (warp picker),
**F5** (map-graph dump).

In-game there are exactly two debug chords (both TODO: remove before ship):
**Ctrl+Shift+/** unlocks all doors, **Ctrl+Shift+C** cures all afflicted in
the room (via `applyCure`, so home doors unlock and held items drop).

**Shortcuts inside the ? editor (F1 HUD active):**

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
- GET /__editor/list-sprites -> lists public/assets/sprites/*.png with dimensions (sprite editor dropdown)
- POST /__editor/save-sprite?sheet=<name> -> writes public/assets/sprites/<name>.png (sprite editor SAVE)
- POST /__editor/shade-sprite?sheet=<name> -> writes public/assets/sprites/<name>-shaded.png via scripts/lib/shade.cjs (sprite editor SHADE)
- POST /__editor/save-character {id, field: sheet|afflictedSheet, value} -> patches src/data/characters.json (sprite editor ASSIGN)
- POST /__editor/save-sprite-scale {spriteScale} -> writes rooms.json top-level spriteScale ($ editor SIZE slider; global character size, visual only — bodies compensate)
- POST /__editor/save-shadows {enabled, alpha, blur} -> writes rooms.json top-level edgeShadows (? editor Shadows panel)
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

### Character (cast member — curable/playable)
1. Add an entry to `src/data/characters.json`: `name`, `role`, `sheet`,
   `afflictedSheet`, `home {room,x,y}`, `curedClue`, `backstory` (words keys),
   `recoveredItems`, `traits`.
2. Place them in a room: `{ "id": "<slug>", "character": "<slug>", "x", "y",
   "behaviorLoop" }` in that room's `afflicted` array. No home-room entry.
3. Write their prose under `words/dialog/<slug>/`; conversations reference
   the slug as `npc`. The startup audit flags dangling references.
4. Sheets: assign via the `$` editor's ASSIGN button, or edit the fields.

### Afflicted extra (anonymous ambience/hazard)
1. Add to room's `afflicted` array in `rooms.json`: `id`, `x`, `y`,
   `behaviorLoop`, `afflictedSheet` (no `character` field), or place via the
   `?` editor (drag auto-saves x/y).
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
