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
##                 (once it's smart enough: SIEGE_SMARTS)
##   7. hold       stand just behind its own front-line creep; with no creeps
##                 out, wait by its tower
##
## It never dives: points under your tower count as unsafe unless creeps are
## taking the shots.
##
## PERSONALITIES (`personality`, "" = the standard bot above) reorder steps
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
##   wary        you'd win the damage race by a lot (its race < race_need ×
##               WARY_RACE): it holds outside your reach (attack range + your
##               ready dash / blink) and skips last hits inside it
##   in danger   you're within reach and could kill it with what you have ready,
##               or you're faster and it's near its retreat point: it retreats
##
## SMARTNESS (0..1, run.gd's ladder) blends every DUMB key from the dumb value
## (at 0) to the personality's own (at 1). A dumb bot thinks slowly, blunders
## (skips the right step), comes back a bit early, only
## trades when well ahead, misses your openings, and hasn't learned to use its
## ultimate (ULT_SMARTS) or siege (SIEGE_SMARTS).
##
## How hard it plays comes from three dials (see run.gd): stats (its health
## and damage, set on it by main), skill (`difficulty`: how often it casts, how
## well it aims, its last-hit / deny odds) and `smartness` (decisions, below).

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
##   siege_always sieges even before SIEGE_SMARTS  siege_reach  px it walks in to siege
##   (No freezing: pushing matters more here than in other MOBAs — every
##   personality pushes and clears with its abilities. With you near it pushes
##   from behind its own wave, never out in front of it.)
##   race_need    trades only if it wins the damage race by this much (1 = an
##                even race; 0.8 = accepts losing a little; 1.2 = wants a clear win)
##   chase_depth  px past the middle (into your half) it'll chase you; deeper
##                only to finish you (under 25% health), never under your tower
## (Skill — last-hit / deny odds, aim, reaction — is never a personality key.)
const PERSONALITIES := {
	"brawler": {"order": ["abilities", "trade", "clear", "farm", "deny", "push", "siege"], "retreat_at": 0.2, "healed_at": 0.75,
		"engage": 650.0, "trade_cap": 0.6, "trade_margin": -0.25, "dash_at": 0.6, "hold_back": 20.0,
		"race_need": 0.85, "chase_depth": 700.0},
	"farmer": {"order": ["clear", "farm", "deny", "abilities", "trade", "push", "siege"], "retreat_at": 0.4, "trade_when": "vulnerable",
		"hero_casts": "vulnerable", "clump": 2, "hold_back": 200.0, "race_need": 1.2, "chase_depth": 0.0},
	"pusher": {"order": ["leash", "siege", "clear", "abilities", "farm", "push", "trade"], "retreat_at": 0.25, "trade_when": "provoked",
		"creeps_first": true, "clump": 2, "hold_back": 60.0, "siege_always": true, "siege_reach": 400.0, "chase_depth": 200.0},
	"opportunist": {"order": ["abilities", "clear", "trade", "farm", "deny", "push", "siege"], "retreat_at": 0.35, "trade_when": "vulnerable",
		"hero_casts": "poke", "engage": 800.0, "trade_cap": 0.5, "dash_at": 0.5, "hold_back": 160.0,
		"race_need": 1.1, "chase_depth": 600.0},
}
const STANDARD_ORDER := ["abilities", "clear", "trade", "farm", "deny", "push", "siege"]
## Wave clear ("clear" step): when your wave is pressing it — CLEAR_NEAR px of
## its tower holds CLEAR_MIN+ of your creeps and they outnumber its own by
## CLEAR_EDGE, or any are inside its tower's range — it clears with its hero's
## best tools, aimed where they hit the most creeps, plus attacks on the
## weakest. Which abilities each hero clears with (heroes.gd order:
## KYLE, CHAD, KAREN, BECKY); a shield slot shields its own wave instead.
const CLEAR_SLOTS := [["W", "Q"], ["Q", "W"], ["E", "Q", "W"], ["W", "Q"]]  # CHAD: STARS through the line, TRAP in the clump  # KAREN: SHOVE exposes the clump, then GRIND cuts it
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
const COMMIT := {"brawler": 1.0, "opportunist": 1.0, "farmer": 0.6, "pusher": 0.4}
const COMMIT_DEFAULT := 0.8
const COMMIT_MIN_HEALTH := 0.35  # won't start a combo below this much of its own health
const COMMIT_BITE := 0.35        # "open" target: worth it if the combo takes this share of your health
const COMBO_STEP_WAIT := 1.5     # s it'll wait (closing in) for a step to come into reach before moving on
const DEFEND_HOLD := 2.5
const DEFEND_NEAR := 250.0  # you within the tower's range + this count as hitting it
const AWAY := 1200.0  # px: an enemy hero further than this (or dead) counts as away
const PUSH_LEAD := 40.0  # with you near, it pushes from at most this far ahead of its front creep
const STANDARD_MARGIN := -0.1
const STANDARD_RACE := 1.0      # standard bot: trades on an even damage race or better
const STANDARD_CHASE := 300.0   # standard bot: chases you this far past the middle
const RACE_WINDOW := 4.0        # s of fighting the damage race looks at (attacks + ready abilities)
const WARY_RACE := 0.8          # below race_need × this it's outmatched: keeps out of your reach
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
const ULT_SMARTS := 0.4     # uses its ultimate from this smartness
## How keen each personality is on stutter-stepping (× smartness = the odds).
const STUTTER := {"opportunist": 1.0, "farmer": 1.0, "brawler": 0.6, "pusher": 0.3}
const STUTTER_DEFAULT := 0.8
const STEP_MIN := 40.0      # px: a step point closer than this isn't worth moving for (no jitter)
const STEP_FROM_CD := 0.25  # s: only steps out with at least this much reload left
const SIEGE_SMARTS := 0.4   # hits your tower (creeps tanking) from this smartness

