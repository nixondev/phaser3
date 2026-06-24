# Color Tiles — Implementation Plan

> **Status: IMPLEMENTED** (RoomManager-owned, persistent, game-rendered, with
> collision). `tsc --noEmit` and `vite build` both pass. All tilemap `data`
> arrays verified free of stray color GIDs.

## Goal

A "color tile" is a real tile for all intents and purposes: a square filled with a
chosen solid color. It can be painted on any of the layers (Ground, OnGround,
Collision, OnCollision, Above) in the editor, is layer-specific, **persists to disk**,
and **renders in the live game** — including blocking movement when placed on a
collision layer.

## Current state (after bug-fix pass)

- room-garden.json repaired; all tilemaps scanned clean of stray color GIDs.
- `COLOR_TILE_FLAG` removed from `Constants.ts`.
- Editor (`RoomEditorManager`) has a **session-only, in-memory** color system:
  `colorData: Map<LayerName, Map<"x,y", rgb>>`, redrawn each frame via a single
  `colorGraphics` overlay. Color picker (`<input type="color">`) wired in `EditorUI`.
- **Gap:** colors do not persist and do not render in-game. This plan replaces the
  editor-local store with a RoomManager-owned, persistent, game-rendered system.

## Target architecture

`RoomManager` becomes the single source of truth for color tiles. Both `GameScene`
and `EditorScene` use `RoomManager`, so they both render colors for free.

### Storage format (tilemap JSON, top-level key)

Phaser ignores unknown top-level keys, so this is safe alongside Tiled data. Layer
`data` arrays stay 100% valid (only real GIDs) — this is what prevents the
corruption we just fixed.

```json
{
  "...": "...standard Tiled fields...",
  "colorTiles": {
    "Ground":    { "4,7": 16729156 },
    "Collision": { "10,2": 5592405 }
  }
}
```

- Keys = layer names (`LAYER_NAMES` values). Values = `{ "x,y": rgbInt }`.
- Omit empty layers; omit the whole key if no colors (keep JSON clean).

### Depth (per-layer color Graphics)

One `Graphics` per layer that has colors, at the matching layer depth + 0.05 so the
color sits just above its own tile layer but below the next:

| Layer        | Tile depth      | Color depth |
|--------------|-----------------|-------------|
| Ground       | 0               | 0.05        |
| OnGround     | 0.3             | 0.35        |
| Collision    | 1 (GROUND+1)    | 1.05        |
| OnCollision  | 2               | 2.05        |
| Above        | 30              | 30.05       |

Player is depth 20, so Ground/OnGround/Collision/OnCollision colors render under the
player and Above colors render over it — exactly like the real tile layers.

### Collision

For each color cell on `Collision` / `OnCollision`, RoomManager creates an invisible
static-body `Zone`. `GameScene.setupCollisions` adds colliders (player + afflicted)
against those bodies. No player exists in `EditorScene`, so the bodies are harmless
there.

### Editor dimming

In-game, color overlays render at alpha 1. In the editor, the active layer's colors
render at alpha 1 and inactive layers at `EDITOR_INACTIVE_ALPHA` (0.2) — matching how
tile layers already dim. Editor drives this via a RoomManager method.

## Implementation steps

### 1. `RoomManager.ts` — own the data, render, collide

- Add a depth map const `COLOR_OVERLAY_DEPTH` (layer name → depth+0.05).
- Fields:
  - `colorTiles: Map<string, Map<string, number>>`
  - `colorGraphics: Map<string, Phaser.GameObjects.Graphics>`
  - `colorCollisionBodies: Phaser.GameObjects.Zone[]`
  - `editorDimActiveLayer: string | null = null`
- `loadRoom`: after creating layers, call `loadColorTiles(room.mapKey)` (reads
  `this.scene.cache.tilemap.get(mapKey).data.colorTiles`) then `renderColorTiles()`.
