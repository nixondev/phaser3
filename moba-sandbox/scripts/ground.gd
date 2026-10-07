extends Node2D
## The map: a big empty square with a faint grid so movement reads, and a
## border at the edge. No obstacles.

const MAP_SIZE := 6000.0
const CELL := 128.0
const MAJOR_EVERY := 4  # a stronger line every 4 cells

const FLOOR := Color("#1b2124")
const MINOR := Color(1, 1, 1, 0.035)
const MAJOR := Color(1, 1, 1, 0.08)
const EDGE := Color("#4a5a60")


func _draw() -> void:
	var half := MAP_SIZE / 2.0
	draw_rect(Rect2(-half, -half, MAP_SIZE, MAP_SIZE), FLOOR)
	var lines := int(MAP_SIZE / CELL)
	for i in lines + 1:
		var p := -half + i * CELL
		var c := MAJOR if i % MAJOR_EVERY == 0 else MINOR
		draw_line(Vector2(p, -half), Vector2(p, half), c, 2.0 if c == MAJOR else 1.0)
		draw_line(Vector2(-half, p), Vector2(half, p), c, 2.0 if c == MAJOR else 1.0)
	draw_rect(Rect2(-half, -half, MAP_SIZE, MAP_SIZE), EDGE, false, 6.0)
