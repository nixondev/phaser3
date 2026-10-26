extends "res://scripts/unit.gd"
## A power-up capsule (IDEAS.md "Power-up drops"). A creep a hero last-hits
## drops one where it died by chance — DROP_CHANCE before overtime,
## DROP_CHANCE_OVERTIME after, in Training too: a
## gold football-shaped pod rimmed in its owner's colour, the power's letter in its window. Break it to
## open it — whoever lands the breaking blow decides: its owner gets the power
## (hero.gd gain_power), the other hero just destroys it. Like a creep you can
## deny: the other hero can't touch it until it's below CAPSULE_DENY_BELOW of its health
## (so it's the owner who starts it, and can bank it untouched) — except while
## its owner is dead: then it's open to the other hero at any health, and shows
## on their minimap (ability_bar.gd), until the owner is back. Nobody else
## touches it: creeps and towers pass it by (team -1). It never fades.
##
## Its owner can leash it like a creep (T, hero.gd toggle_leash,
## CAPSULE_LEASH_COST points): it floats after them at CAPSULE_DRAG_SPEED, a
## touch slower than a hero walks — and while leashed it's open to the other
## hero at ANY health. Dragging it is the risk; parking it is the safety.
##
## "bullet" (shown as SHELL) isn't a timed power: opening it sends a Shell
## (bullet_minion.gd). Its window shows a little blue cartridge, not a letter.
##
## MODE picks how it breaks (both kept so they can be tried):
##   "hits"    HITS pips; each hero attack takes one whatever its damage;
##             abilities, burns and bleeds don't count (a last-hit race)
##   "health"  HEALTH points; hurt by anything that can hit it — the owner's
##             attacks and abilities any time, the other hero's only below
##             CAPSULE_DENY_BELOW (creeps and towers still ignore it)

const PlayLog := preload("res://scripts/play_log.gd")
const BulletScript := preload("res://scripts/bullet_minion.gd")

const MODE := "health"
const HITS := 3
const HEALTH := 300.0
const CAPSULE_DENY_BELOW := 0.5  # the other hero can hit it only below this share of its health
const CAPSULE_LEASH_COST := 2    # leash points to drag it (a ranged creep's price)
const CAPSULE_DRAG_SPEED := 300.0  # how fast it floats after its hero (a hero walks 360)
## Odds a last hit of ANY creep drops one. Ranged-only (at 0.10 / 0.33) gave
## red almost nothing: ranged creeps walk at the back of a wave, red is the
## pushed-back side in nearly every round, and it claimed 13% of them against
## the player's 60% — 16 capsules to 2 over the run of 2026-10-24. The filter
## punished whoever was losing the push and then withheld the power-ups that
## might turn it around. These odds are set so the player's supply is
## unchanged (~1.9 a round) while red's roughly doubles.
const DROP_CHANCE := 0.04          # odds a last hit drops one before overtime
const DROP_CHANCE_OVERTIME := 0.14  # … and in overtime
const POWERS := ["twin", "rampage", "pierce", "bullet", "shield"]  # (spread left the drops 2026-10-20: TWIN replaced it)
const LETTER := {"twin": "T", "shield": "S", "spread": "S", "rampage": "R", "pierce": "P", "bullet": "B"}  # (bullet draws a shell instead)
## One colour per power, on the capsule and on the hero who has it (hero.gd).
const POWER_COLOR := {"twin": Color("#c6ff00"), "shield": Color("#1de9b6"), "spread": Color("#c6ff00"), "rampage": Color("#ffab00"), "pierce": Color("#b388ff"), "bullet": Color("#29b6f6")}

var owner_team := 0
var owner_hero: Node2D = null  # who it dropped for (hero.gd on_creep_last_hit)
var leader: Node2D = null      # leashed: the hero it floats after (hero.gd toggle_leash)
var leash_slot := 0
var power := "spread"
var _t := 0.0
var _rise := 0.0
var _done := false


func _init(owner: int, at: Vector2, kind: String) -> void:
	owner_team = owner
	power = kind
	team = -1  # nobody's unit: creeps and towers pass it by
	phasing = true  # pushes nothing, nothing pushes it
	position = at
	radius = 22.0
	max_hp = float(HITS) if MODE == "hits" else HEALTH
	hp = max_hp


func _ready() -> void:
	add_to_group("capsules")


## Seconds since it dropped (red banks by this; the logs carry it as `age`).
func age() -> float:
	return _t


## Leash points to drag it (hero.gd toggle_leash / leash_used).
func leash_cost() -> int:
	return CAPSULE_LEASH_COST


