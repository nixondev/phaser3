# WARDEN — Editor Guide

Short how-tos for the editor. If you've never used it before, work
through this top-to-bottom; otherwise jump to whichever task you want.

Companion docs:
- `AUTHORING.md` — the same workflow described as a connected recipe,
  plus full JSON reference for interactables, afflicted, flags.
- `PARADIGM.md` — the design grammar (what kinds of puzzles you can
  compose with these tools).
- `ROADMAP.md` — what's shipped, what's next.

---

## Getting started

### Start the dev server

```bash
npm run dev
```

Open `http://localhost:8080` in a browser. The title screen appears.

### Enter the editor

On the title screen, press **`?`** (Shift+/). The editor scene opens.
This is a completely separate scene from gameplay — no protagonist, no
AI, no physics. Press **Exit** in the top bar or **Esc** to return to
the title.

### What you see

A full-screen overlay with the Phaser canvas in the middle:

- **Top bar** — current room name, **Save** (X key), **Audit** (checks
  all door connections), **Reload** (L key), **Exit**.
- **Left panel** — clickable list of every room in `rooms.json`. Click
  a room to warp into it instantly.
- **Right panel** -- Layer buttons (1-5), Tools (Select/Paint/Fill/Color), and a keyboard cheatsheet.
  cheatsheet. When you click an interactable or NPC placeholder in the
  canvas, the top of the right panel shows a **Properties** inspector
  with that object's full JSON and a Copy button.
- **Status bar** — live readout of the active layer, selected tile
  index, active tool, and room dimensions. Context messages (armed
  action, pair status) appear here too.

---

## Camera control

| Input | Action |
|-------|--------|
| **WASD** or **Arrow keys** | Pan the camera |
| **Middle-click drag** | Pan the camera |
| **Ctrl + Wheel** | Zoom in / out (0.5×–4×) |
| **Plain wheel** | Cycle the selected tile |

Right-click is reserved for **tile erase** — it does not pan the
camera.

---

## Navigating the city

### Warp to any room

**Click any room name in the left panel.** Alternatively, press the
**Warp picker** button in the right panel (or its keyboard shortcut):
Up/Down to choose, Enter to teleport, Esc to cancel.

### Audit the maze

Click **Audit** in the top bar. Copies a full graph report of every
room and every door to your clipboard, dumps the same to the browser
console, and shows a summary toast with door counts: `[OK]` / `[TODO]`
/ `[BROKEN]` / `[ONEWAY]` plus unreachable and orphan rooms.

---

## Painting a room

### Switch the active layer

| Key | Layer |
|-----|-------|
| **1** | Ground -- floor tiles |
| **2** | OnGround -- decorative detail on Ground layer |
| **3** | Collision -- walls and physical obstacles |
| **4** | OnCollision -- decorative detail on walls (non-blocking) |
| **5** | Above -- renders over the player (lamps, ceiling, signs) |
| **6** | OnAbove -- decorative detail on Above layer |
| **7** | Spectra -- visible only via Flashlight + Adapter |

Inactive layers dim to 20% so the active one stands out.

### Pick a tile

- **P** — toggle the tile palette. A scrollable grid of every tileset
  frame appears. If the room has additional tilesets declared, each
  tileset gets a labelled section in the palette. Click any thumbnail
  to select it, or **click-drag** across the core section to select a
  block for multi-tile stamping. Press P again to hide.
- **Q / E** — cycle selected tile index down / up (spans all tilesets).
  tile under the cursor on the active layer. Works for color tiles too.
  tile under the cursor on the active layer.

### Paint tools

| Key | Tool |
|-----|------|
| **M** | **Select mode** (default) -- Safe mode; click to inspect, drag to move. No paint. |
| **Paint** | *(any selection)* -- Left-click to paint, right-click to erase. |
| **F** | **Flood fill** -- fills a contiguous area with tile or color. |
| **R** | **Rectangle** -- click-drag to fill a rectangle. |
| **K** | **Color mode** -- paints solid persistent colors instead of tiles. |
| **G** | **Actual view** -- hold to peek at in-game alpha with chrome hidden. |
| **Esc** | Reset to Select mode. |

### Undo / Redo

| Key | Action |
|-----|--------|
| **Ctrl + Z** | Undo last tile edit |
| **Ctrl + Shift + Z** | Redo |

Up to 50 steps per session. History clears when you switch rooms.

### Resize the room

| Key | Action |
|-----|--------|
| **Shift + Arrow** | Expand by one tile on that edge |
| **Ctrl + Shift + Arrow** | Shrink by one tile on that edge |

Right/Down expand keeps existing data anchored top-left. Left/Up shifts
existing data to make room for the new edge. The camera briefly pans to
show you the changed edge.

### Stamp the room with a baseline

