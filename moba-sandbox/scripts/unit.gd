extends Node2D
## Anything with health that can be hit: heroes, creeps, towers, training
## dummies. Holds the shared bits — team, body size, HP, hit flash, damage
## numbers, health bar — and puts itself in the "units" group, which is what
## targets.gd searches and what collision pushes against.
##
## Subclasses call tick_unit(delta) from their _process and override _die().

const Effects := preload("res://scripts/effects.gd")
const Bounds := preload("res://scripts/bounds.gd")

signal died(unit: Node2D)

const UnitLog := preload("res://scripts/play_log.gd")  # (subclasses have their own PlayLog)
const SkinArt := preload("res://scripts/skin.gd")
const TEAM_COLORS := [Color("#4f8ff7"), Color("#ef5350")]  # blue (you), red
## A hero that hits an enemy hero is marked this long; towers and creeps near
## the victim switch to the attacker (the Dota rule — don't dive for free).
const HERO_AGGRO := 2.0
## Your own creeps below this share of their health can be denied: attack
## them yourself and the killing blow pays nobody. Not in overtime (no_gold):
## nothing pays then, so there's no such thing as a deny.
const DENY_BELOW := 0.5

## Damage by target type (balancing dials). An ability hit carries a `hit`
## dictionary with its own multipliers (an ability's vs_heroes / vs_creeps /
## vs_structures in heroes.gd, else these defaults). Auto-attacks from heroes
## use ATTACK_VS_STRUCTURES against towers. Training dummies count as heroes.
const ABILITY_VS_HEROES := 1.0
const ABILITY_VS_CREEPS := 1.0
const ABILITY_VS_STRUCTURES := 0.5  # abilities half vs towers: bursts don't delete them; creeps and attacks do the work
const ATTACK_VS_STRUCTURES := 1.0
## Lifesteal heals its base share of damage dealt to creeps (and anything
## else), and this many times that share of damage dealt to heroes.
const LIFESTEAL_VS_HEROES := 2.0

var effects: Node2D
## 0 blue (your side), 1 red, -1 neutral (training dummies: everyone's enemy).
var team := 0
var radius := 30.0
var max_hp := 1000.0
var hp := 1000.0
## Hard obstacles (towers, dummies) never budge; soft bodies (heroes, creeps)
## shove each other apart, half each.
var solid := false
## Show a damage number for every hit, even from creeps and towers (your
## hero). Other units only show hits that aren't creep/tower chip damage.
var loud := false
## Gold for the hero that lands the killing blow (0 = none). Creeps and towers
## finishing it off earn nothing — that's last hitting.
var bounty := 0
## Overtime: kills pay no gold (creeps or heroes) — lane.gd sets it each frame.
## Gold lost on death still goes to the killer (hero.gd _die).
static var no_gold := false
## Overtime (lane.gd): abilities cost this much less mana and their cooldowns
## run this much shorter (0 outside overtime); haste_ult = the ultimate too.
static var ability_haste := 0.0
static var haste_ult := true
## Whatever dealt the killing blow (a hero, or null for creeps / towers).
var killed_by: Node2D = null

