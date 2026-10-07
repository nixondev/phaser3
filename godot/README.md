# WARDEN — Godot spike

An exploratory Godot 4 port that lives **beside** the Phaser game. Nothing
here replaces or modifies the Phaser project; it's a proof of concept for
evaluating whether WARDEN should move engines.

## Source of truth

The Phaser project stays authoritative. `tools/sync-shared.cjs` **copies**
its sprites, tilemaps, `src/data/*.json` and `words/` into `godot/shared/`
(gitignored). The Godot side only reads those copies — it never writes back.

```bash
node godot/tools/sync-shared.cjs   # re-run after editing in the ?/#/$ editors
```

## Importing a room as an editable scene

```bash
node godot/tools/sync-shared.cjs
node godot/tools/import-room.cjs protag-house   # --force to re-import over an existing scene
```

Writes `scenes/rooms/<id>.tscn` (real `TileMapLayer`s, door `Area2D`s,
interactable `Sprite2D`s, a `PlayerSpawn` marker), `art/tilesets/<id>.tres`
and copies the art it uses into `art/`. Open the `.tscn` and paint / drag /
edit in the inspector; F6 runs it.

- Every tile has a full-square collision shape, but only the `Collision`
  layers have `collision_enabled` — WARDEN's "any tile on Collision is
  solid" rule. Per-tile shapes can be refined in the TileSet editor.
- Colour tiles become a generated palette tileset (`<id>-colors.png`) on
  `<Layer>Color` layers, so they're ordinary paintable tiles.
- `Hidden` and `Spectra` start with their eye icon off.
- **Sandbox copy:** edits made in Godot don't flow back to `rooms.json`,
  and re-importing without `--force` is refused so they can't be lost.

## Running (runtime builder)

Open `godot/project.godot` in Godot 4.7 and press F5, or:

```bash
"C:\Program Files (x86)\Steam\steamapps\common\Godot Engine\godot.windows.opt.tools.64.exe" --path godot
```

WASD / arrows move. Set `room_id` on the `Main` node to load another room
(empty = `startRoom` from rooms.json).

## What's ported

| Piece | Phaser | Godot |
|---|---|---|
| Room data | `rooms.json` | read as-is |
| Tile layers | Tiled JSON, 7 layers | built at runtime into `TileMapLayer`s (base + room tilesets) |
| Colour tiles | `colorTiles` → Graphics | `color_layer.gd` rects |
| Layer alphas | `onGroundAlpha` etc. | node `modulate.a` |
| Collision | `Collision` layer, any tile | merged `StaticBody2D` boxes |
| Interactable sprites | `resolveTileSprite` | `Sprite2D` tileset regions |
| Protagonist | `Player.ts`, 4×4 sheet | `player.gd`, same sheet, speed, body |
| `spriteScale` / `cameraZoom` | globals in rooms.json | same fields |
| Screen-space HUD | `ScreenSpace.ts` pinning | `CanvasLayer` (built in) |

## Darkness + flashlight (imported room scenes)

