# MOBA Roguelite — Design Log

The living record of what this project is becoming, what's decided, what's
built, and every idea on the table. **How to play** and the file map live in
`README.md`; this file is the *why* and the *what next*.

## North star

**A fun loop that scales in difficulty until the player is overwhelmed — but
never feels bad.** Like Dr. Mario: each round a little harder, always readable,
so a run ends because the player was finally outpaced, not because something
was unfair, invisible or stupid. Every idea, card, tuning change and bot change
is judged against it:
- **Scaling** — difficulty climbs steadily round to round (red's skill and
  stats, tempo, new wrinkles): no flat stretches, no cliffs.
- **Overwhelmed in the end** — runs end by being outpaced (a strong player
  around the mid-teens), not by stalling into long grinds.
- **Never feels bad** — every loss is readable before it happens (the wave
  turning, the siege coming, the tower crumbling), red's wins are earned (never
  a bug, a stupid-looking bot moment or an unseen rule), and the player always
  has an answer.
(`/analyze-run` judges play logs against this.)

**A round's two acts (user, 2026-10-10):** before overtime is *out-farm your
opponent* — last hits, trades, wave control, building an edge; overtime is
*now find a way to win the round* — turn that edge into a broken tower.
Overtime is the expected finish, not a failsafe: a tower barely touched when
overtime starts is normal, not a stalemate to fix, and a huge late wave
breaking a tower fast is the earned ending. What should NOT happen is an
early tower crumbling the moment one normal wave reaches it (hence the +600
tower floor). Judge tower pacing by this, not by pre-overtime tower damage.

## Power-up drops — shooter-style capsules 💡 (user, 2026-10-13: "ranged minions drop powerups of some kind, like spaceship scrollers or contra")

Working shape (being worked out with the user, not built):
- **Source**: a ranged creep a hero last-hits drops a capsule, on a fixed rhythm
  (e.g. every 4th ranged last hit) rather than a random roll: readable, no lucky streaks.
- **The capsule is yours**: it sits where the creep died, in your colour, with a
  letter for what's inside (Contra's S / L / F) and a few hits of health (3 pips).
- **Break it to take it** (user): whoever lands its last hit decides — you → you
  get the power-up; red → it's gone (denied). No stealing. It's a little last-hit
  race in the contested middle, like opening Contra's flying capsule.
- **Creeps ignore it completely** (user); towers too. Likely attacks only, 1 hit
  each whatever the damage, so damage cards don't trivialise it.
- Fades after ~8 s if nobody breaks it.
- **Effect**: temporary (~10 s), a ring on the hero (visual-cue standard), a
  play-changing spike like a shooter weapon: Spread (attacks also hit one more
  target), Rapid (+60% attack speed), Pierce (attacks pass through creeps), Mana
  (free casts). Cards stay permanent; a card could later hook drops (rate, length).
- **Why**: in overtime kills pay no gold, so last hits stop mattering when the
  round is decided; drops give them a purpose and give act two a tool to break a
  stalemate.
- **Red**: breaks its own capsules and goes for yours like a last hit / deny,
  weighed against danger (gives up ones under your tower or deep in your reach).
- Open: overtime only (recommended first) or the whole round; which 3–4 power-ups;
  a snowball check (the side winning the wave gets more ranged last hits).

## Continue a run (built 2026-10-10)

The run is saved (`user://continue.save`, Run.save_continue — Run.to_dict via
store_var) at the start of every round and when the shop opens after a win; the
hero pick shows **Continue · round N (HERO)** / **Continue · shop after round N**
while a save exists. Losing a round, abandoning from the pause menu or starting
a New run clears it. Quitting the game mid-round keeps it, so you replay that
round from its start — a way to dodge a losing round, allowed for now (user).
Same seed, so the same red hero, build and shop offers.

## Hero minds — each hero is its own entity (2026-10-09, the paradigm)

