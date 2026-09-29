@tool
extends Node2D
## Unified wall shadows: one node and one shader (shaders/wall_shadow.gdshader)
## for the contact rim, a directional cast shadow, and — via new_cast_layer()
## — WeatherLab's lightning. Driven by each tile's ART silhouette (see
## TileShapes), so partial tiles shadow their shape, not their 64px box.
## Rebuilds live in the editor when the Collision layers change.
##
## `compare` switches between the old and new looks:
##   legacy rim   the original EdgeShadows node (this node hides)
##   rim          silhouette contact shadow only
##   cast         directional shadow only
##   rim + cast   both
## (It shows/hides the sibling EdgeShadows node to match.)
## Capture override, user args after `--`: --shadows=legacy|rim|cast|rim+cast

const RES := 0.5  # masks at half resolution — the shader smooths them
const WallShadowShader := preload("res://shaders/wall_shadow.gdshader")

@export_enum("legacy rim", "rim", "cast", "rim + cast") var compare: String = "rim + cast":
	set(v):
		compare = v
		_apply()

@export_group("Rim (contact shadow)")
@export_range(0.0, 1.0) var rim_strength := 0.85:
	set(v):
		rim_strength = v
		_apply()
@export_range(4.0, 96.0) var rim_radius := 30.0:
	set(v):
		rim_radius = v
		_apply()

@export_group("Cast (sky / moon)")
@export_range(0.0, 1.0) var cast_strength := 0.55:
	set(v):
		cast_strength = v
		_apply()
## Degrees: 0 = shadows fall straight down, positive = towards the right.
## Default matches the sprite shading key light (top-left) and the Phaser
## drop-shadow offset (11, 22).
@export_range(-180.0, 180.0) var cast_bearing := 26.6:
	set(v):
		cast_bearing = v
		_apply()
@export_range(0.0, 640.0) var cast_length := 128.0:
	set(v):
		cast_length = v
		_apply()
@export_range(0.0, 64.0) var cast_softness := 10.0:
	set(v):
		cast_softness = v
		_apply()

@export_group("Characters")
## Soft contact shadow under every character (0 = off).
@export_range(0.0, 1.0) var character_contact := 0.45
## Characters also cast a silhouette along the cast bearing when this node's
## `compare` includes the cast (see scripts/character_shadow.gd).
@export var character_cast := true
## Character shadow length per px of height.
@export_range(0.1, 2.0) var character_cast_scale := 0.6
## Edge softness (px) of character and item shadows — how far their edge
## fades out. 0 = hard silhouette.
@export_range(0.0, 8.0, 0.5) var shadow_softness := 2.5

@export_group("Source")
## Each one's runtime "<name>Partial" layer (room.gd moves partial tiles
## there) is included automatically — not listed here, because this list is
## saved into scenes and a new default wouldn't reach them.
@export var source_layers := PackedStringArray(["Collision", "CollisionColor"])

var _cast_tex: ImageTexture   # alpha = art silhouette
var _knock_tex: ImageTexture  # alpha = art, or the whole cell for hollow / colour tiles
var _room_px := Vector2.ZERO
var _mat: ShaderMaterial
var _queued := false
var _cells_sig := 0
var _poll := 0.0
var _scaled := {}  # tile key -> its image at RES
var _white := {}   # size -> opaque white image


func _ready() -> void:
	if not Engine.is_editor_hint():  # capture override: --shadows=legacy|rim|cast|rim+cast
		for arg in OS.get_cmdline_user_args():
			if arg.begins_with("--shadows="):
				compare = arg.trim_prefix("--shadows=").replace("legacy", "legacy rim").replace("+", " + ")
	_mat = ShaderMaterial.new()
	_mat.shader = WallShadowShader
	material = _mat
	_cells_sig = _cells_signature()
	_rebuild()


func _draw() -> void:
	if _cast_tex:
		draw_texture_rect(_cast_tex, Rect2(Vector2.ZERO, _room_px), false)


## A second shadow layer sharing this node's masks — cast only, for
## WeatherLab's lightning. Returned as a sibling placed just above this
## node; animate its material's cast_strength / cast_dir.
func new_cast_layer(layer_name: String) -> Sprite2D:
	var s := Sprite2D.new()
	s.name = layer_name
	s.centered = false
	s.texture = _cast_tex
	s.scale = Vector2.ONE / RES
	var m := ShaderMaterial.new()
	m.shader = WallShadowShader
	m.set_shader_parameter("cast_mask", _cast_tex)
	m.set_shader_parameter("knock_mask", _knock_tex)
	m.set_shader_parameter("room_px", _room_px)
	m.set_shader_parameter("rim_strength", 0.0)
	m.set_shader_parameter("cast_strength", 0.0)
	s.material = m
	get_parent().add_child(s)
	get_parent().move_child(s, get_index() + 1)
	return s


