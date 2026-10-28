extends "res://scripts/hero.gd"
## The enemy hero in lane mode: a normal hero (same kits, casting, collision,
## respawn) whose orders come from a simple laning brain instead of the mouse.
## Every THINK seconds it picks the first thing that applies:
##
##   1. retreat    below RETREAT_AT health: walk home (escaping with a dash or
##                 blink if you're close, after its reaction time); early on
##                 it hesitates first, fighting on a moment before it runs;
##                 stays home until healed to HEALED_AT
##   2. back off   the enemy tower is shooting it: step out of range
##   3. abilities  (at most one per CAST_GAP) — skillshots, beams and ground
##                 AoEs at you, led by your movement with a little error;
##                 shockwaves / cones when you're in reach; non-ultimates on
##                 clumps of 3+ creeps; dashes only to finish you or to escape
##   4. trade      you're within reach (attack range + a step, at least
##                 ENGAGE), not under its enemy's tower, and it isn't losing
##                 on health: auto-attack you
##   5. farm       last-hit: swing only at an enemy creep one attack from
##                 dying (lowest first), so its gold doesn't go to waste —
##                 with none of its own creeps out it just fights the nearest
##                 (never under the enemy tower unless its creeps are tanking)
##   5b. deny      nothing to last-hit: finish off its own nearly-dead creep
##                 so you don't get the gold (odds: the round's deny_chance)
##   6. siege      its creeps are tanking the enemy tower: hit the tower too
##                 (from round SIEGE_FROM)
##   7. hold       stand just behind its own front-line creep; with no creeps
##                 out, wait by its tower
##
## It never dives: points under your tower count as unsafe unless creeps are
## taking the shots.
##
## PERSONALITIES (each hero's own: hero_minds.gd; the old types are templates in
## personality_templates.gd, pinned only by experiments via `personality`) reorder steps
## 3-7 and retune a few thresholds: a different decision tree on the same
## skill (aim, reaction, last-hit odds still come from `difficulty`):
##   brawler      fights first: trades from far, even behind on health; casts
##                only at you; dashes in on a hurt hero; holds at the front
##   farmer       last hits and denies before anything (and catches more of
##                them); trades / casts at you only when you're vulnerable;
##                hangs back, retreats early
##   pusher       siege first (from round 1), abilities on creep clumps first,
##                leashes its creeps, never denies (that holds the wave back);
##                fights you only when you hit it
##   opportunist  farms with its wave and pokes from range; when you're
##                vulnerable (low health or mana, or deep in its half) it commits:
##                trades from far, dashes in, uses its close-up abilities and ultimate
## "Vulnerable" = under 50% health, under 25% mana, or 600+ px into its half.
##
## Stutter-stepping (trading with you): an attack fires the moment it's ready,
## and a hero moves freely while it reloads — so after each shot it walks to a
## step point and turns back on you just before the next one (lead time from
## its reaction). Kiting: it out-ranges you and you're close → it backs off to
## just inside its own range, outside yours. Chasing: you're running → it
## follows where you're going instead of standing still. Odds it bothers =
## smartness × its personality's STUTTER (sticky); dumb bots stand and shoot.
##
## Free hits (a default, not a priority): when it has nothing else to do —
## holding its spot with its attack ready — it shoots whatever's in range (your
## hero first, then a creep it can finish, then any creep, then a tower it may
## hit) instead of standing idle. Everything else (abilities, trades, last
## hits, retreating, moving) comes first and is never interrupted.
##
## Self-preservation (all personalities, odds of noticing = smartness):
##   wary        you'd win the damage race by a lot (its race < WARY_RACE):
##               it holds outside your reach (attack range + your ready dash /
##               blink) and declines anything that means committing inside it
##               — but it still POKES for last hits it can take from the edge
##               (POKE_BITE, _poke_ok): being behind makes a person farm
##               carefully, not stop farming
##   in danger   you're within reach and could kill it with what you have ready,
##               or you're faster and it's near its retreat point: it retreats
##
## SMARTNESS (0..1, run.gd's ladder) blends every DUMB key from the dumb value
## (at 0) to the personality's own (at 1). A dumb bot thinks slowly, blunders
## (skips the right step), comes back a bit early, only
## trades when well ahead, misses your openings, and hasn't learned to use its
## ultimate or siege — those two are ROUND gates now (ULT_FROM, SIEGE_FROM),
## not smartness ones.
##
## How hard it plays comes from three dials (see run.gd): stats (its health
## and damage, set on it by main), skill (`difficulty`: how often it casts, how
## well it aims, its last-hit / deny odds) and `smartness` (decisions, below).

const PersonalityTemplates := preload("res://scripts/personality_templates.gd")
const HeroMinds := preload("res://scripts/hero_minds.gd")
const Lane := preload("res://scripts/lane.gd")
const ComboBook := preload("res://scripts/combo_book.gd")

const THINK := 0.2
const CAST_GAP := 1.1        # reaction time between its ability casts (full strength)
const RETREAT_AT := 0.3
const HEALED_AT := 0.9
const AIM_ERROR := 35.0      # px of random miss on predicted shots (full strength)
const REACTION := 0.3        # s from danger to escaping (full strength: a sharp human, not instant)
const JITTER := 0.2          # reaction and hesitation vary ±20% around the round's value each time
const TRADE_PAD := 120.0     # how far outside attack range it'll step in to trade
const TRADE_CAP := 0.9       # at or above this health it'll always trade
const ENGAGE := 450.0        # …but at least this close — melee heroes walk in to fight
const FARM_RANGE := 700.0
const SIEGE_REACH := 250.0   # how far it'll walk in to hit a tower its creeps are tanking
const LAST_HIT_SLACK := 1.6  # swing when a creep is within this many hits of dying

## Personality tables. Keys (all optional; missing = standard bot):
##   order        steps after retreat / back off, in priority order:
##                abilities, trade, farm, deny, siege, leash
##   retreat_at / healed_at   health fractions for going home / coming back
##   engage       min trade reach (px)        trade_cap   always trades above this health
##   trade_margin how far ahead on health before it trades (negative = while behind)
##   trade_when   always | vulnerable | provoked (only after you hit it)
##   hero_casts   always | vulnerable | poke (ranged abilities always; close-up
##                ones and the ultimate only when you're vulnerable)
##                                            creep_casts  cast on creep clumps
##   creeps_first try creep clumps before you  clump        creeps that make a clump
##   dash_at      dash in when your health is under this fraction
##   hold_back    px behind its front creep    home_leash   stay within this of its
##                                                           tower unless you're vulnerable
##   siege_always sieges even before SIEGE_FROM  siege_reach  px it walks in to siege
##   (No freezing: pushing matters more here than in other MOBAs — every
##   personality pushes and clears with its abilities. With you near it pushes
##   from behind its own wave, never out in front of it.)
##   race_need    trades only if it wins the damage race by this much (1 = an
##                even race; 0.8 = accepts losing a little; 1.2 = wants a clear win)
##   chase_depth  px past the middle (into your half) it'll chase you; deeper
##                only to finish you (under 25% health), never under your tower
## (Skill — last-hit / deny odds, aim, reaction — is never a personality key.)
## Personalities live with each hero (hero_minds.gd); the old types are
## reference templates (personality_templates.gd), used only when an experiment
## pins one (Run.red_personality).
const STANDARD_ORDER := ["abilities", "clear", "trade", "farm", "deny", "push", "siege"]
## Wave clear ("clear" step): when your wave is pressing it — CLEAR_NEAR px of
## its tower holds CLEAR_MIN+ of your creeps and they outnumber its own by
## CLEAR_EDGE, or any are inside its tower's range — it clears with its hero's
## best tools, aimed where they hit the most creeps, plus attacks on the
## weakest. Which abilities each hero clears with (heroes.gd order:
## KYLE, CHAD, KAREN, BECKY); a shield slot shields its own wave instead.
const CLEAR_SLOTS := [["W", "Q"], ["Q", "W"], ["Q", "E"], ["W", "Q"]]  # CHAD: STARS through the line, TRAP in the clump  # KAREN: GRIND cuts the clump; SHOVE only when the wave's at its tower and you're far (it's her way into fights)
const CLEAR_NEAR := 1300.0
const CLEAR_MIN := 3
const CLEAR_EDGE := 2
const CLEAR_MANA_KEEP := 0.25  # keeps this share of mana unless the wave is at its tower
## Pressing the advantage (every personality, before its own order): you're
## dead with PRESS_DEAD+ s to go, or low (under PRESS_LOW) and far, and it's
## healthy (PRESS_HEALTHY+) — it clears your wave with everything, walks in
## with its own and hits your tower. Odds it notices = smartness.
const PRESS_DEAD := 8.0
const PRESS_LOW := 0.3
const PRESS_HEALTHY := 0.45
## Defending the core (every personality, first after retreating): its tower
## took damage in the last DEFEND_HOLD s → all in on whatever is hurting it —
## you first if you're near it (every ability at you, no holding back), else
## the creeps on it with every clear ability (no mana kept).
## Commit mode (every personality, after defending): when a burst from the
## combo book (combo_book.gd) is worth it right now, it chains the whole thing
## a short gap apart instead of one ability per cast gap. Worth it = it could
## kill you, or you're open (escape on cooldown, out of mana, abilities spent)
## and it'd take a big bite, or it's winning the trade and in the mood
## (personality COMMIT x smartness). How well it's executed comes from the
## round's skill dial, like everything else it does: it reacts to the opening
## after its reaction time (jittered), chains each step a reaction-scaled gap
## apart (jittered), aims with the round's aim error (dashes too), sometimes
## hesitates mid-combo (the round's hesitation), and dumber bots may swap two
## steps or fumble one. A late-round bot's burst lands tight and on target;
## an early one is slow, scrappy and dodgeable.
## Mistakes must look human — late, loose, a step skipped or swapped — never
## pointless: the opener and a gap-closer never move, the ultimate never comes
## before what brings it in range, nothing is cast at empty ground (a step
## waits until it can reach you), and it drops the combo rather than chase you
## under your tower or keep going while your tower shoots it.
const COMMIT_DEFAULT := 0.8
const COMMIT_MIN_HEALTH := 0.35  # won't start a combo below this much of its own health
const COMMIT_BITE := 0.35        # "open" target: worth it if the combo takes this share of your health
const BOOP_KEEP := 0.5           # below this much health it keeps BOOP for escaping (unless it's a kill)
const COMBO_STEP_WAIT := 1.5     # s it'll wait (closing in) for a step to come into reach before moving on
const DRAG_STEP_WAIT := 0.1      # s the combo holds each frame it's dragging you into its TRAP (drag_to_trap)
const BURN_WAIT_MAX := 0.8       # s a combo will hold a douse step (SHOCK) waiting for its own fire to catch
const DEFEND_HOLD := 2.5
const DEFEND_PANIC := 0.35  # with you dead it only defends a tower this low (else it presses the window)
const DEFEND_NEAR := 250.0  # you within the tower's range + this count as hitting it
const AWAY := 1200.0  # px: an enemy hero further than this (or dead) counts as away
const PUSH_LEAD := 40.0  # with you near, it pushes from at most this far ahead of its front creep
const STANDARD_MARGIN := -0.1
const STANDARD_RACE := 1.0      # standard bot: trades on an even damage race or better
const STANDARD_CHASE := 300.0   # standard bot: chases you this far past the middle
const RACE_WINDOW := 4.0        # s of fighting the damage race looks at (attacks + ready abilities)
## Outmatched: below THIS damage race it keeps out of your reach. Its own bar
## on purpose (2026-10-25) — it used to be race_need × 0.8, but race_need is the
## TRADE gate, i.e. how hard a personality plays, and reusing it here made the
## cautious characters the ones that froze: at smartness 1.0 the blend reaches
## the personality's own value, so BECKY (race_need 1.2) called herself
## outmatched at a race of 0.96 — almost even. In the run of 2026-10-25 21:38
## that was `wary 89%` in round 8: she held for 73% of it, took zero damage and
## lost in 2:56, while the same BECKY at smartness 0.6 in round 4 dealt 8,867
## and nearly won. Danger is a skill (how well red reads it, hence the
## smartness roll below); the bar it reads against is the same for everyone.
## Caution still lives in race_need, which `_wants_trade` reads unchanged.
const WARY_RACE := 0.7
## Hurt AND losing the race → go home rather than walk back in. Still scaled by
## race_need: this one only fires near retreat health, where a cautious
## character leaving earlier is in character and costs it nothing.
const LOSING_RACE := 0.8
const BURST_WINDOW := 2.0       # s of your attacks counted in "could you kill me right now"
const FASTER_MARGIN := 0.12     # vs a faster enemy it leaves this much health earlier
## The dumb end of every personality (smartness 0). Numbers only; each blends
## toward the personality's value (or the standard bot's) as smartness rises.
##   think     seconds between decisions     blunder   chance to skip each step
##   healed_at comes back a bit early        trade_margin  only trades when well ahead
## (No retreat_at: a dumb bot wants to leave at the same health as a smart one;
## it's just slower about it — think, plus the skill dial's hesitation and
## reaction.)
const DUMB := {"think": 0.6, "blunder": 0.3, "healed_at": 0.75, "trade_margin": 0.2, "race_need": 0.8}
## Red learns its ultimate and learns to siege in round 2. These were
## smartness gates (both 0.4) until 2026-10-26, which on the old +0.1-a-round
## ladder happened to mean "round 2" — so these constants preserve exactly the
## behaviour that proxy produced, and nothing else changes. They had to move:
## smartness now steps per 4-round CYCLE (run.gd SMART_BY_CYCLE), so a 0.4
## threshold would have switched BOTH systems off for the whole of rounds 1-4,
## meaning red never threatened your tower by hand in cycle 1 and you could
## safely ignore it — an exploit, and a lesson the game would never teach.
## Round 1 being the odd one out is deliberate (it is the gentle round); if
## cycle 1 should instead be kits-only, raise ULT_FROM to 5, but leave
## SIEGE_FROM early so the tower threat is taught from the start.
const ULT_FROM := 2         # uses its ultimate from this round
## How keen each personality is on stutter-stepping (× smartness = the odds).
const STUTTER_DEFAULT := 0.8
const STEP_MIN := 40.0      # px: a step point closer than this isn't worth moving for (no jitter)
const STEP_FROM_CD := 0.25  # s: only steps out with at least this much reload left
const SIEGE_FROM := 2       # hits your tower (creeps tanking) and runs key leashes from this round

var enemy_hero: Node2D
var lane: Node2D
## Which hero from heroes.gd it plays (-1 = the default first one).
var pick := -1
## This round's strength (run.gd DIFFICULTY row); empty = full strength.
var difficulty := {}
var personality := ""      # a pinned template type (experiments) — "" plays its hero's own personality
var mind_name := ""        # its hero mind (hero_minds.gd), e.g. "KAREN · the anchor" — logs only
var _rules := {}           # its hero mind's rules (_rule)
var _stance := {}          # its hero mind's stance (where it stands: _hold_back)
const IN_WAVE := 350.0     # px: its creeps this close = it's in its wave
const CROWD_SEE := 700.0   # px: the creeps it counts either side of itself for `crowd_pull`
const LANE_LOST_PUSH := 400.0  # px behind the middle: the clash this deep on its own half, advancing comes first
const WAVE_BLUNDER := 0.33 # a dull bot skips wave steps (farm / clear / push) this much less often than others
## How well it decides, 0..1 (run.gd's ladder; 1 = the personality as tuned).
var smartness := 1.0
var _p := {}

var _think := 0.0
var _cast_gap := 2.0
var _retreating := false
var _lane_y := 0.0  # its own lateral spot in the lane (_lane_y_tick re-takes it)
var _lane_y_at := 0.0
const LANE_Y_EVERY := 1.5   # s between re-picks: a hero repositions, it doesn't vibrate
const LANE_Y_BAND := 240.0  # px off its wave's line it will stand to keep away from you
const LANE_Y_CAP := 340.0   # px: it stays near the wave, never out at the lane edge
const WAVE_Y_NEAR := 700.0  # px: its creeps this close count as the clash it is standing in
const LANE_Y_STEP := 120.0  # px it will slide per re-pick: it walks across the lane, never snaps
const LANE_Y_DEAD := 25.0   # px: a smaller correction than this isn't worth moving for
## Shuffling while you are close enough to punish standing still (_lane_y_tick).
const LANE_Y_WATCHED := 0.8  # s between re-picks while you are near (1.5 otherwise)
const WATCHED_PAD := 250.0   # px past your reach that still counts as you watching it
const JUKE_MIN := 50.0       # px of the shuffle, smallest...
const JUKE_MAX := 110.0      # ...and largest (random each time: a fixed wobble is a free read)
var _lane_y_flip := 1.0
var _react_left := -1.0  # counting down to escaping (-1 = no danger noticed yet)
var _hesitate_left := -1.0  # ignoring the urge to run for this much longer (-1 = not hurt yet)
var _hesitate_hp := 0.0       # its health share when it started hesitating
const HESITATE_HURT := 0.1    # losing this much more while hesitating ends it: it runs
const LOW_MARGIN := 0.1       # outmatched with you near, it won't stay in under retreat_at + this
var _deny_roll := {}
var _capsule_roll := {}  # capsule id -> whether it bothers going for that one of yours
## This decision: does it see that you out-damage it (it noticed — odds =
## smartness)? Then it keeps out of your reach and won't farm inside it.
var _wary := false
## Sticky rolls: "does it notice / blunder" answers kept for ROLL_HOLD s
## (± a little) instead of re-rolled every decision — re-rolling made a dumb
## bot flicker between choices and step back and forth. key → [answer, until]
var _rolls := {}
var _clock := 0.0  # game seconds (so autoplay's fast clock works too)
const ROLL_HOLD := 1.5  # creep id -> whether it decided to deny that creep
const NOTICE_HOLD := 4.0  # "notice" rolls (danger, outmatched, an opening, a low you) hold this long: 1.5 s made wariness flicker
var _lh_roll := {}    # creep id -> whether it decided to go for that last hit
var _stutter_target: Node2D = null  # the hero it's trading with while stutter-stepping
var _stepping := false              # walking to a step point between attacks
var _idle := false                  # this decision found nothing to do: just holding its spot
var _combo := {}                    # commit mode in progress: {seq, i, next, target, waited}
## What its latest decision was (retreat, backoff, combo, defend, commit,
## press, a step name, hold) — for tests and debugging; nothing reads it.
var why := ""
## Danger retreats (healthy, but you could kill it): it backs off until it's
## clear of your reach, then stays shy — keeping out of your reach, like a wary
## bot — for SHY_FOR s. Without this it stepped in and out of your reach every
## decision (round 10 of the 2026-10-06 run: 78 turnarounds in 40 s).
var _danger_retreat := false
var _shy_until := 0.0
const SHY_FOR := 2.5
## Every "back off" decision stays backed off for a while — hysteresis, so no
## step can undo it on the very next decision (autoplay --osc finds the loops):
## your tower shooting it → your tower's range counts as unsafe for TOWER_SHY s;
## a combo dropped (you fled under your tower, or the tower shot it) → no new
## combo for COMMIT_BLOCK s; a puller (BOOP) never opens a combo while the
## back-off rules are about to fire — dragging you closer and then fleeing is
## the worst of both; a combo for COMMIT_BLOCK s; a combo it finished → no new combo for
## COMBO_BREATH s scaled by how dull it is (sharp bots chain freely);
## shy / wary → no stepping into your reach to deny,
## clear, push or defend (it still pokes for last hits — _poke_ok).
const TOWER_SHY := 3.0
const WARY_BAND := 120.0  # px: a wary bot this far (or less) outside your reach stays where it is
## Poking (2026-10-25). Wary used to mean freeze: it skipped every creep,
## capsule and push target inside your reach, which switched off red's income
## exactly when it was behind, so it stayed behind — the wary spiral of the
## 2026-10-25 21:38 run (round 8: `doing: hold 73% … farm 1%`, red reaching the
## farm step every decision and finding every candidate filtered out). A person
## who is behind farms carefully instead: they take the last hits they can
## reach from the edge of your threat and decline everything that needs
## stepping in. POKE_BITE is how far into your reach it will lean for one,
## judged from where it would have to STAND to take the shot — so a ranged
## hero pokes safely and a melee one has to take real risk for the same creep,
## which is character for free. It is deliberately not safe: red can misjudge
## the lean and eat a combo for one creep, the same mistake a person makes.
## _in_danger is a separate check on a separate roll, so it still bails out of
## burst it can actually see — it just no longer refuses to earn money.
const POKE_BITE := 0.35
const COMMIT_BLOCK := 3.0
## Round 1 is meant to be the gentle one, and a dull red used to kill like a
## sharp one: it took the kill combo 65% of the time at smartness 0.3 and
## chained straight into a second one. Two knobs hold it back, both fading to
## nothing at smartness 1.0 (sharp red is unchanged):
const KILL_SEEN_FLOOR := 0.2   # odds a smartness-0 bot takes a kill on the table (1.0 at smartness 1)
const COMBO_BREATH := 3.5      # s a smartness-0 bot waits after finishing a combo before starting another
var _tower_shy_until := 0.0
var _commit_block_until := 0.0
const CLEAR_MARGIN := 150.0  # px past your reach that counts as clear
## A danger retreat only has to leave your reach, so it walks to the nearest
## spot outside it rather than home (see _backoff_spot).
const BACKOFF_PAD := 60.0        # px past clear it aims for, so arriving doesn't re-trigger the retreat
const BACKOFF_FAN := [0, 30, 60, 90, 120]  # degrees off "straight away from you" it will consider
const BACKOFF_HOME_PULL := 0.25  # how much it prefers a spot nearer home over the shortest walk
## How much this hero would rather step aside than give up ground down the
## lane (the `sidestep` rule, 0..1; SIDESTEP is the neutral middle, so a mind
## that sets nothing behaves exactly as before). It only tilts the choice —
## the geometry above still decides, so nobody walks a long way sideways when
## a short step back is the way out.
const SIDESTEP := 0.5
var _tower_hp_seen := -1.0          # its tower's health last frame
var _defend_left := 0.0             # its tower was hit this recently: defend
var _hp_marks: Array[float] = []     # its health share every 0.5 s, the last 4 s (for "losing health fast")
var _hp_mark_at := 0.0
const IMPATIENT_LOSS := 0.2          # lost this share of health in 4 s: the diver stops waiting for your escape
var _moving_only := false           # retreating / backing off the tower: never stops to attack