- `unloadCurrentRoom` / `resizeMap` teardown: destroy color graphics + collision bodies.
- Methods:
  - `loadColorTiles(mapKey)` — populate `colorTiles` from cache.
  - `renderColorTiles()` — (re)build all per-layer graphics + `rebuildColorCollision()`.
  - `redrawColorLayer(layer)` — clear+fill one layer's graphics with dim alpha applied
    (cheap; used during editor paint).
  - `rebuildColorCollision()` — recreate static zones for Collision/OnCollision cells.
  - `getColorTile(layer,x,y)`, `setColorTile(layer,x,y,rgb)`, `clearColorTile(layer,x,y)`,
    `clearAllColorTiles()`.
  - `getColorTilesData()` — serialize non-empty layers for export.
  - `getColorCollisionBodies()` — for GameScene colliders.
  - `setColorEditorDim(activeLayer|null)` — set dim mode + redraw all layers.
  - `colorOverlayAlphaFor(layer)` — 1 in game; 1/0.2 split in editor.
- `setColorTile`/`clearColorTile`: mutate map → `redrawColorLayer` → if collision
  layer, `rebuildColorCollision()`.
- `resizeMap`: capture `colorTiles`, shift each cell by (offsetX, offsetY), drop
  out-of-bounds, restore, then `renderColorTiles()`.

### 2. `GameScene.ts` — collide against color walls

- Add field `colorCollider?: Phaser.Physics.Arcade.Collider;` and an afflicted one.
- In `setupCollisions`: destroy old, then
  `physics.add.collider(player, roomManager.getColorCollisionBodies())` (if any).
- In the afflicted-collider block (~line 363): add
  `physics.add.collider(afflictedGroup, roomManager.getColorCollisionBodies())`.

### 3. `RoomEditorManager.ts` — manipulate RoomManager, drop local store

- Remove: `colorData`, `colorGraphics`, `getColorLayer`, `redrawColorOverlay`,
  the per-frame `redrawColorOverlay()` call, and all redundant redraw calls.
- Keep: `colorMode`, `selectedColor`, `colorPreview` (HUD swatch), `setCurrentColor`,
  K toggle, status text.
- Paint: `roomManager.setColorTile(currentLayer, x, y, selectedColor)`.
- Erase: `roomManager.clearColorTile(currentLayer, x, y)`.
- Eyedropper (color mode): `roomManager.getColorTile(currentLayer, x, y)`.
- Rect-fill / flood-fill in color mode: loop → `setColorTile` (flood reads via
  `getColorTile`).
- `updateLayerOpacities`: also call `roomManager.setColorEditorDim(isActive ? currentLayer : null)`.
- `stampDefaultRoom`: `roomManager.clearAllColorTiles()`.
- `buildExportData`: attach `colorTiles` from `roomManager.getColorTilesData()` only
  when non-empty. Keep the >= 0x01000000 strip on `data` as legacy safety.

### 4. `EditorUI.ts`

- No structural change needed (picker + K button already wired). Update cheatsheet
  wording if helpful.

### 5. Persistence endpoint

- None needed: `/__editor/save-tilemap` writes the POST body verbatim, so the
  `colorTiles` key in `buildExportData()` persists automatically.

## Edge cases / notes

- **Undo:** color edits are not in the tile-layer history snapshots. Either leave
  color edits outside undo (document it) or add a parallel color history. Initial
  cut: outside undo.
- **Cache freshness:** after `X` save in dev, the page reloads and re-fetches the
  tilemap, so `cache.tilemap` is fresh on next load. Within a session, RoomManager's
  in-memory `colorTiles` is already authoritative.
- **Large fills + collision:** one static zone per collision color cell. Fine for
  realistic counts; collision-layer color tiles are expected to be uncommon.

## Verification

1. `npx tsc --noEmit` clean.
2. Scan all tilemaps for stray `>= 0x01000000` GIDs (should stay 0).
3. Manual: paint colors on each layer, `X` to save, confirm `colorTiles` in JSON and
   `data` arrays unchanged; reload room → colors return; enter game → colors render at
   correct depth; collision-layer color blocks the player.