## "health": the owner's attacks and abilities find it any time, the other
## hero's only below CAPSULE_DENY_BELOW. "hits": only a hero's deliberate attack does
## (hero.gd order_attack).
func is_enemy_of(other_team: int) -> bool:
	return MODE == "health" and breakable_by(other_team)


## Can a hero of `t` hit it right now? Its owner always; the other side only
## once it's below CAPSULE_DENY_BELOW (health mode) — the deny window — or
## while its owner is dead, or while it's being dragged (leashed).
func breakable_by(t: int) -> bool:
	if t < 0:
		return false
	return t == owner_team or MODE != "health" or hp < max_hp * CAPSULE_DENY_BELOW or owner_down() \
			or leader != null


## Its owner is dead (respawning): no protection, and the other side's map shows it.
func owner_down() -> bool:
	return owner_hero != null and is_instance_valid(owner_hero) and not owner_hero.is_targetable()


func take_damage(amount: float, colour: Color, big := false, quiet := false, source: Node2D = null, hit: Dictionary = {}) -> void:
	if _done or not is_targetable():
		return
	var by: Node2D = source if source != null and is_instance_valid(source) else null
	if by == null or not by.is_in_group("heroes") or not breakable_by(by.team):
		return
	if MODE == "hits":
		if not hit.is_empty():
			return  # abilities don't open it: attacks only
		hp -= 1.0
	else:
		hp -= amount
		if not quiet:
			effects.add_child(Effects.DamageNumber.new(position + Vector2(randf_range(-14, 14), -radius - 12), int(amount), colour, big))
	_flash = 1.0
	if hp <= 0.0:
		hp = 0.0
		_open(by)


## Burns and bleeds only count when anything may hurt it.
func burn(by: Node2D, dps: float, time: float) -> void:
	if MODE == "health":
		super(by, dps, time)


func stoke_burn(by: Node2D) -> void:
	if MODE == "health":
		super(by)


func bleed(by: Node2D, amount: float, time := 0.15) -> void:
	if MODE == "health":
		super(by, amount, time)


func _open(by: Node2D) -> void:
	_done = true
	var col: Color = POWER_COLOR[power]
	if by.team == owner_team and power == "bullet":  # not a timed power: a Shell (bullet_minion.gd) sets off for the enemy hero
		var b: Node2D = BulletScript.new(by, position)
		b.effects = effects
		get_parent().add_child.call_deferred(b)
		effects.add_child(Effects.ShieldPuff.new(position + Vector2(0, -40), col, "SHELL"))
	elif by.team == owner_team:
		by.gain_power(power)
		effects.add_child(Effects.ShieldPuff.new(position + Vector2(0, -40), col, power.to_upper()))
	else:
		effects.add_child(Effects.ShieldPuff.new(position + Vector2(0, -40), Color(0.8, 0.8, 0.8), "DENIED"))
	PlayLog.event("capsule_open" if by.team == owner_team else "capsule_denied",
		{"power": power, "owner": "you" if owner_team == 0 else "red", "owner_dead": owner_down(), "age": snappedf(_t, 0.1)})
	died.emit(self)
	queue_free()


func _process(delta: float) -> void:
	tick_unit(delta)
	_t += delta
	_rise = minf(1.0, _rise + delta * 4.0)
	if leader != null:
		if not is_instance_valid(leader) or not leader.is_targetable():
			leader = null  # its hero died or let go: the capsule parks where it is
		else:
			_drag(delta)
	queue_redraw()


## Leashed: float after the hero like a leashed creep, but slower than they
## walk — a long run leaves it trailing behind.
func _drag(delta: float) -> void:
	var side: Vector2 = leader.facing.orthogonal() * (45.0 * (leash_slot - 0.5))
	var dest: Vector2 = leader.position - leader.facing * 80.0 + side
	if position.distance_to(dest) > 12.0:
		position += (dest - position).limit_length(CAPSULE_DRAG_SPEED * delta)