| Phaser | Godot |
|---|---|
| Black RT overlay at alpha `darkLevel` | `CanvasModulate` × (1 − darkLevel) — same result |
| 72px ambient circle erased | `PointLight2D`, energy = darkLevel (restores the art exactly) |
| Cone erased from the RT | `PointLight2D` with a generated cone texture, same range / angle / feather, battery 2%/s |
| Cone passes through walls | **Walls cast shadows** — `LightOccluder2D`s traced from the painted Collision cells at runtime (outline only, so wall faces stay lit and walls don't shadow each other) |
| Spectra layer masked by the cone | `Hidden` + `Spectra` drawn `LIGHT_ONLY` on light mask 2, lit only by a matching reveal cone while the adapter is carried |

In-game: E picks up items / recharges at the charger / reads signs (minimal
stand-in — no inventory yet), F toggles the flashlight once you carry it.

Capture flags (user args after `--`, see `scripts/room.gd`):
`--flashlight --spectra --dark-level=0.92 --face=left --at=1200,470`

## Edge shadows

`EdgeShadows` node (`scripts/edge_shadows.gd`, a `@tool` script) — port of
`EdgeShadows.ts`'s silhouette style: Collision tile art stamped black,
blurred, knocked out of the solid cells. Rebuilds live in the editor when
the Collision layers change. Settings (inspector) come from rooms.json
global `edgeShadows` merged with the room override; Phaser's multi-pass
blur becomes one `blur_sigma` (≈ 1.12 × blurX × blurStrength × √blurSteps).
Superseded by WallShadows (below); kept for the `legacy rim` comparison.
Rough border (`borderOn`) not ported.

## Title screen, music, fonts

- **F5 opens the title** (`scenes/title.tscn`, port of MenuScene.ts): the
  title-screen room as a backdrop (`room.gd` `backdrop` mode), hard rain +
  drifting clouds (WeatherLab), WARDEN in VT323 with the gradient fill and
  glitch flash, pulsing prompt in Silkscreen. Space / Enter / E starts a
  fresh run in `startRoom`. Not ported: the wandering afflicted, editor
  buttons, Cast to TV.
- **Music** (`Music` autoload): the title theme (`gametheme-003.mp3`, synced
  from the Phaser project) loops in every room without restarting on doors.
- **Fonts** (`fonts/`, each with its OFL licence): VT323, Silkscreen,
  Bitcount Ink, Workbench — the Google Fonts the Phaser game loads.

## Afflicted

`scripts/afflicted.gd` (Afflicted.ts port): the 5 states with Phaser's tints
and squash, the 5 behaviour loops (wander / sentinel / drift / pace /
circle), same speeds and ranges. `room.gd` spawns them from rooms.json at
runtime (GameScene.spawnAfflicted, incl. the home rule), frightens them
with the beam — **only with line of sight** (`FRIGHT_NEEDS_LINE_OF_SIGHT`;
Phaser's cone ignores walls) — and handles touch: a matching cure item →
`_apply_cure` (drops holds, unlocks doors home, shake, cure text), else
death → fresh run. E on cured: "stares past you" away from home, backstory
pages at home → recovered. Title wanderers come from the title-screen room.
Debug chords: Ctrl+Shift+C cures the room, Ctrl+Shift+/ unlocks all doors.
Not yet: proximity sound (MIDI),
afflicted placements as editor nodes (they're read from rooms.json).

## Roster

GameState keeps the roster (id, sheet, room, position, traits), the active
character, and one 12-slot inventory per character (swapped on switch; the
keyId lookup follows whoever is active). The protagonist founds it on the
first room load; a cured resident joins on the last page of their backstory
(at home), with their recoveredItems, and stays there as a parked body.
1–4 or clicking a portrait (HUD avatar bar) switches — in place, or a fade to
another room, arriving where that body was left. Death with another body left:
items scatter in a 40 px ring, `died/<id>` is set, the dead leave the roster,
control passes to the next member; the last death resets the run. Parked
bodies answer E with Phaser's stock line (the conversation layer is next).

## HUD, inventory, prose

`scripts/hud.gd` (UIScene port, same layout): room name fade, unlock line
(carried across doors), pulsing E prompt, dialog box with the five
TEXT_STYLES (narrative/thought in Bitcount Ink, lore/document in Workbench,
system in Silkscreen), `---` / 10-line paging, PWR bar, 2×6 inventory grid.
`GameState.inventory` is a real 12-slot inventory: TAB → arrows, E use,
Q drop; dropped items stay in their room. `scripts/words.gd` ports Words.ts
so `words:<key>` resolves from the twee files. Not ported:
DocumentReaderScene (documents show in the dialog box).

## Doors + rooms

Imported so far: protag-house, room-vault, side-kitchen, city-street, house-b, title-screen. E at a
door (within 75px of its zone centre, like Phaser) goes through; locked doors
use up a `requiredKeys` item and stay unlocked. What carries between rooms —
held items, collected pickups, unlocked doors, flashlight — lives in the
`GameState` autoload. A door to a room that isn't imported yet says so.

## Wall shadows (unified)

`WallShadows` node (`scripts/wall_shadows.gd`, `@tool`, live in the editor)
+ `shaders/wall_shadow.gdshader`: one shader for the contact **rim**, a
directional **cast** shadow (sky/moon; default bearing matches the sprite
shading key light and Phaser's drop-shadow offset), and lightning (WeatherLab
asks it for a cast layer). All driven by the tile ART silhouette via
`scripts/tile_shapes.gd`, so partial tiles shadow their shape, not their
cell. Flashlight occluders for partial tiles are traced from the art too.

Characters get shadows from the same node (`scripts/character_shadow.gd`,
"Characters" group on WallShadows): a soft contact ellipse at the feet
everywhere, plus — where `compare` includes the cast — their current
animation frame as a flat silhouette along the cast bearing, so characters
and buildings agree on the light. Replaces Entity.ts's stacked ellipses.

`compare`: legacy rim (the old EdgeShadows node) / rim / cast / rim + cast.
Tiles flagged **hollow** (TileSet editor → Paint → Custom Data) act as a whole
cell for shadows and light — for trim-outline tiles; the tileset2 frame
edges (GIDs 145–152) are pre-flagged.

## Experiment labs (revertible)

Two sandbox nodes — tick boxes in the Inspector, F5; untick or delete the
node to revert. Everything is built at runtime.

- **StyleLab** (protag-house): dust in the beam, normal-mapped tiles
  (`tools/make_normals.py` → `*_n.png` beside the sheets), colour grades,
  retro pass, dirty lens.
- **WeatherLab** (city-street): Phaser's rain overlay, rain + splashes that
  exist only in the flashlight beam (and the circle round the player),
  lightning with finite-length wall shadows, and thunder after each flash —
  procedurally generated by `tools/make_thunder.py` → `audio/thunder_*.wav`
  (no licences; swap in CC0 recordings any time).

Godot 2D lighting gotchas found on the way (see comments in the shaders):
light-only is per ITEM not per pixel (godot#98375) — use a `light()`
shader (`shaders/light_reveal.gdshader`); particles ignore light-only
entirely; 2D directional shadows are infinitely long.

## Not yet

`requires`/`produces` puzzle conditions, thoughts (T), edge-shadow rough border, MIDI music,
dialog/words.
