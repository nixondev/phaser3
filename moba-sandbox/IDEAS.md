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

**The bots now play the two acts too (user, 2026-10-28) — ✅ BUILT.** *"shouldn't
there be more of a focus on gold before overtime and more of a focus on push
and kills after?"* The RULES already said so and said it strictly: `WIN_GOLD`
is **0** (removed 2026-10-02), overtime sets `Unit.no_gold` so creeps, kills
and denies all pay nothing, and unspent gold carries over — so act 1 is the
entire economy of the run and act 2 pays literally zero while the tower softens
+50%/min. The bots had one priority list per round, re-picked by round number
and never by the clock inside one. Measured over 37,255 snapshots, `push` went
**down** at the whistle (blue 19.2% → 17.9%, red 31.9% → 29.6%) and **42% of
every last hit a bot took paid no gold** (64% in one round — though CORRECTED
the same evening: those last hits still feed `_earn_minion`, so act-2 farming
is an indirect push rather than dead time), with act 2
longer than act 1 in four rounds of six. Each mind now has an `order_overtime`
(bot.gd reads it when `Unit.no_gold`). See BALANCE.md.

## A buyable F ability (2026-10-14, idea)

User: "I think there might be an F ability or something you can buy as a future idea."

Guard (D) is every hero's free, fixed utility button (built 2026-10-14). An F slot
would be the bought one: a small pool of hero-agnostic actives in the shop
(a dash, a heal, a ward, a creep call…), pick one per run (or swap between
rounds), so the build gets an active choice and not only stats.
Open: its own shop row, an epic-style once-per-run pick, or swappable; whether
red buys one too (it should, eventually); same small slot style as D.

**2026-10-16 — firmed up.** User: "it should be new ability you can pick from a
pool after level five… a nice pool of sort of modifier/utility type abilities
that can help round things out… you can change heroes per round, so the idea of
changing per counter exists so your F isn't just for one hero, but I guess
that's what also makes it interesting."
- Unlocks after round 5; pick from a pool of utility / modifier actives (not
  damage nukes). Hero-agnostic: it stays when you switch hero.
- The tension is the point: heroes are what you swap to counter red; F is
  what you carry through the run. An F that suits one hero better is a reason
  to stay on it, or to pick a hero around it.
- Pool sketch (draws on what the logs show matters — trips home, key runs,
  stalemates): Blink (short teleport), Recall (channel home), Fortify (your
  tower takes less for a few s), Rally (your nearby creeps hit harder / move
  faster), Smite (big hit on a creep or Bullet), Exhaust (a hero deals less
  and moves slower), Haste, Mend (heal over time), Mana burst.
- Decided (user, 2026-10-16): unlocks at **round 5**; you pick from the
  **whole pool** (everyone can take any of them). Not built yet: on hold.
- The aim behind it (user): "I am trying to make the game more dynamic, a
  flood of possibilities that make this more than a single lane moba, we are
  innovating."
- Still open: swappable later (round 10?) or fixed for the run; red gets one
  at the same round (and shows it, like D, so you can play around it).
- **2026-10-20 (user):** F is the last button — "a choosable new power from a
  smallish pool at level five". Example: **Recall** — a return to base on a
  long cooldown, with a 1 s channel that can be interrupted. Still on hold.

### 2026-10-23 — the first three picks named (user)

User: "F abilities I was thinking an 'inspire' type choice to buff surrounding
minions, a return to base teleport, and maybe the ability to sacrifice a minion
for a heal."

Inspire is the pool sketch's Rally slot renamed; Recall is the 2026-10-20
example; the sacrifice-heal is new. They answer three different questions,
which is what makes them a pool rather than three versions of one pick:
Inspire presses an advantage, Recall recovers cheaply, Sacrifice recovers by
giving up the wave. Shape them like D (Guard): one press, no levels, no mana,
a long cooldown.

**Sacrifice a minion for a heal — build this one first.** The only one of the
three that costs something in the game's own currency. Wave (your creeps minus
red's) decides rounds — positive in every win across the logs — so trading
wave for health is a real decision, and it puts a live choice in the low-health
moment instead of a walk home.
- **It eats the nearest creep, not one you click.** F stays a single press
  whatever you picked, and walking to the creep you want is how you choose
  (the tank minion for a big heal). Depth without a targeting mode.
- **Heal off the creep's remaining health, not a flat number.** A full creep
  heals most; one red is about to last-hit heals least but denies the gold.
  Both readable.
- Danger: overtime waves are huge, so without a long cooldown it is a sustain
  engine, not a choice. Knob: the cooldown.
- Easiest of the three for red to use well — it already reasons about its own
  creeps and its own health.

**Recall.** There is no mid-round shop (run.gd: the shop is between rounds), so
this is purely "heal up and come back" — it halves a round trip rather than
erasing one, because the walk back still costs the same. Sane amount of value.
The 1 s interruptible channel is the counterplay, and red learning to hit you
out of it is the kind of thing that looks smart when it lands.

**Inspire — the one to be careful with.** Wave pressure already decides rounds,
so a button that buffs the wave is win-more by default: ahead, it widens the
lead; behind, there is no wave near you to buff. Two framings that aren't:
- Buff only the creeps **near you**, so you have to be with the wave to spend
  it — which rewards pushing, the thing both sides under-do in every log.
- Make it a **siege** tool rather than a stat stick (nearby creeps ignore tower
  aggro, or outlast the tower a few seconds). Reinforcement / Tank Minion /
  Healing Aura / Siege Training already buff creep stats permanently, so a
  temporary creep stat buff is those cards on a cooldown — a new job is worth
  more than a new number.
- Hardest of the three for the bot: spending it at the wrong moment looks
  stupid, and that is the one thing red is never allowed to look.

#### Inspire — SCRAPPED 2026-10-23 (kept for the reasoning)

User, same day: "I say we do not do inspire, we scrap it, and even scrap
rally, only leaving the tethered boost for minions which has built in
limitations." Creep buffing belongs to **Standard Bearer** (creep.gd:65 — a
wave card: one melee creep a wave carries the banner, friendly creeps within
BANNER_RANGE 300 px attack faster while it lives). Its limits are structural —
one bearer a wave, it dies like any creep, fixed range — and killing the bearer
is the counterplay. An F version was the same effect with none of the brakes.
What killed it was breadth, not power: wave clear + push + duel + dive punish +
a floor when behind is four jobs, against one each for Recall and Sacrifice, and
the round-5 pick is from the whole pool, so every entry has to beat every other.
The quadratic (`BASE + PER_MINION × n`) went first, then the whole pick.
**Rally is scrapped with it** — same slot, same objection.

The rest of this subsection is the design as it stood when it was dropped.


User: "i do mean inspire near yourself, it's basically a ripoff of raynors
inspire"; "it could be interesting if OVERALL it is a little more powerful per
minion inspired"; "really it is a wave clear thing, it clears one wave likely
faster than normal and push forward. But I also see it working when the bot
gets stuck against wave, bodyblocked the inspire would probably do some
damage"; "if it's going to be that powerful it should likely have a decent
cooldown".

