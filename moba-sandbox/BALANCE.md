# MOBA Sandbox — Balance Sheet

Every number that decides how hard, how fast and how rewarding the game is,
in one place, with where it lives in the code. Use it to tune at a glance.

- **Accurate as of 2026-10-02** (after build v1.0.6, plus later unbuilt changes:
  Blast burn, doubled ultimate cooldowns, round-start ultimate cooldown, Fan
  stars, smartness 0.3 start, the reaction and hesitation lines, even stats,
  beyond-human skill, late red creeps).
- **When you change a number, change it here too**, and add a line to the
  [Change log](#13-change-log) at the bottom.
- Design reasoning and history live in `IDEAS.md`; this sheet is the current
  numbers only.

**Contents**
1. [How difficulty is built](#1-how-difficulty-is-built-the-three-dials)
2. [Red by round (master table)](#2-red-by-round--master-table)
3. [Personalities](#3-personalities)
4. [Round pressure: waves, overtime](#4-round-pressure)
5. [Economy](#5-economy)
6. [The shop](#6-the-shop)
7. [Units: towers, creeps, wells, heroes](#7-units)
8. [Hero kits](#8-hero-kits)
9. [Damage rules and statuses](#9-damage-rules-and-statuses)
10. [Bot constants](#10-bot-constants)
11. [Sim baselines](#11-sim-baselines)
12. [Where everything lives](#12-where-everything-lives)
13. [Change log](#13-change-log)

---

## 1. How difficulty is built: the three dials

Red's difficulty is three separate dials, plus round pressure that hits both
sides. Keep them separate when tuning: each answers one question.

| Dial | Question | What's in it | Matures by |
|---|---|---|---|
| **Stats** | How strong is red's stuff? | bot health and damage, red creeps, red tower health and damage | **even: always the same as yours** |
| **Skill** | How well does the bot *execute*? | cast gap, aim error, reaction, hesitation, last-hit odds, deny odds | human-level by round 10, **beyond human by round 20** |
| **Smartness** | How well does the bot *decide*? | decision speed, blunders, noticing openings, when to trade, coming back, ultimate and siege | round 6 |
| Round pressure (both sides) | How long can a round go on? | overtime: no gold, towers weaken, waves grow; ultimates start on cooldown | — |
| Late red waves | More of them, not stronger | +1 red melee per wave at round 15, another every 5 rounds | endless |

**Rule of thumb:** "a smarter player would do it differently" = smartness;
"a more skilled player would do it more accurately" = skill. Personalities are
smartness-side only and never touch skill.

**An even match always** (user, 2026-10-02). Red's hero, creeps and tower
use exactly your numbers every round. Heroes never scale. **The lane does —
the same for both sides:** both towers' health and both sides' creep health
grow each round (section 2, "Lane scaling"). Your growth is your shop;
red's is its shop (lane-earned), its skill and smartness, and late extra
creeps.

---

## 2. Red by round — master table

All values for the **standard** bot. Personalities change the smartness end
points (section 3).

### Stats (`run.gd`: `STAT_STEP` 0.0, `TOWER_HP_START` 1.0, `CREEPS_START` 1.0)

**Even: ×1.00 every round** for bot health and damage, red tower health (3,000)
and damage, and red creeps. The old gentle line is still in the code, off:
set `STAT_STEP` 0.04, `TOWER_HP_START` 0.6, `CREEPS_START` 0.7 to bring back
"80% in round 1, 100% at round 6, +4% a round after".

### Lane growth — both sides alike (`run.gd`: `LANE_TOWER_HP` 2000, `LANE_CREEP_START` 0.7, `LANE_GROWTH_STEP` 0.0925)

**Lane growth** = how much tougher both towers and both sides' creeps are
this round. Heroes never scale. It's a **straight line**:
`growth = 1 + 0.0925 × (round − 1)` — tower +185 HP a round, creep health
+6.5 points of base a round.

**Where 0.0925 comes from:** the best straight-line fit (rounds 1–20, pinned
to 1.0 in round 1) to a model of an average player's damage growth:

1. Gold spent before round R: 1,000 × (R − 1) (an average round pays 1,000).
2. Picks it buys: an average pick costs 258 base and every pick raises prices
   8% of base, so n picks cost 258 × (n + 0.04 × n(n − 1)). Solve for n.
3. Damage: 1.0314 ^ n.

| Pick type | Share | Base price | Damage per pick |
|---|---|---|---|
| Ability level | 40% | 358 | +3.4% |
| Common | 35% | 100 | +2.7% |
| Rare | 20% | 250 | +3.1% |
| Epic | 5% | 600 | +4.4% |
| **Average** | | **258** | **+3.14%** |

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 15 | 20 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Model (average player damage) | 1.00 | 1.12 | 1.22 | 1.31 | 1.41 | 1.50 | 1.59 | 1.67 | 1.76 | 1.85 | 2.02 | 2.29 | 2.74 |
| **Lane growth (line)** | 1.00 | 1.09 | 1.19 | 1.28 | 1.37 | 1.46 | 1.56 | 1.65 | 1.74 | 1.83 | 2.02 | 2.30 | 2.76 |
| Tower HP (both) | 2,600 | 2,785 | 2,970 | 3,155 | 3,340 | 3,525 | 3,710 | 3,895 | 4,080 | 4,265 | 4,635 | 5,190 | 6,115 |
| Creep HP (both, × base) | 70% | 76% | 83% | 89% | 96% | 102% | 109% | 115% | 122% | 128% | 141% | 161% | 193% |
| …melee / ranged HP | 385 / 224 | 421 / 245 | 456 / 265 | 492 / 286 | 527 / 307 | 563 / 328 | 599 / 348 | 634 / 369 | 670 / 390 | 706 / 410 | 777 / 452 | 884 / 514 | 1,062 / 618 |

Within 0.04 of the model every round (slightly under it in rounds 2–6,
matching from round 8). Health only: creep damage, tower damage (110) and gold
don't change. Training uses the base numbers (3,000 tower, 100% creeps).
**Re-fit** the step if the economy (gold per round, prices) or the cards
change.

### Skill (`run.gd`: `DIFFICULTY` table, `ENDLESS_SHARPEN` 0.9, floors, `REACTION_*`, `HESITATE_*`, `LAST_HIT_*`, `DENY_*`)

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 12 | 15 | 20+ |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Cast gap (s between casts) | 2.6 | 2.0 | 1.5 | 1.1 | 0.9 | 0.81 | 0.73 | 0.66 | 0.60 | 0.60 | 0.55 | 0.48 | **0.35** |
| Aim error (px) | 90 | 65 | 45 | 35 | 25 | 22.5 | 20.3 | 18.2 | 16.4 | 14.8 | 10.4 | 8.0 | **4** |
| Reaction (s, danger → escape; ±20%) | .70 | .65 | .60 | .55 | .50 | .45 | .40 | .35 | .30 | .25 | .22 | .19 | **.12** |
| Hesitation (s, keeps fighting before retreating; ±20%) | 1.00 | .89 | .78 | .67 | .56 | .44 | .33 | .22 | .11 | 0 | 0 | 0 | 0 |
| Last-hit odds | 75% | 78% | 81% | 84% | 87% | 90% | 93% | 95% | 95% | 95% | 96% | 98% | **100%** |
| Deny odds | 0% | 10% | 20% | 30% | 40% | 50% | 60% | 70% | 80% | 80% | 83% | 88% | **95%** |

- Cast gap and aim error: table for rounds 1–5, then ×0.9 per round down to
  floors 0.6 s and 12 px.
- Reaction: even line 0.70 → 0.25 over rounds 1–10. A second escape needs
  another full reaction.
- Hesitation: even line 1.0 → 0 over rounds 1–10.
- Both vary **±20% around the round's value** each time (`bot.gd` `JITTER`):
  round 1 reacts in 0.56–0.84 s and hesitates 0.8–1.2 s.
- Last hit / deny: one roll per creep when it first becomes a candidate.
- **Beyond human** (`SUPER_FROM` 10, `SUPER_FULL` 20, `SUPER`): after round
  10 every value above blends evenly toward the `SUPER` row, reached at round
  20 — 0.12 s reactions, 0.35 s between casts, 4 px aim error, every last hit,
  95% denies. Faster than a person can play; the endless engine now that
  stats are even.

### Smartness (`run.gd`: `SMART_START` 0.3, `SMART_FULL_ROUND` 6; `bot.gd`: `DUMB`, `ULT_SMARTS`, `SIEGE_SMARTS`)

| Round | 1 | 2 | 3 | 4 | 5 | 6+ |
|---|---|---|---|---|---|---|
| Smartness | .30 | .44 | .58 | .72 | .86 | 1.00 |
| Decides every (s) — dumb 0.6, smart 0.2 | .48 | .42 | .37 | .31 | .26 | .20 |
| Skips the right action — dumb 30%, smart 0 | 21% | 17% | 13% | 8% | 4% | 0% |
| Notices your openings (= smartness) | 30% | 44% | 58% | 72% | 86% | 100% |
| Comes back at health — dumb 75%, smart 90% | 80% | 82% | 84% | 86% | 88% | 90% |
| Trades when ahead by — dumb +20%, smart −10% | +11% | +7% | +3% | −2% | −6% | −10% |
| Uses its ultimate (from 0.4) | no | yes | yes | yes | yes | yes |
| Sieges your tower (from 0.4) | no | yes | yes | yes | yes | yes |

Blend: every `DUMB` key = `lerp(dumb, personality value, smartness)`.
Retreat health is **not** blended: a dumb bot wants to leave at the same
health as a smart one; it's just slower (decision tick + hesitation +
reaction).

### Worst-case escape timing (decision tick + hesitation + reaction)

| Round | 1 | 3 | 5 | 7 | 10 |
|---|---|---|---|---|---|
| Seconds from "should run" to escape firing | ~2.2 | ~1.8 | ~1.3 | ~0.9 | ~0.45 |

---

## 3. Personalities

Hidden from the player — never shown, named or signalled.
`bot.gd` `PERSONALITIES`; signatures in `run.gd` `SIGNATURE`.

**Current signatures (try-out, not final):**

| Red hero | Personality |
|---|---|
| KYLE | opportunist |
| CHAD | brawler |
| KAREN | brawler |
| BECKY | farmer |

**Tuned values** (missing = standard bot):

| Key | Standard | Brawler | Farmer | Pusher | Opportunist |
|---|---|---|---|---|---|
| Priority order | abilities, trade, farm, deny, siege | same as standard | farm, deny, abilities, trade, siege | leash, siege, abilities, farm, trade | same as standard |
| Retreat at health | 30% | 20% | 40% | 25% | 35% |
| Comes back at | 90% | 75% | 90% | 90% | 90% |
| Trade reach (px, min) | 450 | 650 | 450 | 450 | 800 |
| Always trades above health | 90% | 60% | 90% | 90% | 50% |
| Trade margin | −10% | −25% | −10% | −10% | −10% |
| Trades when | always | always | you're vulnerable | you hit it first (or under 25%) | you're vulnerable |
| Casts at you | always | always | when vulnerable | always | ranged always; close-up and ultimate when you're vulnerable |
| Casts on creep clumps | yes (3+) | no | yes (2+) | yes, first (2+) | yes (3+) |
| Dashes in below your health | 35% | 60% | 35% | 35% | 50% |
| Holds behind its front creep (px) | 140 | 20 | 200 | 60 | 160 |
| Sieges | from smartness 0.4 | — | — | always, reach 400 | — |
| Damage race it needs to trade (`race_need`) | 1.0 (even) | 0.85 | 1.2 | 1.0 | 1.1 |
| Chases past the middle (`chase_depth`, px) | 300 | 700 | 0 | 200 | 600 |

"Vulnerable" = under 50% health, under 25% mana, or 600+ px into red's half
(and the bot has to notice: odds = smartness).

**Power-aware trading:** besides the health check, a bot only trades if it
wins the **damage race**: (time you need to kill it) ÷ (time it needs to kill
you) ≥ `race_need`, each side's damage = auto-attack DPS + abilities ready and
affordable, spread over a 4 s fight. A dumb bot accepts 0.8 (misjudges fights a
little); it blends to the personality's value with smartness.
**Pushing** (all personalities): with no last hit to take, a bot attacks the
nearest enemy creep to drive its wave forward — only when safe: not under your
tower unless its creeps tank it, and **with you nearby** only from behind its
own front creep (≤ 40 px ahead) and not past its chase limit into your half
(no creeps of its own = no pushing while you're near). Any creep it kills this way pays it normally — incidental
last hits are its reward for you not being there. It **freezes** (last hits
only) while wary of you with you nearby, and the farmer pushes only
while you're away (dead or 1,200+ px off). While you're away, every
personality also uses abilities on creep clumps. Hesitation only happens with
you within reach; otherwise a hurt bot just goes home. (Your 20 logged rounds:
you spent 50% of the time in red's half and 15% near its tower; red 15% and
1% — this step is meant to close that gap.)

**Self-preservation** (odds of noticing = smartness, so dumb bots often miss it):
- **Wary:** if you'd win the damage race by a lot (its race below `race_need` ×
  0.8), it holds just outside your reach — your attack range plus your ready
  dash / blink — and skips last hits inside it.
- **In danger → retreat:** you're within reach and could kill it with what
  you have ready (ready abilities + 2 s of attacks), or you're faster and it's
  within 12% of its retreat point. Hesitation and reaction still apply.

**Chase limit:** it won't follow you more than `chase_depth` past the middle
into your half (or use a finishing dash there) unless you're under 25% health
— and never under your tower.

**Matrix findings** (780 runs, 2026-10-01, before the kit pass, so stale):
personalities were mostly weaker than the standard bot; red KYLE weak with
any; CHAD brawler the hardest (avg round 6.18); opportunist caused 22%
timeouts (sits back, rounds stall).

---

## 4. Round pressure

`lane.gd`: `WAVE_EVERY`, `FIRST_WAVE`, `WAVE`, `OVERTIME`.

| Thing | Value |
|---|---|
| First wave | 3 s into the round |
| Waves | every 20 s, both sides at once: 3 melee + 1 ranged |
| Overtime starts | 2:30 + 20 s × round, capped at 5:00 |

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
|---|---|---|---|---|---|---|---|---|
| Overtime starts | 2:50 | 3:10 | 3:30 | 3:50 | 4:10 | 4:30 | 4:50 | 5:00 |

**In overtime (both sides):**
- **Tower shields drop:** heroes can hit towers without a creep in range.
- **Kills pay no gold** (creeps, heroes, towers). Last hits still count;
  Siphon still gives mana. Death gold loss still moves to the killer.
- Towers take **+50% damage per minute** of overtime.
- Waves get **+1 melee every 2 waves**, max +4.

**Late red waves** (`run.gd` `RED_EXTRA_FROM` 15, `RED_EXTRA_EVERY` 5): red's
waves get +1 melee creep from round 15, +2 from round 20, +3 from 25, and so
on — on top of overtime extras and red's Reinforcement cards.
- **Red rally: OFF** (`red_per_min` 0.0). Built: red's hero +8% damage and
  health per minute of overtime, cap +60%, half in round 1. Set 0.08 to try.

**Death timer** (both sides; `lane.gd` `RESPAWN_BASE` 8, `RESPAWN_STEP` 2,
`RESPAWN_EVERY` 30): 8 s at the start of a round, +2 s for every 30 s the
round has run, no cap. Set when you die.

| Round time | 0:00 | 0:30 | 1:00 | 2:00 | 3:00 | 4:00 | 5:00 | 7:30 | 10:00 |
|---|---|---|---|---|---|---|---|---|---|
| Respawn (s) | 8 | 10 | 12 | 16 | 20 | 24 | 28 | 38 | 48 |

**Ultimates:** both heroes start every round with their ultimate on its full
cooldown (cooldown cards apply). Training is exempt.

---

## 5. Economy

### Gold in

| Source | Gold | Where |
|---|---|---|
| Melee creep (last hit) | 24 (40 × 0.6), every round | `creep.gd` KINDS, `GOLD_MULT` |
| Ranged creep | 33 (55 × 0.6) | |
| Tank creep | 42 (70 × 0.6) | |
| Enemy hero kill | 120 in round 1, × lane growth | `hero.gd` `HERO_BOUNTY` |
| Enemy tower kill (your killing blow) | 250 | `tower.gd` `GOLD` |
| Winning a round | 0 (removed; was +200) | `run.gd` `WIN_GOLD` |
| Killing the enemy hero (on top) | 15% of its gold, max 300 | death loss, below |

**Target:** a *good* round 1 (75% of the last hits before overtime, no kills)
pays just over an epic. Round 1 has 8 farmable waves (20 s waves, overtime at
2:50) → 18 melee + 6 ranged = **630**. Creep gold is flat; later rounds pay
more only because the farm window grows (+1 farmable wave a round to 15 at
round 8, then flat).

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
|---|---|---|---|---|---|---|---|---|
| Farmable waves | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 |
| Hero kill (× lane growth) | 120 | 131 | 142 | 153 | 164 | 176 | 187 | 198+ |
| **Good round's farm** | **630** | 709 | 788 | 866 | 945 | 1,024 | 1,103 | **1,181** |

Card modifiers on last hits: no card adds gold any more (Bounty Hunter now
makes low-creep attacks land instantly); Siphon +15 mana; Adrenaline −1 s ultimate cooldown. (Midas, "last hits pay double", was removed 2026-10-02.)

### Gold out

| Sink | Value | Where |
|---|---|---|
| Dying | lose 15% of carried gold, max 300 — to the enemy hero if it got the kill | `hero.gd` `DEATH_GOLD_LOSS`, `DEATH_GOLD_CAP` |
| Rising prices | every pick (card or level) raises all prices 8% of base, rounded to 5 | `run.gd` `PRICE_RISE` |
| Rerolls | 50, +25 per reroll so far this run (never resets: chasing a combo gets dear) | `REROLL_COST`, `REROLL_STEP` |

**Price after n picks** = base × (1 + 0.08 n): after 5 picks +40%, after 10
+80%, after 20 +160%.

### Red's economy

- Red earns **only** what its bot gets in the lane: last hits, hero kills, the
  death-gold it takes from you. **No allowance** (`RED_ALLOWANCE` 0) and **no
  guaranteed floor** (user decision, never add one).
- Red shops when your shop opens, from its own seeded offers: 50% chance per
  purchase to take an ability level (lowest letter first), otherwise **the
  first affordable card on its next hero's personality's priority list**
  (`RED_PRIORITY`), until nothing fits (`RED_LEVEL_CHANCE`). Cards missing from
  a list are never bought: Command, Rally Cry, Siege Breaker only by the pusher
  (the only one that leashes / sieges); Scavenger never by the pusher (it never
  denies), Recruit and Homeguard only by the farmer; Glass Cannon, Overclock and
  Heavy Hands by nobody (a bot can't play their downside).

| Personality | Priority list (best first) |
|---|---|
| Brawler | Vigor, Whetstone, Quickdraw, Serrated, Vampirism, Second Wind, Colossus, Spellblade, Cold Read, Twin Shot, Arcane Edge, Aftershock, Hunter's Mark, Salve, Haste, Spite, Boots, Overcharge, Echo, Reserve, Afterimage, Kindling, Executioner, Clean Finish, Adrenaline, Scavenger, Tank Minion, Reinforcement, Vanguard, Standard Bearer, Siege Training, Healing Aura, Focus, Wellspring, Longbow, Siphon |
| Farmer | Arcane Edge, Haste, Focus, Wellspring, Siphon, Keen Eye, Clean Finish, Bounty Hunter, Echo, Reserve, Overcharge, Executioner, Adrenaline, Homeguard, Afterimage, Second Wind, Scavenger, Recruit, Vigor, Whetstone, Quickdraw, Longbow, Salve, Boots, Colossus, Twin Shot, Healing Aura, Reinforcement, Tank Minion, Siege Training, Vampirism |
| Pusher | Reinforcement, Siege Training, Tank Minion, Command, Rally Cry, Sappers, Vanguard, Standard Bearer, Pathfinders, Healing Aura, Siege Breaker, Quickdraw, Whetstone, Twin Shot, Arcane Edge, Vigor, Haste, Boots, Colossus, Overcharge, Echo, Salve, Focus, Wellspring, Longbow, Vampirism, Executioner, Siphon |
| Opportunist | Arcane Edge, Overcharge, Echo, Haste, Hunter's Mark, Kindling, Cold Read, Spellblade, Reserve, Afterimage, Focus, Vigor, Boots, Wellspring, Colossus, Second Wind, Vampirism, Whetstone, Quickdraw, Salve, Twin Shot, Executioner, Keen Eye, Clean Finish, Adrenaline, Scavenger, Longbow, Tank Minion, Reinforcement, Siege Training, Healing Aura, Siphon |
| Standard | Arcane Edge, Vigor, Whetstone, Quickdraw, Haste, Spellblade, Second Wind, Overcharge, Colossus, Twin Shot, Echo, Hunter's Mark, Reserve, Vampirism, Salve, Boots, Clean Finish, Keen Eye, Adrenaline, Focus, Wellspring, Executioner, Bounty Hunter, Longbow, Tank Minion, Reinforcement, Vanguard, Siege Training, Standard Bearer, Healing Aura, Sappers, Pathfinders, Scavenger, Siphon |
- Red pays the same rising prices.

---

## 6. The shop

`upgrades.gd`. 3 offers per tier per shop. Epics: one copy each per run.
Wave cards are rolled like the other tiers (3 a round, rerolled with the rest; red rolls its own), up to their max.

### Ability levels

| Level | II | III |
|---|---|---|
| Q / W / E | 200 | 450 |
| R (× 1.4) | 280 | 630 |

Levels belong to the **letter** and carry across hero switches.

### Cards

| Tier (base price) | Card | Effect |
|---|---|---|
| Common (100) | Whetstone | +8 attack damage |
| | Quickdraw | +12% attack speed |
| | Vigor | +200 max health |
| | Focus | +150 max mana |
| | Boots | +25 move speed |
| | Salve | +6 health regen |
| | Siphon | +15 mana per last hit |
| | Scavenger | denying a creep: +25 mana, +40 health (before overtime) |
| | Heavy Hands | attacks +40% damage, 25% longer between them |
| | Homeguard | inside your tower's range (650): +25% attack speed, +5 health regen |
| | Rally Cry | leashed creeps +30% damage, −30% damage taken (max 2; damage cut capped at 75%) |
| | Adrenaline | each last hit: −1 s on the ultimate's cooldown (max 2) |
| | Keen Eye | attack shots fly 50% faster |
| | Clean Finish | attacks +15% vs creeps below half health |
| | Bargain | when bought: halves your current reroll cost (the climb carries on from there). Shown once per run — skip it and it's gone. Doesn't count as a pick |
| Rare (250) | Arcane Edge | +20% ability damage |
| | Haste | −15% cooldowns |
| | Longbow | +120 attack range |
| | Vampirism | heal 8% of damage to creeps, 16% to heroes |
| | Bounty Hunter | attacks on creeps below 25% health land instantly (no more gold, 2026-10-04) |
| | Wellspring | +5 mana regen |
| | Kindling | burns +2 s; a unit dying while burning ignites the nearest of its side within 150 (max 2) |
| | Cold Read | slowed enemies (move or attack slow) take +12% damage from you (max 3) |
| | Serrated | your attacks make heroes bleed 2 s: your attacks on them +10% (max 3) |
| | Spite | shields on you or given by you reflect 30% of what they soak at the creep / hero that hit (max 3) |
| | Second Wind | below 30% health: 150 shield for 3 s, once per 40 s |
| | Siege Breaker | attacks +40% damage to towers |
| | Glass Cannon | +35% ability damage, −20% max health (max 2; max health never below 20% of base) |
| | Overclock | −30% cooldowns, abilities cost +40% mana (max 1) |
| | Spellblade | after a cast, the next attack +40 damage and slows 20% for 1 s |
| Epic (600) | Twin Shot | auto-attacks also hit a second enemy nearby |
| | Echo | Q hits twice: again 0.4 s later, half damage |
| | Overcharge | ultimate: half cooldown, +30% damage |
| | Colossus | +40% max health, +25% size |
| | Executioner | your hits finish creeps below 25% health |
| | Aftershock | a stun by you or your Tank Minion: 60-damage shockwave, radius 200, once a second |
| | Reserve | Q holds 2 charges |
| | Afterimage | a dash / blink leaves a decoy for 2 s: enemy creeps, towers and the bot lose you and go for it |
| | Hunter's Mark | ability hits mark heroes 4 s; your next attack on a marked hero +15% of its missing health |
| | Recruit | a creep you deny rises at half health for 6 s (worth no gold; before overtime) |

Cooldown cards (Haste, Overclock) add up to at most −60% (`ability_info.gd` `COOLDOWN_CAP`); Overcharge halves the ultimate on top, never below 20% of it (`ULT_FLOOR`).

### Wave cards (creep upgrades)

| Card | Price | Max | Effect |
|---|---|---|---|
| Reinforcement | 500 | 3 | +1 melee creep per wave |
| Healing Aura | 350 | 1 | ranged creeps heal nearby allies (and you) 8/s, radius 250 |
| Tank Minion | 550 | 1 | a tank leads each wave (1,100 HP), stuns the closest enemy within 300 for 1 s every 6 s |
| Siege Training | 400 | 1 | your creeps +50% damage to towers |
| Command | 300 | 2 | +1 leash point |
| Vanguard | 400 | 1 | melee creeps gain a 60 shield (8 s) on entering the enemy tower's range |
| Sappers | 450 | 1 | one ranged creep a wave: dying in the enemy tower's range, blasts it for 150 |
| Pathfinders | 300 | 1 | waves and siege minions walk 20% faster |
| Standard Bearer | 350 | 1 | the middle front melee creep carries a banner: creeps within 300 attack 25% faster while it lives |


**Known stacking risks** (from the 19-round BECKY run): Longbow ×3 out-ranges
the tower (520 + 360 = 880 > 650); Bounty Hunter ×3 made a last hit worth 270
with Midas (Midas now removed; ×3 alone = 135); Vampirism ×6 = 48% / 96% healing. No per-card caps yet beyond
epics and wave cards.

---

## 7. Units

### Towers (`tower.gd`)

| HP | Range | Damage | Interval | Bounty |
|---|---|---|---|---|
| 2,000 × lane growth + 600 (both; section 2) | 650 (centre to target edge) | 110 | 1.1 s | 250 |

Targeting: an enemy hero that hits one of its heroes in range → locked until
it leaves range; otherwise creeps; only with no creep in range, a hero.

**Shield (backdoor protection):** heroes (attacks, abilities, burns) only
damage a tower while at least one of their creeps — leashed included — is
inside its 650 range circle. All or nothing; creeps always can. **Drops in
overtime.** Feedback: a pulsing shield plate on the tower, "SHIELDED" puffs on
blocked hero hits. The bot won't siege a shielded tower.

### Creeps (`creep.gd` KINDS)

| Kind | HP | Damage | Interval | Range | Speed | Gold (×1.5) | Leash cost |
|---|---|---|---|---|---|---|---|
| Melee | 550 base (× lane scaling) | 21 | 1.0 s | 18 | 240 | 60 | 1 |
| Ranged | 320 base | 24 | 1.0 s | 400 | 240 | 83 | 2 |
| Tank (wave card) | 1,100 base | 14 | 1.2 s | 18 | 240 | 105 | 2 |

Acquire range 460. Targets, nearest within each rank: a hero who just hit
one of their heroes, then enemy creeps, then heroes, then the tower. **Tower Vision
(like tunnel vision): inside an enemy tower's range they attack only that tower** (nothing else,
not even an aggro hero). They march to the enemy tower; they drop a hero who reaches
its own well. Leashed creeps attack their hero's target instead. Deny: your
own creep below 50% health.

### Wells / bases (`lane.gd`)

| Thing | Value |
|---|---|
| Position / radius | x = ±2600, radius 300 |
| Heal (own well) | 20% of max health and mana per second |
| Own well | invulnerable |
| Enemy hero in your well | burns 25% of max health per second (every 0.25 s) |

### Field (`bounds.gd`)

Tall field: north / south edges at ±650 (= the tower range) between the
towers, swinging out round each tower's range circle (radius 650 at x = ±2000)
and closing into the well circles. In shapes: the band |x| ≤ 2000, |y| ≤ 650
+ both tower range circles + both wells. Heroes and creeps are kept inside.
The minimap shows the whole field (y ±720).

### Heroes (`heroes.gd`)

| Hero | HP | Speed | Mana / regen | Attack | Attack DPS | Range |
|---|---|---|---|---|---|---|
| KYLE | 700 | 360 | 500 / 6 | 25 every 0.8 s | 31 | 420 |
| CHAD | 900 | 400 | 500 / 7 | 40 every 0.65 s | 62 | 150 |
| KAREN | 1,100 | 320 | 450 / 5 | 35 every 1.0 s | 35 | 140 |
| BECKY | 650 | 340 | 550 / 9 | 25 every 0.9 s | 28 | 520 |

All heroes: 2 HP/s regen, 2 leash points. Respawn: see the death timer in
section 4 (Training: 6 s).

---

## 8. Hero kits

Levels I → II → III. "cd" = cooldown, "—" = unchanged.

### KYLE — zone-control mage that dives on purpose (reworked by the user)

| | Ability | I | II | III |
|---|---|---|---|---|
| Q | **SHOCK** — orb (lightning look) flies up to 450 at 900/s; press Q again to burst early, else bursts at the end | 80 dmg, radius 80, cd 5, 50 mana | 105, r 95 | 130, r 110, cd 4 |
| W | **IGNITE** — 0.55 s warning, then a fire zone for 1.5 s (6 ticks); nearest-to-centre full, others × splash; touched enemies **burn** after leaving | 80 dmg, r 128, splash 50%, burn 10/s × 2 s, range 700, cd 8, 80 mana | 96, r 150, burn 14/s | 112, splash 75%, burn 18/s, cd 6.5 |
| E | **BOOP** — a circle at the cursor; after 0.2 s everything inside (heroes, creeps, KYLE too) slides out to `push` px past its edge, straight from the centre, over 0.25 s; enemies take its damage; tethers snap. Towers, totems, decoys, siege minions stay put. Afterimage fires if it shoves KYLE | 30 dmg, range 700, radius 160, push 120, cd 10, 60 mana | 40, radius 180, cd 9 | 50, radius 200, push 160, cd 8 |
| R | **PUNISH** — shockwave, full damage at the centre down to 50% at the edge | 200 → 100, r 345, **cd 60**, 150 mana | 270 → 135, r 390 | 350 → 175, **cd 48** |

Level I burst if all lands: ~400–420.

### CHAD — sticky melee duelist (reworked)

| | Ability | I | II | III |
|---|---|---|---|---|
| Q | **STARS** — spinning barbed stars in a spread, range 600; each cuts through creeps (hitting each once) and stops at the first hero or tower | 3 × 55, spread 18°, cd 5, 45 mana | 4 × 60 | 5 × 70 |
| W | **TRAP** — dropped at your feet, r 55, 3 s: slow (+1 s after leaving), **bleed** (your attacks +20%), final 1 s whips round and cuts in 4 hits | 60 dmg, slow 35%, cd 10, 50 mana, 1 charge | 80, 2 charges, slow 40% | 100, 3 charges, slow 45%, cd 8 |
| E | **POUNCE** — dash 520 through creeps and friends; stops at the first hero (or tower) and **tethers** it 1.2 s, max 220 apart; your pull wins; E again lets go | 70 dmg, cd 8, 60 mana | 100, range 600 | 140, cd 6 |
| R | **FLURRY** — barbed pulses r 220 every 0.25 s, following you | 3 × 70, **cd 50**, 120 mana | 4 × 105 | 5 × 120 |

Level I sequence (POUNCE, TRAP, point-blank STARS, FLURRY) ≈ 440 plus bleed
autos (~90 DPS) for 275 of 300 mana.

### KAREN — tank-bruiser (reworked)

| | Ability | I | II | III |
|---|---|---|---|---|
| Q | **GRIND** — for 2 s KAREN's square body grows and spins; its corners cut everything they sweep (8 hits); move but no auto-attacks; hits slow attacks 25% for 1.5 s; +50% vs creeps; each cut on a creep heals her 3; can't be interrupted except by your own SHOVE; cast mid-SHOVE it starts after the charge | 180 total, grows ×1.6 → ×2.0 (corner reach ≈ 56 → 70 px), cd 7, 50 mana | 240, → ×2.2 (≈ 77) | 300, → ×2.4 (≈ 84), cd 6 |
| W | **BRACE** — shield on you and every friendly within 300 for 3 s; creeps get 15 / 20 / 25% of their max health | 120 (creeps 15%), cd 12, 60 mana | 170 (20%), cd 11 | 220 (25%), cd 10 |
| E | **SHOVE** — short charge through enemies, knocking each 90 px aside; they take +10% damage for 3 s; ends a GRIND in progress | 40 dmg, range 300, cd 10, 60 mana | 60, range 340, cd 9 | 80, cd 8 |
| R | **RAGE** — swell 35% (hitbox too); bodies enemies (they take all the shove, nothing soft shoves it); every 0.5 s damages, sets on fire and bumps 30 px away everyone within body + 40 px, with a 0.25 s mini stun per enemy at most every 1.5 s; takes 20% less damage; GRIND and SHOVE hits during RAGE burn too (and reach further) | 35/s contact, burn 15/s × 2 s, 6 s, **cd 60**, 150 mana | 50/s, burn 20/s, 7 s, cd 55 | 65/s, burn 25/s, 8 s, cd 50 |

Level I burst if everything lands ≈ 330–380 (GRIND 120 + SHOVE 40 + ~4 s of
RAGE contact + burn) vs CHAD's ~500 — less damage, far harder to kill
(1,100 HP, shield, RAGE's damage reduction). Quake is gone (its pulse /
anchored-pulse features stay in the engine; Flurry still uses pulses).

### BECKY — artillery with a price (reworked 2026-10-04, try-out)

Each strength comes with its counter: range costs standing still, distance is
where the damage is, the area blast can't defend her, and GHOST is her only out.

| | Ability | I | II | III |
|---|---|---|---|---|
| Q | **SHADE** — plants for 0.35 s (no move / attack, a line shows the path; a stun or GHOST cancels it), then an instant beam; damage 60% point blank → full at 600+ | 120, range 760, width 40, cd 7, 60 mana | 150, width 55 | 190, cd 5.25 |
| W | **RUMOR** — ground blast after a warning; **can't land within 250** of her; everyone hit misses their next attack | 85, r 145, range 850, cd 10, 90 mana | 110, r 165 | 140, cd 8 |
| E | **GHOST** — teleport | range 450, cd 12, 70 mana | 550, cd 10 | 650, cd 8 |
| R | **FALLOUT** — scattered blasts | 6 × 110, r 130, scatter 320, range 800, **cd 80**, 200 mana | 8 × 125 | 10 × 140, scatter 380 |

Bot: casts SHADE only from 360+ away (aimed where you'll be after the windup),
RUMOR only on targets 250+ away, keeps GHOST for escapes.

---

## 9. Damage rules and statuses

### Global damage dials (`unit.gd`)

| Dial | Value | Means |
|---|---|---|
| `ABILITY_VS_HEROES` | 1.0 | ability damage to heroes (and dummies) |
| `ABILITY_VS_CREEPS` | 1.0 | ability damage to creeps |
| `ABILITY_VS_STRUCTURES` | 0.5 | ability damage to towers (bursts don't delete them) |
| `ATTACK_VS_STRUCTURES` | 1.0 | auto-attack damage to towers |
| `LIFESTEAL_VS_HEROES` | 2.0 | Vampirism heals this × its base % on hero damage |

Any ability can override with `vs_heroes` / `vs_creeps` / `vs_structures`
(none do yet).

### Ability damage scaling (`ability_info.gd`, used by casts and tooltips)

- Damage × (1 + Arcane Edge) × (1 + Overcharge's +30%, ultimates only) × red's damage stat.
- Cooldown × (1 − Haste) × (1 − Overcharge's 50%, ultimates only).

### Statuses (`unit.gd`) — none stack; the stronger one wins / refreshes

| Status | Source | Effect |
|---|---|---|
| Attack slow | KAREN GRIND | attacks take (1 + x) as long |
| Movement slow | TRAP, SHOVE | moves at (1 − x) speed |
| Bleed | Caltrops | the caster's auto-attacks +20% on you while inside |
| Burn | IGNITE, RAGE | x damage/s for N s after leaving the fire (credited to the caster: kills and gold) |
| Stun | Tank creep, RAGE (mini) | can't move, attack or cast |
| Tether | Rush | bound to the caster, max distance; caster's pull wins |
| Zone mark | any lingering zone | lets combos know you're in it |

### Bot difficulty multipliers on red's hero

Even stats: red's bot has exactly the kit's health and damage (the stat
multipliers are all 1.0). `heroes.gd` "bot" overrides: none in use.

---

## 10. Bot constants (`bot.gd`, full-strength standard values)

| Constant | Value | Meaning |
|---|---|---|
| `THINK` | 0.2 s | decision tick at full smartness |
| `RETREAT_AT` / `HEALED_AT` | 30% / 90% | go home / come back |
| `ENGAGE` | 450 | min trade reach |
| `TRADE_PAD` | 120 | steps this far outside attack range to trade |
| `TRADE_CAP` | 90% | always trades above this health |
| `FARM_RANGE` | 700 | considers creeps this close |
| `SIEGE_REACH` | 250 | walks in this far to hit a tower its creeps tank |
| `LAST_HIT_SLACK` | 1.6 | swings when a creep is within 1.6 hits of dying |
| `REACTION` | 0.3 s | the autoplay seat's reaction (red uses the round's) |

**Kit awareness:** PUNISH waits until you're within 45% of its radius; BOOP
lands just behind you to knock you toward it (in its combo, or when you're low and running), and between you to escape; TRAP when you're within
~70 px and while fleeing; Rush cuts its tether when retreating; dashes and
blinks only to finish you (under its dash threshold) or escape; never wastes
`hero_only` abilities on creeps. No planned combos yet.

---

## 11. Sim baselines

Autoplay: `tools\autoplay.cmd --runs N --seed S --max-rounds 8 [--hero H]
[--red-hero H] [--personality P] [--smartness S]`. Same seeds = paired runs.

| Sim (30 runs, seeds 5000–5029) | What changed | Avg round reached | Capped at R8 | Timeouts |
|---|---|---|---|---|
| bal1 | baseline 2026-09-30 | 6.50 | 6 | 3 |
| rally | abilities 100% vs creeps, lifesteal, Quake, well, no allowance, rally on | 5.77 | 3 | 2 |
| nogold | rally off, no gold in overtime (3:00) | 6.60 | 3 | 5 |
| otscale | round-scaled overtime | 6.80 | 5 | 4 |
| gold15 | creep gold × 1.5 | 6.83 | 9 | 1 |

**All of these are stale** for absolute numbers: since then the kits were
reworked, the personality ladder, reaction, hesitation, bounds, burn and
doubled ultimate cooldowns went in, and the win gold isn't in autoplay yet.
Run a fresh baseline before the next tuning pass.

---

## 12. Where everything lives

| What | File | Names |
|---|---|---|
| Stats (even), skill table, reaction, hesitation, last hit, deny, beyond-human, late creeps | `scripts/run.gd` | `STAT_*`, `DIFFICULTY`, `REACTION_*`, `HESITATE_*`, `LAST_HIT_*`, `DENY_*`, `ENDLESS_SHARPEN`, floors, `SUPER*`, `RED_EXTRA_*` |
| Smartness ladder, signatures | `scripts/run.gd` | `SMART_START`, `SMART_FULL_ROUND`, `SIGNATURE` |
| Personalities, dumb end, bot constants | `scripts/bot.gd` | `PERSONALITIES`, `DUMB`, `ULT_SMARTS`, `SIEGE_SMARTS`, top constants |
| Economy: win gold, prices, rerolls, red shop | `scripts/run.gd` | `WIN_GOLD`, `PRICE_RISE`, `REROLL_*`, `RED_*` |
| Death gold, hero bounty, respawn | `scripts/hero.gd` | `DEATH_GOLD_*`, `HERO_BOUNTY`, `RESPAWN` |
| Creeps, creep gold | `scripts/creep.gd` | `KINDS`, `GOLD_MULT` |
| Towers | `scripts/tower.gd` | top constants |
| Waves, overtime, wells | `scripts/lane.gd` | `WAVE*`, `OVERTIME`, `BASE_*`, `WELL_*` |
| Field shape | `scripts/bounds.gd` | `HALF_HEIGHT`, `TAPER_FROM` |
| Hero stats and kits | `scripts/heroes.gd` | `LIST` |
| Cards, wave cards, level prices | `scripts/upgrades.gd` | `TIERS`, `LIST`, `LEVEL_PRICES`, `R_MULT` |
| Damage dials, statuses | `scripts/unit.gd` | `ABILITY_VS_*`, `LIFESTEAL_VS_HEROES` |

---

## 13. Change log

Newest first. One line per tuning change: what, from → to, why.

- **2026-10-11** — No denying in overtime: nothing pays then, so denies are off (own creeps get no amber outline, clicking one does nothing, red skips its deny step and KYLE's IGNITE-on-own-low-creeps zoning). Overtime is for winning the round, not the farm. Scavenger and Recruit say "(before overtime)". (The 2026-10-07 note claimed overtime creeps couldn't be denied; they could — now true.)
- **2026-10-11** — Bot: no totem trip while you're within your reach + 250 px of red or its totem (TOTEM_CLEAR). Round 7 BECKY leashed a creep, took a step, saw your burst and dropped it on 6 of 12 trips; now it waits for an open moment instead.
- **2026-10-10** — Tower health +600 flat (LANE_TOWER_EXTRA; still +185 a round): round 1 2000 → 2600, R5 2740 → 3340, R8 3295 → 3895, R12 4035 → 4635. A wave's burst on a tower is about the same every round (worst 15 s ≈ 900–1,400 across three runs; creep damage doesn't grow), so early towers crumbled the moment a wave got there (43–62% in 15 s, rounds 1–3). Flat so it helps most early. Watch round length; trim toward +400 if rounds drag.
- **2026-10-10** — Totem reward 2 → 1 siege minion: two was too much (round 8: red's totems fed 6 siege minions, 40% of the damage to your tower).
- **2026-10-10** — Totem LATCH_LIFE 80 → 45 s (a latched creep loses 1/45 of its max health a second): two latched melee creeps did 3,360 before dying — one uncontested trip always destroyed it (3,000) for 2 siege minions. Now a melee creep deals ~945 (32%), a 2-melee trip ~63%: two trips at least, with a window to answer it.
- **2026-10-10** — Totem fix: latched creeps hit the totem only from within 40 px of it, ranged ones included (a latched ranged creep used its 400 px range — BOOPed away, it kept shooting the totem from far off; now it walks back in like a melee one).
- **2026-10-10** — BECKY SHADE damage 140/175/220 → 120/150/190 (the trim after the SHADE/RUMOR swap): round 8 red BECKY went 6–0 on a KYLE who couldn't reach her — SHADE hit 24 of 45 for ~230 each (5,541). ~14% less per hit; range, cooldown, cost unchanged.
- **2026-10-10** — From KYLE's round 7 (vs KAREN): the getaway mana reserve (BOOP / dash / blink cost, your hero within 1200 px) now covers every ability a bot casts that isn't aimed at you, not just wave-clear — most of KYLE's drain was IGNITE / SHOCK on creeps from its general ability step; it sat at 2–60 mana for minutes and KAREN reached it with no BOOP four times (1055 → 316, 946 → 291, 850 → 375, 890 → 377 in ~4 s each).
- **2026-10-10** — Key runs (red leashing a creep to open your tower's shield) now count tower shots: its creeps must soak long enough for it to walk from the waiting spot into attack range and land 3 hits (tower ≈ 100 dmg/s to creeps, scaled with their health; e.g. CHAD needs ~3.9 s = a 390+ hp melee, KAREN ~5.3 s). One creep if it lasts, else two (leash points allowing: two melee); nothing that lasts → no run. A run whose creeps get hurt on the way gives up before sending them ('not worth it'). Why: of 31 sent runs since 10-07, red hit your tower ~0–1.5 s in most — a half-health melee or a ranged creep (3 shots) died before it got there. The red_key event now logs the creeps, soak and need.
- **2026-10-10** — From CHAD's round 6 (vs BECKY): the diver's patience (wait for your escape to be spent) runs out when it has lost 20% of its health in the last 4 s — it stood in BECKY's poke range waiting out her GHOST and went 48% → 12% in 5 s, twice.
- **2026-10-10** — From KAREN's round 5 (vs KYLE): in a combo, a SHOVE followed by GRIND ends the charge on you instead of 90 px past — the knock-aside plus the overshoot left you outside the spin (GRIND hit you 3 of 14; her combos took 0–12%).
- **2026-10-10** — From BECKY's round 4 (vs CHAD): an outmatched bot with you in reach still won't walk in or attack creeps near you, but now casts its wave-clear spells from where it stands — BECKY held 900–1,100 px off at full mana casting nothing while your wave hit her tower (POUNCE's reach kept her 'outmatched, you're in reach' all round).
- **2026-10-10** — From KYLE's round 3 (vs KAREN): (1) the zoner stokes your burn only from outside your reach, or while it's winning the trade and above retreat_at + 10% — it stood attacking KAREN while she GRINDed it from 74% to 4%, three times; (2) every bot's wave-clear casts keep mana for its getaway (BOOP / dash / blink) while your hero is within 1200 px — KYLE pushed itself to 2–5 mana for ~80 s with KAREN on top of it and no BOOP to peel.
- **2026-10-10** — Bot retreat, from KAREN's round 1 (0–5, every death a late retreat): (1) its pre-retreat hesitation ends early if it loses 10% more health during it — early bots still fight on a moment, but no longer stand frozen while burst (she went 38% → 2%); (2) under retreat_at + 10% and outmatched (odds below need) with you near, it heads home instead of walking back in (she pushed into your half at 31% with odds 0.3). Sloppiness kept, bug-look removed. (3) no hesitation at all when it first notices already 10%+ under its line (CHAD came out of a combo at 19% and stood a second next to you).
- **2026-10-10** — CHAD FLURRY damage per pulse 90 → 70 (level 1: 270 → 210 total): with POUNCE's tether, STARS and attacks his round-1 combo did ~470 in 2 s, killing a 700-health KYLE from 70%. Bot fix: the diver no longer hunts below its own retreat line (30%) unless it's a sure kill (one POUNCE + one attack) — it POUNCEd at 7% health and died.
- **2026-10-10** — From the BECKY run (6–0): (1) BECKY keeps out of your attack reach + real gap-closers (POUNCE, SHOVE) — it counted your GHOST blink too, so a mirror BECKY kept 1000+ px off and barely played (holding 57%, wary 60%); (2) KYLE only opens with a BOOP pull when a follow-up can reach you after it — PUNISH (≈120 px reach) counted, so pulls ended with nothing cast; (3) KAREN's threat zone also counts you hitting her wave's creeps from range (a ranged hero never stepped within it); (4) a key run gives up 2.5 s after sending its creep if your shield is still up (it stood at the waiting spot 4 s). CHAD's STARS: he keeps facing where he fired for 0.3 s (he fired backwards while walking, facing his shot for a single frame).
- **2026-10-10** — BECKY: SHADE and RUMOR swap damage, SHADE's cooldown up to hold her total. SHADE 85 / 110 / 140 → 140 / 175 / 220, cooldown 6 / 6 / 4.5 → 7 / 7 / 5.25; RUMOR 140 / 175 / 220 → 85 / 110 / 140 (blind unchanged). The harder skill (an aimed long-range line with a windup, 60% up close) now pays the most; RUMOR becomes utility (blind, wave chip). RUMOR had been her main damage (red's RUMOR 1680 vs SHADE 836 in one round). Ability damage per second about where it was (level I ≈ 28.5 vs 28).
- **2026-10-09** — BECKY · the artillery (hero mind): keeps out of your threat reach + 60 px (steps back out, then farms from there); from round 4 pokes you freely (was only when you're vulnerable) but fires SHADE / RUMOR at you only when you're predictable — standing still, or holding a straight line ~0.5 s — else saves them or spends them on creeps; from round 7 a 100 px margin. Matchups: +100 vs CHAD (POUNCE reach), +40 vs KAREN.
- **2026-10-09** — CHAD · the diver (hero mind), impulsive → patient: rounds 1–3 trades like a brawler and hunts below 25% health (POUNCE when in reach, else chases up to 900 px with attacks; never under your tower); from round 4 trades only when you're vulnerable, holds his combo until your escape (BOOP / GHOST / SHOVE / POUNCE) is spent, hunts below 35%; from round 7 below 40%. Matchups: hunts 10% sooner vs BECKY, 10% later vs KAREN.
- **2026-10-09** — KYLE · the zoner (hero mind): keeps you burning — attacks you while you burn from his fire and you're in range (each hit restarts it); BOOPs between you when a melee hero gets within 200 px (260 vs CHAD); from round 4 BOOPs from behind you to knock you into his IGNITE when you stand within 180 px of its edge; from round 7 drops IGNITE on his own low creeps near you (farming them = standing in fire). Matchups: +40 stance vs KAREN (out of her threat zone), −60 vs BECKY (step in to reach her).
- **2026-10-09** — Hero stances: where each red hero stands relative to its own front creep comes from its WORKING RANGE — the shortest reach among the tools it uses on the wave (its attack and its wave-clear abilities, range bonuses included), so it stands where all of them reach the enemy creeps, never at its longest spell's range with the rest idle — plus bravery from toughness (max health now ÷ base) and lifesteal: hold_back = base + on_wave × working range − tough_pull × (toughness − 1) − sustain_pull × lifesteal, clamped. KYLE 0.7 × his attack reach (≈ 294 fresh); CHAD in the wave (TRAP at his feet); KAREN in the clash; BECKY 0.75 × her attack reach (≈ 390, not SHADE's 760). Was a fixed hold_back per personality type. Snapshots log `hold` and `reach`.
- **2026-10-09** — Hero minds (IDEAS.md): each red hero plays its own personality (`hero_minds.gd`) — the four old types are reference templates (`personality_templates.gd`, pinned only by experiments). KAREN · the anchor: hold-back 20 → −30 (in the clash), GRIND on waves only for kills / heal / a 4+ clump, front creeps first, threat zone 250 (350 from round 4, 400 from 8; ±50 by matchup). All bots: wave steps (farm / clear / push) skipped by dull bots at a third the rate (KAREN skipped farming 19 times in one round).
- **2026-10-09** — Red's hero order, two bugs: (1) round 1's red was built by the lane behind the hero-select screen before the run had a seed — right after launching the game that was always CHAD — and picking your hero didn't rebuild it; now `main.gd repick_bot()` rebuilds red from the run's seed when you pick. (2) The per-run shuffle drew from a freshly seeded RNG in a way that often left the order untouched (every run KYLE, CHAD, KAREN, BECKY); it now sorts the heroes by a per-hero hash of the seed (even: ~500 of 2000 runs per hero first). Checked the wider pattern: the shop's and red's seeded rolls draw evenly (no bias), and after a run the game resets before hero select, so round 1's towers / creeps / red build are always fresh — red's hero was the only thing built from the missing seed.
- **2026-10-09** — Red's hero order: the four heroes are shuffled once per run (seeded) and that order repeats all run — every hero once every 4 rounds, never twice in a row. Was rolled independently each round (the KYLE run met red KYLE in rounds 5–7 and 11–12 back to back).
- **2026-10-08** — Red KYLE's BOOP (from the 2026-10-08 run: 42 of 52 BOOPs were combo pulls, half with nothing cast after, and none used to escape): it only opens a combo with BOOP when a damage ability is ready to follow; below 50% health it keeps BOOP for getting away (unless it's a kill); its escape BOOP fires when you're chasing within its push reach ×1.2 (was within 1.6× its radius).
- **2026-10-08** — KAREN's GRIND ×1.5: 120 / 160 / 200 → 180 / 240 / 300 (heroes); creeps take 150% of that (multiplier 2.0 → 1.5): 270 / 360 / 450 a full spin. Creep heal (3 a cut) kept.
- **2026-10-08** — KAREN's GRIND, toward a minion muncher: creeps take 200% (was 150%: a full spin 240 / 320 / 400 to each creep), and each cut on a creep heals her 3 (8 cuts a spin: up to ~120 through a 5-creep wave).
- **2026-10-08** — BOOP's ring carries everything it meets on its way to the outer circle (radius + push: 280 at I) — anyone inside it, or walking into it mid-sweep. It used to catch only units within the inner 160 when it went off, so red running through the band between looked inside your BOOP and was swept straight over (your last game). The windup and aim now show the one circle that matters. (Play log: your casts record where they were aimed.)
- **2026-10-08** — KYLE's PUNISH radius ×0.75: 345 → 260 (level II 390 → 290).
- **2026-10-08** — BOOP is a snowplow with ease-out: after the windup a ring bursts from the centre to radius + push over 0.3 s (fast, then slowing) and carries each caught unit as it reaches it — nobody moves until the ring meets them; damage and tether-snapping happen at that contact. Was: everyone inside slid out at a constant speed at once. Look: an outer circle (how far the push goes) from the start, the catch area filling in during the windup, then the inner ring (the push) sweeping out to it; the aim shows both circles.
- **2026-10-08** — SHOCK's douse also slows the doused enemy's movement 15% for 1.5 s.
- **2026-10-08** — KYLE's SHOCK douses: its blast does +30% to an enemy burning from his IGNITE (80 → 104 at I, shown big) and puts that burn out (after the hit, so a kill still spreads Kindling). Standing in IGNITE re-lights them next tick. Echo's half-strength repeat finds them no longer burning.
- **2026-10-08** — KYLE's attacks on an enemy burning from his IGNITE now restart the burn at its full length (2 s, +2 s per Kindling) — was +0.5 s a hit up to that length. Keep hitting and they keep burning.
- **2026-10-07** — KYLE: WRAITH replaced by **BOOP** (E): a circle at the cursor (range 700, radius 160); after 0.2 s everything inside — enemy and own creeps, heroes, KYLE himself — slides out to 120 px past its edge (over 0.25 s), enemies take 30; tethers (POUNCE) snap; towers / totems / decoys / siege minions stay put; Afterimage fires when it shoves KYLE. Levels: 40 dmg, radius 180, cd 9 → 50 dmg, radius 200, push 160, cd 8. Cast behind someone to knock them toward you / into IGNITE, or between you to knock you apart (an escape). Red's bot: combo BOOP from behind → IGNITE → SHOCK → PUNISH (also against a runner); BOOPs a low, fleeing you back toward it; escapes with BOOP between you when you're on top of it or have it tethered; counts your BOOP as your escape when judging whether you're open.
- **2026-10-07** — KYLE: his attacks on an enemy burning from his IGNITE add 0.5 s to the burn, up to its full length (2 s, more with Kindling) — a steady stream of attacks stretches a 2 s burn to ~5 s. IGNITE's text says so. (Creeps worth no gold: grey slash made subtler — tint 70% → 45%, thin translucent sign.)
- **2026-10-07** — CHAD trimmed (both sides): attack 45 every 0.6 s → 40 every 0.65 s (75 → 62 damage a second, still ~1.8× the next hero), POUNCE tether 1.5 s → 1.2 s. His attacks out-damaged everyone 2.1–2.7× and POUNCE's long reach + tether let them land on ranged heroes (red CHAD's attacks were its biggest source, 2749, in the round it killed you 8 times). Speed and POUNCE range kept: they're his identity.
- **2026-10-07** — Bot KAREN (red KAREN never killed you in rounds 3–4 of the 2026-10-07 replay; GRIND hit you 2/18 and 0/16): (1) wave clear is GRIND first; SHOVE only clears when the wave is at her tower and you're far — it's her way into fights ("opener SHOVE not ready" was the most common pass); (2) the fight-odds model counts RAGE as damage over a window (was one 35-damage hit) and shields / BRACE / RAGE's damage cut as health — she rated herself outmatched too often; (3) BRACE only once you've hurt her in the last second (was any time you were within 450 px: 11–16 casts a round); (4) while GRIND spins she walks onto you (within 320 px). ULT COMBO (`combo_book.gd` "ult", used whenever RAGE is ready): RAGE → SHOVE → GRIND → BRACE — swell, charge through (burn, expose +10%), spin in the middle while RAGE's stuns hold them, shield — hero and wave together. Her normal combo is SHOVE → GRIND → BRACE.
- **2026-10-07** — Bot: brawler retreat line 20% → 30% health (all 6 of red's deaths in the CHAD run came while running — at 20% it couldn't get out of CHAD's STARS / POUNCE range); "notice" rolls (danger, outmatched, an opening, a low you) now hold 4 s instead of 1.5 s, so a dull red misses things for a stretch instead of its wariness flickering (~60 flips a round at smartness 0.3–0.44).
- **2026-10-07** — Key runs (from the 2026-10-07 CHAD run's red log): the creep red sends now walks straight into your tower's range (`creep.gd dive_to`) — a freed creep used to stop to fight your creeps short of the tower, the shield never opened, and red stood at its waiting spot taking hits ("freezing"). A run no longer starts with you within reach of red (+150), or with a walk over 1500 px to the waiting spot unless you're dead long enough to cover it (it once walked a creep 3500 px from its base with you beside it); one under way ends at once if you come within reach ("contested", then 12 s before the next). Check batch: 3 of 12 runs damaged the tower (was ~1 in 20), no loops.
- **2026-10-07** — Bot fixes found by the new red logging (round 6–8 BECKY replay): (1) red never retreated with you near it in rounds 1–9 — its hesitation timer counted past zero, which read as "not hurt yet" and re-armed the hesitation every decision; it died at 4–14% health choosing hold / push / trade (3 deaths to creeps in 3 rounds). The timer now stops at 0. (2) red aimed SHOCK at x 17,754: it leads shots by your velocity, which a blink / dash / respawn made huge for a frame; hero velocity is now capped at 1.5× move speed.
- **2026-10-07** — Bot hold slack (`bot.gd` HOLD_SLACK 60 px): a holding bot stays put while its spot is within 60 px. The spot follows its front creep, which jostles every frame in a melee scrum, and the bot shuffled after it — the last "hold" loops `autoplay --osc` found (4 → 0 in the same 6 round-10 games). `--osc` now prints a trail (position + decision every 0.25 s) with each loop.
- **2026-10-07** — Key runs, after 30+ test games: red now lets its creep go at the waiting spot (a free creep walks into your tower's range by itself) and attacks only once the shield is open — before, it walked in ahead of its creep and got shot (the most common ending). A run ends if your tower targets it; overtime openings have hysteresis (start: you well away from your tower; carry on until you're within reach); red doesn't start one while its tower is being hit, and a run closes for defence only if you're at its tower; after you come back to stop one it waits 12 s (was 4) before the next. Totem trips end on retreat or wariness. `autoplay` gained `--start-round N`, `--no-key`, `--no-totem` and KEY / TOTEM traces in `--osc`.
- **2026-10-07** — Bonus creeps pay no gold: Tank Minion's tank, Reinforcement's extras, red's late extras (round 15+) and overtime's extras have bounty 0, so buying creeps never feeds the other side's farm. Creeps worth no gold (these, risen Recruit creeps, and every creep in overtime) are drawn grey with a "no" slash (ring + diagonal bar), show no last-hit window, can't be denied, and aren't counted as missed last hits; bots don't time last hits on them (they still kill them to push).
- **2026-10-07** — Leashing with a purpose + the totem. (1) Red's KEY runs (`bot.gd`): when your shield is up and its creeps aren't about to arrive, it leashes a creep (tank > melee > ranged), waits for it just outside your tower's range, then goes in; only with you dead ≥6 s or overtime with you far from your tower; ≥40% health to start; holds 3–20 s, 4 s apart; ends when the creep dies, the opening closes or your tower shoots it (then backs off). Retreating releases its leashed creeps. (2) Leashed / latched creeps are high-value targets: bots pick them as if 250 px nearer, and a defending bot kills the creep holding its shield open first. (3) Totems (`totem.gd`, `lane.gd` TOTEM_*): from round 6, one per side at x ∓1000, y 560 (well off the lane), first at 1:30; a creep you lead into its ring latches (off the leash) and hits only it; only its side's latched creeps hurt it (3000 health, ~75 s for 2 melee); it wears each down (dead in ~80 s); destroyed → 2 siege minions with that side's next wave, rises again 45 s later. Rally Cry counts for latched creeps. Bot v1: pushers / farmers (any red from round 10, or with leash cards) take creeps there every 25 s at most, max 3 latched; from round 10 it contests yours past half full. Fix: a leashed creep reading a freed attack target (`creep.gd`).
- **2026-10-06** — Tower shields no longer drop in overtime (`lane.gd` OVERTIME `shield_drops` false): heroes always need one of their creeps in range to hurt a tower (leashed ones count); creeps and siege minions hit it as before. Tower damage vs creeps scaling made a knob (`TOWER_CREEP_SCALE` 1.0: a full wave lasts ~14 s under a tower in round 10, as in round 1).
- **2026-10-06** — Late-game pass. (1) Towers' damage against creeps grows with the round (× lane growth, the same factor as creep health: 110 → 201 in round 10); against heroes it stays 110. Logs showed late towers going from full to rubble in 16–23 s before overtime (rounds 4, 6, 10, 11) because tower health grew with the round but its damage didn't, so waves lived far longer under it. (2) Overtime: abilities cost 25% less mana and their cooldowns run 25% shorter, ultimate included, for both heroes (`lane.gd` OVERTIME `ability_haste` 0.25, `haste_ult` true); the overtime banner and How to Play say so. (3) Red's late ramp: from round 12 all of red's stats (creeps, tower health and damage, hero health and damage) climb +5% a round with no cap (`run.gd` RED_RAMP_FROM 12, RED_RAMP_STEP 0.05: ×1.05 in round 12, ×1.20 in 15, ×1.45 in 20), so every run ends sometime.
- **2026-10-06** — Card audit, second batch: Serrated's 2 s bleed no longer carries TRAP's bigger in-zone bonus out of the zone (two bleeds tracked apart, the bigger running one counts); Overclock's extra mana shows in ability tooltips and red's bot counts it when judging fights; Spite forgets an expired shield's giver; Aftershock can't fire while you're dead, its and Second Wind's cooldowns tick while dead, Tank Minions never stun a decoy; death clears burns, bleeds, slows, blind, marks, stun and shield; Kindling never spreads to a decoy and the spread copies the burn's full length; Vampirism heals off damage soaked by shields and not off overkill; Cold Read ignores towers; leashed melee creeps get Vanguard's shield; tooltips show Reserve's 2 charges and Kindling's longer burns; Homeguard counts you in tower range by your edge, like the tower does. Left as is: Spite doesn't reflect tower shots, Spite kills pay like any kill, Kindling's 150 and +2 s stack per copy as the text reads.
- **2026-10-06** — Bug fixes from the card audit: Esc as a round ended let the game run behind the shop (red killed you 18 s after round 3); Rally Cry max 2 + damage cut capped at 75% (4 copies healed creeps); Glass Cannon max 2 + max health floor 20%; Reserve now works on SHOCK's orb; red's bot loses track of you behind Afterimage too (attacks, combos, stutter-steps, Twin Shot); Echo + GRIND adds a half-strength spin instead of restarting GRIND (SHOVE ends both), Echo + SHADE fires its beam at once without a second plant and not if the first was cancelled; risen Recruit creeps can't be denied; Bargain is a real discount from the first reroll, no longer rewinds the shop seed or counts as a pick; Spellblade's charge is spent only when it lands on a unit, its +40 isn't multiplied by on-hit cards, its slow skips towers.
- **2026-10-06** — Bot decision loops fixed (red CHAD stepped in and out of your reach 78 times in 40 s in round 10 of the 2026-10-06 run). Every back-off now holds: a danger retreat lasts until clear of your reach (+150 px) then 2.5 s shy; getting shot by your tower makes its range unsafe for 3 s; a dropped combo blocks new ones for 3 s; pressing a low you holds 3 s and never while wary; wary bots stay put within 120 px outside your reach instead of mirroring you; push / deny / clear / defend skip creeps inside your reach when wary or shy; defend and clear keep their creep instead of re-picking; tower-spot and back-off lines match. New `tools/autoplay.gd --osc` flags 8+ turnarounds in 5 s with the decisions flipped between: 10 → 0–1 per 4 runs across 4 seeds (the rest are melee scrums / a tethered bot).
- **2026-10-06** — Bot mistakes look human, never pointless: combo swaps never move the opener or a dash, or the ultimate earlier; steps never fire at empty ground (they wait to reach you); the combo is dropped if you run under your tower or its tower shoots the bot.
- **2026-10-06** — Combo execution follows the skill dial: starts after its (jittered) reaction, jittered reaction-scaled gaps, the round's aim error on every step (dashes too), a 25% chance per step to hesitate (half the round's hesitation), and dumber bots may swap two steps (up to ~25%) or fumble one. Red KYLE's 4 s burst on a standing hero: round 2 ~0, round 6 88, round 10 213.
- **2026-10-06** — Bot commit mode + combo book (`combo_book.gd`, seeded from a 24-order-per-hero combo lab and your logged bursts): when a burst is worth it (could kill you; you're open — escape on cooldown, out of mana, abilities spent — and it'd take 35%+; or it's ahead and in the mood: personality × smartness) it chains its hero's combo ~0.3–0.45 s between casts instead of one ability per cast gap, closing in for each step; sloppier early (slower, may fumble a step). Orders: KYLE WRAITH > IGNITE > SHOCK > PUNISH, CHAD POUNCE > STARS > FLURRY > TRAP, KAREN SHOVE > BRACE > GRIND > RAGE, BECKY SHADE > RUMOR > FALLOUT (runner: FALLOUT first). Test vs a passive hero at 70%, 4 s: KYLE ~0 → 217, CHAD 449 → 489, KAREN 207 → 223 (BECKY mostly backs off a KYLE that could kill it).
- **2026-10-05** — Bots defend the core: their tower took damage in the last 2.5 s → all in on what's hurting it (you first if you're near it — every ability at you, ultimate included once it's learned; else the creeps on it with every clear ability, no mana kept). Comes right after retreating, before pressing and the personality order.
- **2026-10-05** — Bot casts aimed at you also try to catch your creeps: area blasts shift toward a clump while you stay well inside, beams / piercing shots turn onto a line through creeps that still passes through you. The heroes-only ability flag is gone entirely.
- **2026-10-05** — Bots never freeze: pushing matters more here than in other MOBAs. Farmer's push-only-when-you're-away and the wary freeze are gone (with you near they still push only from behind their wave); the brawler now casts on creep clumps; red's CHAD clears with TRAP too (it was flagged heroes-only for the bot, though it always hit creeps).
- **2026-10-05** — SHOVE: the 25% move slow → exposed (−10% armor: +10% damage taken from everything) for 3 s, a teal ring. The KAREN bot's wave clear now opens with SHOVE through the clump, then GRIND.
- **2026-10-05** — Bots: a hero-aware wave clear step ("clear": your creeps pressing its tower → its clear abilities aimed at the most creeps + attacks on the weakest; keeps 25% mana unless they're at the tower) and press-the-advantage (you dead 8+ s, or low and far, and it's healthy → clears with everything, walks in with its wave, hits your tower). Red out-farmed and out-fought you in rounds 8–11 of the 2026-10-05 run but never pushed; tower damage while you're dead +40–110% in tests.
- **2026-10-04** — Bot free hits, as a default only: when a decision finds nothing to do (holding its spot) and its attack is ready, it shoots what's in range (your hero, a creep it can finish, the weakest creep, a tower it may hit) instead of standing idle. First version fired whenever possible, even mid-walk, and the bots ended up doing little but auto-attack.
- **2026-10-04** — Bots stutter-step when trading: after each shot they step (kite out of a shorter-ranged hero's reach, or follow a fleeing one) and turn back just before reloading (lead = 0.08 + 0.3 × reaction). Odds = smartness × personality (opportunist / farmer 1.0, standard 0.8, brawler 0.6, pusher 0.3). They used to stand still between every shot.
- **2026-10-04** — RUMOR blinds: every enemy it hits (heroes, creeps, towers) misses the next round of attacks of theirs that lands (even one already in the air; both Twin Shot shots) — a "MISS" puff, a dashed pale ring until then.
- **2026-10-04** — RUMOR radius 190 / 220 → 145 / 165 (75%): didn't need to cover a whole wave.
- **2026-10-04** — BECKY attack 20 → 25 (22 → 28 DPS): last hits and tower damage were her weakest everyday numbers.
- **2026-10-04** — SHADE range 950 → 760 (80%). Full damage still from 600.
- **2026-10-04** — Siege minions: in overtime every hero death (any cause) sends an untouchable siege minion with the other side's next wave; it walks to the enemy tower and explodes for 10% of its max health (a fixed chunk, `siege_minion.gd` `DAMAGE_SHARE`). Round 4 of the 2026-10-04 BECKY mirror sat 4 minutes with neither tower touched.
- **2026-10-04** — BRACE: creeps' shield = 15 / 20 / 25% of their own max health (was half the hero shield, 60 / 85 / 110): it grows with the creeps every round instead of fading. Heroes keep 120 / 170 / 220.
- **2026-10-04** — KAREN's kit works together: everything castable during everything; during RAGE, GRIND and SHOVE hits apply RAGE's burn (and reach further with the bigger body); SHOVE ends a GRIND; GRIND cast mid-SHOVE starts when the charge ends; nothing else interrupts GRIND (stuns don't, for now). GRIND +50% vs creeps.
- **2026-10-04** — Bargain (common 100, shown once per run): when bought, halves your current reroll cost (not below 50). A lucky shop can soften the run-long reroll climb; red doesn't buy it (it never rerolls).
- **2026-10-04** — Reroll cost no longer resets each round: 50 + 25 per reroll so far this run. Gold could replace luck (5 rerolls a shop every round); breaking the game should need luck.
- **2026-10-04** — Stack caps (audit): Overclock max 1, Adrenaline max 2, Kindling max 2, Spite / Cold Read / Serrated max 3; cooldown cards cap at −60% total (Overcharge on top, ultimate never below 20%). Overclock ×3 + Haste had made cooldowns negative; Spite ×4 reflected more than it soaked.
- **2026-10-04** — Red's priority lists take the new cards, by personality (brawler: Serrated, Second Wind, Spellblade, Cold Read, Aftershock, Spite…; farmer: Keen Eye, Clean Finish, Bounty Hunter, Homeguard, Recruit…; pusher: Rally Cry and the new wave cards; opportunist: Hunter's Mark, Kindling, Cold Read, Spellblade…). Nobody buys Glass Cannon, Overclock or Heavy Hands. Bounty Hunter no longer an economy card.
- **2026-10-04** — /cards: 25 new cards built from the Cards view — commons Scavenger, Heavy Hands, Homeguard, Rally Cry, Adrenaline, Keen Eye, Clean Finish; rares Kindling, Cold Read, Serrated, Spite, Second Wind, Siege Breaker, Glass Cannon, Overclock, Spellblade; epics Aftershock, Reserve, Afterimage, Hunter's Mark, Recruit; wave Vanguard, Sappers, Pathfinders, Standard Bearer. Bounty Hunter: +25 gold per last hit → attacks on creeps below 25% land instantly (no gold cards left). Red doesn't buy the new cards yet.
- **2026-10-04** — WAVE row rolled like the other tiers: 3 random wave cards a round (rerolled with the rest; a bought card stays until maxed); red rolls its own.
- **2026-10-04** — BECKY rework (try-out): LANCE → SHADE (0.35 s planted windup with a warning line, stun / GHOST cancels; damage 60% close → full at 600; 75/100/130 → 85/110/140), ORB → RUMOR (min range 250; radius 220/260 → 190/220), BLINK → GHOST, METEORS → FALLOUT.
- **2026-10-04** — KYLE's abilities renamed: Bolt → SHOCK, Blast → IGNITE, Dash → WRAITH, Nova → PUNISH.
- **2026-10-04** — Ability descriptions: plain descriptions only (no advice or spin): BRACE loses its pushing tip, RAGE its 'harder to miss'.
- **2026-10-03** — GNAW → GRIND (says spin and teeth).
- **2026-10-03** — CHAD abilities renamed: Fan → STARS, Caltrops → TRAP, Rush → POUNCE (FLURRY unchanged).
- **2026-10-03** — Visual cue standard: one colour per status on both the zone and the unit, status rings nested round the unit (burn orange, bleed red, slow violet, shield white-blue outermost). KYLE's elaborate fire / lightning looks off (`Blast.ELABORATE`), BOLT keeps its in-flight crackle; slow pale blue → violet; bleed gets a ring; METEORS orange → stone (it doesn't burn).
- **2026-10-03** — Heroes get people names, and the class names (Arcanist, Striker, Bulwark, Oracle) are gone everywhere: KYLE, CHAD, KAREN, BECKY (constants in heroes.gd). Run History maps old logs.
- **2026-10-03** — Shield bubble: shiny white-blue, rim 2 px + 1 px per 20 shield (max 10). GNAW → GRIND; GRIND's corners get equilateral teeth.
- **2026-10-03** — All ability names in capitals; TURTLE → BRACE.
- **2026-10-03** — KAREN abilities renamed: Whirl → GNAW, Guard → TURTLE, Shoulder Charge → SHOVE (RAGE unchanged).
- **2026-10-03** — RAGE bodies enemies: full shove on contact, 30 px bump per contact hit, 0.25 s mini stun per enemy at most every 1.5 s.
- **2026-10-03** — Whirl: the body itself grows and spins, corners do the damage (reach ≈ 56 → 70 px, was a 140 → 175 ring — far too wide).
- **2026-10-03** — KAREN rework: Whirl (spin), Guard (shield incl. creeps), Shoulder Charge (knockback), RAGE (swell + contact burn) replace Slam / Shockwave / Charge / Quake; numbers pitched against CHAD's levels.
- **2026-10-03** — Opportunist: home leash removed (stayed within 500 px of its tower → 4 last hits a round); holds 160 behind its wave, pokes with ranged abilities freely (close-up / ultimate on openings), pushes like the rest.
- **2026-10-03** — Bot last-hit odds start 60% → 75%, +3%/round (was +5%), still 95% from round 8: early bots took too few last hits.
- **2026-10-02** — Bots push: with nothing to last-hit they attack the nearest enemy creep (freeze only when wary with you near; farmer / opportunist push only while you're away); heroes-only personalities clear waves with abilities while you're away; no hesitation with nobody near. Red stood still behind its wave for 7 s while you were away.
- **2026-10-02** — Mana: KYLE 400 → 500, CHAD 300 → 500, KAREN 350 → 450, BECKY 500 → 550.
- **2026-10-02** — Fix: round 1's ultimate now also starts on cooldown (picking a hero had reset it; first Flurry came at 0:22).
- **2026-10-02** — Creep gold no longer grows with lane growth: flat 24 / 33 / 42 every round (hero kill bounty still grows).
- **2026-10-02** — Waves every 30 s → 20 s; creep gold × 1.5 → × 0.6 then × lane growth (24 / 33 / 42 in round 1); hero kill 200 → 120 × lane growth. Target: a good round 1 ≈ one epic (630), scaling steadily.
- **2026-10-02** — Reaction and hesitation vary ±20% around the round's value (hesitation was random 0..max; reaction was exact).
- **2026-10-02** — Bot self-preservation: wary when outmatched (keeps outside your reach, skips last hits in it) and danger-aware retreat (your ready burst could kill it, or you're faster). Red BECKY died 7 times in melee range, often while retreating.
- **2026-10-02** — Midas removed (epic, last hits pay double): with Bounty Hunter ×2 it made a last hit worth 220–260 gold and an 8,464-gold round.
- **2026-10-02** — Win gold +200 → 0: your income already dwarfs red's.
- **2026-10-02** — Death timer 6 s flat → 8 s + 2 s per 30 s of the round (both sides): kills buy bigger push windows as a round goes on.
- **2026-10-02** — Bot: power-aware trading (must win the damage race by `race_need`) and a chase limit (`chase_depth` past the middle). Red died 9 times a round in rounds 1–2 of a CHAD run, mostly fighting lost trades in your half.
- **2026-10-02** — Red shop buys from a per-personality priority list (was: priciest affordable card — it bought Command twice and Midas in round 1).
- **2026-10-02** — `ABILITY_VS_STRUCTURES` 1.0 → 0.5: CHAD killed a 3,480 HP tower in ~8 s.
- **2026-10-02** — BECKY signature opportunist → farmer (try-out): the opportunist camped at its tower.
- **2026-10-02** — Fan's stars cut through creeps and stop at the first hero (was: stop at the first enemy). CHAD's wave clear was weak next to the AoE heroes.
- **2026-10-02** — Caltrops finale damage 30 flat → 60 / 80 / 100 by level.
- **2026-10-02** — **Tower Vision**: creeps inside an enemy tower's range attack only the tower (was: creeps, heroes, then the tower).
- **2026-10-02** — Field taller: edges ±650 (was ±400, tapering from x = ±1300), following the towers' range circles round to the wells.
- **2026-10-02** — Lane growth is a straight line, 1 + 0.0925 × (round − 1): the best linear fit to the average-player damage model (1,000 gold/round, average pick 258 base / +3.14%).
- **2026-10-02** — Lane growth is now a model: 1,000 gold a round buys average picks (258 base, +3.14% damage each) at rising prices; growth = 1.0314^picks (replaces the sim-fitted curve).
- **2026-10-02** — Lane growth now tracks measured player damage growth: 1 + 0.013 × (round − 1)² to round 8, then +0.12/round (was a straight +150 tower HP / +4% creeps per round).
- **2026-10-02** — **Lane scaling, both sides alike**: towers 2,000 + 150/round (was a flat 3,000), creep health 70% + 4%/round (was 100%). Heroes stay unscaled.
- **2026-10-02** — **Tower shields**: heroes can only damage a tower with one of their creeps (leashed counts) inside its range circle; all or nothing; dropped in overtime. Ends solo sieging (the Longbow BECKY run).
- **2026-10-02** — **Even stats**: red's hero, creeps and tower always equal yours (was 80% → 100% by round 6, +4%/round after; tower 60%, creeps 70% start). Endless engine replaced by beyond-human skill (rounds 10 → 20) and +1 red creep per wave from round 15 (+1 every 5 rounds). Round 1 was "VERY easy" anyway.
- **2026-10-02** — Hesitation becomes an even line 1.0 → 0 over rounds 1–10 (was table steps to 0 by round 5).
- **2026-10-02** — Reaction start 1.0 → 0.7 s (line to 0.25 at round 10); round 1 hesitation 1.2 → 1.0 s. Early bots felt too dumb.
- **2026-10-02** — Smartness start 0 → 0.3.
- **2026-10-02** — Dumb end no longer lowers the retreat point (was 12%); dumb comes back at 75% (was 60%). Early bots never retreated.
- **2026-10-02** — Ultimate cooldowns doubled; ultimates start each round on cooldown.
- **2026-10-02** — Blast: zone damage −20% (100/120/140 → 80/96/112), new burn 10/14/18 per s for 2 s; Dash combo checks burning.
- **2026-10-02** — KYLE signature farmer → opportunist (try-out).
- **2026-10-01** — CHAD kit rework (Caltrops, Rush tether, barbed Flurry and Fan); KYLE Nova radius × 0.75 with edge taper; Dash windup / spirit dash / Blast combo.
- **2026-10-01** — Reaction time and hesitation added to the skill dial; personality ladder and three-dial split.
- **2026-10-01** — +200 gold per win; creep gold × 1.5; overtime 2:30 + 20 s/round (max 5:00); no gold in overtime; red allowance removed; red rally built then switched off.
