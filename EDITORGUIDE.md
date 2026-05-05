# WARDEN — Editor Guide

Short how-tos for the in-game editor. If you've never used the editor
before, work through this top-to-bottom; otherwise jump to whichever
task you want.

Companion docs:
- `AUTHORING.md` — the same workflow described as a connected recipe.
- `PARADIGM.md` — the design grammar (what kinds of puzzles you can
  compose with these tools).
- `ROADMAP.md` — what's shipped, what's next.

---

## Getting started

### Start the game

```bash
npm run dev
```

Open `http://localhost:8080` in a browser. The protagonist spawns in
their apartment.

### Three modes (toggle with F-keys)

| Key | Mode |
|-----|------|
| **F1** | Debug HUD — FPS, room id, player coords, cursor coords, tile GIDs under cursor |
| **F2** | Editor — paint tiles, place interactables, drag NPCs, resize the room |
| **F3** | Visual overlays — collision (red walls), doors (cyan if wired, red if unwired/broken), interactable radii (yellow), NPC radii (magenta) |

All three can be on at once.

### Move the protagonist

WASD or arrow keys. The protag is your cursor for everything you'll
do in the editor — walk anywhere collision allows.

---

## Navigating the city

### Teleport to any room

Press **F4**. Use **Up/Down** to choose a room from the list, **Enter**
to teleport, **Esc** to cancel. Player movement is paused while the
picker is open.

### Audit the maze

Press **F5**. Copies a full graph report of every room and every door
to your clipboard, dumps the same to the browser console, and shows a
summary toast on screen with door counts:
`[OK]` / `[TODO]` / `[BROKEN]` / `[ONEWAY]` plus unreachable and orphan
rooms. The full text is paste-able into a notes file.

### Teleport within a room

Hold **Shift** and click anywhere in the visible viewport (works when
F1 or F2 is on). The protag teleports to the cursor.

---

## Painting a room

### Enter editor mode

Press **F2**. The yellow map-outline appears, and a HUD strip shows
at the bottom of the screen.

### Switch the active layer

| Key | Layer |
|-----|-------|
| **1** | Ground — floor tiles |
| **2** | Collision — walls and obstacles |
| **3** | Above — things that render over the player (lamps, ceiling, signage) |

Inactive layers dim to 20% so the active one stands out.

### Pick a tile

Three ways:

- **P** — toggle the tile palette. A grid of every tileset frame
  appears in the upper-right. Click any thumbnail to select it, or
  **click and drag** to select a block of tiles (Multi-tile Stamp).
  The selected area gets a yellow outline. Press **P** again to hide.
- **Q / E** — cycle the selected tile index down / up. Useful for
  quick small steps without opening the palette.
- **Middle-click** or **Alt + Left-click** — eyedropper. Picks the
  tile under the cursor on the active layer. Useful when you see a
  tile in the room and want to paint more like it.

All three update the same selection. The HUD shows the current tile
index (or range), a preview, and the **active tool**.

### Paint tools

- **Esc** — reset to default Paint tool.

| Key | Tool | Description |
|-----|------|-------------|
| **(default)** | Paint | Single-tile or Multi-tile brush. Left-click to paint, right-click to erase. |
| **F** | Flood Fill | Fill a contiguous area of the same tile with the selection. |
| **R** | Rectangle | Click and drag to fill a rectangular area with the selection. |

### History (Undo/Redo)

The editor tracks up to 50 steps of tile painting history.

- **Ctrl + Z** — Undo last action.
- **Ctrl + Shift + Z** — Redo last undone action.

### Paint and erase

- **Left-click** — paint using the active tool.
- **Left-click + drag** — paint many tiles (Paint tool only).
- **Right-click** — erase (Paint tool only).

### Resize the room

| Key | Action |
|-----|--------|
| **Shift + Arrow** | Expand by one tile on that edge |
| **Ctrl + Shift + Arrow** | Shrink by one tile on that edge |

Right/Down expand keeps existing data anchored top-left. Left/Up
shifts existing data inward to make room for the new edge. The
camera briefly pans to the changed edge so you can see the room
got bigger / smaller.

### Stamp the room with a baseline

Press **T** to overwrite the current room with the default content
the `npm run new-room` script produces:

- Ground filled entirely with floor.
- Collision: walls around the perimeter, interior empty.
- Above cleared.

Useful for re-baselining a room mid-edit when you want to start over
without losing the room's existence in `rooms.json` or its door
connections. Git is the undo (`git checkout public/assets/tilemaps/<roomId>.json`).

