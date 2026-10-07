# MOBA Sandbox

(Heading toward a roguelite built on MOBA laning — ideas are logged in
`IDEAS.md` and built as they firm up.)

A MOBA sandbox: a hero you control like Dota 2 / Heroes of the Storm, in
one of two modes. Godot 4.7, 2D, everything built in code.

Open `project.godot` in Godot and press F5. It starts **fullscreen** with
the mouse confined to the window, so the screen edges are always there for
edge panning (Alt+Tab still works).

## Modes (F9, or click the box top right)

| Mode | What |
|---|---|
| **Lane** (default) | **The roguelite run, endless:** rounds on a lane (a tower at each end, creep waves every 20 s, an enemy hero bot) until you lose one, with a shop between rounds; your best round is saved |
| **Training** | Five training dummies (they don't hit back), plus a practice lane: an enemy tower to the south-east (rebuilt 4 s after it falls) and creep waves for both sides every 25 s (`scripts/training_lane.gd`). Reach it from the hero-pick screen's **Training mode** button only. Top right, under the mode box: **No cooldowns** and **No mana** switches, and a free **Shop** (or B) to try any build (every card, ability levels I–III, Clear build). Training only |

## Controls

| Input | Action |
|---|---|
| Right-click | Force move there (hold to keep steering) — never attacks, even when clicking an enemy; cancels any attack |
| Left-click | Attack the enemy closest to the click (within 450 px), like Heroes of the Storm's A-click; with none near it, attack-move there — whatever comes within reach is picked by closeness to the click |
| S | Stop (also stops attacking) |
| 1 2 3 4 | Switch hero |
| Q W E R | **Quick cast** (default): cast at the cursor the moment the key goes down |
| …with **Cast indicator** on (Esc menu) | Hold to aim (range and targeting preview), release to cast, left-click casts now, right-click cancels |
| Esc | Pause: frees the mouse; Resume (Esc again), Restart / Abandon run, Quit |
| F9 | In Training: back to hero select (restarts). There's no way into Training from inside the game — only the hero-pick screen's button |
| Enter | Restart |
| F11 | Toggle fullscreen / window |

## Camera

Free camera, Dota-style: push the mouse against a screen edge (or use the
arrow keys) to pan; **Space** snaps to the hero (hold to keep following);
**Y** toggles a lock that follows the hero. Edge panning only runs while the
cursor is inside the window.

## The run (lane mode)

1. **Pick a hero** (click or 1–4). You can switch between rounds.
2. **Win the round** by destroying the enemy tower. Last hits are your gold.
3. **Shop:**
   - **Hero:** pick who you play next round (free). The **next opponent**
     is shown beside it.
   - **Abilities:** Q / W / E / R +1, always on offer. Levels I–III, and
     each card shows what the next level does for your current hero.
     Levels belong to the **letter**, so they carry over when you switch
     heroes. Level II costs 200, level III 450; R costs ×1.4.
   - **Upgrades:** three tiers, priced Common 100 · Rare 250 · Epic 600,
     with 3 offers each. Epics are one per run.
   - **Wave:** creep upgrades, 3 random offers a round like the tiers
     (each has its own price and max).
   - **Reroll** costs 50, +25 for every reroll so far this run (it never resets); **Next round** (or Enter) goes
     on. Unspent gold carries over.
4. **Overtime:** from 2:50 in round 1 (+20 s per round, up to 5:00), both
   towers take growing extra damage (+50% per minute), waves get bigger and
   **kills pay no gold**, so stalling to farm doesn't pay. The HUD counts
   down to it and greys the gold box once it starts.
5. **Red shops too:** only with what its bot earned (last hits, kills,
   gold it takes when it kills you) — no allowance. It buys upgrades and
   ability levels when your shop opens, and the next bot plays that build
   (shown as "Next opponent" in the shop).
6. **Endless:** there's no last round. Past round 5 red keeps getting
   stronger; the run ends when you lose a round.
7. **Denying:** your own creeps below half health get an amber outline.
   Click on one to attack it, and the killing blow pays nobody ("!"),
   so red can't spend that gold. The bot's deny odds rise each round.
8. **An even match:** red's hero, creeps and tower always have the same
   numbers as yours. Red ramps up in skill (aim, reaction, last-hit odds —
   past human level after round 10) and smartness (its decisions — a hidden
   personality per hero), and from round 15 its waves get extra creeps. See
   `BALANCE.md`. Lose any
   round and **the run is over**; New run (or Enter) starts again.
9. **Gold in and out:** creeps pay 1.5× their listed gold to the last hit,
   and **dying costs 15% of your gold** (at most 300) —
   to the enemy hero if it got the kill. Every pick raises all prices 8%.
10. **Leashing:** T with the cursor on one of your creeps (or, with Cast indicator on, T then click) — it follows you and
   attacks what you attack (2 leash points: melee 1, ranged / tank 2; the
   Command wave card adds more).

Your build shows top left during a round. The upgrade catalogue is in
`scripts/upgrades.gd`, run rules in `scripts/run.gd`.

## Lane mode

- **Bases (wells)** at x = ±2600 (you're blue, west). Standing in your own
  base heals 20% of health and mana per second and makes you invulnerable;
  an enemy hero in it burns for 25% of max health per second. Creeps lose
  interest in a hero who reaches its well.
- **Towers** at x = ±2000: 2,000 HP in round 1, growing each round at the
  average rate a player's damage grows (both towers alike; creep health,
  from 70%, grows the same way for both sides — see `BALANCE.md`),
  650 range, 110 damage every 1.1 s.
  **Shielded against heroes** (backdoor protection): a hero's attacks,
  abilities and burns only damage a tower while at least one of that hero's
  creeps (leashed ones count) is inside its range circle; otherwise the hit
  puffs "SHIELDED" and a shield plate shows round the tower. Creeps can
  always hit it. The shields stay up in overtime too: bring a creep (a leashed one works).
  Target rule, re-checked every shot:
  1. an enemy hero who just hit one of the tower's heroes in range (for 2 s
     after the hit): at once, over everything
  2. otherwise enemy creeps
  3. only with no creep in range, an enemy hero

  So walk in behind your wave and it's busy with creeps; hit its hero under
  it and it's you until the aggro wears off. Creeps follow the same rule
  (a hero that hits their hero becomes their first pick). The range ring
  appears as you get close and turns red while it's aiming at you.