## Attack-speed slow: attacks take (1 + attack_slow) times as long while it lasts.
var attack_slow := 0.0
var _slow_left := 0.0
## Movement slow: moves at (1 - move_slow) speed while it lasts.
var move_slow := 0.0
var _move_slow_left := 0.0
## Bleed (standing in a CHAD's TRAP): that hero's auto-attacks hit this
## unit for +bleed_amt. Refreshed every frame while inside, so it ends on leaving.
var _bleed_by: Node2D = null
var _bleed_amt := 0.0
var _bleed_left := 0.0
var _zbleed_amt := 0.0   # TRAP's in-zone bleed, kept apart from Serrated's (a 2 s attack bleed
var _zbleed_left := 0.0  # mustn't carry TRAP's bigger bonus out of the zone)
## Standing in a hero's lingering zone (Blast, TRAP): refreshed every frame
## while inside, so combos can check it.
var _zone_by: Node2D = null
var _zone_left := 0.0
## Tether (CHAD's POUNCE): two units bound together, at most `tether_len`
## apart while it lasts. The owner's pull wins: when the owner walks away it
## drags the other along; the other can't get away from the owner. A dummy
## can't be dragged, so then the owner is the one held. `tether_owner` also
## draws the line.
var tether_to: Node2D = null
var tether_left := 0.0
var tether_len := 0.0
var tether_owner := false
## Burn (KYLE's Blast): touched by the fire, the unit burns — `burn_dps`
## damage a second, credited to whoever set it (kills pay them), for
## `_burn_left` s after it leaves the fire. Inside the fire the burn just
## refreshes (the zone itself does the damage there). Never stacks: a new burn
## refreshes it, keeping the stronger of the two.
var _burn_by: Node2D = null
var burn_dps := 0.0
var _burn_left := 0.0
var _burn_tick := 0.0
var _burn_len := 0.0  # the length the current burn was given (Kindling's spread copies it)
const BURN_TICK := 0.5
## Shield (KAREN's BRACE): absorbs damage before health, until used up or
## its time runs out. A new shield keeps the bigger amount and longer time.
var shield_hp := 0.0
var _shield_left := 0.0
var _shield_by: Node2D = null  # who gave it (Spite: shields send damage back)
## Hunter's Mark: an ability from `_mark_by` marked this hero; its next attack
## on it deals a share of the missing health.
var _mark_by: Node2D = null
var _mark_left := 0.0
const MARK_COLOR := Color(1.0, 0.35, 0.8)  # marked (Hunter's Mark): four ticks round the unit
static var _reflecting := false  # Spite: a reflected hit never reflects again
## Damage taken multiplier (KAREN's RAGE: 0.8 = takes 20% less).
var damage_taken_mult := 1.0
const SHIELD_COLOR := Color(0.78, 0.92, 1.0, 0.9)  # the shield bubble (shiny white-blue)
## Status cues: one colour per status, the same on the zone that applies it
## and on the unit that has it; rings round the unit, nested by distance
## (burn innermost, then bleed, slow, and the shield bubble outermost).
const BURN_COLOR := Color(1.0, 0.45, 0.1)   # burning: matches IGNITE's fire zone
const BLEED_COLOR := Color(0.9, 0.12, 0.15) # bleeding (TRAP: the caster's attacks hit harder)
const SLOW_COLOR := Color(0.7, 0.4, 1.0)    # slowed: violet (pale blue read as the shield)
const SHIELD_PER_PX := 20.0  # shield points per extra px of bubble thickness (max +8)
## Phasing (CHAD's POUNCE in flight): passes through every unit — nothing
## pushes it and it pushes nothing; only its own hit check stops it.
var phasing := false
## Exposed (SHOVE): takes `_expose` more damage from everything (0.1 = +10%,
## "-10% armor") for `_expose_left` s. The stronger one wins; a new one refreshes.
var _expose := 0.0
var _expose_left := 0.0
const EXPOSE_COLOR := Color(0.25, 0.85, 0.75)  # exposed: a teal ring
## Blinded (RUMOR): the next attack of its that LANDS misses — no damage, a
## "MISS" puff where it lands. A shot already in the air when it's blinded counts.
var miss_next := false
var _missed_volley := -1  # the round of attacks the blind landed on: its other shots miss too (Twin Shot)
const MISS_COLOR := Color(0.85, 0.87, 0.9)  # blinded: a dashed pale ring
## Stun: while it lasts the unit can't move, attack or cast.
var stun_left := 0.0

var _flash := 0.0
var _stack := 0.0  # recent hits: each new number starts higher so they don't overlap
var _since_hit := 99.0


func _enter_tree() -> void:
	add_to_group("units")