func _init() -> void:
	is_bot = true


func _ready() -> void:
	hp_mult = difficulty.get("bot_hp", 1.0)
	damage_mult = difficulty.get("bot_damage", 1.0)
	super()
	if pick >= 0:
		set_hero(pick)
	_lane_y = randf_range(-90.0, 90.0)
	apply_personality()


## Its settings: the hero's MIND (hero_minds.gd — red plays each hero as that
## hero) layered over its lens personality; or, when an experiment pins a
## personality type (Run.red_personality), that type alone. Also after
## main.gd repick_bot swaps its hero.
func apply_personality() -> void:
	_rules = {}
	_stance = {}
	mind_name = ""
	if personality != "" or def.is_empty():  # an experiment pinned a template type (or the plain "standard" bot)
		_p = (PersonalityTemplates.TEMPLATES.get(personality, {}) as Dictionary).duplicate(true)
		return
	var foe := str(enemy_hero.def["name"]) if is_instance_valid(enemy_hero) and not enemy_hero.def.is_empty() else ""
	var m: Dictionary = HeroMinds.mind_for(str(def["name"]), Run.round_num, foe)
	_p = m["personality"]
	_rules = m["rules"]
	_stance = m.get("stance", {})
	mind_name = "%s · %s" % [def["name"], m["name"]]


## Its POWER PROFILE: where its stats sit right now, after every shop pick —
## for decisions that should change as it grows (its stance; more to come).
##   range      attack range now
##   dps        attack damage per second now
##   toughness  max health now ÷ its hero's base (1 = no health cards)
##   lifesteal  its lifesteal share
func power_profile() -> Dictionary:
	var base_hp: float = float(def.get("hp", max_hp)) * hp_mult
	return {"range": attack_range(), "dps": attack_damage() / maxf(attack_interval(), 0.05),
		"toughness": max_hp / maxf(base_hp, 1.0), "lifesteal": mod("lifesteal")}


## Its WORKING RANGE: the shortest reach among the tools it uses on the wave —
## its attack and its wave-clear abilities (CLEAR_SLOTS), range bonuses
## included. Standing within it, every one of them reaches the enemy creeps.
func working_range() -> float:
	var r := attack_range()
	var slots: Array = CLEAR_SLOTS[hero_index] if hero_index < CLEAR_SLOTS.size() else []
	for slot: String in slots:
		var a: Dictionary = abilities[slot]
		var reach := -1.0
		match str(a["kind"]):
			"ground", "orb":  # dropped at range (or at its feet when range 0), its blast reaching a bit past
				reach = (float(a["range"]) + float(a.get("radius", 0.0)) * 0.5) if float(a["range"]) > 0.0 else float(a.get("radius", 0.0))
			"beam", "skillshot", "cone", "dash", "boop":
				reach = float(a.get("range", 0.0))
			"spin":  # how far the corners reach once grown
				reach = radius * corner_factor(def.get("shape", "")) * float(a.get("grow_end", 2.0))
			"self", "rage":
				reach = float(a.get("radius", radius * 2.0))
		if reach > 0.0:
			r = minf(r, reach)
	return r


## How far behind its own front creep it holds (negative = ahead of it): its
## hero's stance worked out from its power profile, or its personality's fixed
## hold_back when it has no stance (a pinned template). `crowd_pull` gives
## ground per creep it's outnumbered by where it stands — a hero who holds the
## clash has to notice when the clash is 18 against 12 (run of 2026-10-22 R8:
## creeps did KAREN 6190, more than the player did, and killed her once).
func _hold_back() -> float:
	if _stance.is_empty():
		return float(_pv("hold_back", 140.0))
	var pp := power_profile()
	var h: float = float(_stance.get("base", 0.0)) + float(_stance.get("on_wave", 0.0)) * working_range() \
		- float(_stance.get("tough_pull", 0.0)) * (float(pp["toughness"]) - 1.0) \
		- float(_stance.get("sustain_pull", 0.0)) * float(pp["lifesteal"]) \
		+ float(_stance.get("crowd_pull", 0.0)) * _crowd_gap()
	h += float(_rule("stance_add", 0.0))  # a matchup nudge (hero_minds.gd vs)
	return clampf(h, float(_stance.get("min", -100.0)), float(_stance.get("max", 400.0)))


## How deep into its own half the clash sits (px behind the middle; 0 at or
## past it). Where the creeps meet decides the lane: whoever owns that line
## gets creeps on the other's tower, and the other side's never arrive.
func _lane_lost() -> float:
	var fwd := _forward()
	var front := -INF
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable():
			front = maxf(front, c.position.x * fwd)
	if front == -INF:
		return 0.0
	return maxf(0.0, -front)


## Should advancing jump the queue? Pushing sits 5th or 6th in every order —
## what it does once there's nothing to last-hit — so red could lose the lane
## all round and never treat that as the problem (run of 2026-10-22 R14: 95%
## of a mirror round fought on its own half, its creeps reaching the player's
## tower 0.0 times a round). It only jumps when the walk is survivable: its
## wave even or better where it stands, and it isn't wary or running.
func _push_first() -> bool:
	return _lane_lost() > LANE_LOST_PUSH and _crowd_gap() <= 0.0 and not _wary and not _retreating


## How badly its own wave is outnumbered around it (0 when even or ahead).
func _crowd_gap() -> float:
	var mine := 0
	var yours := 0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if not c.is_targetable() or position.distance_to(c.position) > CROWD_SEE:
			continue
		if c.team == team:
			mine += 1
		else:
			yours += 1
	return maxf(0.0, float(yours - mine))


## A hero-mind rule (hero_minds.gd), or `default`.
func _rule(key: String, default: Variant = null) -> Variant:
	return _rules.get(key, default)


## Standing in its own wave (2+ of its creeps close by)?
func _in_wave() -> bool:
	var n := 0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable() and position.distance_to(c.position) <= IN_WAVE:
			n += 1
	return n >= 2


## An enemy hero inside its threat zone while it's in its wave (the anchor rule).
func _threatened(eh: Node2D) -> bool:
	var r := float(_rule("threat", 0.0))
	if r <= 0.0 or eh == null or not _in_wave() or not _safe(eh.position):
		return false
	var d := position.distance_to(eh.position)
	if d <= r:
		return true
	# you're contesting its wave from range: hitting one of its creeps near it —
	# that's stepping up to it too (a ranged hero never came within r before)
	var t: Variant = eh.get("attack_target")
	return t != null and is_instance_valid(t) and t.is_in_group("creeps") and t.team == team \
		and position.distance_to(t.position) <= IN_WAVE and d <= r + eh.attack_range() + 150.0


## GRIND on a wave only when it's worth it (grind_for_kills): it finishes 2+
## creeps, or it needs the heal with 2+ in reach, or the clump is big (4+) —
## not just softening creeps for its own creeps to take.
func _grind_worth(a: Dictionary, reach: float) -> bool:
	var per: float = float(a.get("damage", 0.0)) * float(a.get("vs_creeps", 1.0)) * ability_scale("Q") * 0.8
	var near := 0
	var kills := 0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team != team and c.is_targetable() and position.distance_to(c.position) <= reach + c.radius:
			near += 1
			if c.hp <= per:
				kills += 1
	return kills >= 2 or (near >= 2 and hp / max_hp < 0.7) or near >= 4


## A personality value (or the standard bot's), blended toward DUMB by smartness.
func _pv(key: String, standard: Variant) -> Variant:
	var v: Variant = _p.get(key, standard)
	if DUMB.has(key):
		return lerpf(float(DUMB[key]), float(v), smartness)
	return v


## Low health or mana, or deep in our half: what farmers and opportunists wait
## for. A dumb bot often doesn't notice.
func _vulnerable(eh: Node2D) -> bool:
	if not _roll("notice_opening", smartness):
		return false
	return eh.hp / eh.max_hp < 0.5 or eh.mana < eh.max_mana * 0.25 \
		or eh.position.x * -_forward() > 600.0


## Overtime rally (lane.gd red_rally): +`r` damage and max health on top of
## the round's own multipliers; health keeps its fraction as max grows.
var rally := 0.0
var _rally_base_damage := -1.0


func set_rally(r: float) -> void:
	if is_equal_approx(r, rally):
		return
	if _rally_base_damage < 0.0:
		_rally_base_damage = damage_mult
	damage_mult = _rally_base_damage * (1.0 + r)
	var frac: float = hp / max_hp
	max_hp = max_hp / (1.0 + rally) * (1.0 + r)
	if is_targetable():
		hp = frac * max_hp
	rally = r


## A yes / no with odds `chance`, kept for about ROLL_HOLD s per `key`.
func _roll(key: String, chance: float) -> bool:
	var r: Variant = _rolls.get(key)
	if r == null or _clock >= float(r[1]):
		var prev: Variant = r
		var hold: float = NOTICE_HOLD if key.begins_with("notice_") else ROLL_HOLD  # (a dull bot misses things for a while, it doesn't flicker)
		r = [randf() < chance, _clock + hold * randf_range(0.7, 1.3)]
		_rolls[key] = r
		_log_roll(key, chance, bool(r[0]), prev)
	return bool(r[0])


## The round's reaction / hesitation, varied a little each time (± JITTER).
func _jitter(v: float) -> float:
	return v * randf_range(1.0 - JITTER, 1.0 + JITTER)


func _unhandled_input(_event: InputEvent) -> void:
	pass  # bots don't listen to the keyboard or mouse


func _process(delta: float) -> void:
	super(delta)
	if not is_targetable():
		_retreating = false
		return
	_cast_gap -= delta
	_clock += delta
	if is_instance_valid(enemy_hero) and enemy_hero.status_immune > 0.0:
		_foe_guard_at = _clock  # saw your D go up (the public ring): it guesses the 60 s
	if _react_left > 0.0:
		_react_left -= delta
	_lane_y_tick()
	if _clock >= _hp_mark_at:
		_hp_mark_at = _clock + 0.5
		_hp_marks.append(hp / max_hp)
		if _hp_marks.size() > 9:
			_hp_marks.pop_front()
	if _hesitate_left > 0.0:  # (stops at 0 = "done hesitating: run"; going negative read as "not hurt yet" and re-armed it — it never ran with you near)
		_hesitate_left = maxf(0.0, _hesitate_left - delta)
	var own_tower: Node2D = lane.tower(team) if lane else null
	if own_tower and own_tower.is_targetable():
		if _tower_hp_seen >= 0.0 and own_tower.hp < _tower_hp_seen:
			_defend_left = DEFEND_HOLD  # something hurt it
		_tower_hp_seen = own_tower.hp
	_defend_left = maxf(0.0, _defend_left - delta)
	_think -= delta
	if _think <= 0.0:
		_think = float(_pv("think", THINK))
		_decide()
	_combo_tick()
	if _moving_only and attack_target != null:  # fleeing: never stop to shoot (an attack order may linger from before)
		attack_target = null
		_attack_move = null
	_stutter_tick()
	_free_hit()


func _decide() -> void:
	var trading_with := _stutter_target
	_stutter_target = null  # set again below if it keeps trading
	_idle = false
	_moving_only = false
	_decide_step(trading_with)
	if _stutter_target == null:
		_stepping = false
	if why != _logged_why and PlayLog.recording():  # the play log: each change of mind, with its state
		_logged_why = why
		PlayLog.event("red_why", {"why": why, "flags": _flags(), "at": [roundi(position.x), roundi(position.y)],
			"hp": snappedf(hp / max_hp, 0.01), "mana": roundi(mana), "inputs": _inputs()})


var _logged_why := ""


# ------------------------------------------------------------------ play log: bot analysis
# Everything below only writes while the play log is recording (PlayLog.event
# returns at once otherwise); it never changes a decision.

## Its damage ledger this round (play_log.gd round_end: "red_ledger"):
## dealt to you by source, taken by source, last hits it chose to skip.
var ledger := {"dealt": {}, "taken": {}, "skipped_last_hits": 0}
var _casts_open := {}   # ability name -> {id, slot, you, creeps: {id: true}}
var _cast_ids := 0
var _commit_no := ""    # why _should_commit said no (the last time it was asked)
var _hero_hit_at := -99.0  # when your hero last hurt it (BRACE waits for a real fight)
const GRIND_CHASE := 320.0  # px: you this close while it spins → it walks onto you
var _passed_until := 0.0
const PASS_LOW := 0.35  # you this low and in reach: a chance it should think about
const PASS_EVERY := 4.0 # one "passed" line per chance, not one per decision
const CAST_WINDOW := 2.5  # s after a cast its hits count toward that cast


## The numbers behind its decision right now.
func _inputs() -> Dictionary:
	var eh := _enemy_hero_alive()
	if eh == null:
		return {"you": "dead or hidden"}
	var atk: float = eh.attack_damage() / maxf(eh.attack_interval(), 0.05)
	var burst: float = (_fight_dps(eh) - atk) * RACE_WINDOW + atk * BURST_WINDOW
	var d := {"dist": roundi(position.distance_to(eh.position)), "your_reach": roundi(_threat_reach(eh)),
		"your_burst": roundi(burst), "my_hp": roundi(hp), "you_hp": snappedf(eh.hp / eh.max_hp, 0.01)}
	if PlayLog.dev():  # its internal judgement (personality-tuned): dev runs only, never a shipped log
		d.merge({"odds": snappedf(_race(eh), 0.01), "odds_need": WARY_RACE,
			"trade_need": snappedf(float(_pv("race_need", STANDARD_RACE)), 0.01),
			"retreat_at": float(_pv("retreat_at", RETREAT_AT)), "hesitate": snappedf(_hesitate_left, 0.01)})
	return d


## You're low and close, and it didn't commit: say why (once per chance).
func _log_pass(eh: Node2D, reason: String) -> void:
	if eh == null or not PlayLog.recording() or _clock < _passed_until or eh.hp / eh.max_hp > PASS_LOW:
		return
	if position.distance_to(eh.position) > float(ComboBook.BOOK[hero_index]["open"]) + 200.0:
		return
	_passed_until = _clock + PASS_EVERY
	PlayLog.event("red_passed", {"reason": reason, "why": why, "inputs": _inputs()})


## A dice roll that steers a decision: logged when it matters (a skipped step,
## a commit roll, or a notice roll that flips).
func _log_roll(key: String, chance: float, result: bool, prev: Variant) -> void:
	if not PlayLog.recording() or key == "key_pick":
		return
	if key.begins_with("blunder_"):
		if not result:
			return
	elif not (key.begins_with("commit_") or key in ["kill_key", "totem_contest"]):
		if prev != null and bool(prev[0]) == result:
			return  # same as last time: nothing changed
	PlayLog.event("red_roll", {"key": key, "chance": snappedf(chance, 0.01), "result": result})


## hero.gd _log_cast: a cast to follow for CAST_WINDOW s — did it hit you?
func track_cast(ability: String, slot: String) -> void:
	if _casts_open.has(ability):
		_flush_cast(ability, int(_casts_open[ability]["id"]))
	_cast_ids += 1
	var id := _cast_ids
	_casts_open[ability] = {"id": id, "slot": slot, "you": 0.0, "creeps": {}}
	_later(CAST_WINDOW, func() -> void: _flush_cast(ability, id))


## Every cast still inside its CAST_WINDOW, logged now because the round is
## over and the timers won't fire: without this the last casts of a round —
## often the ones that decided it — never reach the cast table (14 of 1014
## across the run of 2026-10-22).
func flush_open_casts() -> void:
	for ability: String in _casts_open.keys():
		_flush_cast(ability, int(_casts_open[ability]["id"]))


func _flush_cast(ability: String, id: int) -> void:
	var c: Variant = _casts_open.get(ability)
	if c == null or int(c["id"]) != id:
		return
	_casts_open.erase(ability)
	PlayLog.event("red_cast_result", {"ability": ability, "slot": c["slot"], "hit_you": float(c["you"]) > 0.0,
		"you_dmg": roundi(c["you"]), "creeps_hit": (c["creeps"] as Dictionary).size()})


func on_dealt(amount: float, hit: Dictionary = {}, victim: Node2D = null) -> void:
	super(amount, hit, victim)
	if not PlayLog.recording() or victim == null or not is_instance_valid(victim):
		return
	var key: String = "attack" if hit.is_empty() else str(hit.get("ability", "ability"))
	if victim == enemy_hero:
		ledger["dealt"][key] = float(ledger["dealt"].get(key, 0.0)) + amount
	if _casts_open.has(key):
		if victim == enemy_hero:
			_casts_open[key]["you"] = float(_casts_open[key]["you"]) + amount
		elif victim.is_in_group("creeps"):
			_casts_open[key]["creeps"][victim.get_instance_id()] = true


func take_damage(amount: float, colour: Color, big := false, quiet := false, source: Node2D = null, hit: Dictionary = {}) -> void:
	var before := hp + shield_hp
	if source != null and is_instance_valid(source) and source.is_in_group("heroes") and source.team != team:
		_hero_hit_at = _clock
	super(amount, colour, big, quiet, source, hit)
	if not PlayLog.recording():
		return
	var lost := before - (maxf(hp, 0.0) + shield_hp)
	if lost <= 0.0:
		return
	var key := "other"
	if source != null and is_instance_valid(source):
		if source.is_in_group("heroes"):
			key = "you: " + ("attack" if hit.is_empty() else str(hit.get("ability", "ability")))
		elif source.is_in_group("creeps"):
			key = "creeps"
		elif source.is_in_group("towers"):
			key = "tower"
	ledger["taken"][key] = float(ledger["taken"].get(key, 0.0)) + lost