func _draw() -> void:
	var a := _rise
	var col: Color = TEAM_COLORS[owner_team]
	var pc: Color = POWER_COLOR[power]
	var bob := Vector2(0, sin(_t * 3.0) * 3.0)
	if leader != null and is_instance_valid(leader):  # the leash: a faint line to its hero
		draw_line(Vector2.ZERO, leader.position - position, Color(col.lightened(0.4), 0.35 * a), 2.0)
	# a soft glow in the power's colour, and a shadow on the ground
	draw_circle(Vector2.ZERO, radius * 1.6, Color(pc, 0.12 * a))
	draw_set_transform(Vector2(0, radius * 0.75), 0.0, Vector2(1.0, 0.35))
	draw_circle(Vector2.ZERO, radius * 0.9, Color(0, 0, 0, 0.3 * a))
	draw_set_transform(Vector2.ZERO)
	# the pod: a gold, football-shaped capsule (shooter-style, not a ball), tilted,
	# rimmed in its owner's colour, a dark window showing what's inside
	var gold := Color("#e6b422")
	var tilt := -0.35 + sin(_t * 1.7) * 0.08
	var hw := radius * 1.3
	var hh := radius * 0.72
	var along := Vector2.RIGHT.rotated(tilt)
	var across := along.orthogonal()
	var body := PackedVector2Array()
	for i in 32:
		var u := TAU * i / 32.0
		var x := cos(u)
		var y := sin(u) * (1.0 - 0.45 * x * x)  # pinched toward the tips
		body.append(bob + along * x * hw + across * y * hh)
	draw_colored_polygon(body, Color(gold.darkened(0.25), a))
	var top := PackedVector2Array()  # the lit upper half: brighter gold
	for i in 17:
		var u := PI + PI * i / 16.0
		var x := cos(u)
		top.append(bob + along * x * hw * 0.92 + across * sin(u) * (1.0 - 0.45 * x * x) * hh * 0.85)
	draw_colored_polygon(top, Color(gold, a))
	draw_line(bob - along * hw * 0.45 - across * hh * 0.55, bob + along * hw * 0.2 - across * hh * 0.62, Color(1, 0.97, 0.8, 0.8 * a), 2.5)  # the shine
	for k in [-0.86, 0.86]:  # rivet caps at the tips
		draw_circle(bob + along * hw * k, 3.5, Color(gold.darkened(0.45), a))
	var rim := body.duplicate()
	rim.append(body[0])
	draw_polyline(rim, Color(col, a), 3.0)  # whose it is
	if _flash > 0.0:
		draw_colored_polygon(body, Color(1, 1, 1, 0.45 * _flash))
	draw_circle(bob, hh * 0.62, Color(0.08, 0.08, 0.1, 0.9 * a))  # the window
	draw_arc(bob, hh * 0.62, 0.0, TAU, 24, Color(pc, a), 2.0)
	if power == "bullet":  # a little blue cartridge, nose up and to the right
		var dl := Vector2(1, -1).normalized()
		var dc := dl.orthogonal()
		var bl := hh * 0.5
		var bw := hh * 0.26
		draw_colored_polygon(PackedVector2Array([bob - dl * bl + dc * bw, bob + dl * bl * 0.2 + dc * bw,
			bob + dl * bl * 0.2 - dc * bw, bob - dl * bl - dc * bw]), Color(pc, a))
		draw_circle(bob + dl * bl * 0.25, bw, Color(pc.lightened(0.45), a))
		draw_line(bob + dl * bl * 0.2 + dc * bw, bob + dl * bl * 0.2 - dc * bw, Color(1, 1, 1, a), 1.5)
	else:
		_draw_letter(bob, pc, a)
	_draw_bar(pc, a)


## The power's letter in the window.
func _draw_letter(bob: Vector2, pc: Color, a: float) -> void:
	var font := ThemeDB.fallback_font
	var at := bob + Vector2(-20, 7)
	draw_string_outline(font, at, LETTER[power], HORIZONTAL_ALIGNMENT_CENTER, 40, 20, 4, Color(0, 0, 0, 0.85 * a))
	draw_string(font, at, LETTER[power], HORIZONTAL_ALIGNMENT_CENTER, 40, 20, Color(pc.lightened(0.4), a))


func _draw_bar(pc: Color, a: float) -> void:
	# how much is left: pips (hits) or a bar (health)
	var y0 := -radius - 14.0
	if MODE == "hits":
		for i in HITS:
			var p := Vector2((i - (HITS - 1) / 2.0) * 13.0, y0)
			draw_circle(p, 4.5, Color(0, 0, 0, 0.6 * a))
			if i < int(hp):
				draw_circle(p, 3.5, Color(pc, a))
	else:
		var w := 40.0
		draw_rect(Rect2(Vector2(-w / 2.0, y0 - 3.0), Vector2(w, 6.0)), Color(0, 0, 0, 0.6 * a))
		draw_rect(Rect2(Vector2(-w / 2.0, y0 - 3.0), Vector2(w * hp / max_hp, 6.0)), Color(pc, a))
		if leader == null:  # the deny line: below it the other hero can break it (leashed, it's open anywhere — no line)
			var nx := -w / 2.0 + w * CAPSULE_DENY_BELOW
			draw_line(Vector2(nx, y0 - 5.0), Vector2(nx, y0 + 5.0), Color(1, 1, 1, 0.9 * a), 2.0)
