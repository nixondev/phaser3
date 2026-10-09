extends SceneTree
## Writes skins/template.png — the sheet to paint a skin on (scripts/skin.gd):
## one CELL px cell per thing, today's shape as a placeholder in each, and in
## guide magenta (#FF00FF, which the game reads as transparent) the cell's
## border, a guide circle (the unit's size: GUIDE_R px = its radius in game)
## and a facing arrow (art faces RIGHT; the game turns it). Re-run it when
## cells are added — painted skins keep working, new cells come up empty.
##   godot --headless --path . --script res://tools/skin_template.gd
## Dev only (tools/ never ships).

const SkinArt := preload("res://scripts/skin.gd")
const Heroes := preload("res://scripts/heroes.gd")
const HeroScript := preload("res://scripts/hero.gd")
const TEAM := [Color("#4f8ff7"), Color("#ef5350")]
const RIM := Color("#1a1d21")
const OUT := "res://skins/template.png"


func _init() -> void:
	var n: int = SkinArt.SLOTS.size()
	var rows: int = ceili(float(n) / SkinArt.COLS)
	var img := Image.create(SkinArt.COLS * SkinArt.CELL, rows * SkinArt.CELL, false, Image.FORMAT_RGBA8)
	img.fill(Color(0, 0, 0, 0))
	for i in n:
		var c := Vector2((i % SkinArt.COLS) * SkinArt.CELL, (i / SkinArt.COLS) * SkinArt.CELL) + Vector2.ONE * SkinArt.CELL / 2.0
		_placeholder(img, SkinArt.SLOTS[i], c)
		_guides(img, c)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://skins"))
	img.save_png(ProjectSettings.globalize_path(OUT))
	print("wrote ", OUT, " (", img.get_width(), "x", img.get_height(), ", ", n, " cells)")
	quit()


## Today's look for `slot`, drawn at cell centre `c`, unit radius = GUIDE_R.
func _placeholder(img: Image, slot: String, c: Vector2) -> void:
	var r: float = SkinArt.GUIDE_R
	if slot.begins_with("hero_"):
		var shape := slot.substr(5)
		var col := Color.WHITE
		for h: Dictionary in Heroes.LIST:
			if h["shape"] == shape:
				col = h["color"]
		var pts := _at(HeroScript.shape_points(shape, r, Vector2.RIGHT), c)
		_poly(img, pts, col)
		_outline(img, pts, RIM, 3.0)
		_poly(img, _at(PackedVector2Array([Vector2(r - 4.0, 0), Vector2(r - 16.0, 7), Vector2(r - 16.0, -7)]), c), RIM)  # facing notch
	elif slot.begins_with("creep_"):
		var parts := slot.split("_")
		var kind: String = parts[1]
		var col: Color = TEAM[int(parts[2])]
		var pts := PackedVector2Array()
		var sides := 32
		var k := 1.0
		var turn := 0.0
		if kind == "tank":
			sides = 4; k = 1.2; turn = PI / 4.0
		elif kind == "ranged":
			sides = 4; k = 1.25
		for j in sides:
			pts.append(c + Vector2.from_angle(turn + TAU * j / sides) * r * k)
		_poly(img, pts, col)
		_outline(img, pts, col.darkened(0.55), 3.0)
		_disc(img, c + Vector2(r * 0.55, 0), 4.0, col.darkened(0.6))
	elif slot.begins_with("tower_"):
		var col: Color = TEAM[int(slot.substr(6))]
		var base := PackedVector2Array()
		for j in 8:
			base.append(c + Vector2.from_angle(j * TAU / 8.0 + TAU / 16.0) * r)
		_poly(img, base, Color("#37474f"))
		_outline(img, base, col.darkened(0.3), 4.0)
		_disc(img, c + Vector2(0, -r * 0.1), r * 0.62, Color("#263238"))
		_disc(img, c + Vector2(0, -r * 0.53), r * 0.5, col)
		_disc(img, c + Vector2(0, -r * 0.53), r * 0.2, col.lightened(0.6))
	elif slot.begins_with("siege_"):
		var col: Color = TEAM[int(slot.substr(6))].lightened(0.15)
		var s := r / 24.0
		var body := _at(PackedVector2Array([Vector2(30, 0) * s, Vector2(-16, 18) * s, Vector2(-8, 0) * s, Vector2(-16, -18) * s]), c)
		_poly(img, body, col)
		_outline(img, body, Color("#ffcc80"), 3.0)
	elif slot.begins_with("totem_"):  # a 2D cylinder, as totem.gd draws it
		var col: Color = TEAM[int(slot.substr(6))]
		var hw := r * 0.8
		var eh := hw * 0.35
		var top := -r * 0.75
		var bottom := r * 0.55
		var front := PackedVector2Array()
		for j in 17:
			front.append(Vector2(-hw * cos(PI * j / 16.0), bottom + eh * sin(PI * j / 16.0)))
		var body := PackedVector2Array([Vector2(hw, top), Vector2(-hw, top)])
		body.append_array(front)
		_poly(img, _at(body, c), col.darkened(0.15))
		var oval := PackedVector2Array()
		for j in 32:
			oval.append(Vector2(hw * cos(TAU * j / 32.0), top + eh * sin(TAU * j / 32.0)))
		_poly(img, _at(oval, c), col.lightened(0.25))
		var rim := Color(0.1, 0.1, 0.1)
		_outline(img, _at(oval, c), rim, 2.5)
		_line(img, c + Vector2(-hw, top), c + Vector2(-hw, bottom), rim, 2.5)
		_line(img, c + Vector2(hw, top), c + Vector2(hw, bottom), rim, 2.5)
		for j in front.size() - 1:
			_line(img, c + front[j], c + front[j + 1], rim, 2.5)