## The ledger rounded, for the round's summary.
func ledger_summary() -> Dictionary:
	var out := {"skipped_last_hits": ledger["skipped_last_hits"], "dealt": {}, "taken": {}}
	for side: String in ["dealt", "taken"]:
		for k: String in ledger[side]:
			out[side][k] = roundi(ledger[side][k])
	return out


## What colours its decisions right now (for the play log).
func _flags() -> Array:
	var f := []
	if _retreating:
		f.append("danger_retreat" if _danger_retreat else "retreat")
	if _wary:
		f.append("wary")
	if _clock < _shy_until:
		f.append("shy")
	if _clock < _tower_shy_until:
		f.append("tower_shy")
	if not _combo.is_empty():
		f.append("combo")
	if _defend_left > 0.0:
		f.append("defending")
	if _key != null:
		f.append("key")
	if _trip:
		f.append("totem_trip")
	if _clock < _contest_until:
		f.append("contesting")
	if _pressing():
		f.append("pressing")
	return f


## Its state for a play-log snapshot.
func log_state() -> Dictionary:
	var t: Variant = attack_target
	var tk := "none"
	if t != null and is_instance_valid(t):
		tk = "hero" if t.is_in_group("heroes") else ("tower" if t.is_in_group("towers") else ("creep" if t.is_in_group("creeps") else "other"))
	return {"why": why, "flags": _flags(), "target": tk, "leashed": leashed.size(), "hold": roundi(_hold_back()), "reach": roundi(working_range())}


## Just over its retreat line and losing every trade, with you near: a person
## goes home here rather than walk back in (KAREN pushed into your half at 31%
## with odds 0.3, and died).
func _low_and_losing(foe: Node2D, hp_frac: float) -> bool:
	if foe == null or hp_frac >= float(_pv("retreat_at", RETREAT_AT)) + LOW_MARGIN:
		return false
	if position.distance_to(foe.position) > _threat_reach(foe) + 300.0:
		return false
	return _race(foe) < float(_pv("race_need", STANDARD_RACE)) * LOSING_RACE


## Guard (D): red reaches for it like a person would — a beat after it gets
## locked down (stunned, tethered, slowed hard) with you close, or when it's
## low and being hit. Sharper bots react quicker.
var _guard_seen := -1.0  # when the current trouble started (-1 = none)
const GUARD_SLOWED := 0.3


func _guard_tick(foe: Node2D, hp_frac: float) -> void:
	if guard_cd > 0.0 or not is_targetable():
		_guard_seen = -1.0
		return
	var close: bool = foe != null and position.distance_to(foe.position) <= _threat_reach(foe) + 100.0
	var locked: bool = is_stunned() or (tether_left > 0.0 and not tether_owner) or move_slow >= GUARD_SLOWED  # its own POUNCE tether is no trouble
	var trouble: bool = close and (locked or (hp_frac < 0.35 and _since_hit < 0.5))
	if not trouble:
		_guard_seen = -1.0
		return
	if _guard_seen < 0.0:
		_guard_seen = _clock
		return
	if _clock - _guard_seen >= lerpf(0.6, 0.15, clampf(smartness, 0.0, 1.0)):
		why = "guard"
		guard()
		_guard_seen = -1.0


func _decide_step(trading_with: Node2D) -> void:
	var home := Lane.base_of(team)
	var hp_frac := hp / max_hp
	var foe := _enemy_hero_alive()
	_guard_tick(foe, hp_frac)
	_wary = foe != null and (_clock < _shy_until or (_roll("notice_outmatched", smartness) and _race(foe) < WARY_RACE))
	if _retreating and _danger_retreat:  # backing off from your burst: until clear of your reach, then shy for a moment
		if foe == null or position.distance_to(foe.position) > _threat_reach(foe) + CLEAR_MARGIN:
			_retreating = false
			_danger_retreat = false
			_shy_until = _clock + SHY_FOR
			_wary = foe != null
	elif _retreating and hp_frac >= float(_pv("healed_at", HEALED_AT)):
		_retreating = false
	elif not _retreating and (hp_frac < float(_pv("retreat_at", RETREAT_AT)) or _in_danger(foe) or _low_and_losing(foe, hp_frac)):
		if _hesitate_left < 0.0:  # just got hurt enough to run: early bots fight on a moment first —
			var near: bool = foe != null and position.distance_to(foe.position) <= _threat_reach(foe) 				and hp_frac >= float(_pv("retreat_at", RETREAT_AT)) - HESITATE_HURT  # already well under (hurt mid-combo): no moment to spare
			_hesitate_left = _jitter(float(difficulty.get("hesitate", 0.0))) if near else 0.0  # (nobody near: just go)
			_hesitate_hp = hp_frac
		elif hp_frac < _hesitate_hp - HESITATE_HURT:
			_hesitate_left = 0.0  # a moment's greed, not standing there frozen while you burst it (KAREN hesitated from 38% to 2%)
		if _hesitate_left <= 0.0:
			_retreating = true
			_danger_retreat = hp_frac >= float(_pv("retreat_at", RETREAT_AT)) and not _low_and_losing(foe, hp_frac)  # healthy: it's your burst it's running from (low and losing: home to heal)
	if not _retreating:
		_react_left = -1.0  # out of danger: the next scare starts a fresh reaction
		if hp_frac >= float(_pv("retreat_at", RETREAT_AT)) and not _in_danger(foe):
			_hesitate_left = -1.0
	if _retreating:
		_moving_only = true
		for slot: String in SLOT_ORDER:  # it Rushed in and now wants out: let go of the tether
			if can_untether(slot):
				cast(slot, position)
		why = "retreat"
		_log_pass(foe, "retreating")
		_end_key("retreat")
		if _trip:  # a totem trip ends too (its creeps go back to the lane below)
			_trip = false
			_trip_block_until = _clock + TOTEM_GAP
		if not leashed.is_empty():  # its creeps would follow it home: send them back to the lane, a moment late
			if _release_at < 0.0:
				_release_at = _clock + _jitter(float(difficulty.get("reaction", REACTION)))
			elif _clock >= _release_at:
				for c: Variant in leashed.duplicate():
					toggle_leash(c)
				why = "unleash:retreat"
		var to := home + Vector2(0.0, _lane_y * 0.5)
		if _danger_retreat and foe != null:
			to = _backoff_spot(foe, home)  # not hurt, just out of your reach: sideways is usually nearer than home
		_escape(to)
		_go(to)
		return

	_release_at = -1.0
	var et := _enemy_tower()
	_tow_guard(foe, et)
	if _key != null and _key_tick(et, _enemy_hero_alive()):
		return  # a key run in progress (before backoff: its creep takes the tower's shots in a moment)
	if et and et.target == self:
		_moving_only = true
		why = "backoff"
		_tower_shy_until = _clock + TOWER_SHY
		_go(Vector2(et.position.x - _forward() * (et.RANGE + 160.0), position.y))
		return

	var eh := _enemy_hero_alive()
	if eh != null:
		_hunt_decided = false  # you're up: the next time you die it decides afresh
	if not _combo.is_empty():
		why = "combo"
		return  # mid-combo: _combo_tick drives it
	if spin_left > 0.0 and eh and position.distance_to(eh.position) <= GRIND_CHASE and _safe(eh.position):
		why = "grind chase"  # GRIND moves with it: onto you for the rest of the spin
		if position.distance_to(eh.position) > radius + eh.radius + 40.0:
			_go(eh.position)  # (already on you: stays put — re-walking onto you every decision jittered)
		return
	if _defend(eh):
		if why != "defend:key":
			why = "defend"
		return
	if eh and _should_commit(eh):
		why = "commit"
		_start_combo(eh)
		return
	if eh:
		_log_pass(eh, _commit_no)
	if _hunt_tick():
		return
	if _pressing() and _press():
		why = "press"
		return
	if _bullet_tick():
		return
	if _capsule_tick(eh):
		return
	if _zone_tick(eh):
		return
	if _dive_tick(eh):
		return
	if _art_tick(eh):
		return
	if _key_tick(et, eh):
		return
	if _totem_tick(eh):
		return
	if _push_first():  # the lane is being fought on its own half and its wave can take the walk
		var lane_creep := _push_target(eh)
		if lane_creep != null:
			why = "push:lane"
			if attack_target != lane_creep:
				order_attack(lane_creep.position)
			return
	var blunder: float = _pv("blunder", 0.0)
	for step: String in _pv("order", STANDARD_ORDER):
		var skip: float = blunder * (WAVE_BLUNDER if step in ["farm", "clear", "push"] else 1.0)
		if _roll("blunder_" + step, skip):
			continue  # a dumb bot skips what it should be doing (the wave basics far less often: it misses timing, not the lane)
		why = step
		match step:
			"abilities":
				_use_abilities()
			"leash":
				_leash_nearby()
			"clear":
				if _clear_wave(eh):
					return
			"trade":
				if eh and _wants_trade(eh):
					if _roll("stutter", smartness * float(_p.get("stutter", STUTTER_DEFAULT))):
						_stutter_target = eh  # _stutter_tick fires and steps between attacks
						if _stepping and trading_with == eh:
							return  # mid-step: leave it be
						_stepping = false
					if attack_target != eh:
						order_attack(eh.position)
					return
			"farm":
				var creep := _farm_target()
				if creep:
					if attack_target != creep:
						order_attack(creep.position)
					return
			"push":  # nothing to last-hit: shove the wave forward (attack the nearest enemy creep)
				var pc := _push_target(eh)
				if pc:
					if attack_target != pc:
						order_attack(pc.position)
					return
			"deny":
				if difficulty.get("deny_chance", 1.0) > 0.0:  # maybe deny its own creep
					var own := _deny_target()
					if own:
						if attack_target != own:
							order_deny(own)
						return
			"siege":
				if et and (Run.round_num >= SIEGE_FROM or _pv("siege_always", false)) and _safe(et.position) and not et.shielded_from(team) \
						and position.distance_to(et.position) < attack_range() + et.radius + float(_pv("siege_reach", SIEGE_REACH)):
					if attack_target != et:
						order_attack(et.position)
					return

	_idle = true  # nothing to do: hold the spot (free hits may fill the time)
	why = "hold"
	_hold_at(_lane_spot())


## Pushing: the nearest enemy creep to hit (not just last hits) — nobody
## freezes. Never under your tower unless its creeps are tanking it.
func _push_target(eh: Node2D) -> Node2D:
	var away := eh == null or position.distance_to(eh.position) > AWAY
	# with you around, push only from behind its own wave and not past its chase limit
	var fwd := _forward()
	var front := -INF  # its most advanced creep, in "toward you" terms
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable():
			front = maxf(front, c.position.x * fwd)
	var best: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team or not c.is_targetable() or not _safe(c.position) or position.distance_to(c.position) > FARM_RANGE:
			continue
		if _wary and _too_close_to_foe(c.position):
			continue  # outmatched (or shy): push the creeps out of your reach, not those
		if not away:
			var reach_from := c.position.x * fwd - attack_range() - radius  # where it'd stand to hit it
			if reach_from > front + PUSH_LEAD or c.position.x * fwd > float(_pv("chase_depth", STANDARD_CHASE)):
				continue  # would put it in front of its own wave, or deep in your half
		if best == null or _push_key(c) < _push_key(best):
			best = c
	return best


## How much it wants to hit creep `c` (lower = sooner): the nearest — or, with
## front_first (the anchor), the one furthest into its half (pushing its tower).
func _push_key(c: Node2D) -> float:
	if _rule("front_first", false) and lane:
		var own: Node2D = lane.tower(team)
		if own:
			return own.position.distance_to(c.position) - (LED_PULL if _led(c) else 0.0)
	return _pick_dist(c)


## Step 2 of the leash plan: a creep your hero leads is worth more than a lane
## creep — it's the one you'll use to open its tower's shield (or, later, to
## fill a totem). Picking creeps to hit, it counts as LED_PULL px nearer.
const LED_PULL := 250.0
func _led(c: Node2D) -> bool:
	if c.team == team:
		return false
	var l: Variant = c.get("leader")
	return (l != null and is_instance_valid(l)) or c.get("camp") != null  # led by you, or latched on your totem


func _pick_dist(c: Node2D) -> float:
	return position.distance_to(c.position) - (LED_PULL if _led(c) else 0.0)


## The creep holding its tower's shield open, if killing it would shut it: every
## one of your creeps in the tower's range is one you lead (lowest health first).
func _shield_key(t: Node2D) -> Node2D:
	var key: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team or not c.is_targetable() or t.position.distance_to(c.position) > t.RANGE + c.radius:
			continue
		if not _led(c):
			return null  # your wave is there too: killing one led creep won't shut it
		if key == null or c.hp < key.hp:
			key = c
	return key


# ------------------------------------------------------------------ leash intents

## Leashing with a purpose (IDEAS.md "Red's leashing"; step 1 of the plan).
## KEY: tower shields stay up all round, so when its creeps can't reach your
## tower (busy with your wave, or cleared as they arrive) it leashes one —
## tank > melee > ranged — waits for it just outside your tower's range, then
## goes in: the creep opens the shield and takes the tower's shots while it hits
## the tower. Only in an opening: you're dead, or it's overtime and you're far
## from your tower. A run holds KEY_HOLD s at least (no flip-flopping) and ends
## when the creep dies — the shield is back and the usual rules (back off)
## take over — or the opening closes. Retreating releases its creeps.
const KEY_FETCH := 350.0       # px: how far it reaches for a creep
const KEY_FETCH_OPEN := 700.0  # …when you're dead: a real window
const KEY_HOLD := 3.0          # a run lasts at least this long
const KEY_MAX := 20.0          # …and at most this long (a creep stuck somewhere)
const KEY_BLOCK := 4.0         # after a run ends, no new one for this long
const KEY_BLOCK_CLOSED := 12.0 # …this long when you came back to stop it (wait for a real new chance)
const KEY_STAGE := 80.0        # px outside your tower's range where it waits for its creep
const KEY_CLOSE := 140.0       # its creep this close: go in
const KEY_ARRIVING := 300.0    # its own creeps this close to your tower's range: wait for them instead
const KEY_MIN_HP := 0.4        # never starts one below this much health
const KEY_WINDOW := 6.0        # s: you dead at least this much longer, or it's not worth the walk
const KEY_WALK := 1500.0       # px: farthest it'll walk to the waiting spot (unless you're dead long enough to cover more)
var _key: Node2D = null        # the creep it's bringing
var _key_more: Array = []      # a second one, when one alone can't soak enough tower shots
const KEY_HITS := 3            # its creeps must last long enough for it to walk in and land this many hits on the tower
var _key_until := 0.0          # held until (KEY_HOLD)
var _key_end := 0.0            # given up at (KEY_MAX)
var _key_block_until := 0.0
var _key_sent := false         # its creep let go at the stage, walking into your tower's range
var _key_sent_at := 0.0
const KEY_SEND_WAIT := 2.5     # s after sending: still no shield open → it gives up (it stood there 4 s once)
var _release_at := -1.0        # retreating: lets its leashed creeps go at this time
var key_ended := ""            # why the last run ended (autoplay --osc prints it)
var key_runs := true           # (autoplay --no-key switches them off, for A/B tests)


## Is there an opening to walk a creep into your tower? You're dead for a
## while yet, or it's overtime and you're well away from your tower. (Your
## well is right behind your tower, and a decoy lasts 2 s: neither is one.)
func _key_open(et: Node2D, starting: bool) -> bool:
	if (starting and hp / max_hp < KEY_MIN_HP) or not is_instance_valid(enemy_hero):  # (once going, retreat_at decides when it's too hurt)
		return false
	var you := enemy_hero
	if not you.is_targetable():
		return not starting or float(you.respawn_in) >= KEY_WINDOW  # (a run under way carries on till you're back)
	# overtime: you're well away from your tower to start one; a run under way
	# carries on until you're actually close (hysteresis — no start / stop loop
	# while you hover at the line)
	var need: float = _threat_reach(you) + (CLEAR_MARGIN + et.RANGE * 0.5 if starting else 0.0)
	return Unit.no_gold and (not _wary or not starting) and not you.hidden_by_decoy() 		and you.position.distance_to(et.position) > need


## Why the opening counts as closed (for key_ended / autoplay --osc).
func _closed_why(et: Node2D) -> String:
	if not is_instance_valid(enemy_hero):
		return "closed: no foe"
	var you := enemy_hero
	if not you.is_targetable():
		return "closed: ?dead"
	if not Unit.no_gold:
		return "closed: you're back (not overtime)"
	if you.hidden_by_decoy():
		return "closed: decoy"
	return "closed: you came within %d of your tower (reach %d)" % [int(you.position.distance_to(et.position)), int(_threat_reach(you))]


## Starts, runs or ends a key run. True while it's driving the bot.
func _key_tick(et: Node2D, eh: Node2D) -> bool:
	if et == null or not et.is_targetable():
		_end_key("no tower")
		return false
	if _key != null:
		_key_more = _key_more.filter(func(c: Variant) -> bool: return is_instance_valid(c) and c.is_targetable() and (c.leader == self or _key_sent))
		if (not is_instance_valid(_key) or not _key.is_targetable() or (_key.leader != self and not _key_sent)) and not _key_more.is_empty():
			_key = _key_more.pop_front()  # the first one died: the second keeps the shield open
		if not is_instance_valid(_key) or not _key.is_targetable() or (_key.leader != self and not _key_sent) or _clock >= _key_end:
			_end_key("creep gone" if _clock < _key_end else "too long")  # the creep died (or got stuck): the shield's back
			return false
		if not _key_sent and _key_soak(_key_group()) < _key_need(et):
			_end_key("not worth it")  # its creeps got hurt on the way: they'd die before it lands a hit
			return false
		if et.target == self:
			_end_key("shot")  # your tower is on it, not its creep: back off (the usual rule) instead of standing in it
			return false
		if eh != null and position.distance_to(eh.position) <= _threat_reach(eh):
			_end_key("contested")  # you came at it: the usual rules (fight / back off), not standing at the stage
			return false
		var own: Node2D = lane.tower(team) if lane else null
		var raided: bool = eh != null and own != null and eh.position.distance_to(own.position) <= own.RANGE + DEFEND_NEAR
		if _clock >= _key_until and (not _key_open(et, false) or raided):  # (creeps chipping its tower don't call it home: you there do)
			_end_key("raided" if raided else _closed_why(et))  # the opening closed (or you're at its tower)
			return false
		return _key_run(et)
	if not key_runs or _clock < _key_block_until or _defend_left > 0.0 or not et.shielded_from(team) or not _key_open(et, true):
		return false
	if not (Run.round_num >= SIEGE_FROM or _pv("siege_always", false)):
		return false
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable() and c.leader == null \
				and c.position.distance_to(et.position) <= et.RANGE + KEY_ARRIVING:
			return false  # its wave is about to get there anyway
	if eh != null and position.distance_to(eh.position) <= _threat_reach(eh) + CLEAR_MARGIN:
		return false  # you're right there: not an opening, however far you are from your tower
	var walk: float = absf(et.position.x - _forward() * (et.RANGE + radius + KEY_STAGE) - position.x)
	var walk_ok: bool = walk <= KEY_WALK
	if eh == null and is_instance_valid(enemy_hero):  # you're dead: fine if it gets there (with a few seconds to spare) before you're back
		walk_ok = walk / maxf(speed, 1.0) + 3.0 <= float(enemy_hero.respawn_in)
	if not walk_ok:
		return false
	var group := _key_pick(et, KEY_FETCH_OPEN if eh == null else KEY_FETCH)
	if group.is_empty():
		return false
	for g: Node2D in group:
		if g.leader != self and not toggle_leash(g):
			for h: Node2D in group:  # couldn't take them all: none
				if h.leader == self:
					toggle_leash(h)
			return false
	_key = group[0]
	_key_more = group.slice(1)
	PlayLog.event("red_key", {"creep": "+".join(group.map(func(g: Node2D) -> String: return g.kind)), "soak": snappedf(_key_soak(group), 0.1),
		"need": snappedf(_key_need(et), 0.1), "you_dead": not enemy_hero.is_targetable(), "overtime": Unit.no_gold})
	_key_until = _clock + KEY_HOLD
	_key_end = _clock + KEY_MAX
	return _key_run(et)