## Painting cells doesn't emit TileMapLayer.changed (checked in Godot 4.7:
## zero emissions for set_cell / erase_cell), so the live rebuild polls a
## cheap fingerprint of the source layers' cell data instead.
func _process(delta: float) -> void:
	_poll -= delta
	if _poll > 0.0:
		return
	_poll = 0.25
	var sig := _cells_signature()
	if sig != _cells_sig:
		_cells_sig = sig
		_queue()


func _cells_signature() -> int:
	var sig := 0
	for layer in _layers():
		sig = hash([sig, layer.tile_map_data])
	return sig


func _queue() -> void:
	if _queued or not is_inside_tree():
		return
	_queued = true
	_rebuild.call_deferred()


func _layers() -> Array[TileMapLayer]:
	var out: Array[TileMapLayer] = []
	if get_parent() == null:
		return out
	for lname in source_layers:
		for n in [lname, lname + "Partial"]:
			var layer := get_parent().get_node_or_null(NodePath(n)) as TileMapLayer
			if layer:
				out.append(layer)
	return out


func _rebuild() -> void:
	_queued = false
	var cells := {}  # Vector2i -> TileMapLayer
	for layer in _layers():
		for cell in layer.get_used_cells():
			cells[cell] = layer
	var hi := Vector2i.ZERO
	for cell: Vector2i in cells:
		hi = hi.max(cell)
	var room_tiles := hi + Vector2i.ONE
	var room: Variant = get_parent().get("room_size") if get_parent() else null
	if room is Vector2i:
		room_tiles = room_tiles.max(room)
	_room_px = Vector2(room_tiles * TileShapes.TILE)

	var t := int(TileShapes.TILE * RES)
	var cast := Image.create_empty(room_tiles.x * t, room_tiles.y * t, false, Image.FORMAT_RGBA8)
	var knock := Image.create_empty(room_tiles.x * t, room_tiles.y * t, false, Image.FORMAT_RGBA8)
	for cell: Vector2i in cells:
		var layer: TileMapLayer = cells[cell]
		var at := cell * t
		var tile := _scaled_tile(layer, cell, t)
		if tile == null:  # colour tile / missing art: solid
			cast.fill_rect(Rect2i(at, Vector2i(t, t)), Color.WHITE)
			knock.fill_rect(Rect2i(at, Vector2i(t, t)), Color.WHITE)
			continue
		var white := _white_image(tile.get_size())
		cast.blit_rect_mask(white, tile, Rect2i(Vector2i.ZERO, tile.get_size()), at)
		if TileShapes.is_hollow(layer, cell):
			knock.fill_rect(Rect2i(at, Vector2i(t, t)), Color.WHITE)
		else:
			knock.blit_rect_mask(white, tile, Rect2i(Vector2i.ZERO, tile.get_size()), at)

	_cast_tex = ImageTexture.create_from_image(cast)
	_knock_tex = ImageTexture.create_from_image(knock)
	_apply()


func _scaled_tile(layer: TileMapLayer, cell: Vector2i, t: int) -> Image:
	var key := TileShapes._key(layer, cell)
	if not _scaled.has(key):
		var img := TileShapes.tile_image(layer, cell)
		_scaled[key] = TileShapes.solid_mask(img, t) if img != null else null
	return _scaled[key]


func _white_image(size: Vector2i) -> Image:
	if not _white.has(size):
		var img := Image.create_empty(size.x, size.y, false, Image.FORMAT_RGBA8)
		img.fill(Color.WHITE)
		_white[size] = img
	return _white[size]


func _apply() -> void:
	var legacy := compare == "legacy rim"
	var edge := get_parent().get_node_or_null("EdgeShadows") if get_parent() else null
	if edge:
		edge.visible = legacy
	visible = not legacy
	if _mat == null or _cast_tex == null:
		queue_redraw()
		return
	var rad := deg_to_rad(cast_bearing)
	_mat.set_shader_parameter("cast_mask", _cast_tex)
	_mat.set_shader_parameter("knock_mask", _knock_tex)
	_mat.set_shader_parameter("room_px", _room_px)
	_mat.set_shader_parameter("rim_strength", rim_strength if compare in ["rim", "rim + cast"] else 0.0)
	_mat.set_shader_parameter("rim_radius", rim_radius)
	_mat.set_shader_parameter("cast_strength", cast_strength if compare in ["cast", "rim + cast"] else 0.0)
	_mat.set_shader_parameter("cast_dir", Vector2(sin(rad), cos(rad)))
	_mat.set_shader_parameter("cast_length", cast_length)
	_mat.set_shader_parameter("cast_softness", cast_softness)
	queue_redraw()