**It buffs you as well as the creeps** (Raynor's W does), which answers the
win-more worry above: alone and behind it is still a trade button, so the weak
case has a floor. It also makes it the *easiest* of the three for red to use,
not the hardest — red can fire it as a trade button, which `_race` already
evaluates, and the minion half is upside when it happens to be in the wave.

**Attack speed is the stat, and the plumbing exists.** `unit.gd` already has a
stacking attack-slow channel (`slow_attacks` → `_attack_slows`, capped by
ATTACK_SLOW_CAP) and the same for movement with the fade support added for
SHOVE. A haste is the mirror of built machinery.

**More per minion caught — the formula:**
```
strength = BASE + PER_MINION × n   (capped at MAX)      n = minions in radius
```
Everyone caught gets `strength`, and so do you, so total value is
`n × (BASE + PER_MINION × n)` — quadratic, which is the "a big clumped catch is
worth more than proportionally more" feel. **The cap is load-bearing**:
overtime waves are enormous and the quadratic blows up exactly when the round
is already most chaotic. Consequence to accept: past some round Inspire is
effectively flat again, and the scaling is a skill expression early and
mid-round only.

**Tuning can't be done from today's logs.** Everything keys on how many creeps
are near the hero when you'd press it, and the snapshot carries only
`creeps: [11, 8]` — totals alive, no positions. Log the near-hero creep count
for both heroes, play 2–3 rounds, then it's mechanical: read median and p90 of
`n` and how they grow round 5 → 15; set BASE so pressing it with nothing around
is still worth it (~+25% attack speed); MAX ≈ 2× BASE (+60%); PER_MINION so the
median `n` lands two-thirds of the way to the cap and p90 reaches it.

**The two uses are one combo, in sequence.** `creep.gd:_pick_target` ranks
creeps (0) before heroes (1) before towers (2) within ACQUIRE (460 px), and a
hero with `hero_aggro > 0` is promoted to rank **-1** — set for HERO_AGGRO (2 s,
unit.gd) when a hero damages an enemy hero. So: press it in the clash → your
wave clears theirs faster → the only rank-1 target left in 460 px is the enemy
hero → the creeps you just inspired are all shooting it, still buffed. If it
trades with you while standing there, hero aggro makes that immediate. The
wave-clear use *creates* the bodyblock use.

**Why it needs a long cooldown.** Creeps do 21 (melee) / 24 (ranged) a second
before the round escalation. Eight on one hero is ~170/s; at +50% attack speed
~255/s; over a 5 s window ~1,275 against heroes sitting at 700–850. It rarely
reaches that (most of the wave is still fighting the other wave for the first
half, and melee creeps need to be adjacent at 18 px range) — but the ceiling is
"deletes a hero", delivered as something you pressed rather than something you
hit, which is harder to see coming than a nuke. **Start at 90 s**, not Guard's
60: rounds average 5:30, so about three uses a normal round. Trim order:
cooldown, then MAX, then radius.

**It is also a defensive button** — red dives you, you press it, your wave eats
the dive. Good, but it means red must learn not to commit inside your wave with
your F up, and red's F cooldown has to be visible to you for the same reason.
`_crowd_gap()` (creeps within CROWD_SEE 700) already computes the number the
bot would need.

#### Where the pool stands (2026-10-23)

**Out:** Inspire, Rally — and no F buffs creep stats; that is Standard Bearer's job.

**In, as decided:**
- **Recall** — as sketched, unchanged (user: "keep recall as is"): channel home on
  a long cooldown, 1 s channel that can be interrupted. The two-part
  "return to where you left" upgrade was offered and declined.
- **Sacrifice** — **instant** (user: "sacrific can be instant sure"). Eats the
  nearest creep, heals off its remaining health. Instant makes it a survival
  play usable while being chased, not just a heal.

**The gap:** both of those answer "I'm hurt". The pool needs other axes.

**Candidates (user: "come up with other Fs"), one job each, no creep stat buffs:**
- **Smite** — a big fixed hit on a *creep*, never a hero. Secures a last hit
  under pressure, kills a SHELL, kills a tank minion. Axis: economy, which
  nothing else touches, and it keys on lh%, the metric that is purely player
  skill. Not a nuke by the round-5 rule, since it cannot touch heroes. Red can
  use it without looking stupid — it already decides last hits.
- **Fortify** — your tower takes less for a few seconds. The only pick that
  touches what the round is about. Red's `_defend` is the trigger. Risk: it
  makes rounds longer, which the tempo goal dislikes.
- **Exhaust** — one enemy hero deals less and moves slower briefly. The duel
  axis. Proactive where Sacrifice is reactive.
- **Blink** — a short teleport. Pure positioning, and deliberately redundant on
  a hero who already has a dash (CHAD / POUNCE) and excellent on one who
  doesn't — which is the "pick a hero around your F" tension the slot wants.
- **Shove** — knock nearby enemy creeps back. Breaks a bodyblock, buys an
  escape, unsticks a frozen wave. Wave-adjacent without stepping on Standard
  Bearer.

Suggested five where each is the best answer to a different question:
**Recall, Sacrifice, Smite, Fortify, Exhaust** — distance / being low / farming /
the tower / the enemy hero. Blink and Shove are next in, and both are more
interesting than Fortify if slowing rounds down is the worry.

**Applies to all of them:** red gets its F at the same round and shows it, and
whatever it gets has to be counted in `_fight_hp` / `_fight_dps` (bot.gd) —
that is exactly the bug the capsule power-ups had until 2026-10-23, where a
rampaging red sized up fights as if it were naked.

#### The brief, and the two tests (user, 2026-10-23)

User: "mainly we want to think of things that might fill weaknesses in a build
or playthrough but all need to be solid picks."

Every candidate has to pass both:
1. **Would I take this on a round-5 build with no obvious hole?** If no, it is a
   trap pick dressed as a choice.
2. **Does it answer a situation, or a personality?** Situations only.

**Why test 2 matters: red cycles personalities.** Run of 2026-10-23 was KAREN,
CHAD, KYLE, BECKY across rounds 1–4 with smartness climbing each round. You pick
F at round 5 and then face all four, repeatedly. So **any F that counters an
archetype is live about a quarter of the time** and is a bad pick by
construction.

**Exhaust is demoted on test 2** (it was in the suggested five): good against
CHAD and BECKY, mediocre against a KAREN who just pushes. Same reasoning rules
out a cleanse (answers KAREN's slow and CHAD's TRAP, dead against a zoner).

| Weakness every run has | The pick |
|---|---|
| One hero, and dives happen | Blink |
| You must last-hit, and red contests it | Smite |
| You go home when low; the walk costs tempo | Recall |
| You get low with nothing to spend | Sacrifice (instant) |
| Overtime ends in a tower crunch | Fortify (weakest — late-only, lengthens rounds) |

**Blink and Smite are strongest under the brief** — both fill a weakness whose
*size* depends on your build and your run while never being dead. Blink is near
worthless on CHAD (POUNCE) and essential without an escape; Smite gets better
the worse your farming is going.

**Shove passes too** (knock nearby enemy creeps back — breaks a bodyblock, buys
an escape, unsticks a frozen wave): situational but structural, not a
personality counter, wave-adjacent without stepping on Standard Bearer. Worth
considering over Fortify for the fifth slot.

**The brief argues for swappable.** Still listed as open above (fixed for the
run, or swappable at round 10). If F's job is to patch what your build lacks,
locking it at round 5 patches a round-5 weakness for a round-15 build — and the
hole you had at 5 is often the one you bought a card to fix at 8. The cost: it
stops being a run identity and becomes another between-rounds optimisation.

#### Shieldbreaker (user, 2026-10-23) — passes both tests

**Structural, with numbers.** Guard (D) is on every hero, both sides, every
round: in the three logged rounds of 2026-10-23 red guarded **13 times** and the
player **10** — about four a round each, so it is never dead. Five shield
sources exist and the target list grows through a run: `guard`, KAREN's `brace`
(which shields her creeps too), the SHIELD capsule in overtime
(POWER_SHIELD_SHARE 0.6 of max health), `second_wind` (card), `vanguard` (wave
card on creeps).

**It fills a hole nothing else in the pool touches:** "I win the damage race and
he survives it anyway." Recall, Sacrifice, Smite and Blink are all about you;
this is the first pick that undoes what red does.

**The objection is symmetry.** Red gets an F too, and Guard is the player's
universal panic button — the one defensive tool they always have, on any hero,
whatever they bought. A red that deletes it from round 5 leaves the player
pressing D and watching nothing happen, with no counterplay. Not unfair in the
maths, but unreadable and bad to lose to — which the north star rules out.

**So: "ignores shields", not "removes shields".** The F's damage passes through
`shield_hp` straight to health instead of stripping the shield off.
- Red guards, your hit still lands: the conversion you wanted.
- Guard still did its job, because **GUARD_IMMUNE (0.5 s, hero.gd)** at the
  front of it eats anything if you press too early. The button is never dead on
  either side, and timing is the skill — hit the 1.5 s *after* the immunity.
- Reads right both ways: "his shield didn't save him", not "my button did
  nothing". The counterplay is already built.

Variant worth weighing: **anti-sustain** — the hit also blocks healing and new
shields for a few seconds. Also structural, fills "he always heals back up"
rather than "he shielded my burst". Preferred the shield-ignoring version: one
clean rule instead of a status to explain.

Note: if red gets this, `_fight_hp` counts its own `shield_hp` and a ready BRACE
at full value, so red would overrate its survivability against a player holding
it — same class of bug as the capsule one fixed 2026-10-23.

## Map healing — something that sprouts (2026-10-23, idea)

User: "a new idea for a healing mechanic, maybe some kind of mushroom or tbd
shape that sprout up in places you can heal off of? … some sort of healing
mechanism that is map oriented."

**What healing is today:** walk home to the well, passive HP_REGEN, `home_regen`
near your own tower, Healing Aura (wave card), Salve (card). All of it is either
"go home" or "buy a card". Nothing is on the map, and nothing is contested.

**Why it fits this game.** The walk home is the single biggest block of dead
time in a round — red spends 15–20% of every logged round in `retreat`, and the
player does the same. A heal you can reach without leaving the fight shortens
the boring part of a round while lengthening the engaged part, which is the
north star's tempo goal pointing the same way for once. It also gives the map a
reason to exist beyond the lane line, which today only the totems provide.

**The shape to decide first is WHERE**, because it decides everything else:
- **On the centre line** — whoever is winning the lane gets them. Win-more.
- **Behind each side's own tower** — safe, uncontested, just a shorter walk
  home. Low drama, pure tempo gain, no decision.
- **Off-lane, one nearer each half** (the recommendation) — each is "yours" by
  default but stealable at a risk. Creates the decision "do I go take theirs?"
  without being pure win-more. Rune logic.
- **At the totems** — concentrates the map's interest in one contested area
  rather than spreading it. Could be good or could make totems the only place
  anything happens.

**Other open choices:**
- **Pickup or channel?** Walking over it is clean; a short channel makes it
  contestable and punishable, and is consistent with Recall's 1 s interruptible
  channel. Lean channel.
- **How much?** Enough to matter for recovery between fights, not enough to
  replace a death. Big heals replace the walk home entirely, which is a large
  tempo swing.
- **Regrow timer.** Rounds are ~5:30 with overtime from ~3:00, so a 60–90 s
  regrow gives about four cycles. The first should be up early.
- **Can they be denied?** The capsule system already has deny, ownership and
  lurk built; a sprout could reuse all of it.
- **Comeback or snowball?** Placement decides it. Nearer-your-own-half is
  comeback-friendly; centre is snowball.

**Cheap to build: it is the capsule system with a new payload.**
`power_capsule.gd` already does drop, ownership, deny-below-half, leashing and
lurk, and bot.gd already reasons about wanting one (`_open_reason`,
`_tow_worth`, `_hunt_tick`, `HUNT_VALUE`). Red's trigger here is simpler than a
capsule's: "below X% health and one is closer than home" — clean, and hard to
make look stupid.

**Cross-system consequence to weigh before building either.** Map healing makes
**Sacrifice and Recall weaker**, because the map starts doing their job — and
those are two of the five F picks. It makes Blink and Smite relatively better.
Deciding the F pool and this mechanic independently will produce a pool with two
dead entries.

**Theme:** the game is geometric (circle / square heroes, diamond ranged
creeps), so an organic mushroom would read instantly as "not a unit", which is
good. Shape TBD per the user.

### Placement — the top strip (user, 2026-10-23)

User: "I almost saw them generating somewhat randomly like plants or trees OR
just stationary on the top currently unused area."

**Superseded 2026-10-24: the top strip is no longer empty.** Each side now has
two totems, mirrored at y = ±TOTEM_Y (lane.gd TOTEM_SIDES), so both strips are
claimed. Healing growth needs somewhere else — between a totem and the lane, or
in the gaps at |x| near TOWER_X — or it needs to share the strip with a totem on
purpose (which would make that corner worth fighting over twice). The original
reasoning is kept below.

**The top strip really is empty, and that settles WHERE.** The field is a band,
not a square: `bounds.gd` holds it to |x| ≤ TOWER_X (2000) and |y| ≤ HALF_HEIGHT
(650), plus both tower range circles and both well circles — about 5,200 wide
and 1,300 tall. Both totems spawn at **y = +TOTEM_Y (560)** for either team
(`lane.gd:321`, x = ∓1000 / +1000). So the bottom strip is claimed and the whole
negative-y side is bare; the lane is effectively one-dimensional with a single
row of interest along the bottom.

**The geometry charges the cost for free.** A sprout at y ≈ −560 sits 560 px off
the centre line, against creep ACQUIRE 460 and a typical hero reach of 420 — so
going up there puts you outside the fight. The wave does not follow, red does
not have to follow, and the trip costs lane presence. No price needs designing
in.

**And it gives the field a shape you can say in one sentence:** bottom row is
offence (totems pay siege minions), top row is sustain. Go down to press, go up
to recover.

**Random vs stationary — recommendation: fixed spots, visible ripening.** A few
fixed positions along the top that visibly grow on a timer both players can
see. The geography stays learnable (readability is the north star) and the live
decision is position and timing, which is the part that survives knowing the
map. If random is wanted anyway, spawn in **mirrored pairs** across the middle —
section 4b's randomness-vs-fairness tension applies directly: a sprout that
happens to pop near red is an advantage nobody earned, so randomise where, never
who.

**This resolves the Sacrifice / Recall overlap flagged above.** With the
top-strip placement the three are a cost ladder, not a redundancy:
- **Sacrifice** — instant, inside the fight, paid in wave pressure.
- **Sprout** — free, but costs seconds of lane presence and a trip out.
- **Recall** — biggest heal and a full reset, costs the most time.

**Still open:** whether red can destroy yours before you reach it. The capsule
system has deny, ownership and below-half protection already, so it is
available — but it may be one contest too many stacked on the totems.

## More than a single-lane MOBA — riff (2026-10-16, ideas only)

User: "I am trying to make the game more dynamic, a flood of possibilities that
make this more than a single lane moba, we are innovating… so riff on the more
dynamic thing." Nothing here is decided; picked ones get their own section.

**The run's shape**
- **Branching run map** (Slay the Spire): after each round choose the next
  node: a normal round, an elite red (tougher, better reward), a shop, an
  event, a rest (heal the tower?), a treasure (free F / card). The run gets a
  route, not just a counter.
- **Round twists, shown before hero pick**: each round rolls a rule — night
  (tower range shrinks), flood (mid of the lane slows), gold rush (every creep
  pays double), siege day (siege every wave), fog. You see it before choosing
  a hero, so swapping heroes to counter the *round* is a choice too.
- **Boss rounds** (builds on "Bosses / special maps"): every 5th round red
  brings something unusual — two heroes, a hero that grows during the round, a
  walking tower.

**The lane itself**
- **Side pockets**: a small camp off the lane (a neutral, a shrine, a capsule
  spawner). Leaving the lane to take it is a risk, and red can do it too.
- **Terrain that changes per round**: brush to hide in, a wall that splits the
  lane in two paths for a stretch, a narrow choke near a tower.
- **A mid-lane objective on a timer**: spawns at e.g. 2:00, both race for it;
  taking it gives the wave a buff, a free siege, or a tower shield.
- **Escort**: a payload / relic that walks toward a tower while a hero stands
  near it (the key runs grown up).

**Your side of the map**
- **Tower mods**: spend gold on your tower — a slow on its shot, more range,
  a shield it gives you. Defending becomes a build.
- **Choose your wave**: pick the next wave's mix (more ranged, a siege, a
  tank) — wave cards widened into a decision each round.
- **Hire**: a mercenary creep camp you pay to join your wave.

**Risk / reward**
- **Contracts**: before a round take one ("don't die", "take the tower before
  overtime", "deny 10") — pull it off for a bonus card or gold.
- **Pacts** (Hades heat): take a curse for this round (red's creeps +20%,
  your D off) for a better reward.
- **Bounties**: one marked creep per wave worth a lot — red goes for it too.

**Red as a rival**
- **Red counters you**: red's next hero picked against your last one (and
  shown), so the hero swap becomes a back-and-forth.
- **Grudges**: red remembers what beat it last round (your hero, your F) and
  shows a hint it's ready for it.

**Heroes over a run**
- **Mastery**: play the same hero N rounds and it unlocks a passive — pulls
  against swapping to counter, the same tension F has.
- **Tag-team**: bring two heroes into a round and swap at your well.

## Status stacking — cards must never be eaten by your own kit (2026-10-14; BUILT same day — rules in BALANCE.md section 6 "Stacking rules"; caps loose on purpose per user: "I like the stacking maybe being possible to be kinda game breaking", trim later)

User: "if you take a card it basically replaces something in your kit that might
do the same — we need to keep this in mind when making new cards."

Today every status keeps the bigger strength and the longer time, each on its own
(unit.gd). So a card that gives a status your kit already gives often does nothing:
- Serrated (+10% bleed) on CHAD: dead inside TRAP (+20%); only counts outside it.
- Spellblade's 20% slow on CHAD: dead inside TRAP (35–45%).
- Second Wind's 150 shield on KAREN: dead while BRACE (120–220) is up.
- Snap on CHAD: his hit ends his own TRAP slow's after-linger (inside, TRAP re-slows each frame).
- Quirk: strength and time kept separately, so a weak long slow + a strong short
  one = a strong long slow neither gave.

