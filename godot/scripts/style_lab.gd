extends Node
## Visual style experiments — a sandbox, not the game. Tick a box in the
## Inspector and press F5; untick one (or delete this node) to revert.
## Nothing is baked into the scene, the tiles or the art: every effect is
## built at runtime, and the only generated files are the *_n.png normal
## maps beside the tile sheets (tools/make_normals.py).
##
## Capture override, user args after `--` (replaces the Inspector choices):
##   --style=demo,dust,normals,grade=cold,retro,lens

const PostShader := preload("res://shaders/style_post.gdshader")
const DustShader := preload("res://shaders/dust_motes.gdshader")
const DUST_MASK := 4  # light-mask bit only the flashlight cone lights

const GRADES := {
	"cold": {"tint": Vector3(0.85, 0.97, 1.18), "lift": Vector3(0.0, 0.02, 0.07), "saturation": 0.6, "contrast": 1.1},
	"warm": {"tint": Vector3(1.15, 1.0, 0.8), "lift": Vector3(0.06, 0.02, 0.0), "saturation": 0.9, "contrast": 1.05},
	"sickly": {"tint": Vector3(0.88, 1.12, 0.75), "lift": Vector3(0.02, 0.07, 0.0), "saturation": 0.5, "contrast": 1.18},
	"noir": {"tint": Vector3(1.0, 1.0, 1.0), "lift": Vector3.ZERO, "saturation": 0.0, "contrast": 1.35},
}

@export_group("Setup")
## Forces the room dark (0.85) and hands you a lit flashlight at spawn —
## dust, normal maps and the dirty lens only show under the beam. Off by
## default so normal play starts without the flashlight.
@export var demo_darkness := false

@export_group("Experiments")
## 1. Dust motes that only exist where the flashlight beam hits them.
@export var dust_in_beam := false
## 2. Tile sheets get normal maps, so surfaces catch the moving light.
##    Run `python godot/tools/make_normals.py` first (done once already).
@export var normal_mapped_tiles := false
## 3. Whole-screen colour grade.
@export_enum("none", "cold", "warm", "sickly", "noir") var colour_grade: String = "none":
	set(v):
		colour_grade = v
		_update_post()
## 4. Retro pass: dithered colour banding, scanlines, vignette, grain.
@export var retro_pass := false:
	set(v):
		retro_pass = v
		_update_post()
@export_range(2.0, 16.0, 1.0) var retro_levels := 6.0:
	set(v):
		retro_levels = v
		_update_post()
## 5. Smudged, uneven flashlight lens with a faint flicker.
@export var dirty_lens := false

var _post: ShaderMaterial
var _post_layer: CanvasLayer
var _flicker: PointLight2D
var _flicker_base := 1.0
var _stutter := 0.0
var _t := 0.0


func _ready() -> void:
	_apply_args()
	# Runs before the room's own _ready (children first), so the room builds
	# its darkness and flashlight with these values.
	var room = get_parent()
	if demo_darkness:
		room.dark = true
		room.dark_level = 0.85
	_finish.call_deferred()


func _finish() -> void:
	var room = get_parent()
	if demo_darkness and not room.held.has("flashlight"):
		room.held["flashlight"] = true
		room.flashlight.toggle()
	if dust_in_beam:
		_add_dust(room)
	if normal_mapped_tiles:
		_add_normals(room)
	if dirty_lens:
		_add_dirty_lens(room)
	_add_post()


func _process(delta: float) -> void:
	if _flicker == null:
		return
	_t += delta
	var e := _flicker_base * (0.97 + 0.03 * sin(_t * 23.0) * sin(_t * 7.3))
	if _stutter > 0.0:
		_stutter -= delta
		e *= 0.55
	elif randf() < 0.003:
		_stutter = 0.07
	_flicker.energy = e


# ── 1. Dust in the beam ─────────────────────────────────────────────────

func _add_dust(room: Node) -> void:
	# A room-sized rect running a procedural mote shader, lit only by the cone
	# (own light-mask bit, so not the ambient circle) and hidden in wall
	# shadows. The shader's light() does the per-pixel reveal — plain
	# light-only is per-item in Godot 4 and showed motes everywhere.
	var size := Vector2(room.room_size * WardenData.TILE)
	var rect := ColorRect.new()
	rect.name = "StyleDust"
	rect.size = size
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var m := ShaderMaterial.new()
	m.shader = DustShader
	m.set_shader_parameter("rect_size", size)
	rect.material = m
	rect.light_mask = DUST_MASK
	room.add_child(rect)
	var cone: Light2D = room.flashlight.get_node("Cone")
	cone.range_item_cull_mask |= DUST_MASK


