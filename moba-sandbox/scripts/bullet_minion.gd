extends "res://scripts/unit.gd"
## A SHELL (the "bullet" power-up, power_capsule.gd — a bullet-shaped minion in
## Mario's blue-shell blue; "shell" is a word for a bullet too. Code, logs and
## files keep "bullet"): a minion with one thought. It
## walks straight at the enemy hero, through everything — creeps, towers and
## the lane don't exist for it, and nothing but heroes notice it (it isn't a
## creep: creeps and towers never target it). On contact it takes DAMAGE_SHARE
## of that hero's max health (shields and armor still count), stuns them for
## STUN s (D blocks the stun) and is spent.
## It's sturdy for a minion but killable: heroes' attacks and abilities hurt
## it, and slows and stuns hold it. While its hero is dead it waits where it
## is, then carries on. It doesn't survive the enemy's well: the moment it's
## inside, it burns up (so hiding at home does save you).

const PlayLog := preload("res://scripts/play_log.gd")
const Lane := preload("res://scripts/lane.gd")

const HP := 600.0
const SPEED := 300.0          # just under every hero: you can walk away, not forever
const DAMAGE_SHARE := 0.5     # of the target hero's max health
const STUN := 2.0             # s, on contact
const SHELL_BLUE := Color("#29b6f6")   # sky blue: a different hue from your team blue (#4f8ff7)
const SHELL_LIGHT := Color("#b3e5fc")

var owner_hero: Node2D = null  # who it fights for (kills and damage are credited to them)
var target: Node2D = null      # the enemy hero
var _t := 0.0
var _facing := Vector2.RIGHT


func _init(by: Node2D, at: Vector2) -> void:
	owner_hero = by
	team = by.team
	position = at
	radius = 20.0
	max_hp = HP
	hp = HP
	phasing = true  # one track mind: it pushes nothing and nothing pushes it


func _ready() -> void:
	add_to_group("bullets")
	z_index = 6
	_facing = Vector2.RIGHT if team == 0 else Vector2.LEFT


func _process(delta: float) -> void:
	tick_unit(delta)
	_t += delta
	if not is_targetable():
		return
	if not is_instance_valid(target):
		target = _find_target()
	if Lane.in_well(position, 1 - team):  # the enemy's well burns it up
		_fizzle()
		return
	if target == null or not target.is_targetable() or is_stunned():
		queue_redraw()
		return  # its hero is dead: it waits
	var to: Vector2 = target.position - position
	var step := SPEED * move_speed_mult() * delta
	if to.length() <= target.radius + radius + step:
		_hit()
		return
	_facing = to.normalized()
	position += _facing * step
	queue_redraw()


func _find_target() -> Node2D:
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		if h.team != team and not h.is_in_group("decoys"):
			return h
	var best: Node2D = null  # Training: no enemy hero, so the nearest dummy
	for d: Node2D in get_tree().get_nodes_in_group("dummies"):
		if d.is_targetable() and (best == null or position.distance_to(d.position) < position.distance_to(best.position)):
			best = d
	return best


func _hit() -> void:
	var by: Node2D = owner_hero if is_instance_valid(owner_hero) else null
	target.take_damage(target.max_hp * DAMAGE_SHARE, SHELL_LIGHT, true, false, by)
	if is_instance_valid(target) and target.is_targetable():
		target.stun(STUN, by)
	effects.add_child(Effects.Ghost.new(position, 110.0, SHELL_BLUE))
	effects.add_child(Effects.Ghost.new(position, 70.0, Color.WHITE))
	effects.add_child(Effects.Ghost.new(position, 40.0, TEAM_COLORS[team]))
	PlayLog.event("bullet_hit" if team == 0 else "red_bullet_hit", {})
	hp = 0.0
	died.emit(self)
	queue_free()


func _fizzle() -> void:
	effects.add_child(Effects.Ghost.new(position, 50.0, TEAM_COLORS[1 - team]))
	PlayLog.event("bullet_fizzled" if team == 0 else "red_bullet_fizzled", {})
	hp = 0.0
	died.emit(self)
	queue_free()


func _die() -> void:
	PlayLog.event("bullet_killed" if team == 0 else "red_bullet_killed", {})
	died.emit(self)
	queue_free()


func _draw() -> void:
	var c: Color = TEAM_COLORS[team]
	var pulse := 0.5 + 0.5 * sin(_t * 6.0)
	draw_circle(Vector2.ZERO, radius + 10.0 + 3.0 * pulse, Color(c, 0.15))  # a glow in its side's colour: it's coming for someone
	var along := _facing
	var across := along.orthogonal()
	var hl := radius * 1.1   # half its length
	var hw := radius * 0.62  # half its width
	# a cartridge in shell blue: a straight body, a rounded lighter nose toward its target
	var body := PackedVector2Array([-along * hl + across * hw, along * hl * 0.25 + across * hw,
		along * hl * 0.25 - across * hw, -along * hl - across * hw])
	draw_colored_polygon(body, SHELL_BLUE)
	var nose := PackedVector2Array()
	for i in 13:
		var u := -PI / 2.0 + PI * i / 12.0
		nose.append(along * hl * 0.25 + (along * cos(u) * hl * 0.85 + across * sin(u) * hw))
	draw_colored_polygon(nose, SHELL_LIGHT)
	draw_line(along * hl * 0.25 + across * hw, along * hl * 0.25 - across * hw, Color.WHITE, 3.0)  # a white band where the nose meets the body
	draw_line(-along * hl * 0.7 + across * hw, -along * hl * 0.7 - across * hw, Color.WHITE, 3.0)  # the rim
	draw_line(-along * hl * 0.45 + across * hw * 0.55, along * hl * 0.1 + across * hw * 0.55, Color(1, 1, 1, 0.5), 2.0)  # the shine
	var rim := body.duplicate()
	rim.append(body[0])
	draw_polyline(rim, c, 2.0)  # outlined in its side's colour
	if _flash > 0.0:
		draw_circle(Vector2.ZERO, radius, Color(1, 1, 1, 0.45 * _flash))
	draw_health_bar(40.0, c, 6.0)
	draw_stun_mark()