func tick_unit(delta: float) -> void:
	_since_hit += delta
	_slow_left = maxf(0.0, _slow_left - delta)
	stun_left = maxf(0.0, stun_left - delta)
	if _slow_left <= 0.0:
		attack_slow = 0.0
	_move_slow_left = maxf(0.0, _move_slow_left - delta)
	_bleed_left = maxf(0.0, _bleed_left - delta)
	_zbleed_left = maxf(0.0, _zbleed_left - delta)
	_zone_left = maxf(0.0, _zone_left - delta)
	_shield_left = maxf(0.0, _shield_left - delta)
	if _shield_left <= 0.0:
		shield_hp = 0.0
		_shield_by = null
	_mark_left = maxf(0.0, _mark_left - delta)
	_expose_left = maxf(0.0, _expose_left - delta)
	if _expose_left <= 0.0:
		_expose = 0.0
	if _burn_left > 0.0 and is_targetable():
		_burn_left -= delta
		var src: Node2D = _burn_by if is_instance_valid(_burn_by) else null
		if not in_zone_of(src):  # out of the fire: the burn does its own damage
			_burn_tick -= delta
			if _burn_tick <= 0.0:
				_burn_tick += BURN_TICK
				take_damage(burn_dps * BURN_TICK, Color("#ff8a50"), false, false, src)
		if _burn_left <= 0.0:
			burn_dps = 0.0
	tether_left = maxf(0.0, tether_left - delta)
	if tether_left > 0.0 and (not is_instance_valid(tether_to) or not tether_to.is_targetable() or not is_targetable()):
		tether_left = 0.0  # the other end died (or we did): the tether snaps
	if _move_slow_left <= 0.0:
		move_slow = 0.0
	_flash = maxf(0.0, _flash - delta * 6.0)
	_stack = maxf(0.0, _stack - delta * 1.5)  # a stacked slot frees after ~0.65 s


## Slow this unit's attacks by `amount` (0.4 = 40% longer between attacks) for `time` s.
func slow_attacks(amount: float, time: float) -> void:
	attack_slow = maxf(attack_slow, amount)
	_slow_left = maxf(_slow_left, time)


## Slow this unit's movement by `amount` (0.35 = 35% slower) for `time` s.
func slow_moves(amount: float, time: float) -> void:
	move_slow = maxf(move_slow, amount)
	_move_slow_left = maxf(_move_slow_left, time)


## Mark this unit as bleeding to `by`'s auto-attacks (+`amount`) for `time` s
## (TRAP refreshes a moment every frame; Serrated's attacks give 2 s). The two
## are tracked apart; the bigger one that's running counts.
func bleed(by: Node2D, amount: float, time := 0.15) -> void:
	if by != _bleed_by:
		_bleed_left = 0.0
		_zbleed_left = 0.0
	_bleed_by = by
	if time <= 0.5:  # TRAP's in-zone refresh
		_zbleed_amt = amount
		_zbleed_left = maxf(_zbleed_left, time)
	else:  # Serrated
		_bleed_amt = amount
		_bleed_left = maxf(_bleed_left, time)


## Bind this unit and `other` together for `time` s, at most `length` apart.
func tether_with(other: Node2D, time: float, length: float) -> void:
	for pair: Array in [[self, other, true], [other, self, false]]:
		var u: Node2D = pair[0]
		u.tether_to = pair[1]
		u.tether_left = time
		u.tether_len = length
		u.tether_owner = pair[2]


## Cut the tether at both ends.
func break_tether() -> void:
	if is_instance_valid(tether_to):
		tether_to.tether_left = 0.0
	tether_left = 0.0


func is_tethered() -> bool:
	return tether_left > 0.0 and is_instance_valid(tether_to)