## The creeps to bring: one, or two when one can't soak enough tower shots
## (its leash points allowing) — ones it already leads, or free ones in reach.
## [] when nothing in reach lasts long enough: not worth the walk (a hurt
## creep died to the tower before it landed a hit — nearly every run did).
## A sharp bot takes the sturdiest set; a duller one the nearest that will do.
func _key_pick(et: Node2D, reach: float) -> Array:
	var smart := _roll("key_pick", 0.5 + 0.5 * smartness)
	var cands: Array = []
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team != team or not c.is_targetable() or c.get("risen"):
			continue
		if c.leader == self or (c.leader == null and position.distance_to(c.position) <= reach):
			cands.append(c)
	var free := leash_capacity() - leash_used()  # (creeps it already leads are counted in used)
	var need := _key_need(et)
	var best: Array = []
	var best_score := INF
	for i in cands.size():
		for j in range(i, cands.size()):
			var group: Array = [cands[i]] if i == j else [cands[i], cands[j]]
			var cost := 0
			for g: Node2D in group:
				cost += 0 if g.leader == self else g.leash_cost()
			if cost > free or _key_soak(group) < need:
				continue
			var d := 0.0
			for g: Node2D in group:
				d = maxf(d, position.distance_to(g.position))
			var score := d + float(group.size() - 1) * 300.0 - (_key_soak(group) * 100.0 if smart else 0.0)  # one creep if it'll do; sharp: the sturdiest
			if score < best_score:
				best = group
				best_score = score
	return best


## Seconds `group` keeps the shield open under your tower's fire (it shoots one at a time).
func _key_soak(group: Array) -> float:
	var et := _enemy_tower()
	if et == null:
		return 0.0
	var per_s: float = et.damage * et.creep_damage_mult / (et.INTERVAL * et.attack_time_mult())
	var total := 0.0
	for g: Variant in group:
		if is_instance_valid(g) and g.is_targetable():
			total += g.hp + g.shield_hp
	return total / maxf(per_s, 1.0)


## Seconds its creeps must last: from the waiting spot into attack range, then KEY_HITS hits.
func _key_need(et: Node2D) -> float:
	var walk: float = maxf(0.0, KEY_STAGE + et.RANGE - attack_range())
	return walk / maxf(speed, 1.0) + KEY_HITS * attack_interval() + 0.5  # (+ the creep's own walk in after it's let go)


func _key_group() -> Array:
	var g: Array = [_key]
	g.append_array(_key_more)
	return g


## Walks its creep to your tower: wait just outside the range until it's close,
## then let it go — a free creep heads for your tower by itself — and attack
## the tower only once it's inside the range (the shield's open and the tower
## is shooting the creep). It never walks in ahead of its creep.
func _key_run(et: Node2D) -> bool:
	var stage_x: float = et.position.x - _forward() * (et.RANGE + radius + KEY_STAGE)
	var at_stage: bool = (et.position.x - position.x) * _forward() <= et.RANGE + radius + KEY_STAGE + 40.0
	if not et.shielded_from(team):
		why = "leash:key"
		if attack_target != et:
			order_attack(et.position)
		return true
	if _key_sent and _clock - _key_sent_at > KEY_SEND_WAIT:
		_end_key("creep didn't get there")  # never wait at the stage for ever
		return false
	if not _key_sent and at_stage and position.distance_to(_key.position) <= KEY_CLOSE:
		for g: Node2D in _key_group():
			if g.leader == self:
				toggle_leash(g)  # off they go, to your tower
			g.set("dive_to", et)  # straight there: they mustn't stop to fight your creeps on the way (they did, and the run stalled)
		_key_sent = true
		_key_sent_at = _clock
		PlayLog.event("red_key_send")
	why = "leash:key send" if _key_sent else "leash:key wait"
	_go(Vector2(stage_x, position.y))
	return true


func _end_key(reason := "") -> void:
	_key_sent = false
	if _key != null:
		_key_block_until = _clock + (KEY_BLOCK_CLOSED if reason.begins_with("closed") or reason in ["raided", "contested"] else KEY_BLOCK)
		key_ended = reason
		PlayLog.event("red_key_end", {"reason": reason})
	_key = null
	_key_more = []


## TOTEM (step 3; totem.gd): from lane.gd TOTEM_FROM a keen red — pusher or
## farmer, any red from TOTEM_ALL, or one with leash cards — takes creeps to its
## totem: leashes up to its points from its own wave nearby, walks them into
## the ring (they latch on and leave the leash) and goes back to the lane. One
## trip per TOTEM_GAP s, never while your wave threatens its tower, while it's
## defending or wary, and not with TOTEM_FULL of its creeps already on it.
## It only sets out with a load worth the walk (TOTEM_MIN_LOAD), and once it
## has, only a real threat turns it back — being merely wary doesn't, since a
## half-finished trip is a wasted one (run of 2026-10-22 R6: five trips of one
## or two creeps, meter 0.0 -> 0.36, both totems lost). A trip that is called
## off lets its creeps go rather than dragging them around. From
## TOTEM_CONTEST_FROM it also contests yours: once your totem is
## TOTEM_CONTEST_AT full it goes and kills the creeps latched on it (held
## TOTEM_CONTEST_HOLD s at least).
const TOTEM_ALL := 5           # from this round every personality runs trips
const TOTEM_CONTEST_FROM := 9  # ...and from this one it also contests yours
## Both sit on a cycle boundary (run.gd "ROUND CYCLES"): trips open with the
## totems themselves in cycle 2, contesting is part of cycle 3's step up.
const TOTEM_GAP := 25.0
const TOTEM_TRIP_MAX := 20.0
const TOTEM_FETCH := 550.0
const TOTEM_FAR := 1600.0      # px: farther than this from its totem, no trip
const TOTEM_FULL := 3
const TOTEM_MIN_LOAD := 2      # creeps: a smaller load isn't worth the walk (it used to go with one)
const TOTEM_CLEAR := 250.0   # px past your reach: closer than this to it or its totem, no trip
const TOTEM_CONTEST_AT := 0.4
const TOTEM_CONTEST_HOLD := 5.0
var _trip := false
var _trip_totem: Node2D = null  # the totem this trip set out for
var _trip_end := 0.0
var _trip_block_until := 0.0
var _contest_until := 0.0


func _wants_totem() -> bool:
	return bool(_p.get("totem_keen", false)) or Run.round_num >= TOTEM_ALL 		or mod("leash_points") > 0.0


func _totem_tick(eh: Node2D) -> bool:
	if lane == null or not lane.has_method("totem"):
		return false
	var mine: Node2D = lane.totem(team, position)  # its nearest (two a side since 2026-10-24)
	var yours: Node2D = null  # the one of yours worth contesting: whichever is furthest along
	for t: Node2D in lane.totems_of(1 - team):
		if yours == null or t.meter() > yours.meter():
			yours = t
	# contest yours: kill the creeps latched on it
	if yours != null and not _wary and _wave_threat() == 0 and (_clock < _contest_until 			or (Run.round_num >= TOTEM_CONTEST_FROM and yours.meter() >= TOTEM_CONTEST_AT and _roll("totem_contest", 0.3 + 0.7 * smartness))):
		var best: Node2D = null
		for c: Node2D in get_tree().get_nodes_in_group("creeps"):
			if c.team != team and c.is_targetable() and c.get("camp") == yours 					and (best == null or position.distance_to(c.position) < position.distance_to(best.position)):
				best = c
		if best != null:
			if _clock >= _contest_until:
				_contest_until = _clock + TOTEM_CONTEST_HOLD
				PlayLog.event("red_totem_contest", {"your_meter": snappedf(yours.meter(), 0.01)})
			why = "totem:contest"
			if attack_target != best:
				order_attack(best.position)
			return true
		_contest_until = 0.0
	# a trip under way: walk its creeps into the ring (they latch and leave the leash)
	if _trip:
		# the one it set out for, not whichever is nearest now: with two a side it
		# would otherwise swap targets halfway and wander between them
		var to: Node2D = _trip_totem if (is_instance_valid(_trip_totem) and _trip_totem.is_targetable()) else mine
		if to == null or _clock >= _trip_end or leashed.is_empty() or _retreating or _wave_threat() > 0 or _defend_left > 0.0:
			_trip = false
			_trip_totem = null
			_trip_block_until = _clock + TOTEM_GAP
			for c: Variant in leashed.duplicate():  # called off: let the load go back to the wave, don't trail it around
				if is_instance_valid(c) and c.is_in_group("creeps"):
					toggle_leash(c)
			return false
		why = "totem:trip"
		_go(to.position)
		return true
	if mine == null or _clock < _trip_block_until or not _wants_totem() or _wave_threat() > 0 or _defend_left > 0.0 or _wary 			or position.distance_to(mine.position) > TOTEM_FAR or _totem_contested(eh, mine):
		return false
	var on := 0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable() and c.get("camp") == mine:
			on += 1
	if on >= TOTEM_FULL:
		return false
	var free: Array = get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
		return c.team == team and c.is_targetable() and c.leader == null and c.get("camp") == null and not c.get("risen") 			and position.distance_to(c.position) <= TOTEM_FETCH)
	free.sort_custom(func(a: Node2D, b: Node2D) -> bool: return position.distance_to(a.position) < position.distance_to(b.position))
	var used := leash_used()
	var take: Array[Node2D] = []  # work out the load first: a trip with one creep isn't worth the walk
	for c: Node2D in free:
		if used + c.leash_cost() <= leash_capacity():
			take.append(c)
			used += c.leash_cost()
	if leashed.size() + take.size() < mini(TOTEM_MIN_LOAD, TOTEM_FULL - on):
		return false
	for c: Node2D in take:
		toggle_leash(c)
	if leashed.is_empty():
		return false
	_trip = true
	_trip_totem = mine
	_trip_end = _clock + TOTEM_TRIP_MAX
	PlayLog.event("red_totem_trip", {"creeps": leashed.size(), "on_it": on, "meter": snappedf(mine.meter(), 0.01)})
	why = "totem:trip"
	_go(mine.position)
	return true


## THE CAPSULE BRAIN (power_capsule.gd). Red plays its own capsules with
## reasons and contests yours; smartness is the ceiling. A dull red keeps the
## old habit — candy on sight — through the "simple" roll. A sharp one opens
## TWIN / SHIELD at once (permanent until spent: banking them is all downside),
## banks RAMPAGE until a fight is brewing or its tower needs holding, PIERCE
## until it's healthy and pushing, and SHELL until a kill window — you low, or
## your D just seen (the ring is public; it guesses the 60 s), or you far from
## your well. It spends a bank before it rots (BANK_ROT × its mind's
## bank_nerve) or when it's about to have to run (death opens the bank to you),
## walks back as far as CAPSULE_RETURN for one when the lane is quiet, and
## lurks by your cracked capsule for the deny (deny_lurk × smartness). A sharp
## red also TOWS a banked SHELL or RAMPAGE along (the player's leash: 2 points;
## capsule_tow × smartness) so the open is at hand when its window comes —
## and parks it (_tow_guard) the moment you close in (leashed it's open at any
## health), it gets hurt, or a key run needs the points. Opening
## takes seconds (300 hp), so windows are read a beat early, never mid-fight —
## and never with you nearly dead (the kill outranks candy; SHELL is that
## kill, so it's exempt) or with you healthy within CAPSULE_CONTEST of the
## capsule (cracking it to half under your nose just hands you the deny).
## Every call is logged — red_capsule_bank / red_capsule_open (reason + how
## long it was banked) / red_capsule_lurk / red_capsule_tow / red_capsule_park
## (why) / red_shell_block — for analyze-run.
const CAPSULE_SEEK := 650.0
const CAPSULE_DENY := 0.35
const CAPSULE_RETURN := 1500.0  # how far it walks back for a banked one, lane quiet
const BANK_ROT := 50.0          # s (× bank_nerve): a bank older than this is spent anyway
const SHELL_LOW := 0.55         # your health share that opens its SHELL window
const FOE_GUARD_CD := 60.0      # it saw your D: assumes it's down about this long
const LURK_RANGE := 420.0       # where it waits by your cracked capsule for the deny
const CAPSULE_CONTEST := 500.0  # you this close to its capsule: opening it hands you the deny
const TOW_REACH := 300.0        # close enough to clip the leash on (red's stand-in for your screen-range click)
const TOW_DANGER := 700.0       # you this close to the towed capsule (or to red): park it — protection back
const TOW_START := 900.0        # it only picks one up with you at least this far from it and from red
var _foe_guard_at := -1000.0    # when it last saw your D up (status_immune, the public ring)
var _bank_logged := {}          # capsule id -> true: each decision logged once
var _tow_roll := {}             # capsule id -> bool: whether this red tows this one (capsule_tow × smartness)
var _open_logged := {}
var _lurk_logged := {}


func _capsule_tick(eh: Node2D) -> bool:
	var best: Node2D = null
	var best_why := ""
	var lurk: Node2D = null
	var tow: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("capsules"):
		if not c.is_targetable() or not _safe(c.position):
			continue
		if _wary and _too_close_to_foe(c.position):
			continue
		var d := position.distance_to(c.position)
		if c.owner_team == team:
			var reason := _open_reason(c, eh)
			if reason == "":
				if not _bank_logged.get(c.get_instance_id(), false):
					_bank_logged[c.get_instance_id()] = true
					PlayLog.event("red_capsule_bank", {"power": c.power})
				if tow == null and _tow_worth(c, eh, d):
					tow = c
				continue
			if _already_running(c.power):
				continue  # it's already got this one going: a second does nothing (it cracked two TWINs 2 s apart)
			if eh != null and c.power != "bullet" and eh.hp / eh.max_hp < SHELL_LOW:
				continue  # you're nearly dead: the kill outranks candy (SHELL alone IS that kill)
			if eh != null and c.position.distance_to(eh.position) < CAPSULE_CONTEST and eh.hp / eh.max_hp > 0.3:
				continue  # you're on it and healthy enough to dare the deny: keep banking
			if d > CAPSULE_RETURN:
				continue
			if d > CAPSULE_SEEK and eh != null and position.distance_to(eh.position) < 900.0:
				continue  # the walk back is for a quiet lane, not a standoff
			if best == null or d < position.distance_to(best.position):
				best = c
				best_why = reason
		else:
			if d > CAPSULE_SEEK:
				continue
			if not c.breakable_by(team):
				if lurk == null and _lurk_worth(c, eh):
					lurk = c  # above the line, but you're working on it: wait for the window
				continue
			var id := c.get_instance_id()
			if not _capsule_roll.has(id):
				_capsule_roll[id] = randf() < CAPSULE_DENY + (1.0 - CAPSULE_DENY) * smartness * 0.8
			if not _capsule_roll[id]:
				continue
			if best == null or d < position.distance_to(best.position):
				best = c
				best_why = "deny"
	if best != null:
		why = "capsule:open" if best.owner_team == team else "capsule:deny"
		if best.owner_team == team and not _open_logged.get(best.get_instance_id(), false):
			_open_logged[best.get_instance_id()] = true
			PlayLog.event("red_capsule_open", {"power": best.power, "why": best_why, "age": snappedf(best.age(), 0.1)})
		if best.owner_team == team and best.leader == self:
			toggle_leash(best)  # park it first: cracking it leashed is cracking it unprotected
			PlayLog.event("red_capsule_park", {"power": best.power, "why": "opening"})
		if attack_target != best:
			order_attack(best.position)
		return true
	if lurk != null:
		why = "capsule:lurk"
		if not _lurk_logged.get(lurk.get_instance_id(), false):
			_lurk_logged[lurk.get_instance_id()] = true
			PlayLog.event("red_capsule_lurk", {"power": lurk.power, "left": snappedf(lurk.hp / lurk.max_hp, 0.01)})
		var spot: Vector2 = lurk.position + (position - lurk.position).normalized() * LURK_RANGE
		if position.distance_to(spot) > 40.0:
			_go(spot)
		return true
	if tow != null:
		why = "capsule:tow"
		if position.distance_to(tow.position) <= TOW_REACH:
			if toggle_leash(tow):
				PlayLog.event("red_capsule_tow", {"power": tow.power})
		else:
			_go(tow.position)
		return true
	return false


## Is this power already running on it? Opening a second one is pure waste:
## a TWIN while one stands does nothing at all (hero.gd gain_power), a SHIELD
## tops up a key it already holds, and a timed power would just restart.
func _already_running(power: String) -> bool:
	match power:
		"twin":
			return is_instance_valid(twin)
		"shield":
			return has_power_shield()
		_:
			return str(get("power")) == power


## Worth towing its banked capsule `c` (at distance `d`) along? Only the
## forward-window powers — SHELL (a shorter, harder-to-stop walk) and RAMPAGE
## (a grenade carried to the fight brewing) — picked up in passing while
## healthy and unbothered, with the leash points free, by a red keen and sharp
## enough (capsule_tow × smartness, rolled once per capsule).
func _tow_worth(c: Node2D, eh: Node2D, d: float) -> bool:
	if not (c.power == "bullet" or c.power == "rampage") or c.leader != null:
		return false
	if d > CAPSULE_SEEK:
		return false
	if hp / max_hp < 0.7 or _wary or _key != null:
		return false
	if leash_used() + c.leash_cost() > leash_capacity():
		return false
	if eh != null and (eh.position.distance_to(c.position) < TOW_START or eh.position.distance_to(position) < TOW_START):
		return false
	var id := c.get_instance_id()
	if not _tow_roll.has(id):
		_tow_roll[id] = randf() < float(_rule("capsule_tow", 0.5)) * smartness
	return _tow_roll[id]


## Towing housekeeping, every decision: park a towed capsule (unleash — its
## half-health protection comes back) the moment dragging turns risky or the
## leash points are needed. Parking is instant, so it isn't a behaviour slot.
func _tow_guard(eh: Node2D, et: Node2D) -> void:
	for c: Variant in leashed.duplicate():
		if not (is_instance_valid(c) and c.is_in_group("capsules")):
			continue
		var park := ""
		if eh != null and (eh.position.distance_to(c.position) < TOW_DANGER or eh.position.distance_to(position) < TOW_DANGER):
			park = "you're close"
		elif hp / max_hp < 0.55:
			park = "hurt"
		elif _key != null or (key_runs and et != null and et.is_targetable() and _key_open(et, true)):
			park = "key run"
		if park != "":
			toggle_leash(c)
			PlayLog.event("red_capsule_park", {"power": c.power, "why": park})


## Why red opens its own capsule `c` now — "" banks it. Windows are read a
## beat early because the break itself takes a few seconds.
func _open_reason(c: Node2D, eh: Node2D) -> String:
	var p: String = c.power
	if p == "twin" or p == "shield":
		return "keep"  # permanent until spent: waiting is all downside
	if _roll("capsule_simple", clampf(1.0 - smartness * 1.1, 0.0, 1.0)):
		return "simple"  # a dull red just takes the candy (the old habit)
	if c.age() > BANK_ROT * float(_rule("bank_nerve", 1.0)):
		return "rot"  # held long enough: spend it before it looks forgotten
	if hp / max_hp < float(_pv("retreat_at", RETREAT_AT)) + 0.15:
		return "before retreat"  # about to have to run — and dying opens the bank
	match p:
		"rampage":
			if eh != null and position.distance_to(eh.position) < 900.0 and hp / max_hp > 0.6 and not _wary:
				return "fight brewing"
			if _defend_left > 0.0:
				return "defending"  # its tower is being pressed: melt the wave on it
		"pierce":
			if hp / max_hp > 0.6 and not _wary and (eh == null or position.distance_to(eh.position) < 1100.0):
				return "pushing"
		"bullet":
			if eh == null:
				return ""
			var window: bool = eh.hp / eh.max_hp <= SHELL_LOW
			var since_d: float = _clock - _foe_guard_at
			window = window or (since_d > 3.0 and since_d < FOE_GUARD_CD and eh.hp / eh.max_hp < 0.85)
			if window and (lane == null or eh.position.distance_to(lane.base_of(eh.team)) > 900.0):
				return "kill window"  # low, or D down — and no well to hide in
	return ""


