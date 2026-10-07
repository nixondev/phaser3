extends "res://scripts/unit.gd"
## A lane tower: solid, lots of health, shoots the nearest enemy in RANGE.
## The rule, checked every shot:
##
##   1. an enemy hero in range who hit one of its heroes — at once, and the
##      tower stays locked on that hero until it leaves range
##   2. otherwise an enemy creep: keeps its current creep until it dies or
##      leaves range, then the nearest
##   3. only with no creep in range, an enemy hero
##
## So walk in behind your wave and it's busy with the creeps; walk in alone,
## or hit its hero under it, and it's you — until the aggro wears off and a
## creep is there to go back to.
## When an enemy hero is near, its range ring shows — red while it's aiming
## at you. At 0 HP it collapses into rubble (no longer solid) and emits died.
##
## Shield (backdoor protection): heroes — their attacks, abilities, burns —
## can only damage it while at least one of their creeps (leashed ones count)
## is inside its range circle. Creeps can always hit it, and siege minions. The
## shield stays up in overtime too (lane.gd OVERTIME shield_drops sets `doors_open`). A shielded tower shows a
## shield plate, and blocked hero hits puff "SHIELDED".

const RADIUS := 56.0
const MAX_HP := 3000.0
const RANGE := 650.0        # centre to the target's edge
const DAMAGE := 110.0
const INTERVAL := 1.1
const GOLD := 250            # to the hero that lands the killing blow
const RING_WARN := 260.0    # show the ring when an enemy hero is this far outside it

var target: Node2D = null
var damage := DAMAGE  # lane.gd scales red's per round
## Against creeps only: × this (lane.gd sets it to the round's lane growth, the
## same factor creep health grows by). Heroes don't grow with the round, so
## shots at them stay at `damage`.
var creep_damage_mult := 1.0
var _locked: Node2D = null  # a hero that hit one of ours in range: shot until it leaves range
## Damage taken multiplier — lane.gd raises it during overtime.
var vulnerability := 1.0
## Overtime: the shield is down for the rest of the round (lane.gd sets it).
var doors_open := false
var _puff_cd := 0.0
var _cd := 0.0
var _recoil := 0.0


func _init(team_: int, at: Vector2) -> void:
	team = team_
	position = at
	radius = RADIUS
	max_hp = MAX_HP
	hp = MAX_HP
	solid = true
	bounty = GOLD


func _ready() -> void:
	add_to_group("towers")


func _process(delta: float) -> void:
	tick_unit(delta)
	queue_redraw()
	if not is_targetable():
		return
	_cd = maxf(0.0, _cd - delta)
	_recoil = maxf(0.0, _recoil - delta * 4.0)
	_puff_cd = maxf(0.0, _puff_cd - delta)
	if is_stunned():
		return
	var aggressor := _aggressor()
	if aggressor:
		_locked = aggressor
	if _locked != null and (not _in_range(_locked) or _locked.hidden_by_decoy()):
		_locked = null  # it left the circle (or died, or left a decoy): back to the usual rules
	if _locked != null:
		target = _locked
	elif not _in_range(target) or target.is_in_group("heroes") or target.is_in_group("decoys"):
		target = _pick_target()  # heroes are only a fallback: re-check every frame
	if target and _cd <= 0.0:
		_cd = INTERVAL * attack_time_mult()
		_recoil = 1.0
		var dir := (target.position - position).normalized()
		var dmg: float = damage * (creep_damage_mult if target.is_in_group("creeps") else 1.0)
		effects.add_child(Effects.AttackShot.new(position + dir * 30.0 + Vector2(0, -34), target, dmg,
			TEAM_COLORS[team].lightened(0.5), not target.loud, 11.0, self))


func _in_range(u: Variant) -> bool:  # untyped: `u` may already be freed
	return is_instance_valid(u) and u.is_targetable() \
		and position.distance_to(u.position) - u.radius <= RANGE


## An enemy hero in range that just hit one of our heroes, or null.
func _aggressor() -> Node2D:
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		if h.team != team and h.hero_aggro > 0.0 and _in_range(h) and not h.hidden_by_decoy():
			return h
	return null


## Nearest enemy creep in range; failing that, the nearest enemy hero.
func _pick_target() -> Node2D:
	var best: Node2D = null
	var best_hero := true
	for u: Node2D in get_tree().get_nodes_in_group("units"):
		if u.team == team or u.team < 0 or not _in_range(u) or u.is_in_group("towers"):
			continue
		if u.is_in_group("heroes") and u.hidden_by_decoy():
			continue  # Afterimage: lost track of it
		var is_hero: bool = u.is_in_group("heroes") or u.is_in_group("decoys")
		if best == null or (best_hero and not is_hero) \
				or (is_hero == best_hero and position.distance_to(u.position) < position.distance_to(best.position)):
			best = u
			best_hero = is_hero
	return best