## Keep within the tether (after all movement this frame): the owner drags a
## hero along; everyone else is held to the owner.
func _physics_process(_delta: float) -> void:
	if Bounds.active and (is_in_group("heroes") or is_in_group("creeps")):
		position = Bounds.clamp_point(position, radius)  # the lane map's edges
	if not is_tethered() or not is_in_group("heroes"):
		return
	var off := position - tether_to.position
	if off.length() <= tether_len:
		return
	if tether_owner and tether_to.is_in_group("heroes"):  # my pull wins: drag them along
		tether_to.position = position - off.normalized() * tether_len
		tether_to.push_out()
		if Bounds.active:
			tether_to.position = Bounds.clamp_point(tether_to.position, tether_to.radius)
	else:
		position = tether_to.position + off.normalized() * tether_len


## Set this unit burning (or keep it burning) for `time` s at `dps`, credited to `by`.
func burn(by: Node2D, dps: float, time: float) -> void:
	if _burn_left <= 0.0:
		_burn_tick = BURN_TICK
	_burn_by = by
	burn_dps = maxf(burn_dps, dps)
	_burn_left = maxf(_burn_left, time)
	_burn_len = maxf(_burn_len if _burn_left > time else 0.0, time)


## KYLE's attacks: `by`'s burn on this unit starts over at its full length.
func stoke_burn(by: Node2D) -> void:
	if _burn_left > 0.0 and by != null and _burn_by == by and is_targetable():
		_burn_left = maxf(_burn_left, _burn_len)


## SHOCK: `by`'s burn on this unit goes out.
func douse(by: Node2D) -> void:
	if by != null and _burn_by == by:
		_burn_left = 0.0
		burn_dps = 0.0


## Is this unit burning from `by`'s fire right now (inside it, or after)?
func is_burning_from(by: Node2D) -> bool:
	return _burn_left > 0.0 and by != null and _burn_by == by


## Give this unit a shield of `amount` for `time` s (from hero `by`, if any).
func add_shield(amount: float, time: float, by: Node2D = null) -> void:
	if shield_hp <= 0.0:
		_shield_by = null  # a fresh shield: only its own giver counts (Spite)
	shield_hp = maxf(shield_hp, amount)
	_shield_left = maxf(_shield_left, time)
	if by != null:
		_shield_by = by


## SHOVE: take `amount` more damage from everything for `time` s.
func expose(amount: float, time: float) -> void:
	_expose = maxf(_expose, amount)
	_expose_left = maxf(_expose_left, time)


## RUMOR: the next attack this unit makes misses.
func blind() -> void:
	miss_next = true


## Called as one of this unit's attacks lands on `on`: true (and the blind is
## spent) if it misses. `volley` = which round of attacks it belongs to — the
## whole round misses (both Twin Shot shots), not just the first to land.
func use_miss(on: Node2D, volley := -1) -> bool:
	if not miss_next and (volley < 0 or volley != _missed_volley):
		return false
	if miss_next:
		miss_next = false
		_missed_volley = volley
	var at: Vector2 = on.position + Vector2(0, -on.radius - 24.0) if is_instance_valid(on) else position
	effects.add_child(Effects.ShieldPuff.new(at, MISS_COLOR, "MISS"))
	return true


## Hunter's Mark: is this unit marked by `by` right now?
func marked_by(by: Node2D) -> bool:
	return _mark_left > 0.0 and by != null and _mark_by == by


func clear_mark() -> void:
	_mark_left = 0.0


func mark_zone(by: Node2D) -> void:
	_zone_by = by
	_zone_left = 0.15


## Is this unit standing in one of `by`'s lingering zones right now?
func in_zone_of(by: Node2D) -> bool:
	return _zone_left > 0.0 and by != null and _zone_by == by


## Extra auto-attack damage `by` deals this unit right now (0.2 = +20%).
func bleed_bonus(by: Node2D) -> float:
	if by == null or _bleed_by != by:
		return 0.0
	return maxf(_bleed_amt if _bleed_left > 0.0 else 0.0, _zbleed_amt if _zbleed_left > 0.0 else 0.0)