## Worth lurking your capsule `c` (above the line) for the deny? Only once
## you've chipped it and you're there working on it, and only while red's
## healthy — standing by it mid-fight would look stupid, not patient.
func _lurk_worth(c: Node2D, eh: Node2D) -> bool:
	if eh == null or hp / max_hp < 0.55 or _wary:
		return false
	if c.hp > c.max_hp * 0.95 or eh.position.distance_to(c.position) > 350.0:
		return false
	return _roll("capsule_lurk", smartness * float(_rule("deny_lurk", 0.6)))


## POWER-UPS while you're dead: your capsules lose their protection until you
## respawn, and its map shows them (it knows of no others: alive, you're only
## seen within CAPSULE_SEEK). Once per death it weighs breaking them against
## pressing your tower — what they hold (HUNT_VALUE, × its mind's capsule_hunt)
## against the push (more with its wave already at your tower) — counting only
## ones it can reach and break with HUNT_SPARE s to spare; a dull bot may not
## think of it. Logged as red_capsule_choice; then it sticks with the choice.
const HUNT_VALUE := {"bullet": 2.5, "twin": 1.2, "rampage": 1.0, "pierce": 1.0, "shield": 0.9}
const HUNT_PUSH := 1.0           # what pressing your tower is worth against that
const HUNT_PUSH_AT_TOWER := 2.0  # … with its wave already at your tower
const HUNT_SPARE := 1.0          # seconds to spare before you're back
var _hunt_decided := false
var _hunting := false


func _hunt_tick() -> bool:
	if not is_instance_valid(enemy_hero) or enemy_hero.is_targetable():
		_hunting = false
		return false
	var left: float = float(enemy_hero.respawn_in)
	var dps: float = maxf(attack_damage() / maxf(attack_interval(), 0.1), 1.0)
	var yours := 0
	var reach: Array = []
	var value := 0.0
	for c: Node2D in get_tree().get_nodes_in_group("capsules"):
		if c.owner_team == team or not c.is_targetable():
			continue
		yours += 1
		if not c.breakable_by(team) or not _safe(c.position):
			continue
		var walk: float = maxf(0.0, position.distance_to(c.position) - attack_range())
		if walk / maxf(speed, 1.0) + c.hp / dps + HUNT_SPARE > left:
			continue  # can't get it before you're back
		reach.append(c)
		value += float(HUNT_VALUE.get(c.power, 1.0))
	if not _hunt_decided:
		_hunt_decided = true
		_hunting = false
		if yours == 0:
			return false
		var push := HUNT_PUSH
		var et := _enemy_tower()
		if et:
			for o: Node2D in get_tree().get_nodes_in_group("creeps"):
				if o.team == team and o.is_targetable() and o.position.distance_to(et.position) <= et.RANGE + 200.0:
					push = HUNT_PUSH_AT_TOWER
					break
		var hunt: float = value * float(_pv("capsule_hunt", 1.0))
		_hunting = not reach.is_empty() and hunt >= push and _roll("notice_hunt", lerpf(0.5, 1.0, smartness))
		PlayLog.event("red_capsule_choice", {"choice": "hunt" if _hunting else "push", "capsules": yours,
			"reachable": reach.size(), "value": snappedf(hunt, 0.01), "push": push, "respawn": snappedf(left, 0.1)})
	if not _hunting or reach.is_empty():
		return false
	var best: Node2D = _closest_to(position, reach)
	why = "capsule:hunt"
	if attack_target != best:
		order_attack(best.position)
	return true


## Your Bullet (bullet_minion.gd) is coming for it: turn and shoot it down
## before it lands (it walks a little slower than any hero, so there's time).
const BULLET_NOTICE := 700.0


func _bullet_tick() -> bool:
	var best: Node2D = null
	for b: Node2D in get_tree().get_nodes_in_group("bullets"):
		if b.team != team and b.is_targetable() and position.distance_to(b.position) <= BULLET_NOTICE 				and (best == null or position.distance_to(b.position) < position.distance_to(best.position)):
			best = b
	if best == null:
		return false
	# Too close to clear in time: D just before contact eats the 2 s stun (the
	# damage lands anyway; the shield soaks a little). Immunity is only 0.5 s,
	# so it's a near-contact press — and a dull red fumbles the timing (roll).
	var gap := maxf(0.0, position.distance_to(best.position) - radius - best.radius)
	if gap / best.SPEED <= 0.45 and best.hp / maxf(attack_damage() / attack_interval(), 1.0) > gap / best.SPEED \
			and guard_cd <= 0.0 and _roll("shell_block", 0.25 + 0.75 * smartness):
		if guard():
			PlayLog.event("red_shell_block", {"gap": roundi(gap)})
	why = "bullet"
	_attack_move = null
	attack_target = best
	return true


## Would you catch the trip? You within your reach (+ TOTEM_CLEAR) of it or of
## its totem: it'd leash a creep, take two steps, see your burst and drop it
## (R7 BECKY: 6 of 12 trips undone within a second) — so it waits instead.
func _totem_contested(eh: Node2D, mine: Node2D) -> bool:
	if eh == null:
		return false
	var reach := _threat_reach(eh) + TOTEM_CLEAR
	return position.distance_to(eh.position) <= reach or mine.position.distance_to(eh.position) <= reach


## Pusher: leash the nearest free creep of its own while it has the points.
func _leash_nearby() -> void:
	var best: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable() and c.leader == null and position.distance_to(c.position) < 350.0 \
				and leash_used() + c.leash_cost() <= leash_capacity():
			if best == null or position.distance_to(c.position) < position.distance_to(best.position):
				best = c
	if best:
		toggle_leash(best)


# ------------------------------------------------------------------ wave clear

## Your creeps pressing its tower: 0 = no, 1 = clear it, 2 = at the tower (spend freely).
func _wave_threat() -> int:
	var own_tower: Node2D = lane.tower(team) if lane else null
	if own_tower == null:
		return 0
	var theirs := 0
	var mine := 0
	var at_tower := false
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if not c.is_targetable() or c.position.distance_to(own_tower.position) > CLEAR_NEAR:
			continue
		if c.team == team:
			mine += 1
		else:
			theirs += 1
			if c.position.distance_to(own_tower.position) <= own_tower.RANGE + 100.0:
				at_tower = true
	if at_tower and theirs > 0:
		return 2
	return 1 if theirs >= CLEAR_MIN and theirs >= mine + CLEAR_EDGE else 0


## Clear your wave off its side: one ability (its hero's clear tools, best
## aim) when it can, and attacks on the weakest creep. True if it acted.
func _clear_wave(eh: Node2D) -> bool:
	var threat := _wave_threat()
	if threat == 0:
		return false
	if eh and _wary and position.distance_to(eh.position) <= _threat_reach(eh):
		_clear_casts(2 if threat == 2 else 3, threat < 2)  # spells from where it stands, though: no walking in (BECKY held at full mana, casting nothing, while your wave hit her tower)
		return false  # outmatched with you right there: no walking in to attack
	_clear_casts(2 if threat == 2 else 3, threat < 2)
	var c := _clear_creep()
	if c == null:
		return false
	if attack_target != c:
		order_attack(c.position)
	return true


## One clear ability (its hero's clear tools, best aim) hitting `need`+ of
## your creeps, if one's ready — keeping some mana back when `keep_mana`.
func _clear_casts(need: int, keep_mana: bool) -> void:
	if _cast_gap > 0.0:
		return
	var slots: Array = CLEAR_SLOTS[hero_index] if hero_index < CLEAR_SLOTS.size() else ["Q", "W"]
	for slot: String in slots:
		var a: Dictionary = abilities[slot]
		if not is_ready(slot) or not can_afford(slot):
			continue
		if a["kind"] == "dash" and (spin_left > 0.0 or not a.get("expose", 0.0) > 0.0):
			continue  # only an exposing charge clears, and never cutting its own GRIND short
		if a["kind"] == "dash" and not _dash_free_for_creeps():
			continue  # SHOVE is how it starts fights: only on creeps when the wave's at its tower and you're nowhere near
		if keep_mana and mana - ability_cost(slot) < max_mana * CLEAR_MANA_KEEP:
			continue  # keeps some mana for you
		if mana - ability_cost(slot) < _getaway_cost(slot):
			continue  # you're about: never spends its BOOP / dash mana on creeps (KYLE pushed itself to 2 mana with KAREN in its face, no BOOP to peel)
		var at: Variant = _clear_point(a, need)
		if at != null:
			cast(slot, at)
			_cast_gap = difficulty.get("cast_gap", CAST_GAP)
			return


## Mana kept for its getaway (a BOOP / dash / blink not being cast now) while
## your hero is alive within 1200 px; 0 otherwise.
func _getaway_cost(casting: String) -> float:
	var foe := _enemy_hero_alive()
	if foe == null or position.distance_to(foe.position) > 1200.0:
		return 0.0
	var keep := 0.0
	for s: String in SLOT_ORDER:
		if s != casting and str(abilities[s]["kind"]) in ["boop", "dash", "blink"]:
			keep = maxf(keep, ability_cost(s))
	return keep


# ------------------------------------------------------------------ commit mode

## This hero's combo against `eh` (the running order if you're moving away), or [].
func _combo_seq(eh: Node2D) -> Array:
	if hero_index >= ComboBook.BOOK.size():
		return []
	var page: Dictionary = ComboBook.BOOK[hero_index]
	if page.has("ult") and is_ready("R") and can_afford("R") and Run.round_num >= ULT_FROM:
		return page["ult"]  # its ult combo (KAREN: RAGE → SHOVE → GRIND → BRACE)
	var away: bool = eh.velocity.length() > 100.0 and eh.velocity.dot(eh.position - position) > 0.0
	return page["flee"] if away else page["still"]


## Rough damage of `slot` against a hero right now (its level, cards, round).
func _slot_damage(slot: String) -> float:
	var a: Dictionary = abilities[slot]
	var d: float = float(a.get("damage", 0.0))
	match a["kind"]:
		"skillshot":
			d *= maxf(1.0, float(a.get("count", 1)) * 0.7)  # most of a fan lands up close
		"self":
			d *= float(a.get("pulses", 1)) * 0.85
		"ground":
			if a.has("count"):
				d *= float(a["count"]) * 0.35  # a share of a meteor shower lands
			d += float(a.get("burn_dps", 0.0)) * float(a.get("burn_time", 0.0))
		"rage":
			d = d * 4.0 + float(a.get("burn_dps", 0.0)) * 2.0  # a few seconds of contact
		"shield", "blink":
			d = 0.0
	return d * ability_scale(slot)


## What the combo would do to `eh` with what's ready (plus a few attacks).
func _combo_damage(seq: Array) -> float:
	var total := attack_damage() * 3.0
	var cost := 0.0
	for slot: String in seq:
		if is_ready(slot):
			cost += ability_cost(slot)
			if cost <= mana:
				total += _slot_damage(slot)
	return total


## Is a burst worth it right now?
func _should_commit(eh: Node2D) -> bool:
	var seq := _combo_seq(eh)
	_commit_no = ""
	if seq.is_empty():
		_commit_no = "no combo ready"
	elif hp / max_hp < COMMIT_MIN_HEALTH:
		_commit_no = "own health low"
	elif not _safe(eh.position):
		_commit_no = "you're under your tower"
	elif eh.in_well:
		_commit_no = "you're in your well"
	elif _clock < _commit_block_until:
		_commit_no = "blocked after a dropped combo"
	if _commit_no != "":
		return false
	var page: Dictionary = ComboBook.BOOK[hero_index]
	if position.distance_to(eh.position) > float(page["open"]) + 40.0:
		_commit_no = "out of range"
		return false
	var opener: String = seq[0]
	if not is_ready(opener) or not can_afford(opener):
		_commit_no = "opener %s not ready" % opener if not is_ready(opener) else "no mana for opener %s" % opener
		return false  # the combo starts with this: wait for it
	var dmg := _combo_damage(seq)
	var ehp: float = (eh.hp + eh.shield_hp) / (1.0 + float(eh.get("_expose")))
	if is_instance_valid(eh.get("twin")):  # your TWIN soaks 35% of each hit: a kill costs more than your bar shows
		ehp += minf(eh.twin.hp, eh.hp * 0.54)
	if _rule("wait_escape", false) and _escape_ready(eh) and eh.hp / eh.max_hp > float(_rule("hunt_at", 0.0)) and _recent_loss() < IMPATIENT_LOSS:
		_commit_no = "waiting for your escape to be spent"
		return false  # the diver: patient until you've used it
	if _threatened(eh):  # the anchor: you came into its zone while it holds the wave
		_commit_no = "threatened, passed (roll)"
		return _roll("commit_threat", 0.5 + 0.5 * smartness)
	if abilities[opener]["kind"] == "boop":  # BOOP only pulls: worth it with something to hit you with after
		if _in_danger(eh) or _low_and_losing(eh, hp / max_hp):  # about to back off: pulling you closer first is the worst of both
			_commit_no = "keeping BOOP: about to back off"
			return false
		var payoff := false
		var b: Dictionary = abilities[opener]
		var after: float = position.distance_to(eh.position) - (float(b["radius"]) * 0.45 + float(b.get("push", 120.0)))  # about where the pull leaves you
		for s: String in seq:
			if s != opener and is_ready(s) and can_afford(s) and float(abilities[s].get("damage", 0.0)) > 0.0 \
					and _reach_of(abilities[s]) >= after:
				payoff = true  # (PUNISH counted before though it only reaches ~120 px: pulls with nothing after)
		if not payoff:
			_commit_no = "nothing ready to follow BOOP"
			return false
		if hp / max_hp < BOOP_KEEP and dmg < ehp * 0.95:
			_commit_no = "keeping BOOP to get away (own health low)"
			return false
	if dmg >= ehp * 0.95:
		_commit_no = "kill on the table, missed it (roll)"
		return _roll("commit_kill", KILL_SEEN_FLOOR + (1.0 - KILL_SEEN_FLOOR) * smartness)  # a sharp bot always sees it; a dull one often doesn't
	var keen: float = float(_p.get("commit", COMMIT_DEFAULT)) * smartness
	if _open_target(eh) and dmg >= ehp * COMMIT_BITE:
		_commit_no = "you were open, passed (roll)"
		return _roll("commit_open", keen)
	if hp / max_hp >= eh.hp / eh.max_hp + 0.15 and dmg >= ehp * 0.5:
		_commit_no = "ahead on health, passed (roll)"
		return _roll("commit_trade", keen * 0.6)
	_commit_no = "combo %d of your %d not worth it" % [roundi(dmg), roundi(ehp)]
	return false


## You're open: your escape is down, you're out of mana, or you've just spent your abilities.
func _open_target(eh: Node2D) -> bool:
	var spent := 0
	var cheapest := INF
	for slot: String in SLOT_ORDER:
		var a: Dictionary = eh.abilities[slot]
		if (a["kind"] == "dash" or a["kind"] == "blink" or a["kind"] == "boop") and not eh.is_ready(slot):
			return true
		if not eh.is_ready(slot):
			spent += 1
		cheapest = minf(cheapest, eh.ability_cost(slot))
	return spent >= 3 or eh.mana < cheapest


func _start_combo(eh: Node2D) -> void:
	var seq: Array = _combo_seq(eh).duplicate()
	if seq.size() > 2 and randf() < (1.0 - smartness) * 0.35:  # a dumber bot gets the order a bit wrong
		var k := randi_range(1, seq.size() - 2)
		var a: Dictionary = abilities[seq[k]]
		var b: Dictionary = abilities[seq[k + 1]]
		# a harmless swap only: never the opener, never a dash, never the ultimate moved earlier
		if a["kind"] != "dash" and b["kind"] != "dash" and seq[k + 1] != "R":
			var tmp: String = seq[k]
			seq[k] = seq[k + 1]
			seq[k + 1] = tmp
	var react := _jitter(float(difficulty.get("reaction", REACTION)))  # it sees the opening a moment late
	_combo = {"seq": seq, "i": 0, "next": _clock + react, "target": eh, "waited": 0.0, "cast": []}
	PlayLog.event("red_combo", {"seq": seq, "you_hp": snappedf(eh.hp / eh.max_hp, 0.01), "you_dist": roundi(position.distance_to(eh.position)), "react": snappedf(react, 0.01)})
	_stutter_target = null
	_stepping = false


## Every frame of a combo: cast the next step when it's in reach (closing in
## if not), a short gap between steps; abort if you get away or it's stunned.
func _combo_tick() -> void:
	if _combo.is_empty():
		return
	var eh: Node2D = _combo["target"]
	var page: Dictionary = ComboBook.BOOK[hero_index]
	if not is_instance_valid(eh) or not eh.is_targetable() or eh.in_well or _retreating or not is_targetable() or eh.hidden_by_decoy() \
			or position.distance_to(eh.position) > float(page["open"]) + 350.0:
		_end_combo("lost you" if not _retreating else "retreat")
		return
	var et := _enemy_tower()
	if not _safe(eh.position) or (et and et.target == self):
		_end_combo("your tower")  # you ran under your tower (or it's shooting the bot): not worth a dive
		_commit_block_until = _clock + COMMIT_BLOCK
		return
	for slot: String in recast.keys():  # SHOCK's orb out: set it off on you
		if has_recast(slot) and recast[slot].position.distance_to(eh.position) <= float(abilities[slot]["radius"]) * 0.9:
			cast(slot, recast[slot].position)
	if _drag_tick(eh):
		return  # hauling you back into its TRAP: the rest of the combo waits for the spikes
	if attack_target != eh and not _dashing:
		order_attack(eh.position)  # attacks between casts, closing in as needed
	if _clock < float(_combo["next"]) or _dashing or _plant_left > 0.0 or is_stunned():
		return
	var seq: Array = _combo["seq"]
	var i: int = _combo["i"]
	if i >= seq.size():
		_end_combo("done")
		return
	var slot: String = seq[i]
	if _burn_wait(slot, eh):
		return  # its fire hasn't caught yet: SHOCK is worth half again on a burning target
	var gap := _jitter(0.2 + 0.35 * float(difficulty.get("reaction", REACTION)))  # sharper bots chain faster
	if randf() < 0.25:
		gap += _jitter(float(difficulty.get("hesitate", 0.0))) * 0.5  # now and then it hesitates mid-combo
	if not is_ready(slot) or not can_afford(slot) or randf() < (1.0 - smartness) * 0.3:
		_combo["i"] = i + 1  # not available (or a fumble): on to the next
		_combo["next"] = _clock + gap * 0.5
		return
	var at: Variant = _combo_aim(abilities[slot], eh)
	if at == null:  # not in reach yet: keep closing for a moment, then skip it
		_combo["waited"] = float(_combo["waited"]) + get_process_delta_time()
		if float(_combo["waited"]) > COMBO_STEP_WAIT:
			_combo["i"] = i + 1
			_combo["waited"] = 0.0
		return
	cast(slot, at)
	(_combo["cast"] as Array).append(slot)  # what it really got off (steps not ready are skipped silently)
	_combo["i"] = i + 1
	_combo["waited"] = 0.0
	_combo["next"] = _clock + gap


## A step that pays extra against a burning target (SHOCK's douse) waits a
## beat for the fire it just laid to catch — the combo used to cast IGNITE and
## SHOCK a tenth of a second apart and collect none of the bonus. Bounded by
## BURN_WAIT_MAX, so a fire that never lands can't stall the combo.
func _burn_wait(slot: String, eh: Node2D) -> bool:
	if float(abilities[slot].get("douse", 0.0)) <= 0.0 or eh.is_burning_from(self):
		return false
	if _fire.is_empty() or _clock >= float(_fire["until"]):
		return false  # no fire of its own in play: nothing to wait for
	var waited: float = float(_combo.get("burned", 0.0)) + get_process_delta_time()
	_combo["burned"] = waited
	return waited < BURN_WAIT_MAX


