# TILESHEETS — How Tilesets Work in WARDEN

Full reference for the tileset pipeline: source files → build → runtime. See also `CLAUDE.md` (Tileset Workflow) and `EDITORGUIDE.md`.

---

## 1. The Two-Tileset System

### Core tileset

| Property | Value |
|----------|-------|
| PNG | `public/assets/tilemaps/tileset.png` |
| Size | 512 × 1024 px |
| Grid | 8 columns × 16 rows = **128 tiles** at 64 × 64 px each |
| Phaser image key | `"tileset"` |
| Phaser spritesheet key | `"tileset-sprites"` |
| `firstgid` in all Tiled JSONs | `1` |

Every map uses the core tileset. It is loaded unconditionally in `PreloadScene.ts`.

### Room-specific tilesets

A room can declare extra tilesets beyond the core:

```json
{ "id": "clinic", "tilesets": ["clinic-tiles"] }
```

| Property | Convention |
|----------|-----------|
| PNG | `public/assets/tilemaps/<name>.png` |
| Phaser image key | `<name>` (e.g. `"clinic-tiles"`) |
| Phaser spritesheet key | `<name>-sprites` (e.g. `"clinic-tiles-sprites"`) |
| `firstgid` in Tiled JSON | `129` (immediately after the 128 core tiles) |

`PreloadScene.ts` scans `rooms.json` for `tilesets` arrays and loads each PNG automatically. Multiple room-specific tilesets on one room use ascending `firstgid` values (129, 257, …).

**Current status:** the room-specific system is fully implemented but unused — no room in `rooms.json` currently has a `tilesets` entry.

---

## 2. Tile Addressing: `tileFrame` vs GID

These two representations are easy to confuse.

### `tileFrame` (used in `rooms.json`, `ItemDef`, `InteractableDef`)

- **0-indexed local frame** within the spritesheet
- What you see in the Phaser spritesheet (frame 0 = top-left tile, frame 7 = last tile of row 0, frame 8 = first tile of row 1, …)
- This is the value you put in `rooms.json`
- Example: `"tileFrame": 12` means slot 12 in the tileset

### GID (Tiled Global ID, stored inside tilemap JSON layer data)

- 1-based: GID 1 = frame 0 of the tileset with `firstgid: 1`
- Conversion: `frame = GID − tileset.firstgid`
- Example: tile index `13` in a layer array → frame `13 − 1 = 12` from the core tileset
- GIDs are an internal Tiled artifact; the engine converts them automatically

**Rule:** always use `tileFrame` (0-indexed frame) in `rooms.json`. Never write GIDs there.

---

## 3. TilesetResolver (`src/utils/TilesetResolver.ts`)

The single source of truth for mapping `(tileFrame, tilesetKey?)` to a Phaser texture key + frame.

```typescript
// Main path — use this everywhere a tile sprite is needed
resolveTileSprite(tileFrame: number, tilesetKey?: string)
  → { key: "tileset-sprites" | "<name>-sprites", frame: number }

// Derive the Phaser image key from a tileset name
tilesetImageKey(name: string) → name   // identity

// Derive the Phaser spritesheet key from a tileset name
tilesetSpritesheetKey(name: string)
  → "tileset-sprites"   // if name === "tileset"
  → "<name>-sprites"    // otherwise
```

**Flow:**

```
rooms.json item/interactable
  tileFrame: 8
  tilesetKey: "clinic-tiles"   ← omit for core tileset
        ↓
resolveTileSprite(8, "clinic-tiles")
        ↓
  { key: "clinic-tiles-sprites", frame: 8 }
        ↓
this.add.sprite(x, y, "clinic-tiles-sprites", 8)
```

`tilesetSpritesheetKey` is also used directly in `GameScene.buildEdgeShadows()` when iterating over Phaser tileset objects from the live map.

---

## 4. Preloading (`src/scenes/PreloadScene.ts`)

On scene start, PreloadScene:
1. Loads `tileset.png` as both an image (`"tileset"`) and a spritesheet (`"tileset-sprites"`, frameWidth: 64, frameHeight: 64)
2. Scans all rooms in `rooms.json` for `tilesets: string[]` arrays; for each unique name, loads `public/assets/tilemaps/<name>.png` as image + spritesheet under `<name>` and `<name>-sprites`
3. Loads every room's tilemap JSON under its `mapKey`

All keys are registered before `GameScene` or `EditorScene` starts.

---

## 5. Runtime Loading (`src/systems/RoomManager.ts`)

`loadRoom(roomId)`:
1. Calls `this.scene.make.tilemap({ key: room.mapKey })` — Phaser parses the Tiled JSON
2. For each tileset in the Tiled JSON, calls `map.addTilesetImage(ts.name, ts.name, ...)` with `firstgid` preserved explicitly — this links Phaser's internal tile objects to the correct spritesheet frames
3. Creates a `TilemapLayer` for each layer name that exists in the JSON (`Ground`, `OnGround`, `Collision`, `OnCollision`, `Above`, `OnAbove`, `Spectra`)
4. Sets depths and alphas (see §7)
5. Calls `setCollisionByExclusion([-1])` on the `Collision` layer — every tile except empty collides
6. Strips real tiles from any cell that has a color tile (`stripTilesUnderColors`)
7. Builds static physics bodies for `Collision` color tiles

The multi-tileset GID lookup used when iterating raw tile data:
```typescript
let owningTs = tilesets[0];
for (const ts of tilesets) {
  if (ts.firstgid <= tile.index) owningTs = ts;
}
const frame = tile.index - owningTs.firstgid;
```

