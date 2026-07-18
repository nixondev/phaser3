# TOUR.md — a guided walk through WARDEN's engine

A curriculum for learning **Phaser 3** through the code we've actually
written. Each session is a *neighborhood* — a cluster of files that work
together — with its *important buildings* (the files worth standing in front
of), the Phaser concepts it teaches, and questions you should be able to
answer before moving on.

**How to use this document:**
- One session per sitting (or two small ones). Check the box when you can
  answer the exit questions without looking.
- The guide (Claude) walks you through the buildings interactively — open
  the files, ask "why this and not that," detour freely. The doc is the map,
  not the tour.
- Sessions are ordered so each builds on the last, but 7–11 can be taken in
  any order once you've done 1–6.
- Companion reading is listed where a doc already covers the ground
  (`WORDS.md`, `EDITORGUIDE.md`, …).

Legend: 🏛 = important building (file) · 📖 = Phaser concept taught ·
❓ = exit questions

---

## Session 1 — City gates: boot, config, and the game loop
- [x] **Completed** (2026-07-14)

Where Phaser begins and everything else hangs off of.

🏛 `src/main.ts` · `src/scenes/BootScene.ts` · `src/scenes/PreloadScene.ts` ·
`src/utils/Constants.ts` · `vite.config.ts` (just the top: aliases, base path)

📖 What a `Phaser.Game` is; the `GameConfig` (renderer, physics, scale
manager, scene list); why 320×240 with `Scale.FIT` gives crisp pixels at any
window size; `pixelArt: true`; the asset pipeline — `load.spritesheet`,
`load.tilemapTiledJSON`, texture keys as global names; the Boot → Preload
handoff and why preloading is its own scene; the `__warden` dev handle.

❓ Trace a PNG from `public/assets/` to a sprite on screen — every step.
Why do all scenes exist up front in the config but not run? What happens if
two loads use the same key?

---

## Session 2 — Downtown: the scene system
- [x] **Completed** (2026-07-15)

Phaser's biggest idea: scenes as parallel worlds with lifecycles.

🏛 `src/scenes/MenuScene.ts` · `src/scenes/GameScene.ts` (just the skeleton:
`create()` / `update()`) · `src/scenes/UIScene.ts` · `src/scenes/PauseScene.ts` ·
`src/scenes/DocumentReaderScene.ts`

📖 Scene lifecycle (`init`/`preload`/`create`/`update`/shutdown); `scene.start`
vs `scene.launch` vs `scene.stop` vs `scene.restart` — and which one wipes
what; **two scenes running in parallel** (Game + UI) and why the HUD isn't
just drawn inside GameScene; overlay scenes (Pause, DocumentReader) that
pause nothing but sit on top; the scene-to-scene **event bus**
(`gs.events.on('dialog-open', …)`) as the only bridge — UIScene renders,
GameScene decides.

❓ Why does `rsm.reset()` + `scene.restart()` give a clean run? What state
survives a restart (hint: singletons) and what doesn't (scene fields)?
Why must UIScene re-subscribe to GameScene events after a restart?

---

## Session 3 — The land itself: tilemaps, rooms, transitions
- [x] **Completed** (2026-07-15)

How a JSON file becomes a walkable world.

🏛 `src/systems/RoomManager.ts` · `src/data/rooms.json` ·
`src/utils/TilesetResolver.ts` · `src/systems/TransitionManager.ts` ·
one map file in `public/assets/tilemaps/`

📖 Tiled JSON anatomy (layers, GIDs, firstgid); `make.tilemap` +
`addTilesetImage` + `createLayer`; the three-layer convention
(Ground/Collision/Above) plus our On* alpha layers and `Spectra`;
`setCollisionByExclusion([-1])` — collision from data, not code; depth as
z-order (`DEPTH` constants — why Above=30 sits over PLAYER=20); door zones
as invisible physics bodies carrying data (`zone.setData('doorDef', …)`);
how one GameScene hosts every room (load → tear down → rebuild, no scene
change); base vs room-specific tilesets and the `firstgid` math.

📚 Companion: `TILESHEETS.md`, CLAUDE.md "Tileset Workflow".

❓ Walk through a door: list everything torn down and rebuilt, in order.
Given `tileFrame: 3, tilesetKey: 'clinic-tiles'`, compute the Tiled GID.
Why do doors carry `spawnX/spawnY` for the *arriving* player?

---

## Session 4 — The residents: entities, physics, state machines
- [ ] **Completed**

Sprites that think.

🏛 `src/entities/Entity.ts` · `src/entities/Player.ts` ·
`src/entities/Afflicted.ts` · `src/entities/Direction.ts`