Proposed rule (it's 1v1, so nearly everything on you comes from one enemy hero):
- **Same source again → refresh** (as now).
- **Different sources of the same hero (kit + card) → add**, capped per status:
  bleed adds; slows add, cap ~60%; shields add, cap (e.g. 40% of max health).
- **Control never stacks**: stun keeps the longest; blind is on/off; tether replaces.
- **Fix the quirk**: a stronger application replaces and brings its own time; a
  weaker one only tops up time if it lasts longer at its own strength.
- **Card rule (for /cards)**: a card that grants a status some kit already has
  must add to it (or say plainly in its text that it doesn't).

## Power-up drops — shooter-style capsules (BUILT 2026-10-13; user: "ranged minions drop powerups of some kind, like spaceship scrollers or contra")

Built: overtime only (user; since 2026-10-18 by chance instead; **since
2026-10-24 any creep last hit, not just ranged — 4% before overtime, 14% after**,
because ranged creeps walk at the back of a wave and the filter starved
whichever side was being pushed back: 16 capsules to 2 over the run of
2026-10-24), Spread / Rapid (became Rampage 2026-10-14: move speed, damage area, armor) / Pierce (user) / Bullet (added 2026-10-14: a minion that walks at the enemy hero for 20% of its health), a football-shaped
capsule — not a Contra copy (user). Two ways to break it are both in
power_capsule.gd MODE so they can be tried (user: "I kinda like both ideas"):
"hits" (3 pips, attacks only — the default) and "health" (300 hp, hurt by
anything from either hero). Shape as worked out:
- **Source**: a creep a hero last-hits drops a capsule. The sketch wanted a
  fixed rhythm (every 4th) for readability; it shipped as a chance roll, and
  ranged-only until 2026-10-24.
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
- Still open: "hits" vs "health" after playtests; a snowball check (the side
  winning the wave gets more ranged last hits); more powers later.

**Banked capsules (2026-10-20, built): "health" won.** 300 hp, the other hero
can't touch yours until it's below half (a deny window, like a creep), and it
never fades. User: "if you choose to ignore your powerup for now the other
player cannot affect it, maybe creating opportunities to wait for better
positioning and counterplay to that". So a capsule is a held card on the map:
- **Banking**: leave it whole and break it when it pays — before a dive, when
  red's D is down, when your wave is about to hit the tower. Bullet especially:
  send it when red is low or busy.
- **Pre-cracking**: chip it to just above half so one hit opens it later — a
  faster pop, at no risk until you cross the line.
- **The tell**: once you start breaking it, you're standing still on a known
  spot doing nothing else. Red can wait for that moment to engage, or to get in
  range for the deny.
- **Counterplay ideas** (not built): red zones the capsule (stands near it so
  breaking it costs you a trade); red baits you into opening it, then guards
  with D through the power; capsules near a tower are safer to open; a card
  that lets you hit enemy capsules above half (or raises the line); Rampage /
  Spread / IGNITE near your own capsule can knock it under the line — your own
  clear can hand red the deny.
- **Red today** breaks its own at once (never banks) and only goes for yours
  below half. To make it play this game: bank with a reason (save Bullet until
  you're low, open Rampage as it commits), and hover near a capsule you're
  breaking to snipe the deny.
- **Watch**: capsules pile up in long overtimes (nothing fades) — maybe a cap
  per side, the oldest gone when a new one drops.
- **Mini-me twin instead of Spread (BUILT 2026-10-20 as TWIN — replaced Spread, damage share, copies stats + Pierce, 800 hp, never heals; see BALANCE.md)**: a small copy
  of your hero at your side that fires a second auto at your target until it
  dies; its own health bar, takes a share of the damage you take; your damage /
  speed cards and Twin Shot apply to it. Lasts till it dies (user also weighed
  just making Spread last till death). Shooter roots: Gradius's Option.
  Open: replace Spread or add it; what it copies (stats only vs on-hit cards,
  and whether it copies Pierce); soak share vs directly targetable; dies with
  you?; its last hits count as yours?; second capsule = second twin or a heal.
- **Another power-up — brainstorm (2026-10-20)**. Today: Twin (extra shots),
  Rampage (tanky body + aura), Pierce (line damage), Shell (homing hit). Gaps:
  nothing for spells, nothing for the wave, nothing about death. Candidates:
  - **Overdrive** — 10 s of cooldowns 3× faster and no mana cost: the
    spell heroes' power (the current four mostly boost attacks).
  - **1-Up** (Mario) — your next death within the round doesn't count: you
    get up where you fell at half health, keeping your capsules and Twin.
    Plays straight into the death rules (capsules exposed, powers lost).
  - **Bomb** (shmup screen-clear) — every enemy creep within ~900 dies at
    once (yours to last-hit? no gold in overtime anyway): a wave swing that
    opens a tower.
  - **Force** (R-Type / Gradius barrier) — 3 orbs circle you for 10 s,
    eating enemy skillshots and projectiles they touch and nicking enemies.
  - **Freeze** (Mario clock) — enemy creeps and hero slowed 60% for 3 s.
  - **Missiles** (Gradius M) — a homing missile at the enemy hero every 1 s
    for 10 s, wherever they are on screen.
  - **Rally** — your creeps in the lane hit 2× and move faster for 10 s.
- **"A 10 second power-up is only as good as one wave" (user, 2026-10-20).**
  A timer spends itself on whatever's in front of you, and that's usually a
  wave, so every timed power collapses into "clear one wave faster". Powers
  should be spent on a *decision*, not a clock. Shapes that escape it:
  - **RULE (user, 2026-10-20): power-ups add no buttons.** F is the last
    button and it's the round-5 pick. So no press-to-fire charges: a power
    activates by breaking its capsule (the banking timing *is* the button),
    by a trigger, or by itself. Charges are fine only if they spend
    themselves smartly: e.g. Pierce as 5 shots that only spend when an enemy
    hero is on the line behind your target (normal shots otherwise).
  - **Hero-only**: effects that can't touch creeps (Shell; Missiles; a Mark:
    red takes +30% from you until it dies).
  - **Triggers**: they fire on an event — 1-Up (next death), Mirror (the next
    enemy spell that hits you bounces back), Revenge (when red hits you below
    30%, you're shielded and it's slowed).
  - **Structures and the map**: Breach (your next attack on their tower
    ignores its shield and does 500), Turret (plant a little turret that
    stays), Key (a totem key / ghost creep that opens their tower's shield
    for 20 s), Recall (teleport to any of your capsules or creeps).
  - **Tempo and death**: Bounty (red's next respawn +10 s), Second Wind (your
    next respawn is instant), Reset (your ultimate's cooldown ends now — bank
    it till it pays).
  - **Information**: Scout (red's cooldowns, D and banked capsules shown for
    the rest of the round).
  - **Theft / denial**: Snatch (break one of red's capsules from anywhere),
    Dispel (red's timed power ends).
  - **Run-long**: a capsule that becomes a small permanent card, or adds an
    offer to the next shop — the only kind that reaches past the round.
- **Leash a capsule (BUILT 2026-10-21; idea 2026-10-20, user: "is the ability to leash and drag
  powerups crazy?")**: T on your capsule and it floats after you like a leashed
  creep. Plays: carry Bullet up the lane so its walk is short (less time to shoot
  it down), carry Rampage into the fight and pop it on arrival, or pull a
  capsule back to your tower to open it safely. To keep counterplay: it costs
  leash points (2, like a ranged creep, so it competes with keys and pushes),
  and **while leashed it's open to the other hero at any health** — moving it
  is the risk, parking it is the safety. Maybe it drags slower than you, or
  slows you a little.

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

Godot 4.7, 2D, everything drawn in code. (**Stale marker cleared 2026-10-25:**
this said "10 headless GDScript test suites, all passing as of 2026-09-29".
There are no test files in the repo now — verification is the parse check plus
the user's own play, per the working rules.)

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
| Towers | x = ±2000; 650 range, 110 damage per 1.1 s; solid; rubble when destroyed. Range ring shows as you approach, red when it's aiming at you. **Health scales by round** (run.gd, 2026-10-10): LANE_TOWER_HP 2000 × growth + a flat LANE_TOWER_EXTRA 600 — so ~2,785 in round 1, not a flat 3000 |
| Tower targeting (D5) | 1) an enemy hero that hit one of its heroes in range (2 s aggro) → 2) enemy creeps (keeps its creep) → 3) enemy heroes only if no creep is in range. Re-checked every shot |
| Creep waves | Every **20 s** (WAVE_EVERY; first at 3 s): 3 melee (550 HP, 21 dmg) + 1 ranged (320 HP, 24 dmg, 400 range), speed 240, plus a tank kind (1100 HP, 14 dmg / 1.2 s) from cards and earned minions. Creep health scales by round too (× LANE_CREEP_START 0.7 × growth, so round 1 is the gentlest). Priority: aggro hero → creeps → heroes → tower; acquire range 460 |
| Collision | Towers and dummies are solid; heroes and creeps shove each other (half each); everyone slides around obstacles |
| Hero death | Respawn at base after RESPAWN_BASE 8 s, +RESPAWN_STEP 2 s for every 30 s the round has run (so 12 s at 1:00, and dying late is dear) |
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
Five training dummies (1000 HP, reset when defeated, heal out of combat),
**plus a practice lane** (training_lane.gd, not in the original sketch): an
enemy tower off to the south-east that rebuilds 4 s after it falls, and waves
for both sides every 25 s — for last hits, denies, leashing and the tower
shield. No overtime, so the shield never drops, and no bot.
(**Stale marker cleared 2026-10-25:** this said "No creeps, towers or bot".)

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

### 4.3 The rival shops too ✅ built (red_shop_list / red_shop, run.gd)
**Stale marker cleared 2026-10-23.** Red shops from the same pool, picking the
highest-ranked card it can afford, with a per-personality list (hero_minds.gd).
The sketch below is superseded: RED_ALLOWANCE was set to 0 on 2026-10-01 at the
user's call, so red spends only what its bot farms — no stipend.
The bot already earns gold by last hitting. Let it **spend from the same
shop**, so each round's bot shows up with a build. First sketch: a random
build worth 350 × (round − 1), plus what it farmed, leaning toward the best
tier it can afford. It's playing your game back at you.

### 4.3b Endless mode and red scaling ✅ built (D22, D23; creep escalation built as Run.red_extra_melee — skill-only table still only a switch, run.gd bot_stats_from) (2026-09-29, user: "what about if instead of endless you go till you lose. Does the other team get upgrades? how do they scale?")
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

**2026-10-26 — a deny bar, measured.** User: *"something unlocked after
charging up a bar somehow"*, then *"an interesting thing would be denies
building the bar up … so maybe you unlock a one time use something that can be
used in overtime"*, then the right objection: *"we would need to deduce what an
impressive amount of denies is, as a deny also kills pushing power, a big part
of this game that is not totally a moba."*

**There is already a charge bar with no bar drawn.** `hero.gd` `EARN_EVERY` 10
— every ten last hits sends an extra creep with your next wave, and the source
comment admits the gap: *"Nothing announces any of this: no counter, no mark on
the creep. The tell is meant to be a sound, which doesn't exist yet."*
`totem.gd` has `meter()` too. So fill-state has precedent on both sides and the
cheapest version of this idea is drawing a bar that already exists.

**Denies are the better filler than last hits, because the brake is built in.**
A deny pays no gold and removes a body from your own wave, so filling the bar
weakens your push — no invented cost or cooldown needed. It is also the expert
layer (most players never learn it) and it is anti-snowball (you always have
your own creeps, so a losing player can still fill it). The hook exists:
`hero.gd:1082` `on_deny()` already grants `deny_mana` / `deny_heal` from card
mods, so a bar is a third line in the same function.

**BLOCKER: you cannot deny in overtime.** `unit.gd:486` `deniable_by()` ends
`and not no_gold`, and `lane.gd:157` sets `Unit.no_gold = elapsed >=
overtime_start()`. The comment is explicit: *"a creep worth no gold, or
overtime: nothing to deny."* That rule is load-bearing — overtime pays nothing
precisely so the round stops being about farming and becomes about the tower.

**The fix improves the idea: fill in act one, spend in act two.** Bank denies
during the farming phase; the one-time use unlocks *for* overtime. No rule
change, and it maps exactly onto the two acts the game already has (out-farm
first, then find a way to win). It also removes the round-length confound
below, since the reward is spent in the same round that earned it.

**What "impressive" is — 324 logged rounds, from round_end's own `denies`:**

| | median | 75th | 90th | 95th | 99th | max |
|---|---|---|---|---|---|---|
| denies in a round | 1 | 3 | **5** | **7** | **10** | 18 |

28% of rounds have zero; mean 2.0. So **5 is top-decile, 7 is top-5%, 10 is
top-1%.** For something earned but achievable, 5 is the band; 7 if it should be
rare.

**The pushing cost is smaller than intuition says.** Win rate by deny count is
flat — 94% / 87% / 91% / 88% / 91% across 0, 1-2, 3-4, 5-7, 8+ (caveat: these
logs win ~90% overall, so this is absence of evidence rather than proof).
Mechanically, `DENY_BELOW` is 0.5, so you can only deny a creep already under
half health — one about to die anyway. The real cost is the *attack* and your
position, not the body.

**One confound:** high-deny rounds are simply long rounds — mean last hits
climbs 20 → 24 → 27 → 32 → 52 and length 282s → 418s across those buckets. In
today's data denies track exposure, not intent, so a raw threshold partly
rewards slow play. Spending the reward inside the same round's overtime
cancels this.

**Open:** what the one-time use is (it should help a *push* land — a wave
surge, a tower shield, an instant respawn, or the ganker — not raw damage,
which folds back into the power curve); and the trigger, with no new button
(F is reserved). Neat way out: **it fires on your next deny after the bar
fills** — the verb that charges it also spends it, and you choose the moment.

**`DENY_BELOW` 0.5 → 0.33? ⏸ HELD (user, 2026-10-26: "what if we made denial
33% instead" → "ok hold it for now").** Analysed, not built — deliberately kept
out of v1.0.34, which already has four changes competing for credit in the next
log. One constant, `unit.gd:23`; reverting is the same edit.

*It makes denying harder but cheaper.* A narrower window means the denied creep
lived longer, absorbed more damage and dealt more on your behalf before you
took it — so 0.33 **reduces the push cost** that prompted the whole question.
That is the non-obvious point in its favour.

*The cost is supply.* At 0.5 the deny box is up for half a creep's life — not a
skill window, an errand: time enough to notice, walk over and click. At 0.33 it
is something you must be ready for, which is what would make denying feel like
a technique. But the baseline is already thin (median 1, mean 2.0, **28% of
rounds have zero**), and a window 1.5× narrower in HP terms is roughly 1.5× less
time in it — estimated mean 1.2-1.4 and zero-deny rounds toward 40%. That is an
estimate, not a measurement: snapshots carry hero data and creep *counts*, not
per-creep HP, so there is no way to count time spent in the 33-50% band from
the logs. Making a neglected mechanic harder usually gets it neglected more,
unless something gives a reason to care.

*So it hinges on the bar.* **With** the bar, 0.33 is good — the bar supplies
the reason — but lower the threshold alongside it (roughly 7 → 4, 5 → 3). The
window sets *difficulty per deny*, the threshold sets *how many you need*; tune
them together for precision without rarity. **Without** the bar it is a small
net loss: a rarer under-used mechanic bought for "it feels more skillful when
it happens".

*Side effect worth knowing:* red's deny odds ramp **0% → 95%** across the run,
one of the few dials that genuinely escalates late, and red uses the same
`deniable_by()` window — so tightening it dampens red's late denial at exactly
the rounds the finish-line work is trying to make harder.

*UX:* `creep.gd` draws a yellow box on deniable creeps (lighter when it is a
one-shot). At 0.33 the box appears later and lives briefly, so denying shifts
from planned to reactive. That is the feel change, and it wants judging by hand
rather than by argument.

### 4.3g Bot personalities ✅ built (hero_minds.gd MINDS — KYLE the zoner, CHAD the diver, KAREN the anchor, BECKY the artillery; each with its own order, rules, stages and per-opponent `vs` overrides) (user, 2026-09-30: "we could create different personalities for each of our enemy types by giving them each different decision trees")
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

### 4.4 Round scaling — partly built
**Stale marker cleared 2026-10-23.** Creeps and tower per round: built, and
deliberately flat early — STAT_STEP is 0.0 (the gentle line kept switchable,
run.gd), so nothing climbs until RED_RAMP_FROM (12), then +RED_RAMP_STEP (5%) a
round across red's creeps, tower and hero, plus Run.red_extra_melee() late.
Matches the 2026-10-22 run: towers identical R1–R11, red's ×1.05 → ×1.30 by R17.
Red's build budget: built (4.3). **Map complexity per round is the bullet still
open** (4.5).
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

### 4.5c Leashing minions (G) ✅ built (D28; red leashes too — see "Red's leashing" below) (user, 2026-09-30)
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
| Q6 | How many rounds is a run, and what's the finale? | **Built: endless** — you play until you lose a round (4.3b); the 5-round answer is long gone. No finale |
| Q7 | How long should a round be? | A round still ends only when a tower falls, but overtime (D18) forces it: ~5–6 min in practice, 4:02–7:16 over the run of 2026-10-24. Open as a **pacing** question — act one grows from 2:50 to a 5:00 cap as rounds go, so a run gets slower, not faster |
| Q8 | Does the bot shop from the same pool? (4.3) | **Answered: yes** — same pool, its own priority list per personality, its own gold (RED_ALLOWANCE 0 since 2026-10-01) |
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
| P4 | ~~Tower HP 3000 makes rounds long~~ — settled: tower health scales by round (2000 × growth + 600) and overtime ends rounds. Round length is now a pacing question, Q7 |
| P6 | ~~Autoplay: rounds stalemate from round 3 and red never wins~~ fixed by overtime (D18): timeouts 10 → 1, runs now lost in R5 |
| P8 | One autoplay round still ran the full 15 min in overtime (KYLE R4): check whether a well-defended lane can outlast the extra-melee cap |
| P9 | Possible hero imbalance: KYLE and CHAD 1/3 completed vs KAREN and BECKY 3/3 (12 runs; confirm with per-hero batches) |
| P7 | ~~Autoplay: late-game gold snowballs (flat prices + economy cards)~~ — fixed: rising prices (run.gd PRICE_RISE 0.08 a pick) and the economy cards are gone. By round 10 of the 2026-10-24 run prices were ×2.44 while income had grown ×1.3 |
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

## The shape camp — sieging by proxy (2026-10-05) — ✅ BUILT as totems (lane.gd)
**Stale marker cleared 2026-10-23.** This shipped as the totem system, with
three changes from the sketch below: it starts at **TOTEM_FROM 6**, not round 11;
it sits TOTEM_X 1000 from the middle and TOTEM_Y 560 off the centre line; and the
reward was trimmed to **1 siege minion, not 2** (lane.gd TOTEM_REWARD: "was 2 —
too much (round 8: 6 siege minions did 40% of your tower damage)"). TOTEM_RESPAWN
is 45 s as sketched. Red's side of it is live too (bot.gd TOTEM_ALL 6,
TOTEM_CONTEST_FROM 8). The sketch is kept below for the reasoning.

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

**Built 2026-10-07 (totem.gd, bot v1; see BALANCE.md):** latching is automatic — lead a creep into the ring and it latches (user: "lead one close and it latches"), leaving your leash; it attacks only the totem. Placed well off the lane (y 560 vs the lane edge at 280) so it isn't confused with the lane. Leash intents steps 1–3 are in (key runs, led creeps as targets, totem trips + contest); backup and leash-card tags are next. **The reward is swappable** (user, 2026-10-07): a totem carries reward data `{"kind": …}`; lane.gd TOTEM_REWARDS maps each kind to the function that pays it and its puff text, TOTEM_REWARD is today's (**1** siege minion — 2 was trimmed on 2026-10-10, and
there are **two totems a side** since 2026-10-24), and `totem_reward_for(team)` is the one place to vary it by round, side or card. New type = one TOTEM_REWARDS entry + one function (then update How to Play's totem line). **Cards that modify the reward (user, 2026-10-07: "a card could modify the reward to a better minion"):** totem_reward_for reads the side's cards. Directions: upgrade (one heavy siege minion for ~25% instead of 2 × 10% — a "heavy_siege" kind + a siege_minion.gd variant), add (a tank creep joins the next wave — a bonus creep, so no gold), change (a short buff to the next wave, or a quicker respawn), scale (+1 siege minion per copy, capped). Wave / epic tier beside Command and Rally Cry — a real minion build around the totem, and the hook for a "minion run" red strategy.

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

## Red's leashing — leash intents (2026-10-06) — ✅ BUILT
**Stale marker cleared 2026-10-23.** Red no longer just grabs the nearest creep
and holds it forever. It leashes with a purpose and releases: creeps walked in
for a key run, capsules towed and parked (`_tow_worth` / `_tow_guard`), creeps
taken to its totem, and it unleashes when the trip turns risky or the points are
needed — logged as red_leash / red_unleash / red_capsule_park. The sketch below
is kept for the reasoning.

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

## Difficulty shape: tame early minds (2026-10-25) — ✅ BUILT

**The problem, measured.** Round 1 was lost for the first time on record
(2026-10-25, KYLE vs CHAD the diver at smartness 0.3: 0-2, lh% 50 against a
usual 68–76, and red's tower finished the round untouched at 2600). Two of the
three round 2s before it were lost too, both to KYLE the zoner at 0.44. Runs
now end at R1–R2 or at R7–R17 with almost nothing in between: the curve is a
spike, a hollow, then a wall, instead of a climb.

**Why.** Red has three growth lines and only one of them was doing early work:
- *its brain* — smartness 0.3 → 1.0 by round 6, cast gap 2.6 s → 0.9 s, aim
  error 90 → 25 px, reaction 0.7 → 0.25 s and hesitation 1.0 → 0 by round 10.
  All of it spent by round 10.
- *its body* — flat at 100% from round 1 to 12. `STAT_STEP` is 0 and both
  `TOWER_HP_START` and `CREEPS_START` sit at 1.0, so the knobs written for
  "round 1 is easy" are switched off. `RED_RAMP_FROM` 12 is the only growth.
- *the lane* — grows 9.25% a round for both sides.

So round-1 red was a **full-strength opponent with a slow brain**, against a
player who owns nothing. And smartness is narrower than it looks: `bot.gd`'s
`DUMB` table blends only `think`, `blunder`, `healed_at`, `trade_margin` and
`race_need`, plus some odds rolls (notice an opening, stutter, commit, siege,
totem contest, capsule nerve). It never touches `order`, `engage`,
`chase_depth`, `hold_back`, `retreat_at`, `dash_at`, `stance`, or any `rules`.
A smartness-0.3 diver had the same reach, chase depth and hunt threshold as a
smartness-1.0 one.

**The rule that came out of it: keep the two axes apart.**
- `run.gd`'s ladder = **how well** red plays.
- a mind's stages = **how hard** red plays.

Pouring aggression keys into `DUMB` would merge them, and `DUMB` is a
"plays badly" table, not a "plays gently" one — its `race_need` 0.8 is *lower*
than the cautious personalities' 1.1–1.2, i.e. a dumb bot wants *less* of an
advantage before it fights. New aggression entries would pull against the ones
already there. (And mechanically it is not free either: `engage` and
`chase_depth` go through `_pv` so they would blend for one line each, but
`hold_back` is superseded by `stance` for every real hero, and `hunt_at` is a
*rule* — `_rule()` has no blending at all, and half the mean rules are
booleans that cannot lerp. Those would each need a smartness gate like the
existing `ULT_SMARTS` / `SIEGE_SMARTS`.)

**What was built (hero_minds.gd).** No new personalities and no engine change:
`mind_for` already layers stages by round. Each mind's **base is now the tame
round-1 red** — the same character, pruned — and a first stage at
`TAME_UNTIL + 1` (TAME_UNTIL is 3, so round 4) puts the real numbers back. From round 4 every mind is byte-for-byte what it was.
Four copies were rejected: they drift from the originals as we tune (exactly
how `personality_templates.gd` became reference-only), they would need their
own `vs` tables, and they would split the play-log history that keys on
"CHAD · the diver".

| Hero | Tame rounds 1–TAME_UNTIL | Back at TAME_UNTIL + 1 |
|---|---|---|
| KYLE the zoner | engage 800→520, chase 600→250, trade_cap 0.5→0.7, dash_at 0.5→0.3; no `keep_burning`, no `boop_peel`; deny_lurk 0.7→0.3 | all of it, plus `boop_into_fire` as before |
| CHAD the diver | engage 650→420, chase 700→250, trade_cap 0.6→0.75, dash_at 0.6→0.35, hunt_at 0.25→0.12; no `drag_to_trap`; capsule_tow 0.9→0.4. **`trade_when` stays absent** — trading on sight is young CHAD, and the round-4 stage making him *pickier* is the authored arc; what was cut is his reach and follow-through, not his temper | all of it, plus `trade_when: vulnerable` and `wait_escape` as before |
| KAREN the anchor | engage 400→320, chase 700→250, trade_cap 0.6→0.75, dash_at 0.6→0.35, threat 250→150; no `bully_reach` / `shove_peel` / `bully_when_behind` | all of it; threat 400 at 8 as before |
| BECKY the artillery | already the gentlest (and her round-4 stage makes her *sharper*): only deny_lurk 0.9→0.4 | deny_lurk back, plus `predictable_only` as before |

Her stance stays in every case — where a hero stands is its identity, and it
was not what killed the player.

**One mechanical addition:** KYLE's `vs CHAD` override used to set
`boop_peel: 260`, which would have reinstated the shove the tame base removes
(`vs` merges after stages). It is now `peel_add: 60`, the same idiom as
`threat_add` / `hunt_add` / `keep_add` — inert while he has no shove, and
exactly 260 again from round 4.

**Held in reserve, on purpose — do not stack these in the same sitting or we
learn nothing:**
1. `CREEPS_START` / `TOWER_HP_START` below 1.0 (the switched-off stat nerf;
   climbs to 1.0 at `STAT_ANCHOR_ROUND` 6, so it cannot touch the middle).
2. Softer overtime teeth in rounds 1–2 — the siege-per-hero-death rule did
   20% and 35% of the player's tower in the two losses, while red's own hands
   did 0–9%. Precedent exists: `OVERTIME.red_round1` already softens the rally
   ramp in round 1.
3. `SMART_FULL_ROUND` 6 → 8 (least favoured: it flattens a middle that is
   already flat).

**Paying for it.** This takes teeth out of rounds 1–3 and puts none back, so
the run gets easier overall rather than better shaped. The matching move is
`RED_RAMP_FROM` 12 → ~8, so red's body starts growing just as its brain stops
(smartness maxes at 6, reaction and hesitation at 10). Not done yet — do it
after a few runs confirm the early game reads better, or the two changes are
impossible to tell apart.

**Watch for in the logs:** round 1 and 2 reading as practice (lh% back toward
70, the player's tower taking real damage only in overtime); round 4 landing as
a visible step up rather than a cliff; and whether the hollow at rounds 5–9
gets worse, which is the sign to bring `RED_RAMP_FROM` in.

### Round cycles: every gate on a boundary (user, 2026-10-25) — ✅ BUILT

The user's structural read: **red's heroes repeat every 4 rounds**
(`bot_hero_for` is `(r - 1) % 4` over a seeded shuffle), so a run is cycles of
four — 1-4, 5-8, 9-12, 13-16 — and you meet every hero exactly once a cycle.
A gate that fires mid-cycle therefore makes the heroes **incomparable**: you
met two of them before the change and two after, and cannot tell whether CHAD
got harder or you simply drew him late. It also explained why round 4 did not
land as a step up in the 2026-10-25 run — it was the grown stage *and* the last
round of cycle 1, so cycle 1 handed you three tame heroes and one real one.

The audit found the gates clustered badly off the boundaries: **four things
landed on round 6** (smartness maxing, `STAT_ANCHOR_ROUND`, totems appearing,
every personality running totem trips), three on 10, three on 8 — while rounds
5, 9, 11 and 13 were nearly empty.

Now, one theme per cycle:

| Cycle | Theme | What opens it |
|---|---|---|
| **1-4** | learn the game | tame minds (`TAME_UNTIL` 4), no new systems |
| **5-8** | the characters | minds grow; totems appear (`TOTEM_FROM` / `TOTEM_ALL` 5); smartness finishes across the cycle (`SMART_FULL_ROUND` 8) |
| **9-12** | past human | reaction floors + hesitation ends (9), `SUPER_FROM` 9, red contests your totems (9), every late mind stage (`LATE_FROM` 9) |
| **13+** | the wall | `RED_RAMP_FROM` 13, uncapped |

Smartness is now a clean straight line: .30 .40 .50 .60 .70 .80 .90 1.00.
Cycle 2 is gentler on decisions than before and cycle 3 opens sharper on
reflexes — deliberately, to fill the rounds-5-to-9 hollow with one readable
jolt instead of a slow drift. `RED_RAMP_FROM` 13 is the only change here that
makes the game harder, and it is what pays for the taming.

Left alone because they already sit on a boundary: overtime capping at 8,
red's last-hit odds at 8, its deny odds at 9. **Still mid-cycle and unresolved:
`RED_EXTRA_FROM` 15** (+1 red melee per wave, then every 5) — 17 would open
cycle 5, but it was not worth a difficulty change nobody asked for.

Open: nothing announces a cycle. IDEAS.md's loop plan already wants "one new
wrinkle per stage, announced in the shop in one plain line" — cycles are now
the natural place for that, and the shop already knows which hero is next.

### Too tame is a gold problem (user, 2026-10-25)

The real risk is not that red is pleasant, it is that **an unharassed player
out-farms it into a mid-game hollow**. Red farms for everything it buys
(`RED_ALLOWANCE` 0 since 2026-10-01), so the gold gap in rounds 1–3 is the
power gap in rounds 4–8. `tools/analyze_log.py` now prints gold per round for
both sides (earned, picks going in, banked, ratio) — it never did before, which
is why this was invisible.

**Pre-tame baseline, so we can tell what the change did:**
- 2026-10-24 run, rounds 1–2 (both comfortable wins): player earned ×6.19 and
  ×15.40 red's. **Red made 91 gold in round 1 and 48 in round 2** and could
  not afford its first card until round 3. Over all 10 rounds: 7471 to 4090,
  about 1.8:1.
- Both 2026-10-25 losses: red out-earned the player (×0.52, ×0.79, ×0.47).

So the gold ratio tracks the result closely — arguably more tightly than the
wave does — and red was *already* being starved in exactly the rounds we just
made gentler. It may self-correct: every lever the taming touched (shorter
`engage`, shorter `chase_depth`, higher `trade_cap`, lower `threat`) keeps red
on its own wave instead of chasing and trading, so a tame red should farm
*more*, not less. That is the thing to confirm.

**Tripwires:**
1. Red under ~250 gold in a round it is not plainly losing (a common is 100, a
   rare 250).
2. Ratio over ~3× in rounds 1–3.
3. Red taking fewer than 2 picks into round 4 — it gets its character back
   there and needs something to use it with. It had exactly 2 in the 2026-10-24
   run, so there is no headroom.

**Trim knobs, in order:** `LAST_HIT_START` 0.75 / `LAST_HIT_STEP` 0.03 (run.gd)
is the right one — it makes red richer without making it meaner, which keeps
the how-well / how-hard split clean. Then `TAME_UNTIL` 3 → 2. Reinstating a
tame hero's aggression to fix its income is the wrong fix and undoes the point.

## The wary spiral — why red stops playing once it is behind (2026-10-25)

Found in the run of **2026-10-25 21:38** (KAREN then CHAD, 11 rounds, **11
straight wins**, abandoned in round 12). Rounds 1–7 were the game we wanted:
round 1 read as practice again (lh 67%, red's tower untouched at overtime,
5:22) and rounds 4 and 6 were genuine contests. **The taming did not starve
red** — it earned 311 / 176 / 372 / 381 in rounds 1–4 and took 3 picks into
round 4 and 5 into round 5, against a pre-tame baseline of 91 gold in round 1
and 2 picks into round 4. All three gold tripwires stayed clear; no trim.

Then rounds 8–11 fell apart: 2:56 / 3:05 / 4:43 / 2:12, red never reaching
overtime once, the player's hero personally dealing **57 / 37 / 36 / 48%** of a
4,000-HP tower. Red's gold: 96 / 105 / 234 / 320 — 33 a minute against 58 in
round 1, so not a round-length artifact.

**The loop.** `_wary` (bot.gd) fires when red notices it would lose a long
damage race. While wary it skips any creep inside your threat reach at six
call sites — push targets, capsules, clearing, farming, denying, combo targets
— and will not push, trip a totem or press. So: **behind on picks → the race
is permanently bad → wary → cannot farm → further behind.** One-way. The log
shows it exactly: round 8 is `doing: hold 73% … farm 1%` — red reaches the farm
step every decision, every candidate is filtered out, and it falls through to
`_idle`. `wary` by round tracked smartness almost monotonically: 11 · 1 · 7 ·
59 · 31 · 22 · 34 · **89 · 65 · 43 · 23**.

**This also answers "why is thirteen the end?"** — it is not. The run died at
11, and the game was decided at 8, by red refusing to farm rather than by a
missing stat multiplier. `RED_RAMP_FROM` 13 was two rounds past the end and
nothing is wrong with it; moving or steepening the ramp would paper over this.

### Half 1 — wary stopped borrowing the trade knob ✅ BUILT (2026-10-25)

`WARY_RACE` was a multiplier on `race_need` (×0.8); it is now its own absolute
bar, 0.7 for everyone. `race_need` is the TRADE gate — how hard a personality
plays — and `_pv` blends it toward the personality's own value as smartness
rises, so the cautious characters were the ones that froze:

| | race_need @1.0 | × 0.8 | went wary below a race of |
|---|---|---|---|
| dumb (smartness 0) | 0.80 | | 0.64 |
| CHAD / KAREN | 0.85 | | 0.68 |
| KYLE | 1.10 | | 0.88 |
| **BECKY** | **1.20** | | **0.96** |

BECKY at full smartness called herself outmatched at an almost even race — the
`wary 89%` of round 8, where she took **zero damage** all round, against the
same BECKY at smartness 0.6 in round 4 dealing 8,867 and nearly winning. This
is the long-parked "BECKY gets passive as smartness rises" finding, and it
turns out not to be hers: KYLE at 1.0 held 53%, CHAD at 1.0 ran
`danger_retreat 31%`.

Smartness still decides whether red *notices* (the `notice_outmatched` roll,
untouched — round 1 red stays oblivious); the bar it reads against is now the
same for everyone. Caution stays where it belongs: `_wants_trade` still reads
`race_need`, so BECKY still refuses trades. `_low_and_losing` keeps the old
coupling under its own name (`LOSING_RACE` 0.8 × race_need, same numbers) — it
only fires near retreat health, where a cautious character leaving early is in
character. Trim knob: `WARY_RACE` 0.7 → 0.8.

### Half 2 — wary pokes instead of freezing ✅ BUILT (2026-10-25)

User: *"the concept of safe poking even if a little risky is a state we should
have in there, do we?"* — **we did not.** Wary was binary: either red played
its whole order at full reach, or it held outside your threat and skipped
everything inside it. Nothing in between, and the missing middle is exactly
*"I'm behind, so I won't commit to a fight, but I'll step in for value and step
back out."* (The vocabulary half-existed — `hero_casts: "poke"` is a real
option in the mind spec — but only for choosing abilities, never as a stance.)

So the fix is a state, not a deleted gate. `_farm_target`'s wary filter becomes
`_poke_ok(c)`: red may lean up to `POKE_BITE` (0.35) into your reach for a last
hit, measured **at the spot it would stand to take the shot, not at the
creep**. Everything needing real commitment stays gated — pushing, clearing,
denying, capsules, combos, chasing.

Two things fall out free:
- **Ranged heroes poke more safely than melee ones**, because the stand-off
  point comes from `attack_range()`. BECKY farms under pressure; CHAD takes
  real risk for the same creep. Character, no extra code.
- **The step back out needs no code**: `order_attack` walks red to the creep,
  the next decision's `_lane_spot` pulls it back out with the `WARY_BAND`
  hysteresis already there.

Deliberately **not** safe: red can misjudge the lean and eat a combo for one
creep — the same mistake a person makes. `_in_danger` is a separate check on a
separate roll, so it still bails out of burst it can actually see.

Trim knob: `POKE_BITE` 0.35 → 0.2 if red dies farming, → 0.5 if it still
starves.

**Watch:** red's gold per minute in the back half (should hold near its
early-round rate, not fall to 33) and `wary` at smartness 1.0 (want the 20–40%
the mid rounds showed, not 89%). If red starts dying in your reach while
farming, trim `WARY_RACE`, never reinstate the farm gate.

## Smartness per cycle, not per round (user, 2026-10-26) — ✅ BUILT

User: *"my thoughts seem to think we rounds and then groups of rounds and then
the whole match. it maybe seems smartness should rise per group of rounds
instead, you get a round of each hero at a certain smartness."*

**The flaw that instinct found.** Red's heroes rotate on a 4-round clock
(`bot_hero_for` = a seeded shuffle indexed `(r-1) % 4`) and smartness stepped
on a 1-round clock. Same period → they lock:

| slot | rounds | the only smartness it ever had |
|---|---|---|
| 0 | 1, 5, 9, 13 | .30 · .70 · 1.0 |
| 1 | 2, 6, 10, 14 | .40 · .80 · 1.0 |
| 2 | 3, 7, 11, 15 | .50 · .90 · 1.0 |
| 3 | 4, 8, 12, 16 | .60 · 1.00 · 1.0 |

In the 2026-10-25 21:38 run that meant the player **never saw KYLE above 0.7 or
BECKY below 0.6** all run — and which hero lands in which column comes from the
seed, so "how hard is BECKY" was a different question every run, and the
play-log history keyed on hero was quietly comparing different difficulties.

**Built:** `SMART_BY_CYCLE := [0.30, 0.50, 0.70, 1.00]` over rounds 1-4 / 5-8 /
9-12 / 13+ (run.gd), replacing the +0.1-a-round line. The four heroes in a
cycle now share a value, so a difference you notice between them is character.

**Back-loaded on purpose.** The shapes considered were even (.30 .53 .77 1.0)
and front-loaded (.30 .70 .85 1.0). What decided it was what each boundary
already carries: **round 5** brings totems *and* every mind dropping its tame
base; **round 9** brings the reaction floor, the end of hesitation, SUPER,
totem contests and the late mind stages; **round 13** had nothing but a 5% stat
multiplier. So the big step (+0.30) goes where there was nothing — and cycle 4
becomes "red at its best in a body that keeps growing", which is a real answer
to *"why is thirteen the end?"* instead of arithmetic.

Cost, stated plainly: flattening a rising line always loses area, so rounds
2-12 are softer than before (−0.1 to −0.3; rounds 1 and 13+ unchanged). That
is only acceptable because the wary spiral is fixed — a dumber-but-functional
red is a better opponent than a sharp-but-frozen one.

**The skill dial stays per-round** (reaction, hesitation, aim). Red keeps
sharpening mechanically inside a cycle while its judgement holds steady, so a
cycle still escalates — and any exploit that depends on red being *slow* decays
across the four rounds on its own. Only judgement-shaped exploits stay flat for
a full cycle, which is the accepted cost of a learnable opponent.

### The exploit it would have created, closed first ✅ BUILT

User: *"will there be any weirdness around things that will exist in the game
that the bot is too dumb to use properly? too exploitable?"* — yes, exactly
one, and it was a hard threshold rather than a soft one.

The bot has only **two** hard smartness gates, both at 0.4: `ULT_SMARTS` (its
ultimate) and `SIEGE_SMARTS` (hitting your tower while creeps tank, and key
leashes). Against a per-cycle ladder holding 0.30 across rounds 1-4 they would
have switched **both systems off for the whole of cycle 1** — red would never
threaten your tower by hand, you could ignore it for four rounds, and the game
would never teach the lesson, then round 5 would hand red sieges, leashes,
ultimates, totems, the un-taming and +0.2 smartness at once.

Fixed by making them what they always were — progression statements, not skill
ones: `ULT_FROM` 2 and `SIEGE_FROM` 2 (bot.gd). 0.4 on the old ladder *was*
round 2, so this is behaviour-preserving and immune to any future ladder shape.
Round 1 being the odd one out is deliberate: it is the gentle round.

Everything else that scales with smartness is continuous, so nothing else
switches off — red just does it less well (`capsule_simple`, `shell_block`,
`commit_kill`, the `notice_*` family). The one to watch is `notice_*` (chance =
smartness): at .30 red misses 70% of your overextensions and at .50 half, so
standing deep in red's half is cheap through cycles 1-2. That is what "dumb"
means rather than a hole, but it is the behaviour that will feel most like one
if the numbers are too low for too long.

**Watch:** whether cycle 1 reads as trivial — tame minds and .30 smartness now
cover rounds 1-4 exactly, so they stack. If so the knob is `TAME_UNTIL`, not
the ladder.

## A finish line, and a meta ladder past it (user, 2026-10-26, idea only)

User: *"I feel like if we did the thing where we have something like beating
round 20 a win of the game and stops there, but having that outside
progression system as well, maybe making bots being smarter earlier after you
get a full 20 round win or something."*

**Why a finish line is the bigger half of this.** Today the game has no win
state — every run ends in a loss, by construction. That makes the north star
("the run ends because the player was finally outpaced") true but bleak, and
it is the root of the round-13 problem: with no destination, the late game can
only be a multiplier climbing forever, because nothing is allowed to be the
last thing. Give it an end and the whole escalation becomes finite and
designable — `red_ramp()` has to work for 7 more rounds, not for ever, and
×1.40 at round 20 stops being an arbitrary point on a line and starts being
the intended final boss.

It also fits the structure that already exists. Rounds are cycles of four, so:

| cycle | rounds | theme |
|---|---|---|
| 1 | 1-4 | learn the game |
| 2 | 5-8 | the characters |
| 3 | 9-12 | past human |
| 4 | 13-16 | the wall (red's body grows) |
| 5 | 17-20 | **?** — the last cycle, currently unwritten |

**16 vs 20.** 16 is four cycles and our four themes already cover it exactly;
20 needs a fifth theme, and the obvious candidate is already parked below
("Bosses / special maps"). 20 also resolves `RED_EXTRA_FROM` 15, which is the
last gate still sitting mid-cycle — 17 would open cycle 5. Against 20: session
length. Rounds in the 2026-10-25 run ran 2:12 to 9:13, so twenty of them is
90-120 minutes. Continue already stitches a run across sittings, so this is a
"does a win feel like one sitting" question, not a blocker.

**The meta ladder is nearly free now.** Smartness is a four-element array
(`SMART_BY_CYCLE`), so a difficulty tier is literally another row:

```
tier 0 (default)  [0.30, 0.50, 0.70, 1.00]
tier 1            [0.50, 0.70, 1.00, 1.00]
tier 2            [0.70, 1.00, 1.00, 1.00]
```

One data structure, no new systems — this is Hades' Heat / Slay the Spire's
Ascension, and the per-cycle ladder accidentally built the right shape for it.
`TAME_UNTIL` and `RED_RAMP_FROM` are the same kind of knob and could join the
row later.

**Open questions, in the order they matter:**

1. **Opt-in, not automatic.** Escalating difficulty *at* a player for winning
   is the thing people resent. Slay the Spire asks; Hades lets you choose how
   much. A win should unlock the next tier and let you pick it, never impose
   it — and a tier-0 run should stay playable for ever.
2. **Does the player gain anything across runs, or only face more?** Pure
   "harder next time" is a punishment with extra steps. The usual answer is to
   pair it with unlocks the player keeps — new cards, a new hero, new maps —
   so meta progress is a widening, not just a tightening.
3. **How is a tier named to the player?** Personalities are a black box and
   dev language never ships, so it cannot be "smartness 0.5". It needs a plain
   name on the hero-select screen and nothing in-run (no new buttons; F stays
   reserved).
4. **What does winning look like at the moment it happens?** Right now a round
   ends and the shop opens. Round 20 needs an actual ending screen, and the
   run history needs somewhere to record "won" rather than "reached 20".

**Not building any of it yet** — pontification, per the user. The cheapest
first move if it firms up is the finish line alone (a win state at a round
constant), because it makes the late-game tuning finite without touching
anything else.

### The blocker: you currently cannot become OP (2026-10-26)

User: *"part of being able to win MUST be that you farm well and got lots of
gold and spent it well, you will need to be almost OP to even have a chance."*
As the economy stands that is **unreachable, not hard**. `PRICE_RISE` 0.08
(run.gd) makes every pick 8% dearer while a pick is worth +3.14% damage, so
cost compounds faster than power on purpose (IDEAS 4.3e, "curb buy
everything"):

| gold earned | picks | your damage |
|---|---|---|
| ~5,000 | 13 | ×1.49 |
| ~9,100 | 20 | ×1.85 |
| ~13,400 | 26 | ×2.24 |

Earning **2.7× more gold makes you 1.5× stronger**, against a flat ×1.40 red
ramp at round 20 and lane growth that lifts both sides equally. So a brutal
cycle 5 built on top of this is simply an unwinnable cycle 5.

**Two jobs, and the first is the non-obvious one:**

1. **Raise the ceiling** so an excellent economy can run away with it. The seed
   exists: `price_rise` is a *mod*, floored at `PRICE_RISE_MIN` 0.01, and
   Deflation lowers it. That is the only thing in the game that compounds —
   the reward for a strong early economy is not a bigger number, it is **a
   better exchange rate for the rest of the run**. Open: is one card enough, or
   does the last cycle need a rich-only tier, priced where a mediocre run never
   arrives?
2. **Make the last cycle demand it** — and demand *specific* investments, not
   generic power, since generic power is exactly what the price curve caps.

**The strongest single lever for (2): overtime.** The crumble currently does
most of the work in a long round — 1,014 of 2,600 tower damage in round 1 of
the 2026-10-25 21:38 run, 1,911 of 3,526 in round 6. **Over half the damage in
a long round is the game eventually handing it to you.** Cut `tower_per_min`
(0.5, lane.gd `OVERTIME`) in cycle 5 and the tower only falls to a real push,
which makes the win condition literally "farm well and spend well":
earned minions (10 last hits = +1 creep) start deciding rounds, creep upgrades
stop being optional, and a fed hero alone cannot finish — which is the
"almost-OP *build*, not almost-OP *character*" distinction. One number, cheap
to try, cheap to revert.

**The constraint that decides whether this is fun or cruel:** if round 17
demands a wave build, the player must have known by round 8 to buy one.
Otherwise it is a ninety-minute gotcha — a run lost on the merits to a
requirement never shown, which is the north star's "never feels bad" clause.
So the parked item *"nothing announces a cycle turn to the player"* stops being
a nicety and becomes load-bearing, and the shop probably has to start saying it
from cycle 2.

### Secrets: round events, and a hidden round 21 (user, 2026-10-26, idea only)

User: *"maybe a really bonkers LEVEL 21 that becomes unlocked if you do
something special? … level events like a weird something minion shows up in a
round and if you kill it something is unlocked or a secret … like in dynasty
warriors when you have to find a weird short lived shipment."*

**This answers the open question above it.** The meta ladder tightens the game
when you win; secrets widen it when you are curious. Two different appetites,
served without fighting each other — so "does the player gain anything, or only
face more?" has an answer that is not just more cards.

**Most of the machinery exists.** A Dynasty Warriors convoy is mechanically a
**power capsule**: a thing that appears mid-round, sits in the world, costs
tempo to reach, and which red already contests, tows, banks and denies with its
own opinions (`capsule_tow`, `deny_lurk`, `_open_reason`). The one genuinely
new part is the **window** — capsules never fade (`power_capsule.gd`), and
here-now-gone-in-twenty-seconds is precisely what makes a convoy a convoy.

Three shapes, cheapest first:
- **A straggler in the wave** — one odd-looking minion that does not fight and
  walks for your base; kill it before it arrives. Reuses `creep.gd` wholesale
  and "something weird is in this wave" reads at a glance. **Start here.**
- **A marked capsule** — gold or black, gives no power, means something else.
  Reuses `power_capsule.gd` wholesale, red included; red fighting you over a
  thing it does not understand is a feature.
- **Something off the lane** — forces you to leave the lane line, the largest
  tempo cost available and the most distinct, but the most to build.

**Four questions it has to answer:**
1. **Visible thing, hidden meaning.** A secret nobody finds is wasted work; an
   announced secret is not one. Make it unmissable when it appears and never
   explain it — the first chase should be pure curiosity.
2. **It must cost something real**, or it is free candy and not a decision. But
   if chasing it costs a round inside a 90-minute run, nobody ever takes it —
   so either it appears in rounds you can afford to spend, or the reward
   outlives the run (which points back at the meta layer).
3. **Never mandatory.** The moment it is the only route to the good ending it
   becomes a checklist and rounds 1-20 feel like a prologue you did wrong.
4. **Round 21 is a modifier, not a new game.** At 90-120 minutes for a win,
   nothing exotic justifies its build cost — but "the same round with one
   bonkers rule" is nearly free, because the work is the unlock flag.

Somewhere for balance-free payouts already exists: `skins/` (template +
README, excluded from the export). A secret that pays out in a skin costs
nothing in tuning.

### Two mechanisms, both wanted (user, 2026-10-26)

User: *"in kirby epic yarn when you do well enough with how much yarn you have
it opens secret levels, or running into the weird face meteor in battletoads"*
— and then: *"I want to explore both ideas eventually."* They are genuinely
different and should both exist:

| | **Threshold** (Kirby) | **Encounter** (Battletoads) |
|---|---|---|
| Trigger | you played well enough, measured after | a thing appeared and you went to it |
| Found by | mastery of the core loop | attention and curiosity |
| Timing | quiet, retroactive, end of round/run | live, in the moment, a window |
| Costs you | nothing extra — you were already farming | tempo: you left the wave |
| Risk | invisible if never explained | a random event deciding a round |

They compose rather than compete: a **threshold** can gate whether encounters
appear at all, an **encounter** can have a threshold inside it ("kill the
shipment before it reaches the well"), and a run can pay out on both axes.
Thresholds reward being good at what the game already is; encounters create
new things to be good at. A game that scales to mastery needs both.

**Thresholds fit this game unusually well** because the measure is already the
core skill and we have just spent a whole pass making it matter: gold earned,
lh%, earned minions. "Farm well enough to win round 20, farm absurdly well to
find the door" is one number doing two jobs. The analyzer already computes all
of it per round (`economy()`); the player-facing version does not exist.

### Encounters: overtime is already one (2026-10-26)

The reframe that makes these cheap: **overtime is already an encounter** — a
timed global rule change that transforms a round (ability haste, extra melee
creeps, the climbing tower multiplier) and which both sides understand and
respond to. So encounters are not a new system; they are *more overtimes —
shorter, rarer, varied, and not always at the end*.

**The real cost is not the encounter, it is teaching red to care about it.**
Capsules look trivial (a thing appears, go break it) but needed a whole rule
family — `capsule_tow`, `deny_lurk`, `_open_reason`, bank / park / lurk, and
the hunt-vs-push choice while you are dead. Without that, red ignores the
encounter and the player collects free stuff. So the menu sorts by *bot* cost,
not apparent cost:

**Cheap — a timed rule change, no new entity, red already understands it:**
- **Open doors.** Both towers drop their shields for ~20 s. Already modelled
  (`shielded_from`, and `OVERTIME.shield_drops` in lane.gd, currently `false`).
  Instantly a race; symmetric; no new bot code. **Best first one.**
- **Bounty window.** For ~30 s a hero kill pays triple — a farming round turns
  into a fight round and back. Red needs its trade gate weighted: one number.
- **A rich wave.** The next wave is worth double gold. Pure farming pressure,
  directly rewarding the skill that is supposed to decide runs, and
  `_farm_target` already wants last hits.

**Mid — a new unit the bot's existing code mostly handles:**
- **The shipment** (the Dynasty Warriors one). A neutral creep that walks the
  lane, does not fight, carries a big gold lump. Leaving the wave to kill it
  costs farm — a real decision. Red needs one rule, the same shape as its
  existing key-run / capsule-tow "is it worth the walk" judgement.
- **A defector.** A neutral creep that joins whoever last-hits it. Moves the
  wave count, which is the best single predictor of who wins a round.

**Expensive — a new unit with its own AI:**
- **The face meteor.** Something hostile to *both* sides walking the middle.
  Lovely, and a third faction red has to understand from scratch.

### Blue-centric, and why that is the better design (user, 2026-10-26)

User: *"I think encounters and the reward for doing insanely good could just be
blue-centric, as the challenge to get them is different and the benefits are
things red would never get."* This overturns the "symmetric by default" rule
written above it an hour earlier, and it is right on three counts:

1. **It dissolves the cost problem.** The menu above is sorted by bot cost
   purely because red needs opinions about each encounter. Blue-only, red needs
   none — the face meteor drops from "a whole third faction to teach red" to
   merely "a new unit". Symmetry *was* the expense.
2. **It dissolves the fairness problem.** The worry was a random event flipping
   a round you had won. An upside-only boon cannot: the worst case is you do
   not get it, and that was your decision, not something done to you.
3. **It is the right frame for what this game is.** Symmetry is a competitive
   value; this is a one-player roguelite and red is a difficulty curve in a
   hero costume. Nobody minds that Mario gets mushrooms and Goombas do not.
   And the user's point is the sharp one — red farms by standing in a lane,
   the player farms by timing last hits, so a reward for *mastery* is
   meaningless to something that has a smartness number instead of skill.

It also frees the rewards to be strange. Anything red could also take has to be
balanced from both directions, and everything that survives that collapses
toward stat boosts. Blue-only is what makes "things red would never get"
possible at all.

**Two refinements:**

- **Red interferes, never benefits.** If a glowing thing appears mid-lane and
  red strolls past it, that trips "bot mistakes should look human, never
  stupid" — a person would contest it. Red *denying* you is good tension,
  costs almost nothing (close to existing capsule-deny behaviour), and keeps
  red looking alert. So: blue-only **benefit**, red-contestable **access**.
  That is also exactly the Dynasty Warriors feel — the convoy is yours to take
  and the enemy is in the way.
- **Never balance the curve around them.** The moment rounds 17-20 assume you
  caught the shipments, catching them stops being a delight and becomes a tax,
  and missing one costs a 90-minute run to a requirement nobody stated. Strictly
  upside, strictly outside the difficulty curve.

**Two rules to keep them from feeling bad** (the third, "symmetric by default",
is withdrawn — see above):
1. **Seeded** off `run_seed`, like the hero rotation — so runs stay
   reproducible, the play log can analyse them, and the shop can foreshadow.
2. **Telegraphed, then surprising.** A few seconds' warning — enough to
   decide, not enough to pre-position. The surprise is *which* and *when*, not
   that something is happening at all.

### What the rewards should be: fun, not power (user, 2026-10-26)

User: *"we will need to make the bonuses from them feel like they match, maybe
just make things more fun than making the player OP idk, the punishment should
fit the crime sorta inverted I guess."*

This resolves a tension left open above. The user earlier required that winning
round 20 take an almost-OP build; here they want rewards that are fun rather
than powerful. Both hold if power and delight come from different places:

- **Power comes from the loop** — farming, the economy, spending well. Earned,
  systemic, *on* the difficulty curve (`PRICE_RISE`, Deflation, a possible
  rich-only card tier). This is what makes round 20 winnable.
- **Delight comes from encounters** — lateral, memorable, strictly *off* the
  curve.

That split is also what makes the "never balance around them" guardrail
keepable, which it was not while encounters paid in power: a shipment worth 400
gold is quietly on the curve whether we intend it or not; a shipment worth
something *weird* cannot be.

**Proportionality — the reward's KIND changes with the deed, not just its size:**

| deed | what it cost you | reward shape |
|---|---|---|
| grabbed a thing that walked past | seconds, a little farm | small, immediate, spent this round |
| played a round exceptionally | sustained attention | lasts the round or the run |
| played a *run* exceptionally | the whole run | a door, a secret, a skin |

The step from "bigger number" to "different kind of thing" as you climb is what
makes the top of the ladder read as a discovery instead of a payout.

**Reward classes that are fun without being power** — the richest vein, and the
only ones that are genuinely free in balance terms:
- **Agency**: choose your next opponent; reroll the shop; skip a round and bank.
- **Information**: see what red bought; see the next few rounds' heroes early.
  Costs nothing, feels enormous. (Mind the standing rule — red's *purchases*
  are fair game, its *personality* stays a black box.)
- **Insurance**: keep your gold on death; one free revive. Not stronger, just
  safer, which changes how boldly you play.
- **Spectacle**: something big and dumb you will tell someone about.
- **Expression**: a one-round ability you would never otherwise have.

Agency and information are the two to push hardest — free in balance terms, and
literally unusable by a bot, which is the purest form of "things red would
never get".

**The inverted half, taken literally:** no encounter should directly punish.
The risk stays **opportunity cost and exposure** — going for the shipment means
leaving your wave and standing where red can reach you. Dying for greed is
punishment enough and it is self-inflicted, which keeps it fair. A trap that
simply takes something from you breaks "never feels bad".

### A neutral wave passing through (user, 2026-10-26)

User: *"I have been thinking on new minion types … maybe an encounter could be
a sort of independent minion wave passing through."* Probably the strongest
encounter candidate so far:

- **It is a last-hitting exam.** Creeps belonging to neither side do not
  permanently shift the wave balance (the best single predictor of a round), so
  they cannot flip a round — but they are a burst of last-hit chances, and the
  better last-hitter profits. That is **blue-favouring by nature rather than by
  fiat**: the player runs 65-90% lh in the logs, red runs off a
  `last_hit_chance` table. No special-casing, and no "red walks past the
  treasure" problem — red competes honestly and honestly loses more of them,
  because that is the skill gap the game is about.
- **It reuses the most mature system there is.** Creeps already fight, are
  fought, are shot by towers, are last-hit, are denied, and feed the
  earned-minion counter.
- It ties straight to the economy thread: more last-hit chances = a farming
  check = the thing that is supposed to decide round 20.

**The real prize: it is a sandbox for new minion types.** `creep.gd` `KINDS` is
three entries in one dictionary (melee / ranged / tank), so a kind is one
entry. Ship a new kind as **neutral-only first**, where it has no balance
implication for either side's wave composition, watch it play, and promote the
good ones into buyable creep upgrades — a path that already exists
(Reinforcement, Healing Aura, Tank Minion, Siege Training are all wave cards).
Neutral first, card second: minion design stops having to be right before it
ships.

**Settle early:** there is already a neutral convention — capsules are
`team -1`, meaning "creeps and towers pass it by". A neutral wave needs the
opposite, a team everything *does* engage, so it is a third team value rather
than a reuse, and it touches targeting in several places. Worth knowing before
it is sketched.

## Summon a ganker (user, 2026-10-26, idea only)

User: *"summon a ganker! it is kinda similar to SHELL in a way actually, but
just a thought."* — and it is more than kinda: **SHELL already is a ganker, a
one-shot one.** `bullet_minion.gd` is an autonomous unit you launch that
travels the lane hunting the enemy hero, and red has a complete counterplay
vocabulary for it: shoot it down, dodge, or D-block at the last moment to eat
the stun (`_bullet_tick`, gated on a `shell_block` roll so a dull red fumbles
the timing). The play log tracks it already (hit / shot down / burnt in the
well).

So a ganker is **SHELL with persistence**: instead of dying on contact it
arrives, fights for a window, can be killed, and leaves. Precedent, code shape
and red's answers all exist.

**Where it belongs: a sixth capsule power** (beside twin, shield, bullet,
pierce, rampage). By the reward taxonomy above a ganker is squarely a *power*
reward, not a fun one, so it belongs in the loop rather than as an encounter
prize. As a capsule power it costs very little:
- No new button — it rides the existing break-a-capsule flow, and F stays
  reserved for the round-5 choosable power.
- Red gets opinions nearly free: one `_open_reason` entry, with banking,
  towing, denying and lurking already working.
- Symmetric without extra work, so **red can gank you**, which is probably the
  best thing about the idea.

**The one thing that genuinely breaks it.** Red's threat model is hero-only:
`_race(foe)` and `_threat_reach(eh)` are computed against the enemy *hero*, so
a third hostile unit is invisible to red's danger maths. Red would stand in the
lane being beaten to death by a ganker while correctly calculating that it wins
the race against your hero — the "looks stupid, never human" failure. The fix
is contained (fold nearby hostile non-creep units into `_fight_dps` so the race
sees them) but it is not optional; without it the feature ships broken. Worth
noting this is the same blind spot any future third-party unit hits, including
the neutral wave above — so it is one fix serving several ideas.

**No fog, one screen, so a gank cannot surprise anyone positionally.** It has
to walk in visibly and red will see it coming and back off — which is not a
problem, it is how ganks actually work in a MOBA most of the time. The value is
tempo, not the kill: free farm, free tower damage and a free totem trip while
red retreats. Given farming is what is supposed to decide runs, that is the
right currency for it to pay in.

## HP is a resource — and travel is not dead time (user, 2026-10-28)

User, on the bots standing off from BECKY: *"the stick doesn't kill you on its
own and every hero has a D and some sort of escape. A stream named chu8 used
to say 'HP is a resource you have to use it' or basically you get no value
from it. also Becky's stick does less damage the closer you are to it."*

Three separate holes, all in the same direction — the threat model hoards.

**1. The affordability sum ignores half of what a hero has.** `_in_danger` is
`hp <= burst`: if the most they could theoretically do beats the health bar,
leave. `_fight_hp` counts current HP, shields already up, KAREN's BRACE, RAGE's
damage cut and rampage — and **not the D** (hero.gd `guard()`: 300 shield for
2 s, cleanses, blocks new effects for 0.5 s, 60 s cooldown, no mana, no level,
every hero has it). For CHAD at 800 that is +37% effective health left out of
every fight decision. The bots do press D, 1-4 times a round, purely as a
reflex; it is never in the sum that decides whether a fight is affordable.
**✅ BUILT 2026-10-28** — `_fight_hp(u, guard)` + `_has_guard`, counted in full
while up, honest about the enemy's (seen via the public ring, never read off
their `guard_cd`).

**2. Your escape counts for the enemy and never for you.** `_threat_reach(eh)`
adds *their* dash or blink; `_damage_reach(u, other)` adds *theirs* as well
wherever it is used as a threat. Neither function ever adds your own mobility
as a reason to commit. POUNCE and GHOST exist in the maths only as reasons to
be afraid of someone — `_escape_ready(eh)` already existed and asked only
whether YOURS was spent. **✅ BUILT 2026-10-28** — `_their_burst` cuts the
burst window to `ESCAPE_WINDOW` 1.5 s when the bot's own way out is up.

**3. Distance is treated as monotonically safe, and against BECKY it is the
dangerous axis.** Her two weapons both get *worse* up close: SHADE the beam is
`near_damage` 0.6 / `full_at` 600 (60% damage close, full only past 600 px),
and RUMOR — which is where her damage actually comes from — has
**`min_range` 250**: inside that she cannot cast it at all. In the run of
19:45 she dealt 960, of which 935 was RUMOR. Her opponent was standing at
~1010 px, which is the best place on the map for her. A hero with a minimum
range or a falloff should *pull* opponents in. **Not built** — it wants a
notion of "where is this enemy weakest" that does not exist yet, and it is the
one that actually ends the stand-off.

**What WAS built from this conversation** (2026-10-28, see BALANCE.md): the
fourth hole, and the biggest. Asked whether the bot understood stutter-stepping,
the user described the mechanic properly: *"you base movement length on AA
cooldown, firing between each move, so maybe you decide to go somewhere but you
have three stops on the way there where you weave in an AA."* The bot had the
reload maths (`_step_point`'s budget) but every candidate stop sat on a ring
round the TARGET — orbiting, not travelling — and `_go` was a bare
`order_move`. Travel was silent. Now `_travel_tick` weaves free attacks into
any trip. This is the sibling of [Red plays on one axis] below: that one gave
red the across axis while it stands still, this one gives it the along axis
while it moves.

## Red plays on one axis (user, 2026-10-27) — ✅ BUILT

User, watching rounds 9-11 of run_2026-10-27T08-04-56: *"red seems to work
very x axis, very little y axis movement, if you want to position safe you
don't always have to retreat backwards."* Both halves measured true.

**The two players, measured from the 4 Hz snapshots:**

| rounds 9-11 | you | red |
|---|---|---|
| share of distance on the y axis | 29 / 28 / 33% | 20 / 15 / 11% |
| x-direction reversals per minute | 31 / 28 / 32 | 15 / 14 / 11 |
| time standing still | 16-21% | 31-45% |
| spread of y position (SD) | 182-200 | 123-131 |
| furthest from the lane centre (of +-650) | 578-628 | 493-563 |

Move bursts: the player's run a median of 1.75 s broken by **0.50 s** stops;
red's 1.50 s broken by **1.00 s** stops. (Snapshots are every 0.25 s, so this
is the envelope of the player's stutter, not the individual cancels.)

The player's y-share is **30.6%** with red within 700 px and **29.9%** with it
far away — so the lateral movement is not a dodge reflex, it is simply how
they move. That is a wider gap than a dodge habit would be.

**Red by state, same rounds** — the capability was never missing, it was
missing from the two states red lives in:

```
hold      10.2%      trade        41.5%
retreat    7.9%      grind chase  35.3%
push      19.7%      totem        31.4%
```

And retreat direction: **95% within 20 degrees of the lane axis**, 5%
diagonal, 1% sideways. Retreat was also red's single biggest consumer of
movement in those rounds (87,324 px, more than `hold`).

**Two root causes, both one line.**

1. `_lane_y = randf_range(-90.0, 90.0)` in `_ready` — rolled once per round,
   before red knew anything about the wave, your hero or the matchup, and held
   for the whole round. Every standing spot read off it. Red used **14% of the
   lane's width**.
2. The retreat move was `_go(home + Vector2(0, _lane_y * 0.5))` for *both*
   retreats — but `_danger_retreat` is not going home, it is leaving your
   reach, and its own clear test says so (`_threat_reach + CLEAR_MARGIN`). The
   stated goal was a distance from you; the implementation was a fixed point.

**Built, in the order the user asked for** (see BALANCE.md 2026-10-27 for the
constants): lateral danger-retreat (`_backoff_spot`), the `sidestep` rule per
mind, `_lane_y` as a live decision (`_lane_y_tick` / `_wave_y`), and a shuffle
while farming with you near.

**What was already there, and is worth remembering:** red *does* stutter-step
— `_stutter_tick` shoots, steps to a scored spot on a ring around you, and
turns back a reaction-scaled lead time before the next shot. It is gated on
`_roll("stutter", smartness x the mind's pref)`. It only ever ran while
**trading**. So "teach red to stutter-step" was the wrong framing; the gap was
that it stood perfectly still the rest of the time.

**Still open — CHAD should approach off-axis.** The user's fourth example was
the diver closing distance at an angle rather than walking down your barrel.
That is an *approach* behaviour, not a standing or backing-off one, and it
wants its own rule (a `flank` px offset applied to the engage point) plus a
look at `_commit` / `dive:chase`. Not built.

## Bosses / special maps (2026-10-09, idea)

User: "at some point maybe having bosses or special maps". Not designed yet.
Context: red's hero order is now a per-run shuffle of the four that repeats all
run (no hero twice in a row) — bosses or special maps could slot into that
cycle (e.g. every Nth round) as the stage markers of the north star's steady
escalation.

## Sound effects (2026-10-22, idea)

User: "I was just thinking about sound effects, how could we fold those in."
Today: one looping music MP3 (`music.gd` autoload, Esc-menu slider); zero SFX.
The sketch:
- **An `Sfx` autoload** beside Music: a pool of ~16 reusable players
  (AudioStreamPlayer2D for world sounds so off-screen fights sit quieter,
  plain for UI/shop), round-robin, headless-skipped like music.
- **A registry**, name → file + defaults: volume, a little random pitch
  (±5% so a creep fight doesn't machine-gun), and a per-sound throttle
  (min interval / max simultaneous) — the lane is dense.
- **Call sites ride the visuals**: wherever effects.gd spawns a visual
  (shot, hit, Ghost, Helix, capsule break) is where the one-liner
  `Sfx.play("x", position)` goes — sound and sight agree, which serves
  "never feels bad" (audio telegraphs: shell launched, capsule cracked,
  tower low).
- **Mixing**: Master → Music / Effects buses; the Esc menu gains an
  Effects slider next to Music (same settings.cfg pattern).
- **Starter set (~15)**: attack fire + hit, last-hit gold, deny, capsule
  drop / open / break, shell launch / hit, leash on/off, death, respawn,
  tower hit / half / down, overtime starts, round won/lost, shop buy.
- **Assets open question**: placeholder-first fits us — a `tools/` script
  can synthesize retro sfxr-style WAVs so everything is wired and audible,
  then swap files in `audio/sfx/` for real ones later (same trim-later
  ethos as balance).

**The catalogue (2026-10-22 talk).** Three tiers:
- *Stingers* (short musical sequences, flat, duck the music): round won /
  lost (win bright, loss low but kind), run over, **overtime begins** (the
  act-two telegraph), capsule opened (a tiny power-up arpeggio, ideally one
  variant per power), later the round-5 F pick.
- *World SFX* (positional, throttled — the readability layer): attack fire /
  hit, last-hit gold ching (the farm loop's anchor), deny, hero death,
  respawn; spells **by kind not by hero** (~8 kinds: skillshot, ground-AoE
  warning tick + blast — a fairness feature when red casts at you —, dash,
  blink, self-burst, shield up, spin loop, tether snap); D-guard block clang
  (blocked must sound blocked), stun / blind land, knockback thump; capsule
  drop plink, leash on/off, capsule breaking + break, shell launch /
  approach rumble / hit / killed / fizzled, twin break, shield spent,
  pierce-flavoured shots; tower hit (creep hits heavily throttled), tower
  at half (one crack — melt readability by ear), tower down, totem trip.
  - **An earned minion joining your wave** (user, 2026-10-24: "I think the
    perfect tell is a SOUND and we are not there yet"). This is the *only*
    tell the last-hit minion idea gets — no counter, no mark on the creep —
    so the mechanic is undiscoverable until this sound exists. Three pitches,
    one per kind, so the tank reads as the rare one by ear alone; plays at the
    base as the wave goes out, not at the kill that earned it, so what the
    player has to connect is "my wave sounded different" to "how I was
    farming a minute ago". Red's earned minions make the sound too (quieter,
    positional at its base) — same rule both sides, and hearing red earn one
    is information you should get.
- *UI* (flat, small): shop buy, can't-afford, pause.
- *Deliberately silent*: creep-on-creep combat, burn ticks, gold counter,
  red's farming (red's last hits dull or silent so yours stays special).
~25 one-shots + 5 stingers + 2–3 loops. Open: red's casts = same sounds
positional (lean yes, AoE warnings loudest); capsule stingers five real
variants vs one jingle re-pitched.

## Earned minions — ten last hits buy a creep (2026-10-24) — ✅ BUILT

User: "what if we had after every ten last hits you generate an extra minion
for your next wave (red gets this too of course) largest chance to generate a
normal minion, but smaller chance for a ranged and even smaller for a tank
(very small) but maybe a bit MORE of a chance of the better minions if the
tenth last hit is an auto attack?"

Built as: every EARN_EVERY (10) last hits, one extra creep joins that hero's
next wave — a bonus creep like every other extra, so it pays no gold to
whoever kills it (the lane.gd rule: buying more creeps mustn't buy more gold).
Both sides, same rule; the tally lives on the hero so it resets each round and
keeps counting in overtime.

**Which kind, and why it's the share and not the tenth.** The user chose the
smooth version over "was the tenth an auto": no counter, so a gated tenth would
be invisible randomness, while a share rewards the habit. `x` is the fraction
of the ten that were NOT ability hits, mapped from EARN_FLOOR to EARN_CEIL;
tank runs 2% → 10%, ranged 15% → 30%, melee takes the rest.

**Where the band goes is the whole tuning, and the first guess was wrong.**
It shipped with the floor at 0.6 and no ceiling, on the assumption that last
hits are mostly attacks and abilities are for fighting. Measured the same
evening over 13 rolls: the player averaged **4.3 of ten** and red **5.0**, and
nothing ever went above 6 — so the floor sat above the bot as well as the
player, every roll resolved at the bottom of the scale, and 13 of 13 produced
no tank. Wave-clear abilities take most last hits (R8: 35 creeps died to the
player's abilities against 15 to attacks), and an AoE hero like CHAD, whose
STARS cuts a whole line, farms lower again — so the share says as much about
the hero as the player. Corrected to **EARN_FLOOR 0.2 / EARN_CEIL 0.7**: a
typical ten now lands mid-scale (tank ~5.7%, one about every five rounds), and
a cleaner farmer than the one measured simply lands further up it. The trim
knob is the two ends of the band, not the threshold.

The lesson worth keeping: a hidden gradient has to be measured before it's
tuned, because nothing in the game can tell you it never fires.

**Burn ticks count as autos.** The test is `hit.is_empty()` (unit.gd), so
burn, bleed, spikes and the rampage aura all land in the "auto" column with
attacks. Deliberate: you can't time a burn tick, so securing a last hit through
one is at least as hard as an attack and harder than pressing Q on a creep at
40 health. The rule is really "you didn't nuke it".

**The rate, measured** (run of 2026-10-24, six rounds): you take 22–36 last
hits a round, red 7–15 — so ~2.9 earned creeps a round for you and ~1.1 for
red, about +4.5% creeps per round. Red's rate roughly doubles as its smartness
climbs (7–8 a round at 0.3–0.58, 11–15 once sharp), which pushes a little
difficulty into the flat rounds. And it fires faster in overtime without any
per-round constant: 5.1 last hits a minute before overtime against 6.9 inside
it, reaching 10.4 by round 6.

**No tell yet, on purpose.** No counter, no mark on the creep. The user:
"leaving these things to be figured out may give the more enthusiastic gamers
something to 'figure out'". The rarity curve doubles as the discovery curve —
an extra melee is wallpaper, a tank nobody bought walking out of your base is
not. The one tell it does want is a **sound** ("I think the perfect tell is a
SOUND and we are not there yet"), logged in the SFX catalogue above. Until that
exists the mechanic is genuinely invisible.

**Open**: whether the threshold should fall to 8 (3.6 a round) if 10 reads as
nothing; whether a hot streak should ever be capped per wave (it queues like
`pending_siege`, and at this rate never stacks).

## Shop economy — inflation, and the cards around it (2026-10-25, idea)

Came out of the pacing talk: gold is earned only before overtime, so income is
almost purely a function of how long act one is. Measured over the run of
2026-10-24 (10 rounds): ~**180 gold a minute** of act one, ~750 a round, and
act one grows from 2:50 in round 1 to a 5:00 cap at round 8 — so income grows
through a run without the player doing anything differently. Fixing overtime
at 2:50 (OVERTIME.start_per_round 20 → 0) would cut late-round gold ~43%
(~900 → ~515), which is roughly a whole shop tier.

**User: "if we make less time to get gold we need to adjust pricing."** Two
ways to pay for it — cut prices ~30% (every tier, the level prices and a dozen
cards with their own), or raise what a creep pays ~45% (one knob, keeps the
price ladder as the fixed reference, makes each last hit matter more, and
lifts red's income the same way).

**Inflation already exists** (run.gd PRICE_RISE 0.08 — corrected here after
getting it wrong in conversation): every pick, card or ability level, raises
every price by 8% of base for the rest of the run, for both sides, each driven
by its own pick count. The shop previews it on hover.

**And it is already outrunning income.** At the start of round 10 of the
2026-10-24 run the player had 14 cards and 8 levels — 18 picks, **×2.44** — so a
common cost 245, an epic 1,465, a level-3 ability ~1,100, against ~750 a round
coming in. Income over those ten rounds grew ×1.3 while prices grew ×2.44.
WIN_GOLD's own comment ("flat, so it matters less as prices rise") says this was
the intent.

**So cutting gold needs care.** Shortening act one would stack a second brake
on one that is already winning; if overtime moves earlier, easing PRICE_RISE is
probably the compensation rather than raising creep bounty.

**Red and inflation**: it restrains red too, and the "red hoards gold" worry
is out of date. That figure (~2000 by R4, 10k+ by R6) comes from the
2026-09-30 A/B record further down, where red bought economy cards that no
longer exist, and it predates RED_ALLOWANCE being zeroed on 2026-10-01. The
red_shop events of the 2026-10-24 run show red ending every round with
**39–165 gold** after one to three picks — it spends nearly all of it. By R9
red stood at 14 picks (×2.12) against the player's 18 (×2.44), so both sides
feel the same brake and red is only modestly behind (10 cards + 8 levels to the
player's 14 + 8).

**Cards** (the economy slot is empty: `gold_mult` and `last_hit_gold` are live
mod keys in hero.gd that no current card uses):
- **Deflation**: your prices rise 5% a pick instead of 8% (PRICE_RISE is per
  pick, so this compounds with how much you buy — a build-defining early pick,
  not a flat discount). **Rebate**: your next three picks don't raise prices at
  all — narrow and spiky, lets a build spike in one round.
- **Haggle**: everything 15% off (flat, really just +15% income).
  **Coupon**: first purchase each round free up to 150 (caps itself, creates a
  buy-order decision). **Wholesale**: second card each round half price (rewards
  the big rounds instead of smoothing them). **Pawn**: sell a card back for
  half — not income at all, the ability to pivot a build that went wrong.
- **Avoid Interest** (unspent gold earns 10% next round): it pays the player to
  hoard, which is the thing 4.3d is trying to discourage.

Favourites: Coupon and Pawn — both are a decision rather than a bigger number.

## Teaching the bots from real players (2026-10-24, idea)

User: "sometimes look at what _I_ do? I think if I can get enough people you
can teach the bots from real players."

**There's precedent.** The combo book was already seeded partly from the
user's logged bursts (BALANCE.md 2026-10-06), so bots learning from humans
isn't a new direction, just a bigger one.

**The realistic shape: fit the knobs, don't learn a policy.** Red isn't a
network, it's named constants with rules around them — RETREAT_AT, hold_back,
CAPSULE_SEEK, the notice-roll hold, cast ranges, commit thresholds. Those are
exactly the quantities a log can measure off a human: at what health do real
players turn and run, how close do they stand to a wave they aren't fighting,
how often do they dive a tower they shouldn't, how long after a miss do they
re-engage. Fitting those to recorded play gives bots that move like people
without any new AI.

**The data is cheap.** One run is ~8 rounds at 4 snapshots a second — about
ten thousand samples. A dozen players is plenty for a few dozen scalars per
personality.

**Don't average the players.** The mean of four playstyles is a bot with no
character, and the personalities are the best thing red has. Fit per player
and keep the distinctive ones: one person's wave-clearing CHAD becomes a
personality, someone else's dive-happy one becomes another, named for what
they do and never for who they are. "Mistakes should look human" comes free
when the mistakes were human.

**First, a gap to close.** play_log.gd records every cast the player makes and
counts them by slot, but there is no `cast_result` for the player the way
there is for red — so red gets an accuracy table and the player doesn't. The
analyzer also has no "your play" section at all, which is why every report
reads as 80% red. Both are small and both are prerequisites: you can't learn
from play you aren't measuring.

**Practical**: the playtest build already carries the log switch, so the
plumbing exists — what's missing is logs coming back, and telling playtesters
they're recorded (a line in PLAYTEST_README).

**One finding already**: the earned-minion logging showed the user takes ~4 of
every 10 last hits with attacks and 6 with abilities (R8: 35 creep kills by
ability, 15 by attack). That's a stylistic fingerprint nobody had measured, and
it was the opposite of what was assumed when tuning EARN_FLOOR.

## Red's capsule stash — when hoarding is right (2026-10-24, note)

User: "grabbing and hoarding is good, remember that if the capsule is over 50%
blue cannot hit it so they can stash it for later, have a brain when that is a
good idea, could be capsule specific."

**This is built** (bot.gd `_open_reason`, CAPSULE_DENY_BELOW 0.5): banking is
red's default — any capsule with no open reason is left alone and logged as
red_capsule_bank — and the reasons are already per power: TWIN and SHIELD open
at once ("keep": permanent until spent, so waiting is all downside), RAMPAGE
waits for a fight brewing or its tower being pressed, PIERCE for a push, SHELL
for a kill window (you low, or your D seen to be down). BANK_ROT spends a bank
that's been sat on too long.

**The two holes:**
- Two reasons bypass the per-power windows entirely: the `capsule_simple`
  roll (a dull red just takes the candy, chance 1 − smartness×1.1) and `rot`.
  Both produced bad opens in the logs — RAMPAGE cracked 2,200 px from anyone
  (2026-10-23 R3) and PIERCE opened while holding, closest 452 px (2026-10-24
  R7). A fix would make those two still open it but *near something*, rather
  than wherever red happens to stand.
- Towing drops the protection: a leashed capsule is open at any health, which
  is the deliberate risk/reward, and `_tow_guard` already parks it when you
  close in. Worth re-checking once red actually has capsules to tow.

**But the real blocker is supply.** Red had capsules in 1 of 8 rounds in the
run of 2026-10-24 (16 dropped for the player, 2 for red). The whole brain
above runs about once a run. See the capsule drop rate work.

## More than one combo per hero (2026-10-22, idea)

User, after teaching the bot CHAD's drag combo: "B is good, but maybe there
can be more than one combo? for different uses? something to think on moving
forward."

Today `combo_book.gd` gives each hero exactly two orders — `still` and `flee`
— picked only by whether the target is running. One burst, two spellings.
But heroes already want different bursts for different jobs:
- **Kill** (what the book has now): everything, in the order that hurts most.
- **Make room / peel**: the cheap displacement half, held when the point is to
  push the hero off a wave, not to finish them (KAREN's shove_peel is this
  idea hard-coded for one ability).
- **Escape**: the order that gets it out (BOOP apart, blink, dash) — today
  retreating just aborts the combo.
- **Dive**: under the tower, where the fast half matters and the long tail
  isn't worth the tower shots.
- **Wave / clear**: the same abilities aimed at creeps, which `_use_abilities`
  does separately and never as a sequence.
Shape to consider: the book becomes `{"kill": [...], "room": [...],
"escape": [...], "dive": [...]}` with the bot picking by intent (it already
knows: `why`, `_threatened`, `_retreating`, `dive:chase`), and personalities
weighting which intents they reach for. Needs the combo lab to measure
something other than raw damage for the non-kill ones — see also the note in
combo_book.gd that the lab can only try cast orders, never combos whose key
step is a walk (which is how CHAD's TRAP ended up last and 0/58).