## Multiplier on this unit's movement speed.
func move_speed_mult() -> float:
	return 1.0 - move_slow


## Stun for `time` s; `by` = the hero it's credited to (its own stun, or its
## Tank Minion's) — Aftershock answers it.
func stun(time: float, by: Node2D = null) -> void:
	stun_left = maxf(stun_left, time)
	if by != null and is_instance_valid(by) and by.has_method("on_stunned") and by.team != team:
		by.on_stunned(self)


func is_stunned() -> bool:
	return stun_left > 0.0


## A spinning ring over a stunned unit — call from a subclass's _draw.
func draw_stun_mark() -> void:
	if shield_hp > 0.0:  # shielded: a blue bubble, its rim thicker the more it holds
		var rim := 2.0 + minf(shield_hp / SHIELD_PER_PX, 8.0)
		draw_circle(Vector2.ZERO, radius + 18.0, Color(SHIELD_COLOR, 0.15))
		draw_arc(Vector2.ZERO, radius + 18.0, 0.0, TAU, 40, SHIELD_COLOR, rim)
		draw_arc(Vector2.ZERO, radius + 18.0, PI * 1.1, PI * 1.4, 10, Color(1, 1, 1, 0.9), maxf(1.5, rim * 0.4))  # the shine
	if _burn_left > 0.0:  # burning: a still orange ring and a faint warm tint
		draw_circle(Vector2.ZERO, radius + 3.0, Color(BURN_COLOR, 0.15))
		draw_arc(Vector2.ZERO, radius + 3.0, 0.0, TAU, 32, Color(BURN_COLOR, 0.85), 2.5)
	if _bleed_left > 0.0 or _zbleed_left > 0.0:  # bleeding: a red ring
		draw_arc(Vector2.ZERO, radius + 7.0, 0.0, TAU, 32, Color(BLEED_COLOR, 0.85), 2.5)
	if move_slow > 0.0:  # slowed: a violet ring
		draw_arc(Vector2.ZERO, radius + 11.0, 0.0, TAU, 32, Color(SLOW_COLOR, 0.8), 3.0)
	if _expose_left > 0.0:  # exposed (SHOVE): a teal ring — takes more damage
		draw_arc(Vector2.ZERO, radius + 5.0, 0.0, TAU, 32, Color(EXPOSE_COLOR, 0.85), 2.0)
	if miss_next:  # blinded (RUMOR): a dashed pale ring — its next attack misses
		for i in 8:
			var a0 := i * TAU / 8.0
			draw_arc(Vector2.ZERO, radius + 15.0, a0, a0 + TAU / 16.0, 4, Color(MISS_COLOR, 0.9), 2.5)
	if _mark_left > 0.0:  # marked (Hunter's Mark): four short ticks pointing in
		for i in 4:
			var d := Vector2.from_angle(PI / 4.0 + i * TAU / 4.0)
			draw_line(d * (radius + 24.0), d * (radius + 14.0), Color(MARK_COLOR, 0.95), 3.0)
	if stun_left <= 0.0:
		return
	var y := -radius - 30.0
	var t := Time.get_ticks_msec() / 150.0
	draw_arc(Vector2(0, y), 12.0, t, t + TAU * 0.75, 24, Color("#fff176"), 3.0)
	for i in 3:
		draw_circle(Vector2(0, y) + Vector2.from_angle(t * 1.5 + i * TAU / 3.0) * 12.0, 3.0, Color("#fff176"))


## Multiplier on the time between this unit's attacks.
func attack_time_mult() -> float:
	return 1.0 + attack_slow


## Can a hero of `by_team` deny this unit right now?
func deniable_by(by_team: int) -> bool:
	return team == by_team and is_in_group("creeps") and is_targetable() and hp < max_hp * DENY_BELOW and bounty > 0 and not no_gold  # (a creep worth no gold, or overtime: nothing to deny)


func is_targetable() -> bool:
	return hp > 0.0