📖 Extending `Phaser.Physics.Arcade.Sprite`; `scene.add.existing` +
`scene.physics.add.existing` (display list vs physics world — two
registrations!); arcade bodies, velocity-driven movement (no manual x/y);
colliders vs overlaps (wall vs door); animation definition
(`anims.create` with `generateFrameNumbers`) vs playback, and the guard
against restarting an already-playing anim; the Afflicted 5-state machine
(wandering/agitated/frightened/cured/recovered) driven by distance checks
in `update`; tints as cheap state display; groups
(`physics.add.group`) as both collections and collision targets;
`associatedRoom` gating at spawn time — *the same def spawns differently
depending on singleton state*.

📚 Companion: `AFFLICTED.md`.

❓ Why velocity and not `x += speed`? What breaks if you forget
`physics.add.existing`? Where exactly does an afflicted decide to chase you,
and why does that live in the entity, not GameScene?

---

## Session 5 — City hall: state, data, and the condition grammar
- [ ] **Completed**

The single source of truth and the language everything gates on.

🏛 `src/systems/RoomStateManager.ts` · `src/systems/InteractionResolver.ts` ·
`src/types/index.ts` · `src/systems/FlagAudit.ts` · `src/utils/SaveManager.ts`

📖 The singleton pattern and *why game state must outlive scenes*;
inventory as a fixed 12-slot array (pressure by design); the
`RequireCondition` grammar (`item`, `flag`, `character`, `trait`,
`characterPresent`, …) and `ProduceEffect` (`setFlag`, item grants) —
**one vocabulary shared by doors, interactables, thoughts, and
conversations**; requires/produces as the game's cause-and-effect language;
world flags and their hygiene (namespacing, the dev audit, F1 display);
serialize/loadFrom kept alive but unused (every run starts fresh — a design
choice, not a limitation).

❓ Why is RoomStateManager not a scene field? A door needs a key *and* the
generator running — write the `requires` array from memory. What's the
difference between `collectedItems` and inventory contents?

---

## Session 6 — The nervous system: input and interaction
- [ ] **Completed**

One verb, many meanings.

🏛 `src/systems/InputManager.ts` · GameScene's interact scan
(`checkInteractions` region) · `src/systems/DebugManager.ts` (input half)

📖 Polled input (`addKey` + `isDown`/`JustDown`) vs event input
(`keyboard.on('keydown-…')`) — and why the difference matters (menus vs
movement, and why headless CDP keys only reach event listeners);
`getState()` (continuous) vs `getTapState()` (one-shot) as a deliberate
API split; virtual input injection (`injectTap`) for Cast + testing; the
**nearest-target scan** — doors, interactables, dropped items, afflicted,
parked bodies all compete by distance for the single E; pointer input on
sprites (`setInteractive` + padded hit areas, the player click = introspect).

📚 Companion: `PARADIGM.md` (one-verb rule).

❓ Why does E never need a menu of choices? Two interactables 20px apart —
which one fires and why? Why does the tutorial-free `?`/`…` glyph pattern
depend on this input model?

---

## Session 7 — The words district: prose, thoughts, conversations
- [ ] **Completed**

Everything the game says, and the three selectors that decide when.

🏛 `src/systems/Words.ts` · `words/` (the twee files) ·
`src/systems/ThoughtManager.ts` · `src/systems/ConversationManager.ts` ·
`src/data/thoughts.json` · `src/data/conversations.json`

📖 Not Phaser — *our* layer, and how it stays out of Phaser's way:
prose in files, logic in metadata, selection as pure functions over
(state, place, who); `import.meta.glob` bundling; the `words:` ref
resolved at two display choke points; the WHO/WHERE/WHEN selection pattern
used three times (thoughts → conversations → next thing); pagination and
`---`; the parked-body talk-vs-switch split (E talks, click switches);
`repeat` semantics driving the glyphs.

📚 Companion: `WORDS.md` (read first, then tour the code).

❓ Where would a fourth selector (e.g. radio broadcasts) plug in? Why does
prose *never* live in `rooms.json` anymore? Trace a `?` glyph from selector
to screen.

---

## Session 8 — Light and weather: the render-texture tricks
- [ ] **Completed**

The most Phaser-technical neighborhood — where the atmosphere is made.

🏛 `src/systems/DarknessOverlay.ts` · `src/systems/Flashlight.ts` ·
`src/systems/RainEffect.ts` · `src/systems/DrippingEffect.ts` ·
`src/systems/CloudEffect.ts` · `src/systems/WeatherManager.ts`

📖 `RenderTexture` as a paintable canvas: fill black, **erase** the
flashlight cone and ambient circle each frame (erase-as-light);
screen-space vs world-space effects (rain fixed to camera via
`setScrollFactor(0)` vs drips living in the world); particle emitters;
depth choreography (LIGHTING=35 over entities, WEATHER=37 over darkness —
rain visible in the dark *on purpose*); cone math (angle + dot products)
for detection — the flashlight is both a light *and* a sensor (frightens
afflicted, reveals HIDDEN=31 objects); battery as a resource loop;
data-driven weather from `rooms.json`.