Press **T** to overwrite the active room with the `new-room` default:
Ground filled with floor, Collision perimeter walls, Above cleared.
Useful for starting over without losing the room's `rooms.json` entry
or door wiring. Git is the undo.

### Save the tilemap

- **Smart Save (X)** -- saves queued object edits first (moves + creates), then tilemap if dirty.
- **Reload (L)** -- hot-reloads the current room from disk.
- **Dev mode** — attempts to auto-save to
  `public/assets/tilemaps/<roomId>.json`. A toast confirms.
- **Fallback** — if auto-save is unavailable, a toast appears:
  *"Tilemap copied. Paste into: `public/assets/tilemaps/<roomId>.json`"*

Manual paste workflow (tilemap fallback only):
1. Open the named file in your IDE.
2. `Cmd+A`, `Cmd+V`, `Cmd+S`.
3. Refresh the browser. If it looks wrong, `git checkout <file>`.

---

## Building the maze

### Spawn a brand-new room

```bash
npm run new-room <id> [width] [height]
```

- `id` — lowercase, alphanumeric, dashes (e.g. `attic-3b`).
- `width` / `height` — tiles, default 20×15.

Creates: a `rooms.json` stub, a default tilemap, and a music dir at
`public/music/<id>/`. Refresh the page and the room is live. To visit
it before any door connects: click it in the left panel.

### Connect two rooms with paired doors

1. **O** — arm door-pairing. A room picker appears.
2. **Up/Down** to choose the target room, **Enter** to confirm.
   Status bar reads `pair: click source door`.
3. Click the tile in the **source** room where the door sits. The editor
   creates the source door in memory and auto-warps to the target room.
4. Click the tile in the **target** room. The target door is created and
   cross-wired to the source.
5. Press **X** once to save both new door entries to `rooms.json`.
6. Reload (or walk-test immediately) to verify transitions.

Doors come pre-wired with `targetRoom`, `targetDoor`, inferred
`direction`, and spawn points.

### Move an existing door

**Left-click and drag** the cyan crosshair handle on the door to move the
door zone. Press **X** to save.

To edit where the player appears after transition, drag the **magenta spawn
dot** connected to the door by a magenta line. Press **X** to save custom
`spawnX` / `spawnY`.

---

## Placing things in a room

### Inspect any interactable or NPC

Click any interactable or NPC placeholder sprite in the canvas. The
**Properties** panel at the top of the right panel shows the object's
full JSON and a **Copy JSON** button. This is read-only — editing the
JSON in the panel and copying lets you paste a corrected snippet back
into `rooms.json`.

### Place an interactable

1. Press **I** to arm. Status bar shows `armed: interactable`.
2. Click a tile. A new interactable is inserted in memory and selected.
3. Press **X** to persist it to `rooms.json`.
4. Use **Properties -> Copy JSON**, edit the entry in `rooms.json` (at
   minimum: `tileFrame`, `type`, `text`).
5. Add `requires` / `produces` for puzzle logic (see AUTHORING.md).
6. Reload.

> Note: deletion for doors/interactables is not implemented in editor save
> flow yet; remove entries manually in `rooms.json`.

### Place an NPC / afflicted

1. Press **N** to arm. Status bar shows `armed: afflicted`.
2. **Q / E** to cycle through NPC variants (walker, bloater, crawler,
   husk, spitter, brute, ashrot, veinhost) before clicking.
3. Click a tile. Snippet copies to clipboard.
4. Paste under `rooms.<roomId>.afflicted` in `rooms.json`.
5. Edit `name`, `role`, and any optional fields (backstory, holds, etc.).
Left-click and drag the NPC or interactable placeholder sprite. Movement is exact.
On release, the new position is queued for disk save on X.
### Move an existing NPC

**Left-click and drag** the NPC placeholder sprite. On release, the new
position is queued. Press **X** to save to `rooms.json`.

---

## Audio (live mixing)

These shortcuts work in the editor scene:

- **R** — cycle reverb profile (city / indoor / sewer / hospital / substation).
- **`[`** / **`]`** — decrease / increase reverb wet mix (5% steps).
- **`-`** / **`+`** — decrease / increase master volume.

When you find a setting you like, write it back to the room's `reverb` /
`reverbMix` fields in `rooms.json`. Live changes don't persist on reload.

---

## Debug shortcuts

- **L** — hot-reload the current room from disk (also the Reload button).
- **U** — unlock every door in the current room.
- **C** — cure every afflicted in the current room.

Use these to skip ahead while testing. They never persist.

---

## The full new-room loop

1. `npm run new-room basement` — creates the stub in terminal.
2. Refresh browser. Press `?`. Click `basement` in the left panel.
3. Paint Ground (1), Collision walls (2), Above details (3). Use **F**
   or **R** for large areas.