### Save the tilemap

Press **X**. 

**Development mode:**
If running via `npm run dev`, the editor attempts to **auto-save**
directly to `public/assets/tilemaps/<roomId>.json`. A toast will
confirm: *"Saved to disk: ..."*.

**Production / Fallback:**
If auto-save fails or is disabled, a yellow toast appears: *"Tilemap
copied. Paste into: `public/assets/tilemaps/<roomId>.json`"*.

Manual Workflow:
1. Open that file in your IDE.
2. `Cmd+A` (select all), `Cmd+V` (paste), `Cmd+S` (save).
3. Refresh the browser to confirm.

If something looks wrong, `git checkout public/assets/tilemaps/<roomId>.json`
to revert.

---

## Building the maze

### Spawn a brand-new room

In the terminal:

```bash
npm run new-room <id> [width] [height]
```

- `id` — lowercase, alphanumeric, dashes (e.g. `attic-3b`).
- `width` / `height` — tiles, default 20×15.

Creates three things in one shot:

1. A stub entry in `src/data/rooms.json`.
2. A default tilemap at `public/assets/tilemaps/<id>.json` (perimeter
   walls, floor inside).
3. A music directory at `public/music/<id>/` with a `.gitkeep` so it's
   tracked in git. Drop `track.mid` and/or `instruments.sf2` in there
   later to override the global audio for this room. If the dir stays
   empty, the room uses `public/music/global.sf2` and
   `public/music/main_theme.mid` as fallbacks.

Refresh the browser. The room exists.

To get into a brand-new room before any door connects to it:
- Wire a door from an existing room (next section), **or**
- Temporarily set `"startRoom": "<your-id>"` in `rooms.json` and
  refresh.

### Connect two rooms (paired doors)

The maze is built from doors that point at each other. The editor
handles both ends in one flow:

1. Warp to the *source* room (F4, pick, Enter).
2. Press **O** to start door-pairing. A centered yellow-bordered
   picker appears listing every other room.
3. Use **Up** / **Down** to highlight the target room. Press
   **Enter** to confirm. The picker closes; the HUD's status line
   says `pair: click source door (target=<id>)`.
4. **Click** the tile where the door should sit in the *source*
   room. The editor auto-warps you to the target room. The status
   line now reads `pair: click target door in <id>`.
5. **Click** the tile where the *matching* door should sit in the
   target room.

Each click delivers a self-contained paste: the **full updated
room JSON entry** for the room you just clicked in.

- After the source click: clipboard holds
  `"<source-room-id>": { ...full room... }` with the new door already
  appended to its `doors[]`. Toast: *"Source room JSON copied.
  Replace `"<source-room-id>"` entry in rooms.json."*
- After the target click: clipboard holds the same shape for the
  target room.

Both clicks also dump the same JSON to the browser console, so you
can scroll back and grab the source-room JSON later if you've
already overwritten the clipboard with something else.

The doors already have:
- matching `targetRoom` / `targetDoor` ids cross-referenced
- `direction` inferred from which edge of the room you clicked nearest
- sensible `spawnX` / `spawnY` (one tile inside each room, in front of
  the door)
- size **16×16** — a single tile. If you want a 2-tile-wide opening,
  run the pair flow once, paste, then run it again with a click on the
  adjacent tile to create a second door right next to the first.
  Direction only affects which side of the doorway the player lands on
  when they pass through; size stays one tile per door.

**Workflow:** open `src/data/rooms.json`. After each click, find that
room's `"<id>": {...}` entry, select from `"<id>":` through the
matching `}`, and paste over with the clipboard contents. Save. After
both pastes, refresh the browser and walk through the new portal.

Press **Esc** at any phase to abandon the pair without writing
anything.

---

## Adding things to a room

### Place an interactable

Anything the player presses **E** on — sign, lock, container, planter,
recharger, etc.

1. In editor mode, pick the tileset frame you want as the visible
   sprite using **Q/E**.
2. Press **I** to arm. HUD shows `ARMED: INTERACTABLE`.
3. Click the tile where it should sit.
4. Snippet copies to clipboard. Paste under
   `rooms.<roomId>.interactables`.
5. Edit the snippet:
   - `text` — the dialog string shown when E succeeds.
   - `type` — `sign`, `item`, `recharge`, etc.
   - `tileFrame` — the tileset frame for the visible sprite.
   - `requires` — `[]` for always-works; otherwise items / characters
     / world flags needed.

### Place an afflicted / NPC

