# AFFLICTED — System Reference

Everything about the afflicted entity system, curing mechanics, and the recovery pipeline.

---

## Current Afflicted Inventory

Cast identity lives in `src/data/characters.json`; room spawns are placements
in `src/data/rooms.json` (see CHARACTERS.md).

### Kai — Former Lab Technician (`kai`)

| Field | Value |
|-------|-------|
| ID (registry slug) | `kai` |
| behaviorLoop | `wander` (city-street placement) |
| afflictedSheet | `afflicted-walker` |
| sheet (human) | `player-ranger` |
| home | `house-b` (x:576, y:320) |
| Placed in | `city-street` (x:1600, y:2000) |

**curedClue:** `"...they look up and mumble something about the north block... the smell of chemicals... a lab coat..."`

**backstory (3 pages):**
1. *"I remember now. The city sealed overnight. We were mid-experiment."*
2. *"Whatever you used... it worked. I've been looping for weeks. Trapped in that corner. / I know this city's systems. I want out too."*
3. *"Tell me what you need. I'll help." / [Kai hands you a Lab Keycard and a Compound Sample.] / [Kai joins your cause. They are waiting for you at Apartment 4B.]*

**recoveredItems:**
- Lab Keycard (`tileFrame: 8`, `category: key`, `keyId: lab-door`)
- Compound Sample (`tileFrame: 9`, `category: cure`)

---

### Maren — Local Shopkeeper (`maren`)

| Field | Value |
|-------|-------|
| ID (registry slug) | `maren` |
| behaviorLoop | `wander` (city-street placement) |
| afflictedSheet | `afflicted-walker` |
| sheet (human) | `player-rogue` |
| home | `house-c` (x:640, y:640) |
| Placed in | `city-street` (x:4000, y:2800) |

**curedClue:** `"...they whisper about the community room... counting shelves... the logbook..."`

**backstory (3 pages):**
1. *"The community room. That's where I kept the last of the supplies. I know what's left."*
2. *"I've been walking the same block for... I don't know how long. Thank you. / Take what you need from what I have."*
3. *"I'll help you map what's still usable in here. There's more to this city than anyone told us." / [Maren joins your cause. They are waiting for you at the Community Room.]*

**recoveredItems:**
- Store Key (`tileFrame: 8`, `category: key`, `keyId: store-front`)
- Supply Manifest (`tileFrame: 7`, `category: document`, readable content)

---

### Title Screen Afflicted (extras)

| ID | afflictedSheet | Room | Notes |
|----|----------------|------|-------|
| `ts-wanderer-a` | `afflicted-walker` | `title-screen` (x:320, y:450) | Decorative extra; no registry entry |
| `ts-wanderer-b` | `afflicted-husk` | `title-screen` (x:900, y:560) | Decorative extra; only husk sheet in use |

---

## State Machine

```
              proximity ≤240px
  wandering ──────────────────► agitated
     ▲     ◄────────────────── (dist ≥480px)
     │       
     │ flashlight cone          (sentinel immune)
     ├──────────────────────► frightened
     │ ◄──────────────────── (dist ≥600px)
     │
     │  cure item used
     ├──────────────────────► cured
     │
     │  (external: setStatus)
     └──────────────────────► recovered
```

### States

| State | Trigger | Visual | Behavior |
|-------|---------|--------|----------|
| `wandering` | Initial / calm-down | Blue tint, gentle pulse | Moves per behaviorLoop |
| `agitated` | Player within 240px (non-drift) | Red tint, fast pulse | Chases player at 300px/s |
| `frightened` | Flashlight cone hit (non-sentinel) | Yellow tint, rapid flicker | Flees at 400px/s |
| `cured` | Cure item consumed | Green tint, static | Stationary; interactable (E) |
| `recovered` | Final backstory page shown in associatedRoom | No tint, static | Parked body; interactable; joins roster |

### Movement Constants