func is_enemy_of(other_team: int) -> bool:
	return team != other_team


## `quiet` skips the floating number — creeps and towers trading hits would
## otherwise bury the screen in them.
## The damage multiplier for a hit on this unit (see the dials above).
func hit_mult(source: Node2D, hit: Dictionary) -> float:
	var structure := is_in_group("towers")
	if not hit.is_empty():  # an ability
		if structure:
			return float(hit.get("structures", ABILITY_VS_STRUCTURES))
		if is_in_group("creeps"):
			return float(hit.get("creeps", ABILITY_VS_CREEPS))
		return float(hit.get("heroes", ABILITY_VS_HEROES))
	if structure and source != null and is_instance_valid(source) and source.is_in_group("heroes"):
		return ATTACK_VS_STRUCTURES  # a hero's auto-attack on a tower
	return 1.0


func take_damage(amount: float, colour: Color, big := false, quiet := false, source: Node2D = null, hit: Dictionary = {}) -> void:
	if not is_targetable():
		return
	amount *= hit_mult(source, hit) * damage_taken_mult * (1.0 + _expose)
	var by_hero: bool = source != null and is_instance_valid(source) and source.is_in_group("heroes")
	if by_hero and (move_slow > 0.0 or attack_slow > 0.0) and not is_in_group("towers"):  # Cold Read: slowed enemies take more from you
		amount *= 1.0 + source.mod("slowed_damage")
	if by_hero and not hit.is_empty() and is_in_group("heroes") and source.mod("hunters_mark") > 0.0:
		_mark_by = source  # Hunter's Mark: an ability marks the hero
		_mark_left = 4.0
	var dealt := minf(amount, maxf(0.0, hp) + shield_hp)  # what the hit really took: shield included, overkill not
	if shield_hp > 0.0:  # a shield soaks it first
		var soaked := minf(shield_hp, amount)
		shield_hp -= soaked
		amount -= soaked
		_spite(soaked, source)
	if source != null and is_instance_valid(source) and source.is_in_group("heroes") \
			and is_in_group("heroes") and source.team != team:
		source.hero_aggro = HERO_AGGRO
	hp -= amount
	if source != null and is_instance_valid(source) and source.has_method("on_dealt"):
		source.on_dealt(dealt, hit, self)
		# Executioner: a hero's hit finishes a creep left under its threshold
		if is_in_group("creeps") and hp > 0.0 and hp < max_hp * source.mod("execute"):
			hp = 0.0
	_since_hit = 0.0
	_flash = 1.0
	if not quiet:
		var lift := ceilf(_stack) * 26.0  # any number still rising pushes the next one up
		effects.add_child(Effects.DamageNumber.new(position + Vector2(randf_range(-18, 18), -radius - 10 - lift), int(amount), colour, big))
		_stack += 1.0
	if hp <= 0.0:
		hp = 0.0
		_spread_burn()
		killed_by = source if is_instance_valid(source) else null
		if is_in_group("creeps"):
			UnitLog.creep_died(team, killed_by, not hit.is_empty())
		if bounty > 0 and killed_by and killed_by.is_in_group("heroes"):
			if killed_by.team != team:
				killed_by.earn_gold(bounty, position, is_in_group("creeps"))
			elif is_in_group("creeps") and not no_gold:
				killed_by.on_deny(position, self)  # its own side's blow: denied, nobody is paid (overtime: just a death)
		_die()


func _die() -> void:
	died.emit(self)


## Death wipes what's on you: burns, bleeds, slows, blind, marks, stun, shield.
func clear_statuses() -> void:
	_burn_left = 0.0
	burn_dps = 0.0
	_bleed_left = 0.0
	_zbleed_left = 0.0
	_slow_left = 0.0
	attack_slow = 0.0
	_move_slow_left = 0.0
	move_slow = 0.0
	_expose_left = 0.0
	_expose = 0.0
	miss_next = false
	_missed_volley = -1
	_mark_left = 0.0
	_zone_left = 0.0
	stun_left = 0.0
	shield_hp = 0.0
	_shield_left = 0.0
	_shield_by = null


