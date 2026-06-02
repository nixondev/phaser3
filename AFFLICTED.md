# AFFLICTED — System Reference

Everything about the afflicted entity system, curing mechanics, and the recovery pipeline.

---

## Current Afflicted Inventory

All afflicted defined in `src/data/rooms.json`.

### Kai — Former Lab Technician (`street-wanderer-1`)

| Field | Value |
|-------|-------|
| ID | `street-wanderer-1` |
| behaviorLoop | `wander` |
| variant | `walker` |
| playerVariant | `ranger` |
| associatedRoom | `house-b` |
| Appears in | `city-street` (x:1600, y:2000), `house-b` (x:576, y:320) |

**curedClue:** `"...they look up and mumble something about the north block... the smell of chemicals... a lab coat..."`

**backstory (3 pages):**
1. *"I remember now. The city sealed overnight. We were mid-experiment."*
2. *"Whatever you used... it worked. I've been looping for weeks. Trapped in that corner. / I know this city's systems. I want out too."*
3. *"Tell me what you need. I'll help." / [Kai hands you a Lab Keycard and a Compound Sample.] / [Kai joins your cause. They are waiting for you at Apartment 4B.]*

**recoveredItems:**
- Lab Keycard (`tileFrame: 8`, `category: key`, `keyId: lab-door`)
- Compound Sample (`tileFrame: 9`, `category: cure`)

---

### Maren — Local Shopkeeper (`street-wanderer-2`)

| Field | Value |
|-------|-------|
| ID | `street-wanderer-2` |
| behaviorLoop | `wander` |
| variant | `walker` |
| playerVariant | `rogue` |
| associatedRoom | `house-c` |
| Appears in | `city-street` (x:4000, y:2800), `house-c` (x:640, y:640) |

**curedClue:** `"...they whisper about the community room... counting shelves... the logbook..."`

**backstory (3 pages):**
1. *"The community room. That's where I kept the last of the supplies. I know what's left."*
2. *"I've been walking the same block for... I don't know how long. Thank you. / Take what you need from what I have."*
3. *"I'll help you map what's still usable in here. There's more to this city than anyone told us." / [Maren joins your cause. They are waiting for you at the Community Room.]*

**recoveredItems:**
- Store Key (`tileFrame: 8`, `category: key`, `keyId: store-front`)
- Supply Manifest (`tileFrame: 7`, `category: document`, readable content)

---

### Title Screen Afflicted

| ID | Variant | Room | Notes |
|----|---------|------|-------|
| `ts-wanderer-a` | `walker` | `title-screen` (x:320, y:450) | Decorative; no name, role, or cure data |
| `ts-wanderer-b` | `husk` | `title-screen` (x:900, y:560) | Decorative; only `husk` variant in use |

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

## AfflictedDef Field Reference

All fields defined in `src/types/index.ts`.

| Field | Required | Type | Purpose |
|-------|----------|------|---------|
| `id` | ✓ | string | Unique identifier; used in RoomStateManager sets |
| `name` | ✓ | string | Display name in dialog |
| `role` | ✓ | string | Role description shown at recovery |
| `x` | ✓ | number | Spawn X in pixels |
| `y` | ✓ | number | Spawn Y in pixels |
| `behaviorLoop` | ✓ | `'wander'` \| `'sentinel'` \| `'drift'` | Movement mode |
| `variant` | — | string | Sprite sheet: `walker`, `husk` |
| `playerVariant` | — | string | Sprite key suffix for cured/recovered state: `ranger`, `rogue` |
| `wanderRadius` | — | number | Wander radius (default 128px). Drift uses 3×. Circle uses as orbit radius. |
| `speedMult` | — | number | Speed multiplier on all states (default 1.0) |
| `soundRoom` | — | string | Room ID for proximity SF2 selection (default `'city-street'`) |
| `paceAngle` | — | number | `pace` only: direction of patrol in degrees (0=right, 90=down). Default 0. |
| `paceLength` | — | number | `pace` only: distance from origin to far endpoint in pixels. Default 128. |
| `circleSpeed` | — | number | `circle` only: orbital speed in degrees/second. Default 45. |
| `circleStartAngle` | — | number | `circle` only: starting position on orbit in degrees. Default 0. |
| `associatedRoom` | — | string | Room they move to post-cure (see Spawn Rules) |
| `curedClue` | — | string | Dialog shown immediately after curing |
| `backstory` | — | string[] | Multi-page dialog shown in associatedRoom leading to recovery |
| `recoveredItems` | — | ItemDef[] | Items given to character inventory on recovery |
| `holds` | — | ItemDef[] | Items dropped in world at afflicted's position when cured |
| `cureCondition` | — | string | Reserved; not yet implemented |
| `recoveryUnlock` | — | string | Reserved; not yet implemented |
| `conversationRequires` | — | string | Partner resident ID for inter-character dialog |
| `conversationDialog` | — | string[] | Dialog shown when `conversationRequires` partner is present |
| `conversationProduces` | — | ProduceEffect[] | Effects applied on final conversation page |

