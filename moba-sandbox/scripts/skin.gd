extends RefCounted
## Skins: one painted sheet replaces the shapes the game draws. The sheet is a
## COLS × ROWS grid of CELL px cells, one per thing (SLOTS, left to right, top
## to bottom); `tools/skin_template.gd` writes `skins/template.png` with today's
## shapes as placeholders, a guide circle (the unit's size: GUIDE_R px = its
## radius in game) and a facing arrow (art faces RIGHT; the game turns it to
## face where the unit is going). Paint over it and save it as skin.png:
##   next to the game's .exe in skins/skin.png (exported builds — swap skins
##   without rebuilding), or res://skins/skin.png (bundled / dev runs).
## Pure magenta (#FF00FF) is the template's guide colour and reads as
## transparent, so leftover guide lines never show. A cell left empty (fully
## transparent) keeps today's shape for that thing. No sheet: nothing changes.
## Drawing only — collisions and hits use each unit's radius, never the art.

const CELL := 256
const COLS := 4
const GUIDE_R := 80.0          # px in a cell = the unit's radius in game
const GUIDE := Color8(255, 0, 255)
const SLOTS := [
	"hero_circle", "hero_triangle", "hero_square", "hero_hexagon",
	"creep_melee_0", "creep_ranged_0", "creep_tank_0", "tower_0",
	"creep_melee_1", "creep_ranged_1", "creep_tank_1", "tower_1",
	"siege_0", "siege_1", "totem_0", "totem_1",
]
const LABELS := {  # what each cell is (skins/README.md, the template's legend)
	"hero_circle": "KYLE", "hero_triangle": "CHAD", "hero_square": "KAREN", "hero_hexagon": "BECKY",
	"creep_melee_0": "blue melee creep", "creep_ranged_0": "blue ranged creep", "creep_tank_0": "blue tank creep", "tower_0": "blue tower",
	"creep_melee_1": "red melee creep", "creep_ranged_1": "red ranged creep", "creep_tank_1": "red tank creep", "tower_1": "red tower",
	"siege_0": "blue siege minion", "siege_1": "red siege minion", "totem_0": "blue totem", "totem_1": "red totem",
}
const RES_PATH := "res://skins/skin.png"

static var _tex := {}       # slot -> Texture2D (only the painted cells)
static var _loaded := false


## The painted art for `slot`, or null (keep the shape).
static func tex(slot: String) -> Texture2D:
	_load()
	return _tex.get(slot)


static func has(slot: String) -> bool:
	return tex(slot) != null


## Draw `slot`'s art on `canvas` at `at`, sized so its guide circle is
## `radius`, turned to face `dir`, tinted by `modulate`. False (nothing drawn)
## when the skin has no art for it — draw the shape instead.
static func draw(canvas: CanvasItem, slot: String, at: Vector2, radius: float, dir: Vector2 = Vector2.RIGHT, modulate: Color = Color.WHITE) -> bool:
	var t := tex(slot)
	if t == null:
		return false
	var s := radius / GUIDE_R
	canvas.draw_set_transform(at, dir.angle(), Vector2(s, s))
	canvas.draw_texture(t, -Vector2(CELL, CELL) / 2.0, modulate)
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	return true


## Forget the loaded sheet (the next draw reloads it).
static func reload() -> void:
	_loaded = false
	_tex = {}


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	var img := _find_sheet()
	if img == null:
		return
	if img.is_compressed():
		img.decompress()
	img.convert(Image.FORMAT_RGBA8)
	for i in SLOTS.size():
		var cell := img.get_region(Rect2i((i % COLS) * CELL, (i / COLS) * CELL, CELL, CELL))
		if _strip_guides(cell):
			_tex[SLOTS[i]] = ImageTexture.create_from_image(cell)


## The sheet: beside the .exe (exported builds), else the project's skins/skin.png.
static func _find_sheet() -> Image:
	var paths: Array[String] = []
	if OS.has_feature("template"):
		paths.append(OS.get_executable_path().get_base_dir().path_join("skins/skin.png"))
	paths.append(ProjectSettings.globalize_path(RES_PATH))  # dev runs (also before the editor imports it)
	for p: String in paths:
		if FileAccess.file_exists(p):
			var img := Image.load_from_file(p)
			if img != null and not img.is_empty():
				return img
	if ResourceLoader.exists(RES_PATH):  # an exported build with the skin packed in
		var t: Texture2D = load(RES_PATH)
		if t != null:
			return t.get_image()
	return null


## Guide magenta → transparent. True if anything painted is left in the cell.
static func _strip_guides(cell: Image) -> bool:
	var painted := false
	for y in cell.get_height():
		for x in cell.get_width():
			var c := cell.get_pixel(x, y)
			if c.a <= 0.0:
				continue
			if c.r8 == 255 and c.g8 == 0 and c.b8 == 255:
				cell.set_pixel(x, y, Color(0, 0, 0, 0))
			else:
				painted = true
	return painted
