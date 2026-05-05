# WARDEN — Authoring a Room

This is the practical guide for building a room. The editor handles
the spatial work; you finalize text and rules in `src/data/rooms.json`.
Every save is manual: editor copies JSON to your clipboard, you paste
into the named file.

Companion docs:
- `EDITORGUIDE.md` — short how-tos for someone learning the editor.
  If you're new, start there.
- `CLAUDE.md` — design intent (the "why").
- `PARADIGM.md` — the design grammar; what kinds of puzzles the engine
  supports and how to compose them. Read this before designing a
  puzzle path.
- `ROADMAP.md` — the build sequence; what's shipped, what's next.

This file is the recipe — keys, files, hands-on flow.

## Authoring philosophy

Two ideas underpin the workflow:

1. **The protagonist is your cursor.** Authoring happens *inside* the
   running game. F4 warps the protag between rooms, F2 turns on the
   editor, the same body you'll play with is the body you build with.
   You aren't editing a game from the outside; you're walking through
   it as you make it.
2. **You are the gatekeeper of the repo.** The editor never writes to
   disk silently. Every save copies JSON to your clipboard with a
   destination path; you paste, save, reload. Slower than auto-save by
   ~5 seconds per save, but every change is yours on purpose. Git is
   the safety net — `git diff` before committing, `git checkout <file>`
   to revert any individual file.

---

## Spawn a new room

```bash
npm run new-room <id> [width] [height]
```

- `id` — lowercase, alphanumeric, dashes (e.g. `attic-3b`)
- `width` / `height` — tiles, default 20×15

This appends a stub to `src/data/rooms.json`, writes a default
tilemap at `public/assets/tilemaps/<id>.json` (perimeter walls + floor,
empty Above layer), and creates `public/music/<id>/` with a `.gitkeep`
so the room's audio override slot is ready (drop `track.mid` /
`instruments.sf2` in later, or leave it empty to use the global
fallbacks). PreloadScene auto-registers every room in `rooms.json`,
so no source-code edit is needed. Reload the dev server or refresh
the page and the room is live.

To get into a brand-new room before any door is wired: F1 to open the
debug HUD, then Shift+Click teleports the player to the cursor — but
that only works within the current room. The cleanest path is to wire
a door from an existing room first (see "Place a door" below). For a
quick check, you can also temporarily set `"startRoom": "<id>"` in
`rooms.json` and reload.

---

## Start the editor

```bash
npm run dev
```

In the browser:

| Key | Does |
|-----|------|
| **F1** | Info HUD (FPS, room id, coords, tile GID under cursor) |
| **F2** | Toggle live editor |
| **F3** | Visual debug overlays (collision, doors, interactable radii) |
| **F4** | Warp picker — Up/Down to choose a room, Enter to teleport, Esc to cancel |
| **F5** | Map overview — copies the room graph to clipboard, shows summary stats on screen, dumps full report to console |

When F2 is on you'll see the yellow **map outline** and the **editor HUD**
at the bottom of the screen. The HUD shows current layer, current tile
index, map dimensions, and active placement mode.

---

## Paint tiles

| Key | Does |
|-----|------|
| **1 / 2 / 3** | Active layer = Ground / Collision / Above (others dim) |
| **Q / E** | Cycle selected tile index down / up |
| **L-Click** | Paint selected tile on active layer |
| **R-Click** | Erase tile on active layer |
| **M-Click** or **Alt + L-Click** | Eyedropper — pick the tile under cursor |

The selected tile's preview shows next to the HUD. Index `0` is empty
(eraser).

---

## Resize the room

| Key | Does |
|-----|------|
| **Shift + Arrow** | Expand the room by one tile on that edge |
| **Ctrl + Shift + Arrow** | Shrink the room by one tile on that edge |

Right/Down expand keeps existing data anchored top-left. Left/Up
shifts existing data right/down to make room. After resize, the
camera briefly pans to show you the changed edge, then returns.

The map outline updates immediately. The HUD shows the new
dimensions (`Map: 21x15`).

---

## Save the tilemap

Press **X**.

Toast appears: *"Tilemap copied. Paste into:
`public/assets/tilemaps/<roomId>.json`"*

Workflow:

1. Open the named file in your editor.
2. `Cmd+A` to select all, `Cmd+V` to paste, `Cmd+S` to save.
3. Reload the page in the browser to confirm.

If something looks wrong, `git checkout public/assets/tilemaps/<roomId>.json`
to restore.