- **Creep waves** leave each base every 20 s (the first after 3 s): 3 melee
  (550 HP, 21 damage) in front, 1 ranged (320 HP, 24 damage, 400 range)
  behind, walking at 240. They march to the enemy tower and fight whatever
  enemy comes within 460: creeps first, then a hero, then the tower.
- **Your hero has health now** (KYLE 700, CHAD 900, KAREN 1100,
  BECKY 650; regen 2/s). Hits on you show as red numbers. At 0 you respawn
  at your base after 6 s.
- Your abilities and attacks only hit enemies, never your own creeps.
  Creep-vs-creep and tower-vs-creep hits don't show damage numbers, which
  keeps the screen readable.
- **Gold and last hitting:** only the killing blow pays — in round 1 melee
  creep 24, ranged 33 (base 40 / 55 × `GOLD_MULT` 0.6) every round; enemy
  hero 120, growing each round with lane growth (a gold number pops up). See `BALANCE.md`.
  Creeps and towers finishing a creep earn nobody anything. On enemy creep
  health bars a white tick marks your attack damage, and the bar outlines
  white when one hit will kill. Gold and last hits sit right of the ability
  bar; the bot's last hits are in the top status line.
- Destroy the enemy tower for **Victory**; lose yours for **Defeat**.
  Waves stop and Enter plays again.
- The HUD's top centre shows both towers' health, the wave timer and
  kills / deaths against the bot.

### The enemy bot

A random hero (red ring, name tag) driven by `scripts/bot.gd`. It uses the
same kits, casting, collision and respawn as you. Each red hero plays a
hidden **personality** (brawler / farmer / pusher / opportunist — its
signature in `run.gd`) that reorders the list below and retunes its
thresholds, and gets **smarter** each round (thinks slower, blunders and
misses openings early on). Each tick it picks the first of these that applies
(the standard order):

1. **Retreat** below 30% health (after a hesitation early in a run): walk
   home, dropping its TRAP and using a dash or blink after its reaction
   time if you're close, and stay until healed to 90%.
2. **Back off** when your tower is shooting it.
3. **Abilities**, at most one per 1.1 s:
   - skillshots, beams and ground AoEs at you, led by your movement with a
     little aim error
   - shockwaves and cones when you're in reach
   - non-ultimates on clumps of 3+ creeps
   - dashes to finish you off (or to escape); KYLE also dashes
     through you while you stand in its IGNITE
4. **Trade:** auto-attack you when you're within 450 (more for long-range
   heroes), not under your tower, and it isn't behind on health.
5. **Farm (last hitting):** swing only at your creeps that are nearly dead
   (lowest first), so it doesn't push the wave; with none of its own creeps
   out it just defends.
6. **Hold:** stand behind its own front creep, or by its tower.

It never dives: spots under your tower count as unsafe unless creeps are
tanking.

Hero switching (1–4) is off during a run; it still works in Training.

## Collision

Towers and dummies are solid; heroes and creeps are soft bodies that shove
each other apart — except that your own creeps never push you: they step all
the way aside as you walk through your wave (the same for red; enemy creeps
still body-block). Walking into something slides you round it (creeps do the
same around towers); a dash stops at the first enemy it hits (still
damaging it — POUNCE ignores creeps, WRAITH passes through everything); a blink never leaves you inside anything; a move order onto a
tower or dummy stops at its edge.

