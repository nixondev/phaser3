# WARDEN — Testing Guide

Two checklists: one for the **editor**, one for the **game**. Work
through them top-to-bottom when verifying a build or after a session
of authoring changes. Each item states what to do and what success
looks like.

---

# Part 1 — Editor

## Setup

1. `npm run dev` → open `http://localhost:8080`.
2. Title screen appears. Press **`?`** (Shift+/).

**✓ Pass:** Editor overlay appears. Left panel shows room list. Center
panel shows a Phaser canvas with a room loaded. Status bar shows
`layer · tile · tool · dims`. Top bar shows room name.

**✗ Fail signs:** White/blank canvas, console errors, room list empty,
Phaser canvas missing.

---

## Room navigation

3. Click any room name in the left panel (e.g. `city-street`).

**✓** Room loads. Canvas updates. Room name in top bar changes. Status
bar shows new dimensions. Active room highlights green in left panel.

4. Click the **Warp picker** button in the right panel. Up/Down to move
   highlight. Enter to teleport. Esc to cancel without moving.

**✓** Picker opens as a Phaser overlay. Navigation works. Enter warps.
Esc closes without room change.

---

## Camera

5. Press **W/A/S/D** — camera pans.
6. Hold **middle-click** and drag — camera pans.
7. Hold **Ctrl** and scroll wheel up/down — camera zooms in/out.
8. Plain scroll wheel — selected tile index changes in the status bar.

**✓** All four work independently. Right-click does NOT pan (it should
erase tiles). W/A/S/D panning stops when a Phaser overlay (like the
warp picker) is open.

---

## Tile painting

9. Press **1** — active layer is Ground. Inactive layers dim to ~20%.
10. Press **Q** several times → tile index decrements in status bar.
    Press **E** → increments.
11. Left-click a tile in the canvas → tile is painted.
12. Left-click and drag → continuous painting.
13. **Right-click** a painted tile → tile is erased.
14. Left-click the erased spot → **tile paints again** (this was
    previously broken — repaint on erased spots must work).

**✓** Step 14 is the key regression. The tile must appear. If nothing
happens on step 14, the erase→repaint bug has regressed.

15. Hold **Alt** and left-click a tile → eyedropper picks that tile.
    Status bar tile index matches what you clicked. (Also works with
    middle-click.)
16. Press **2** (Collision layer), **3** (Above layer) — layer changes,
    different layer dims.

---

## Paint tools

17. Press **F** → status bar shows `fill` tool. Left-click a contiguous
    region → all connected same-tile cells fill with selected tile.
18. Press **Esc** → resets to `paint` tool.
19. Press **R** → status bar shows `rect` tool. Left-click drag →
    rectangle of tiles painted on release.
20. Press **Esc** → back to `paint`.

---

## Undo / Redo

21. Paint a few tiles. Press **Ctrl+Z** → last paint action undone. The
    tiles revert.
22. Press **Ctrl+Z** multiple times → keeps undoing (up to 50 steps).
23. Press **Ctrl+Shift+Z** → redoes the last undone step.

**✓** History works per-session. History clears when you switch rooms
(switching back to the painted room shows the last-saved state, not
the unsaved history).

---

## Resize

24. Press **Shift+Right Arrow** → room expands by one tile on the right
    edge. Status bar dimensions increment. Camera briefly pans to show
    the new edge.
25. Press **Ctrl+Shift+Right Arrow** → room shrinks by one tile on the
    right edge. Dimensions decrement.
26. The map outline (yellow border) updates to match new size.

---

## Tile palette

27. Press **P** → palette overlay appears in the upper-right of the
    canvas, showing all tileset frames as thumbnails.
28. Click a thumbnail → selected tile updates. Palette highlight
    (yellow outline) moves to the clicked tile. Status bar tile index
    updates.
29. Click-drag across several tiles → multi-tile stamp selected (yellow
    outline spans selection).
30. Press **P** again → palette hides.
31. Left-click in the room → multi-tile stamp paints the selected block.

---

## Save tilemap

32. Make a tile change. Press **X** (or click **Save** in top bar).

**✓ Dev mode:** Toast says *"Saved to disk: ..."*. Reload the page.
The tile change persists in the room.

**✓ Fallback:** Toast says *"Tilemap copied. Paste into:
`public/assets/tilemaps/<id>.json`"*. Clipboard holds valid JSON.

---

## Door pairing

33. Navigate to a room. Press **O** → room picker appears (Phaser
    overlay, not DOM).
34. Up/Down to select a target room. Enter to confirm. Status bar reads
    `pair: click source door`.
