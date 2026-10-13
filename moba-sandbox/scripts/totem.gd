extends "res://scripts/unit.gd"
## The totem (IDEAS.md "The shape camp — sieging by proxy"). From round
## lane.gd TOTEM_FROM each side gets one on its own half, well off the lane.
## Lead one of your creeps (T) into its ring and it LATCHES: it leaves your
## leash (the points are free again) and attacks the totem and nothing else
## until it dies or the totem does. Only its own side's latched creeps can hurt
## it — no hero, ability or other creep can touch it — and it wears each of
## them down (a creep lasts ~LATCH_LIFE s on it). Its ring fills like a power
## meter as it's hurt (both sides see it); destroying it pays its `reward`
## (lane.gd TOTEM_REWARD / totem_reward_for — 1 siege minion today; the reward
## is data, so it can be swapped for another type), and a new one rises later.

const RADIUS := 44.0
const MAX_HP := 3000.0     # 2 latched melee creeps (21 damage a second each) get ~63% before it wears them down: two trips at least
const LATCH := 110.0       # px past its edge: a creep you lead this close latches on
const LATCH_LIFE := 45.0   # s a creep lasts on it (it takes 1/45 of its max health a second; was 80 — one 2-creep trip destroyed it)
const CHIP_EVERY := 0.5
const SHAPES := ["circle", "triangle", "square", "hexagon"]  # the pole: one of each hero's shape

var owner_team := 0        # whose side it's on (only that side's creeps latch and hurt it)
var reward := {}           # what destroying it pays: {"kind": ..., + that kind's fields} (lane.gd TOTEM_REWARDS)
var _chip := 0.0
var _rise := 0.0           # 0 → 1 as it appears
var _glow_t := 0.0         # drives the glow's slow pulse


func _init(owner: int, at: Vector2) -> void:
	owner_team = owner
	team = -1  # nobody's unit: lane creeps, towers, heroes and abilities all pass it by
	solid = true  # creeps on it stand round it instead of jostling into it
	position = at
	radius = RADIUS
	max_hp = MAX_HP
	hp = MAX_HP


func _ready() -> void:
	add_to_group("totems")


## Nobody targets it (attacks, abilities, Targets.*): only latched creeps hit it.
func is_enemy_of(_other_team: int) -> bool:
	return false


func take_damage(amount: float, colour: Color, big := false, quiet := false, source: Node2D = null, hit: Dictionary = {}) -> void:
	if source == null or not is_instance_valid(source) or not source.is_in_group("creeps") or source.team != owner_team:
		return
	super(amount, colour, big, true, source, hit)


## How full its power meter is (0 fresh → 1 destroyed).
func meter() -> float:
	return 1.0 - hp / max_hp


## Is `c` (a creep) close enough to latch on?
func in_latch(c: Node2D) -> bool:
	return c.team == owner_team and is_targetable() and position.distance_to(c.position) <= radius + LATCH + c.radius


func _process(delta: float) -> void:
	tick_unit(delta)
	_rise = minf(1.0, _rise + delta * 1.5)
	_glow_t += delta
	_chip -= delta
	if _chip <= 0.0 and is_targetable():
		_chip += CHIP_EVERY
		for c: Node2D in get_tree().get_nodes_in_group("creeps"):
			if c.get("camp") == self and c.is_targetable():
				c.take_damage(c.max_hp / LATCH_LIFE * CHIP_EVERY, Color("#ffd54f"), false, true, self)
	queue_redraw()


func _draw() -> void:
	var col: Color = TEAM_COLORS[owner_team]
	var a := _rise
	# the latch ring: where a creep you lead latches on
	draw_arc(Vector2.ZERO, radius + LATCH, 0.0, TAU, 64, Color(col, 0.18 * a), 2.0)
	# the glow: soft layered halo in its side's colour, pulsing slowly — stronger as its meter fills
	var pulse := 0.5 + 0.5 * sin(_glow_t * 2.2)
	var glow_r := radius * (1.55 + 0.12 * pulse)
	var strength := (0.55 + 0.45 * meter()) * (0.75 + 0.25 * pulse) * a
	for i in 6:
		var f := 1.0 - float(i) / 6.0
		draw_circle(Vector2.ZERO, glow_r * (0.45 + 0.55 * f), Color(col.lightened(0.35), 0.05 * strength))
	# the power meter: a ring that fills clockwise from the top as it's hurt
	draw_arc(Vector2.ZERO, radius + 12.0, 0.0, TAU, 48, Color(0, 0, 0, 0.45 * a), 8.0)
	var m := meter()
	if m > 0.0:
		draw_arc(Vector2.ZERO, radius + 12.0, -PI / 2.0, -PI / 2.0 + TAU * m, 48, Color(Color("#ffd54f"), a), 8.0)
	# the pole: painted art (skin.gd), else the four hero shapes stacked, in its side's colour
	if SkinArt.draw(self, "totem_%d" % owner_team, Vector2.ZERO, radius, Vector2.RIGHT, Color(1, 1, 1, a)):
		if _flash > 0.0:
			draw_circle(Vector2.ZERO, radius, Color(1, 1, 1, 0.25 * _flash))
		return
	# a 2D cylinder: an oval top, straight sides down to a matching arc at the bottom
	var hw := radius * 0.8          # half its width
	var eh := hw * 0.35             # half the oval's height (the tilt)
	var top := -radius * 0.75
	var bottom := radius * 0.55
	var front := PackedVector2Array()  # the bottom's near arc, left to right
	for i in 17:
		front.append(Vector2(-hw * cos(PI * i / 16.0), bottom + eh * sin(PI * i / 16.0)))
	var body := PackedVector2Array([Vector2(hw, top), Vector2(-hw, top)])
	body.append_array(front)
	draw_colored_polygon(body, Color(col.darkened(0.15), a))
	var oval := PackedVector2Array()
	for i in 32:
		oval.append(Vector2(hw * cos(TAU * i / 32.0), top + eh * sin(TAU * i / 32.0)))
	draw_colored_polygon(oval, Color(col.lightened(0.25), a))
	var shine := PackedVector2Array()  # a glowing core on the top, breathing with the pulse
	for i in 24:
		shine.append(Vector2(hw * 0.55 * cos(TAU * i / 24.0), top + eh * 0.55 * sin(TAU * i / 24.0)))
	draw_colored_polygon(shine, Color(col.lightened(0.7), (0.35 + 0.35 * pulse) * a))
	var rim := Color(0, 0, 0, 0.65 * a)
	oval.append(oval[0])
	draw_polyline(oval, rim, 2.5)
	draw_line(Vector2(-hw, top), Vector2(-hw, bottom), rim, 2.5)
	draw_line(Vector2(hw, top), Vector2(hw, bottom), rim, 2.5)
	draw_polyline(front, rim, 2.5)
	if _flash > 0.0:
		draw_circle(Vector2.ZERO, radius, Color(1, 1, 1, 0.25 * _flash))


static func _shape(kind: String, c: Vector2, r: float) -> PackedVector2Array:
	var n: int = {"circle": 16, "triangle": 3, "square": 4, "hexagon": 6}[kind]
	var turn: float = {"circle": 0.0, "triangle": -PI / 2.0, "square": PI / 4.0, "hexagon": 0.0}[kind]
	var out := PackedVector2Array()
	for i in n:
		out.append(c + Vector2.from_angle(turn + TAU * i / n) * r)
	return out