| Constant | Value | Notes |
|----------|-------|-------|
| `WANDER_SPEED` | 80 px/s | Base; multiplied by `speedMult` |
| `WANDER_PAUSE_MIN` | 1500ms | Pause between wander targets |
| `WANDER_PAUSE_MAX` | 4000ms | |
| `WANDER_RANGE` | 128px | Default radius; overridden by `wanderRadius` |
| `AGITATE_RANGE` | 240px | Player proximity that triggers agitation |
| `AGITATE_SPEED` | 300px/s | Chase speed; multiplied by `speedMult` |
| `CALM_RANGE` | 480px | Distance at which agitated returns to wandering |
| `FRIGHTEN_SPEED` | 400px/s | Flee speed; multiplied by `speedMult` |
| `FRIGHTEN_CALM` | 600px | Distance at which frightened returns to wandering |
| `SOUND_RADIUS` | 800px | Max distance for proximity audio |

---

## Behavior Loop Types

Set per-afflicted via the `behaviorLoop` field in `rooms.json`.

### `wander` (default)
Random drift within `wanderRadius` of origin. Pauses 1.5–4s between targets. Agitates (chases) on player proximity. Frightened by flashlight.

### `sentinel`
Stands completely still while wandering. Agitates (chases) on player proximity — same chase behavior as wander. **Immune to flashlight-frightened.** Good for stationary guards, locked-room enforcers, or puzzle-gating positions.

### `drift`
Roams continuously over a wide area (`wanderRadius × 3`). No pause between targets. **Never agitates** — player proximity does nothing. Frightened by flashlight normally. Good for ambient background movement, rooms that should feel alive but non-threatening.

### `pace`
Walks back and forth between two fixed points: origin and a calculated endpoint defined by `paceAngle` (direction in degrees) and `paceLength` (distance in pixels). Turns around immediately on arrival. Agitates on proximity, frightened by flashlight. The most *purposeful*-looking pattern — reads as a guard round or work route. Creates a predictable timing window to cross a blocked path.

### `circle`
Orbits continuously around origin at `wanderRadius` distance. Uses `circleSpeed` (deg/s, default 45) and `circleStartAngle` (starting position on the orbit). Self-corrects back onto the orbit after collisions. Agitates on proximity, frightened by flashlight. The most visually alien pattern — an obvious loop. Creates a rhythmic timing puzzle.

---

## Field Reference

Types in `src/types/index.ts`. Identity and placement are separate since the
character registry (see CHARACTERS.md).

### `CharacterDef` — `src/data/characters.json`, keyed by slug

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `name` | ✓ | string | Display name in dialog |
| `role` | — | string | Role description shown at recovery |
| `sheet` | ✓ | string | Human spritesheet basename = texture key (`player-ranger`) |
| `afflictedSheet` | — | string | Afflicted spritesheet basename; omit for never-afflicted (protagonist) |
| `home` | — | `{room,x,y}` | Where they appear post-cure (see Spawn Rules). Omit → recover in place. |
| `curedClue` | — | string | Dialog shown immediately after curing |
| `backstory` | — | string[] | Multi-page dialog shown in home room leading to recovery |
| `recoveredItems` | — | ItemDef[] | Items given to character inventory on recovery |
| `traits` | — | string[] | Trait tags copied to CharacterState on recovery |
| `conversationRequires` | — | string | Partner character slug for inter-character dialog |
| `conversationDialog` | — | string[] | Dialog shown when partner is present |
| `conversationProduces` | — | ProduceEffect[] | Effects applied on final conversation page |