---

## 6. Build Pipeline

### `npm run build-tiles` → `scripts/build-tiles.cjs`

Composes the core tileset from individual source PNGs.

- **Input:** `assets_src/tiles/tile_N.png` (also accepts legacy `NN_name.png`)
- **Output:** `public/assets/tilemaps/tileset.png` (512 × 1024, 8 × 16 grid)
- Index `N` maps to column `N % 8`, row `floor(N / 8)`
- Empty slots are transparent
- Pure Node.js — no Sharp, canvas, or external deps
- Also copies output to `dist/assets/tilemaps/tileset.png` if `dist/` exists

**Adding a tile:** drop `tile_N.png` in `assets_src/tiles/`, run `npm run build-tiles`.

### `npm run migrate-tiles` → `scripts/migrate-tiles.cjs`

Reverse operation: slices `tileset.png` back into individual source files.

> ⚠️ **Known limitation:** hardcoded `ROWS = 8`, so only the first 64 tiles (indices 0–63) are extracted. Tiles 64–127 are silently skipped. The `tileNames[]` array also only covers 50 names. This script is out of date with the current 128-tile tileset — use with care.

### `npm run regenerate-tiles` → `scripts/regenerate-tiles.cjs`

Procedurally regenerates the original pixel-art source tiles from code (pavement, walls, floors, items, trees, etc.).

> ⚠️ **Known issue:** writes files in the legacy `NN_name.png` format, not the current `tile_N.png` format. If you run it alongside existing `tile_N.png` files, both formats coexist — `build-tiles` handles both, but warns on slot conflicts. Only covers indices 0–50; tiles 51–127 have no programmatic regeneration path.

---

## 7. Layers

Seven named layers, all optional except Ground, Collision, and Above. Optional layers are created with `ensureXLayer()` on demand from the editor.

| Constant | String | Depth | Alpha default | Role |
|----------|--------|-------|---------------|------|
| `GROUND` | `"Ground"` | 0 | 1.0 | Base floor tiles |
| `ON_GROUND` | `"OnGround"` | 0.3 | 0.2 | Semi-transparent floor overlay |
| `COLLISION` | `"Collision"` | 1 | 1.0 | Physics walls; all non-empty tiles collide |
| `ON_COLLISION` | `"OnCollision"` | 2 | 1.0 | Decorative wall-top detail — **no physics** despite the name |
| `ABOVE` | `"Above"` | 30 | 1.0 | Drawn above player (player depth = 20) |
| `ON_ABOVE` | `"OnAbove"` | 30.5 | 1.0 | Overlay above the Above layer |
| `SPECTRA` | `"Spectra"` | 31 (HIDDEN) | 0 | Hidden; revealed only with flashlight + spectra-adapter item |

Color tile overlays sit `+0.05` above their layer: Ground → 0.05, OnGround → 0.35, Collision → 1.05, OnCollision → 2.05, Above → 30.05, OnAbove → 30.55, Spectra → 31.05.

Per-room alpha overrides for OnGround, OnCollision, OnAbove are stored in `rooms.json` as `onGroundAlpha`, `onCollisionAlpha`, `onAboveAlpha`.

---

## 8. Color Tiles

Color tiles are solid-color rectangles that **replace** real tilemap tiles. They are stored as a non-standard top-level key in the Tiled JSON:

```json
{
  "colorTiles": {
    "OnCollision": {
      "11,0": 0,
      "12,0": 0
    }
  }
}
```

Format: `layerName → { "tileX,tileY": rgbInteger }`. The integer is a 24-bit RGB number (`0` = `0x000000` black).

**Rules:**
- A cell cannot have both a real tile and a color tile. Placing a color tile removes the real tile; placing a real tile removes the color tile.
- Only `Collision` color tiles create physics bodies. `OnCollision` color tiles are visual only.
- Rendered via per-layer `Phaser.GameObjects.Graphics` objects, one per layer that has color tiles.
- The editor's color mode (K key) paints and erases color tiles. Smart Save (X) writes them back to the Tiled JSON.

**In practice:** currently used in `clinic.json` (OnCollision), `basement.json` (OnGround), `room-garden.json` (Ground), and `side-kitchen.json` (Ground).

---

## 9. Edge Shadows

`buildEdgeShadows()` (GameScene + actual-view in EditorScene) draws a black silhouette of every collision tile into a RenderTexture at depth `GROUND + 0.5`, alpha 0.6, then applies a postFX blur and directional shadow:

```typescript
rt.postFX.addShadow(3, -3, 0.006, 1, 0x000000, 15, 0.5);
rt.postFX.addBlur(100, 20, 20, 0.2, 0x000000, 5);
```

This gives the 3D directional shadow visible on all walls. It is always on — not tied to `dark`. postFX requires WebGL; the shadow silhouette still renders without blur on limited GPUs.

---

## 10. Known Issues / Gotchas

| # | Issue | Impact |
|---|-------|--------|
| 1 | `migrate-tiles` only extracts 64 of 128 tiles (`ROWS = 8`) | Running it loses tiles 64–127 |
| 2 | `regenerate-tiles` writes legacy `NN_name.png` format | Creates filename mix; only covers tiles 0–50 |
| 3 | Room-specific tilesets fully wired up but not yet used in any room | Low risk; infrastructure is ready |
| 4 | `clearColorTile` calls `rebuildColorCollision` for `OnCollision` | No-op but wastes a rebuild cycle |
| 5 | `OnCollision` naming implies physics; it has none | Reader confusion |