---

## Cure Mechanic (Step by Step)

Curing is **collision-only**. The player must physically walk into a wandering or agitated afflicted while holding a cure item in inventory.

1. `handleAfflictedCollision` fires
2. Checks `item.category === 'cure'` and `(!item.useTarget || item.useTarget === afflicted.getId())`
3. Starts 500ms `cureCooldown` to prevent repeated triggers
4. Removes cure item from inventory
5. `rsm.cureResident(id)` — adds to `curedResidents` set
6. `afflicted.setStatus('cured')` — green tint, stops movement, stops proximity sound, switches to `playerVariant` sprite
7. `unlockDoorsToRoom(associatedRoom)` if set
8. `dropHeldItems(afflicted)` — spawns `holds` items at afflicted's position
9. Camera shake (200ms)
10. Opens dialog with `curedClue` or generic message

Selecting a cure item from the inventory (TAB) shows: *"Walk into them to administer the cure."*

### Targeted Cures
If a cure item has `useTarget: "some-id"`, it only works on the afflicted with that ID. A targeted cure applied to the wrong target has no effect — the collision simply respawns the player.

---

## Recovery Mechanic (Step by Step)

Recovery turns a cured resident into a playable roster character.

**Prerequisite:** Afflicted must be `'cured'` and the player must be in their `associatedRoom`.

If the player is in a different room from `associatedRoom`, pressing E on the cured afflicted shows: *"[name] stares past you. They seem distant. Maybe they need somewhere familiar."*

Once in the right room, E progresses through `backstory` pages one at a time. On the **final page** (or immediately if no backstory):

1. `rsm.recoverResident(id)` — adds to `recoveredResidents` set
2. `afflicted.setStatus('recovered')`
3. `rsm.addToRoster(charState)` — character added with `textureKey: player-${playerVariant}`
4. `recoveredItems` copied into the character's inventory slots
5. Afflicted NPC entity destroyed (`afflicted.destroy()`)
6. `refreshParkedBodies()` — a standing sprite appears in their position
7. Events emitted: `roster-changed`, `inventory-changed`

---

## Spawning Rules

Called on every room transition in `spawnAfflicted()`. Four checks gate whether an afflicted NPC spawns:

1. **Recovered → skip.** Recovered residents are parked bodies, never NPCs.
2. **Cured + associatedRoom set → only spawn in that room.** The afflicted only appears in their home room post-cure.
3. **Uncured + associatedRoom + currently in that room → skip.** The home room is reserved; the afflicted is only present in the city until cured.
4. **Active character → skip.** If the afflicted is the currently-controlled character, don't also spawn them as an NPC.

The spawn uses `findFullAfflictedDef(id)` to always get the most complete definition (with backstory/recoveredItems), but uses the current room's x/y for positioning.

**Spawn texture initialization:** When an afflicted spawns with `initialStatus = 'cured'` or `'recovered'`, the constructor applies the `player-${playerVariant}` texture immediately — it does not go through `setStatus()`, so this must be done explicitly in the constructor. Omitting this caused a one-frame flicker where the afflicted sprite appeared before the player sprite.

---

## Visual Variants

| Key | Spritesheet | Notes |
|-----|-------------|-------|
| `walker` | `afflicted-walker.png` | Standard 4-direction walking sprite |
| `husk` | `afflicted-husk.png` | Alternate appearance; currently same behavior as walker |

Cured/recovered afflicted switch to `player-${playerVariant}` sprites (e.g., `player-ranger`, `player-rogue`).

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

### Dual-room pattern
The same afflicted ID can appear in two rooms in `rooms.json` — once in the city, once in their `associatedRoom`. The engine automatically gates visibility: city entry (uncured), home room entry (cured). The `associatedRoom` entry only needs `id`, `name`, `role`, `x`, `y`, `behaviorLoop`, `variant`, `playerVariant`, and `associatedRoom` — the full backstory/items come from the city entry via `findFullAfflictedDef`.

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