var enemy_hero: Node2D
var lane: Node2D
## Which hero from heroes.gd it plays (-1 = the default first one).
var pick := -1
## This round's strength (run.gd DIFFICULTY row); empty = full strength.
var difficulty := {}
## A PERSONALITIES key, or "" / "standard" for the standard bot.
var personality := ""
## How well it decides, 0..1 (run.gd's ladder; 1 = the personality as tuned).
var smartness := 1.0
var _p := {}

var _think := 0.0
var _cast_gap := 2.0
var _retreating := false
var _lane_y := 0.0  # its own lateral spot in the lane
var _react_left := -1.0  # counting down to escaping (-1 = no danger noticed yet)
var _hesitate_left := -1.0  # ignoring the urge to run for this much longer (-1 = not hurt yet)
var _deny_roll := {}
## This decision: does it see that you out-damage it (it noticed — odds =
## smartness)? Then it keeps out of your reach and won't farm inside it.
var _wary := false
## Sticky rolls: "does it notice / blunder" answers kept for ROLL_HOLD s
## (± a little) instead of re-rolled every decision — re-rolling made a dumb
## bot flicker between choices and step back and forth. key → [answer, until]
var _rolls := {}
var _clock := 0.0  # game seconds (so autoplay's fast clock works too)
const ROLL_HOLD := 1.5  # creep id -> whether it decided to deny that creep
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
## combo for COMMIT_BLOCK s; shy / wary → no stepping into your reach to deny,
## clear, push, farm or defend.
const TOWER_SHY := 3.0
const WARY_BAND := 120.0  # px: a wary bot this far (or less) outside your reach stays where it is
const COMMIT_BLOCK := 3.0
var _tower_shy_until := 0.0
var _commit_block_until := 0.0
const CLEAR_MARGIN := 150.0  # px past your reach that counts as clear
var _tower_hp_seen := -1.0          # its tower's health last frame
var _defend_left := 0.0             # its tower was hit this recently: defend
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
	_p = PERSONALITIES.get(personality, {})


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
		r = [randf() < chance, _clock + ROLL_HOLD * randf_range(0.7, 1.3)]
		_rolls[key] = r
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
	if _react_left > 0.0:
		_react_left -= delta
	if _hesitate_left > 0.0:
		_hesitate_left -= delta
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


