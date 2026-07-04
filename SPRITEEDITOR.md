# WARDEN — Sprite Editor Plan (SPRITEEDITOR.md)

Design + implementation plan for the third in-browser editor: a **spritesheet
editor** for character sheets (`player.png`, `player-<variant>.png`,
`afflicted-<variant>.png` — all 256×256 PNGs in `public/assets/sprites/`).

Companion docs: `CLAUDE.md` (architecture), `EDITORGUIDE.md` (the `?` room
editor), `TileEditorScene.ts` (the `#` tile editor — primary code donor).

Status: **IMPLEMENTED** (2026-07-03). Typecheck + production build pass;
dev endpoints verified via HTTP round-trip. Remaining manual checks are the
in-browser passes marked ⚠ in the task list (A4, B5, E5-part, F3-part).

---

## 1. Goals

- Pixel-edit any 64×64 frame of a 256×256 character spritesheet in the
  browser, with the same tools/feel as the `#` tile editor.
- **Live animation preview**: a pane showing the character animating with the
  edits applied *as you paint* — no save/reload loop to judge a walk cycle.
- **Hover-to-drive preview**: when the mouse is over the preview pane, WASD
  moves a mini character around inside it, driving direction + walk/idle
  animation with the exact logic `Player.update()` uses. Release keys → idle.
  Mouse leaves → auto-cycle resumes.
- Save back to `public/assets/sprites/<name>.png` via a dev-server endpoint,
  same pattern as the tile editor's `/__editor/save-tile`.

### Non-goals (v1)

- No editing of non-256×256 sheets (the `-bigger-` variants, `newlilguy.png`,
  etc.). The sheet list filters to exactly 256×256. Others can come later by
  generalizing grid math. *(2026-07-03: all non-256×256 PNGs except the
  game-referenced `vial_cure.png` were moved out of `public/assets/sprites/`
  into `assets_src/sprites_backup/`.)*
- No changes to animation *definitions* (frame order, FPS). The 4×4
  row-per-direction convention is fixed engine-side (`Player.ts`,
  `Afflicted.ts`); the editor visualizes it, it does not edit it.
- No creating new sheets from the editor (copy an existing PNG on disk first).
- No editing item/tile art — that stays in the `#` editor.

---

## 2. Spritesheet format (the contract)

All editable sheets are **256×256 PNG = 4 columns × 4 rows of 64×64 frames**,
frames indexed 0–15 row-major. Convention baked into `Player.createAnimations()`
and `Afflicted`:

| Row | Frames | Direction | Animation |
|-----|--------|-----------|-----------|
| 0 | 0–3   | DOWN  | `walk-down`, idle = frame 0 |
| 1 | 4–7   | LEFT  | `walk-left`, idle = frame 4 |
| 2 | 8–11  | RIGHT | `walk-right`, idle = frame 8 |
| 3 | 12–15 | UP    | `walk-up`, idle = frame 12 |

Walk = all 4 frames of the row at 8 fps (`PLAYER_CONFIG.ANIM_FPS`), repeat -1.
Idle = first frame of the row, static.

---

## 3. UX design

### Entry / exit