Red plays every hero as **that hero**: a unique entity with its own
personality that understands its kit and its matchups and grows sharper over
the run — the spirit of all the bot work so far (combo book, KAREN's ult combo,
KYLE's BOOP pulls). Data in `scripts/hero_minds.gd`: each hero's own full
personality (decision order, retreat line, hold-back, stutter / commit /
totem keenness, shopping priorities), rules that use its kit, **stages** (how
it grows by round) and **vs** (matchup tweaks). The four old types (brawler,
farmer, pusher, opportunist) are kept as reference templates in
`scripts/personality_templates.gd` — to copy from for future heroes, and for
experiments (autoplay --personality); nothing reads them in normal play.
- **KAREN · the anchor** (first full mind): plants herself in the wave
  (hold-back −30), gnaws it — GRIND on waves only when it finishes creeps,
  heals her or hits a big clump — clears your front creeps first to hold your
  push, and turns on anyone inside her threat zone while she holds the wave
  (250 px; 350 from round 4, 400 from round 8; +50 vs ranged KYLE / BECKY, −50
  vs CHAD).
- **KYLE · the zoner, CHAD · the diver, BECKY · the artillery**: personalities
  copied from the types they played as; their own rules, stages and matchups
  are next.
- For all bots: a dull red skips its wave steps (farm / clear / push) a third
  as often as the rest — beginner mistakes, not forgetting the lane.

**Working rule:** ideas get logged here first and are built toward the
larger mechanic as they firm up, not all at once. Nothing is locked in
unless it's marked **Decided**.

---

## 1. Vision

> A roguelite built on MOBA laning. How well you last-hit decides what you
> can buy between rounds, and more gold buys better upgrades.

It started as a blank-map sandbox for Dota / Heroes of the Storm controls,
grew a lane, towers, creeps and an enemy bot, and on 2026-09-29 found its
hook: **last hitting, the hardest and least visible skill in a MOBA, becomes
the roguelite's economy.** The skill and the reward are the same thing.

The user's words, as the idea formed:

- "add gold and last hitting, but let's start thinking of this as a
  roguelite/like"
- "gold buys upgrades between, more gold better upgrades, I think I am onto
  something that really has not been done"
- "and maybe some sort of procedural generated more complicated maps as you
  progress"
- "yeahh the shop is in between rounds in a way, it works so well"

### Why it could work

- **Skill = currency.** Clean farming directly funds your build, so a player
  who improves at last hitting feels it every run.
- **The shop is the roguelite decision point.** Buy the Rare now or save for
  an Epic? Take an economy upgrade and gamble on a richer run later?
- **The rival plays the same game.** The bot farms and could shop from the
  same pool, so every lane is a race: deny its build while you grow yours.
- **Two axes of variety.** Upgrades change *you*; procedural maps change
  *the problem*. Different maps would push different builds.

### Novelty check (web search, 2026-09-29)

**Closest:** **Roguenarok** (Steam, Dec 2023, $4.99): a single-player
"MOBA action roguelite bullet-heaven". Destroy the enemy base before it
destroys yours, fight alongside soldiers and turrets, build items, a
5-territory campaign that unlocks new warriors. The same skeleton
(single-player lane war plus roguelite campaign), but a horde / bullet-heaven
feel. Nothing found on last hitting as the economy, a between-round shop, or
a rival hero playing the same economy. **Worth playing** to see what it does
and doesn't do.

**Neighbours:**
- *Re:Creeps* (Dota 2 custom game, active through Nov 2025): billed as
  "Dota 2 but it's a roguelike". Details unverified (its title suggests you
  play as a creep).
- *Raiders of Blackveil* (Early Access Dec 2025): a multiplayer co-op
  roguelite with MOBA-style champions and 300+ perks; no laning.
- *Skillshot City*: a PvP roguelite battle royale with skill drafting over
  3 rounds.
- *Flamebreak*: a twin-stick roguelite with LoL / Dota-style items, in
  dungeons.
- *MOBA大乱斗* (Early Access 2025): a deckbuilding roguelite with MOBA rules.
- Auto battlers (*TFT*, *Dota Underlords*): rounds and a shop between them,
  but no direct control of a hero.

**Takeaway:** "MOBA roguelite" exists as a small niche, but none of the
games found make **last hitting the currency** that funds a **between-round
shop**, against a **rival hero on the same economy**. That combination still
looks like the distinct angle. (A search can't prove absence; itch.io and
Dota custom games are the likeliest places for something similar to hide.)

---

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| D1 | Controls follow Dota / HotS: right-click **force move**, left-click attack targets the enemy **closest to the cursor** (not the hero), QWER hold-to-aim | user corrections during the sandbox build |
| D2 | **Fullscreen**, so edge-pan camera navigation works | "this needs to be full screen if we want to do the edge map navigation thing" |
| D3 | Keep training dummies as a **test mode**, not the main game | "keep the dummy idea for maybe a test mode later" |
| D4 | The main mode is **a lane with creep waves and a single tower at each end** | user request |
| D5 | **Tower / creep rule:** hit minions, *unless* an enemy hero hits one of your heroes; then that hero is the target | "if there is a minion to hit or similar hit it UNLESS your hero hits an enemy hero" |
| D6 | Minions walk **"a touch more leisurely"** (290 → 240) | user request |
| D7 | **Gold only for the killing blow** (last hitting) | user request: "add gold and last hitting" |
| D8 | The project's direction is a **roguelite** | 2026-09-29 |
| D9 | **The shop sits between rounds** | "the shop is in between rounds in a way, it works so well" |
| D10 | **More gold buys better upgrades** (exact mechanic still open, see Q2) | user |
| D11 | Ideas get **logged, then built as they firm up** | "these ideas just need to be logged, and built towards the larger game mechanic as ideas crystalize" |
| D13 | **Round structure and shop built** with these defaults (each changeable): 5 rounds; hero picked at run start and fixed; losing a round ends the run; **priced tiers** (Common 100 / Rare 250 / Epic 600, 3 offers each); reroll 50 +25; epics one per run; **unspent gold carries over**; red +15% per round; shop rolls seeded, run state serializable | user: "build the round structure and shop" (2026-09-29) |
| D14 | **Difficulty curve: red starts nerfed and creeps up**; round 1 must not be hard. Built as a per-round table (§3) | "make the enemy nerfed somewhat to begin with and slowly creep up, but certainly should not be hard the first round" |
| D15 | **Keep everything easily balanceable, at all times.** Every tuning number lives in a data table, not buried in logic (see §8) | "these are things we will have to balance, leave things easily balanceable at all times, note that" |
| D16 | **Ability upgrades are by letter, and abilities have levels.** Shop cards say "Q", "W", "E" or "R", not a hero's ability name; each hero's abilities have level 1, 2, 3… versions that the card advances. **Built** (§3) | "I think ability upgrades should be just letter based and the abilities themselves have 1 2 3 and so on versions of themselves in order to maybe have versus mode" |
| D17 | **Pick a (possibly different) hero each round**, with **letter upgrades shared across heroes**: "Q level 2" carries over and applies to whichever hero's Q you play. **Built** (§3): swap freely in the shop, next opponent shown | "you should be able to pick another hero per round, this will maybe create tension, but maybe a Q upgrade is shared amongst types?" |
| D18 | **Round pressure: overtime.** From 3 minutes into a round, both towers take growing extra damage (+50% per minute) and waves grow (+1 melee every 2 waves, up to +4). Symmetric, so the side ahead breaks through and rounds can be lost | user: "build the round pressure fix", after autoplay found round-3+ stalemates (2026-09-29) |
| D19 | **Play log:** record the player's runs for analysis (timeline, autoplay-format summary, screenshots). Off unless switched on (hero pick or pause menu); dev builds only (F5 or the playtest exe), never in the shareable build | user: "build the play logger and make only on with a switch wherever that is appropriate" (2026-09-29) |
| D20 | **KYLE's Bolt is a recast ability:** the first press sends a harmless dot (passes through units) to the cursor / max range, where it waits 2 s; pressing Q again detonates a larger blast there; if not reactivated it fizzles. Mana on the first press, cooldown when it ends. New ability kind `orb` | user: "pressing shoots a dot outwards that does not damage and passes through units, reactivate for it to cause a larger area to explode at the point of the original smaller circle" (2026-09-29) |
| D21 | **Training shortcuts:** a "Training mode" button on the opening (hero-pick) screen, and a "No cooldowns" switch in Training only (never in a run). The mode keeps the name Training; names are still open | user: "make a switch for no cooldowns in try mode and add a button to start in try mode on the opening screen" / "training mode is fine, we are still naming things" (2026-09-29) |
| D22 | **Red shops.** Red keeps gold (its bot's last hits and kills, plus an allowance of 250, 350, 450… per round), upgrades and ability levels across the run, and spends them from its own seeded offers when your shop opens (about half levels, half the priciest card). The next bot plays that build, and the shop's "Next opponent" shows it | user: "build red shopping" (2026-09-30) |
| D23 | **Endless runs:** a run goes on until you lose a round; score = the round reached; best round saved. Past round 5 the difficulty table keeps growing (+10% red stats per extra round, the bot's reaction and aim sharpen to floors) | user: "make endless" |
| D24 | **Denying:** your own creeps below 50% health can be attacked (click on them); the killing blow pays nobody and shows "!". Attack-move never denies. The bot denies from round 3 (`bot_deny`) | user: "also need the last hit deny mechanic" |
| D25 | **Gold sinks, both sides:** dying costs 15% of carried gold (max 300), given to the enemy hero if it got the kill (so feeding funds red's shop), otherwise lost; and **rising prices**: every pick (card or level) makes everything 8% dearer for the rest of the run, so picks get prioritised | user: "loss on death and prices rising … every upgrade you pick makes prices rise" / "15% max 300 given to the hero if they get the kill" (2026-09-30) |
| D26 | **Shop WAVE row (creep upgrades), both sides:** always-on cards under Abilities. Reinforcement (500, stacks to 3): +1 melee creep per wave. Healing Aura (350, once): your ranged creeps heal nearby creeps 8/s within 250. They count as picks (rising prices); red can buy them | user: "a pretty expensive extra regular minion buy and an upgrade to ranged minion to give off a health regen aura" (2026-09-30) |
| D27 | **Two more WAVE cards + the first stun:** Tank Minion (550, once): a tank creep (1100 hp) leads your waves and every 6 s stuns the closest enemy creep or hero within 300 for 1 s. Siege Training (400, once; Claude's pick): your creeps deal +50% damage to towers, which gives red a real way to threaten your tower. Stunned units can't move, attack or cast | user: "a tank minion that leads [and] can stun the closest enemy within a range on a set cooldown" / "and maybe you think of one" (2026-09-30) |
| D28 | **Leashing built:** G then click one of your creeps to have it follow you and attack what you attack; G-click it again (or die) to release it. 2 leash points to start (melee 1, ranged / tank 2); the Command wave card adds +1 (×2). And **towers lock on** to a hero who hits their hero in range until that hero leaves range (was: 2 s) | user: "build the leashing mechanic" + the tower-priority check (2026-09-30) |
| D29 | **Balance pass 1 (from the QA playtest):** abilities do 60% to creeps (last hitting matters again); lifesteal from area hits counts 25%; KAREN's Quake is a single blast (no pulses); **damage by target type is a dial everywhere**: each ability may set vs_heroes / vs_creeps / vs_structures (defaults 1.0 / 0.6 / 1.0 in unit.gd), hero auto-attacks have ATTACK_VS_STRUCTURES; **bot-only hero stats** (a `bot` block per hero in heroes.gd, empty = same as the player); Quit on the pick / run-over screens; "extract the zip first" in the playtest readme | user: "do 5 too … leave room for balancing structure damage" / "build that into everything so you can change ability damage to building vs an enemy" (2026-10-01) |
| D12 | **We're building a one-player roguelite.** Versus (live player-vs-player) is a **possible later mode we leave room for**, not a planned phase | "no we are building a one player roguelite BUT I want to leave room for versus as a mode as well" |

---

## 3. What's built

Godot 4.7, 2D, everything drawn in code. Tests are headless GDScript
suites (10 suites, all passing as of 2026-09-29).

### Controls and camera
- Right-click force move (hold to steer); left-click attacks the enemy
  closest to the click (within 450 px), or attack-moves there.
- QWER: hold to aim with a preview; release (or left-click) casts;
  right-click cancels. S stops.
- 1–4 switch hero (resets health, mana and cooldowns; see P3).
- Free camera: edge-pan (18 px band), arrow keys, Space snaps to the hero, Y
  locks to the hero.
- Fullscreen with the mouse confined to the window; F11 toggles windowed.
- F9 switches Lane / Training; Enter restarts.

### Heroes (4)
KYLE (circle), CHAD (triangle), KAREN (square), BECKY (hexagon).
Each has health, mana and regen, an auto-attack, and four abilities from
seven kinds: skillshot, ground AoE, dash, blink, self shockwave, cone, beam.
Kits live in `scripts/heroes.gd`.

### Lane mode
| Piece | Rules (current numbers) |
|---|---|
| Map | One lane west ↔ east, 560 wide; bases at x = ±2600 (radius 300; standing in your own base heals 20% health and mana per second) |
| Towers | x = ±2000; 3000 HP, 650 range, 110 damage per 1.1 s; solid; rubble when destroyed. Range ring shows as you approach, red when it's aiming at you |
| Tower targeting (D5) | 1) an enemy hero that hit one of its heroes in range (2 s aggro) → 2) enemy creeps (keeps its creep) → 3) enemy heroes only if no creep is in range. Re-checked every shot |
| Creep waves | Every 30 s (first at 3 s): 3 melee (550 HP, 21 dmg) + 1 ranged (320 HP, 24 dmg, 400 range), speed 240. Priority: aggro hero → creeps → heroes → tower; acquire range 460 |
| Collision | Towers and dummies are solid; heroes and creeps shove each other (half each); everyone slides around obstacles |
| Hero death | Respawn at base after 6 s |
| Win / lose | Destroy the enemy tower / lose yours; waves stop; Enter replays |

### The run: rounds and the shop (D13)
- **Hero pick** opens a run (click a card or press 1–4); the game is paused
  behind it. The hero is fixed for the whole run.
- **A run is 5 rounds.** A round ends when a tower falls; after 1.5 s the
  screen for what happened opens:
  - **Round won → the shop** (game paused over the lane): three tiers of 3
    offers each, priced Common 100 · Rare 250 · Epic 600. Click a card to
    buy it (one purchase per card). **Reroll** costs 50, +25 each time in the
    same shop. **Next round** (or Enter) starts the next lane.
  - **Round lost → run over** (shows the round reached, gold, build);
    **New run** (or Enter) goes back to the hero pick.
  - **Last round won → run complete.**
- **Gold carries over** between rounds, and so do upgrades. In a round, the
  HUD's top left shows your build instead of the hero list, and the status
  line shows "Round N / 5".
- **Difficulty curve (D14):** red starts weak and ramps up, from one table
  per round in `run.gd` (`DIFFICULTY`). Your side is never scaled.

  | | R1 | R2 | R3 | R4 | R5 |
  |---|---|---|---|---|---|
  | Red creeps (health & damage) | 75% | 85% | 95% | 105% | 120% |
  | Red tower health | 55% | 70% | 85% | 100% | 115% |
  | Red tower damage | 60% | 75% | 90% | 100% | 115% |
  | Bot health | 70% | 80% | 90% | 100% | 115% |
  | Bot damage | 60% | 75% | 90% | 100% | 115% |
  | Bot casts at most every | 2.6 s | 2.0 s | 1.5 s | 1.1 s | 0.9 s |
  | Bot aim error | 90 px | 65 px | 45 px | 35 px | 25 px |
  | Bot uses its ultimate | no | no | yes | yes | yes |
  | Bot trades only when ahead by | 20% | 10% | 0% | −10% | −15% |

  The trade margin is capped: at 90%+ health the bot always fights, so a
  healthy round-1 bot still engages. The margin just makes a hurt one back
  off sooner. Measured: up close for 12 s, the round-1 bot deals about
  80–120 damage, versus about 400 at full strength. A weaker early tower
  also shortens the early rounds.
- **Upgrades** are the full draft catalogue (4.2), all wired in and tested;
  hero stats read through `mod("<key>")`.
- **Leaving room for Versus:** shop rolls come from the run seed (the same
  seed, round and reroll count give the same offers), and the whole run is
  plain data (`Run.to_dict()` / `from_dict()`).
- Files: `run.gd` (state, rules), `upgrades.gd` (catalogue),
  `run_screen.gd` (pick / shop / end screens).

### Overtime — round pressure (D18)
- From **3:00** into a round, **both** towers take extra damage that grows
  **+50% per minute** (3× after 4 minutes), and waves grow by **+1 melee
  creep every 2 waves**, up to +4.
- Symmetric on purpose: whoever is ahead in the lane breaks through. With
  red nerfed early and stronger late (D14), early rounds tip your way and
  late rounds can be lost. That's the losing threat autoplay found missing.
- The HUD shows "overtime in 1:20", then a red "OVERTIME · towers +75%";
  weakened towers show cracks.
- Most rounds 1–2 end before 3:00, so overtime barely touches them.
- Tuning (D15): the `OVERTIME` table at the top of `lane.gd` (`start`,
  `tower_per_min`, `melee_every`, `max_extra`).

### Ability levels and hero pick between rounds (D16, D17)
- **Every ability has levels I–III** (`heroes.gd`: a `levels` list under
  each ability holding only what changes; level I is the ability as
  written). Mostly numbers, plus one behaviour so far: KYLE's Bolt
  pierces at III.
- **The shop's Abilities row** always offers Q, W, E and R +1 (not random).
  Each card shows *your current hero's* next level, e.g. "Bolt I → II:
  damage 60 → 85, cooldown 4 → 3.5" (text generated from the data).
  Prices: level II 200, level III 450; R costs ×1.4 (280 / 630). Max III.
- **The shop's Hero row:** pick any hero for the next round, free. Levels
  belong to the letter, so they carry over: Q III as KYLE is Q III as
  BECKY. Stat cards carry over too.
- **Next opponent** is shown in the shop: the bot's hero per round is rolled
  from the run seed, so you can swap to counter it.
- In a round, ability slots show a I / II / III badge, and the build panel
  shows your levels.
- The red bot's abilities stay at level I; its strength comes from the
  difficulty curve.
- Autoplay's shop policies buy levels too (`greedy`), and there's a new
  `levels` policy (ability levels first).
- Tuning (D15): level contents in `heroes.gd`; prices in `upgrades.gd`
  (`LEVEL_PRICES`, `R_MULT`); max level in `heroes.gd` (`MAX_LEVEL`).

### Gold and last hitting (D7)
- Only the **killing blow** pays: melee creep 40, ranged creep 55, hero
  200, tower 250. Creeps and towers finishing a creep pay nobody.
- A "+40" gold popup appears on your kills (not the bot's).
- **Last-hit aid:** on enemy creep health bars, a white tick marks your
  attack damage; the bar outlines white when one hit will kill.
- The HUD shows your gold and last hits; the status bar shows the bot's.
- Implementation: every hit carries a `source`; units have a `bounty`;
  `unit.gd` pays `earn_gold()` to the hero that dealt the killing blow.

### The enemy bot
A normal hero (random pick each game) driven by `scripts/bot.gd`. Every
0.2 s it takes the first action that applies:
1. **Retreat** below 30% health (dash or blink away if threatened) until
   healed to 90%.
2. **Back off** if your tower is shooting it.
3. **Cast** (one per 1.1 s): leads skillshots, beams and ground spells onto
   you with a little aim error; uses shockwaves and cones in reach, and
   non-ultimates on 3+ creep clumps; dashes only to finish you off.
4. **Trade** when you're within 450 (or its attack range + 120), not
   under your tower, and it isn't behind on health.
5. **Last-hit:** swings only at creeps within ~1.6 hits of dying; with no
   creeps of its own, defends.
6. **Hold** behind its front creep, or by its tower.

It never dives: points under your tower count as unsafe unless creeps are
tanking.

### Training mode (D3)
The empty map with five training dummies (1000 HP, reset when defeated,
heal out of combat). Solid. No creeps, towers or bot.

---

## 4. Idea backlog

Status: 💡 idea · 🧭 direction agreed, details open · 🔨 next up

### 4.1 Round structure ✅ built (D13)
- A **run** is a chain of lane **rounds** with one hero. Win a round → shop
  → next round.
- Sketch: ~5 rounds, the last one a finale.
- Losing a round ends the run (roguelike), unless meta progression is added
  (Q4).

### 4.2 The shop ✅ built (D13)
The heart of the loop: spend last-hit gold on upgrades between rounds.
Built as sketched below; the catalogue is live in `upgrades.gd`.

Design (as built):
- Three **priced tiers**: Common 100 · Rare 250 · Epic 600, with 3 random
  offers per tier.
- **Reroll:** 50 gold, +25 each time within the same shop.
- Epics are unique mechanics, one of each per run; commons and rares stack.

Draft catalogue:

| Tier | Name | Effect |
|---|---|---|
| Common | Whetstone | +8 attack damage |
| Common | Quickdraw | +12% attack speed |
| Common | Vigor | +200 max health (was +150) |
| Common | Focus | +150 max mana (was +100) |
| Common | Boots | +25 move speed |
| Common | Salve | +6 health regen (was +4) |
| Common | Siphon | +15 mana per last hit (added 2026-09-29, user request) |
| Rare | Arcane Edge | +20% ability damage |
| Rare | Haste | −15% cooldowns |
| Rare | Longbow | +120 attack range |
| Rare | Vampirism | heal for 12% of damage dealt |
| Rare | Bounty Hunter | +25 gold per last hit (was +15) |
| Rare | Wellspring | +5 mana regen |
| Epic | Twin Shot | auto-attacks also hit a second nearby enemy |
| Epic | Echo | Q hits twice: again 0.4 s later at half damage (for the Bolt: the blast repeats) |
| Epic | Overcharge | ultimate: half cooldown, +30% damage |
| Epic | Colossus | +40% max health, +25% size |
| Epic | Executioner | your hits finish creeps below 25% health |
| Epic | Midas | last hits pay double |

**Economy upgrades** (Bounty Hunter, Midas) feed the loop: invest now, earn
more later. That's where the interesting choices come from.

#### Shop content to add 💡
> "we should populate the shop with all sorts of things, slows on autos,
> upgrades to specific abilities, regen cards idk these are things we will
> have to balance"

The 18-card catalogue is a starting set; the shop should get much wider.
Families to fill out (all numbers to be balanced later, per D15):
- **On-hit effects for auto-attacks:** slows, bonus damage, burn / damage
  over time, armor shred, chain lightning, knockback, a crit chance.
- **Ability upgrades by letter (D16, replaces hero-specific cards):** see
  4.2b.
- **Regen and sustain:** health regen, mana regen, heal on last hit, a
  shield when low, faster respawn.
- **Economy:** gold per last hit, interest on unspent gold, cheaper
  rerolls, a bonus for perfect waves.
- **Defense:** damage reduction, tower-shot reduction, a slow on being hit.
- **Utility:** vision, move speed out of combat, a longer last-hit window.
- **Risk / reward (curses):** big upside plus a drawback, e.g. "+50% damage,
  −30% health".

Mechanics these need that don't exist yet: status effects on units (slow,
burn, shield), and ability levels (4.2b).

### 4.2b Ability levels, bought by letter ✅ built (D16, D17)
Every ability has **levels 1, 2, 3…**; a shop card just says the
**letter**: "Q +1", "W +1", "E +1", "R +1". Buying "Q +1" advances *your
hero's* Q to its next level, whatever that ability is.

- **Why letters:** one card works for every hero, so the shop stays one
  shared pool. That's exactly what a Versus mode needs, since both players
  see and buy the same cards (fair by construction), while each hero's
  levels still differ.
- **What a level changes** is per ability, in `heroes.gd`. Numbers (damage,
  cooldown, cost, radius, range) and, at higher levels, behaviour, e.g.:
  - KYLE Q Bolt: L2 +damage, L3 pierces
  - BECKY R Meteors: L2 +2 meteors, L3 wider scatter
  - CHAD W Blink: L2 shorter cooldown, L3 leaves a damaging afterimage
  - KAREN E Charge: L2 longer, L3 stuns what it hits
- **Card text** is filled in from your hero's data ("Q → Bolt L2: +25%
  damage"), so you see what you're buying.
- **Balanceable (D15):** each level is a row of data under its ability.
  Tuning a level never touches code, and a new behaviour becomes a reusable
  flag.
- **Shop fit (to decide):** which tier letter cards sit in (a Rare? priced by
  target level, with L2 rare and L3 epic?), a max level (3?), whether R
  levels cost more, and how often letter cards show up versus stat cards.
- **Hero swapping between rounds (D17):** because levels are keyed by
  letter, they carry over when you switch heroes. A Q-heavy build pushes
  you toward heroes with strong Qs, and switching to answer the next round
  (or the bot's hero) becomes a real tension. Stat cards carry over as-is.
  To decide: can you swap freely, or does it cost gold, or do you only get
  offered 2–3 heroes per round? Does the bot's hero get revealed before you
  pick?
- **Existing card to fold in:** Echo (an epic today, "Q casts again") could
  become a Q level behaviour, or stay as a generic epic.
- **Build notes:** abilities gain a `levels` array in `heroes.gd`; the hero
  tracks `ability_level[slot]`; `cast()` reads the current level's values
  over the base; Autoplay's shop policies need a rule for letter cards.

Implementation notes:
- Hero stats read through one `mod("<key>")` lookup summed from owned
  upgrades (keys: attack_damage, attack_speed, attack_range, speed, max_hp,
  max_hp_pct, max_mana, hp_regen, mana_regen, size, ability_damage,
  cooldown, lifesteal, last_hit_gold, gold_mult, last_hit_mana, twin_shot, echo, execute,
  ult_cd, ult_damage).
- Attack damage, range and interval become hero functions instead of
  reading `def["attack"]` directly.
- `cast()` splits into cost/cooldown and `_cast_effects()`, so Echo can
  re-run the effects.
- Lifesteal and Executioner hook into `unit.take_damage()` through the hit's
  `source`.
- Run state (stage, gold, upgrades, hero) lives in static vars so it
  survives the scene reload between rounds.
- The shop overlay pauses the tree (the overlay itself processes always).

### 4.3 The rival shops too 💡
The bot already earns gold by last hitting. Let it **spend from the same
shop**, so each round's bot shows up with a build. First sketch: a random
build worth 350 × (round − 1), plus what it farmed, leaning toward the best
tier it can afford. It's playing your game back at you.

### 4.3b Endless mode and red scaling ✅ built (D22, D23; skill-only table and creep escalation still open) (2026-09-29, user: "what about if instead of endless you go till you lose. Does the other team get upgrades? how do they scale?")
- **Today:** red scales only through `Run.DIFFICULTY` (5 fixed rows: creep,
  tower and bot stat multipliers, plus bot AI skill). The bot never buys
  upgrades or levels (it stays at level I) and nothing carries over between
  rounds; there's no row past round 5.
- **Endless ("go till you lose"):** score = rounds reached. Possibly both
  modes: a 5-round campaign with an ending, then "keep going?" into endless.
- **Denying** (4.6) makes this bite: deny your creeps and red's shop
  shrinks.
- **Red shops like you (the proposal):** the bot spends its own last-hit
  gold plus a growing per-round allowance in the same (seeded) shop: cards,
  epics, ability levels. Its power becomes readable and counterable ("next
  opponent: BECKY with Q III, Colossus, Twin Shot"). It scales forever
  without new tables and answers the late snowball seen in the first human
  run.
- **The difficulty table becomes skill only** (reaction, aim, aggression,
  capped), with stat multipliers reduced or removed.
- **Past round 5:** creep escalation (more creeps, a tanky siege creep that
  goes for towers, which also fixes "your tower is never threatened"), a
  persistent rival across the run (a nemesis whose build grows with yours),
  and procedural maps (4.5) as a later dial.

### 4.3c Creep (minion) upgrades — for both sides (✅ built, D26–D27: Reinforcement, Healing Aura, Tank Minion, Siege Training) (user, 2026-09-29)
> "minion upgrades could def be a thing for both sides … what if you could
> upgrade [the ranged back minion] to also have a healing aura, or add a sort
> of 'tank' that occasionally emits a small pulse around itself that causes a
> small stun"

A new shop category: spend gold on **your wave** instead of your hero.
Red buys them too (with red shopping, 4.3b), so waves grow on both sides
and the lane itself becomes part of the build.
- **Today's wave:** 3 melee in front, 1 ranged behind (320 hp, 400 range).
- **Ranged creep upgrades:** a **healing aura** that slowly heals nearby
  friendly creeps (a backline support), and also more range, more damage,
  or a slow on hit.
- **A new "tank" creep** added to the wave: high health, slow, and every
  few seconds emits a **small pulse** around itself that briefly **stuns**
  enemies nearby (creeps and heroes).
- **Other ideas in the same vein:** more melee per wave, a siege creep that
  hits towers hard (also answers "your tower is never threatened"), creep
  armour, faster waves, a "captain" creep that buffs the others.
- **Interplay:** a healing aura keeps creeps alive longer (harder last hits
  for the enemy and more denies for its owner); a stun pulse punishes heroes
  who stand in the wave; red's creep upgrades are something to answer
  (splash like Blast counters clumps, Executioner counters healing).
- **Needs first:** a stun status on units (none exists yet; attack slow is
  the only status so far), creep types driven by data (KINDS in `creep.gd`
  already is), and per-team wave composition that upgrades can edit.
- To decide: tiers and prices for creep cards; do they stack; does red's
  creep build show in the shop's "next opponent" panel?

### 4.3d Gold should not scale with time — ways to lose gold (death loss ✅ built, D25; win bonus / hoarding limits still open) (user, 2026-09-30)
> "I don't think it's good that if a game goes long you naturally get more
> gold. We need ways to lose gold, deaths being an obvious one"

The problem: every wave pays the same, so a longer round = more gold, and
stalling pays. Options:
- **Gold lost on death** (the user's idea): lose a share of the gold you
  carry (sketch: 15%, maybe capped). If the red bot killed you, **red
  gets it** for its shop, so feeding makes the next bot stronger. Lost to
  towers or creeps, it vanishes. It works both ways (kill the bot and red
  loses gold). Hoarding shop gold becomes a risk.
- **Reward fast wins:** a round-win bonus that shrinks with round length
  (big for a 2-minute win, near zero after 8 minutes), so the best farm is
  winning quickly.
- **Creeps pay less as a round drags on** (for example in overtime): blunt
  but caps long rounds.
- **Hoarding limits:** a cap on carried gold, or a tax on gold left unspent
  between rounds.
- **Buyback:** pay gold to respawn instantly; a sink players choose.

Recommendation: death loss (to red when the bot kills you) plus the
shrinking win bonus; add hoarding limits later if gold still piles up.
Tuning note: the second human run saw ~10 deaths per round late on, so the
loss share needs care.

### 4.3e Curb "buy everything" in rich shops — both sides (rising prices ✅ built, D25) (user, 2026-09-30)
> "sometimes if you get a long tough game you have so much gold you can buy
> every single thing.... we need to curb that somewhat for BOTH sides"

Seen in both human runs and in red's shopping (all levels III plus every
offer, with gold left over). Options (all apply to you and red alike):
- **Purchase cap per shop:** for example 3 buys per visit (cards and levels
  count); leftover gold carries. The simplest; every shop is a decision;
  show "2 of 3 picks left". **Recommended.**
- **Rising prices:** each upgrade owned raises prices (for example +10%
  each), or each purchase in the same shop costs more. A softer curb.
- **Fewer offers:** 2 per tier instead of 3 (shrinks the pool, but rich
  players still clear it).
- **Deal with the hoard** a cap leaves: death gold loss (4.3d) or a carry
  cap.

### 4.3f A slower climb from easy to hard 💡 (user, 2026-09-30: "think on ways to make the game progress from easy to difficult in a slower manner")
**The cliff is round 4:** sims win R1–R3 at 100 / 100 / 90%, then R4 at
48%; both human runs were lost in R4. Many things switch on together at
R3–R4: the bot's ult, siege and denies (R3); red creeps pass yours
(0.95 → 1.05 at R4); a more aggressive trade margin and faster casts;
plus red's compounding shop.
Options:
1. **Stretch the table:** 8–10 rows with smaller steps; red creeps ≤ 1.0
   until later.
2. **One new threat per round:** R2 Q/W, R3 dash / escape, R4 ult,
   R5 siege, R6 deny, later red's wave upgrades.
3. **Slow red's economy:** a smaller allowance step, or **keep red close
   to you** (at most ~2 picks ahead of your build).
4. **Adaptive difficulty:** nudge the next round by how the last went
   (time, deaths, tower health).
5. **Gentler endless growth:** +5% per extra round, not +10%.
6. **Acts:** groups of 3 rounds ending in a harder "boss" round, then a
   breather.
Recommendation: 1 + 2 + 3, verified with autoplay (aim for a gradual
100 / 95 / 85 / 75 / 60 … instead of the R4 cliff); adaptive later if
needed.

### 4.3f2 Next up: kits pass ⏭ (user, 2026-10-01)
Order: **kits** → **tune personalities** → **adjust smartness scaling**.
KYLE is the only kit with the user's own ideas so far. The pass reworks
CHAD, KAREN and BECKY the same way, and **nerfs BECKY** along the way
(the user's 19-round BECKY run: long range dominated the early lane, then
out-ranged the tower). Personalities are re-tuned after the kits change,
because hero × personality strengths shift with the kits.

### 4.3f3 Charged ultimates 💡 (user, 2026-10-02: "nerfing ults somehow, what if you have to charge them somehow")
Options under discussion: a charge meter filled by playing the lane (last
hits, denies, hero damage dealt and taken) in place of a cooldown, starting
empty each round; a charged cast (hold R, longer = bigger, can be
interrupted); a hybrid of cooldown and meter; once per round. See the
discussion; nothing chosen yet.

### 4.3g Bot personalities 💡 (user, 2026-09-30: "we could create different personalities for each of our enemy types by giving them each different decision trees")
The bot is a short priority list driven by a few numbers, so:
1. **Same list, different numbers per personality** (cheap): retreat
   threshold, trade margin, engage range, farm vs fight, deny / siege
   habits, ability preferences, ultimate timing. Examples: BECKY "the
   Poker" (max range, harasses, retreats early), CHAD "the Diver"
   (trades at every chance), KAREN "the Wall" (sits in the wave, sieges),
   KYLE "the Farmer" (perfect last hits and denies, fights with Blast).
2. **Different priority order / extra behaviours** (medium): bait under its
   tower, zone you off the creeps.
3. **Behaviour trees** (bigger, later): for example LimboAI, with a visual
   editor and a live debugger.
Why: knowledge is progression (learn and counter habits), roguelite variety
("Next: BECKY, the Poker" in the shop), personalities can be independent of
the hero, and later elite / boss opponents for endless; autoplay can
balance each. Recommendation: start with 1 (a personality table, 3–4
personalities, shown in the next-opponent panel).

**Built 2026-10-01** (options 1 + 2): `bot.gd` PERSONALITIES: brawler,
farmer, pusher, opportunist. Each reorders the priority steps and retunes a
few thresholds. Autoplay pins them with `--personality` and `--red-hero`. A
matrix of 1,280 runs measured them.
**Black box** (user, 2026-10-01: "the personalities will be black box stuff"):
personalities are **never shown or announced**. No name in the next-opponent
panel, no audio motif, no tells beyond how the bot actually plays. Players
learn a bot's habits by watching it play. (This replaces the "shown in the
next-opponent panel" recommendation above.)

**Personality ladder** 💡 (user, 2026-10-01: "create some dumbed down
personalities and then as it progresses they get smarter, landing eventually
on what we determine is the strongest for each"). Each red hero climbs a
ladder over the run: weak, simple-minded bots early, getting smarter, and
ending on that hero's strongest personality (from the matrix) at full
smarts. Sketch: a `smartness` 0–1 per round that blends each personality
between a "dumb" set (slow to react, blunders its priorities, retreats too
late, ignores openings) and its tuned set. Keep it separate from the
difficulty table: difficulty = mechanical skill (aim, reaction), smartness =
decisions. Pending the matrix results.
**Built 2026-10-01 (option 1: one personality per hero, getting smarter).**
- Three dials. **Stats** (STAT_* line). **Skill**: DIFFICULTY is now only
  cast_gap and aim_error, plus the last-hit and deny odds. **Smartness**: the
  ladder.
- trade_margin, bot_ult and bot_siege moved out of the difficulty table and
  into smartness. The farmer's last-hit and deny bonuses were removed (skill
  is never a personality key).
- Signatures (strongest in the partial matrix: 780 runs, your hero as BECKY
  missing): KYLE → farmer, CHAD → brawler, KAREN → brawler,
  BECKY → opportunist.
- Smartness runs 0 in round 1 to 1 by round 6. DUMB: thinks every 0.6 s,
  skips each step 30% of the time, retreats at 12% and returns at 60%, trades
  only when 20% ahead, often misses openings. Ultimate and siege come from
  smartness 0.4.
- Matrix findings: personalities were mostly *weaker* than the standard bot.
  Red KYLE is weak with any personality. The opportunist stalls rounds
  (22% timeouts).

### 4.4 Round scaling 💡
- Enemy creeps and tower gain power each round (sketch: +15% HP and damage
  per round).
- The bot's build budget grows each round (4.3).
- Map complexity grows each round (4.5).

### 4.5 Procedurally generated maps 💡
> "some sort of procedural generated more complicated maps as you progress"

- Round 1 is the plain lane. Later rounds add obstacles, bends, chokepoints,
  jungle pockets, side paths, and eventually multiple lanes.
- Map complexity becomes a difficulty dial alongside enemy power.
- **Prerequisite: pathfinding.** The lane is open ground, so nothing
  pathfinds yet. Creeps, the bot and click-to-move all need obstacle-aware
  navigation, for example Godot's `NavigationServer2D` with a navigation
  polygon baked per generated map.
- Generation ideas to explore: a spine path from base to base plus
  decorations; lane templates stitched together; seeded so runs can be
  shared or replayed.

### 4.5b Hand-made maps that change every few rounds 💡 (user, 2026-09-30)
> "likely not procedural maps, but map changes every so many levels, I think
> a map with two camps might be interesting later"

- Designed maps instead of procedural ones (fair, readable, tunable),
  switching every N rounds (3–5?) as a sense of progression.
- First idea: a **two-camp map**: neutral camps beside the lane (read as
  a small jungle; to confirm). Killing a camp gives gold, a buff or a creep.
- Needs pathfinding once maps have walls or camps (Godot
  NavigationServer2D / NavigationAgent2D, built in).

### 4.5c Leashing minions (G) ✅ built (D28; the bot doesn't leash yet) (user, 2026-09-30)
> "you can g click a minion to make it follow you and then unfollow you …
> take minion to go with you and maybe leashing them to you makes them
> attack the thing you are attacking"

- **G + click** one of your creeps: it follows you; **G again** sends it
  back to the lane. Leashed creeps **attack what you attack.**
- Uses: escort creeps to a camp, bring a tank to soak tower shots, a pocket
  bodyguard.
- The built-in cost: every creep you take weakens your wave, so the lane
  pushes back while you're away.
- **Capacity (user, 2026-09-30):** "at first you can take two regular
  minions or one of other types, upgradeable". Model: **leash points**:
  start with 2; melee costs 1, ranged or tank costs 2; an upgrade card adds
  points (later builds can mix, for example a tank plus a melee).
- Still to decide (was: how many at once);
  does a creep drop the leash if you get too far or after a time; can the
  bot leash; which creep types.
- Pairs with the WAVE cards: a leashed Tank Minion stunning for you, or a
  leashed Healing Aura ranged creep as a mobile heal (the aura heals heroes).

### 4.6 Smaller ideas 💡
- **Denying** ✅ built (D24) (user, 2026-09-29: "if we do this it would be good to
  implement gold denying as well"): pairs with red shopping (4.3b). Every
  creep you deny is gold red can't spend, so your laning directly shrinks
  red's next build. Sketch: your own creeps below 50% health can be
  attacked (left-click on them), the killing blow on your own creep gives
  nobody gold (maybe a small bonus to the denier, to decide), a deny marker
  shows on eligible health bars, and the bot denies too, as a difficulty
  knob (rare early, frequent later). The play log and autoplay track
  denies. Build it right after red shopping; without that, denies only dent
  gold nobody spends.
- **Shop presentation:** show gold earned this round, last-hit accuracy, and
  the bot's build before the next round.
- **Hero choice per run:** pick at the start of a run; maybe unlock heroes
  across runs.
- **D: a shield everyone gets** 💡 ⏰ REMIND THE USER (user, 2026-10-01: "add a D
  everyone gets gives a shield (remind me later about that)"). A fifth key,
  the same on every hero (like a summoner spell), that grants a short damage
  shield. To decide: shield size (flat or % max health), duration, cooldown,
  whether it levels or shop cards touch it, and whether the bot uses it.
  D is free (leash moved G → T the same day).
- **Round-win gold** 💡 (user asked 2026-10-01 whether winning a round pays):
  it doesn't yet — you keep what you farmed, red gets a per-shop allowance
  (RED_ALLOWANCE + STEP × round). Ties into the farming-vs-ending problem
  (QA point 4): a win bonus that shrinks the longer the round ran would
  reward pushing.
- **No guaranteed gold floor** ❌ (user, 2026-10-01: "no guaranteed floor
  please"). Income comes from the lane only. Red's allowance was removed the
  same day; to fix how tight the economy is, use creep gold (and prices if needed).

---

## 4b. Versus mode — leave room for it 💡 (D12)

**Not being built.** The game is a one-player roguelite. Versus (live
player-vs-player) is a mode it might grow later, so phase 1 decisions
shouldn't close that door. If it happens, it swaps the bot's seat for a real
opponent.

### Why it fits
The enemy bot already plays by exactly your rules: it's a hero, last-hits
for gold, and (per 4.3) could shop from the same pool. Versus puts a real
player in that seat.

### Shape (working sketch)
- **1v1 lane duel:** both players farm, last-hit and trade on the same lane;
  rounds end when a tower falls; **shop between rounds**; first to win N
  rounds takes the match.
- **Last hitting becomes a direct fight over gold.** Every creep you secure
  is gold the opponent doesn't get, so **denying** (4.6) becomes a core
  mechanic.
- The tower rule (D5) keeps it honest: hitting a hero under their tower
  draws the tower onto you.

### Other multiplayer shapes (for reference)
- **Async ghost PvP:** face a snapshot of another player's build at the
  same round, piloted by the bot brain (the *Super Auto Pets* model).
  Cheaper, no live netcode. Could still serve as an offline or practice
  mode.
- **Lobby format (TFT-style):** 4–8 players, paired each round, health lost
  per defeat, last player standing.

### The big design tension: randomness vs fairness
Random shop rolls feel great solo, but in PvP "your shop rolled Midas and
mine didn't" stings. The single-player shop gets designed for single
player, but in a way these options could still be layered on later:
- **Mirrored offers:** both players see the same cards each round.
- **Shared pool:** what I buy leaves the pool for you (TFT-style).
- **Rerolls as the equalizer.**
- **Seeded shops:** the same seed per match, so rolls are fair by
  construction.

### What it would cost (if it's ever built)
- Real-time netcode: Godot high-level multiplayer (ENet, or WebRTC for the
  browser); server-authoritative or host-authoritative simulation.
- A lobby or matchmaking, plus a server or peer-to-peer relay.
- Hiding latency (client-side prediction for your own hero's movement),
  stopping cheating, handling reconnects.

### Keep the door open while building the roguelite (cheap, do these now)
- **Everything is driven by orders.** Mouse and bot both call `order_move` /
  `order_attack` / `cast`; those orders are exactly what a network client
  would send. Never let input reach into the simulation any other way.
- **Seed all randomness:** shop rolls, map generation, bot choices, aim
  error. That's needed for fair mirrored shops and synced games.
- **Serializable match state:** hero, upgrades, gold, round, and eventually
  map seed.
- **Keep simulation and presentation apart** (effects and HUD read state,
  and never decide outcomes).
- Don't build netcode yet; just avoid decisions that would block it.

---

## 8. Balancing — keep it easy (D15)

**The rule:** every number someone might want to tune lives in a data table
near the top of a file, never inline in logic. Adding a card, changing a
price or reshaping the curve should be a one-line data edit.

Where the numbers live today:

| What | Where |
|---|---|
| Hero stats, attacks, abilities, ability levels | `scripts/heroes.gd` `LIST` (`levels` under each ability), `MAX_LEVEL` |
| Ability level prices | `scripts/upgrades.gd` `LEVEL_PRICES`, `R_MULT` |
| Upgrade cards: effect, tier | `scripts/upgrades.gd` `LIST` |
| Tier prices, offers per tier | `scripts/upgrades.gd` `TIERS`, `OFFERS_PER_TIER` |
| Rounds, reroll cost | `scripts/run.gd` `ROUNDS` (table length), `REROLL_COST`, `REROLL_STEP` |
| Red's economy | `scripts/run.gd` `RED_ALLOWANCE`, `RED_ALLOWANCE_STEP`, `RED_LEVEL_CHANCE` |
| Endless growth | `scripts/run.gd` `ENDLESS_GROWTH`, `ENDLESS_SHARPEN`, `CAST_GAP_FLOOR`, `AIM_ERROR_FLOOR`, `TRADE_FLOOR` |
| Deny threshold | `scripts/unit.gd` `DENY_BELOW` |
| Damage by target type | `scripts/unit.gd` `ABILITY_VS_HEROES / _CREEPS / _STRUCTURES`, `ATTACK_VS_STRUCTURES`, `AOE_LIFESTEAL`; per ability: `vs_heroes / vs_creeps / vs_structures` in `heroes.gd` |
| Bot-only hero stats | `scripts/heroes.gd` → each hero's `bot` block (overrides stats, `attack`, per-ability fields) |
| Difficulty curve per round | `scripts/run.gd` `DIFFICULTY` |
| Creep stats and bounties | `scripts/creep.gd` `KINDS` |
| Tower stats | constants at the top of `scripts/tower.gd` |
| Waves, base heal, overtime | constants at the top of `scripts/lane.gd` (`OVERTIME` table) |
| Bot behaviour | constants at the top of `scripts/bot.gd` (full-strength values; the curve scales them) |
| Hero respawn, regen, bounty | constants at the top of `scripts/hero.gd` |

**Autoplay (built):** `tools\autoplay.cmd --runs N` plays full runs bot
vs bot, headless and fast, and reports per-round win rates, round length,
gold, last hits and deaths, completion by hero, and upgrade pick rates.
Seeded, so a balance change can be judged on the same runs. Shop policies
(`greedy`, `epic`, `random`, `none`) compare strategies; `none` is the
baseline for how much the shop matters. See the README for the options.
Limits: it measures a bot playing, not how it *feels*; bot skill isn't
human skill, so treat the numbers as relative (before vs after a change),
not absolute.

### Autoplay findings — first batches (2026-09-29)
20 runs, seed 1000, heroes cycled, 10-minute round cap. 12 runs with
`greedy` shopping, 8 with `none` (no upgrades):

| | R1 | R2 | R3 | R4 | R5 | Runs complete |
|---|---|---|---|---|---|---|
| greedy: won | 100% (1:26) | 100% (3:24) | 50% | 50% | 67% | **2 / 12** |
| none: won | 100% (1:25) | 100% (3:40) | 25% | 0% | — | **0 / 8** |

1. **Round 1 is easy, as intended (D14).** Won every time in about 1½
   minutes. But it's so short that you only get ~4 last hits (~300 gold),
   so the first shop buys 1–3 commons at most.
2. **The shop matters.** With upgrades, round 3 wins double (25% → 50%) and
   runs can be completed; without them, none are.
3. **Nobody ever *lost* a round in 20 runs.** Every failed run was a
   10-minute **stalemate** from round 3 on. Waves near parity cancel out,
   towers clean up, and last-hit-disciplined bots don't force a push. Your
   tower essentially never falls, so the run has no real losing threat;
   difficulty shows up as rounds dragging on, not as defeat.
4. **Gold snowballs late.** Long rounds plus Bounty Hunter / Midas mean 3–9k
   gold per round by R4–R5, and one completed run bought 23 upgrades.
   Prices are flat, so late shops run out of meaningful choices.
5. Too few runs yet to judge heroes (KAREN and BECKY completed one each,
   KYLE and CHAD none) or individual cards.

Caveat: this is bots playing. A human pushes harder than a last-hitting bot,
so the stalemates may be partly bot passivity. But the missing losing threat
(point 3) is structural.

Possible answers (to decide, not built):
- **Round pressure:** waves grow over the round (an extra creep every few
  waves, or siege / super creeps after N minutes), towers weaken over time,
  or sudden death after a time limit. Any of these ends stalemates and lets
  red actually win.
- **Gold sinks:** ability levels (D16) as a sink, tier prices that rise per
  round, a higher tier, or diminishing returns on economy cards.
- **Autoplay:** give your seat's bot a pushing style, so the harness
  separates "the lane stalls" from "the bot is passive".

### Autoplay after overtime (D18) — same seed, same 12 greedy runs

| | R1 | R2 | R3 | R4 | R5 | Complete | Timeouts | Losses |
|---|---|---|---|---|---|---|---|---|
| before overtime | 100% | 100% | 50% | 50% | 67% | 2 / 12 | 10 | 0 |
| **with overtime** | 100% (1:26) | 100% (2:52) | 100% (5:35) | 92% (6:25) | 73% (4:57) | **8 / 12** | **1** | **3** (all R5) |

- **Stalemates are gone** (10 → 1), and **runs can be lost**: 3 lost in round
  5.
- **The difficulty curve now reads as a curve:** 100 → 100 → 100 → 92 →
  73%. Round 5 is the real test, as intended.
- **Rounds run 1½ to 6½ minutes**, a reasonable length.
- **Hero hint (small sample):** KAREN 3/3 and BECKY 3/3 completed;
  KYLE 1/3 and CHAD 1/3. Worth a bigger per-hero batch
  (`--hero 0` etc.) before touching numbers.
- The one timeout (run 1, KYLE, round 4) lasted the full 15 minutes with
  158 last hits: a hold that needs a look (does the extra-melee cap let a
  well-defended lane last forever? maybe towers should keep weakening past
  the cap, or a sudden-death end).
- Epics dominate the "completed runs" pick list only because `greedy`
  always buys the priciest card; compare policies before judging cards.

### 30-run simulation (2026-09-29) — seeds 2000 / 3000 / 4000

10 runs each of `greedy`, `random` and `levels` shopping, heroes cycled.
Combine with `python tools/combine_reports.py <folder>`.

| | R1 | R2 | R3 | R4 | R5 | Complete |
|---|---|---|---|---|---|---|
| won | 100% (1:13) | 100% (2:44) | 90% (6:21) | 89% (6:41) | 83% (5:22) | **20 / 30 (67%)** |

Findings (directional; samples are small):
1. **The curve is healthy.** Rounds 1–2 are always won and quick, and
   rounds 3–5 bite (83–90%). Endings: 4 lost in R5, 3 in R4, 1 in R3,
   2 timeouts in R3.
2. **CHAD is weak:** 2/9 runs completed, and 7 of the 10 failed runs
   were CHAD. As the enemy bot, CHAD also loses every round
   (you won 31/31). KYLE 9/9 and KAREN 6/6 completed; BECKY 3/6.
   Caveat: melee may suffer most from the bot's cautious last-hit AI, so a
   human CHAD may do better, but the signal is consistent both ways.
3. **BECKY is the most dangerous opponent:** 6 of the 10 failed runs were
   against an BECKY bot (you won 85% of rounds vs BECKY, 94–100% vs the
   rest). Its long-range poke (520 attack, 1100 Lance) punishes melee.
4. **Ability levels matter:** runs finishing with 7–8 levels completed 83%,
   1–3 levels 43% (partly because longer runs buy more).
5. **Economy cards underperform** in a 5-round run: owning Bounty Hunter or
   Midas going into R4 → 60% completion, below the 67% baseline. "Invest
   now, win later" doesn't have time to pay off.
6. **Defensive commons are weak:** Salve 57%, Focus 57%, Vigor 67%.
   Strongest: Overcharge, Colossus, Executioner, Arcane Edge, Echo, Twin
   Shot, Haste, Whetstone. **Siphon** (new) is about neutral: 62% overall,
   80% in random runs, which equals that batch's baseline.
7. **Hero fights are rare:** about 0–0.7 deaths per round. Laning is
   mostly creep-vs-creep; the bots seldom trade to the death.
8. **Snowball still there** (P7): R5 averages ~3.9k gold, and one run owned
   19 upgrades.
9. Policies: random 80%, greedy 60%, levels 60% (n = 10 each, so mostly
   noise).

Tweaks — **applied 2026-09-29** (user: "just apply the tweaks and i will play"):
- CHAD: hp 800 → 900, attack damage 40 → 45, Fan damage 45 → 55.
- Economy: Bounty Hunter +15 → +25 gold per last hit.
- Commons: Salve +4 → +6 regen, Focus +100 → +150 mana, Vigor +150 → +200.
- BECKY: watch; if it stays the top threat, Lance range 1100 → 1000.
- Then re-run the same seeds (2000 / 3000 / 4000) for a before/after.

### First human run (play log, 2026-09-29) — KYLE, run complete

| | R1 | R2 | R3 | R4 | R5 |
|---|---|---|---|---|---|
| vs bot | KAREN | BECKY | CHAD | KYLE | KYLE |
| time | 1:56 | 3:58 | 6:56 | 5:02 | 2:08 |
| gold | 295 | 1095 | 2215 | 2440 | 1550 |
| last hits / missed | 7 / 7 (50%) | 10 / 18 (36%) | 45 / 10 (82%) | 41 / 4 (91%) | 16 / 0 (100%) |
| deaths (bot / tower) | 0 | 5 (4 / 1) | 5 (4 / 1) | 3 (1 / 2) | 1 (0 / 1) |

1. **Won every round, but died 14 times** (9 to the bot, 5 to towers).
   Bots in bot-vs-bot die about 0.5 times a round, so the red bot is much
   deadlier against a human, especially BECKY in R2 (4 kills) and the
   CHAD in R3 (4 kills), even though those rounds are meant to be easy.
2. **Your tower never took damage** in any round (100% every time). Deaths
   cost time and gold but never threatened the round, so the losing threat
   is still weak for a human who pushes.
3. **Last hitting jumped after Executioner** (bought after R2): 36% → 82%
   → 91% → 100%. Splash (Blast) plus Dash plus execute turns near-dead
   creeps into your gold, so the combination looks strong for the economy.
4. **Snowball confirmed:** the R4 shop had 2965 gold and bought 9 things
   (3 epics). R5 was over in 2:08.
5. **Tower dives:** 20–33 s per round inside the enemy tower's range, and 5
   tower deaths, mostly chasing at low health.
6. Build: KYLE all run (no hero swaps); levels Q III, W III, R II,
   E II, with Q and W levelled first; spent nearly everything every shop.

### Second human run (play log, 2026-09-30) — red shops; lost R4

| | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| vs bot | KAREN | BECKY | KYLE | KAREN |
| outcome / time | won 3:33 | won 4:43 | won 9:27 | **lost** 7:30 |
| gold | 865 | 1060 | 4210 | 10020 |
| last hits / missed / denies | 10 / 13 / 3 | 15 / 18 / 0 | 95 / 6 / 13 | 73 / 6 / 7 |
| deaths | 2 | 6 | 11 | 10 |
| bot last hits / denies | 3 / 0 | 12 / 0 | 61 / 6 | 67 / 6 |

1. **Runs can be lost now:** a close R4 loss (your tower 0; theirs at 16%).
2. **Red snowballed through its own economy cards:** it bought Midas in
   R2 and Bounty Hunter in R3. After the R3 shop it had **all four
   abilities at III, 14 upgrades and 1855 gold left over** (it ran out of
   things to buy), against your Q II / W III / E II / R II.
3. **Stacked ultimates hit enormously:** KAREN bot's Quake (level III,
   4 pulses) with Overcharge (+30% damage), Arcane Edge and the round's
   stat multiplier showed ~420 per pulse. Most R4 deaths were Charge + Quake.
4. **Deaths climbed:** 2 → 6 → 11 → 10 per round (29 total), almost all
   to the bot.
5. **You're using denying:** 23 denies (13 in R3); the bot denied 12.
6. **Rounds ran long:** 9:27 and 7:30, even with overtime.
7. The short run at 23:44 ended in R1 (killed by a creep at 1:10, then
   quit).

Suggested fixes (not applied):
- **Keep economy cards out of red's shop** (Midas, Bounty Hunter, maybe
  Siphon), or count only part of its bot's gold as income, so red's income
  is its allowance plus modest farm.
- **Make the difficulty table skill-only from R3** (drop the stat
  multipliers now that red builds), so red's power comes from its shop.
- **Tone down ultimate stacking:** Overcharge's +30% damage compounds on
  multi-pulse ults (Quake, Flurry, Meteors); maybe make Overcharge
  cooldown-only, or apply its damage bonus to the first pulse only.

### A/B test of the three suggested fixes (2026-09-30) — 30 + 30 games, same seeds

Base = today's game; fixes = red skips economy cards + bot stats 1.0 from R3
+ Overcharge cooldown-only (switches exist for autoplay only: `--variant`).

| | R3 won | R4 won | R5 won | avg round reached |
|---|---|---|---|---|
| base | 90% | 48% | 38% | **4.6** |
| fixes | 70% | 24% | 20% | **3.9** |

Paired by seed, fixes went less far in 12 runs and further in 2 (16 the
same). **The bundle is not supported.**
- **No economy cards made red stronger.** Base red spends 600 / 250 on
  Midas / Bounty Hunter instead of power, then runs out of offers and
  hoards gold it can't spend (~2000 after R4, 10k+ by R6). Without them,
  red buys combat power at once (R4 build 10.6 vs 9.4; 46 gold left).
- **"Bot stats 1.0 from R3" was a flawed variant:** R3's table value is 0.9,
  so it buffed R3 (90% → 70%) and only nerfed from R5. It needs a
  single-variable retest (for example, a cap at 1.0 only from R5).
- **Overcharge couldn't be isolated** in a bundle; retest it alone.
- The curve itself reads well: 100 / 100 / 90 / 48 / 38%. CHAD is still
  the weakest (3.8 avg reached vs BECKY 5.3).
- **Bots barely kill each other** (1–2 deaths per round), while the human
  run saw ~10 per round late on. Autoplay underestimates how hard late
  rounds are for a human, so human play logs matter more for that.
- Red's unspendable hoard is harmless today, but more things for red to buy
  (creep upgrades 4.3c, a wider shop) would make late red gold count.

### Human runs 3 and 4 (play log, 2026-09-30) — both turn in R3, R4 lost

| run | R1 | R2 | R3 | R4 |
|---|---|---|---|---|
| 16:48 | won 3:07 | won 3:30 | won **13:29**, 17 deaths | (quit) |
| 20:31 | won 3:01 | won 2:35 | won **9:04**, 10 deaths | **lost** 6:43 (your tower 0, theirs 91%) |

Pattern across all four human runs: R1–R2 are fine, **R3 is a long slog
with 10–17 deaths** (13 per run to the bot), and R4 is lost.
1. **The bot out-farms and denies you from R3** (its denying switches on
   there): bot last hits / denies 54 / 14, 54 / 22, 61 / 20 per round,
   while your **missed** last hits jump to 36–93 (its denies near you count
   as your misses). That economic swing feeds red's shop.
2. **Red outbuilt you by R4:** abilities at II–III plus 7 upgrades (Midas,
   Echo, Overcharge, Twin Shot, Tank Minion…) against your 6 upgrades at
   level I. You bought **no ability levels** in the 20:31 run, which sims
   say matter a lot.
3. **Red's early Healing Aura** (bought after R1 in the 16:48 run) likely
   helped make R3 a 13-minute slog: its waves out-sustain yours.
4. Tooling fix: the play-log run summary now updates build and levels
   after every round (it only did at run end, so quit runs showed stale
   levels).

Ideas (not applied): bot denying from R5 (or a deny chance per
opportunity); delay red's wave cards a couple of rounds; make the shop's
ability row more prominent.

### First outside playtest (a friend, 2026-09-30) — BECKY all run, reached round 15

The play log didn't save, so this is from chat. An experienced player:
twice the user's best (R7).
**Bugs and problems**
- **No play log saved** although it was switched on. Likely cause: the exe
  was run from inside the zip (Windows runs it from a temp folder, so
  `playlogs` beside the exe vanished). Fix: save to
  Documents\MOBA Sandbox\playlogs, show the path in game, and add an
  "Open log folder" button.
- **No way to quit** from the hero-pick / run-over screens (Esc does
  nothing there), so they had to close the window with X. Add Quit there.
- "**Overtime didn't seem to work**" (a 5-min round in R13): probably
  working but too weak against high-round towers; consider making it
  stronger late or more visible.
- "**Bots heal twice as fast in base**": same rate, but the bot's Healing
  Aura (heals heroes) / Vampirism may stack; check.
**Balance**
- **KAREN (bot) too strong:** AoE too strong; "**heals back to full
  after 1 ability**" (likely Vampirism 12% on an AoE hitting a whole wave:
  lifesteal should count far less on AoE); **the ult shouldn't pulse**
  (guaranteed hits in a huge radius); "pick tanky or high damage, not
  both".
- **BECKY:** Lance now weak and doesn't scale; **Meteors carry** (wave
  clear, up to half a tower with luck); strong early, scales worse than
  CHAD / KAREN.
- **Creep hp too high vs auto-attacks:** last hitting is plinking until
  Executioner; AoE wave clear beats auto-attacks; "until wave 10, clearing
  waves asap was all that was needed". AoE clear bypasses the
  last-hit-as-skill core.
- **Creep upgrades barely mattered:** extra creeps die to AoE, the tank stun
  was weak, the heal too small (idea: a shield pulse).
- **Bots escape too easily** ("super quick to blink out"; ~5 kills total);
  **everyone having blink is annoying**; CHAD's double blink is a bad
  placeholder.
- Started dying only around R8, when the bot could one-shot them.
**Design ideas**
- **Ability draft:** level up and choose 1 of 3 (the game pauses) instead
  of fixed kits.
- **Separate base stats for the bot and the player per hero**, so tuning
  one doesn't hit both.
- **Minimap click to move the camera** (we made it click-through).
- More CC, more defined hero roles.
**Correction:** leading creeps into a jungle camp ("pulling") is a known
Dota technique, so leashing has a Dota cousin; the follow command with leash
points is the new twist.
Suggested order: fix the log location + Quit on the pick / end screens;
cap lifesteal on AoE; then the kits pass (KAREN first) with this
feedback in mind.

Next steps when balancing gets serious:
- Gather everything into **one balance file** (or a JSON / `.tres`
  resource), so tuning never means opening gameplay scripts, and maybe a
  live-reload or an in-editor table.
- A **debug overlay** showing damage dealt and taken per round, gold per
  minute and last-hit percentage, so tuning is based on numbers, not feel.
  (Autoplay covers the batch version of this.)
- Autoplay extras: several bot skill levels for your seat, CSV export,
  comparing two JSON reports side by side.
- Keep each upgrade effect a **generic mod key** (`mod("<key>")`), so new
  cards reuse effects instead of adding code.

---

## 5. Open questions

| # | Question | Notes |
|---|---|---|
| Q1 | ~~Where does the shop sit?~~ | **Answered, D9:** between rounds |
| Q2 | What does "more gold, better upgrades" mean mechanically? | **Built as (a) priced tiers** (D13). Still open: add (b) gold-scaled offers on top? |
| Q3 | Does unspent gold carry over between rounds? | **Built: yes** (D13), changeable |
| Q4 | Roguelike or roguelite? Is losing a round the end, and is there meta progression across runs? | **Built: losing ends the run**; no meta progression yet |
| Q5 | Is the hero fixed per run, or drafted / swapped between rounds? | **Built: pick per round, free** (D17). Open: should swapping cost gold, or offer only 2–3 heroes? |
| Q6 | How many rounds is a run, and what's the finale? | **Built: 5 rounds**; no special finale yet |
| Q7 | How long should a round be? | Currently a round ends only when a tower falls (3000 HP), so several minutes |
| Q8 | Does the bot shop from the same pool? (4.3) | |
| Q9 | How do maps escalate: obstacles first, or more lanes? (4.5) | |
| Q10 | *(if Versus happens)* Match format: best of 3 / 5 rounds? Each round on a fresh lane? | 4b |
| Q11 | *(if Versus happens)* Shop fairness: mirrored offers, a shared pool, a seeded shop, or reroll-only? The solo shop just needs to keep these possible | 4b |
| Q12 | *(if Versus happens)* Networking: host-authoritative peer-to-peer, or a dedicated server? Browser (WebRTC) or desktop only? | 4b |
| Q14 | Ability levels (D16): max level? Which tier and price are letter cards? Do R levels cost more? Mixed with stat cards or a separate row? | **Built:** max III; own always-on row; II 200 / III 450; R ×1.4. All changeable |
| Q13 | *(if Versus happens)* Maps must be symmetric or mirrored to be fair; solo generation can ignore this for now | 4.5 + 4b |

---

## 6. Parked / known issues

| # | Item |
|---|---|
| P1 | Creeps don't aggro when you hit their creeps (Dota draws aggro only on hero-on-hero hits; we follow that) |
| P2 | The bot's spell hits on your creeps show damage numbers, which is a bit busy |
| P3 | ~~Hero switching gives full health in lane mode~~ fixed: locked during runs |
| P4 | Tower HP 3000 makes rounds long; tune once rounds exist |
| P6 | ~~Autoplay: rounds stalemate from round 3 and red never wins~~ fixed by overtime (D18): timeouts 10 → 1, runs now lost in R5 |
| P8 | One autoplay round still ran the full 15 min in overtime (KYLE R4): check whether a well-defended lane can outlast the extra-melee cap |
| P9 | Possible hero imbalance: KYLE and CHAD 1/3 completed vs KAREN and BECKY 3/3 (12 runs; confirm with per-hero batches) |
| P7 | Autoplay: late-game gold snowballs (flat prices + economy cards); needs sinks or rising prices |
| P5 | An occasional engine error from a sliver-thin cooldown-sweep polygon; guarded, but never reproduced |

---

## 7. History

How the sandbox got here (earliest first):

1. A blank, obstacle-free map; a circle hero with Dota / HotS movement and
   QWER abilities.
2. Training dummies with damage numbers.
3. Left-click attack-move, corrected to target the enemy **closest to the
   cursor**.
4. Mana costs, a mana bar, and three more heroes (triangle, square,
   hexagon).
5. A free camera with edge panning; collision so units block each other.
6. Right-click made a true **force move**.
7. Fullscreen; lane mode with creep waves and a tower at each end; hero
   health, death and respawn; dummies kept as Training mode.
8. An enemy hero bot; the tower / creep aggro rule; leisurely minions.
9. Gold and last hitting; the **roguelite direction**, a shop between
   rounds, and procedural maps logged (2026-09-29).
10. **Versus** logged as a possible later mode to leave room for (live 1v1),
    not a planned phase; the game is a one-player roguelite (2026-09-29).
19. **Training shortcuts** (D21): an opening-screen button into Training, and
    a No cooldowns switch there (2026-09-29).
22. **Red shopping, endless runs and denying built** (D22–D24), with
    autoplay capped by `--max-rounds` (2026-09-30).
21. **Bolt range halved** (user): 900 → 450 (2026-09-29).
20. **Bolt tuned** (user): the travelling dot is small (24 px, twice an
    auto-attack shot) with no blast ring following it; the blast is half the
    size (radius 80, 95 at level II); unreactivated, it now **explodes at
    the end of its line** instead of fizzling (2026-09-29).
18. **KYLE's Bolt reworked** into a recast orb (D20): the dot flies out
    harmlessly, press Q again to detonate; levels I–III 80 / 110 / 140
    damage, radius 160 / 185, cooldown 5 → 4 s; the bot uses it too
    (2026-09-29).
17. **Play log** built (D19): records human runs (events, missed last hits,
    deaths, shop decisions, snapshots, screenshots) behind a switch, dev
    builds only; a separate playtest export carries it (2026-09-29).
16. **Overtime** built (D18): towers weaken and waves grow from 3:00, so
    stalled rounds end and runs can be lost (2026-09-29).
15. **Ability levels and hero pick between rounds built** (D16, D17): levels
    I–III for all 16 abilities, the Abilities and Hero rows in the shop, next
    opponent shown, levels carry across heroes (2026-09-29).
14. **Ability levels bought by letter** logged as the direction for ability
    upgrades (D16), chosen with Versus in mind (2026-09-29).
13. **Autoplay harness** built (`tools/autoplay.gd`): bot-vs-bot full runs,
    headless, seeded, with a balance report. Bots now siege a tower their
    creeps are tanking (for red, off in rounds 1–2 via `bot_siege`)
    (2026-09-29).
12. **Difficulty curve** built: red nerfed in round 1, ramping to a real test
    by round 5 (D14). **Balanceability** made a standing rule, and shop
    content families logged (D15) (2026-09-29).
11. **Round structure and shop built** (D13): hero pick, 5 rounds, priced-tier
    shop with reroll, the full upgrade catalogue, run over / complete,
    scaling per round, seeded and serializable run state (2026-09-29).

## Stuns that interrupt (2026-10-04, later)

GRIND is unstoppable for now (only KAREN's own SHOVE ends it). Later: let
stuns cut channelled / ongoing abilities short — GRIND, SHADE's windup
(already), maybe RAGE's contact — and build stuns into more kits that way, so
a stun becomes the answer to a spinning KAREN.

## The shape camp — sieging by proxy (2026-10-05, planned)

From round 11 each side gets a shape (name TBD) on its own half, ~450 px off
the lane between the middle and its tower. It never aggros on its own and only
creeps can hurt it (heroes and abilities can't — maybe later "hero attacks
only while your creeps are on it", the tower-shield rule); it hits each creep
touching it lightly (~15/s) so they slowly die. You leash creeps (T) to it and
direct them by "attacking" it. Its bar reads as a power meter filling up (both
sides can see it); a kill sends 2 siege minions with your next wave (10% of
the enemy tower each, unstoppable), and a new shape appears ~45 s later.
Health: ~75 s for 2 leashed melee. Contested: the enemy hero may kill your
creeps at it. A new playstyle — siege from safety at the cost of lane pressure;
suits BECKY / KYLE; builds: Command, Rally Cry, Reinforcement, Pathfinders.
Bot v1: farms its own (pusher / farmer keenest, sticky lane-vs-shape choice,
never while your wave threatens its tower) and contests yours past 50%.

**Built 2026-10-07 (totem.gd, bot v1; see BALANCE.md):** latching is automatic — lead a creep into the ring and it latches (user: "lead one close and it latches"), leaving your leash; it attacks only the totem. Placed well off the lane (y 560 vs the lane edge at 280) so it isn't confused with the lane. Leash intents steps 1–3 are in (key runs, led creeps as targets, totem trips + contest); backup and leash-card tags are next. **The reward is swappable** (user, 2026-10-07): a totem carries reward data `{"kind": …}`; lane.gd TOTEM_REWARDS maps each kind to the function that pays it and its puff text, TOTEM_REWARD is today's (2 siege minions), and `totem_reward_for(team)` is the one place to vary it by round, side or card. New type = one TOTEM_REWARDS entry + one function (then update How to Play's totem line). **Cards that modify the reward (user, 2026-10-07: "a card could modify the reward to a better minion"):** totem_reward_for reads the side's cards. Directions: upgrade (one heavy siege minion for ~25% instead of 2 × 10% — a "heavy_siege" kind + a siege_minion.gd variant), add (a tank creep joins the next wave — a bonus creep, so no gold), change (a short buff to the next wave, or a quicker respawn), scale (+1 siege minion per copy, capped). Wave / epic tier beside Command and Rally Cry — a real minion build around the totem, and the hook for a "minion run" red strategy.

**Update 2026-10-06 — timing, and leashing as the late skill.** (The user calls
it the totem.)
- **From round 6, not 11.** The average run reaches ~6 and the best runs 11–12,
  so at 11 most players never see it, and it would land on the wall (red's
  ramp from 12, skill sharpening from 10). Round 6 is roughly where late towers
  start holding (tower damage vs creeps now grows with the round) and rounds
  start reaching overtime — a second way to siege arrives just as it's needed,
  with 5–6 rounds of practice before the wall. Fallback: round 8 (overtime
  start hits its 300 s cap there) if round 6 gets too busy.
- **In-round timing:** first totem at ~1:30 (after the opening waves settle,
  no race to it); a kill takes ~75 s, so its 2 siege minions arrive ~3:00–3:30,
  before overtime (4:30–5:00 from round 6) — a pre-overtime play that sets up
  overtime. Respawns 45 s after a kill: a dedicated player gets ~2 kills.
- **Red eases in:** rounds 6–9 it farms its own (pusher / farmer only); from
  round 10 it contests yours past 50% and any red with leash cards uses it.
- **Check when built:** keep time-to-kill ~75 s at every round (if its health
  grows with the round, leashed creeps' damage must keep up); decide on purpose
  whether red's late ramp (sturdier red creeps) speeds red's totem.
- **Leashing becomes the core late skill:** three uses compete for the same
  leash points — *key* (open a tower's shield now; the creep dies under the
  tower), *totem* (fill the meter: 20% of a tower later, lane pressure lost
  now), *backup* (extra damage in a fight). That three-way choice is the late
  decision; the bot should be built around it from the start (see the leash
  intents below).
- **Leash cards change meaning:** Command and Rally Cry go from niche to core
  late — revisit price / caps once the totem exists.
- **UI:** a small destination marker on leash lines (tower / totem / follow)
  so you can read red's intent and tell your own creeps apart. It shows what
  red is doing now, not its personality (black-box rule holds).

## Bonus creeps pay no gold (2026-10-06; BUILT 2026-10-07 as bounty 0 + grey "no" slash — the per-wave cap below was not built)

User: creeps that come from bonuses shouldn't give gold, "so we aren't just
letting them farm". Today every bonus creep pays its full bounty to whoever
last-hits it: Reinforcement (+1 melee a copy, up to 3), Tank Minion (70),
red's late extras (+1 melee from round 15). (Overtime's extras already pay
nothing — no kill pays in overtime — and risen Recruit creeps are worth no gold.)
So buying Reinforcement ×3 hands your opponent three extra 40-gold last hits
every wave, and red's late extras feed you.
- Build: bounty 0 on creeps a wave gets from cards or red's late extras (lane.gd
  spawn_wave knows which they are).
- Needs a visual tell so nobody wastes a last hit — e.g. a paler body or no
  gold glint; one look, same on both sides.
- Bots: farm / last-hit logic skips zero-bounty creeps for gold (still kills
  them to push); deny logic ignores them (nothing to deny).
- Knock-ons: Reinforcement and Tank Minion become pure pressure — re-check their
  prices; Clean Finish / Bounty Hunter / Executioner pay nothing on them.
- **Alternative (recommended, 2026-10-06): a gold cap per wave.** User: "a way
  to identify creeps you will not get gold from, or something like a max gold
  per wave". Each wave pays at most a normal wave's worth (3 melee + 1 ranged);
  every creep pays as usual until that wave's budget is spent, the rest pay
  nothing. No creep to tell apart, so last-hitting stays about timing, not
  identification; bonus creeps (Reinforcement, Tank Minion, red's late extras)
  can never feed anyone past a normal wave. Cap by gold, not kill count (a tank
  spends more of the budget). Card bonuses (Clean Finish, Bounty Hunter) sit
  outside the cap: only creeps' own bounty is capped. Cue: an over-cap last hit
  shows a grey "0" ("wave paid") so it never reads as a bug. Red's farm step can
  skip a paid-out wave's creeps (a sharp player would). Overtime unchanged (no
  kill pays). The visual-tell version above stays the fallback.
- **Visual cue (user, 2026-10-06: "like a visual cue"):** creeps that will pay
  carry a small gold pip by their health bar (gold = money, per the cue
  standard); when a wave's budget runs out its remaining creeps lose the pip
  live, so you see the moment it stops paying (the grey "0" only confirms).
  Same cue under the no-gold-bonus-creeps rule (bonus creeps never get one).
  In overtime every pip goes (no kill pays), matching the greyed tower coin.
  Subtle: a dot, not a glow — late-round screens are busy.
- **User's pick for the cue (2026-10-07):** creeps that give no gold get a grey
  tint and a "no" slash through them (the ⃠ sign: a ring with a diagonal
  bar) — reads at a glance as "worth nothing". Use it for bonus creeps (or a
  paid-out wave's leftovers, under the cap), risen Recruit creeps, and every
  creep in overtime. Inverts the gold-pip idea: mark the exception, not the rule.

## Red's leashing — leash intents (2026-10-06, planned)

Today only the pusher leashes (`bot.gd _leash_nearby`, first in its order):
nearest free creep within 350 whenever it has points, no purpose, never
releases. The other personalities never leash. Since tower shields now stay up
in overtime (heroes always need a creep in range, leashed ones count), that
leaves leash pushes as the player's tool only.

**What leashing is for:** (1) key: a creep in range opens the shield; (2) tower
fire sponge: towers shoot creeps first — at round 10 a melee creep lasts ~4 s
under a tower, a tank (2 points) ~11 s (`TOWER_CREEP_SCALE` sets these
windows); doesn't help a dive (hitting a hero under its tower locks the tower
on you); (3) backup: leashed creeps attack what you attack (real with Rally
Cry / Command); (4) wave shaping: pull creeps out of a losing wave or away from
an enemy clear.

**Design: one leash intent, not a leash step.** Red holds an intent —
`none` / `key` / `totem` / `backup` — that owns its leashed creeps and decides
where they go. Sticky with a minimum hold (~3 s; the decision-loop lesson);
never drags creeps halfway to the totem, turns for the tower, turns back.
- **key** (sub-goal of siege): wants to siege, tower shielded, no friendly
  creep near it → grab the closest free creep (tank > melee > ranged), walk in
  behind it, spend burst on the tower in the window. Key dies and the shield
  returns → the existing shield check backs it off. Fetch distance short
  (~350) normally, longer in overtime or right after a kill (when a human
  grabs creeps and goes). The most important one.
- **backup** (sub-goal of trade / commit): only with leash cards — leash 1–2
  melee before engaging.
- **release on retreat:** today leashed creeps follow a retreating red home
  and are wasted; release them after its reaction delay.
- **totem:** fill its meter (bot v1 above).
- **Pusher** keeps eager leashing, but stops pulling creeps out of a wave
  that's already crashing the tower.
- **Scoring by value per leash point:** key = expected tower damage in the
  window; totem = (meter gained ÷ meter left) × 20% of a tower, discounted for
  delay and contest risk; backup = the fight's swing. Personality, build and
  the per-run red strategy are weights on this one function (a minion run
  favours totem, a brawl run backup), not separate code paths.
- **Owned cards switch it on:** any personality that buys Command or Rally Cry
  gains backup — the first concrete piece of the card tags → behaviour matrix.
- **Leashed creeps are high-value targets:** one target-priority rule (enemy
  leashed creeps worth more than lane creeps) covers both "kill the key creep"
  and "contest the totem" — for red's bot, and it's the player's counterplay.
- **Human mistakes, never stupid:** OK — a ranged when a melee was nearer, a
  late release, a slow fetch. Never — leash then walk in alone ahead of the
  creep, or leash while running away.
- **Debug:** `why` records `leash:key`, `leash:backup`, `leash:totem`,
  `unleash:retreat`; `--osc` counts leash toggles as turnarounds.
- **Risk:** past round 12 red's leashed creeps are ramped too, so its leash
  siege is stronger than yours late — the wall comes sooner.

**Order:** (1) intent framework with key + release on retreat (fixes the
overtime asymmetry now); (2) leashed creeps as high-value targets (both
bots); (3) totem + totem intent (bot v1); (4) backup + leash-card tags;
(5) per-run red strategies weighting the intents.

## Bot behaviour matrix: hero × personality × build (2026-10-05, roadmap)

Bot behaviour comes from hero (kit: ability targeting, wave-clear slots) ×
personality (temperament); its cards only steer shopping — a red with Command
and Rally Cry plays exactly like one with Arcane Edge and Overcharge. The long
look adds the build axis:
1. Tag each card by purpose — leash (Command, Rally Cry), siege (Siege
   Training, Sappers, Pathfinders, Siege Breaker), push (Reinforcement,
   Vanguard, Standard Bearer), fight (Arcane Edge, Serrated, Spellblade,
   Hunter's Mark), sustain (Vampirism, Salve, Second Wind), farm (Keen Eye,
   Clean Finish, Bounty Hunter).
2. The bot sums its tags and leans its decisions: leash-heavy → leashes more,
   farms its shape, sieges by proxy; siege-heavy → sieges earlier / deeper;
   fight-heavy → trades readier; farm-heavy → last hits first.
3. Red picks a strategy per run (seeded, hero-suited) and shops AND plays
   toward it — a "minion run" red buys leash / wave cards and plays the shape;
   a "brawl run" red buys fight cards and hunts you. Its panel then tells you
   what's coming.
Order: shape + bot v1 → card tags → per-run red strategies. (Leash intents, below the shape camp, slot in before the shape: see "Red's leashing".)


## The loop, from the metrics (2026-10-08, planned)

From the KYLE run (rounds 1–12, won 11): the **wave** decides rounds (wave
advantage positive in every win, negative in the loss; bigger = faster wins);
late rounds get **longer, not more intense** (5 min early → 8½–9½ by rounds
9 and 11; overtime starts 20 s later each round up to round 8); fights turn
against you from round 6 (damage ratio ~1.9 → ~0.45) and the wave carried you;
the loss was fair but **unreadable** (red led the wave ~2:1 for minutes, then
your tower went 50% → rubble in 10 s). Goal: a Dr. Mario loop — steady,
readable escalation you can always answer.
1. **Show the wave**: a small HUD bar (your creeps vs red's, or a lean arrow)
   and a plain warning when red's wave outnumbers yours 2:1.
2. **Escalate tempo, not length**: rounds stay ~5 min and each gets faster
   (waves 20 s → ~15 s, creeps a touch quicker); overtime starts about the same
   time every round.
3. **One new wrinkle per stage, announced** in the shop in one plain line
   (totems at 6, red contests at 10, the ramp at 12…).
4. **Smarter red totem play**: full leash loads, trips timed after its wave
   clears yours, contest from ~40% meter and from round 8, every personality
   from round 6 when the wave is even.
5. **Tune against the metrics** with autoplay targets (round length ~4–6 min,
   round win rate falling gradually, recoverable wave swings).
Order: 1 → 2 → 3 / 4; 5 throughout. Analysis: `/analyze-run`
(`tools/analyze_log.py`).

## Bosses / special maps (2026-10-09, idea)

User: "at some point maybe having bosses or special maps". Not designed yet.
Context: red's hero order is now a per-run shuffle of the four that repeats all
run (no hero twice in a row) — bosses or special maps could slot into that
cycle (e.g. every Nth round) as the stage markers of the north star's steady
escalation.
