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
| **Skill** | How well does the bot *execute*? | cast gap, aim error, reaction, hesitation, last-hit odds, deny odds | human-level by round 9, **beyond human by round 20** |
| **Smartness** | How well does the bot *decide*? | decision speed, blunders, noticing openings, when to trade, coming back, ultimate and siege | round 8 |
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

**Round cycles (2026-10-25).** Red's heroes are a seeded shuffle of the four
that repeats every 4 rounds (`run.gd` `bot_hero_for`), so a run reads as
cycles: **1-4 · 5-8 · 9-12 · 13-16**. You meet every hero once a cycle, so a
gate that fires mid-cycle makes the heroes incomparable — you cannot tell
whether CHAD got harder or you just drew him after the change. Every gate is
now on a boundary, one theme per cycle:

| Cycle | Theme | What opens it |
|---|---|---|
| **1-4** | learn the game | tame minds (`hero_minds.gd` `TAME_UNTIL` 4); no new systems |
| **5-8** | the characters | minds grow; **totems appear** (`TOTEM_FROM` 5, `TOTEM_ALL` 5); smartness finishes across the cycle (`SMART_FULL_ROUND` 8) |
| **9-12** | past human | reaction floors, hesitation ends, `SUPER_FROM` 9; red contests your totems (`TOTEM_CONTEST_FROM` 9); late mind stages (`LATE_FROM` 9) |
| **13+** | the wall | `RED_RAMP_FROM` 13 — red's body grows, uncapped |

Already on a boundary and left alone: overtime capping at round 8, red's
last-hit odds capping at 8, its deny odds at 9. Still mid-cycle: `RED_EXTRA_FROM`
15 (+1 red melee per wave).

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
| Cast gap (s between casts) | 2.6 | 2.0 | 1.5 | 1.1 | 0.9 | 0.81 | 0.73 | 0.66 | 0.60 | 0.58 | 0.53 | 0.46 | **0.35** |
| Aim error (px) | 90 | 65 | 45 | 35 | 25 | 22.5 | 20.3 | 18.2 | 16.4 | 13.8 | 9.8 | 7.6 | **4** |
| Reaction (s, danger → escape; ±20%) | .70 | .64 | .59 | .53 | .48 | .42 | .36 | .31 | **.25** | .24 | .22 | .18 | **.12** |
| Hesitation (s, keeps fighting before retreating; ±20%) | 1.00 | .88 | .75 | .63 | .50 | .38 | .25 | .13 | **0** | 0 | 0 | 0 | 0 |
| Last-hit odds | 75% | 78% | 81% | 84% | 87% | 90% | 93% | 95% | 95% | 95% | 96% | 98% | **100%** |
| Deny odds | 0% | 10% | 20% | 30% | 40% | 50% | 60% | 70% | 80% | 81% | 84% | 88% | **95%** |

- Cast gap and aim error: table for rounds 1–5, then ×0.9 per round down to
  floors 0.6 s and 12 px.
- Reaction: even line 0.70 → 0.25 over rounds 1–9 (cycle 3 opens at the human
  floor). A second escape needs another full reaction.
- Hesitation: even line 1.0 → 0 over rounds 1–9.
- Both vary **±20% around the round's value** each time (`bot.gd` `JITTER`):
  round 1 reacts in 0.56–0.84 s and hesitates 0.8–1.2 s.
- Last hit / deny: one roll per creep when it first becomes a candidate.
- **Beyond human** (`SUPER_FROM` 9, `SUPER_FULL` 20, `SUPER`): from round
  9 every value above blends evenly toward the `SUPER` row, reached at round
  20 (the blend is 0 at 9 itself, so the first increment lands at 10) — 0.12 s reactions, 0.35 s between casts, 4 px aim error, every last hit,
  95% denies. Faster than a person can play; the endless engine now that
  stats are even.

### Smartness (`run.gd`: `SMART_START` 0.3, `SMART_FULL_ROUND` 8; `bot.gd`: `DUMB`, `ULT_SMARTS`, `SIEGE_SMARTS`)

| Round | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8+ |
|---|---|---|---|---|---|---|---|---|
| Smartness | .30 | .40 | .50 | .60 | .70 | .80 | .90 | 1.00 |
| Decides every (s) — dumb 0.6, smart 0.2 | .48 | .44 | .40 | .36 | .32 | .28 | .24 | .20 |
| Skips the right action — dumb 30%, smart 0 | 21% | 18% | 15% | 12% | 9% | 6% | 3% | 0% |
| Notices your openings (= smartness) | 30% | 40% | 50% | 60% | 70% | 80% | 90% | 100% |
| Comes back at health — dumb 75%, smart 90% | 80% | 81% | 83% | 84% | 86% | 87% | 89% | 90% |
| Trades when ahead by — dumb +20%, smart −10% | +11% | +8% | +5% | +2% | −1% | −4% | −7% | −10% |
| Uses its ultimate (from 0.4) | no | yes | yes | yes | yes | yes | yes | yes |
| Sieges your tower (from 0.4) | no | yes | yes | yes | yes | yes | yes | yes |

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

**Tame early rounds (2026-10-25).** The table below is the four reference
*templates* (`personality_templates.gd`), which nothing reads in normal play —
every hero has its own mind (`hero_minds.gd`). Each mind's **base is now its
tame round-1 self** and its first stage, at `TAME_UNTIL + 1` (TAME_UNTIL 3, so
round 4), restores the real numbers. Rounds 1–3: KYLE engage 520 / chase 250 /
trade_cap 0.70 / dash_at 0.30, no keep_burning or boop_peel, deny_lurk 0.3 ·
CHAD engage 420 / chase 250 / trade_cap 0.75 / dash_at 0.35 / hunt_at 0.12, no
drag_to_trap, capsule_tow 0.4 · KAREN engage 320 / chase 250 / trade_cap 0.75 /
dash_at 0.35 / threat 150, no bully_reach, shove_peel or bully_when_behind ·
BECKY unchanged but deny_lurk 0.4. From round 4 every value is what it was
before. Knob: `TAME_UNTIL` (hero_minds.gd).

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

Card modifiers on last hits: no card adds gold any more; Refund +20 mana; Elegance −1 s ultimate cooldown. (Midas, "last hits pay double", was removed 2026-10-02.)

### Gold out