35. Click a tile near an edge → toast fires, clipboard holds the source
    room's JSON. Editor auto-warps to the target room. Status bar reads
    `pair: click target door`.
36. Click a tile → toast fires, clipboard holds the target room's JSON.
37. Paste each snippet into `rooms.json`. Reload. Walk through the portal.

**✓** Both clipboard fragments are valid JSON. The door ids cross-
reference each other. Walking the door in gameplay transitions correctly.

38. Start O flow. Press **Esc** at the room picker → picker closes, no
    change.
39. Start O flow, confirm target, click source. Press **Esc** → pair
    cancelled, nothing copied.

---

## Interactable placement

40. Press **I** → status bar shows `armed: interactable`.
41. Click a tile → toast fires, clipboard holds a JSON snippet with
    `id`, `x`, `y`, `type`, `tileFrame`, `text`, `requires`.
42. Press **Esc** → armed mode cancelled, nothing placed.
43. Paste snippet into `rooms.json` under `interactables`. Reload.
    A sprite appears at the placed position. Walking near it shows the
    `[E]` prompt. Pressing E shows the default text.

---

## NPC placement

44. Press **N** → status bar shows `armed: afflicted`.
45. Press **Q** / **E** → toast shows variant name cycling through:
    walker, bloater, crawler, husk, spitter, brute, ashrot, veinhost.
46. Click a tile → snippet copies with the selected `variant` field.
47. Paste into `rooms.json` under `afflicted`. Reload. NPC appears.

---

## Property inspector

48. Reload the editor. Click any interactable placeholder sprite (the
    static sprites shown in editor mode).

**✓** Properties panel appears at the top of the right panel, showing
the object's label (e.g. `interactable · protag-charger`) and its full
JSON in a textarea.

49. Click the **Copy JSON** button.

**✓** Clipboard holds the JSON. Status bar shows *"Copied to clipboard."*

50. Click an NPC placeholder sprite.

**✓** Properties update to show the NPC's `AfflictedDef` JSON.

51. Switch to a different room (click left panel).

**✓** Properties panel hides (clears on room change).

---

## NPC drag

52. In editor mode, click and drag an afflicted placeholder sprite.
53. Release it at a new position.

**✓ Dev mode:** Position auto-saves to `rooms.json`. Toast confirms.
Reload — NPC appears at new position.

**✓ Fallback:** Snippet with new `x`/`y` copies to clipboard.

---

## Door drag

54. Enable visual debug overlay (right panel **V** button or press **V**).
    Cyan crosshair handles appear on door zones.
55. Click and drag a cyan crosshair. It snaps to tile grid while
    dragging.
56. Release → toast fires, clipboard holds the full updated room JSON.
    Replace the room entry in `rooms.json`. Reload. Door zone is at
    new position.

---

## Stamp

57. Navigate to any room. Press **T** → toast says room was stamped.
58. Canvas updates: Ground filled with floor tiles, Collision has
    perimeter walls, Above is empty.

**✓** Tilemap is overwritten in memory. Pressing X saves it. Before
saving, Ctrl+Z can undo the stamp.

---

## Audit

59. Click **Audit** in the top bar.

**✓** Toast appears with door counts. Browser console has the full
report. Clipboard holds the full text. Any `[BROKEN]` or `[TODO]` doors
are identified by room id and door id.

---

## Audio live mixing

60. Press **R** → toast shows the new reverb profile name.
61. Press **`[`** → reverb mix decreases. **`]`** → increases.
62. Press **`-`** → master volume decreases. **`+`** → increases.

These are temporary; they do not persist on reload. To keep a setting,
write `reverb` / `reverbMix` back to `rooms.json`.

---

## Debug shortcuts

63. Press **L** (or click **Reload**) → current room reloads from disk.
    Any unsaved tile changes are lost.
64. Press **U** → all doors in room unlock (no visual change, but
    walking through locked doors in the editor doesn't apply — this is
    for gameplay context).
65. Press **C** → any afflicted in the room immediately cure.

---

## Exit and game regression

66. Click **Exit** in the top bar (or press **Esc**).

**✓** Editor scene stops. Title screen appears. DOM overlay is gone.
`#game-container` returns to its normal position. No duplicate panels
visible.

67. Press **Space** or **Enter** to start a game.

**✓** Gameplay loads. Player moves. Flashlight item is visible in
`protag-house`. Doors work. Afflicted wander. No console errors.

68. Press **Esc** in gameplay → Pause menu appears. Press **Esc** again
    → resumes. Press **?** in gameplay → nothing happens (editor key is
    title-screen only).

69. Return to title (pause → New Game or browser refresh). Press **`?`**
    → editor opens again.

