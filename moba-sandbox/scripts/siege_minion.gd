extends Node2D
## A siege minion: in overtime, every hero death sends one with the other
## side's next wave (lane.gd). It walks straight down the middle of the lane at
## the enemy tower and nothing can touch it — not in the "units" group, so no
## attack, ability or collision finds it — then blows itself up on the tower
## for DAMAGE_SHARE of the tower's max health (a fixed chunk: overtime's
## growing tower damage doesn't multiply it). Its tower shows what's coming.

const SPEED := 240.0          # creep pace
const DAMAGE_SHARE := 0.10    # of the target tower's max health
const COLOR_CORE := Color(1.0, 0.93, 0.7)

var team := 0
var speed_bonus := 0.0        # Pathfinders: walks this much faster (like the rest of its wave)
var target: Node2D = null     # the enemy tower
var effects: Node2D
var _t := 0.0


func _ready() -> void:
	add_to_group("siege_minions")
	z_index = 6  # over creeps: it's the thing to watch


func _process(delta: float) -> void:
	_t += delta
	if not is_instance_valid(target) or not target.is_targetable():
		queue_free()
		return
	var to: Vector2 = target.position - position
	var reach: float = target.radius + 18.0
	var step := SPEED * (1.0 + speed_bonus) * delta
	if to.length() <= reach + step:
		_explode()
		return
	position += to.normalized() * step
	queue_redraw()


func _explode() -> void:
	var t: Node2D = target
	var chunk: float = t.max_hp * DAMAGE_SHARE / maxf(float(t.get("vulnerability")), 0.01)  # exact chunk, overtime or not
	t.take_damage(chunk, Color("#ffcc80"), true, false, null)
	if effects:
		effects.add_child(load("res://scripts/effects.gd").Ghost.new(position, 90.0, Color("#ffb74d")))
		effects.add_child(load("res://scripts/effects.gd").Ghost.new(position, 50.0, COLOR_CORE))
	queue_free()


func _draw() -> void:
	var c: Color = [Color("#4f8ff7"), Color("#ef5350")][team]
	var dir := Vector2.RIGHT if team == 0 else Vector2.LEFT
	var pulse := 0.5 + 0.5 * sin(_t * 8.0)
	draw_circle(Vector2.ZERO, 34.0 + 6.0 * pulse, Color(c, 0.12))  # a glow: untouchable, unstoppable
	var body := PackedVector2Array([dir * 30.0, dir.orthogonal() * 18.0 - dir * 16.0, -dir * 8.0, -dir.orthogonal() * 18.0 - dir * 16.0])
	draw_colored_polygon(body, c.lightened(0.15))
	var outline := body.duplicate()
	outline.append(body[0])
	draw_polyline(outline, COLOR_CORE, 2.5)
	draw_circle(dir * 4.0, 7.0, Color(COLOR_CORE, 0.6 + 0.4 * pulse))  # the charge
	var spark := -dir * 14.0 + Vector2(randf_range(-3, 3), randf_range(-3, 3))
	draw_circle(spark, 3.0 + 2.0 * pulse, Color("#ffb74d"))  # a lit fuse