## The diver's drag (drag_to_trap): its TRAP is on the ground and POUNCE has
## you tethered — it walks back into its own spikes, and the tether hauls you
## in with it. The rest of the combo waits, so STARS lands once the bleed is
## on you. Brief by construction: the tether is short, and the trap's own slow
## keeps you in the circle after it lets go.
func _drag_tick(eh: Node2D) -> bool:
	if not _rule("drag_to_trap", false) or _fire.is_empty() or _clock >= float(_fire["until"]):
		return false
	if not (is_tethered() and tether_owner and tether_to == eh):
		return false
	var trap: Vector2 = _fire["at"]
	if eh.position.distance_to(trap) <= float(_fire["r"]):
		return false  # you're standing in it: get on with the combo
	why = "combo:drag"
	order_move(trap)
	_combo["next"] = maxf(float(_combo["next"]), _clock + DRAG_STEP_WAIT)
	return true


## Where to cast combo step `a` at `eh`, or null if it isn't in reach yet.
func _combo_aim(a: Dictionary, eh: Node2D) -> Variant:
	var d := position.distance_to(eh.position)
	match a["kind"]:
		"dash":
			if d > float(a["range"]) + eh.radius:
				return null
			var miss := Vector2.from_angle(randf() * TAU) * randf() * float(difficulty.get("aim_error", AIM_ERROR)) * 0.5
			if a.get("tether", 0.0) > 0.0:
				return eh.position + eh.velocity * 0.15 + miss  # POUNCE: onto you (where you're going)
			var seq: Array = _combo.get("seq", [])
			var nxt: int = int(_combo.get("i", 0)) + 1
			if nxt < seq.size() and str(abilities[seq[nxt]]["kind"]) == "spin":
				return eh.position + eh.velocity * 0.15 + miss  # SHOVE into GRIND: end the charge on you, so the spin catches you (aimed 90 px through, the knock-aside left you out of reach: GRIND hit 3 of 14)
			return eh.position + (eh.position - position).normalized() * 90.0 + miss  # through you (SHOVE)
		"boop":  # from behind you: you're knocked toward it (into IGNITE / PUNISH next)
			return _boop_behind(a, eh)
		"rage":  # the ult combo opens with it: swell up within SHOVE's reach, then charge
			var page: Dictionary = ComboBook.BOOK[hero_index]
			return position if d <= float(page["open"]) + eh.radius + 20.0 else null
		"spin":
			return position if d <= radius * 2.6 + eh.radius + 40.0 else null
		"shield":
			return position
	var h: Variant = _hero_cast(a, eh)
	return _with_creeps(a, h) if h != null else null


func _end_combo(reason := "") -> void:
	if reason == "done" and smartness < 1.0:
		_commit_block_until = _clock + COMBO_BREATH * (1.0 - smartness)  # it landed one: a dull bot savours it instead of chaining
	if not _combo.is_empty():
		var eh: Variant = _combo.get("target")
		PlayLog.event("red_combo_end", {"reason": reason, "step": int(_combo.get("i", 0)), "of": (_combo.get("seq", []) as Array).size(),
			"cast": _combo.get("cast", []),  # "done" only means it ran out of steps: this is what actually fired
			"you_hp": snappedf(eh.hp / eh.max_hp, 0.01) if eh != null and is_instance_valid(eh) else -1})
	_combo = {}
	_cast_gap = difficulty.get("cast_gap", CAST_GAP)  # back to the normal pace


## Its tower is being hurt: all in on what's doing it. True if it acted.
func _defend(eh: Node2D) -> bool:
	if _defend_left <= 0.0:
		return false
	var t: Node2D = lane.tower(team) if lane else null
	if t == null or not t.is_targetable():
		return false
	var shy := _clock < _shy_until
	var key := _shield_key(t)  # you walked a creep in to open the shield: kill it and the shield's back
	# You're dead: the one window it can't be punished in, and chipping creeps
	# off its own tower is the least valuable thing to spend it on (run of
	# 2026-10-22 R13: CHAD killed the player twice and spent the second window
	# defending — the player's tower took nothing either time). It still answers
	# a real emergency: the shield walked open, or the tower is genuinely low.
	if is_instance_valid(enemy_hero) and not enemy_hero.is_targetable() \
			and key == null and t.hp > t.max_hp * DEFEND_PANIC:
		return false
	if key != null and _roll("kill_key", 0.4 + 0.6 * smartness) and not (shy and _too_close_to_foe(key.position)):
		why = "defend:key"
		_clear_casts(1, false)
		if attack_target != key:
			order_attack(key.position)
		return true
	if eh and not shy and eh.position.distance_to(t.position) <= t.RANGE + DEFEND_NEAR:  # you, at its tower: everything at you
		if _cast_gap <= 0.0:
			for slot: String in SLOT_ORDER:
				if not is_ready(slot) or not can_afford(slot) or (slot == "R" and Run.round_num < ULT_FROM):
					continue
				var at: Variant = _hero_cast(abilities[slot], eh)
				if at != null:
					cast(slot, _with_creeps(abilities[slot], at))
					_cast_gap = difficulty.get("cast_gap", CAST_GAP)
					break
		if attack_target != eh:
			order_attack(eh.position)
		return true
	var best: Node2D = null  # the creeps on it: clear with everything
	var cur: Variant = attack_target
	if is_instance_valid(cur) and cur.is_in_group("creeps") and cur.team != team and cur.is_targetable() 			and cur.position.distance_to(t.position) <= t.RANGE + 100.0:
		best = cur  # keeps on the creep it's hitting (re-picking zig-zagged between them)
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if best == cur and best != null:
			break
		if c.team != team and c.is_targetable() and c.position.distance_to(t.position) <= t.RANGE + 100.0:
			if shy and _too_close_to_foe(c.position):
				continue  # it just fled your burst: defends from outside your reach
			if best == null or c.hp < best.hp:
				best = c
	if best == null:
		return false  # (a siege minion: nothing to do about it)
	_clear_casts(1, false)
	if attack_target != best:
		order_attack(best.position)
	return true


## Ahead right now — you're dead for a while, or low and far — and it's healthy?
## Once it starts pressing a low (alive) you it keeps at it PRESS_HOLD s rather
## than flipping at the distance line, and never while wary of you.
const PRESS_HOLD := 3.0
var _press_until := 0.0
func _pressing() -> bool:
	if not is_instance_valid(enemy_hero) or hp / max_hp < PRESS_HEALTHY or not _roll("notice_press", smartness):
		return false
	if not enemy_hero.is_targetable():
		return enemy_hero.respawn_in > PRESS_DEAD
	if _wary or enemy_hero.hp / enemy_hero.max_hp >= PRESS_LOW:
		_press_until = 0.0
		return false
	if _clock < _press_until:
		return true  # committed to it a moment ago: keep going
	if position.distance_to(enemy_hero.position) > 900.0:
		_press_until = _clock + PRESS_HOLD
		return true
	return false


## Press: clear your wave with everything, hit your tower once its creeps
## are tanking, else the nearest of your creeps, else walk up with its wave.
func _press() -> bool:
	_clear_casts(2, false)
	var et := _enemy_tower()
	if et and not et.shielded_from(team) and _safe(et.position):
		if attack_target != et:
			order_attack(et.position)
		return true
	var c := _clear_creep()
	if c:
		if attack_target != c:
			order_attack(c.position)
		return true
	var fwd := _forward()  # nothing in reach: up behind its own front creep
	var front := -INF
	for o: Node2D in get_tree().get_nodes_in_group("creeps"):
		if o.team == team and o.is_targetable():
			front = maxf(front, o.position.x * fwd)
	if front == -INF:
		return false  # no wave to walk in with
	var spot := Vector2((front - 40.0) * fwd, _lane_y)
	if not _safe(spot):
		return false
	_go(spot)
	return true


## Where `a` hits at least `need` of your creeps (the most it can), or null.
## A shield ability: on its own wave when it's fighting yours.
func _clear_point(a: Dictionary, need: int) -> Variant:
	var foes: Array = get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
		return c.team != team and c.is_targetable() and position.distance_to(c.position) <= 1000.0)
	match a["kind"]:
		"ground", "orb":
			var lo: float = float(a.get("min_range", 0.0))
			var hi: float = float(a["range"]) if float(a["range"]) > 0.0 else 0.0
			var r: float = float(a["radius"])
			var best: Variant = null
			var best_n := need - 1
			for c: Node2D in foes:
				var d := position.distance_to(c.position)
				if (hi > 0.0 and (d > hi or d < lo)) or (hi <= 0.0 and d > r):
					continue
				var n := 0
				for o: Node2D in foes:
					if o.position.distance_to(c.position) <= r * 0.9:
						n += 1
				if n > best_n:
					best_n = n
					best = c.position if hi > 0.0 else position
			return best
		"beam", "skillshot":
			var length: float = float(a["range"])
			var half: float = float(a.get("width", 60.0)) / 2.0 if a["kind"] == "beam" else 30.0
			if a["kind"] == "skillshot" and not a.get("pierce_creeps", false):
				return null  # stops at the first creep: not a clear
			var best: Variant = null
			var best_n := need - 1
			for c: Node2D in foes:
				if position.distance_to(c.position) > length:
					continue
				var dir := (c.position - position).normalized()
				var end := position + dir * length
				var n := 0
				for o: Node2D in foes:
					var q := Geometry2D.get_closest_point_to_segment(o.position, position, end)
					if o.position.distance_to(q) <= half + o.radius:
						n += 1
				if n > best_n:
					best_n = n
					best = c.position
			return best
		"dash":  # SHOVE: charge along the line through the most creeps (they're exposed for GRIND)
			var length: float = float(a["range"])
			var best: Variant = null
			var best_n := need - 1
			for c: Node2D in foes:
				if position.distance_to(c.position) > length + 100.0:
					continue
				var end := position + (c.position - position).normalized() * length
				if not _safe(end):
					continue
				var n := 0
				for o: Node2D in foes:
					var q := Geometry2D.get_closest_point_to_segment(o.position, position, end)
					if o.position.distance_to(q) <= radius + o.radius:
						n += 1
				if n > best_n:
					best_n = n
					best = end
			return best
		"spin", "self":
			var reach: float = radius * corner_factor(def.get("shape", "")) * float(a.get("grow_end", 2.0)) if a["kind"] == "spin" else float(a["radius"]) * 0.8
			if a["kind"] == "spin" and _rule("grind_for_kills", false) and not _grind_worth(a, reach):
				return null  # the anchor gnaws for kills, not to soften creeps for its own
			var n := foes.filter(func(c: Node2D) -> bool: return position.distance_to(c.position) <= reach + c.radius).size()
			return position if n >= mini(need, 2) else null
		"shield":  # BRACE: its own creeps in the fight
			var mine := get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
				return c.team == team and c.is_targetable() and position.distance_to(c.position) <= float(a["radius"])).size()
			var close := foes.filter(func(c: Node2D) -> bool: return position.distance_to(c.position) <= float(a["radius"]) + 300.0).size()
			return position if mine >= 3 and close >= 3 else null
	return null


## Which of your creeps to hit while clearing: one it can finish, else the
## weakest within reach of a short walk — only where it's safe to stand.
func _clear_creep() -> Node2D:
	var cur: Variant = attack_target  # sticks with the creep it's on unless there's a last hit to take
	var keep_cur: bool = is_instance_valid(cur) and cur.is_in_group("creeps") and cur.team != team and cur.is_targetable() 		and _safe(cur.position) and not (_wary and _too_close_to_foe(cur.position))
	var best: Node2D = cur if keep_cur else null
	var best_k := INF if not keep_cur else 0.0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team or not c.is_targetable() or not _safe(c.position) or position.distance_to(c.position) > FARM_RANGE:
			continue
		if _wary and _too_close_to_foe(c.position):
			continue  # outmatched (or shy): not inside your reach
		var k: float = c.hp - (10000.0 if c.hp <= attack_damage() else 0.0)  # a last hit first, then the weakest
		if k < best_k:
			best_k = k
			best = c
	return best


# ------------------------------------------------------------------ free hits

## Idle at its spot with its attack ready and something in range: shoot it
## (one shot; the next decision takes over again).
func _free_hit() -> void:
	if not _idle or _retreating or _attack_cd > 0.0 or spin_left > 0.0 or _plant_left > 0.0 			or _dashing or is_stunned() or not _safe(position):
		return
	if _target != null and position.distance_to(_target) > 30.0:
		return  # still walking to its spot: don't stop for it
	if attack_target != null and is_instance_valid(attack_target) and attack_target.is_targetable():
		return  # already on something
	var t := _free_target()
	if t:
		_attack_move = null
		attack_target = t
		_idle = false  # one shot, then the next decision


## What to hit right now from where it stands: your hero, a creep it can
## finish, the weakest creep, then a tower it's allowed to hit — or null.
func _free_target() -> Node2D:
	var reach := attack_range()
	var eh := _enemy_hero_alive()
	if eh and position.distance_to(eh.position) <= reach + eh.radius:
		return eh
	var finish: Node2D = null
	var weakest: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team or not c.is_targetable() or position.distance_to(c.position) > reach + c.radius:
			continue
		if c.hp <= attack_damage() and (finish == null or c.hp < finish.hp):
			finish = c
		if weakest == null or c.hp < weakest.hp:
			weakest = c
	if finish:
		return finish
	if weakest:
		return weakest
	var et := _enemy_tower()
	if et and not et.shielded_from(team) and position.distance_to(et.position) <= reach + et.radius:
		return et
	return null


# ------------------------------------------------------------------ lane spot

## Where it stands ACROSS the lane. This used to be one random number rolled
## at the start of the round and held for the whole of it - +-90 px of a +-650
## lane, picked before it knew anything - which is why red's movement measures
## as ~10% y while a player's is ~30% (IDEAS.md "Red plays on one axis").
## Now it is a decision, re-taken every LANE_Y_EVERY s: stand on the line its
## own wave is fighting on, and when it wants out of your reach, on the far
## side of that line from you - how far is its `sidestep` rule, so the anchor
## barely leaves the middle and the artillery slides right out to the band.
## Smartness is how much of each decision it acts on, so a dull red still
## mostly stands where it first stood: this is a how-WELL dial, not a how-hard
## one (the per-mind lean is the how-hard half).
func _lane_y_tick() -> void:
	if _clock < _lane_y_at:
		return
	var foe := _enemy_hero_alive()
	var watched: bool = foe != null and position.distance_to(foe.position) <= _threat_reach(foe) + WATCHED_PAD
	_lane_y_at = _clock + (LANE_Y_WATCHED if watched else LANE_Y_EVERY)
	var wave := _wave_y()
	if wave == INF:
		return  # no wave near it: nothing to line up on, stay where it is
	var want := wave
	if foe != null and (_wary or _retreating or float(_rule("keep_out", 0.0)) > 0.0):
		var gap := want - foe.position.y
		var side: float = signf(gap) if absf(gap) > 1.0 else signf(_lane_y) if _lane_y != 0.0 else 1.0
		want += side * LANE_Y_BAND * float(_rule("sidestep", SIDESTEP))
	if watched:
		# Standing dead still inside a hero's reach is a free skillshot, and it
		# is the most mechanical thing red does - a player in that spot never
		# stops moving. It already stutter-steps while TRADING (_stutter_tick);
		# this is the same idea while it farms and holds. Sides alternate and
		# the distance is rolled, because a fixed wobble is just as readable as
		# standing still. Scaled by `sidestep`, so the anchor barely shifts.
		_lane_y_flip = -_lane_y_flip
		want += _lane_y_flip * randf_range(JUKE_MIN, JUKE_MAX) * float(_rule("sidestep", SIDESTEP))
	want = clampf(want, -LANE_Y_CAP, LANE_Y_CAP)
	if absf(want - _lane_y) < LANE_Y_DEAD:
		return  # close enough: standing still beats shuffling
	# a bounded slide, not a jump: `wary` can flip on and off between re-picks,
	# and a hero that teleported between two lines every 1.5 s would look like
	# a bug rather than like someone repositioning
	_lane_y += clampf(want - _lane_y, -LANE_Y_STEP, LANE_Y_STEP) * smartness


## The line its own wave is fighting on: the mean y of its creeps near it, or
## INF when there are none (between waves, or it walked off alone).
func _wave_y() -> float:
	var sum := 0.0
	var n := 0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable() and position.distance_to(c.position) <= WAVE_Y_NEAR:
			sum += c.position.y
			n += 1
	return sum / float(n) if n > 0 else INF


# ------------------------------------------------------------------ stutter-stepping

## Every frame while trading with stutter-stepping: shoot when ready; after a
## shot, step to a step point; just before the next one (lead time), turn back.
func _stutter_tick() -> void:
	var t := _stutter_target
	if t == null or not is_instance_valid(t) or not t.is_targetable() or _retreating or t.hidden_by_decoy():
		_stepping = false
		return
	var lead := 0.08 + 0.3 * float(difficulty.get("reaction", REACTION))  # sharper bots turn back later
	if _attack_cd > lead:
		if not _stepping and _attack_cd > STEP_FROM_CD:
			var p: Variant = _step_point(t)
			if p != null and position.distance_to(p) > STEP_MIN:
				order_move(p)
				_stepping = true
	elif _stepping:  # reloaded (nearly): back on you
		_stepping = false
		_steering = false
		_attack_move = null
		attack_target = t


## Where to stand between attacks on `t`, or null to stay put. Chasing: where
## you're heading. Otherwise it weighs spots on a ring round you at its ideal
## distance (the edge of its range; when it out-ranges you, outside yours too)
## within 90° either side of where it stands, plus staying put, and picks the
## best one it can reach before it reloads: clear of enemy creeps (no aggro),
## near its own, away from your tower, a little toward home.
func _step_point(t: Node2D) -> Variant:
	var to: Vector2 = position - t.position
	if t.velocity.length() > 60.0 and t.velocity.dot(-to) > 0.0:  # chase: you're running — keep up
		var c: Vector2 = t.position + t.velocity * 0.35
		c = Bounds.clamp_point(c, radius) if Bounds.active else c
		return c if _safe(c) else null
	var lead := 0.08 + 0.3 * float(difficulty.get("reaction", REACTION))
	var budget: float = maxf(0.0, _attack_cd - lead) * speed * move_speed_mult()  # how far it can get before reloading
	if budget < STEP_MIN:
		return null
	var mine: float = attack_range() + radius + t.radius
	var theirs: float = float(t.attack_range()) + radius + t.radius
	var kite: bool = attack_range() > float(t.attack_range()) + 60.0
	var want: float = minf(mine - 25.0, theirs + 60.0) if kite else mine - 25.0
	var here := _spot_score(position, t, kite, theirs, mine)
	var best: Variant = null
	var best_s := here + 5.0  # a move has to be clearly better than staying
	var bearing := to.angle() if to.length() > 1.0 else (Vector2.LEFT * _forward()).angle()
	for i in range(-6, 7):  # every 15°, ±90° round from where it stands
		var p: Vector2 = t.position + Vector2.from_angle(bearing + i * PI / 12.0) * want
		p = position + (p - position).limit_length(budget)  # too far to make it: as far as it can get toward it
		if Bounds.active:
			p = Bounds.clamp_point(p, radius)
		if p.distance_to(position) < STEP_MIN or not _safe(p):
			continue
		var sc := _spot_score(p, t, kite, theirs, mine) - p.distance_to(position) * 0.01
		if sc > best_s:
			best_s = sc
			best = p
	return best