### `AfflictedPlacement` — `rooms.json` `afflicted` arrays

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `id` | ✓ | string | Unique per room; cast placements use the character slug |
| `character` | — | string | Registry slug — present for cast members, absent for extras |
| `name` | — | string | Extras only: display name (default `Unknown`) |
| `afflictedSheet` | — | string | Extras only: spritesheet basename (default `afflicted-walker`) |
| `x` / `y` | ✓ | number | Spawn position in pixels |
| `behaviorLoop` | ✓ | `'wander'` \| `'sentinel'` \| `'drift'` \| `'pace'` \| `'circle'` | Movement mode |
| `wanderRadius` | — | number | Wander radius (default 128px). Drift uses 3×. Circle uses as orbit radius. |
| `speedMult` | — | number | Speed multiplier on all states (default 1.0) |
| `soundRoom` | — | string | Room ID for proximity SF2 selection (default `'city-street'`) |
| `paceAngle` | — | number | `pace` only: direction of patrol in degrees (0=right, 90=down). Default 0. |
| `paceLength` | — | number | `pace` only: distance from origin to far endpoint in pixels. Default 128. |
| `circleSpeed` | — | number | `circle` only: orbital speed in degrees/second. Default 45. |
| `circleStartAngle` | — | number | `circle` only: starting position on orbit in degrees. Default 0. |
| `holds` | — | ItemDef[] | Items dropped in world at afflicted's position when cured |

---

## Cure Mechanic (Step by Step)

Curing is **collision-only**. The player must physically walk into a wandering or agitated afflicted while holding a cure item in inventory.

1. `handleAfflictedCollision` fires
2. Checks `item.category === 'cure'` and `(!item.useTarget || item.useTarget === afflicted.getId())`
3. Starts 500ms `cureCooldown` to prevent repeated triggers
4. Removes cure item from inventory
5. `rsm.cureResident(id)` — adds to `curedResidents` set
6. `afflicted.setStatus('cured')` — green tint, stops movement, stops proximity sound, switches cast members to their human `sheet`
7. `unlockDoorsToRoom(home.room)` if the character has a home
8. `dropHeldItems(afflicted)` — spawns `holds` items at afflicted's position
9. Camera shake (200ms)
10. Opens dialog with `curedClue` or generic message

Selecting a cure item from the inventory (TAB) shows: *"Walk into them to administer the cure."*

### Targeted Cures
If a cure item has `useTarget: "some-id"`, it only works on the afflicted with that ID. A targeted cure applied to the wrong target has no effect — the collision simply respawns the player.

---

## Recovery Mechanic (Step by Step)

Recovery turns a cured resident into a playable roster character.

**Prerequisite:** Afflicted must be `'cured'`, must be a cast member (extras
can never recover — E on a cured extra shows a calming-down line), and the
player must be in their `home` room.

If the player is in a different room from `home.room`, pressing E on the cured afflicted shows: *"[name] stares past you. They seem distant. Maybe they need somewhere familiar."*

Once in the right room, E progresses through `backstory` pages one at a time. On the **final page** (or immediately if no backstory):

1. `rsm.recoverResident(id)` — adds to `recoveredResidents` set
2. `afflicted.setStatus('recovered')`
3. `rsm.addToRoster(charState)` — character added with `textureKey` = registry `sheet`
4. `recoveredItems` copied into the character's inventory slots
5. Afflicted NPC entity destroyed (`afflicted.destroy()`)
6. `refreshParkedBodies()` — a standing sprite appears in their position
7. Events emitted: `roster-changed`, `inventory-changed`

---

## Spawning Rules

Called on every room transition in `spawnAfflicted()`. Two passes:

**Pass 1 — placements in this room:**
1. **Recovered → skip.** Recovered residents are parked bodies, never NPCs.
2. **Active character → skip.** If the placement is the currently-controlled character, don't also spawn them as an NPC.
3. **Cured cast member with a `home` → skip.** They've gone home; their placement empties out.
4. Otherwise spawn: `cured` if cured (extras / homeless cast), else `wandering`.

**Pass 2 — home spawns:** every cast member whose `home.room` is the current
room and who is cured-but-not-recovered spawns at `home` as a stationary
(`sentinel`) cured NPC, waiting for the backstory conversation. Home rooms
carry **no** afflicted placements in rooms.json — this pass generates the
spawn entirely from the registry.

**Spawn texture initialization:** When an afflicted spawns with `initialStatus = 'cured'` or `'recovered'`, the constructor applies the human `sheet` texture immediately — it does not go through `setStatus()`, so this must be done explicitly in the constructor. Omitting this caused a one-frame flicker where the afflicted sprite appeared before the player sprite.

---

## Visual Sheets