## Spite: a shield from (or on) a hero with Spite sends a share of what it
## soaked back at the creep or hero that hit it.
func _spite(soaked: float, source: Node2D) -> void:
	if _reflecting or soaked <= 0.0 or source == null or not is_instance_valid(source) or source == self:
		return
	if source.team == team or not source.is_targetable() or not (source.is_in_group("creeps") or source.is_in_group("heroes")):
		return
	var share := 0.0
	var credit: Node2D = null
	for h: Variant in [self if is_in_group("heroes") else null, _shield_by]:
		if h != null and is_instance_valid(h) and h.has_method("mod") and h.mod("spite") > share:
			share = h.mod("spite")
			credit = h
	if share <= 0.0:
		return
	_reflecting = true
	source.take_damage(soaked * share, SHIELD_COLOR, false, false, credit)
	_reflecting = false


## Kindling: a unit dying while burning sets one of its side's units within
## burn_spread of it on fire (the burner's burn, full length).
func _spread_burn() -> void:
	if _burn_left <= 0.0 or not is_instance_valid(_burn_by) or not _burn_by.has_method("mod"):
		return
	var reach: float = _burn_by.mod("burn_spread")
	if reach <= 0.0:
		return
	var best: Node2D = null
	for u: Node2D in get_tree().get_nodes_in_group("units"):
		if u == self or u.team != team or not u.is_targetable() or u.is_in_group("towers") or u.is_in_group("decoys") or u.get("_burn_left") > 0.0:
			continue
		if u.position.distance_to(position) <= reach + u.radius and (best == null or u.position.distance_to(position) < best.position.distance_to(position)):
			best = u
	if best:
		best.burn(_burn_by, burn_dps, maxf(_burn_len, 2.0 + _burn_by.mod("burn_time")))
		effects.add_child(Effects.Zap.new(position, best.position, BURN_COLOR))


## Collision: step out of every live unit this one overlaps. Solid ones push
## us all the way out; soft ones only half (they push themselves the other
## half). Returns the last unit pushed against (null when clear).
func push_out() -> Node2D:
	var blocker: Node2D = null
	if phasing:
		return null
	for u: Node2D in get_tree().get_nodes_in_group("units"):
		if u == self or not u.is_targetable() or u.phasing:
			continue
		var share: float = 1.0 if u.solid else 0.5  # soft bodies each step half of the way out
		if u.team == team and u.is_in_group("creeps") and is_in_group("heroes"):
			continue  # your own creeps never push you: you walk through your wave…
		if u.team == team and u.is_in_group("heroes") and is_in_group("creeps"):
			share = 1.0  # …and they step all the way aside for you (enemy creeps still block)
		if u.team != team and float(u.get("rage_left") if u.is_in_group("heroes") else 0.0) > 0.0:
			share = 1.0  # a RAGING enemy bodies you: you take all of the shove
		if team != u.team and float(get("rage_left") if is_in_group("heroes") else 0.0) > 0.0 and not u.solid:
			continue  # …and nothing soft of theirs shoves the raging hero
		var away := position - u.position
		var gap: float = radius + u.radius
		var d := away.length()
		if d < gap:
			var dir := away / d if d > 0.01 else Vector2.from_angle(randf() * TAU)
			position += dir * (gap - d) * share
			blocker = u
	return blocker


func draw_health_bar(width: float, fill: Color, thickness := 8.0) -> void:
	var r := Rect2(Vector2(-width / 2.0, -radius - 12.0 - thickness), Vector2(width, thickness))
	draw_rect(r.grow(1.5), Color("#1b1b1b"))
	draw_rect(Rect2(r.position, Vector2(width * hp / max_hp, r.size.y)), fill)