---

## Place an interactable (E-targets)

An interactable is anything the player can press E on — a sign, a
container, a planter, a lock, a piece of equipment.

1. In editor mode, press **`I`** to arm placement. HUD shows
   `ARMED: INTERACTABLE`.
2. Click a tile. Toast appears with the JSON snippet copied to
   clipboard.
3. Esc cancels without placing.

Snippet looks like:

```json
{
  "id": "inter-a3k9q",
  "x": 152,
  "y": 88,
  "type": "sign",
  "tileFrame": 12,
  "text": "TODO: edit me",
  "requires": []
}
```

Paste it into `src/data/rooms.json` under `rooms.<roomId>.interactables`
(append to the array). Then edit:

- **`tileFrame`** — the tileset frame to render. Pick something
  visible so the player can find it. The `tileFrame` is the value
  *minus 1* of what you'd see in the F1 cursor inspector (Phaser uses
  0-indexed sprite frames).
- **`type`** — `sign` (just text), `item` (pickable), `recharge`
  (refills flashlight), or your own (lock, planter, container — once
  the engine grows).
- **`text`** — the dialog string shown when interaction succeeds.
- **`requires`** — list of conditions to interact (item ids,
  character ids, world flags). Empty array = always works.
- **`item`** — if `type` is `item`, fill its definition.

Reload to see it in the room.

---

## Pair two doors (the portal that connects them)

Doors come in pairs — one in each room, pointing at each other. The
editor handles the cross-references for you. Three keystrokes plus
two clicks:

1. Press **`O`** while in the source room. A centered picker appears
   listing every other room.
2. Use **Up** / **Down** to highlight the target room. Press **Enter**
   to confirm. The picker closes; the editor HUD now shows
   `pair: click source door (target=<id>)`.
3. Click the tile where the door should sit in the *source* room.
   The clipboard now holds the source room's **full updated JSON
   entry** (`"<source-id>": { ... }`) with the new door appended to
   its `doors[]`. Toast confirms. Editor warps you to the target
   room.
4. Click the tile where the matching door should sit in the *target*
   room. Clipboard now holds the target room's full updated entry
   in the same shape. Both fragments are also logged to the console
   so you can scroll back and grab the source one if you've moved
   on from the clipboard.

   Both doors already have:
   - matching `targetRoom` / `targetDoor` ids cross-referenced
   - `direction` inferred from which edge of the room you clicked
     nearest (top→up, bottom→down, left→left, right→right)
   - sensible `spawnX/Y` (one tile inside each room, in front of the
     door)
   - size **16×16** (single tile). For a 2-tile-wide opening, run the
     pair flow twice with adjacent clicks; you'll get two square doors
     side-by-side.

5. In `src/data/rooms.json`, find each room's `"<id>": {...}` entry
   and replace it with the matching clipboard fragment. Save. Reload
   the browser, and the portal is live.

Direction was guessed from the click — if you placed a door in the
middle of the room, its direction may be off. Edit it in the JSON.

Press **Esc** at any phase (room picker, source click, target click)
to abandon the pair without writing anything.

---

## Place an afflicted / NPC

1. Press **`N`** to arm. HUD shows `ARMED: AFFLICTED`.
2. Click a tile.
3. Toast copies the snippet.

Snippet:

```json
{
  "id": "aff-h4n7d",
  "name": "TODO",
  "role": "TODO",
  "x": 152,
  "y": 88,
  "behaviorLoop": "wander"
}
```

Paste under `rooms.<roomId>.afflicted`. Edit `name` and `role`. Reload.

### Full afflicted fields

The minimal snippet above starts the NPC wandering with no cure
recovery. For a curable character that joins the roster, fill in the
optional fields:

```json
{
  "id": "unique-id",
  "name": "Kai",
  "role": "Former Lab Technician",
  "x": 400, "y": 500,
  "behaviorLoop": "wander",

  "variant": "walker",
  "playerVariant": "ranger",

  "associatedRoom": "house-b",
  "curedClue": "Short mumble shown in the cure dialog — hints where to find them.",

  "backstory": [
    "First dialog page (E press 1).",
    "Second page (E press 2).",
    "Final page — recovery triggers here, items handed over."
  ],
  "recoveredItems": [
    { "name": "Lab Keycard", "tileFrame": 8, "category": "key", "keyId": "lab-door" },
    { "name": "Compound Sample", "tileFrame": 9, "category": "component" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `variant` | no | Afflicted sprite to use (`walker`, `bloater`, `crawler`, `husk`, `spitter`, `brute`, `ashrot`, `veinhost`). Default: `walker`. |
| `playerVariant` | no | Player sprite to swap to on cure (`ranger`, `rogue`, `mystic`, `drifter`, `scavenger`, `warden`, `ashwalker`). If omitted, no sprite swap occurs. |
| `associatedRoom` | no | Room ID where they appear after being cured. They disappear from their original room once cured and only spawn here. |
| `curedClue` | no | Short line shown at the bottom of the cure dialog. Should hint at `associatedRoom` without naming it. |
| `backstory` | no | Array of dialog pages. Player presses E once per page. Final page triggers full recovery: status → `recovered`, character joins roster, `recoveredItems` placed in their inventory. |
| `recoveredItems` | no | Two items (by convention) placed in the character's personal inventory on recovery. Standard `ItemDef` format. |

The same entry should appear in **both** the original room (as
`wandering`) and the `associatedRoom` (so they respawn there after
cure). The `associatedRoom` copy only needs `id`, `name`, `role`,
`x`, `y`, `behaviorLoop`, `variant`, `playerVariant`, and
`associatedRoom` — the engine reads all fields from both defs.

To **reposition** an existing afflicted (instead of placing a new one):
in editor mode, just click and drag them. On release, a snippet with
just the new `x` and `y` is copied to clipboard, and the toast tells
you which entry in `rooms.json` to update.

---

## Set up the room's audio

In `rooms.json`, on the room object:

```json
{
  "id": "your-room",
  "reverb": "indoor",
  "reverbMix": 0.4
}
```

Reverb profiles: `city`, `indoor`, `sewer`, `hospital`, `substation`.
`reverbMix` is 0..1 (default 0.3 if omitted).

Reverb takes effect on the next door transition into this room. Test
with **R** in editor mode (cycles through profiles live) and **`[`** /
**`]`** (changes wet mix). Whatever you settle on, write back to
`rooms.json`.

---

## Quick global keys (debug + audio)

These are active when F1 (debug) or F2 (editor) is on:

- **L** — hot-reload the current room from disk.
- **U** — unlock all doors in this room.
- **C** — cure all afflicted in this room.
- **R** — cycle reverb profile.
- **`[`** / **`]`** — decrease / increase reverb wet mix.
- **`-`** / **`+`** — decrease / increase master volume.
- **Shift + Click** — teleport player to cursor.

---

## The full authoring loop

For a brand-new room:

1. `npm run new-room <id>` — creates the rooms.json stub, the default
   tilemap with perimeter walls, and registers the asset. Reload.
2. Drop into the room — wire a door from somewhere existing, or
   temporarily set `"startRoom": "<id>"` in `rooms.json`.
3. F2 editor on. Paint Ground tiles. Paint Collision walls. Paint
   Above-layer details (lamps, decals, decorations).
4. Press **X**, paste tilemap into
   `public/assets/tilemaps/<roomId>.json`.
5. **`O`** + click for each door. Paste each into `rooms.json`.
6. **`I`** + click for each E-target. Paste into `rooms.json`.
   Set `tileFrame`, `text`, and `requires` for each.
7. **`N`** + click for each afflicted. Set `name` and `role`.
8. Add `reverb` (and optional `reverbMix`) to the room object.
9. Reload, walk through, fix anything that didn't render or interact
   right.
10. `git diff` to review. `git commit` when satisfied.

---

## Safety net

You always have git. If you paste over the wrong file, paste broken
JSON, or just want to throw away a session's work:

```bash
git checkout <file>          # Revert one file to last commit
git checkout .               # Revert all uncommitted changes (careful)
git diff                     # See what changed since last commit
git status                   # See which files are modified
```

Commit often with terrible messages — every commit is a place future
you can land back on.

---

## What the editor does NOT do (yet)

These are things you'll do directly in `rooms.json`:

- Edit text on an existing interactable.
- Change an interactable's `requires`, `tileFrame`, or `type`.
- Re-link a door's `targetRoom` / `targetDoor`.
- Define item state machines or world flags (engine doesn't support
  these yet — see `ROADMAP.md` Phase 3 and Phase 5).
- Edit afflicted `backstory`, `curedClue`, `recoveredItems` — text-edit
  directly in `rooms.json`.

The editor stays focused on placement and layout. Everything else is
text editing in the JSON, with reload to verify. That's the deal:
spatial work is visual; rules and content are text.