4. **X** to save the tilemap.
5. **O** to wire a door from an existing room, then press **X** to save
   both door entries. Reload. Walk through.
6. **I** for each interactable, **N** for each NPC, then press **X**.
   Edit interactable `text`, `requires`, `produces` in `rooms.json`.
7. **Audit** in the top bar. Fix any `[TODO]` or `[BROKEN]` doors.
8. `git diff`, `git commit -m "basement"`.

**Total time for a basic room with two doors: about 5 minutes.**

---

## Recovering from mistakes

The editor never writes to disk — *you* do, by pasting. Git is the safety net.

```bash
git status            # what's changed
git diff              # review the changes
git checkout <file>   # revert one file to last commit
git commit -m "..."   # save the current state
```

Common rescues:

- **Pasted broken JSON** → open browser devtools, read the error, fix
  the JSON. Or `git checkout src/data/rooms.json`.
- **Painted a tile by mistake** → Ctrl+Z, or eyedropper the correct
  tile and paint over.
- **Resized the wrong direction** → resize back before saving (Ctrl+Z
  doesn't undo resize, but the tilemap isn't saved until you press X).
- **Locked yourself out** → click the room in the left panel to warp
  directly, bypassing doors.

---

## Sprite editor (`$`)

On the title screen, press **`$`** (Shift+4). Full plan/spec: `SPRITEEDITOR.md`.

Edits the 256×256 character spritesheets in `public/assets/sprites/`
(4×4 grid of 64×64 frames; rows = down / left / right / up, columns =
the 4 walk frames, idle = first frame of each row).

1. Pick a sheet in the **top-left dropdown** (only 256×256 PNGs appear).
2. Click a frame in the **4×4 picker** (or cycle with **Q / E**). The row
   you pick pins the preview to that direction.
3. Paint in the center canvas — same tools as the tile editor (PEN / ERA /
   EYE / FILL / BLUR, sizes 1–4, right-click erase, middle-click eyedrop,
   Ctrl+Z / Ctrl+Shift+Z). Edits appear **live** in the thumbnails and the
   animating preview.
4. **Hover the preview pane** and use **WASD / arrows** to walk the
   character around inside it — exactly the movement/facing logic the game
   uses. Release keys to see idle; move the mouse out and it re-centers and
   resumes auto-cycling through all four directions. The **fps −/+** stepper
   changes preview speed only (never saved). **⏸** locks the preview to the
   currently selected frame (still live as you paint). **1:1** toggles the
   sprite between the enlarged 3x default and true in-game size (native
   64px, matching `ENTITY_WORLD_SCALE`) — useful for judging how a design
   actually reads at play size.
5. Frame utilities: **COPY / PASTE** a frame buffer, **FLIP** (mirror
   horizontally — e.g. build the left row from the right row), **ONION**
   (ghost the rest of the current row: blue = earlier frames, red = later).
6. **Box select (SEL tool)** — drag a rectangle on the canvas:
   - **COPY** copies the region (with a selection active, COPY/PASTE work on
     the region instead of the whole frame); **CUT** (next to MIRROR) copies
     and clears it.
   - **PASTE** drops the region as a *floating* layer at the coordinates it
     was taken from — switch frames first to carry a limb across the walk
     cycle. The pasted region stays selected: **NUDGE arrows move it** one
     pixel at a time.
   - The float stamps down when you click elsewhere, switch tool/frame, or
     SAVE. Transparent pixels don't punch holes when stamping. Right-click
     clears the selection; Ctrl+Z cancels a floating region.
   - NUDGE with a selection moves just the selection (lifting it off the
     background); with no selection it shifts the whole frame as before.
7. **ASSIGN** opens the character list — give the open sheet to a cast
   member's human or afflicted slot (writes `characters.json`; reload the
   game to see it).
8. **NEW / DUPE** create a sheet without leaving the editor (dev only):
   NEW writes a blank 256×256 PNG, DUPE forks the open sheet's current
   state under a new name (original file untouched). Both prompt for a
   name, then open the new sheet ready to paint and ASSIGN.
8. **SAVE** writes the sheet back to `public/assets/sprites/<name>.png`
   (dev server only). Reload the page to see it in-game. Git is the undo.

---

## What this guide does NOT cover

- **Puzzle design** — what requires/produces to put on a given
  interactable, which flags to set, how to chain paths. That's
  `PARADIGM.md`.
- **Full JSON field reference** — `requires`, `produces`, `holds`,
  `flagConditions`. That's `AUTHORING.md`.
- **Audio composition** (MIDI / SF2) — see `CLAUDE.md` § Audio
  Workflow.
- **Item state machines** — type definitions exist but the simulation
  engine isn't built yet. See `ROADMAP.md` Phase 3.