1. Press **N** to arm. HUD shows `ARMED: AFFLICTED`.
2. Click a tile.
3. Snippet copies. Paste under `rooms.<roomId>.afflicted`.
4. Edit `name` and `role`. Reload.

### Move an existing afflicted / interactable

In editor mode, **left-click and drag** them. 

**Development mode:**
If running via `npm run dev`, the editor attempts to **auto-save** the
new position directly to `src/data/rooms.json`. A toast will confirm:
*"Saved afflicted/interactable ... position"*.

**Production / Fallback:**
On release, a small snippet with the new `x` / `y` copies to clipboard
with the path to update in `rooms.json`. Apply manually.

---

## Audio tweaks (live mixing)

These shortcuts work whenever F1 or F2 is on:

- **R** — cycle reverb profile (city / indoor / sewer / hospital / substation).
- **`[`** / **`]`** — decrease / increase reverb wet mix (5% steps).
- **`-`** / **`+`** — decrease / increase master volume.

When you find a setting you like, copy it back into the room's
`reverb` / `reverbMix` fields in `rooms.json`. Live changes don't
persist on reload.

---

## Cheats / debug shortcuts

These work when F1 or F2 is on:

- **L** — hot-reload the current room from disk.
- **U** — unlock every door in the current room (skip lock checks).
- **C** — cure every afflicted in the current room.
- **Shift + Click** — teleport the protag to the cursor.

Use these to skip ahead while testing. They never persist.

---

## The full new-room loop

Putting it all together:

1. `npm run new-room basement` → terminal creates the stub.
2. Refresh the browser. F4 → arrow to `basement` → Enter. You're in.
3. F2 to enter editor. Paint Ground (1, then L-click). Paint
   Collision walls (2). Optionally paint Above-layer details (3).
   Use **F** (Flood Fill) or **R** (Rectangle) for large areas.
4. **X** to save the tilemap. In DEV, it auto-saves to disk.
5. **O** to wire a door from an existing room into `basement`.
   Cycle to `basement`, Enter, click here, click there.
   Paste both blocks into `rooms.json`. Refresh. Walk through.
6. **I**, **N** for any signs / locks / NPCs you want. Each pastes
   into `rooms.json`.
7. F5 to audit. Look for `[TODO]` or `[BROKEN]` flags on the room's
   doors. Fix them.
8. `git diff` to review. `git commit -m "basement"`.

Total time for a basic room with two doors: about 5 minutes.

---

## Recovering from mistakes

The editor never writes to disk — *you* do, by pasting. So git is
the safety net. Useful commands:

```bash
git status            # what's changed since the last commit
git diff              # review the actual changes
git checkout <file>   # revert one file to its last committed state
git commit -m "..."   # save the current state
```

Common rescues:

- **Pasted broken JSON, page won't load** → open browser devtools,
  look at the error, fix the JSON. Or `git checkout <file>` and try
  again.
- **Painted a tile by mistake** → press **Q/E** to find the original
  tile, or **Alt+Click** an adjacent good tile to eyedropper, then
  paint over.
- **Resized the wrong direction** → resize back the other way (no
  data is permanently lost as long as you didn't save and reload yet).
- **Locked yourself out of a room** → temporarily set
  `"startRoom": "<id>"` in `rooms.json`, refresh, walk in.

Commit small, commit often, with short messages. Past you only has
to be a clear waypoint for future you.

---

## Character switching (live)

Once a resident is cured and has completed their recovery conversation
(all `backstory` pages via E), they join the roster. Switch between
roster members using:

| Key | Action |
|-----|--------|
| **1** | Switch to roster slot 1 (protagonist) |
| **2** | Switch to roster slot 2 (first recovered) |
| **3** | Switch to roster slot 3 |
| **4** | Switch to roster slot 4 |

Or click the portrait icons in the avatar bar at the bottom-left of
the screen. The active character is outlined in yellow.

Switching saves the current character's room and position, swaps
inventories, and repositions the player sprite at the target
character's last known location. Cross-room switches play a full
fade transition.

---

## What this guide does NOT cover

- Item state machines, world flags — engine features still being built.
  See `ROADMAP.md` for what's next.
- Story content, character names, puzzle paths — those decisions live
  in your head until you're standing in the room. See `PARADIGM.md`
  for the design grammar that shapes them.
- Audio composition (MIDI / SF2 authoring) — see `CLAUDE.md`
  § Audio Workflow. The audio engine is finished; you compose in any
  DAW you like.