| Sink | Value | Where |
|---|---|---|
| Dying | lose 15% of carried gold, max 300 — to the enemy hero if it got the kill | `hero.gd` `DEATH_GOLD_LOSS`, `DEATH_GOLD_CAP` |
| Rising prices | every pick (card or level) raises all prices 8% of base, rounded to 5 | `run.gd` `PRICE_RISE` |
| Rerolls | none — the shop has no Reroll button; the Gamble card rerolls once per run | — |

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
  a list are never bought: Command, Wonderpets, Siege Breaker only by the pusher
  (the only one that leashes / sieges); Scavenger never by the pusher (it never
  denies), Recruit and Homebody only by the farmer; Glass Cannon, Overclock and
  Heavy Hands by nobody (a bot can't play their downside).

| Personality | Priority list (best first) |
|---|---|
| Brawler | Red Drink, Chunk, Hands, Serrated, Suck, Second Wind, Colossus, Spellblade, Snap, Twin Shot, Amp, Aftershock, Hunter's Mark, Drip, Efficiency, Spite, Shoes, Overcharge, Echo, Reserve, Afterimage, Flamable, Executioner, Clean Finish, Elegance, Scavenger, Tank Minion, Reinforcement, Vanguard, Standard Bearer, Siege Training, Healing Aura, Blue Drink, Trickle, Kobe, Refund |
| Farmer | Amp, Efficiency, Blue Drink, Trickle, Refund, Keen Eye, Clean Finish, Excess, Echo, Reserve, Overcharge, Executioner, Elegance, Homebody, Afterimage, Second Wind, Scavenger, Recruit, Red Drink, Chunk, Hands, Kobe, Drip, Shoes, Colossus, Twin Shot, Healing Aura, Reinforcement, Tank Minion, Siege Training, Suck |
| Pusher | Reinforcement, Siege Training, Tank Minion, Command, Wonderpets, Sappers, Vanguard, Standard Bearer, Pathfinders, Healing Aura, Siege Breaker, Hands, Chunk, Twin Shot, Amp, Red Drink, Efficiency, Shoes, Colossus, Overcharge, Echo, Drip, Blue Drink, Trickle, Kobe, Suck, Executioner, Refund |
| Opportunist | Amp, Overcharge, Echo, Efficiency, Hunter's Mark, Flamable, Snap, Spellblade, Reserve, Afterimage, Blue Drink, Red Drink, Shoes, Trickle, Colossus, Second Wind, Suck, Chunk, Hands, Drip, Twin Shot, Executioner, Keen Eye, Clean Finish, Elegance, Scavenger, Kobe, Tank Minion, Reinforcement, Siege Training, Healing Aura, Refund |
| Standard | Amp, Red Drink, Chunk, Hands, Efficiency, Spellblade, Second Wind, Overcharge, Colossus, Twin Shot, Echo, Hunter's Mark, Reserve, Suck, Drip, Shoes, Clean Finish, Keen Eye, Elegance, Blue Drink, Trickle, Executioner, Excess, Kobe, Tank Minion, Reinforcement, Vanguard, Siege Training, Standard Bearer, Healing Aura, Sappers, Pathfinders, Scavenger, Refund |
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
| Common (100) | Chunk | +10 attack damage |
| | Hands | +10% attack speed |
| | Red Drink | +200 max health |
| | Blue Drink | +150 max mana |
| | Shoes | +20 move speed |
| | Drip | +8 health regen |
| | Refund | +20 mana per last hit |
| | Scavenger | denying a creep: +25 mana, +40 health (before overtime) |
| | Heavy Hands | attacks +40% damage, 25% longer between them |
| | Homebody | inside your tower's range (650): +20% ability damage, take 20% less ability damage (burns and bleeds not reduced) |
| | Wonderpets | leashed creeps +20% damage, −20% damage taken (max 2; damage cut capped at 75%). Totem-latched creeps don't count |
| | Elegance | each last hit: −1 s on the ultimate's cooldown (max 2) |
| | Keen Eye | attack shots fly 50% faster |
| | Clean Finish | attacks +15% vs creeps below half health |
| | Gamble | when bought: every shop offer rolls again (free). Max 1 per run; offered every round until bought. Doesn't count as a pick |
| Rare (250) | Amp | +20% ability damage (max 3) |
| | Efficiency | −15% cooldowns |
| | Kobe | +100 attack range |
| | Suck | heal 8% of damage to creeps, 16% to heroes |
| | Excess | every 5th attack (at your target; Twin Shot / Spread extras don't count) bounces to up to 3 enemies within 250 of its target for 50% damage, no towers |
| | Trickle | +8 mana regen |
| | Flamable | burns +1 s; a unit dying while burning ignites the nearest of its side within 150 (max 2) |
| | Snap | slowed enemies (move or attack slow) take +12% damage from you, and that hit ends all their slows (max 3) |
| | Serrated | your attacks make heroes bleed 2 s: your attacks on them +10% (max 3) |
| | Spite | shields on you or given by you reflect 30% of what they soak at the creep / hero that hit (max 3) |
| | Second Wind | below 30% health: 150 shield for 3 s, once per 40 s |
| | Siege Breaker | attacks +40% damage to towers |
| | Glass Cannon | +35% ability damage, −20% max health (max 2; max health never below 20% of base) |
| | Overclock | −30% cooldowns, abilities cost +40% mana (max 1) |
| | Spellblade | after a cast, the next attack +40 damage and slows 20% for 1 s |
| | Deflation | each pick raises your prices 5% instead of 8% (max 1; run.gd PRICE_RISE, red's own prices unaffected) |
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

Cooldown cards (Efficiency, Overclock) add up to at most −60% (`ability_info.gd` `COOLDOWN_CAP`); Overcharge halves the ultimate on top, never below 20% of it (`ULT_FLOOR`).

**Stacking rules** (`unit.gd`, 2026-10-14):
- **Spell power adds**: Amp, Glass Cannon and Homebody's near-tower bonus sum; Overcharge (ultimate) and red's difficulty multiply on top (`hero.gd` `ability_scale`).
- **Armor multiplies**: RAGE, Homebody's ability cut, Wonderpets' creep cut all multiply in `armor_mult` (stacked cuts shrink, never immunity). Exposed (+10% taken) and Snap (+12%) multiply on top.
- **Statuses, per source**: the same source again refreshes (stronger replaces with its own time, equal tops the time up, weaker ignored). **Different sources add**: move slows (cap 80%, `MOVE_SLOW_CAP`), attack slows (cap +200%, `ATTACK_SLOW_CAP`), shields (cap 100% of max health, or the biggest single shield, `SHIELD_CAP_PCT`; soaked soonest-expiring first), bleeds (TRAP + Serrated). Caps are loose on purpose: stacking may get wild, trim later.
- **One at a time**: burn (strongest), exposed (strongest). **Control never stacks**: stun (longest), blind (on/off), tether (replaces).

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
| Melee | 500 base (× lane scaling) | 21 | 1.0 s | 18 | 240 | 60 | 1 |
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
| KYLE | 700 | 360 | 500 / 6 | 30 every 0.8 s | 38 | 420 |
| CHAD | 800 | 400 | 500 / 7 | 35 every 0.65 s | 54 | 150 |
| KAREN | 1,000 | 320 | 450 / 5 | 35 every 1.0 s | 35 | 140 |
| BECKY | 650 | 340 | 550 / 9 | 25 every 0.9 s | 28 | 520 |

All heroes: 2 HP/s regen, 2 leash points. **D** (Guard in code), every hero, outside
the Q W E R slots (no levels, no mana): a 300 shield for 2 s (whichever runs out
first); as it goes up it clears every harmful status (slows, burn, bleed,
exposed, blind, stun, tether, marks) and for 0.5 s none can land. Works while
stunned. 60 s cooldown (`hero.gd` `GUARD_*`). Red uses it a beat after being
locked down with you close, or when low and being hit (0.6 s → 0.15 s reaction
with smartness). It reaches for it readily, slows included — on purpose:
baiting red's Guard, then going in while it's down, is a play (user, 2026-10-15).
Respawn: see the death timer in
section 4 (Training: 6 s).

---

## 8. Hero kits

Levels I → II → III. "cd" = cooldown, "—" = unchanged.

### KYLE — zone-control mage that dives on purpose (reworked by the user)

| | Ability | I | II | III |
|---|---|---|---|---|
| Q | **SHOCK** — orb (lightning look) flies up to 450 at 900/s; press Q again to burst early, else bursts at the end | 80 dmg (+50% to an enemy burning from IGNITE, puts it out, slows 15% 1.5 s), radius 80, cd 5, 50 mana | 105, r 95 | 130, r 110, cd 4 |
| W | **IGNITE** — 0.55 s warning, then a fire zone for 1.5 s (6 ticks); nearest-to-centre full, others × splash; touched enemies **burn** after leaving | 80 dmg, r 128, splash 50%, burn 14/s × 2 s, range 700, cd 8, 80 mana | 96, r 150, burn 18/s | 112, splash 75%, burn 22/s, cd 6.5 |
| E | **BOOP** — a circle at the cursor; after 0.2 s everything inside (heroes, creeps, KYLE too) slides out to `push` px past its edge, straight from the centre, over 0.25 s; enemies take its damage; tethers snap. Towers, totems, decoys, siege minions stay put. Afterimage fires if it shoves KYLE | 30 dmg, range 700, radius 160, push 120, cd 10, 60 mana | 40, radius 180, cd 9 | 50, radius 200, push 160, cd 8 |
| R | **PUNISH** — shockwave, full damage at the centre down to 50% at the edge | 200 → 100, r 345, **cd 60**, 150 mana | 270 → 135, r 390 | 350 → 175, **cd 48** |

Level I burst if all lands: ~400–420.

### CHAD — sticky melee duelist (reworked)

| | Ability | I | II | III |
|---|---|---|---|---|
| Q | **STARS** — spinning barbed stars in a spread, range 600; each cuts through creeps (hitting each once) and stops at the first hero or tower | 3 × 55, spread 18°, cd 7, 45 mana | 4 × 60 | 5 × 70 |
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
| `LIFESTEAL_VS_HEROES` | 2.0 | Suck (Vampirism) heals this × its base % on hero damage |

Any ability can override with `vs_heroes` / `vs_creeps` / `vs_structures`
(none do yet).

### Ability damage scaling (`ability_info.gd`, used by casts and tooltips)

- Damage × (1 + Amp) × (1 + Overcharge's +30%, ultimates only) × red's damage stat.
- Cooldown × (1 − Efficiency) × (1 − Overcharge's 50%, ultimates only).

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
| Economy: win gold, prices, rerolls, red shop | `scripts/run.gd` | `WIN_GOLD`, `PRICE_RISE`, `RED_*` |
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

- **2026-10-25** — A wary red **pokes** instead of freezing: the wary gate in `_farm_target` becomes `_poke_ok`, a new judgement (bot.gd, `POKE_BITE` 0.35). Wary was binary — either red played its whole order at full reach, or it held outside your threat and skipped every creep, capsule, push target and combo target inside it. There was no middle, so being behind switched off red's income and kept it behind. Now it may lean up to 35% into your reach for a last hit, judged at the spot it would **stand** to take the shot rather than at the creep, so attack range buys safety: a ranged hero farms under pressure, a melee one takes real risk for the same creep — character for free. Still gated while wary: pushing, clearing, denying, capsules, combos, chasing. Deliberately not safe — red can misjudge the lean and eat a combo for one creep, which is the mistake a person makes; `_in_danger` is a separate check on a separate roll, so it still bails out of burst it can see. The step back out needs no code: `order_attack` walks it to the creep and the next decision's `_lane_spot` pulls it back out with the `WARY_BAND` hysteresis already there. Trim knob: `POKE_BITE` 0.35 → 0.2 if red dies farming, → 0.5 if it still starves. Pairs with the `WARY_RACE` change below — that one makes red go wary less often, this one makes it cost less when it does.
- **2026-10-25** — Red's "outmatched" bar stops borrowing the trade knob: `WARY_RACE` was a multiplier on `race_need` (×0.8), now it is its own absolute bar, **0.7** for every character (bot.gd). Why: `race_need` is documented as the TRADE gate — how hard a personality plays — and `_pv` blends it toward the personality's own value as smartness rises, so the cautious characters became the ones that froze. BECKY (race_need 1.2) called herself outmatched at a race of 0.96, almost even: in the run of 2026-10-25 21:38 she ran `wary 89%` in round 8, held for 73% of it, **took zero damage** and lost in 2:56 — while the same BECKY at smartness 0.6 in round 4 dealt 8,867 damage and nearly won the round. Wary blocks farming, pushing, totem trips and pressing at six call sites, so once red was behind on picks it could not farm, which kept it behind: rounds 8–11 of that run were 11 straight wins ending 2:56 / 3:05 / 4:43 / 2:12 with red earning 96 / 105 / 234 / 320 gold (33/min, against 58/min in round 1). Smartness still decides whether red *notices* it is outmatched (the `notice_outmatched` roll, unchanged — round 1 red stays oblivious); the bar it reads against is now the same for everyone. Caution is untouched where it belongs: `_wants_trade` still reads `race_need`, so BECKY still refuses trades. The hurt-and-losing retreat keeps the old coupling under its own name, `LOSING_RACE` 0.8 × `race_need` (same numbers as before — it only fires near retreat health). Dev log gains `trade_need` beside `odds_need`. Trim knob: `WARY_RACE` 0.7 → 0.8 if red starts dying in your reach. The matching half, letting a wary red still take last hits (`_farm_target`), is **not** done yet — IDEAS.md "The wary spiral".
- **2026-10-25** — **Every round gate moved onto a 4-round cycle boundary** (user). Red's heroes are a seeded shuffle of the four repeating every 4 rounds, so a run is cycles of 1-4 / 5-8 / 9-12 / 13-16 and you meet each hero once per cycle; a gate firing mid-cycle made the heroes incomparable (two met before the change, two after). Moved: `TAME_UNTIL` 3 → 4 (cycle 1 is now entirely tame, so you meet all four gentle versions, then all four real ones) · `TOTEM_FROM` 6 → 5 and `TOTEM_ALL` 6 → 5 (totems open cycle 2 with the grown minds) · `SMART_FULL_ROUND` 6 → 8 (smartness is now a clean line .30 .40 .50 .60 .70 .80 .90 1.00 finishing at the end of its cycle instead of maxing mid-cycle) · `STAT_ANCHOR_ROUND` 6 → 5 (inert while the starts are 1.0, but anchored for when the stat nerf comes back) · `REACTION_FLOOR_ROUND` and `HESITATE_END_ROUND` 10 → 9, `SUPER_FROM` 10 → 9, `TOTEM_CONTEST_FROM` 8 → 9, and the four late mind stages (scattered at 7, 7, 7, 8) all to a named `LATE_FROM` 9 — so cycle 3 opens with one clear jolt: human-floor reflexes, no hesitation, red contesting your totems and every hero in its late form · `RED_RAMP_FROM` 12 → 13 (cycle 4 = the wall; this is the one change that makes the game *harder*, and it pays for the taming). Left alone, already on a boundary: overtime capping at 8, last-hit odds at 8, deny odds at 9. Still mid-cycle: `RED_EXTRA_FROM` 15. How to Play's totem line now says round 5.
- **2026-10-25** — Melee creep base health 550 → 500 (creep.gd KINDS; ranged 320 and tank 1,100 unchanged). With the lane scaling that is 385 → 350 in round 1 and 706 → 642 in round 10. A tower now needs 3.2 shots to kill a melee instead of 3.5, so waves melt a little faster under a tower and the last-hit window is ~9% shorter — watch lh% and whether sieging gets harder, since tower damage against creeps still follows the round (TOWER_CREEP_SCALE 1.0) and was tuned against 550. Knob: KINDS.melee.hp; the whole-line knobs are LANE_CREEP_START (0.7) and LANE_GROWTH_STEP (0.0925, shared with tower health).
- **2026-10-25** — Red's minds start tame: each hero's base is now its round-1 self and its first stage (`TAME_UNTIL + 1`, TAME_UNTIL 3) puts the real numbers back, so from round 4 nothing changed. Rounds 1–3 lose the reach and the grind, never the stance: KYLE engage 800 → 520, chase 600 → 250, trade_cap 0.5 → 0.7, dash_at 0.5 → 0.3, no keep_burning / boop_peel, deny_lurk 0.7 → 0.3 · CHAD engage 650 → 420, chase 700 → 250, trade_cap 0.6 → 0.75, dash_at 0.6 → 0.35, hunt_at 0.25 → 0.12, no drag_to_trap, capsule_tow 0.9 → 0.4 (his `trade_when` stays absent — trading on sight is young CHAD, and the round-4 stage making him pickier is the authored arc) · KAREN engage 400 → 320, chase 700 → 250, trade_cap 0.6 → 0.75, dash_at 0.6 → 0.35, threat 250 → 150, no bully_reach / shove_peel / bully_when_behind · BECKY deny_lurk 0.9 → 0.4 only. Why: smartness blends how WELL red decides, never how HARD it plays (bot.gd DUMB covers think, blunder, healed_at, trade_margin, race_need and some odds rolls — not engage, chase_depth, hold_back, dash_at, stance or any rule), so round-1 red was a full-strength character with a slow brain against a player who owns nothing. Round 1 was lost for the first time on record (2026-10-25, KYLE vs CHAD at smartness 0.3: 0-2, lh% 50 vs a usual 68–76, red's tower untouched at 2600) and 2 of the 3 round 2s before it, all to the aggressive draws. Also: KYLE's `vs CHAD` override becomes `peel_add: 60` (was `boop_peel: 260`), the `threat_add` / `hunt_add` / `keep_add` idiom, so a matchup can't reinstate a rule the tame base removed — it is inert in rounds 1–3 and 260 again from round 4. Trim knob: `TAME_UNTIL` (hero_minds.gd). Not yet paid for — `RED_RAMP_FROM` 12 → ~8 is the matching move once a few runs confirm the early game reads better (IDEAS.md "Difficulty shape: tame early minds").
- **2026-10-25** — New rare card **Deflation** (250 base, max 1 — first built as an epic the same day, moved because the tier rule puts economy in rare and unique mechanics in epic; at 250 it is a real tempo-against-greed choice early and near worthless late, which is the decision the card is for): each pick raises your prices 5% instead of 8%. The shop's price growth (run.gd PRICE_RISE 0.08 a pick, both sides) had no card attached to it although `gold_mult` and `last_hit_gold` have been wired and unused for a while — and it's the biggest brake in the run: by round 10 of the 2026-10-24 run the player was at 18 picks, ×2.44 on every price, while income had grown only ×1.3. Deflation is deliberately a timing card: bought at the first shop it saves roughly 1,400 gold over a long run, bought late it saves almost nothing. Built as a `price_rise` mod read by run.gd `rise()` (not hero.gd) and floored at PRICE_RISE_MIN 0.01. Red doesn't buy it — it isn't in RED_PRIORITY.
- **2026-10-24** — Earned minions: the kind scale moved onto the band that actually happens — EARN_FLOOR 0.6 → 0.2 and a new EARN_CEIL 0.7 (was an implicit 1.0), hero.gd. The odds at each end are unchanged (tank 2% → 10%, ranged 15% → 30%). The first guess assumed 7–10 of every ten last hits are attacks; measured over 13 rolls it is 2–6 — the player averaged 4.3, **red averaged 5.0**, so the floor sat above the bot as well as the player, every roll resolved at the bottom of the scale and 13 of 13 produced no tank. Wave-clear abilities take most last hits (R8: 35 creeps to the player's abilities, 15 to attacks), and AoE heroes farm lower still. A typical ten now lands mid-scale: tank ~5.7%, about one every five rounds instead of one every fourteen. Trim knob: the two ends of the band.
- **2026-10-24** — Two totems a side instead of one, mirrored across the lane at y = ±TOTEM_Y (lane.gd TOTEM_SIDES; each on its own respawn timer, each paying TOTEM_REWARD). The negative-y half of the field was bare — both sides' totems sat at +560 — so the map was effectively one row deep. Red picks the nearer of its two and sticks with it for the trip (bot.gd `_trip_totem`, so it can't wander between them), and contests whichever of yours is furthest along rather than whichever is closest. Reward supply barely moves: the 2026-10-10 trim was two rewards from ONE kill, while this is two rewards from two separate kills — the payout per trip is unchanged, and one hero with one leash capacity can only work one totem at a time. The real gain is that a fallen totem no longer stalls you for TOTEM_RESPAWN (45 s); the real cost is that each side now has two to defend and two to contest, a full map crossing apart. Trim knobs if siege minions pile up anyway: TOTEM_REWARD, TOTEM_RESPAWN.
- **2026-10-24** — Capsules now drop from **any** creep last hit, not just ranged ones, at DROP_CHANCE 0.10 → 0.04 and DROP_CHANCE_OVERTIME 0.33 → 0.14 (power_capsule.gd; unit.gd calls `on_creep_last_hit` for every creep). Ranged-only was a double penalty on the losing side: ranged creeps walk at the back of a wave, red is the pushed-back side in nearly every round, and it claimed 13% of them against the player's 60% — 16 capsules to 2 across the run of 2026-10-24, both of red's in round 1, so its whole capsule brain ran in one round of eight. The new odds are set to leave the player's supply where it was (~1.9 a round, ~15 a run) while red's goes 0.3 → 0.66 a round; the gap closes from 6:1 to 3:1, which is simply how much more the player farms. Training is unchanged (every ranged last hit drops, nothing else). Trim knobs: the two odds.
- **2026-10-24** — Training now uses the same capsule odds as a lane round: the `training_drops` special case (every ranged last hit dropped one) is gone, along with the flag. User call — Training should practise the game, not hand out powers. Testing a particular power now means waiting for it.
- **2026-10-24** — CHAD STARS cooldown 5 → 7 s (heroes.gd; still flat across its two levels, which only raise count and damage).
- **2026-10-24** — Healing Aura's circle dimmed: fill alpha 0.05 → 0.025, ring 0.25 → 0.13 and 1.5 → 1.0 px wide (creep.gd). Every ranged creep in the wave wears one and they overlap, so at full strength the lane read as rings rather than creeps.
- **2026-10-24** — Earned minions: every EARN_EVERY (10) last hits now sends one extra creep with that hero's next wave, both sides (hero.gd `_earn_minion`, lane.gd `pending_earned`). It's a bonus creep, so it pays no gold. The kind is rolled off how many of the ten kills were not ability hits, mapped from EARN_FLOOR 0.6 to 1.0: tank EARN_TANK 2% → 10%, ranged EARN_RANGED 15% → 30%, melee the rest — the floor because the real auto share never goes below ~0.6, so a curve over the full range would spend 0.70 of its length where nothing happens (run-level swing 1.32 vs 1.74 tanks without the floor, 0.70 vs 1.74 with it). Measured rate: ~2.9 creeps a round for you, ~1.1 for red, +4.5% creeps a round, and faster in overtime (5.1 last hits/min before, 6.9 inside). Nothing in the game announces it — the tell is meant to be a sound, which doesn't exist yet. Trim knob: EARN_FLOOR, then EARN_EVERY.
- **2026-10-24** — Leashing (T) got a range: unlimited → LEASH_RANGE 700 px to the creep's edge (hero.gd `toggle_leash`). You could clip a leash on any creep or capsule of yours anywhere on the map, including ones across the lane you couldn't see. 700 is the longest ability reach in the game and matches red's own widest grab (bot.gd KEY_FETCH_OPEN 700, KEY_FETCH 350, TOTEM_FETCH 550, TOW_REACH 300), so red's behaviour is unchanged — the gate sits in `toggle_leash`, so it binds both sides. Releasing is still unconditional: a follower dragged out of reach can always be let go. Out of range flashes "Too far away to leash" where the leash-points refusal already flashed.
- **2026-10-23** — Snapshots now say what each hero is carrying and what is around it. Both heroes' lines go through one builder (`_hero_snap`, play_log.gd) and gain `near` — the creeps within NEAR_CREEPS (460 px, creep ACQUIRE) as [yours, red's] — plus `power` / `power_left`, `twin` and `shield` when those are up. No log could previously say whether a hero had a power-up at all: red's 10 s of RAMPAGE in the run of 2026-10-23 R3 had to be inferred from its walking speed (453 px/s against 365 either side = RAMPAGE_SPEED). And `creeps` counts the whole lane, so nothing said how much of the wave was within reach of anyone — the number any wave-radius tuning needs. Distance off the lane and time in the well were deliberately not added: both follow from `at`.
- **2026-10-23** — Red's fight maths knows power-ups exist. `_fight_hp` / `_fight_dps` (bot.gd) counted shields, BRACE and RAGE's damage cut but nothing from a capsule, so a rampaging red sized up a fight as if it were naked — and so did its reading of *you*. They now fold in RAMPAGE's armour (half of every hit, so effective health doubles), RAMPAGE's aura damage (only for a hero whose reach keeps it inside RAMPAGE_RADIUS — a zoner never applies it), and a TWIN's remaining health and its shots. Everything that reads `_race` — wary, commit, press, and two of the three retreat triggers — changes with it. Run of 2026-10-23 R3: rampage up, red read its odds as **0.55 against a need of 0.78** and ran at 43% health, which with half damage taken was worth 86%; counted properly the odds were about **1.1**. No new knob: this is a correction, not a tuning number.
- **2026-10-23** — RAMPAGE is visible now. Its aura was the only area damage-over-time in the game that drew no damage numbers (`quiet` was set for creeps, hero.gd) while RAGE, zones and burns all draw theirs, and its disc sat at alpha 0.08–0.13 — so a rampaging hero looked like a hero. The aura now ticks at RAMPAGE_TICK 0.25 → 0.5 s (same DPS, same cadence as RAGE_TICK and BURN_TICK) and every tick shows its number; the disc went to alpha 0.16–0.24 with a 3 px edge, throws a ring out to RAMPAGE_RADIUS on each hit, and the body itself glows like RAGE's. Run of 2026-10-23 R3: red held RAMPAGE for its full 10 s (walking 25% faster, which is how we know) and the player saw nothing — it opened 2,200 px away and never came within 370 px, so the only thing the aura could touch was creeps, silently.
- **2026-10-22** — Red now treats losing the lane as a problem. When the clash sits more than LANE_LOST_PUSH (400 px) into its own half **and** its wave is even or better where it stands (and it isn't wary or retreating), pushing jumps ahead of its usual order instead of being the thing it does when there's nothing left to last-hit — push sits 5th or 6th in every personality's order. Run of 2026-10-22 R14: **95% of the round was fought on red's half** (median front x +956 with its base at +2600), so the player's creeps reached red's tower 0.7 times a round and red's reached the player's 0.0; red's tower took 5756 and the player's 1001, all of it from siege minions walking past the clash. Logged as `why: push:lane`. Knob: LANE_LOST_PUSH (bot.gd).
- **2026-10-22** — Red won't crack a capsule whose power it already has running. A second TWIN while one stands does literally nothing (hero.gd gain_power skips it), and "keep" powers are opened on sight, so two banked TWINs both got opened. Run of 2026-10-22 R14: red broke one at 5:32 and the next at 5:35 — ~8 s of cracking and a whole banked capsule for zero effect.
- **2026-10-22** — A kill now means something to red: while the player is dead it no longer defends its tower just because the tower was hit recently — only if the backdoor shield has been walked open or the tower is under DEFEND_PANIC (35%). `_defend` sits above commit / press / push / siege in the decision order and fires on "hit in the last 2.5 s", which against a bigger wave is permanently true, so red spent its advantage on housekeeping. Run of 2026-10-22 R13: CHAD killed the player twice and the player's tower took **zero** damage in both windows — the second was 23 ticks of defending while the enemy hero lay dead. Knob: DEFEND_PANIC (bot.gd).
- **2026-10-22** — A cast's result is logged 2.5 s after it lands (CAST_WINDOW), so any cast in a round's last 2.5 s never reached the cast table — 14 of 1014 across the run of 2026-10-22, and always the casts that ended the round (KYLE's PUNISH in R11 did 227 damage and showed as never cast). round_end now flushes the open ones first.
- **2026-10-22** — Red can contest the wave race at last: Tank Minion goes to the top of every personality's shop list (was ranked 27–29 of 31–36, i.e. unreachable — red buys the highest-ranked card it can afford and never saves, so cheap stat cards drained its gold first), and the other wave cards move from the bottom to mid-list. Red has no allowance (RED_ALLOWANCE 0), so it only affords the 550 when it has farmed well — the contest is earned, not granted. Run of 2026-10-22: red bought **no wave card in 17 rounds** while the player's single Tank Minion, bought after R7, turned equal 4-creep waves into an 18-to-8 field advantage by R9. Knob: the rank of tank_minion per personality (hero_minds.gd).
- **2026-10-22** — Red's lane stance gains `crowd_pull`: it gives up 25 px of ground per creep it is outnumbered by within 700 px, so a hero who holds the clash stops holding it when the clash turns. KAREN only (nobody else defines the key); her stance clamp goes max 30 → 200 so the term can actually move her. Run of 2026-10-22 R8: she stands 30 px AHEAD of her own front creep at any wave size, took 6190 from creeps (more than from the player), and died to a creep wave — and today's anchor rework puts her in the wave more, not less. Knobs: crowd_pull, stance.max (hero_minds.gd), CROWD_SEE (bot.gd).
- **2026-10-22** — KYLE gets an ult combo, `E, R, W, Q`: PUNISH is now what the BOOP pull is for, cast while you're still inside its 260 px, instead of sitting last where it fired **twice in the whole 17-round run** (it's a contact shockwave on a hero whose mind keeps him at 400–760). And a combo step that pays extra against a burning target (SHOCK: +50%) now waits up to BURN_WAIT_MAX (0.8 s) for the IGNITE it just cast to catch — the two were being cast a tenth of a second apart, collecting none of the bonus. Knobs: the `ult` entry in combo_book.gd, BURN_WAIT_MAX (bot.gd).
- **2026-10-22** — Red's totem play, per the escalation plan in IDEAS.md: it now works out the load before leashing and won't set out with fewer than TOTEM_MIN_LOAD (2) creeps; a trip under way is only called off by a real threat (retreating, your wave on its tower, defending) rather than by being merely wary — and a called-off trip releases its creeps instead of dragging them around; TOTEM_FETCH 450 → 550 so a full load is reachable; trips open to every personality from round 6 (TOTEM_ALL 10 → 6) with contesting split onto its own gate (TOTEM_CONTEST_FROM 8) and starting at 40% of your meter (TOTEM_CONTEST_AT 0.5 → 0.4). Run of 2026-10-22 R6: five trips of one or two creeps, meter crawled 0.00 → 0.36, red was wary 39% of the round, and the player took both totems.
- **2026-10-22** — CHAD learns the player's combo: TRAP moves from last to first (still `W,E,Q,R`; flee `W,Q,E,R`) and the new `drag_to_trap` rule makes him haul a POUNCE-tethered hero back into his own spikes before STARS lands. TRAP hit a hero **0 times in 58 casts** across the run of 2026-10-22 — it drops at his feet with a 55 px radius, the tether is 220 px / 1.2 s, and casting it last meant the hero simply walked out. Its bleed (+20% to his hits) is an amplifier, so last also broke the combo book's own "amplifier before the payoff" rule; the lab that seeded the book could only try cast orders, never a combo whose key step is walking backwards. Knob: DRAG_STEP_WAIT (bot.gd).
- **2026-10-22** — KAREN becomes the anchor she's described as, instead of CHAD with more health (they shared a decision order and a character-for-character identical 36-card shop). Now her own: order `abilities, clear, farm, siege, push, deny, trade` (wave first, tower before the fight, trading last); her own shop led by colossus / vigor / vampirism / healing_aura and the wave cards (tank_minion, reinforcement, vanguard, standard_bearer, siege_training — previously ranked 27–32 of 36, so never bought). New rules: `bully_reach` (she turns on you only within her charge + 60 px — the old anchor rule sent her marching 900 px into artillery, which is where her 19–29% retreat time went), `shove_peel` (crowd her wave in SHOVE range and she charges through you, knocking you aside and gaining ground, instead of starting a fight she must walk into), `bully_when_behind` (tower under threat: she fights whether or not she wins the damage race). engage 650 → 400. Run of 2026-10-22: four KAREN rounds, dmg ratio 5.56 / 4.36 / 3.99 / 1.79, GRIND 9/46.
- **2026-10-22** — SHOVE now slows 50%, decaying to nothing over 1 s (new: slows can fade — unit.gd slow_moves `fade`). The anchor's kit is contact-range (GRIND, RAGE) behind a single 300 px dash, so against artillery she landed SHOVE and nothing else: GRIND 9/46 across four KAREN rounds, her whole kit 510 damage in R4 (run of 2026-10-22, dmg ratio 5.56). The slow buys the beat GRIND needs. Knobs: move_slow / slow_time / slow_fade on SQUARE_E (heroes.gd).
- **2026-10-22** — Red won't open a combo with a puller (BOOP) while the back-off rules are about to fire: dragging you closer and then fleeing is the worst of both (run of 2026-10-22 R3 1:38 — KYLE BOOPed the player in at full health, then danger-retreat aborted the combo at step 1). New pass reason "keeping BOOP: about to back off".
- **2026-10-22** — red_combo_end now logs `cast`: which steps actually fired. "done" only ever meant "ran out of steps" — steps that aren't ready are skipped silently, so R3's seven KYLE combos read as five completed while PUNISH (60 s / 150 mana / 260 px) never fired once. The analyzer prints "steps actually cast: N of M" per round.
- **2026-10-22** — Round 1 red kills like round 1 again: the "kill on the table" roll goes 0.5 + 0.5×smartness → 0.2 + 0.8×smartness (65% → 44% at smartness 0.3, unchanged at 1.0), and a finished combo now blocks the next one for COMBO_BREATH × (1 − smartness) s (2.4 s at 0.3, 0 s at 1.0). Run of 2026-10-22 R1: CHAD at 0.3 chained two full combos twice to kill from ~95%, four deaths in the opening round. Knobs: KILL_SEEN_FLOOR, COMBO_BREATH (bot.gd).
- **2026-10-22** — A SHELL counts as a minion for the tower shield: while your bullet is inside a tower's range, you can hit that tower (was: only creeps dropped the shield, so a shell walking past did nothing for you). tower.gd shielded_from checks group "bullets" too.
- **2026-10-21** — The Gauntlet rule: the player's attack-move and near-clicks now acquire breakable capsules like any target (was: direct click only — a near-miss click in Training grabbed the dummy instead). Your own is always yours to hit (worst case: you open your power early — don't shoot your food); red's still only enters the pool below half / leashed / owner dead (breakable_by, unchanged). Bots keep the old filter so red never cracks its bank by accident. Knob: _not_capsule gating in hero.gd.
- **2026-10-21** — Red tows capsules: a banked SHELL or RAMPAGE within 650 gets leashed along (same 2 points as yours, so key runs outrank it) when red is healthy, unbothered and you're 900+ away — rolled once per capsule at capsule_tow × smartness (CHAD 0.9, KYLE 0.6, BECKY 0.4, KAREN 0.3). It parks the capsule (protection back) when you come within 700, it drops under 55%, a key run needs the points, or it's about to crack it. Knobs: TOW_REACH/TOW_DANGER/TOW_START (bot.gd), capsule_tow (hero_minds.gd). Logged: red_capsule_tow / red_capsule_park.
- **2026-10-21** — Leash-a-capsule built as logged in IDEAS.md: T on your own capsule drags it (2 leash points, a ranged creep's price); it floats after you at 300 while you walk 360, so long runs leave it trailing — and while leashed it's open to red at ANY health (the white deny line leaves its bar to say so). Red doesn't drag its own capsules yet. Knobs: CAPSULE_LEASH_COST, CAPSULE_DRAG_SPEED (power_capsule.gd).
- **2026-10-21** — Red won't open its own capsule with you nearly dead (you < 55%, SHELL exempt — its open IS that kill) or with you healthy (> 30%) within 500 of the capsule (it walked off a 14%-health kill for a pierce, and cracked a fresh twin in the player's face and got denied, run of 2026-10-20). Knob: CAPSULE_CONTEST; the analyzer now pairs each open decision with the actual break ("— broken at X" / "— you denied it at X" / "— never broken").
- **2026-10-20** — Red's **capsule brain** (bot.gd), first cut: opens TWIN / SHIELD on sight (permanent until spent), banks RAMPAGE until a fight is brewing or it's defending its tower, PIERCE until healthy and pushing, SHELL until a kill window (you ≤ 55%, or your D seen used — it watches the public ring, assumes 60 s — and you under 85%, and you're 900+ from your well); spends a bank before retreating or once it's ~50 s old (× its mind's bank_nerve: CHAD 1.3, KAREN 0.7), walks back up to 1500 px for one on a quiet lane, lurks your cracked capsule for the deny at 420 px (deny_lurk × smartness: BECKY 0.9, CHAD 0.4), D-blocks your Shell just before contact when it can't shoot it down in time, and counts your TWIN into its kill math (+min(twin hp, 54% of your hp)). Dull reds mostly keep the old candy-on-sight habit (the "simple" roll, fades out by smartness ~0.9). Logged: red_capsule_bank / red_capsule_open (reason + banked s) / red_capsule_lurk / red_shell_block; capsule_open carries age now. Expect tuning from logs.
- **2026-10-20** — Pierce budget: flat 600 → **60% of the enemy hero's max health** when opened (390 vs base BECKY, 600 vs KAREN, 840 vs a 1,400 hero; 600 flat in Training), so it stays ~half-a-hero-plus every round like Shell, where flat 600 was a near-kill in round 1 and under 40% late. And it's charged **per shot, not per target**: each shot costs only its dearest hit (the hero if it was on the line, else one creep at 25%), so lining up many isn't penalised. SHIELD: flat 500 → **60% of your max health** (540 for a 900 KYLE). Knobs: PIERCE_BUDGET_SHARE, POWER_SHIELD_SHARE. User: "maximizing multiple target hits should not be penalized for a powerup meant to make that better".
- **2026-10-20** — Pierce leaves the clock: it lasts until it has done **600 extra damage** (the beam's whole hit, and the target's extra 2× over a plain attack; Twin's too), creeps counting **25%**, with a 60 s backstop; its ring drains by damage. Why (user): a 10 s power is only worth one wave. PIERCE_BUDGET / PIERCE_CREEP_SHARE / PIERCE_BACKSTOP. Rampage stays on its 10 s on purpose — a risk (user).
- **2026-10-20** — New power-up **SHIELD** (teal #1de9b6, S): a 500 shield (key power_shield) that stays until it's used up or you die; other shields soak first. Not timed (sits alongside a timed power); no Shield drops while yours is up. Red values yours at 0.9 when you're dead. POWER_SHIELD in hero.gd. User idea.
- **2026-10-20** — Pierce colour: blue #448aff (almost your team blue) → violet **#b388ff**, on its capsule, ring and helix. User call.
- **2026-10-20** — SHELL colour: royal blue #1e56e8 → sky blue **#29b6f6** (nose #b3e5fc), a different hue from your team blue #4f8ff7 so your own Shell reads apart from you. User pick.
- **2026-10-20** — SHELL look: back to the bullet-shaped cartridge, now in blue-shell blue (#1e56e8 body, lighter nose, white bands, outlined in its side's colour); the capsule window shows a little blue cartridge. Replaces the spiny-shell drawing — user: "I like the bullet shape but I wanted it blue".
- **2026-10-20** — Pierce: the shot's own target now takes 25% less than the line — 3× the attack (was a normal 1× hit); the line behind takes 4×. Twin shots the same at their 60%. Towers excluded (a normal hit; the line already skipped them). PIERCE_TARGET 0.75 (× PIERCE_DAMAGE). User call.
- **2026-10-20** — Pierce line damage 2× → **4×** the attack (KYLE 120 a hit on what's behind the target, CHAD 140, BECKY 100) and width 20 → **30** so long shots land: lined up for half its 10 s it's ~600+ on a hero, beside Shell (50% max health + 2 s stun) and Rampage (up to 1,000 + 50% less damage). Also melts waves on the line. User: "as scary damage wise as the rest". Trim knob: PIERCE_DAMAGE.
- **2026-10-20** — New power-up **TWIN** replaces Spread in the drops (twin.gd; Spread's code kept): a half-size copy of your hero at your side (70 px out, switching sides as you turn) that fires its own shot at each of yours (Twin Shot's too) for 60% of your attack — damage cards, attack speed and Keen Eye count, on-hit cards don't — and its own Pierce line (at its 60%) while you have Pierce. It soaks 35% of every hit you take (after armor, before shields) from 800 health, never heals (not in the well either), ends when it breaks or you die; nobody can target it. Not timed, so it sits alongside a timed power; no Twin drops while you have one. Red values yours at 1.2 when you're dead. Knobs: TWIN_HP / TWIN_SHARE / TWIN_DAMAGE in twin.gd. User design ("annoying amount of hp but doesn't get healed in the base").
- **2026-10-20** — Pierce power: carries 250 → **1000** px past the target, and everything on that line takes **2×** the attack (was 1×; the target itself still takes a normal hit; PIERCE_DAMAGE). Lets you aim through a creep at the hero behind it. Width stays 20. User call, in line with the Shell / Rampage buffs.
- **2026-10-20** — Pierce look: the jagged zap → a double helix of dots (two strands twisting round the line, racing to the tip and spinning; effects.gd Helix). Same hit as before. User: "two sine waves that look like they are in like parallel spirals".
- **2026-10-20** — Rampage power: damage taken cut 20% → 50% (RAMPAGE_ARMOR), aura 40 → 100 damage a second (RAMPAGE_DPS). User call.
- **2026-10-20** — Bullet → **SHELL** (bullet shape + Mario's blue shell; code, logs and files keep "bullet"): on contact 20% → **50%** of the hero's max health, and a new **2 s stun** (D blocks the stun, not the damage). Drawn as a blue spiny shell (#1e56e8, white rim, turning spikes, flapping wings) ringed in its side's colour; the capsule shows a little blue shell instead of B. Massive buff on purpose (overbuff then trim): knobs DAMAGE_SHARE / STUN in bullet_minion.gd, then HP 600 / SPEED 300. User call.
- **2026-10-20** — Capsules and death: while a hero is dead their capsules have no deny protection (the other hero can break them at any health) and show on the other side's minimap until they respawn; your own capsules always show on your minimap. Red, once per death of yours with capsules out, weighs breaking them (bullet 1.5 — 2.5 since the SHELL buff, rampage 1, spread / pierce 0.8, only ones it can reach and break with 1 s to spare, × its mind's capsule_hunt) against pressing your tower (1, or 2 with its wave at your tower); smartness decides whether it thinks of it. Logged as red_capsule_choice; bot.gd HUNT_VALUE / HUNT_PUSH / HUNT_PUSH_AT_TOWER / HUNT_SPARE. Opened powers already ended on death. User design.
- **2026-10-20** — Capsules: MODE "hits" (3 attacks) → "health" (300). The other hero can't hit yours until it's below half (CAPSULE_DENY_BELOW 0.5, a white line on its bar), like denying a creep; then their breaking blow destroys it. Capsules no longer fade (was 8 s), so one can be banked. Only a click on a capsule attacks it (attack-move and near-clicks skip them). Your own spells still hit your capsule. Red goes for yours only once it's below half. User design: "it basically is like a minion where the other person cannot try and deny it unless it is beneath half health and it never goes away".
- **2026-10-19** — KYLE attack damage 25 → 30 (31 → 38 dps, level with KAREN): he lost both of today's round 1s to CHAD and BECKY on the wave, and early trades and pushes run on the basic attack. Trim knob: back toward 27. User call.
- **2026-10-19** — KYLE SHOCK on an enemy burning from his IGNITE: +30% → +50% damage (80 → 120 at base). User call.
- **2026-10-18** — Power-up drops are now chance, not a count: a ranged last hit drops a capsule 1 in 10 before overtime (was never) and 1 in 3 in overtime (was every 3rd). Training still drops every time. `power_capsule.gd` DROP_CHANCE / DROP_CHANCE_OVERTIME. User call.
- **2026-10-18** — KYLE IGNITE burn per second by level: 10 / 14 / 18 → 14 / 18 / 22. User call.
- **2026-10-18** — Fix: red no longer uses D to break its own POUNCE tether (19 of 82 red D uses across four runs were this), and D's cleanse no longer cuts a tether you made yourself (on either side).
- **2026-10-16** — Guard renamed to just **D** everywhere the player sees it (slot, pop-up text, hover, How to Play). Code keeps `guard`. User call.
- **2026-10-14** — Capsule look: a gold football-shaped pod (shooter-style, shine and rivet tips) rimmed in its owner's colour, letter in a dark window — was an owner-coloured football with stitch bands. User: "football shaped, not actual footballs, maybe gold".
- **2026-10-14** — New power-up B, Bullet (steel capsule): opening it sends a Bullet minion (bullet_minion.gd) straight at the enemy hero through everything — 600 health, 300 speed (under every hero), on contact 20% of that hero's max health (shields/armor count), then gone. Only heroes can hurt it (creeps and towers ignore it); slows and stuns hold it; it waits while its hero is dead; entering the enemy's well burns it up (hiding at home saves you). Red turns and shoots yours within 700. User design.
- **2026-10-14** — Power-up Rapid (+60% attack speed) → Rampage (still R, amber): +25% move speed, 40 damage a second to every enemy within 140 (creeps and heroes, no towers; ticks every 0.25 s), 20% less damage taken (armor, multiplies). 10 s like the others. User design.
- **2026-10-14** — Spread power-up + Twin Shot: each of Twin Shot's two shots becomes a triple (its target + the 2 enemies nearest it) = 6 shots a volley; an enemy near both targets can take more than one (was 4 shots, Spread ignoring Twin's target). Spread alone 3, Twin alone 2, unchanged. User call.
- **2026-10-14** — New: Guard (D), every hero: 300 shield for 2 s, cleanses harmful statuses and blocks new ones for 0.5 s, 60 s cooldown; works while stunned; red uses it when locked down or low. Small D slot right of R; gold pulsing ring while immune. User design.
- **2026-10-14** — Stacking pass (unit.gd): statuses tracked per source — same source refreshes (stronger replaces with its own time; fixes a weak-long + strong-short slow merging into strong-long), different sources add: move slows to 80%, attack slows to +200%, shields to 100% max health, TRAP + Serrated bleeds sum (was: biggest only). So kit + card stack (Serrated in TRAP, Spellblade in TRAP, Second Wind under BRACE). Spell power now one function (Homebody's bonus adds with Amp instead of multiplying); armor one hook (`armor_mult`). Amp max 3 (was unlimited). Attack slow got a lime ring. User: caps loose on purpose, trim what breaks.
- **2026-10-13** — Cards (Cards view requests, fifth batch): Bounty Hunter → Excess, reworked: every 5th attack bounces to up to 3 enemies within 250 for 50% damage (was: attacks on creeps under 25% land instantly). Wellspring → Trickle, +5 → +8 mana regen. Kindling → Flamable, burns +2 s → +1 s. Cold Read → Snap: the +12% hit now also ends the enemy's slows. User requests.
- **2026-10-13** — Base health: CHAD 900 → 800, KAREN 1,100 → 1,000 (KYLE 700, BECKY 650 unchanged). User call.
- **2026-10-13** — CHAD's attack damage 40 → 35 (every 0.65 s: 62 → 54 damage a second; KAREN 35, KYLE 31, BECKY 28). User call: same per-hit damage as KAREN, still the fastest attacker.
- **2026-10-13** — Cards (Cards view requests, fourth batch): Arcane Edge → Amp; Haste → Efficiency; Longbow → Kobe, +120 → +100 attack range; Vampirism → Suck. User requests.
- **2026-10-13** — Cards (Cards view requests, third batch): Rally Cry → Wonderpets, leashed creeps only (totem-latched no longer count), +30%/−30% → +20%/−20%; owning it no longer counts as a reason for red to go for totems (it still does, see _wants_totem). Adrenaline → Elegance. Hyper → Hands. Bargain → Gamble, reworked: the shop's Reroll button (50 +25 each) is gone; buying Gamble (common 100, max 1, no longer a once-shown card) rerolls every offer. User requests.
- **2026-10-13** — Cards (Cards view requests, second batch): Red Potion → Red Drink; Blue Potion → Blue Drink; Boots → Shoes; Siphon → Refund, +15 → +20 mana per last hit; Homeguard → Homebody, reworked: inside your tower's range +20% ability damage and 20% less ability damage taken (was +25% attack speed, +5 health regen). User requests.
- **2026-10-13** — Cards (Cards view requests): Whetstone → Chunk, +8 → +10 attack damage; Quickdraw → Hyper, +12% → +10% attack speed; Vigor → Red Potion; Focus → Blue Potion; Boots +25 → +20 move speed; Salve → Drip, +6 → +8 health regen. User requests.
- **2026-10-13** — New: power-up capsules (power_capsule.gd), overtime only. Every 3rd ranged creep a hero last-hits drops a capsule of theirs (football, letter S / R / P). 3 hits to break, attacks only (MODE "hits"; "health" = 300 hp hurt by anything, kept to try); your break = the power, red's = destroyed; creeps and towers ignore it; fades after 8 s. Powers last 10 s: Spread (+2 shots at the nearest other enemies), Rapid (+60% attack speed), Pierce (hits everything on the line, 250 px past the target). Red opens its own and goes for yours within 650 px (35% + smartness roll each, not under your tower). Why: overtime pays no gold, so last hits stopped mattering when the round is decided. Knobs: DROP_EVERY, HITS, LIFE, POWER_TIME, the three power values.
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