## How good a spot `p` is to shoot `t` from (higher = better).
func _spot_score(p: Vector2, t: Node2D, kite: bool, theirs: float, mine: float) -> float:
	var s := 0.0
	var d := p.distance_to(t.position)
	if d > mine:
		s -= 50.0 + (d - mine) * 0.5  # can't shoot from there
	if kite and d < theirs:
		s -= 10.0 + (theirs - d) * 0.2  # inside your reach when it doesn't have to be (the deeper, the worse)
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if not c.is_targetable() or c.position.distance_to(p) > 250.0:
			continue
		s += 3.0 if c.team == team else -8.0  # its creeps cover it; yours would turn on it
	var et := _enemy_tower()
	if et and p.distance_to(et.position) < et.RANGE + 150.0:
		s -= 20.0  # near your tower
	s -= p.x * _forward() * 0.01  # a little toward home
	return s


# ------------------------------------------------------------------ helpers

## +1 when its enemy is east (blue bot), -1 when west (red bot).
func _forward() -> float:
	return signf(Lane.base_of(1 - team).x - Lane.base_of(team).x)


func _enemy_tower() -> Node2D:
	var t: Node2D = lane.tower(1 - team) if lane else null
	return t if t and t.is_targetable() else null


func _enemy_hero_alive() -> Node2D:
	if not is_instance_valid(enemy_hero) or not enemy_hero.is_targetable() or enemy_hero.in_well:
		return null  # dead, or safe in its well: don't chase it in there
	if enemy_hero.hidden_by_decoy():
		return null  # Afterimage: it lost track of you
	return enemy_hero


## Is `p` safe from the enemy tower (out of range, or creeps are tanking it)?
## Where to back off to when it is your burst it is running from, not its
## health. The clear test above is purely a distance from you, so the right
## target is the nearest point outside your reach — which is usually a step
## sideways, not a walk home: backing off down the lane gives up farm it never
## had to give up, and reads as panic. A low-health retreat still goes home,
## because that one really is going home to heal.
## Candidates fan out from "straight away from you"; the cheapest legal one
## wins, with a pull toward home so ties break the safe way.
func _backoff_spot(foe: Node2D, home: Vector2) -> Vector2:
	var best := home + Vector2(0.0, _lane_y * 0.5)  # nothing legal: the old walk home
	var need: float = _threat_reach(foe) + CLEAR_MARGIN + BACKOFF_PAD
	need = maxf(need, position.distance_to(foe.position))  # never a target that walks it back towards you
	var away := position - foe.position
	if away.length_squared() < 1.0:
		away = Vector2(-_forward(), 0.0)  # standing on top of each other: straight back
	away = away.normalized()
	var pull: float = BACKOFF_HOME_PULL * 2.0 * (1.0 - float(_rule("sidestep", SIDESTEP)))
	var best_cost := INF
	for turn: int in BACKOFF_FAN:
		for side: int in ([0] if turn == 0 else [1, -1]):
			var spot: Vector2 = foe.position + away.rotated(deg_to_rad(float(turn * side))) * need
			if Bounds.active:
				spot = Bounds.clamp_point(spot, radius)
			if spot.distance_to(foe.position) < need - BACKOFF_PAD:
				continue  # the lane edge pushed it back inside your reach
			if not _safe(spot):
				continue  # under your tower is not an escape
			var cost: float = position.distance_to(spot) + absf(spot.x - home.x) * pull
			if cost < best_cost:
				best_cost = cost
				best = spot
	return best


func _safe(p: Vector2) -> bool:
	var et := _enemy_tower()
	if et == null or p.distance_to(et.position) > et.RANGE + radius + 40.0:
		return true
	if _clock < _tower_shy_until:
		return false  # it just got shot by that tower: stays out a moment, creeps or not
	return is_instance_valid(et.target) and et.target.is_in_group("creeps")


## Order a move unless already heading (roughly) there.
func _go(p: Vector2) -> void:
	if attack_target == null and _target != null and (_target as Vector2).distance_to(p) < 40.0:
		return
	order_move(p)


func _wants_trade(eh: Node2D) -> bool:
	var standing: bool = hp / max_hp >= float(_pv("retreat_at", RETREAT_AT)) + 0.1
	if _threatened(eh) and standing and position.distance_to(eh.position) <= _bully_reach():
		return true  # the anchor: you stepped up to its wave, close enough to punish — it turns on you
	if _rule("bully_when_behind", false) and standing and _defend_left > 0.0 \
			and position.distance_to(eh.position) <= _bully_reach():
		return true  # its tower is being hit: it fights now whether or not it wins the race
	var reach: float = maxf(attack_range() + eh.radius + TRADE_PAD, float(_pv("engage", ENGAGE)))
	if position.distance_to(eh.position) > reach or not _safe(eh.position) or not _may_chase(eh):
		return false
	match str(_pv("trade_when", "always")):
		"vulnerable":
			if not _vulnerable(eh):
				return false
		"provoked":  # only after it hit us (hero_aggro), or to finish a very weak hero
			if eh.hero_aggro <= 0.0 and eh.hp / eh.max_hp > 0.25:
				return false
	# Must be this far ahead on health — capped, so a healthy bot still fights
	# a healthy you (the margin makes a hurt bot back off sooner, not never).
	var need: float = eh.hp / eh.max_hp + float(_pv("trade_margin", STANDARD_MARGIN))
	if hp / max_hp < minf(need, float(_pv("trade_cap", TRADE_CAP))):
		return false
	# …and it has to win (enough of) the damage race: health % alone ignores
	# that your hero and build may simply out-damage it
	return _race(eh) >= float(_pv("race_need", STANDARD_RACE))


## How close you have to be for a bully (the anchor) to turn on you: what it
## can actually catch — its own reach, or its charge plus `bully_reach`. Beyond
## that it stays on the wave instead of marching at a hero who out-ranges it.
func _bully_reach() -> float:
	var r: float = attack_range() + radius + TRADE_PAD
	var pad: float = float(_rule("bully_reach", 0.0))
	for s: String in SLOT_ORDER:
		if str(abilities[s]["kind"]) == "dash":
			r = maxf(r, float(abilities[s].get("range", 0.0)) + pad)
	return r


## The damage race against `eh`: how long it takes to kill us ÷ how long we
## take to kill it, over a RACE_WINDOW-second fight (attacks + abilities
## ready now). > 1 = we win it.
func _race(eh: Node2D) -> float:
	var ours := _fight_dps(self)
	var theirs := _fight_dps(eh)
	var we_kill: float = _fight_hp(eh) / maxf(ours, 1.0)
	var they_kill: float = _fight_hp(self) / maxf(theirs, 1.0)
	return they_kill / maxf(we_kill, 0.01)


## Is the timed power-up `kind` running on `u` right now? (hero.gd gain_power.)
## TWIN and SHIELD aren't timed: a TWIN is a body in `twin`, and the SHIELD
## power lands in `shield_hp` like any other, so it already counts itself.
static func _power_up(u: Node2D, kind: String) -> bool:
	return str(u.get("power")) == kind and float(u.get("power_left")) > 0.0


## Health for the damage race: shields up now, a ready shield ability (BRACE),
## a ready / running RAGE's damage cut, RAMPAGE's, and what a TWIN will eat.
static func _fight_hp(u: Node2D) -> float:
	var h: float = u.hp + u.shield_hp
	var cut := 0.0
	for slot: String in SLOT_ORDER:
		var a: Dictionary = u.abilities[slot]
		if not u.is_ready(slot):
			continue
		if a["kind"] == "shield":
			h += float(a.get("shield", 0.0))
		elif a["kind"] == "rage":
			cut = maxf(cut, float(a.get("damage_reduction", 0.0)))
	var rg: Variant = u.get("_rage")
	if float(u.get("rage_left")) > 0.0 and rg is Dictionary:
		cut = maxf(cut, float(rg.get("damage_reduction", 0.0)))  # RAGE running
	if _power_up(u, "rampage"):
		cut = maxf(cut, RAMPAGE_ARMOR)  # RAMPAGE: half of every hit, as long as it lasts
	var tw: Variant = u.get("twin")
	if is_instance_valid(tw):
		h += float(tw.hp)  # the TWIN takes TWIN_SHARE of each hit until that much of it is gone
	return h / (1.0 - minf(cut, 0.8))


## A hero's damage per second over a short fight: its auto-attacks, a TWIN's
## shots alongside them, RAMPAGE's aura, and the abilities it has ready and can
## afford, spread over RACE_WINDOW.
static func _fight_dps(u: Node2D) -> float:
	var dps: float = u.attack_damage() / maxf(u.attack_interval(), 0.05)
	if is_instance_valid(u.get("twin")):
		dps += u.attack_damage() * TwinScript.TWIN_DAMAGE / maxf(u.attack_interval(), 0.05)  # it fires with every attack
	if _power_up(u, "rampage") and u.attack_range() + u.radius <= RAMPAGE_RADIUS:
		dps += RAMPAGE_DPS  # the aura, but only for a hero that fights from inside it
	var burst := 0.0
	var mana: float = u.mana
	for slot: String in SLOT_ORDER:
		var a: Dictionary = u.abilities[slot]
		if u.is_ready(slot) and mana >= u.ability_cost(slot) and a.get("damage", 0.0) > 0.0:
			mana -= u.ability_cost(slot)
			var hits: float = float(a.get("pulses", a.get("count", 1)))
			if a["kind"] == "rage":  # contact damage is per second: a window's worth, plus the burn
				hits = minf(float(a.get("duration", 4.0)), RACE_WINDOW)
				burst += float(a.get("burn_dps", 0.0)) * 2.0 * u.ability_scale(slot)
			burst += a["damage"] * hits * u.ability_scale(slot)
	return dps + burst / RACE_WINDOW


## How far you can reach to start a fight: your attack range plus your
## ready dash / blink (and both bodies).
func _threat_reach(eh: Node2D) -> float:
	var reach: float = eh.attack_range() + eh.radius + radius
	for slot: String in SLOT_ORDER:
		var a: Dictionary = eh.abilities[slot]
		if (a["kind"] == "dash" or a["kind"] == "blink") and eh.is_ready(slot) and eh.mana >= eh.ability_cost(slot):
			reach = maxf(reach, float(a["range"]) + eh.attack_range() + eh.radius + radius)
	return reach


## Danger-aware retreat: you're close enough to start a fight and could kill
## it with what you have ready (your ready abilities + BURST_WINDOW s of
## attacks), or you're faster and it's getting low. It has to notice: odds =
## smartness.
func _in_danger(eh: Node2D) -> bool:
	if eh == null or position.distance_to(eh.position) > _threat_reach(eh) or not _roll("notice_danger", smartness):
		return false
	var burst: float = (_fight_dps(eh) - eh.attack_damage() / maxf(eh.attack_interval(), 0.05)) * RACE_WINDOW \
		+ eh.attack_damage() / maxf(eh.attack_interval(), 0.05) * BURST_WINDOW
	if hp <= burst:
		return true
	return eh.speed > speed and hp / max_hp < float(_pv("retreat_at", RETREAT_AT)) + FASTER_MARGIN


## Chase limit: will it follow you to where you are? Not past `chase_depth`
## into your half — unless you're nearly dead — and never under your tower.
func _may_chase(eh: Node2D) -> bool:
	var depth: float = eh.position.x * _forward()  # px past the middle toward your base
	if depth <= float(_pv("chase_depth", STANDARD_CHASE)):
		return true
	return eh.hp / eh.max_hp < 0.25 and _safe(eh.position)


## Last hitting: the weakest enemy creep in reach that one attack (with a
## little slack for the shot's travel) will finish. With no friendly creeps
## to share the lane with, the nearest enemy creep instead — defend.
func _farm_target() -> Node2D:
	var dmg: float = attack_damage() * LAST_HIT_SLACK
	var lh_chance: float = difficulty.get("last_hit_chance", 1.0)
	var allies := false
	var weakest: Node2D = null
	var nearest: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team:
			allies = allies or c.is_targetable()
			continue
		if not c.is_targetable() or not _safe(c.position) or position.distance_to(c.position) > FARM_RANGE:
			continue
		if _wary and not _poke_ok(c):
			continue  # outmatched: this one is too deep in your reach to lean for
		if c.hp <= dmg and c.bounty > 0 and (weakest == null or c.hp < weakest.hp):  # (no gold in it: not a last hit worth timing)
			var id := c.get_instance_id()  # one roll per creep: does it go for this last hit?
			if not _lh_roll.has(id):
				_lh_roll[id] = randf() < lh_chance
				if not _lh_roll[id]:
					ledger["skipped_last_hits"] = int(ledger["skipped_last_hits"]) + 1
			if _lh_roll[id]:
				weakest = c
		if nearest == null or position.distance_to(c.position) < position.distance_to(nearest.position):
			nearest = c
	if weakest:
		return weakest
	return null if allies else nearest


## Its own creep, low enough to deny with the next hit or so, or null. Each
## creep gets one roll against the round's deny_chance when it first becomes
## a candidate — the bot only goes for the ones that rolled yes.
func _deny_target() -> Node2D:
	var dmg: float = attack_damage() * LAST_HIT_SLACK
	var chance: float = difficulty.get("deny_chance", 1.0)
	var best: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.deniable_by(team) and c.hp <= dmg and position.distance_to(c.position) <= FARM_RANGE and _safe(c.position) 				and not (_wary and _too_close_to_foe(c.position)):
			var id := c.get_instance_id()
			if not _deny_roll.has(id):
				_deny_roll[id] = randf() < chance
			if not _deny_roll[id]:
				continue
			if best == null or c.hp < best.hp:
				best = c
	return best


## Just behind the most advanced friendly creep, or by its own tower.
## Hold: walk to `spot` unless it's already within HOLD_SLACK — the spot
## follows its front creep, which jostles every frame in a melee scrum; without
## the slack it shuffled after every jostle (autoplay --osc "hold" loops).
const HOLD_SLACK := 60.0
func _hold_at(spot: Vector2) -> void:
	if position.distance_to(spot) <= HOLD_SLACK:
		var heading: Variant = _target
		if heading == null or (heading as Vector2).distance_to(spot) <= HOLD_SLACK:
			return  # close enough: stay (free hits carry on from here)
	_go(spot)


func _lane_spot() -> Vector2:
	var fwd := _forward()
	var front := INF if fwd < 0.0 else -INF
	var any := false
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable():
			any = true
			front = minf(front, c.position.x) if fwd < 0.0 else maxf(front, c.position.x)
	var own: Node2D = lane.tower(team) if lane else null
	var x: float = front - fwd * _hold_back() if any else (own.position.x if own else Lane.base_of(team).x) + fwd * 260.0
	if _p.has("home_leash") and own:  # opportunist: near its tower unless you're vulnerable
		var eh := _enemy_hero_alive()
		if eh == null or not _vulnerable(eh):
			var limit: float = own.position.x + fwd * float(_p["home_leash"])
			x = maxf(x, limit) if fwd < 0.0 else minf(x, limit)
	var spot := Vector2(x, _lane_y)
	var et := _enemy_tower()
	if et and not _safe(spot):
		spot.x = et.position.x - fwd * (et.RANGE + 160.0)  # the same line backing off uses: no gap to flicker in
	var eh := _enemy_hero_alive()
	if _wary and eh:  # outmatched: wait just outside your reach, on its own side of you
		var keep := _threat_reach(eh) + CLEAR_MARGIN  # the same line a danger retreat counts as clear: no gap to flicker in
		var behind: float = eh.position.x - fwd * keep
		if spot.x * fwd > behind * fwd:  # its usual spot is inside your reach: hold back
			var mine: float = position.x * fwd
			if mine <= behind * fwd and mine >= behind * fwd - WARY_BAND:
				spot.x = position.x  # already just outside it: stay put, don't mirror your every step
			else:
				spot.x = behind
	return spot


## Is `p` inside your reach (outmatched bots keep out of it)?
## Can it take this last hit without committing — leaning at most POKE_BITE
## into your reach? Measured at the spot it would stand to take the shot, not
## at the creep, so attack range buys it safety (see POKE_BITE).
func _poke_ok(c: Node2D) -> bool:
	var eh := _enemy_hero_alive()
	if eh == null:
		return true
	var d := position.distance_to(c.position)
	var stand: Vector2 = c.position + (position - c.position).normalized() * minf(attack_range(), d) if d > 0.01 else position
	return stand.distance_to(eh.position) >= _threat_reach(eh) * (1.0 - POKE_BITE)


func _too_close_to_foe(p: Vector2) -> bool:
	var eh := _enemy_hero_alive()
	return eh != null and p.distance_to(eh.position) < _threat_reach(eh)


## Where you'll be in `lead` seconds, give or take a little.
func _predict(eh: Node2D, lead: float) -> Vector2:
	return eh.position + eh.velocity * lead + Vector2.from_angle(randf() * TAU) * randf() * float(difficulty.get("aim_error", AIM_ERROR))


func _use_abilities() -> void:
	# a recast orb out: set it off once something worth hitting is inside it
	for slot: String in recast.keys():
		if has_recast(slot):
			var orb: Node2D = recast[slot]
			var r: float = abilities[slot]["radius"] * 0.85
			var eh := _enemy_hero_alive()
			var creeps_in := get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
				return c.team != team and c.is_targetable() and c.position.distance_to(orb.position) <= r).size()
			if (eh and eh.position.distance_to(orb.position) <= r) or creeps_in >= 3:
				cast(slot, orb.position)
	if _cast_gap > 0.0:
		return
	for slot: String in SLOT_ORDER:
		if not is_ready(slot) or not can_afford(slot):
			continue
		if slot == "R" and Run.round_num < ULT_FROM:
			continue  # hasn't learned to use its ultimate yet
		if spin_left > 0.0 and abilities[slot]["kind"] == "dash":
			continue  # a dash would cut its own GRIND short (escapes still may: _escape)
		var at: Variant = _ability_target(slot, abilities[slot])
		if at != null and mana - ability_cost(slot) < _getaway_cost(slot):
			var eh := _enemy_hero_alive()
			if eh == null or (at as Vector2).distance_to(eh.position) > 160.0:
				continue  # not at you: keeps its BOOP / dash mana (KYLE spent down to 2–60 mana on creeps from 'hold' and had no BOOP when KAREN reached it, four times)
		if at != null:
			cast(slot, at)
			_cast_gap = difficulty.get("cast_gap", CAST_GAP)
			return


## Where to cast `slot`, or null to hold it.
func _ability_target(slot: String, a: Dictionary) -> Variant:
	var eh := _enemy_hero_alive()
	var casts := str(_pv("hero_casts", "always"))
	if eh and casts == "vulnerable" and not _vulnerable(eh) and a["kind"] != "dash":
		eh = null  # waits for an opening before spending mana on you
	elif eh and casts == "poke" and not _vulnerable(eh) and (slot == "R" or a["kind"] in ["self", "cone"]):
		eh = null  # pokes from range freely; saves the close-up and ultimate for an opening
	var ult := slot == "R"
	if _rule("ignite_deny", false) and eh and a["kind"] == "ground" and float(a.get("duration", 0.0)) > 0.0:
		var deny: Variant = _deny_spot(a, eh)
		if deny != null:
			return deny  # the zoner: fire on the creeps you want to farm
	if _pv("creeps_first", false) and not ult:
		var c: Variant = _creep_cast(a)
		if c != null:
			return c
	var h: Variant = _hero_cast(a, eh)
	if h != null and _rule("predictable_only", false) and str(a["kind"]) in ["beam", "ground", "skillshot"] and not _predictable(eh):
		h = null  # the artillery: you're jinking — save it (or spend it on creeps)
	if h != null:
		return _with_creeps(a, h)  # aim so it catches creeps too, still on you
	var you_away: bool = _enemy_hero_alive() == null or position.distance_to(_enemy_hero_alive().position) > AWAY
	if ult or not (_pv("creep_casts", true) or you_away):
		return null  # (a heroes-only personality still clears waves while you're away)
	return _creep_cast(a)