❓ Why erase instead of drawing light? Why is WEATHER above LIGHTING?
How does the flashlight know an afflicted is "in the beam" — and where
does spectra-vision hook into the same machinery?

---

## Session 9 — The concert hall: MIDI audio
- [ ] **Completed**

Real-time synthesis instead of MP3s.

🏛 `src/systems/MusicManager.ts` · `src/lib/SpessaSynthPlayer.ts` ·
`src/systems/AudioEffectsManager.ts` · `src/systems/AudioManager.ts`

📖 Mostly Web Audio, deliberately outside Phaser's sound system:
AudioWorklet + SoundFont synthesis (SpessaSynth); track resolution
(room → track name → fallback chain) and **no-restart sharing** between
rooms on the same track; `ConvolverNode` reverb with per-room impulse
responses; proximity layers (music that gets louder near the clinic);
browser autoplay policy and why audio waits for a gesture.

❓ Two rooms share a track — what actually happens on transition, and
what still changes? Why MIDI+SF2 instead of OGG files, for this game
specifically?

---

## Session 10 — The workshop: in-game editors and dev servers
- [ ] **Completed**

The game that edits itself.

🏛 `src/scenes/EditorScene.ts` + `src/systems/RoomEditorManager.ts` ·
`src/scenes/TileEditorScene.ts` · `src/scenes/SpriteEditorScene.ts` ·
`src/editor/PixelCanvas.ts` · `src/editor/ColorPanel.ts` ·
`src/editor/htmlOverlay.ts` · `vite.config.ts` (`editorSavePlugin`)

📖 Scenes as tools, not gameplay; HTML-over-canvas UI (when Phaser's UI
isn't worth it); shared editor components (one PixelCanvas, two editors);
the Vite dev-server middleware as a save backend (`/__editor/*` endpoints
writing tilemaps, rooms.json patches, PNGs) — dev-only by `apply: 'serve'`;
smart save ordering (objects before tilemap reload); reading pixels back
out of textures; why the editors respect the same data files the game reads
(edit → hot reload → play, no export step).

📚 Companion: `EDITORGUIDE.md`, `SPRITEEDITOR.md`.

❓ What happens end-to-end when you press X in the room editor? Why does
the save endpoint live in vite.config.ts and not in the game? What's the
trick that lets a text input sit "inside" a Phaser scene?

---

## Session 11 — The outskirts: debug, cast, scripts, and verification
- [ ] **Completed**

Everything that supports the city without living in it.

🏛 `src/systems/DebugManager.ts` · `src/utils/Debug.ts` · `src/cast/*` ·
`scripts/` (skim: build-tiles, new-room, patch-tilemaps) ·
`.claude/skills/verify/SKILL.md`

📖 The F1/F3 overlay pattern (read everything, touch nothing); global debug
shortcuts as a manual test harness; Chromecast sender/receiver as a case
study in the input-injection seam (the same `injectTap` used for testing);
Node scripts as the asset pipeline (PNG composition without an image
library — the hand-rolled PNG encoder); headless verification and the
`__warden` handle; what "verify" means for a game vs a library.

❓ Where are the three places virtual input enters the game? Why does the
tile pipeline keep individual source PNGs *and* composed tilesets? What
would you check first when a room renders but collisions feel wrong?

---

## Graduation project (optional, when the tour is done)

Pick one and build it with the guide *watching, not driving*:
1. A new weather effect (fog?) — Session 8 skills.
2. A new condition type (`doorUnlocked`) used by a conversation — Sessions 5+7.
3. A new room with a puzzle chain (key → generator → door) authored purely
   in data — Sessions 3+5+6.

---

*Course log — date, session, detours taken:*

| Date | Session | Notes |
|------|---------|-------|
| 2026-07-14 | 1 | Docs lied: native 1280×960/64px, not 320×240@3×. Detour: pixelArt/roundPixels only bite on resample; index.html CSS force-crisps canvas. Revisit: duplicate-texture-key question. |
| 2026-07-15 | 2 | Verified in Phaser source: shutdown clears only TRANSITION listeners — cross-scene subs survive restart; emitFullState re-syncs HUD. Found: GameScene create() stacks duplicate self-listeners per restart (benign, fix with .once). Found: DocumentReader doesn't pause the world (design call pending). Detour: fonts → TEXT_STYLES channel table (Bitcount Ink / Workbench / Silkscreen). |
| 2026-07-15 | 3 | GID math derived from real data (clinic frame 3 → 260). protag-house is ~450 color cells, two colors — the wake-up room is mostly paint. Student insight: color tiles + transparent On-layer patterns = runtime material tinting (explains COLOR_OVERLAY_DEPTH +0.05 sandwich). resizeMap must shift every coordinate-bearing thing; explicit firstgid preservation is load-bearing. Re-quiz (restart survivors) half-landed — spot-check again later: "library + pockets". |