## Heroes (1–4, or click the list top-left)

Switching is instant and resets mana and cooldowns. Kits live in
`scripts/heroes.gd`.

| # | Hero | Shape | Stats | Q | W | E | R |
|---|---|---|---|---|---|---|---|
| 1 | KYLE | circle | 360 speed · 500 mana · ranged 420 | SHOCK — a harmless dot flies out through units; press Q again to blow it up early, or it explodes at the end of its line | IGNITE — a lingering burn zone; the enemy nearest its centre takes the most | WRAITH — a spin, then a wobbling spirit dash through enemies: slows their attacks, and their movement if they're in your IGNITE | PUNISH — shockwave, full damage at the centre, half at the edge |
| 2 | CHAD | triangle | 400 speed · 500 mana · melee 150 | STARS — 3–5 barbed stars that cut through creeps | TRAP — spikes at your feet: slow, and your attacks +20% (bleed) on enemies inside; the last second whips round and cuts; 1–3 charges | POUNCE — dash through creeps; tethers the hero it hits (your pull wins; E again lets go) | FLURRY — 3–5 barbed pulses that follow you |
| 3 | KAREN | square | 320 speed · 450 mana · melee 140 | GRIND — a growing spin round you (move, no auto-attacks), slows attacks | BRACE — shield on you and friendlies nearby (creeps get half) | SHOVE — short charge, knocks enemies aside and slows | RAGE — swell up, burn whoever you touch, take less damage |
| 4 | BECKY | hexagon | 340 speed · 550 mana · ranged 520 | SHADE — plant, aim (a line shows), then a long beam; hardest far away | RUMOR — area blast, can't land close to her | GHOST — teleport | FALLOUT — 6 scattered blasts |

## Mana

Each hero has a mana pool and regeneration; every ability has a cost (shown
bottom-right of its slot). An ability you can't afford is washed blue and
can't be aimed — pressing it flashes the mana bar with "Not enough mana".
The mana bar sits under the ability slots.

Casts don't interrupt movement (Heroes of the Storm style), except dashes and
blinks, which move you.

**Auto-attack:** a homing shot per hero (KYLE 25 dmg / 0.8 s / 420
range; CHAD, KAREN melee; BECKY long range); a red ring marks the
target. Right-click move or S cancels it.

## Training dummies (Training mode)

Five dummies stand around the spawn (1000 HP, health bar, white hit flash).
Damage pops up as floating numbers coloured by the ability (white for
auto-attacks, larger for the ultimate), stacking when hits land together.
At 0 HP a dummy is "defeated" and pops back to full; left alone for 4 s it
heals to full. They block movement.

Damage per ability is in `heroes.gd` (e.g. KYLE: SHOCK 80 in its blast
when you set the dot off, IGNITE 100 to the enemy nearest its centre over
1.5 s, WRAITH 40 to each unit passed through, PUNISH 200 at the centre down to
100 at the edge).

## Autoplay (balance testing)

Plays full runs with a bot in your seat, headless and many times faster
than real time (a 5-round run takes well under a minute of wall time), then
prints a report and saves JSON to `autoplay_runs/` (git-ignored).

```
tools\autoplay.cmd --runs 10
tools\autoplay.cmd --runs 20 --policy none --seed 1000     # no-upgrades baseline
tools\autoplay.cmd --runs 8 --hero 3 --policy epic          # BECKY, saving for epics
```

| Option | Values | Default |
|---|---|---|
| `--runs` | how many runs | 5 |
| `--hero` | `cycle`, `random`, or `0`–`3` | cycle |
| `--policy` | how your bot shops: `greedy` (priciest affordable card or ability level, repeat), `levels` (ability levels first), `epic` (epics only), `random`, `none` (baseline) | greedy |
| `--seed` | base seed; run *i* uses seed + *i*, so the same seed replays the same runs | random |
| `--max-rounds` | runs are endless; stop a run after this many rounds (result "capped RN") | 10 |
| `--max-round` | game seconds before a round counts as a timeout (ends the run) | 900 |
| `--out` | report folder | `res://autoplay_runs` |
| `--quiet` | summary only | off |

The report shows, per round, the win / loss / timeout rate, average length,
gold, last hits, kills and deaths; runs completed; results by hero; and how
often each upgrade was bought, including how often in runs that were
completed. Your bot plays at full strength; red follows the run's
difficulty curve exactly as in a real game. Without the `.cmd` wrapper:
`godot --headless --fixed-fps 60 --path . --script res://tools/autoplay.gd -- --runs 10`.
Set `GODOT` if Godot isn't the Steam install.

To combine several reports (for example batches with different policies or
seeds) into one balance summary, covering the round curve, heroes, who beats
you, levels and card impact:

```
python tools/combine_reports.py autoplay_runs
```

## Play log (recording your runs)

Records your runs so they can be analysed later: how you play, not just
whether you win. **Off by default.** Switch it on from the **hero-pick
screen** or the **pause menu** (Esc) with the "Play log" button; the choice
is remembered. A red "● PLAY LOG" shows while it's recording. Switching it
on mid-round starts recording right away.

It's only in dev builds: running from Godot (F5), or the playtest exe in
`builds/windows-playtest/`. The shareable build has no switch and never
logs.

Each run writes to `%APPDATA%\Godot\app_userdata\MOBA Sandbox\playlogs\`:

| File | What |
|---|---|
| `run_<time>.jsonl` | the timeline, one event per line: run and round start / end, last hits, **missed last hits** (an enemy creep dying near you to someone else's blow), ability casts, deaths (and what killed you), kills, shop actions (buys, levels, rerolls, hero picks), pauses, and a snapshot every second (positions, health, mana, creep counts, towers, gold) |
| `run_<time>.json` | the run summary in autoplay's format (policy "human"), updated after every round |
| `run_<time>/*.png` | screenshots at each death, round end and shop |

Compare your runs with the bots':
`python tools/combine_reports.py "%APPDATA%\Godot\app_userdata\MOBA Sandbox\playlogs" autoplay_runs`

## Sharing a build (Windows)

```
tools\export.cmd
```

This builds `builds/windows/MOBA Sandbox.exe` (one file with the game packed
inside) and `builds/MOBA-Sandbox-windows.zip` (the exe plus
`HOW_TO_PLAY.txt`, about 36 MB), ready to send, with no play log in it. It
also builds `builds/windows-playtest/MOBA Sandbox (playtest).exe`: the same
game with the play log switch, for your own recorded sessions. The dev tools (`tools/`,
`autoplay_runs/`) are left out of the export. It needs Godot 4.7.2's export
templates, installed once (Editor → Manage Export Templates). Players will
see Windows SmartScreen's "unknown publisher" warning because the exe is
unsigned: "More info → Run anyway". The preset lives in
`export_presets.cfg`; `builds/` is git-ignored.

## Files

| File | What |
|---|---|
| `scripts/main.gd` | Builds the scene for the current mode; F9 / Enter / F11; mouse confinement |
| `scripts/lane.gd` | Lane mode: lane + bases, towers, wave spawner, base healing, win / lose |
| `scripts/unit.gd` | Base for everything with health: team, HP, collision (`push_out`), damage numbers, health bar |
| `scripts/creep.gd` | Lane creeps (melee / ranged): march, target priority, attack |
| `scripts/bot.gd` | The enemy hero bot: a hero with a laning brain instead of input |
| `scripts/run.gd` | The run: rounds, phases, gold carried over, upgrades owned, seed, buy / reroll, save / load |
| `scripts/upgrades.gd` | The upgrade catalogue (tiers, prices, effects) and seeded shop offers |
| `scripts/pause_menu.gd` | Esc pause menu (and the play log switch in dev builds) |
| `scripts/play_log.gd` / `play_log_probe.gd` | Play log: records your runs (timeline, summary, screenshots) when switched on |
| `scripts/run_screen.gd` | Hero pick, shop, run over / complete screens (drawn over the paused game) |
| `tools/autoplay.gd` / `.cmd` | Autoplay: bot-vs-bot full runs, headless, with a balance report |
| `scripts/tower.gd` | Lane tower: targeting, shots, range ring, rubble |
| `scripts/camera_rig.gd` | Free camera: edge panning, arrow keys, Space / Y |
| `scripts/ground.gd` | 6000 × 6000 map with a faint grid and a border |
| `scripts/heroes.gd` | The four heroes: shape, stats, auto-attack, abilities |
| `scripts/hero.gd` | Movement, orders, input, health / death / respawn, mana, casting every ability kind |
| `scripts/aim.gd` | Targeting preview while a key is held |
| `scripts/effects.gd` | Move/attack markers, bolt, blast, nova, cone, beam, afterimages, auto-attack shots, damage numbers |
| `scripts/dummy.gd` | Training dummy: HP, hit flash, damage numbers, defeat and reset |
| `scripts/targets.gd` | Finding enemies in range / on a line |
| `scripts/ability_bar.gd` | HUD: ability slots (cost, cooldown), health + mana bars, hero list, mode box, lane status, victory banner |

Tuning lives in `heroes.gd` (every hero's stats, attack and abilities —
range, radius, cooldown, cost, damage, colour, plus count/spread/pulses/
scatter/angle/width where the kind uses them); dummy positions are in
`main.gd` (`DUMMIES`); wave timing and composition in `lane.gd`; creep stats
in `creep.gd` (`KINDS`); tower stats at the top of `tower.gd`.