- New scene `SpriteEditorScene`, key `SCENES.SPRITE_EDITOR = 'SpriteEditor'`.
- Opened from the title screen with **`$`** (keeps the "shifted-symbol opens
  an editor" family: `?` rooms, `#` tiles, `$` sprites). Wire in
  `MenuScene.create()` next to the existing `?`/`#` handlers.
- **ESC** returns to `SCENES.MENU` (identical to TileEditorScene).

### Layout (1280×960 canvas, mirrors TileEditorScene's horizontal bands)

```
+------------------------------------------------------------------------------+
| SPRITE EDITOR                                                    ESC — back  |
| [sheet dropdown ▾]                                                           |
|                                                                              |
| FRAMES            DRAW (64×64 @ 9× = 576px)          PREVIEW (hover = WASD)  |
| +---+---+---+---+ +---------------------------+ +--------------------------+ |
| |dn0|dn1|dn2|dn3| |                           | |                          | |
| +---+---+---+---+ |                           | |        (mini guy         | |
| |lf0|lf1|lf2|lf3| |      checkerboard +       | |     walking around,      | |
| +---+---+---+---+ |      pixel grid,          | |     3× scale, clamped    | |
| |rt0|rt1|rt2|rt3| |      8px guide lines      | |     to pane bounds)      | |
| +---+---+---+---+ |                           | |                          | |
| |up0|up1|up2|up3| |                           | +--------------------------+ |
| +---+---+---+---+ |                           | [auto] [dir: down] [fps 8]   |
| frame: 5 (left-1) +---------------------------+                              |
| [onion ▢]                                       COLOR   #rrggbbaa [input]    |
|                                                 [24 palette swatches]        |
| TOOL [PEN][ERA][EYE][FILL][BLUR]  SIZE [1][2][3][4]                          |
| [COPY][PASTE][FLIP→L] [CLEAR][SAVE]             CUSTOM COLOR (HSV spectrum,  |
| status: ...                                      hue strip, alpha strip)     |
|                                                 RECENT [............]        |
+------------------------------------------------------------------------------+
```

Concrete geometry (same idiom as TileEditorScene's layout constants):

- `FRAME = 64` (frame size), `SHEET_COLS = 4`, `SHEET_ROWS = 4`.
- Frame picker: 4×4 grid of 68px cells at left (~280px wide incl. labels).
  Row labels `down / left / right / up` beside each row. No scrolling needed —
  all 16 frames always visible (simpler than the tile picker's scroll).
- Draw area: 64×64 at `DRAW_SCALE = 9` → 576px (fits beside a 4-col picker
  and a wider preview pane in 1280px; tile editor used 11× but had a 2-col
  picker).
- Preview pane: ~380×300px region at the right, 3× sprite scale (64→192px
  character; pane gives it room to walk).
- Color palette / hex input / HSV picker / recent colors: identical widgets
  and positions-relative-to-panel as TileEditorScene (extracted, see §4).

### Frame picker behavior

- Click a cell → load that frame into the draw canvas (push nothing to
  history; history resets per frame, same as tile editor).
- Selected cell gets the blue highlight; label shows `frame: N (dir-i)`.
- **Q / E** cycle selected frame 0–15 (wraps), matching tile editor muscle
  memory.
- Selecting a frame also sets the preview's "focused direction" to that row.
- Thumbnails are live: they render from the working CanvasTexture (§5), so
  edits appear in the picker immediately, not just after save.

### Draw canvas behavior

Identical to the tile editor: checkerboard alpha background, pixel grid with
8px guide lines, tools pencil / eraser / eyedropper / fill / blur, pen sizes
1–4, right-click erase, middle-click eyedrop, Ctrl+Z / Ctrl+Shift+Z history
(50 steps, cleared on frame/sheet switch).

Two sprite-specific additions:

- **No wrap mode.** Character frames don't tile; drop the WRAP toggle and all
  `% TILE` wrap math from brushes (clamp instead). Blur clamps at edges.
- **Onion skin toggle (checkbox)**: when on, render the *other* frames of the
  current row (the rest of the walk cycle) under the editable pixels at ~25%
  alpha, tinted blue for earlier frames / red for later. Essential for
  animating limbs consistently. Off by default.

### Frame utilities

- **COPY / PASTE**: copy current frame's 64×64 buffer to an in-editor
  clipboard; paste (with history push) onto any frame. The standard way to
  block out a walk cycle from one pose.
- **FLIP→ (mirror)**: horizontally mirror the current frame in place (history
  push). Covers the common "left row = mirrored right row" workflow:
  copy right frame → select left frame → paste → flip.

### Preview pane (the new core feature)

Two modes, switched automatically by pointer position:

**Auto mode (pointer outside pane):**
- The mini character stands centered, cycling `walk-down → walk-left →
  walk-right → walk-up`, ~1.2s per direction, walking in place.
- A small toolbar under the pane: `[auto]` indicator, current direction
  label, fps stepper (`fps 8`, range 2–16) that recreates the preview anims
  with the chosen frameRate — for judging timing only, never saved.
- Clicking a frame-picker row pins the cycle to that direction until the next
  full pointer-enter/leave of the pane (so you can stare at the row you're
  editing).

**Drive mode (pointer inside pane):**
- Pane border highlights; hint text `WASD — walk` appears.
- **WASD** (and arrows) apply velocity to the mini character exactly like
  `Player.update()`: normalize diagonals, `|vy| >= |vx|` picks up/down facing,
  play `preview-walk-<dir>` while moving, `preview-idle-<dir>` when stopped.
  Movement is positional (no physics body needed): `x += vx * dt`, clamped to
  pane rect minus sprite half-extents.
- Keys are read via `addKeys('W,A,S,D,UP,LEFT,DOWN,RIGHT')` polled in
  `update()`, gated on `pointerInPreview`. **Do not** use global keydown
  handlers — Q/E/P etc. must keep working for the rest of the editor, and
  gating a poll is cleaner than juggling listener registration on
  enter/leave.
- Pointer leaves pane → keys ignored, character eases back to center
  (tween, ~250ms), auto mode resumes.

**Critical property: the preview animates the live edit buffer.** See §5.

### Status bar

Bottom-left text like the tile editor's: last action, picked color, save
results, current sheet name.

---

## 4. Architecture & shared code

### New files

| File | Purpose |
|------|---------|
| `src/scenes/SpriteEditorScene.ts` | The scene: layout, frame picker, preview pane, save |
| `src/editor/PixelCanvas.ts` | Extracted from TileEditorScene: pixel buffer + tools + brush/fill/blur + history + draw-area rendering |
| `src/editor/ColorPanel.ts` | Extracted: palette swatches, hex input, HSV spectrum/hue/alpha canvases, recent colors |
| `src/editor/htmlOverlay.ts` | Extracted: `positionHtmlEl`, HTML element lifecycle (create, track, remove on shutdown) |

### Extraction refactor (do this first — Task group B)

`TileEditorScene.ts` is ~1180 lines and ~70% of it (pixel ops, tools, color
UI, history, HTML overlay plumbing) is exactly what the sprite editor needs.
Copy-pasting it would fork ~800 lines forever. Extract instead:

- **`PixelCanvas`** — owns `Uint32Array` pixels for an N×N region, the
  checkerboard/grid rendering into a supplied `Graphics` at a supplied
  origin/scale, `applyTool / paintBrush / floodFill / applyBlur / quickErase /
  quickEyedrop`, undo/redo history, and an `onChange` callback (the sprite
  editor uses this to sync the CanvasTexture, §5). Constructor takes
  `{ size, x, y, scale, wrapMode }` — tile editor passes `wrapMode: true`,
  sprite editor `false`. Eyedropper reports the picked color via callback
  rather than touching color UI directly.
- **`ColorPanel`** — owns `currentColor`, all swatch/HSV/hex/recent widgets,
  positioned from a `{ x, y }` origin. Exposes `getColor()`,
  `setColor(argb)` (for eyedropper), and `onColorChange` callback.
- **`htmlOverlay`** — the `positionHtmlEl` math + an `HtmlEls` holder that
  removes everything on scene shutdown.

Then rewire `TileEditorScene` onto these modules. **Acceptance: the `#`
editor behaves byte-for-byte identically after the refactor** (same tools,
same save output). This is the riskiest task; do it as its own commit and
test the tile editor thoroughly before starting the sprite scene.

*Fallback:* if the extraction balloons, it is acceptable to extract only
`PixelCanvas` + `htmlOverlay` and copy the color UI — the color panel is the
most self-contained chunk to fork. Do not fork the pixel/tool/history logic.

### Modified files

| File | Change |
|------|--------|
| `src/utils/Constants.ts` | `SCENES.SPRITE_EDITOR: 'SpriteEditor'` |
| `src/main.ts` | Add `SpriteEditorScene` to the scene array |
| `src/scenes/MenuScene.ts` | `if (event.key === '$') this.openSpriteEditor();` + `openSpriteEditor()` (same guard pattern as `openTileEditor`) |
| `src/scenes/TileEditorScene.ts` | Rewired onto extracted modules (behavior unchanged) |
| `vite.config.ts` | Two new dev endpoints (§6) |
| `CLAUDE.md`, `EDITORGUIDE.md` | Document the `$` editor (Task group G) |

---

## 5. Live texture pipeline (how the preview stays in sync)

The trick that makes "paint a pixel, see the walk cycle change" work:

1. On sheet select, build a **`Phaser.Textures.CanvasTexture`** named
   `spriteedit-work`, 256×256, and draw the source sheet PNG into it. If the
   sheet is already loaded as a game texture (player + variants + afflicted
   all are), draw from `this.textures.get(key).getSourceImage()`; for sheets
   found on disk but never preloaded (e.g. `player-good.png`), load the image
   at runtime first (`this.load.image` + `LOAD_COMPLETE` once-handler, keyed
   `spriteedit-src`), then draw and destroy the temp key.
2. Register the 16 frames on the CanvasTexture:
   `workTex.add(i, 0, (i%4)*64, Math.floor(i/4)*64, 64, 64)` for i in 0–15.
3. Define preview animations **on the work texture** with editor-local keys
   (`spriteedit-walk-down`, `spriteedit-idle-down`, …), 4 frames @ 8fps,
   using the §2 row convention. Never reuse game anim keys — the global
   `AnimationManager` would leak editor anims into gameplay.
4. The frame picker thumbnails and the preview sprite all render from
   `spriteedit-work`.
5. `PixelCanvas.onChange` (fires per stroke step, throttle to once per
   pointer-move batch): write the 64×64 buffer into the work texture at the
   selected frame's origin via `workTex.context.putImageData(...)` then
   `workTex.refresh()`. WebGL note: `refresh()` re-uploads the canvas; a
   256×256 upload per stroke step is trivially cheap.
6. Switching frames: current buffer is already in the work texture (synced
   per stroke), so just load the new frame's pixels from the work texture
   into the `PixelCanvas` buffer (readback via the work canvas' 2D context —
   no tinting/premultiply concerns since we own the canvas).
7. Switching sheets: prompt-free discard is fine *if not dirty*; if there are
   unsaved changes (dirty flag set on first stroke after save), show a status
   warning and require a second click within 3s (same lightweight pattern as
   other editors — no modal).
8. On scene shutdown: destroy `spriteedit-work`, `spriteedit-src`, and remove
   all `spriteedit-*` anims from the AnimationManager.

**Sheet enumeration** comes from a dev endpoint (§6) so the dropdown shows
everything on disk, not just what PreloadScene loaded. Filter response to
`width === 256 && height === 256`. In production builds (no dev server) the
dropdown falls back to the known preloaded keys (`player`, `player-<variant>`,
`afflicted-<variant>`) — same graceful-degradation stance as tile save.

---

## 6. Dev-server endpoints (`vite.config.ts`, inside `editorSavePlugin`)

### `GET /__editor/list-sprites`

- Reads `public/assets/sprites/*.png`, parses each PNG's IHDR (width/height
  are bytes 16–23; trivial read, no full decode — the plugin already has PNG
  chunk-walking code in `extractTileFromPNG` to crib from).
- Responds `{ sprites: [{ name: "player", width: 256, height: 256 }, ...] }`
  (name = basename without `.png`).
- Client filters to 256×256.

### `POST /__editor/save-sprite?sheet=<name>`

- Mirror of `/__editor/save-tile`: raw PNG body → atomic write (`.tmp` +
  rename) to `public/assets/sprites/<name>.png`.
- Validate `sheet` against `/^[a-z0-9][a-z0-9-]*$/i` **and** require the
  resolved path to stay inside the sprites dir (same double-check as
  save-tilemap). The tile editor's `save-tile` skips the regex on `tileset` —
  don't copy that; sprite names include digits/dashes and the regex above
  covers all current files.
- No per-frame source extraction (tiles have an `assets_src` round-trip;
  sprites have no source-file workflow — the sheet PNG *is* the source).
- Add both endpoints to the startup logger.info hint line.

### Client save flow

`SAVE` button → `workTex.canvas.toBlob('image/png')` → POST →
status text `saved <name>.png ✓ (reload page to see in-game)`. Outside dev
mode: status `save only available in dev mode` (same as tile editor).
Clear the dirty flag on 200.

---

## 7. Keybindings summary (in-scene)

| Key | Action |
|-----|--------|
| ESC | Back to menu |
| Q / E | Cycle selected frame −/+ (0–15, wraps) |
| Ctrl+Z / Ctrl+Shift+Z | Undo / redo (per frame) |
| WASD / arrows | **Only while pointer is over preview pane**: drive character |
| L-click | Paint / pick frame / press button |
| R-click | Erase (draw area only) |
| M-click | Eyedrop (draw area only) |

Everything else (tool switching, sizes, colors) is click-only, matching the
tile editor. Note: `#`/`?`/`$` are *menu* keys only; no editor-to-editor hops
in v1.

---

## 8. Edge cases & gotchas

- **WASD vs. hex input**: the hex `<input>` already `stopPropagation()`s its
  keydowns (via extracted ColorPanel) — typing `d` in a hex field must not
  walk the preview. Preview polling is gated on `pointerInPreview` anyway;
  keep both guards.
- **Pointer inside preview while drawing**: `pointerInPreview` must be false
  whenever a draw stroke is active (`isDrawing`), so a drag that crosses the
  pane doesn't start the character walking.
- **Texture readback**: always read pixels from the *work canvas'* 2D
  context, never from the WebGL texture. The work canvas is the single source
  of truth after initial load.
- **Anim key hygiene**: all preview anims and temp textures prefixed
  `spriteedit-`; removed on shutdown. Re-entering the editor must not throw
  "key already in use" — guard creates with `exists()` checks or clean fully.
- **Non-square/odd sheets in the dir** (`player-bigger.png`, dated exports):
  excluded by the 256×256 filter; the dropdown never offers them.
- **HMR / page reload**: like tiles, in-game visuals update on full page
  reload after save. The *game* texture (`player` etc.) is not touched by the
  editor; only the file changes.
- **`FIT` scale + HTML overlays**: `positionHtmlEl` already handles canvas
  CSS scaling; the extracted helper must keep listening for window resize
  (currently the tile editor positions once — acceptable; keep parity, note
  as known limitation).

---

## 9. Task list

Ordered; each group is a natural commit. Later groups depend on earlier ones
except where noted.

### A. Scaffold (small)
- [x] A1. Add `SPRITE_EDITOR: 'SpriteEditor'` to `SCENES` in `Constants.ts`.
- [x] A2. Create minimal `SpriteEditorScene` (background, title `SPRITE
      EDITOR`, `ESC — back` handler to menu).
- [x] A3. Register scene in `main.ts`; bind `$` in `MenuScene` with
      `openSpriteEditor()` (copy the `started` guard).
- [ ] A4. ⚠ MANUAL: title → `$` → editor → ESC → title, twice in a row
      (re-entry must not throw).

### B. Shared-module extraction (largest risk — isolate it)
- [x] B1. Create `src/editor/htmlOverlay.ts`; move `positionHtmlEl` + element
      lifecycle out of `TileEditorScene` (as `HtmlOverlay` class,
      auto-cleanup on scene shutdown).
- [x] B2. Create `src/editor/PixelCanvas.ts` per §4 (pixels, tools, brushes,
      fill, blur, history, draw-area render, `onChange`, `onEyedrop`;
      `wrapBrush` constructor flag + `wrapSample` mutable toggle — the tile
      editor always wraps brush placement, the WRAP button only ever gated
      blur sampling; sprite editor sets both off).
- [x] B3. Create `src/editor/ColorPanel.ts` per §4 (palette, hex input, HSV,
      recent; `color` property + `setColor(argb, addRecent)`).
- [x] B4. Rewire `TileEditorScene` onto B1–B3. Deleted the moved code
      (~1180 → ~490 lines). Undo/redo/CLEAR now flow through
      `PixelCanvas` + `onChange` → wrap-preview redraw, matching the old
      `redrawAll()` behavior.
- [ ] B5. ⚠ MANUAL: regression-test the `#` editor end-to-end: every tool,
      wrap mode, undo/redo, eyedrop → swatch sync, hex entry, save (confirm
      written PNG diff-identical for a no-op load+save), ESC cleanup of HTML
      elements. (Typecheck + production build pass.)

### C. Sheet loading & frame picker
- [x] C1. Add `GET /__editor/list-sprites` to `vite.config.ts` (PNG IHDR
      read); startup hint line updated. Verified live: 43 PNGs listed,
      17 are 256×256.
- [x] C2. Sheet dropdown (HTML `<select>` via HtmlOverlay, same styling as
      tile editor's tileset dropdown). Dev: populated from endpoint filtered
      to 256×256; non-dev fallback: preloaded key list (`FALLBACK_SHEETS`).
- [x] C3. Work-texture pipeline §5 steps 1–2: `spriteedit-work`
      CanvasTexture built from selected sheet (preloaded textures used
      directly; unloaded sheets runtime-loaded as `spriteedit-src`),
      frames 0–15 registered.
- [x] C4. Frame picker: 4×4 grid of live thumbnails from the work texture,
      row labels, selection highlight, `frame: N (dir-i)` label, Q/E cycling
      (wraps 0–15).
- [x] C5. Frame → PixelCanvas load (getImageData readback from work canvas),
      history reset on switch.

### D. Drawing + live sync
- [x] D1. `PixelCanvas` (64, `wrapBrush:false`, 9× scale) + `ColorPanel`
      instantiated; eyedrop/color callbacks wired.
- [x] D2. `onChange` → `putImageData` into work texture + `refresh()`;
      thumbnails and preview render from the same texture so they update
      live.
- [x] D3. Dirty flag + sheet-switch guard (select again within 3s to
      discard; dropdown reverts meanwhile).
- [x] D4. CLEAR button (history push + fill 0 + sync).

### E. Animation preview pane
- [x] E1. Pane chrome (bg, border, hint text), preview sprite at 3× from
      work texture, `spriteedit-*` anims (walk×4 recreated on fps change,
      idle×4).
- [x] E2. Auto mode: 1.2s direction cycle, `auto/pinned — <dir>` label,
      pin-to-row on frame select (cleared on next pane hover).
- [x] E3. Drive mode: pointer-in-pane check each update (suppressed while a
      draw stroke is active), WASD + arrow polling via `addKeys`,
      Player-identical facing math (vertical wins ties, SQRT1_2 diagonals),
      position clamped to pane minus half-extents, idle on stop,
      250ms ease-back-to-center tween on leave.
- [x] E4. FPS stepper (2–16) — stops the sprite, rebuilds `spriteedit-walk-*`
      anims at the new rate, resumes.
- [x] E5. Shutdown cleanup: `spriteedit-*` anims + work/src textures removed;
      HTML els via HtmlOverlay. ⚠ MANUAL: re-entry test in browser.

### F. Save + frame utilities
- [x] F1. `POST /__editor/save-sprite` in `vite.config.ts` (name regex +
      path-containment check, atomic tmp+rename write). Verified live:
      byte-identical round-trip; `sheet=../evil` rejected with 400.
- [x] F2. SAVE button: work canvas → blob → POST → status + dirty clear;
      non-dev fallback message.
- [ ] F3. ⚠ MANUAL (endpoint half verified): edit one pixel on
      `player-good.png` (a scratch sheet) in the browser, save, hard-reload,
      confirm in editor and on disk.
- [x] F4. COPY / PASTE frame buffer (history push on paste).
- [x] F5. FLIP (horizontal mirror in place, history push).
- [x] F6. Onion-skin toggle: other frames of the current row ghosted under
      the draw layer via `PixelCanvas.backdrop` callback — blue = earlier
      frames, red = later, nearest frame wins overlaps.

### G. Documentation
- [x] G1. `CLAUDE.md`: SpriteEditorScene + `src/editor/*` rows in Key Files,
      `$` in the Debug & Editor Systems table, new endpoints listed.
- [x] G2. `EDITORGUIDE.md`: "Sprite editor" section (enter with `$`, pick
      sheet, pick frame, paint, hover preview + WASD, save).
- [x] G3. Status line updated; deviations from plan noted inline above.

### Deferred / v2 ideas (do not build now)
- Non-4×4 sheet support (bigger variants) via configurable grid.
- Per-frame duplication to a new sheet ("save as").
- Palette-lock mode (restrict painting to colors already in the sheet).
- Editing while the game runs (live texture patch into the `player` key).

---

## 10. Acceptance criteria (whole feature)

1. From the title screen, `$` opens the sprite editor; ESC returns; repeat
   entry is clean (no duplicate-key/anim errors, no orphaned HTML elements).
2. Every 256×256 PNG in `public/assets/sprites/` appears in the dropdown;
   nothing else does.
3. Painting a pixel on any frame is visible within the same pointer stroke in:
   the draw canvas, the frame-picker thumbnail, and the animating preview.
4. Hovering the preview and holding `A` shows the character walking left with
   the left-row frames, live-edited; releasing shows left idle (frame 4);
   moving the mouse out recenters and resumes the auto cycle.
5. SAVE writes a valid PNG to `public/assets/sprites/<name>.png` that the
   game loads correctly after page reload, and a no-edit load→save round-trip
   is pixel-identical.
6. The `#` tile editor still passes its full manual regression (B5) after the
   shared-module extraction.
