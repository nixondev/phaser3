# WARDEN — Authoring Guide

Practical reference for building content. The editor handles spatial
work; all rules and text live in `src/data/rooms.json`. Every save is
manual: editor copies JSON to your clipboard, you paste into the file.

Companion docs:
- `EDITORGUIDE.md` — keyboard shortcuts and the hands-on editor workflow.
  If you're new, start there.
- `PARADIGM.md` — the design grammar; what kinds of puzzles the engine
  supports and how to compose them. Read this before designing puzzle paths.
- `ROADMAP.md` — what's shipped, what's next.

---

## Philosophy

**The editor is a separate scene, not an overlay.** Press `?` on the
title screen to enter it. Gameplay is gameplay; authoring is authoring.
There is no protagonist in the editor — your mouse cursor is the cursor.

**You own every write.** The editor never modifies files silently.
Every save copies JSON to your clipboard with a destination path; you
paste, save, reload. Slower than auto-save by five seconds, but every
change is intentional. `git diff` before committing, `git checkout
<file>` to revert anything.

---

## Spawn a new room

```bash
npm run new-room <id> [width] [height]
```

- `id` — lowercase, alphanumeric, dashes (e.g. `attic-3b`).
- `width` / `height` — tiles, default 20×15.

Creates a `rooms.json` stub, a default tilemap (perimeter walls + floor),
and `public/music/<id>/` for audio overrides. Refresh the browser and
the room is live. Click its name in the editor's left panel to visit it.

To get a room running before any door connects it, temporarily set
`"startRoom": "<id>"` in `rooms.json` and reload.

---

## Room definition fields

All rooms live in `src/data/rooms.json` under a `"rooms"` object keyed
by room id.

```json
{
  "id": "basement",
  "name": "Basement",
  "mapKey": "basement",
  "tilemapPath": "assets/tilemaps/basement.json",
  "width": 20,
  "height": 15,
  "playerSpawn": { "x": 160, "y": 120 },
  "reverb": "indoor",
  "reverbMix": 0.4,
  "dark": true,
  "weather": "dripping",
  "doors": [...],
  "interactables": [...],
  "afflicted": [...],
  "flagConditions": [...]
}
```

| Field | Description |
|-------|-------------|
| `reverb` | `city`, `indoor`, `sewer`, `hospital`, `substation` |
| `reverbMix` | 0..1 wet mix (default 0.3) |
| `dark` | `true` → full darkness overlay; flashlight required |
| `weather` | `rain-mild`, `rain-hard`, `dripping` |
| `flagConditions` | Applied at room load — see **World flags** section |

Live-test reverb with **R** in the editor; adjust wet mix with **[** / **]**.

---

## Doors

Doors come in pairs — one in each room, pointing at each other. Use the
editor's **O** key flow to auto-generate both snippets (see EDITORGUIDE.md).

```json
{
  "id": "basement-exit",
  "x": 160, "y": 0,
  "width": 16, "height": 16,
  "targetRoom": "ground-floor",
  "targetDoor": "ground-floor-basement",
  "direction": "up",
  "spawnX": 160, "spawnY": 24,
  "requiredKeys": ["master-key"]
}
```

| Field | Description |
|-------|-------------|
| `direction` | `up`, `down`, `left`, `right` — which edge the player enters from |
| `spawnX/Y` | Where the player appears after walking through |
| `requiredKeys` | Array of item `keyId` strings. Any one match unlocks the door. |

The key is consumed on use (unless it's `"skeleton-key"`, which is
infinite-use). Leave `requiredKeys` out or empty for an open door.

---

## Interactables (E-targets)

Every interactable is something the player can press E on.

### Minimal sign