# ── 2. Normal-mapped tiles ──────────────────────────────────────────────

func _add_normals(room: Node) -> void:
	# The TileSet is shared by every layer; swapping each atlas texture for a
	# CanvasTexture (diffuse + normal) lights all of them. Runtime only.
	var ts: TileSet = (room.get_node("Ground") as TileMapLayer).tile_set
	for i in ts.get_source_count():
		var src := ts.get_source(ts.get_source_id(i)) as TileSetAtlasSource
		if src == null or src.texture == null or src.texture is CanvasTexture:
			continue
		var npath := src.texture.resource_path.get_basename() + "_n.png"
		if not FileAccess.file_exists(npath):
			continue  # colour palette, or make_normals.py not run
		var ct := CanvasTexture.new()
		ct.diffuse_texture = src.texture
		ct.normal_texture = _load_png(npath)
		src.texture = ct
	# Lights at surface height rake across normals at a grazing angle; lift
	# them so the relief reads as lit-from-above-and-ahead.
	for light_name: String in ["Cone", "ConeObjects", "Ambient"]:
		(room.flashlight.get_node(light_name) as Light2D).height = 48.0


# ── 5. Dirty lens ───────────────────────────────────────────────────────

func _add_dirty_lens(room: Node) -> void:
	var cone: PointLight2D = room.flashlight.get_node("Cone")
	var img: Image = cone.texture.get_image().duplicate()
	var n := img.get_width()
	var centre := Vector2(n, n) / 2.0
	var smudge := FastNoiseLite.new()
	smudge.seed = 7
	smudge.frequency = 0.05
	smudge.fractal_octaves = 3
	for y in n:
		for x in n:
			var v := img.get_pixel(x, y).r
			if v <= 0.001:
				continue
			var d := (Vector2(x, y) - centre).length() / (n / 2.0)
			var s := 0.4 + 0.6 * (smudge.get_noise_2d(x, y) * 0.5 + 0.5)  # uneven, smudged glass
			var ring := 1.0 + 0.5 * exp(-pow((d - 0.5) / 0.04, 2.0))     # reflector ring
			var hot := 1.0 + 0.3 * exp(-pow(d / 0.2, 2.0))                 # hotspot near the bulb
			v = clampf(v * s * ring * hot, 0.0, 1.0)
			img.set_pixel(x, y, Color(v, v, v, 1.0))
	cone.texture = ImageTexture.create_from_image(img)
	var objects: PointLight2D = room.flashlight.get_node_or_null("ConeObjects")
	if objects:
		objects.texture = cone.texture  # keep the unshadowed beam copy identical
	_flicker = cone
	_flicker_base = cone.energy


# ── 3 + 4. Screen pass ──────────────────────────────────────────────────

func _add_post() -> void:
	_post_layer = CanvasLayer.new()
	_post_layer.name = "StylePost"
	_post_layer.layer = 5  # above the world, below the HUD (layer 10)
	var rect := ColorRect.new()
	rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_post = ShaderMaterial.new()
	_post.shader = PostShader
	rect.material = _post
	_post_layer.add_child(rect)
	add_child(_post_layer)
	_update_post()


func _update_post() -> void:
	if _post == null:
		return
	var grade: Dictionary = GRADES.get(colour_grade, {})
	_post.set_shader_parameter("grade_on", not grade.is_empty())
	for key: String in grade:
		_post.set_shader_parameter(key, grade[key])
	_post.set_shader_parameter("retro_on", retro_pass)
	_post.set_shader_parameter("levels", retro_levels)
	_post_layer.visible = retro_pass or not grade.is_empty()


# ── helpers ─────────────────────────────────────────────────────────────

func _apply_args() -> void:
	for arg in OS.get_cmdline_user_args():
		if not arg.begins_with("--style="):
			continue
		demo_darkness = false
		dust_in_beam = false
		normal_mapped_tiles = false
		colour_grade = "none"
		retro_pass = false
		dirty_lens = false
		for item in arg.trim_prefix("--style=").split(","):
			match item.get_slice("=", 0):
				"demo": demo_darkness = true
				"dust": dust_in_beam = true
				"normals": normal_mapped_tiles = true
				"grade": colour_grade = item.get_slice("=", 1)
				"retro": retro_pass = true
				"lens": dirty_lens = true


func _load_png(path: String) -> Texture2D:
	return ImageTexture.create_from_image(Image.load_from_file(ProjectSettings.globalize_path(path)))
