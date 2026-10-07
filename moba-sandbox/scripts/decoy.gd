extends "res://scripts/unit.gd"
## Afterimage (an epic card): a decoy left where a hero dashed or blinked from.
## For `life` s enemy creeps, towers and the bot lose track of that hero and
## go for the decoy instead (hero.gd hidden_by_decoy). It can't be hurt — hits
## only flash it — and it fades out.

var life := 2.0
var points := PackedVector2Array()  # the hero's shape, round its centre
var colour := Color.WHITE
var _t := 0.0


func _ready() -> void:
	add_to_group("decoys")
	phasing = true  # nothing bumps into it
	max_hp = 1.0
	hp = 1.0


func take_damage(_amount: float, _colour: Color, _big := false, _quiet := false, _source: Node2D = null, _hit: Dictionary = {}) -> void:
	_flash = 1.0


func _process(delta: float) -> void:
	tick_unit(delta)
	_t += delta
	if _t >= life:
		hp = 0.0
		queue_free()
	queue_redraw()


func _draw() -> void:
	if points.size() < 3:
		return
	var a := 0.15 + 0.55 * (1.0 - _t / life)
	draw_colored_polygon(points, Color(colour.lerp(Color.WHITE, _flash * 0.5), a))
	var outline := points.duplicate()
	outline.append(points[0])
	draw_polyline(outline, Color(TEAM_COLORS[team], a + 0.2), 2.5)