func _decide_step(trading_with: Node2D) -> void:
	var home := Lane.base_of(team)
	var hp_frac := hp / max_hp
	var foe := _enemy_hero_alive()
	_wary = foe != null and (_clock < _shy_until or (_roll("notice_outmatched", smartness) and _race(foe) < float(_pv("race_need", STANDARD_RACE)) * WARY_RACE))
	if _retreating and _danger_retreat:  # backing off from your burst: until clear of your reach, then shy for a moment
		if foe == null or position.distance_to(foe.position) > _threat_reach(foe) + CLEAR_MARGIN:
			_retreating = false
			_danger_retreat = false
			_shy_until = _clock + SHY_FOR
			_wary = foe != null
	elif _retreating and hp_frac >= float(_pv("healed_at", HEALED_AT)):
		_retreating = false
	elif not _retreating and (hp_frac < float(_pv("retreat_at", RETREAT_AT)) or _in_danger(foe)):
		if _hesitate_left < 0.0:  # just got hurt enough to run: early bots fight on a moment first —
			var near: bool = foe != null and position.distance_to(foe.position) <= _threat_reach(foe)
			_hesitate_left = _jitter(float(difficulty.get("hesitate", 0.0))) if near else 0.0  # (nobody near: just go)
		if _hesitate_left <= 0.0:
			_retreating = true
			_danger_retreat = hp_frac >= float(_pv("retreat_at", RETREAT_AT))  # healthy: it's your burst it's running from
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
		_escape(home)
		_go(home + Vector2(0, _lane_y * 0.5))
		return

	var et := _enemy_tower()
	if et and et.target == self:
		_moving_only = true
		why = "backoff"
		_tower_shy_until = _clock + TOWER_SHY
		_go(Vector2(et.position.x - _forward() * (et.RANGE + 160.0), position.y))
		return

	var eh := _enemy_hero_alive()
	if not _combo.is_empty():
		why = "combo"
		return  # mid-combo: _combo_tick drives it
	if _defend(eh):
		why = "defend"
		return
	if eh and _should_commit(eh):
		why = "commit"
		_start_combo(eh)
		return
	if _pressing() and _press():
		why = "press"
		return
	var blunder: float = _pv("blunder", 0.0)
	for step: String in _pv("order", STANDARD_ORDER):
		if _roll("blunder_" + step, blunder):
			continue  # a dumb bot skips what it should be doing
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
					if _roll("stutter", smartness * float(STUTTER.get(personality, STUTTER_DEFAULT))):
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
				if et and (smartness >= SIEGE_SMARTS or _pv("siege_always", false)) and _safe(et.position) and not et.shielded_from(team) \
						and position.distance_to(et.position) < attack_range() + et.radius + float(_pv("siege_reach", SIEGE_REACH)):
					if attack_target != et:
						order_attack(et.position)
					return

	_idle = true  # nothing to do: hold the spot (free hits may fill the time)
	why = "hold"
	_go(_lane_spot())


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
		if best == null or position.distance_to(c.position) < position.distance_to(best.position):
			best = c
	return best


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
		return false  # outmatched with you right there: not the moment
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
		if keep_mana and mana - ability_cost(slot) < max_mana * CLEAR_MANA_KEEP:
			continue  # keeps some mana for you
		var at: Variant = _clear_point(a, need)
		if at != null:
			cast(slot, at)
			_cast_gap = difficulty.get("cast_gap", CAST_GAP)
			return


# ------------------------------------------------------------------ commit mode

## This hero's combo against `eh` (the running order if you're moving away), or [].
func _combo_seq(eh: Node2D) -> Array:
	if hero_index >= ComboBook.BOOK.size():
		return []
	var page: Dictionary = ComboBook.BOOK[hero_index]
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
	return d * AbilityInfo.damage_scale(mods, slot) * damage_mult


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
	if seq.is_empty() or hp / max_hp < COMMIT_MIN_HEALTH or not _safe(eh.position) or eh.in_well or _clock < _commit_block_until:
		return false
	var page: Dictionary = ComboBook.BOOK[hero_index]
	if position.distance_to(eh.position) > float(page["open"]) + 40.0:
		return false
	var opener: String = seq[0]
	if not is_ready(opener) or not can_afford(opener):
		return false  # the combo starts with this: wait for it
	var dmg := _combo_damage(seq)
	var ehp: float = (eh.hp + eh.shield_hp) / (1.0 + float(eh.get("_expose")))
	if dmg >= ehp * 0.95:
		return _roll("commit_kill", 0.5 + 0.5 * smartness)  # a kill on the table: most bots see it
	var keen: float = float(COMMIT.get(personality, COMMIT_DEFAULT)) * smartness
	if _open_target(eh) and dmg >= ehp * COMMIT_BITE:
		return _roll("commit_open", keen)
	if hp / max_hp >= eh.hp / eh.max_hp + 0.15 and dmg >= ehp * 0.5:
		return _roll("commit_trade", keen * 0.6)
	return false


## You're open: your escape is down, you're out of mana, or you've just spent your abilities.
func _open_target(eh: Node2D) -> bool:
	var spent := 0
	var cheapest := INF
	for slot: String in SLOT_ORDER:
		var a: Dictionary = eh.abilities[slot]
		if (a["kind"] == "dash" or a["kind"] == "blink") and not eh.is_ready(slot):
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
	_combo = {"seq": seq, "i": 0, "next": _clock + react, "target": eh, "waited": 0.0}
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
		_end_combo()
		return
	var et := _enemy_tower()
	if not _safe(eh.position) or (et and et.target == self):
		_end_combo()  # you ran under your tower (or it's shooting the bot): not worth a dive
		_commit_block_until = _clock + COMMIT_BLOCK
		return
	for slot: String in recast.keys():  # SHOCK's orb out: set it off on you
		if has_recast(slot) and recast[slot].position.distance_to(eh.position) <= float(abilities[slot]["radius"]) * 0.9:
			cast(slot, recast[slot].position)
	if attack_target != eh and not _dashing:
		order_attack(eh.position)  # attacks between casts, closing in as needed
	if _clock < float(_combo["next"]) or _dashing or _plant_left > 0.0 or is_stunned():
		return
	var seq: Array = _combo["seq"]
	var i: int = _combo["i"]
	if i >= seq.size():
		_end_combo()
		return
	var slot: String = seq[i]
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
	_combo["i"] = i + 1
	_combo["waited"] = 0.0
	_combo["next"] = _clock + gap


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
			return eh.position + (eh.position - position).normalized() * 90.0 + miss  # through you (WRAITH, SHOVE)
		"spin", "rage":
			return position if d <= radius * 2.6 + eh.radius + 40.0 else null
		"shield":
			return position
	var h: Variant = _hero_cast(a, eh)
	return _with_creeps(a, h) if h != null else null


