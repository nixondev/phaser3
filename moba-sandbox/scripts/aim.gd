extends Node2D
## Targeting preview while an ability key is held (drawn under the hero):
##   skillshot  a lane per bolt from the hero towards the cursor
##   ground     range circle + the area at the (clamped) cursor (+ scatter)
##   dash/blink range circle + a line to the landing spot
##   self       the pulse's area around the hero
##   cone       the wedge in front of the hero
##   beam       the line it will pierce

var hero: Node2D


func _process(_delta: float) -> void:
	queue_redraw()


func _draw() -> void:
	if hero == null:
		return
	var t: Variant = hero.attack_target
	if t != null and is_instance_valid(t):  # the auto-attack target
		draw_arc(t.position, t.radius + 8.0, 0.0, TAU, 48, Color("#ff6b6b"), 3.0)
	if hero.aiming == "":
		return
	var a: Dictionary = hero.abilities[hero.aiming]
	var c: Color = a["color"]
	var from: Vector2 = hero.position
	var to := get_global_mouse_position() - from
	var dir: Vector2 = to.normalized() if to.length() > 1.0 else hero.facing
	match a["kind"]:
		"skillshot":
			var n: int = a.get("count", 1)
			for i in n:
				_lane(from, dir.rotated(deg_to_rad(a.get("spread", 0.0)) * (i - (n - 1) / 2.0)), a["range"], 18.0, c)
		"beam":
			_lane(from, dir, a["range"], a["width"] / 2.0, c)
		"orb":  # where the dot will stop, and the blast it can set off there
			var stop: Vector2 = from + dir * clampf(to.length(), 60.0, a["range"])
			draw_line(from, stop, Color(c, 0.6), 3.0)
			draw_circle(stop, a["radius"], Color(c, 0.12))
			draw_arc(stop, a["radius"], 0.0, TAU, 64, Color(c, 0.8), 2.0)
			draw_circle(stop, 8.0, Color(c, 0.9))
		"cone":
			var half := deg_to_rad(a["angle"]) / 2.0
			var pts := PackedVector2Array([from])
			for i in 17:
				pts.append(from + dir.rotated(-half + 2.0 * half * i / 16.0) * a["range"])
			draw_colored_polygon(pts, Color(c, 0.18))
			pts.append(from)
			draw_polyline(pts, Color(c, 0.8), 2.0)
		"ground":
			if a["range"] > 0.0:  # range 0 (TRAP): dropped where you stand
				draw_arc(from, a["range"], 0.0, TAU, 96, Color(c, 0.35), 2.0)
			if a.get("min_range", 0.0) > 0.0:  # RUMOR: can't land inside this ring
				draw_arc(from, a["min_range"], 0.0, TAU, 64, Color(c, 0.35), 2.0)
			var at: Vector2 = from + dir * clampf(to.length(), float(a.get("min_range", 0.0)), float(a["range"]))
			if a.has("scatter"):  # several blasts land somewhere in here
				draw_arc(at, a["scatter"] + a["radius"], 0.0, TAU, 64, Color(c, 0.5), 2.0)
			draw_circle(at, a["radius"], Color(c, 0.2))
			draw_arc(at, a["radius"], 0.0, TAU, 64, Color(c, 0.85), 3.0)
		"boop":  # BOOP: the circle, with arrows showing which way each part shoves
			draw_arc(from, a["range"], 0.0, TAU, 96, Color(c, 0.35), 2.0)
			var bat: Vector2 = from + to.limit_length(a["range"])
			var reach: float = float(a["radius"]) + float(a.get("push", 120.0))
			draw_circle(bat, reach, Color(c, 0.12))
			draw_arc(bat, reach, 0.0, TAU, 64, Color(c, 0.85), 3.0)  # everyone inside is carried out to here
			for i in 8:
				var d := Vector2.from_angle(TAU * i / 8.0)
				draw_line(bat + d * reach * 0.3, bat + d * reach * 0.8, Color(c, 0.5), 2.0)
		"dash", "blink":
			draw_arc(from, a["range"], 0.0, TAU, 96, Color(c, 0.35), 2.0)
			var land: Vector2 = from + to.limit_length(a["range"])
			draw_line(from, land, Color(c, 0.7), 4.0)
			draw_arc(land, hero.radius, 0.0, TAU, 40, Color(c, 0.9), 3.0)
		"self":
			draw_circle(from, a["radius"], Color(c, 0.12))
			draw_arc(from, a["radius"], 0.0, TAU, 96, Color(c, 0.8), 3.0)


func _lane(from: Vector2, dir: Vector2, length: float, half_width: float, c: Color) -> void:
	var side := dir.orthogonal() * half_width
	var end := from + dir * length
	draw_colored_polygon(PackedVector2Array([from + side, end + side, end - side, from - side]), Color(c, 0.18))
	draw_polyline(PackedVector2Array([from + side, end + side, end - side, from - side, from + side]), Color(c, 0.7), 2.0)