**✓** No zombie keyboard handlers. No duplicate room lists. Fresh
session.

---

---

# Part 2 — Game

## Setup

Start with `npm run dev` and press **Space/Enter** from the title.
All game testing happens in the running gameplay scene, NOT the editor.

---

## Movement and basics

1. WASD / Arrow keys → player moves in all four directions.
2. Walk into a wall → player stops.
3. Press **Tab** → inventory grid appears. Press **Tab** again → closes.
4. Press **Esc** → pause menu appears with volume controls. Press
   **Esc** → resumes.

---

## Flashlight (inventory-gated)

5. In `protag-house`, walk to the flashlight item sprite (bobbing on
   the dock area). The `[E]` prompt appears. Press **E** → item picked
   up, added to inventory.
6. Press **F** → flashlight toggles on. The cone cuts through the
   darkness overlay (if `dark: true` is set on the room).
7. Press **F** again → flashlight off.
8. Open inventory (Tab). Select the flashlight slot. Press **Q** to
   drop it.
9. Press **F** → flashlight does NOT toggle. It stays off.
10. Walk to the dropped flashlight. Pick it up. Press **F** → works again.

**✓** Flashlight is strictly item-gated. Dropping it turns it off.

---

## Door transitions

11. Walk to a door. Screen fades out, fades in, player appears in the
    new room. Room name updates in the HUD.
12. Walk through the same door back. Bidirectional transitions work.
13. Walk to a locked door (requires a key). Dialog appears: *"This door
    is locked. You need a key to open it."* Door does not open.