## Guide magenta: the cell border, the guide circle, the facing arrow.
func _guides(img: Image, c: Vector2) -> void:
	var g: Color = SkinArt.GUIDE
	var half := SkinArt.CELL / 2.0
	var corners := _at(PackedVector2Array([Vector2(-half, -half), Vector2(half - 1, -half), Vector2(half - 1, half - 1), Vector2(-half, half - 1)]), c)
	_outline(img, corners, g, 1.0)
	_ring(img, c, SkinArt.GUIDE_R, 1.5, g)
	var tip := c + Vector2(half - 14.0, 0)
	_line(img, c + Vector2(SkinArt.GUIDE_R + 8.0, 0), tip, g, 2.0)
	_line(img, tip, tip + Vector2(-12, 8), g, 2.0)
	_line(img, tip, tip + Vector2(-12, -8), g, 2.0)


# ---------------------------------------------------------------- raster helpers

func _at(pts: PackedVector2Array, c: Vector2) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p in pts:
		out.append(p + c)
	return out


func _poly(img: Image, pts: PackedVector2Array, col: Color) -> void:
	var box := Rect2(pts[0], Vector2.ZERO)
	for p in pts:
		box = box.expand(p)
	for y in range(int(box.position.y), int(box.end.y) + 1):
		for x in range(int(box.position.x), int(box.end.x) + 1):
			if x >= 0 and y >= 0 and x < img.get_width() and y < img.get_height() \
					and Geometry2D.is_point_in_polygon(Vector2(x + 0.5, y + 0.5), pts):
				img.set_pixel(x, y, col)


func _disc(img: Image, c: Vector2, r: float, col: Color) -> void:
	for y in range(int(c.y - r) - 1, int(c.y + r) + 2):
		for x in range(int(c.x - r) - 1, int(c.x + r) + 2):
			if Vector2(x + 0.5, y + 0.5).distance_to(c) <= r and x >= 0 and y >= 0 and x < img.get_width() and y < img.get_height():
				img.set_pixel(x, y, col)


func _ring(img: Image, c: Vector2, r: float, w: float, col: Color) -> void:
	for y in range(int(c.y - r - w) - 1, int(c.y + r + w) + 2):
		for x in range(int(c.x - r - w) - 1, int(c.x + r + w) + 2):
			if absf(Vector2(x + 0.5, y + 0.5).distance_to(c) - r) <= w / 2.0 + 0.3 and x >= 0 and y >= 0 and x < img.get_width() and y < img.get_height():
				img.set_pixel(x, y, col)


func _line(img: Image, a: Vector2, b: Vector2, col: Color, w: float) -> void:
	var steps := int(a.distance_to(b) * 2.0) + 1
	for i in steps + 1:
		_disc(img, a.lerp(b, float(i) / steps), w / 2.0, col)


func _outline(img: Image, pts: PackedVector2Array, col: Color, w: float) -> void:
	for i in pts.size():
		_line(img, pts[i], pts[(i + 1) % pts.size()], col, w)