func _end_combo() -> void:
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
	if eh and not shy and eh.position.distance_to(t.position) <= t.RANGE + DEFEND_NEAR:  # you, at its tower: everything at you
		if _cast_gap <= 0.0:
			for slot: String in SLOT_ORDER:
				if not is_ready(slot) or not can_afford(slot) or (slot == "R" and smartness < ULT_SMARTS):
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


## The damage race against `eh`: how long it takes to kill us ÷ how long we
## take to kill it, over a RACE_WINDOW-second fight (attacks + abilities
## ready now). > 1 = we win it.
func _race(eh: Node2D) -> float:
	var ours := _fight_dps(self)
	var theirs := _fight_dps(eh)
	var we_kill: float = eh.hp / maxf(ours, 1.0)
	var they_kill: float = hp / maxf(theirs, 1.0)
	return they_kill / maxf(we_kill, 0.01)


## A hero's damage per second over a short fight: its auto-attacks plus the
## abilities it has ready and can afford, spread over RACE_WINDOW.
static func _fight_dps(u: Node2D) -> float:
	var dps: float = u.attack_damage() / maxf(u.attack_interval(), 0.05)
	var burst := 0.0
	var mana: float = u.mana
	for slot: String in SLOT_ORDER:
		var a: Dictionary = u.abilities[slot]
		if u.is_ready(slot) and mana >= u.ability_cost(slot) and a.get("damage", 0.0) > 0.0:
			mana -= u.ability_cost(slot)
			var hits: float = float(a.get("pulses", a.get("count", 1)))
			burst += a["damage"] * hits * AbilityInfo.damage_scale(u.mods, slot) * u.damage_mult
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
		if _wary and _too_close_to_foe(c.position):
			continue  # outmatched: not worth walking into your reach for one creep
		if c.hp <= dmg and (weakest == null or c.hp < weakest.hp):
			var id := c.get_instance_id()  # one roll per creep: does it go for this last hit?
			if not _lh_roll.has(id):
				_lh_roll[id] = randf() < lh_chance
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
func _lane_spot() -> Vector2:
	var fwd := _forward()
	var front := INF if fwd < 0.0 else -INF
	var any := false
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable():
			any = true
			front = minf(front, c.position.x) if fwd < 0.0 else maxf(front, c.position.x)
	var own: Node2D = lane.tower(team) if lane else null
	var x: float = front - fwd * float(_pv("hold_back", 140.0)) if any else (own.position.x if own else Lane.base_of(team).x) + fwd * 260.0
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
		if slot == "R" and smartness < ULT_SMARTS:
			continue  # hasn't learned to use its ultimate yet
		if spin_left > 0.0 and abilities[slot]["kind"] == "dash":
			continue  # a dash would cut its own GRIND short (escapes still may: _escape)
		var at: Variant = _ability_target(slot, abilities[slot])
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
	if _pv("creeps_first", false) and not ult:
		var c: Variant = _creep_cast(a)
		if c != null:
			return c
	var h: Variant = _hero_cast(a, eh)
	if h != null:
		return _with_creeps(a, h)  # aim so it catches creeps too, still on you
	var you_away: bool = _enemy_hero_alive() == null or position.distance_to(_enemy_hero_alive().position) > AWAY
	if ult or not (_pv("creep_casts", true) or you_away):
		return null  # (a heroes-only personality still clears waves while you're away)
	return _creep_cast(a)


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
		"shield":  # BRACE: going into (or in) a fight with you
			if d <= 450.0:
				return position
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


## Running home with you or a tower on it: burn a dash / blink toward base.
func _escape(home: Vector2) -> void:
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
	for slot: String in SLOT_ORDER:
		var kind: String = abilities[slot]["kind"]
		if (kind == "dash" or kind == "blink") and is_ready(slot) and can_afford(slot):
			cast(slot, position + (home - position).normalized() * float(abilities[slot]["range"]))
			_react_left = _jitter(float(difficulty.get("reaction", REACTION)))  # a second escape takes another reaction
			return