14. Pick up the correct key. Walk to the same door. Door opens, key is
    consumed from inventory (unless it's `skeleton-key`).

---

## Interactable interaction

15. Walk near a sign-type interactable. `[E]` prompt appears. Press **E**
    → dialog shows the sign's text. Press **E** again → dialog closes.
16. Walk away before pressing E → prompt disappears.
17. Press **E** with nothing nearby → *"Nothing reacts."* dialog. This
    confirms the world-feedback system is working.

---

## Requires / Produces chain

To test a custom `requires`+`produces` interactable you authored:

18. Set up the interactable in `rooms.json` with a `requires` condition.
    Reload.
19. Walk up to it WITHOUT the required item. Press **E** →
    *"Something here, but not like this."* Dialog appears. The
    interactable is NOT consumed.
20. Acquire the required item (pick it up from somewhere). Walk back.
    Press **E** → success. `text` dialog appears. Any `produces` effects
    fire:
    - `setFlag`: confirm with step 22 below.
    - `unlockDoor`: walk to the specified door — it now opens.
    - `dropItem`: a new item sprite appears at the specified position.
21. If `consumed: true` on the interactable: the sprite disappears after
    step 20. Reload the room — it does not reappear.
22. If `consumed` is false: press **E** again — the interaction fires
    again (or fails again if the item was consumed by `consume: true`
    in requires).

---

## World flags

23. Trigger a `setFlag` produce (step 20 above).
24. Walk to another interactable that has `requires: [{type:'flag', value:'...'}]`
    using the same flag name.

**✓** The flag-gated interactable now responds. Without the flag, it
showed *"Something here, but not like this."* With the flag, it
succeeds.

25. Trigger a `clearFlag` produce somewhere. Attempt the flag-gated
    interactable again → it fails again.

---

## Flag-driven room mutations

26. Trigger a `setFlag` produce that is named in a room's `flagConditions`.
27. Walk to that room (or reload it if already there).

**✓** The `flagConditions` effects apply:
- `removeTile`: the specified tile is gone. Player can walk through if
  it was a Collision tile.
- `unlockDoor`: the specified door opens without a key.
- `hideInteractable`: the specified interactable sprite is gone.

28. Leave the room and return. Effects still apply (re-evaluated on each
    entry).

---

## Entity holds (items dropped on cure)

29. Find an afflicted NPC whose def includes a `holds` array.
30. Cure them (carry a cure item, walk into them — or use E from
    inventory near them).
31. At the moment of cure, item sprites appear at the NPC's last
    position.

**✓** Items land in the world as droppable items. Walk up and press **E**
to pick them up.

---

## Document reader

32. Pick up an item with `category: 'document'`. Open inventory (Tab).
    Navigate cursor to the document slot. Press **E**.

**✓** A full-screen document reader overlay appears with the item's title
and content. Press **E** to advance pages. On the last page, **E** or
**Esc** closes it. Gameplay resumes normally.

33. Multi-page document: content split with `\n---\n` between pages.
    A page counter appears top-right (`1 / 3` etc.).

---

## Afflicted behavior

34. Walk near a wandering afflicted. They begin to flee (agitated state,
    red tint). Walk away to ~80px → they calm back down (blue tint).
35. Toggle the flashlight. Sweep the cone over a wandering/agitated
    afflicted → they switch to frightened state.
36. Walk into a wandering afflicted without a cure item → screen shakes,
    fade-out, player respawns in `protag-house` with inventory intact.
37. Carry a cure item. Walk into an afflicted → auto-cure fires. Dialog
    shows cure text. If `curedClue` is set, it appears at the bottom of
    the dialog.

---

## Character roster

38. Cure an afflicted whose def has `backstory` + `recoveredItems`.
    Follow the recovery conversation (press **E** once per backstory
    page). On the final page: character transitions to `recovered`,
    avatar bar gains a new portrait.
39. Press **2** (or click the new portrait) → switches to the recovered
    character. Inventory swaps. Position teleports if cross-room.
40. Drop an item as character 2. Press **1** → switch to protagonist.
    Walk to the dropped item. Pick it up.

**✓** Drop-and-pickup is the only hand-off. Items are not shared between
character inventories.

41. Leave character 2 in a room. Switch to character 1. Navigate to
    character 2's room → their parked body sprite appears at their last
    position.

---

## Save / Load

42. Play until a door transition fires.

**✓** `localStorage` now has `warden-save-v1`. Verify with browser
devtools → Application → Local Storage.

43. Hard-refresh the page (`Ctrl+Shift+R`). Title screen appears.

**✓** *"Press C to Continue"* button is visible (green text). SPACE/ENTER
still says "New Game".

44. Press **C** → game loads directly into the room where the door
    transition landed. Inventory is correct. Roster is correct. Visited
    rooms are correct.

45. Pick up an item. Refresh. Press **C** → item is NOT in inventory
    (it was picked up after the last door save) ... actually this
    depends on when auto-save fires. Confirm: picking up an item
    triggers a save. So the item SHOULD be in inventory after C.

46. Start a game. Open pause menu. Press **N** → *"New Game"* clears
    save. Returns to title. Title no longer shows "Continue".

47. Start a new game (Space/Enter). Play to a door transition. Press
    **C** from the title after a refresh → resumes correctly.

---

## Regression after authoring

After any session of authoring changes (room edits, interactable
changes, afflicted placement), run these in gameplay to confirm nothing
broke:

- [ ] Player moves in all four directions
- [ ] At least one door transition works bidirectionally
- [ ] `[E]` prompt appears near an interactable
- [ ] Afflicted wander and react to proximity
- [ ] Flashlight toggles (with item in inventory)
- [ ] Inventory opens and closes (Tab)
- [ ] Pause menu opens and closes (Esc)
- [ ] Title screen → Space → game → Esc → New Game → title (no crash)

---

## Testing a requires/produces chain without replaying prerequisites

Until the flag toggle panel ships (Phase 6), use this workflow to test
mid-chain state:

1. Open browser devtools console.
2. Find the `RoomStateManager` singleton:
   ```js
   // Phaser game is exposed as window.game in dev builds.
   // Or paste directly into console after scene starts:
   ```
3. Force-set a world flag:
   ```js
   // Access via the Phaser scene registry or just call in console:
   // This requires the rsm instance to be accessible — add a temporary
   // window.rsm = this.rsm in GameScene.create() during testing.
   window.rsm.setFlag('power_restored');
   ```
4. Reload the current room (L in gameplay debug if editor is available,
   or navigate away and back).

**Better alternative:** Author a temporary debug interactable near the
start of the chain:
```json
{
  "id": "debug-flag-setter",
  "x": 50, "y": 50,
  "type": "sign",
  "tileFrame": 0,
  "text": "DEBUG: flags set.",
  "produces": [
    { "type": "setFlag", "value": "power_restored" },
    { "type": "setFlag", "value": "bridge_repaired" }
  ]
}
```
Press E on it to instantly set all flags needed for the chain, then
test the downstream interactions. Delete the interactable when done.

This is the **recommended pattern** until the Phase 6 flag toggle panel
ships.

---

---

## Room-specific tileset (smoke test)

To verify multi-tileset rendering when you add one:

1. Drop `public/assets/tilemaps/<name>.png` (8-col, 64px tiles).
2. Add `"tilesets": ["<name>"]` to a room in `rooms.json`.
3. In Tiled, add the PNG as a second tileset. Paint a tile from it in the
   room. Export the Tiled JSON. Reload.

**✓ Game**: Room loads without console errors. Tiles from the room-specific
tileset render correctly (not black/missing).

4. Enter the editor (`?`). Open the palette (**P**) for that room.

**✓ Editor**: Two labelled sections appear in the palette — core tileset and
the room-specific tileset. Clicking a tile from the room section selects it.
The tile preview (corner thumbnail) shows the correct tile.

5. Paint with a room-specific tile. Press **X** to save. Reload.

**✓** The painted tiles persist and render correctly in both gameplay and editor.

6. Add an interactable with `"tilesetKey": "<name>", "tileFrame": 0`. Reload.

**✓ Game**: World sprite appears using frame 0 from the room tileset.

**✓ Editor**: Property inspector shows the interactable JSON including `tilesetKey`.

7. Pick up an item that uses `tilesetKey`. Open inventory.

**✓** Inventory icon shows the correct frame from the room spritesheet.

8. Remove `"tilesets": ["<name>"]` from the room and reload.

**✓** Room loads normally (core tileset only). Room-specific tiles show as
empty/missing (expected — Phaser warns in console). No crash.

---

---

## Inter-character conversation

To test, you need two recovered residents in rooms.json where one has
`conversationRequires` pointing at the other.

### Partner absent

1. Cure and fully recover resident A (Kai). Leave resident B (Maren) uncured
   or in a different room.
2. Walk to Kai. Press **E**.

**✓** Default solo response fires: `"I'm ready when you are."` No indication
that a richer version exists.

### Partner present — first encounter

3. Cure and recover Maren. Both are now in the roster.
4. Switch to Maren (`2`). Walk Maren into the same room as Kai. Switch back to
   the protagonist (`1`) or leave Maren parked there.
5. Walk the active character to Kai. Press **E**.

**✓** First page of `conversationDialog` appears — NOT the solo response.

6. Press **E** again — second page advances (if multiple pages defined).
7. Press **E** on the final page.

**✓** Dialog closes. `conversationProduces` effects fire (e.g. a world flag is
set). If the produce was `setFlag`, verify via a downstream interactable that
`requires: [{type:'flag', value:'...'}]` — it should now succeed.

### Partner present — repeat read

8. Press **E** on Kai again with Maren still present.

**✓** Full `conversationDialog` plays again from page 1.

**✓** `conversationProduces` do NOT fire a second time (flag already set,
no duplicate item drops). Idempotent.

### Partner present via active character

9. Switch to Maren (she is now the active character). Walk to Kai. Press **E**.

**✓** Conversation triggers — the active character counts as present.

### Parked body counts

10. Switch to the protagonist. Maren remains parked in the room. Walk to Kai.
    Press **E**.

**✓** Conversation triggers — parked body in the same room counts as present.

11. Walk Maren to a different room (switch to her, move her out, switch back).
    Walk protagonist back to Kai. Press **E**.

**✓** Solo response — partner no longer in this room.

### Page counter behaviour

12. Start a multi-page conversation. Read page 1 (not the last page). Walk
    away and return without finishing. Press **E** on Kai.

**✓** Resumes on page 2 — mid-read position is preserved within the session.

13. Complete the full conversation (reach the final page). Press **E** again.

**✓** Conversation restarts from page 1 — the counter resets on final-page
completion so re-reads always start fresh.

---

## Quick regression checklist (copy-paste before committing)

```
EDITOR
[ ] ? from title opens editor, Esc returns to title cleanly
[ ] Click room in left panel → warps
[ ] Paint a tile, right-click to erase, left-click same spot → repaints
[ ] Ctrl+Z undoes the repaint
[ ] P opens palette, click selects, P closes
[ ] X saves, reload confirms tile persists (dev mode)
[ ] O pairs doors, both snippets paste and portal works in gameplay
[ ] I places interactable, snippet pastes and E prompt appears in game
[ ] N places NPC with variant, snippet pastes and NPC wanders
[ ] Click interactable sprite → Properties panel shows JSON
[ ] Exit → title → Space → game → no crash, no console errors

GAME
[ ] Core tileset tiles render (no pink/black missing tile squares)
[ ] Player moves, doors transition, afflicted react
[ ] Flashlight off without item, on with item, off when dropped
[ ] Requires fail = "Something here, but not like this."
[ ] Requires succeed = text dialog, produces fire, consumed disappears
[ ] Flag set by produces, read by a downstream requires → gates correctly
[ ] flagConditions apply on room enter (tile removed / door unlocked)
[ ] Entity holds drop at cure position
[ ] Document reader opens from inventory, pages with E, closes with Esc
[ ] Door save → refresh → C continues in correct room with correct state
[ ] N in pause → title shows no Continue
```