func take_damage(amount: float, colour: Color, big := false, quiet := false, source: Node2D = null, hit: Dictionary = {}) -> void:
	if source != null and is_instance_valid(source) and source.is_in_group("heroes") and shielded_from(source.team):
		if _puff_cd <= 0.0:  # blocked: say why (not every hit — a puff at most every 0.35 s)
			_puff_cd = 0.35
			effects.add_child(Effects.ShieldPuff.new(position + Vector2(randf_range(-20, 20), -RADIUS - 24.0), TEAM_COLORS[team]))
		return
	super(amount * vulnerability, colour, big, quiet, source, hit)


## Is this tower shielded against heroes of `attacker_team`? Yes unless one of
## that team's creeps is inside its range circle (or doors_open: see lane.gd).
func shielded_from(attacker_team: int) -> bool:
	if doors_open or not is_targetable() or attacker_team == team:
		return false
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == attacker_team and c.is_targetable() and position.distance_to(c.position) <= RANGE + c.radius:
			return false
	return true


func _die() -> void:
	solid = false
	target = null
	effects.add_child(Effects.Ghost.new(position, RADIUS * 2.5, TEAM_COLORS[team].lightened(0.3)))
	super()


func _draw() -> void:
	var c: Color = TEAM_COLORS[team]
	if not is_targetable():  # rubble
		draw_circle(Vector2(3, 6), RADIUS * 0.9, Color(0, 0, 0, 0.3))
		for i in 7:
			var a := i * TAU / 7.0 + 0.4
			draw_circle(Vector2.from_angle(a) * RADIUS * 0.5, RADIUS * 0.32, c.darkened(0.7 - 0.05 * (i % 3)))
		return
	_draw_range_ring(c)
	# base plate, then the turret on top
	var base := PackedVector2Array()
	for i in 8:
		base.append(Vector2.from_angle(i * TAU / 8.0 + TAU / 16.0) * RADIUS)
	var shadow := PackedVector2Array()
	for p in base:
		shadow.append(p + Vector2(4, 7))
	draw_colored_polygon(shadow, Color(0, 0, 0, 0.35))
	draw_colored_polygon(base, Color("#37474f").lerp(Color.WHITE, _flash * 0.4))
	base.append(base[0])
	draw_polyline(base, c.darkened(0.3), 4.0)
	var top := Vector2(0, -30.0 + _recoil * 4.0)
	draw_circle(Vector2(0, -6), RADIUS * 0.62, Color("#263238"))
	draw_circle(top, RADIUS * 0.5, c.lerp(Color.WHITE, _flash * 0.5))
	draw_arc(top, RADIUS * 0.5, 0.0, TAU, 40, c.darkened(0.5), 3.0)
	draw_circle(top, RADIUS * 0.2, c.lightened(0.6))  # the crystal
	draw_health_bar(130.0, c.lightened(0.1), 10.0)
	var lane := get_parent()
	if lane and lane.has_method("siege_incoming"):  # siege minions on the way here (overtime deaths)
		var n: int = lane.siege_incoming(team)
		if n > 0:
			var y := -radius - 34.0
			draw_string_outline(ThemeDB.fallback_font, Vector2(-90, y), "SIEGE INCOMING ×%d" % n, HORIZONTAL_ALIGNMENT_CENTER, 180, 15, 5, Color(0, 0, 0, 0.8))
			draw_string(ThemeDB.fallback_font, Vector2(-90, y), "SIEGE INCOMING ×%d" % n, HORIZONTAL_ALIGNMENT_CENTER, 180, 15, Color("#ffb74d"))
	if shielded_from(1 - team):  # the shield: a glowing plate round the tower while enemy heroes can't hurt it
		var pulse := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 260.0)
		var plate := PackedVector2Array()
		for i in 7:
			plate.append(Vector2.from_angle(i * TAU / 6.0 + TAU / 12.0) * (RADIUS + 16.0))
		draw_colored_polygon(plate, Color(c.lightened(0.4), 0.10 + 0.05 * pulse))
		draw_polyline(plate, Color(c.lightened(0.5), 0.55 + 0.25 * pulse), 3.0)
	if vulnerability > 1.0:  # overtime: cracks in the plate
		var crack := Color(1, 0.45, 0.3, clampf((vulnerability - 1.0) * 0.8, 0.2, 0.9))
		draw_polyline(PackedVector2Array([Vector2(-30, 10), Vector2(-12, 22), Vector2(-18, 38)]), crack, 3.0)
		draw_polyline(PackedVector2Array([Vector2(26, 6), Vector2(14, 24), Vector2(30, 40)]), crack, 3.0)


func _draw_range_ring(c: Color) -> void:
	var hero: Node2D = null  # your hero — the ring is a warning for you
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		if not h.is_bot:
			hero = h
	if hero == null or hero.team == team or not hero.is_targetable():
		return
	var outside := position.distance_to(hero.position) - RANGE
	if outside > RING_WARN:
		return
	var alpha := clampf(1.0 - outside / RING_WARN, 0.25, 1.0)
	var col := Color("#ff5252") if target == hero else c
	draw_circle(Vector2.ZERO, RANGE, Color(col, 0.05 * alpha))
	draw_arc(Vector2.ZERO, RANGE, 0.0, TAU, 128, Color(col, 0.55 * alpha), 3.0)