```json
{
  "id": "notice-board",
  "x": 64, "y": 48,
  "type": "sign",
  "tileFrame": 12,
  "text": "Evacuation route sealed by order of District Authority."
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | yes | Unique string within the room |
| `x`, `y` | yes | World pixel position (tile×16) |
| `type` | yes | `sign`, `item`, `recharge`, or any string for generic |
| `tileFrame` | no | Tileset frame rendered in the world. Required for anything visible. |
| `text` | yes | Dialog shown when E is pressed and all `requires` are met |
| `requires` | no | Conditions; omit or `[]` for always-works |
| `produces` | no | Effects fired on success |
| `consumed` | no | `true` → disappears after one successful interaction |

### Item pickup

```json
{
  "id": "lab-keycard-pickup",
  "x": 80, "y": 96,
  "type": "item",
  "tileFrame": 8,
  "text": "A keycard. Facility authority level.",
  "item": {
    "name": "Lab Keycard",
    "tileFrame": 8,
    "category": "key",
    "keyId": "lab-door"
  }
}
```

When E'd, the item is added to the active character's inventory. The
sprite disappears and the interactable is marked collected.

### Recharge station

```json
{
  "id": "bedside-charger",
  "x": 200, "y": 184,
  "type": "recharge",
  "tileFrame": 39,
  "text": "Charging dock. Flashlight topped up."
}
```

Refills the flashlight battery to 100% when E'd.

---

## `requires` — conditions for interaction

`requires` is an array of conditions. **All** must be true for the
interaction to succeed. If any fail, the player sees "Something here,
but not like this." — confirming the target is real without revealing
what's needed.

```json
"requires": [
  { "type": "item",      "value": "fuel-can", "consume": true },
  { "type": "character", "value": "kai" },
  { "type": "flag",      "value": "power_restored" }
]
```

| `type` | `value` | `consume` |
|--------|---------|-----------|
| `"item"` | item `keyId` or `name` | `true` → remove from inventory on success |
| `"character"` | roster character `id` | — |
| `"flag"` | world flag name | — |

`requires: []` or omitting `requires` entirely means the interaction
always works.

---

## `produces` — effects on success

`produces` is an array of effects applied after all conditions are met,
in order.

```json
"produces": [
  { "type": "setFlag",   "value": "generator_on" },
  { "type": "unlockDoor","value": "utility-inner" },
  { "type": "dropItem",  "value": "empty-can", "x": 120, "y": 80,
    "item": { "name": "Empty Can", "tileFrame": 5, "category": "component" } }
]
```

| `type` | `value` | Extra fields |
|--------|---------|--------------|
| `"setFlag"` | flag name | — |
| `"clearFlag"` | flag name | — |
| `"unlockDoor"` | door `id` | — |
| `"dropItem"` | arbitrary key | `x`, `y` (world coords), `item` (ItemDef) |

`produces` can be combined freely. A generator might set a flag AND
unlock a door AND drop an empty can.

### Full example — a generator

```json
{
  "id": "generator-main",
  "x": 112, "y": 96,
  "type": "machine",
  "tileFrame": 23,
  "text": "The generator roars. Power restored.",
  "consumed": true,
  "requires": [
    { "type": "item", "value": "fuel-can", "consume": true }
  ],
  "produces": [
    { "type": "setFlag",   "value": "power_restored" },
    { "type": "unlockDoor","value": "lab-inner" },
    { "type": "dropItem",  "value": "empty-can", "x": 128, "y": 96,
      "item": { "name": "Empty Can", "tileFrame": 5, "category": "component" } }
  ]
}
```

The player walks up with a fuel can, presses E: can is consumed,
generator disappears (`consumed: true`), `power_restored` flag is set,
`lab-inner` door unlocks, an empty can appears in the world.

---

## Items

Items live inside interactable `item` fields, in afflicted `recoveredItems`
or `holds` fields, or as `DroppedItemState` entries in `droppedItems`.

```json
{
  "name": "Fuel Can",
  "tileFrame": 49,
  "category": "fuel",
  "keyId": "fuel-can",
  "consumedOnUse": true
}
```

| Field | Description |
|-------|-------------|
| `name` | Display name in inventory |
| `tileFrame` | Tileset frame (0-indexed). Match the frame you'd see in the editor. |
| `category` | `key`, `cure`, `fuel`, `document`, `tool`, `component` |
| `keyId` | Used in `requiredKeys` on doors and `value` in item requires |
| `content` | Text shown in the document reader (category: document only) |
| `consumedOnUse` | `true` → removed from inventory when used from the inventory menu |

### Document items

A document item opens a full-screen reader when E'd from inventory.
Multi-page content: separate pages with `\n---\n` in the `content` string.

```json
{
  "name": "Evacuation Memo",
  "tileFrame": 7,
  "category": "document",
  "content": "All residents report to assembly points by 06:00.\n---\nDo not use corridor B. Route sealed pending inspection."
}
```

---

## Afflicted / NPC fields

Minimal snippet (just a wandering NPC):

```json
{
  "id": "wanderer-1",
  "name": "Unknown Resident",
  "role": "Unnamed",
  "x": 200, "y": 160,
  "behaviorLoop": "wander"
}
```

Full curable character that joins the roster:

```json
{
  "id": "kai",
  "name": "Kai",
  "role": "Former Lab Technician",
  "x": 400, "y": 500,
  "behaviorLoop": "wander",

  "variant": "walker",
  "playerVariant": "ranger",

  "associatedRoom": "house-b",
  "curedClue": "...mumbles about the north block...",

  "holds": [
    { "name": "Security Badge", "tileFrame": 8, "category": "key", "keyId": "security-badge" }
  ],

  "backstory": [
    "First dialog page shown when E is pressed after cure.",
    "Second page.",
    "Final page — triggers full recovery and item handover."
  ],
  "recoveredItems": [
    { "name": "Lab Keycard", "tileFrame": 8, "category": "key", "keyId": "lab-door" },
    { "name": "Compound Sample", "tileFrame": 9, "category": "component" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `variant` | Afflicted sprite: `walker`, `bloater`, `crawler`, `husk`, `spitter`, `brute`, `ashrot`, `veinhost` |
| `playerVariant` | Player sprite on character switch (omit for no swap) |
| `associatedRoom` | Room where they reappear after cure (disappear from original room) |
| `curedClue` | Short line in the cure dialog — hints where to find them |
| `holds` | Items **dropped into the world at their position when cured** |
| `backstory` | Array of dialog pages (E × n). Final page triggers recovery + item handover |
| `recoveredItems` | Items placed in their personal inventory on recovery (by convention: two) |

### Inter-character conversation

A recovered resident can have a unique conversation that only triggers when a
specific other recovered resident is also in the same room. This uses three
optional fields on the afflicted def:

```json
{
  "id": "kai",
  ...
  "conversationRequires": "maren",
  "conversationDialog": [
    "Kai glances at Maren. \"You remember the east maintenance shaft?\"\nMaren nods slowly.",
    "\"There's a route through the utility tunnels. We mapped it together.\nNeither of us could have held onto that alone.\""
  ],
  "conversationProduces": [
    { "type": "setFlag", "value": "kai_maren_talked" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `conversationRequires` | `id` of the roster member that must be present in the same room |
| `conversationDialog` | Multi-page dialog shown when the partner is present (E advances pages) |
| `conversationProduces` | Effects applied once when the conversation reaches its final page |

**"Present in room"** means either the active character or a parked body whose last known room matches the current one. If the player switches to Maren and walks to Kai, or leaves Maren parked here and approaches Kai as another character, the condition is met.

If the partner is absent, pressing E on the resident shows the default solo response (`"I'm ready when you are."`). The player gets no indication that a richer version exists — they discover it by bringing the right people together.

`conversationProduces` fire only on the **first** completion of the conversation (per session). Subsequent re-readings show the full dialog again but do not re-apply effects. Use `setFlag` / `clearFlag` in produces — `dropItem` will not duplicate on re-read but is better placed elsewhere.

The same NPC should appear in **both** the original room (wandering) and
`associatedRoom` (as a cured spawn destination). The `associatedRoom`
copy only needs `id`, `name`, `role`, `x`, `y`, `behaviorLoop`,
`variant`, `playerVariant`, and `associatedRoom` — the engine reads full
fields from all defs and uses the most complete one.

### Entity holds

`holds` items drop into the world the moment the afflicted is cured —
whether by automatic collision or by using a cure item from inventory.
The items appear at the afflicted's position.

This is how you hide an item inside an NPC without the player knowing
it's there until they cure them.

---

## World flags

World flags are named booleans stored globally for the run. They're set
and cleared by `produces` effects and survive room transitions and save/load.

### Setting and reading flags

**Set** a flag via a produce effect on any interactable:
```json
"produces": [{ "type": "setFlag", "value": "bridge_repaired" }]
```

**Gate** any interactable on a flag:
```json
"requires": [{ "type": "flag", "value": "bridge_repaired" }]
```

**Gate** a door on a flag by adding a dummy item requirement that
references a flag check — or, more directly, set `requiredKeys` to an
item that only exists after the flag is set (a "phantom key" dropped by
a produces effect).

### Flag-driven room mutations — `flagConditions`

`flagConditions` on a room definition apply tile / door / interactable
changes **at room load time** whenever the named flag is set. This makes
the world physically change based on what the player has done.

```json
"flagConditions": [
  {
    "flag": "bridge_repaired",
    "effects": [
      { "type": "removeTile",       "layer": "Collision", "x": 10, "y": 7 },
      { "type": "removeTile",       "layer": "Collision", "x": 10, "y": 8 },
      { "type": "unlockDoor",       "doorId": "city-east-passage" },
      { "type": "hideInteractable", "interactableId": "broken-bridge-sign" }
    ]
  }
]
```

| `type` | Effect | Fields |
|--------|--------|--------|
| `removeTile` | Removes a tile from the tilemap layer | `layer`, `x`, `y` (tile coords) |
| `setTile` | Paints a tile | `layer`, `x`, `y`, `tileIndex` |
| `unlockDoor` | Marks a door as unlocked | `doorId` |
| `hideInteractable` | Marks interactable as collected so it disappears | `interactableId` |

`x` / `y` are **tile coordinates** (not pixel coordinates). Divide pixel
positions by 16 to get tile coordinates.

`flagConditions` are re-evaluated every time the player enters the room,
so the world always reflects the current flag state.

---

## Room-specific tilesets

By default every room uses the shared core tileset (`tileset.png`, 128 tiles).
If a room needs its own unique tiles — custom furniture, bio-material, machinery —
declare a room-specific tileset.

### Add the tileset image

Drop a PNG at `public/assets/tilemaps/<name>.png`. Use the same 8-column,
64×64-pixel-per-tile format as the core tileset. Name it with dashes
(e.g. `clinic-tiles.png`, `lab-equipment.png`).

### Declare it in rooms.json

```json
{
  "id": "clinic",
  "tilesets": ["clinic-tiles"],
  ...
}
```

PreloadScene loads every tileset declared here at startup.

### Add it to the Tiled tilemap

In Tiled, open the room's tilemap. Add `clinic-tiles.png` as a second tileset.
Tiled assigns it `firstgid: 129` (immediately after the core's 128 tiles).
Paint with those tiles and export the Tiled JSON. The Tiled JSON will now list
two tilesets; RoomManager loads both automatically.

### Paint and reference

In the editor, the palette shows both tilesets — the core section first with a
label, then the room-specific section. The eyedropper, Q/E cycling, and
undo/redo all work across both.

For items and interactables whose sprite comes from the room tileset, add
`tilesetKey`:

```json
{
  "id": "cabinet",
  "type": "item",
  "tileFrame": 3,
  "tilesetKey": "clinic-tiles",
  "text": "Medical cabinet.",
  "item": {
    "name": "Antiseptic",
    "tileFrame": 3,
    "tilesetKey": "clinic-tiles",
    "category": "cure"
  }
}
```

`tileFrame` is always the **local 0-indexed frame** within that tileset.
Omitting `tilesetKey` (or setting it to `"tileset"`) uses the core tileset —
all existing content is unaffected.

---

---

## Quick reference — editor shortcuts

| Key | Action |
|-----|--------|
| **1 / 2 / 3** | Switch layer (Ground / Collision / Above) |
| **Q / E** | Cycle tile index |
| **P** | Toggle tile palette |
| **F** | Flood fill tool |
| **R** | Rectangle tool |
| **Esc** | Reset to paint tool / cancel armed action |
| **Ctrl+Z** | Undo |
| **Ctrl+Shift+Z** | Redo |
| **L-click** | Paint |
| **R-click** | Erase |
| **Mid-click / Alt+L-click** | Eyedropper |
| **Shift+Arrow** | Expand room edge |
| **Ctrl+Shift+Arrow** | Shrink room edge |
| **X** | Save tilemap |
| **O** | Pair two doors |
| **I** | Place interactable |
| **N** | Place NPC (Q/E to change variant) |
| **T** | Stamp baseline |
| **L** | Reload room from disk |
| **U** | Unlock all doors in room |
| **C** | Cure all afflicted in room |
| **R** | Cycle reverb |
| **[ / ]** | Adjust reverb mix |
| **- / +** | Adjust master volume |
| **WASD / Arrows** | Pan camera |
| **Mid-drag** | Pan camera |
| **Ctrl+Wheel** | Zoom |

---

## The full authoring loop

For a brand-new room:

1. `npm run new-room <id>` in the terminal.
2. Refresh. Press `?`. Click `<id>` in the left panel.
3. Paint Ground (1), Collision walls (2), Above details (3).
4. **X** — save tilemap.
5. **O** — wire a door from an existing room. Paste both snippets into `rooms.json`.
6. **I** — place each interactable. Paste snippets. Edit `tileFrame`,
   `type`, `text`, `requires`, `produces`.
7. **N** — place each NPC. Paste snippets. Edit `name`, `role`,
   `variant`, `holds`, `backstory`, `recoveredItems`.
8. Set `reverb`, `reverbMix`, `dark`, `weather` on the room object.
9. Add `flagConditions` if the room should change based on world flags.
10. **Audit** in the top bar — fix `[TODO]` / `[BROKEN]` doors.
11. `git diff`, `git commit`.

---

## What the editor does NOT do (yet)

You'll do these directly in `rooms.json`:

- Edit text, `requires`, `produces`, `tileFrame` on an existing
  interactable (use the **Properties** inspector in the right panel
  to read the current JSON, then edit manually).
- Re-link a door's `targetRoom` / `targetDoor`.
- Define afflicted backstory and item state machines (text-edit in JSON).
- Item state machine simulation (type definitions exist; full simulation
  engine not yet built — see `ROADMAP.md` Phase 3).

The editor stays focused on placement and layout. Rules and content are
text. That's the deal.