## How far ability `a` reaches a hero from the bot (for "can it follow up?").
func _reach_of(a: Dictionary) -> float:
	match str(a["kind"]):
		"ground", "orb":
			return float(a["range"]) + float(a.get("radius", 0.0)) * 0.5 if float(a["range"]) > 0.0 else float(a.get("radius", 0.0))
		"beam", "skillshot", "cone", "dash", "boop":
			return float(a.get("range", 0.0))
		"self":
			return float(a.get("radius", 0.0)) * (0.45 if float(a.get("edge_damage", 1.0)) < 1.0 else 0.8)
		"spin", "rage":
			return radius * 2.5
	return 0.0


## BOOP aimed just behind you (from the bot's side), so you sit inside it and
## get knocked toward the bot — or null if that's out of its range.
func _boop_behind(a: Dictionary, eh: Node2D) -> Variant:
	var back: Vector2 = (eh.position - position).normalized() if eh.position.distance_to(position) > 1.0 else facing
	var at: Vector2 = eh.position + back * float(a["radius"]) * 0.55
	return at if position.distance_to(at) <= float(a["range"]) else null


# ------------------------------------------------------------------ the zoner (KYLE's mind)

## Its fire on the ground right now (an IGNITE it cast): {at, r, until}, or {}.
var _fire := {}
const BOOP_INTO_FIRE := 180.0  # px past its fire's edge an enemy may stand for a BOOP to knock them in


## Records where a lingering fire it casts lands (for boop_into_fire).
func cast(slot: String, point: Vector2) -> void:
	var a: Dictionary = abilities.get(slot, {})
	var fire: bool = str(a.get("kind", "")) == "ground" and float(a.get("duration", 0.0)) > 0.0 and is_ready(slot) and can_afford(slot)
	var from := position
	super(slot, point)
	if fire:
		var to := point - from
		var reach := clampf(to.length(), float(a.get("min_range", 0.0)), float(a["range"]))
		_fire = {"at": from + (to.normalized() if to.length() > 1.0 else facing) * reach, "r": float(a["radius"]),
			"until": _clock + 0.55 + float(a.get("duration", 0.0))}


## The zoner's moves, ahead of its usual order (each a hero-mind rule):
## knock a melee hero out of its face, knock you into its fire, keep you burning
## — and the anchor's: SHOVE through whoever crowds its wave (shove_peel).
func _zone_tick(eh: Node2D) -> bool:
	if eh == null or _retreating or not _combo.is_empty():
		return false
	var boop := ""
	for s: String in SLOT_ORDER:
		if str(abilities[s]["kind"]) == "boop" and is_ready(s) and can_afford(s) and _cast_gap <= 0.0:
			boop = s
	var d := position.distance_to(eh.position)
	if boop != "" and float(_rule("boop_peel", 0.0)) > 0.0 and d <= float(_rule("boop_peel", 0.0)) and eh.attack_range() < 250.0:
		why = "zone:peel"  # a melee hero in its face: knock you both apart
		cast(boop, position.lerp(eh.position, 0.5))
		_cast_gap = difficulty.get("cast_gap", CAST_GAP)
		return true
	if _rule("shove_peel", false) and _threatened(eh) and _cast_gap <= 0.0:
		for s: String in SLOT_ORDER:  # you're crowding its wave: charge through you, knock you aside, gain ground
			if str(abilities[s]["kind"]) == "dash" and is_ready(s) and can_afford(s) \
					and d <= float(abilities[s].get("range", 0.0)) \
					and (eh.position.x - position.x) * _forward() > -50.0:  # only when the charge takes it forward, not back into its own half
				why = "zone:shove"
				cast(s, eh.position)
				_cast_gap = difficulty.get("cast_gap", CAST_GAP)
				return true
	if boop != "" and _rule("boop_into_fire", false) and not _fire.is_empty() and _clock < float(_fire["until"]) and hp / max_hp >= BOOP_KEEP:
		var z: Vector2 = _fire["at"]
		var dz := eh.position.distance_to(z)
		if dz > float(_fire["r"]) and dz <= float(_fire["r"]) + BOOP_INTO_FIRE:
			var a: Dictionary = abilities[boop]
			var at: Vector2 = eh.position + (eh.position - z).normalized() * float(a["radius"]) * 0.55
			if position.distance_to(at) <= float(a["range"]):
				why = "zone:boop into fire"  # from behind you: knocked into its IGNITE
				cast(boop, at)
				_cast_gap = difficulty.get("cast_gap", CAST_GAP)
				return true
	var stoke_safe: bool = d > _catch_reach(eh) or (_race(eh) >= float(_pv("race_need", STANDARD_RACE)) and hp / max_hp >= float(_pv("retreat_at", RETREAT_AT)) + LOW_MARGIN)
	if _rule("keep_burning", false) and eh.is_burning_from(self) and d <= attack_range() + eh.radius and _safe(eh.position) and not _wary and stoke_safe:
		why = "zone:stoke"  # (only out of your reach, or while it's winning: it stood stoking KAREN while she GRINDed it from 74% to 4%)  # you're burning from its fire: every hit keeps it going
		if attack_target != eh:
			order_attack(eh.position)
		return true
	return false


# ------------------------------------------------------------------ the artillery (BECKY's mind)

var _eh_dir := Vector2.ZERO      # the enemy hero's heading last check
var _eh_straight_since := 0.0    # since when it has kept that heading


func _process_heading(eh: Node2D) -> void:
	var v: Vector2 = eh.velocity
	if v.length() < 40.0:
		_eh_dir = Vector2.ZERO
		_eh_straight_since = _clock
		return
	var dir := v.normalized()
	if _eh_dir == Vector2.ZERO or dir.dot(_eh_dir) < 0.95:
		_eh_straight_since = _clock  # it turned: the line starts again
	_eh_dir = dir


## How far `eh` can catch it from: its attack reach, plus a ready gap-closer
## (a dash: POUNCE, SHOVE) — not a blink or BOOP, which are getaways. (The
## full threat reach counted BECKY's own GHOST: a mirror BECKY kept 1000+ px
## away and couldn't farm.)
func _catch_reach(eh: Node2D) -> float:
	var reach: float = eh.attack_range() + eh.radius + radius
	for s: String in SLOT_ORDER:
		var a: Dictionary = eh.abilities[s]
		if str(a["kind"]) == "dash" and eh.is_ready(s) and eh.mana >= eh.ability_cost(s):
			reach = maxf(reach, float(a["range"]) + eh.attack_range() * 0.5 + eh.radius + radius)
	return reach


## Is `eh` predictable — standing still, or holding a straight line ~0.5 s?
func _predictable(eh: Node2D) -> bool:
	_process_heading(eh)
	return eh.velocity.length() < 40.0 or _clock - _eh_straight_since >= 0.5


## The artillery's keep-out (keep_out): never inside your threat reach (+ the
## margin) — it steps back out along the lane, then farms from there.
func _art_tick(eh: Node2D) -> bool:
	var pad := float(_rule("keep_out", 0.0))
	if pad <= 0.0 or eh == null or _retreating or not _combo.is_empty():
		return false
	if _rule("predictable_only", false):
		_process_heading(eh)  # (keeps its read of your heading fresh)
	var need: float = _catch_reach(eh) + pad
	var d := position.distance_to(eh.position)
	if d >= need:
		return false
	var away: Vector2 = (position - eh.position).normalized() if d > 1.0 else Vector2(-_forward(), 0.0)
	why = "art:keep out"  # out of your reach first; farming resumes from there
	_shy_until = maxf(_shy_until, _clock + SHY_FOR)  # …and stays out: no walking back in to farm (hysteresis)
	_go(eh.position + away * (need + 20.0))
	return true


# ------------------------------------------------------------------ the diver (CHAD's mind)

const HUNT_CHASE := 900.0  # px: how far it runs down a hurt hero (never under their tower)


## Has `eh` an escape ready (a dash, a blink or a BOOP it can afford)?
func _escape_ready(eh: Node2D) -> bool:
	for s: String in SLOT_ORDER:
		var a: Dictionary = eh.abilities[s]
		if str(a["kind"]) in ["dash", "blink", "boop"] and eh.is_ready(s) and eh.mana >= eh.ability_cost(s):
			return true
	return false


## The diver's hunt (hunt_at): a hurt hero doesn't walk away — POUNCE when in
## reach, else run them down with attacks; never under their tower.
func _dive_tick(eh: Node2D) -> bool:
	var at := float(_rule("hunt_at", 0.0))
	if at <= 0.0 or eh == null or _retreating or not _combo.is_empty() or eh.hp / eh.max_hp > at or not _safe(eh.position):
		return false
	var d := position.distance_to(eh.position)
	if d > HUNT_CHASE:
		return false
	if hp / max_hp < float(_pv("retreat_at", RETREAT_AT)) and not _sure_kill(eh):
		return false  # hurt itself: no hunting unless it's a sure kill (it POUNCEd at 7% health once, and died)
	for s: String in SLOT_ORDER:
		var a: Dictionary = abilities[s]
		if str(a["kind"]) == "dash" and is_ready(s) and can_afford(s) and d <= float(a["range"]) + eh.radius and _cast_gap <= 0.0:
			why = "dive:pounce"  # onto you (where you're going)
			cast(s, eh.position + eh.velocity * 0.15)
			_cast_gap = difficulty.get("cast_gap", CAST_GAP)
			return true
	why = "dive:chase"
	if attack_target != eh:
		order_attack(eh.position)
	return true


## Health share lost over the last 4 s (0 if none).
func _recent_loss() -> float:
	if _hp_marks.is_empty():
		return 0.0
	return maxf(0.0, _hp_marks.max() - hp / max_hp)


## A sure kill: `eh` dies to one ready dash plus one attack.
func _sure_kill(eh: Node2D) -> bool:
	var burst := attack_damage()
	for s: String in SLOT_ORDER:
		var a: Dictionary = abilities[s]
		if str(a["kind"]) == "dash" and is_ready(s) and can_afford(s):
			burst += float(a.get("damage", 0.0))
	return eh.hp <= burst


## ignite_deny: its own low creeps near you (the ones you'd last-hit) — fire on them.
func _deny_spot(a: Dictionary, eh: Node2D) -> Variant:
	var best: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if not c.deniable_by(team) or c.position.distance_to(eh.position) > 350.0:  # (overtime: no denies, so no zoning the farm either)
			continue
		if position.distance_to(c.position) > float(a["range"]):
			continue
		if best == null or c.position.distance_to(eh.position) < best.position.distance_to(eh.position):
			best = c
	return best.position if best else null


## May it spend a charge (SHOVE) on creeps? Only when its wave is at its tower
## and you're dead or well away — it's how it starts fights with you.
func _dash_free_for_creeps() -> bool:
	if _wave_threat() < 2:
		return false
	var eh := _enemy_hero_alive()
	return eh == null or position.distance_to(eh.position) > _threat_reach(eh) + 600.0


## A cast aimed at you at `h`: nudged, if it can be, to also hit as many of
## your creeps as possible while you stay well inside it — the best casts hit
## a hero AND a wave. Area blasts shift toward a clump; beams and piercing
## shots turn onto a line through creeps that still passes through you.
func _with_creeps(a: Dictionary, h: Vector2) -> Vector2:
	var foes: Array = get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
		return c.team != team and c.is_targetable() and c.position.distance_to(h) <= 600.0)
	if foes.is_empty():
		return h
	match a["kind"]:
		"ground", "orb":
			if float(a["range"]) <= 0.0:
				return h  # dropped at its feet: nothing to aim
			var r: float = float(a["radius"])
			var best := h
			var best_n := _count_near(foes, h, r * 0.9)
			for c: Node2D in foes:
				for f: float in [0.33, 0.5]:  # part way toward a creep, keeping you inside
					var p: Vector2 = h.lerp(c.position, f)
					if p.distance_to(h) > r * 0.6:
						continue
					var d := position.distance_to(p)
					if d > float(a["range"]) or d < float(a.get("min_range", 0.0)):
						continue
					var n := _count_near(foes, p, r * 0.9)
					if n > best_n:
						best_n = n
						best = p
			return best
		"beam", "skillshot":
			if a["kind"] == "skillshot" and not a.get("pierce_creeps", false):
				return h  # stops at the first thing it hits: aim at you
			var length: float = float(a["range"])
			var half: float = float(a.get("width", 60.0)) / 2.0 if a["kind"] == "beam" else 30.0
			var best := h
			var best_n := _count_on_line(foes, h, length, half)
			for c: Node2D in foes:
				var end := position + (c.position - position).normalized() * length
				var q := Geometry2D.get_closest_point_to_segment(h, position, end)
				if h.distance_to(q) > half * 0.6:
					continue  # this line would miss you
				var n := _count_on_line(foes, c.position, length, half)
				if n > best_n:
					best_n = n
					best = c.position
			return best
	return h


func _count_near(units: Array, at: Vector2, r: float) -> int:
	return units.filter(func(u: Node2D) -> bool: return u.position.distance_to(at) <= r + u.radius).size()


## How many of `units` a line from here toward `toward`, `length` long and
## `half` wide (each side), would touch.
func _count_on_line(units: Array, toward: Vector2, length: float, half: float) -> int:
	var end := position + (toward - position).normalized() * length
	return units.filter(func(u: Node2D) -> bool:
		var q := Geometry2D.get_closest_point_to_segment(u.position, position, end)
		return u.position.distance_to(q) <= half + u.radius).size()


## Where to cast `a` at the enemy hero, or null.
func _hero_cast(a: Dictionary, eh: Node2D) -> Variant:
	if eh == null:
		return null
	var d: float = position.distance_to(eh.position)
	match a["kind"]:
		"skillshot":
			if d <= a["range"]:
				return _predict(eh, d / 1500.0)  # Bolt speed
		"beam":  # SHADE: from far off (it hits hardest there), never with you on top of it
			if d <= a["range"] and d >= float(a.get("full_at", 0.0)) * 0.6:
				return _predict(eh, float(a.get("windup", 0.0)))
		"orb":  # send the dot where you'll be; it's set off in _use_abilities
			if d <= a["range"]:
				return _predict(eh, d / float(a["speed"]))
		"ground":
			if a["range"] <= 0.0:  # dropped at its feet (TRAP): when you're close
				return position if d <= a["radius"] * 1.3 else null
			if d <= a["range"] + a["radius"] * 0.5 and d >= float(a.get("min_range", 0.0)):  # RUMOR can't land close
				return _predict(eh, 0.55)  # IGNITE warning time
		"self":
			# a tapering shockwave (Nova: half damage at the edge) waits until you're close
			var reach: float = 0.45 if a.get("edge_damage", 1.0) < 1.0 else 0.8
			if d <= a["radius"] * reach:
				return position
		"cone":
			if d <= a["range"] * 0.9:
				return eh.position
		"spin":  # GRIND: when you're within its spinning corners' reach
			if d <= radius * corner_factor(def.get("shape", "")) * float(a.get("grow_end", 2.0)) + eh.radius:
				return position
		"shield":  # BRACE: in a real fight with you — you've hit it in the last moment (else it's saved)
			if d <= 450.0 and _clock - _hero_hit_at <= 1.0:
				return position
		"boop":  # you're low and getting away: knock you back toward it
			var away: bool = eh.velocity.length() > 100.0 and eh.velocity.dot(eh.position - position) > 0.0
			if away and eh.hp / eh.max_hp < float(_pv("dash_at", 0.35)) and _safe(eh.position) and _may_chase(eh):
				return _boop_behind(a, eh)
		"rage":  # RAGE: when it's on top of you
			if d <= radius + float(a.get("contact_reach", 40.0)) + 80.0:
				return position
		"dash":
			# combo (KYLE): dash right through you while you're burning from its Blast — it slows you
			if a.get("zone_slow", 0.0) > 0.0 and (eh.is_burning_from(self) or eh.in_zone_of(self)) and d <= a["range"] * 0.8 and _safe(eh.position):
				return eh.position + (eh.position - position).normalized() * 90.0
			# finish (or, for some personalities, go in on) a weak hero, never diving the tower
			if d <= a["range"] and eh.hp / eh.max_hp < float(_pv("dash_at", 0.35)) and _safe(eh.position) and _may_chase(eh):
				return eh.position
	return null


## Where to cast `a` on a clump of enemy creeps, or null.
func _creep_cast(a: Dictionary) -> Variant:
	match a["kind"]:
		"skillshot":  # a piercing fan (CHAD): through a clump of creeps
			return _creep_clump(a["range"] * 0.8, 120.0) if a.get("pierce_creeps", false) else null
		"orb", "ground":
			var spot: Variant = _creep_clump(a["range"], a["radius"])
			if spot != null and position.distance_to(spot) < float(a.get("min_range", 0.0)):
				return null  # RUMOR can't land that close
			return spot
		"self":
			return position if _creep_clump(0.0, a["radius"]) != null else null
		"cone":
			return _creep_clump(a["range"] * 0.8, a["range"] * 0.5)
		"spin":
			if _rule("grind_for_kills", false):
				return position if _grind_worth(a, radius * corner_factor(def.get("shape", "")) * float(a.get("grow_end", 2.0)) + 20.0) else null
			return position if _creep_clump(0.0, radius * corner_factor(def.get("shape", "")) * float(a.get("grow_end", 2.0)) + 20.0) != null else null
		"shield":  # its wave pushing into your tower: shield them
			var et := _enemy_tower()
			if et and position.distance_to(et.position) < et.RANGE + 200.0 and _creep_clump(0.0, a["radius"]) == null:
				var mine := get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
					return c.team == team and c.is_targetable() and c.position.distance_to(position) <= a["radius"]).size()
				return position if mine >= 3 else null
	return null


## A spot within `reach` of the bot where 3+ enemy creeps stand within
## `radius` of each other, or null.
func _creep_clump(reach: float, radius_: float) -> Variant:
	var mine := get_tree().get_nodes_in_group("creeps").filter(func(c: Node2D) -> bool:
		return c.team != team and c.is_targetable())
	for c: Node2D in mine:
		if position.distance_to(c.position) > reach + radius_:
			continue
		var n := 0
		for o: Node2D in mine:
			if o.position.distance_to(c.position) <= radius_:
				n += 1
		if n >= int(_pv("clump", 3)) and _safe(c.position):
			return c.position
	return null


## Getting out with you or a tower on it: burn a dash / blink toward `to`
## (home for a low-health retreat, the backoff spot for a danger retreat).
func _escape(to: Vector2) -> void:
	var eh := _enemy_hero_alive()
	var et := _enemy_tower()
	var threatened: bool = (eh and position.distance_to(eh.position) < 650.0) or (et and et.target == self)
	if not threatened:
		return
	if _react_left < 0.0:  # just noticed the danger: react after its reaction time
		_react_left = _jitter(float(difficulty.get("reaction", REACTION)))
	if _react_left > 0.0:
		return
	for slot: String in SLOT_ORDER:  # TRAP at its feet first, to slow whoever's chasing
		var a: Dictionary = abilities[slot]
		if a["kind"] == "ground" and a["range"] <= 0.0 and a.get("move_slow", 0.0) > 0.0 and is_ready(slot) and can_afford(slot):
			cast(slot, position)
			break
	for slot: String in SLOT_ORDER:  # BOOP between you and it: you're both knocked apart
		var b: Dictionary = abilities[slot]
		var boop_reach: float = float(b.get("radius", 160.0)) + float(b.get("push", 120.0))
		if b["kind"] == "boop" and is_ready(slot) and can_afford(slot) and eh != null \
				and (position.distance_to(eh.position) <= boop_reach * 1.2 or is_tethered()):
			cast(slot, position.lerp(eh.position, 0.5))
			_react_left = _jitter(float(difficulty.get("reaction", REACTION)))
			return
	for slot: String in SLOT_ORDER:
		var kind: String = abilities[slot]["kind"]
		if (kind == "dash" or kind == "blink") and is_ready(slot) and can_afford(slot):
			cast(slot, position + (to - position).normalized() * float(abilities[slot]["range"]))
			_react_left = _jitter(float(difficulty.get("reaction", REACTION)))  # a second escape takes another reaction
			return
