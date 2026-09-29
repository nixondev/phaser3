extends Node
## The title screen — port of MenuScene.ts. The title-screen room ("The
## Junction") runs as a backdrop with hard rain and drifting clouds, a dark
## wash for readability, the WARDEN title with its sporadic glitch flash,
## and a pulsing PRESS SPACE OR ENTER. Start fades into rooms.json startRoom.
##
## Not ported: the two wandering afflicted (the afflicted entity isn't
## ported yet), the editor buttons (Godot's editor replaces them) and Cast
## to TV (Chromecast's web SDK — no native equivalent).

const ROOM := "res://scenes/rooms/title-screen.tscn"
const WeatherLabScript := preload("res://scripts/weather_lab.gd")
const TitleShader := preload("res://shaders/title_text.gdshader")
const VT323 := preload("res://fonts/vt323/VT323-Regular.ttf")
const SILKSCREEN := preload("res://fonts/silkscreen/Silkscreen-Regular.ttf")
const SCREEN := Vector2(1280, 960)

## MenuScene's glitch-flash colours: chartreuse-lime, electric lime, acid yellow.
const FLASH_COLORS := [Color8(184, 255, 48), Color8(120, 255, 100), Color8(236, 255, 28)]

var _title: Control
var _started := false


func _ready() -> void:
	var room: Node2D = load(ROOM).instantiate()
	room.backdrop = true
	var weather := WeatherLabScript.new()
	weather.name = "WeatherLab"
	weather.demo_flashlight = false
	weather.rain_in_beam = false
	weather.rain_in_ambient = false
	weather.lightning = false
	weather.rain_overlay = true
	weather.rain_mode = "hard"
	weather.clouds = true
	room.add_child(weather)
	add_child(room)
	_build_ui()
	_schedule_flash()


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key and key.pressed and not key.echo and key.physical_keycode in [KEY_SPACE, KEY_ENTER, KEY_KP_ENTER, KEY_E]:
		_start()


# ── UI ──────────────────────────────────────────────────────────────────

func _build_ui() -> void:
	# Dark wash between the rain and the text, for readability.
	var wash_layer := CanvasLayer.new()
	wash_layer.layer = 6
	var wash := ColorRect.new()
	wash.color = Color(0, 0, 0, 0.35)
	wash.set_anchors_preset(Control.PRESET_FULL_RECT)
	wash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	wash_layer.add_child(wash)
	add_child(wash_layer)

	var ui := CanvasLayer.new()
	ui.layer = 7
	add_child(ui)

	# WARDEN: VT323 220px, gradient fill, dark red stroke, blue glow.
	_title = _text_group("WARDEN", VT323, 220, SCREEN.y / 3.0, Color("#3a0008"), 5,
		Color("#4488ff"), [26, 16, 9], [0.10, 0.16, 0.24])
	var fill: Label = _title.get_child(_title.get_child_count() - 1)
	var mat := ShaderMaterial.new()
	mat.shader = TitleShader
	mat.set_shader_parameter("height", fill.size.y)
	fill.material = mat
	ui.add_child(_title)

	# The prompt: Silkscreen 20px, #aabbcc, slow pulse.
	var prompt := _text_group("PRESS SPACE OR ENTER", SILKSCREEN, 20, SCREEN.y * 0.62, Color("#1a2a3a"), 2,
		Color("#4488ff"), [10, 5], [0.14, 0.24])
	prompt.get_child(prompt.get_child_count() - 1).add_theme_color_override("font_color", Color("#aabbcc"))
	ui.add_child(prompt)
	var pulse := create_tween().set_loops()
	pulse.tween_property(prompt, "modulate:a", 0.55, 1.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse.tween_property(prompt, "modulate:a", 1.0, 1.1).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Centred text at y, as a group: glow layers behind (transparent text with a
## wide, faint outline each — a stand-in for Phaser's blurred text shadow),
## then the text itself with its stroke. The last child is the fill label.
func _text_group(text: String, font: Font, size: int, centre_y: float, stroke: Color,
		stroke_px: int, glow: Color, glow_px: Array, glow_alpha: Array) -> Control:
	var group := Control.new()
	group.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var height := font.get_height(size)
	group.position = Vector2(0, centre_y - height / 2.0)
	group.size = Vector2(SCREEN.x, height)
	group.pivot_offset = group.size / 2.0
	for i in glow_px.size():
		var g := _label(text, font, size, height)
		g.add_theme_color_override("font_color", Color(0, 0, 0, 0))
		g.add_theme_color_override("font_outline_color", Color(glow, glow_alpha[i]))
		g.add_theme_constant_override("outline_size", glow_px[i])
		group.add_child(g)
	var fill := _label(text, font, size, height)
	fill.add_theme_color_override("font_color", Color.WHITE)
	fill.add_theme_color_override("font_outline_color", stroke)
	fill.add_theme_constant_override("outline_size", stroke_px)
	group.add_child(fill)
	return group


func _label(text: String, font: Font, size: int, height: float) -> Label:
	var l := Label.new()
	l.text = text
	l.size = Vector2(SCREEN.x, height)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", size)
	return l


# ── Glitch flash (MenuScene.scheduleFlash) ─────────────────────────────

## Every 0.8–5 s the title flashes a lime/acid tint; 35% of the time it's a
## double flash in two different colours with a brief glitch gap.
func _schedule_flash() -> void:
	await get_tree().create_timer(randf_range(0.8, 5.0)).timeout
	if not is_inside_tree() or _started:
		return
	var first: Color = FLASH_COLORS.pick_random()
	await _flash(first)
	if randf() < 0.35:
		var second: Color = FLASH_COLORS.pick_random()
		while second == first:
			second = FLASH_COLORS.pick_random()
		await get_tree().create_timer(randf_range(0.03, 0.1)).timeout
		await _flash(second)
	_schedule_flash()


func _flash(color: Color) -> void:
	var tw := create_tween()
	tw.tween_property(_title, "modulate", color, 0.07).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	tw.tween_property(_title, "modulate", Color.WHITE, 0.07).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_OUT)
	await tw.finished


# ── Start ───────────────────────────────────────────────────────────────

func _start() -> void:
	if _started:
		return
	_started = true
	var layer := CanvasLayer.new()
	layer.layer = 50
	var fade := ColorRect.new()
	fade.color = Color(0, 0, 0, 0)
	fade.set_anchors_preset(Control.PRESET_FULL_RECT)
	layer.add_child(fade)
	add_child(layer)
	var tw := create_tween()
	tw.tween_property(fade, "color:a", 1.0, 0.4)
	await tw.finished
	get_node("/root/GameState").reset()  # a fresh run
	var start: String = WardenData.load_json("data/rooms.json").get("startRoom", "protag-house")
	get_tree().change_scene_to_file("res://scenes/rooms/%s.tscn" % start)