| Sheet | Notes |
|-------|-------|
| `afflicted-walker` | Standard 4-direction walking sprite |
| `afflicted-husk` | Alternate appearance; currently same behavior as walker |

Sheet fields hold the PNG basename, which is also the Phaser texture key.
Cured/recovered cast members switch to their human `sheet` (e.g., `player-ranger`, `player-rogue`).

---

## Proximity Sound

Each afflicted registers a proximity audio player on spawn:
```typescript
MusicManager.getInstance().playProximity(id, 'goblins', soundRoom);
```

Volume updated each frame via linear falloff: `vol = max(0, 1 - dist / 800)`.

Stopped when:
- Status transitions to `'cured'` or `'recovered'`
- Entity is destroyed

`soundRoom` defaults to `'city-street'`; can be overridden per-afflicted via the `soundRoom` field.

---

## Design Notes

### Home pattern
A cast member's post-cure location is the `home` field on their registry
entry — the home room needs no afflicted placement at all. The engine gates
visibility automatically: city placement while uncured, home spawn once
cured, parked body once recovered. (This replaced the old duplicate-entry /
`associatedRoom` mechanism.)

### `behaviorLoop` for puzzle design
- Use `sentinel` for locked-room enforcers where the player needs to maneuver around a stationary threat.
- Use `drift` for rooms that should feel inhabited without being threatening (search patterns, corridor traversal).
- Use `speedMult` to create variation without new behavior logic: a `speedMult: 1.4` wanderer is noticeably more dangerous than a default one.

### Cure items
Any item with `category: 'cure'` works as a universal cure unless it has `useTarget` set. Design implication: the player can accidentally use the wrong cure item (or the right one on the wrong target). Targeted cures give dialog feedback; universal cures do not.

### Recovery unlocks items
A recovered character's `recoveredItems` go directly into that character's personal inventory, not the protagonist's. This means:
- Items aren't immediately accessible to the protagonist
- Character switching is required to access them
- This is the primary inventory pressure mechanism for early puzzles

---

## Proposed City-Street Roster (8 afflicted)

Kai and Maren are the two curable residents. The remaining six are purely atmospheric / obstacle — no cureCondition, no backstory, no recoveredItems.

| Slot | Working name | Role fragment | behaviorLoop | Key tuning | Placement |
|------|-------------|--------------|-------------|-----------|-----------|
| 1 | Kai | Former lab technician | `wander` | defaults | North block |
| 2 | Maren | Shopkeeper | `wander` | defaults | Market row |
| 3 | The Watcher | Building super / security | `sentinel` | — | Apartment entrance |
| 4 | The Drifter | Delivery worker | `drift` | `wanderRadius: 192` | Open plaza — covers the whole street |
| 5 | The Pacer | Late-shift office worker | `pace` | `paceAngle: 0, paceLength: 256` | Along a sidewalk corridor |
| 6 | The Shell | Someone already sitting when it happened | `wander` | `wanderRadius: 24, speedMult: 0.25` | Near a bench or corner |
| 7 | The Frantic | Whoever was running | `wander` | `wanderRadius: 64, speedMult: 1.8` | Open space — erratic, high danger |
| 8 | The Circler | Maintenance / rounds | `circle` | `wanderRadius: 96, circleSpeed: 40` | Around the generator or a landmark |

**Puzzle utility summary:**
- Sentinel + Pacer together can block a corridor so the player must time two independent patterns.
- Drifter forces carrying a cure or committing to a dangerous crossing — unpredictable and wide.
- Shell reads as harmless until the player gets careless. Low warn, still lethal.
- Frantic marks a zone of past distress and is threatening in enclosed spaces.
- Circler creates the clearest timing puzzle — visible, rhythmic, learnable.

### Future afflicted types to consider
- Afflicted with `cureCondition` restrictions (e.g., only curable at a specific location)
- Afflicted that `holds` critical items, making the player decide whether to cure them to get the item
- Multi-stage afflicted (require two cure items, or require another recovered character to assist)
- Afflicted in locked rooms where getting in is itself a puzzle
