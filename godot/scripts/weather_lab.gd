extends Node
## Weather experiments — a sandbox like StyleLab. Tick boxes in the
## Inspector and press F5; untick (or delete this node) to revert. Everything
## is built at runtime; nothing is baked into the scene or the art.
##
##   Rain overlay     port of RainEffect.ts: screen-space streaks drawn above
##                    the darkness, so always visible (Phaser behaviour)
##   Rain in beam     streaks + ground splashes that exist only inside the
##                    flashlight beam, and stop at wall shadows
##   Lightning        a DirectionalLight2D flash; walls throw hard shadows a
##                    few tiles long, away from the strike, for a split second
##
## Capture override, user args after `--` (replaces Inspector choices):
##   --weather=flashlight,overlay,beam,lightning,strike@0.5

const RainBeamShader := preload("res://shaders/rain_beam.gdshader")
const RAIN_MASK := 8  # light-mask bit only the rain light (and lightning) touch

@export_group("Setup")
## Start with the flashlight in hand and switched on (for trying the beam
## effects). Off by default so normal play isn't handed a flashlight.
@export var demo_flashlight := false

@export_group("Clouds")
## Port of CloudEffect.ts: dark cloud banks drifting across the screen.
@export var clouds := false

@export_group("Rain")
## Phaser's screen-space rain (RainEffect.ts), above the darkness.
@export var rain_overlay := true
@export_enum("mild", "hard") var rain_mode: String = "hard"
## Streaks and splashes that only exist where the beam lands.
@export var rain_in_beam := true
@export_range(0.0, 1.0) var beam_rain_density := 0.55:
	set(v):
		beam_rain_density = v
		if _beam_mat:
			_beam_mat.set_shader_parameter("density", v)
@export_range(0.2, 3.0) var beam_rain_brightness := 1.2
## The same rain in the small light circle round the player, flashlight or not.
@export var rain_in_ambient := true

@export_group("Lightning")
@export var lightning := true
## Walls cast shadows during the flash.
@export var lightning_shadows := true
## How far each wall's shadow reaches, in px (64 = one tile).
@export_range(32.0, 640.0) var shadow_length := 192.0
@export_range(1.0, 60.0) var interval_min := 6.0
@export_range(1.0, 60.0) var interval_max := 14.0
@export_range(0.2, 4.0) var flash_energy := 1.6
## Thunder after each flash (tools/make_thunder.py → audio/thunder_*.wav).
## A short wait = a near crack, a long wait = a quieter distant roll.
@export var thunder := true
@export_range(-30.0, 6.0) var thunder_volume_db := 0.0

var _room: Node
var _cone: PointLight2D
var _rain_light: PointLight2D
var _beam_mat: ShaderMaterial
var _overlay: Node2D
var _clouds: Array = []  # [Node2D, speed, width]
var _drops := []  # [x, y, speed]
var _bolt: DirectionalLight2D
var _flash: ColorRect
var _shadow_mat: ShaderMaterial
var _thunder_near: Array[AudioStream] = []
var _thunder_far: Array[AudioStream] = []
var _next_strike := 0.0
var _forced_strike := -1.0


func _ready() -> void:
	_apply_args()
	_room = get_parent()
	_finish.call_deferred()  # after the room built its player + flashlight


func _finish() -> void:
	if clouds:
		_add_clouds()
	if rain_overlay:
		_add_overlay()
	# A backdrop room (the title screen) has no player or flashlight: only the
	# screen-space effects and lightning apply.
	if _room.backdrop:
		if lightning:
			_add_lightning()
		return
	_cone = _room.flashlight.get_node("Cone")
	if demo_flashlight and not _room.held.has("flashlight"):
		_room.held["flashlight"] = true
		_room.flashlight.toggle()
	if rain_in_beam:
		_add_beam_rain()
	if lightning:
		_add_lightning()


func _process(delta: float) -> void:
	if _rain_light:
		_rain_light.enabled = _cone.enabled
		_rain_light.position = _cone.position
		_rain_light.rotation = _cone.rotation
	if _overlay:
		_step_overlay(delta)
	for c: Array in _clouds:
		var node: Node2D = c[0]
		node.position.x += c[1] * delta
		if node.position.x > _screen().x + c[2]:
			node.position.x = -c[2]
	if _bolt:
		if _forced_strike >= 0.0:
			_forced_strike -= delta
			if _forced_strike < 0.0:
				_strike()
		elif interval_max > 0.0:
			_next_strike -= delta
			if _next_strike <= 0.0:
				_strike()


# ── Clouds (CloudEffect.ts port) ───────────────────────────────────────

## Three rows, two banks each, same speed per row so spacing never drifts;
## random phase per row so each load looks different.
func _add_clouds() -> void:
	var layer := CanvasLayer.new()
	layer.name = "WeatherClouds"
	layer.layer = 2  # under the rain (3)
	add_child(layer)
	var w := _screen().x
	for row: Array in [[10.0, 14.0, 640.0, 176.0], [200.0, 20.0, 660.0, 200.0], [370.0, 16.0, 650.0, 184.0]]:
		var half_cycle: float = (w + 2.0 * row[2]) / 2.0
		var phase: float = randf() * (w + row[2]) - row[2]
		for i in 2:
			var cloud := Node2D.new()
			cloud.position = Vector2(phase + half_cycle * i, row[0] + (randf() - 0.5) * 40.0)
			var size := Vector2(row[2], row[3])
			cloud.draw.connect(_draw_cloud.bind(cloud, size))
			layer.add_child(cloud)
			_clouds.append([cloud, row[1], row[2]])


func _draw_cloud(cloud: Node2D, size: Vector2) -> void:
	var w := size.x
	var h := size.y
	var body := Color8(0x11, 0x16, 0x20, int(0.92 * 255))
	var lit := Color8(0x1e, 0x28, 0x40, int(0.45 * 255))
	cloud.draw_rect(Rect2(0, h * 0.45, w, h * 0.55), body)
	cloud.draw_rect(Rect2(w * 0.08, h * 0.22, w * 0.32, h * 0.40), body)
	cloud.draw_rect(Rect2(w * 0.35, 0, w * 0.40, h * 0.55), body)
	cloud.draw_rect(Rect2(w * 0.68, h * 0.28, w * 0.26, h * 0.38), body)
	cloud.draw_rect(Rect2(w * 0.35, 0, w * 0.40, h * 0.12), lit)
	cloud.draw_rect(Rect2(w * 0.08, h * 0.22, w * 0.32, h * 0.10), lit)


# ── Rain overlay (RainEffect.ts port) ──────────────────────────────────

func _add_overlay() -> void:
	var layer := CanvasLayer.new()
	layer.name = "WeatherRain"
	layer.layer = 3  # screen space: no zoom, no darkness; under StylePost (5) and HUD (10)
	add_child(layer)
	_overlay = Node2D.new()
	layer.add_child(_overlay)
	_overlay.draw.connect(_draw_overlay)
	var size := _screen()
	var mild := rain_mode == "mild"
	for i in (80 if mild else 160):
		_drops.append([randf() * (size.x + 40.0) - 20.0, randf() * size.y,
			(400.0 + randf() * 280.0) if mild else (920.0 + randf() * 400.0)])


func _step_overlay(delta: float) -> void:
	var size := _screen()
	var mild := rain_mode == "mild"
	var dt := minf(delta, 0.1)
	for d in _drops:
		d[1] += d[2] * dt
		if not mild:
			d[0] += d[2] * 0.36 * dt
		if d[1] > size.y + 24.0:
			d[1] = -24.0
			d[0] = randf() * (size.x + 40.0) - 20.0
		if d[0] > size.x + 30.0:
			d[0] -= size.x + 60.0
	_overlay.queue_redraw()


func _draw_overlay() -> void:
	var mild := rain_mode == "mild"
	var length := 16.0 if mild else 24.0
	var slant := 0.0 if mild else length * 0.36
	var colour := Color(0.667, 0.8, 1.0, 0.35 if mild else 0.55)
	for d in _drops:
		_overlay.draw_line(Vector2(d[0] - slant, d[1] - length), Vector2(d[0], d[1]), colour, 4.0)


# ── Rain in the beam ────────────────────────────────────────────────────

func _add_beam_rain() -> void:
	var size := Vector2(_room.room_size * WardenData.TILE)
	var rect := ColorRect.new()
	rect.name = "WeatherBeamRain"
	rect.size = size
	rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_beam_mat = ShaderMaterial.new()
	_beam_mat.shader = RainBeamShader
	_beam_mat.set_shader_parameter("rect_size", size)
	_beam_mat.set_shader_parameter("density", beam_rain_density)
	rect.material = _beam_mat
	rect.light_mask = RAIN_MASK
	_room.add_child(rect)

	# Its own copy of the beam at fixed brightness: the room's cone runs at
	# energy = darkLevel (0.4 here), which would leave the rain too faint.
	_rain_light = PointLight2D.new()
	_rain_light.name = "RainLight"
	_rain_light.texture = _cone.texture
	_rain_light.texture_scale = _cone.texture_scale
	_rain_light.energy = beam_rain_brightness
	_rain_light.range_item_cull_mask = RAIN_MASK
	_rain_light.shadow_enabled = true
	_rain_light.shadow_filter = _cone.shadow_filter
	_rain_light.shadow_item_cull_mask = _cone.shadow_item_cull_mask
	_cone.get_parent().add_child(_rain_light)

	# And round the player: a copy of the 72px ambient circle that lights only
	# the rain, so splashes at your feet show even with the flashlight off.
	if rain_in_ambient:
		var ambient: PointLight2D = _cone.get_parent().get_node("Ambient")
		var around := PointLight2D.new()
		around.name = "RainAmbient"
		around.texture = ambient.texture
		around.texture_scale = ambient.texture_scale
		around.energy = beam_rain_brightness * 0.8
		around.range_item_cull_mask = RAIN_MASK
		ambient.get_parent().add_child(around)


# ── Lightning ───────────────────────────────────────────────────────────

func _add_lightning() -> void:
	_bolt = DirectionalLight2D.new()
	_bolt.name = "Lightning"
	_bolt.enabled = false
	_bolt.energy = 0.0
	_bolt.range_item_cull_mask = 1 | RAIN_MASK | 16 | 32  # world, rain, object tops, and you (flashlight OBJECT/HOLDER masks)
	# No Godot shadows: 2D directional shadows are infinitely long, and in a
	# walled city nearly everything fell in one (the flash lit a single
	# sliver). The finite shadows come from _add_lightning_shadows instead.
	_bolt.shadow_enabled = false
	_room.add_child(_bolt)
	if lightning_shadows:
		_add_lightning_shadows()
	if thunder:
		for f in DirAccess.get_files_at("res://audio"):
			if f.begins_with("thunder_") and f.ends_with(".wav"):
				var stream: AudioStream = load("res://audio/" + f)
				(_thunder_near if f.begins_with("thunder_near") else _thunder_far).append(stream)

	var layer := CanvasLayer.new()
	layer.name = "WeatherFlash"
	layer.layer = 4
	_flash = ColorRect.new()
	_flash.color = Color(0.85, 0.9, 1.0, 0.0)
	_flash.set_anchors_preset(Control.PRESET_FULL_RECT)
	_flash.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(_flash)
	add_child(layer)
	_next_strike = randf_range(interval_min, maxf(interval_min, interval_max))


## Lightning shadows are a cast layer from the room's WallShadows node: the
## same shader and art-silhouette masks as the rim / sky shadows, so partial
## tiles throw their own shape, not a box. Hard-edged; animated per strike.
func _add_lightning_shadows() -> void:
	var walls := _room.get_node_or_null("WallShadows")
	if walls == null:
		push_warning("[weather] no WallShadows node in this room — lightning without shadows")
		return
	var layer: Sprite2D = walls.new_cast_layer("WeatherLightningShadows")
	_shadow_mat = layer.material
	_shadow_mat.set_shader_parameter("cast_length", shadow_length)
	_shadow_mat.set_shader_parameter("cast_softness", 0.0)  # lightning is a point-sharp source


## A double flash: bright, dip, bright again, long fade. Shadows fall away
## from a random bearing each strike.
func _strike() -> void:
	_next_strike = randf_range(interval_min, maxf(interval_min, interval_max))
	var bearing := deg_to_rad(randf_range(-40.0, 40.0))
	_bolt.rotation = bearing
	if _shadow_mat:
		_shadow_mat.set_shader_parameter("cast_dir", Vector2(sin(bearing), cos(bearing)))
	_bolt.enabled = true
	if thunder and not (_thunder_near.is_empty() and _thunder_far.is_empty()):
		var wait := randf_range(0.2, 3.5)
		get_tree().create_timer(wait).timeout.connect(_play_thunder.bind(wait, Vector2(sin(bearing), cos(bearing))))
	var tw := create_tween()
	tw.tween_method(_set_flash, 0.0, 1.0, 0.04)
	tw.tween_method(_set_flash, 1.0, 0.15, 0.08)
	tw.tween_method(_set_flash, 0.15, 0.85, 0.04)
	tw.tween_method(_set_flash, 0.85, 0.0, 0.5)
	tw.tween_callback(func() -> void: _bolt.enabled = false)


## Sound travels ~340 m/s, so the gap after the flash says how far away the
## strike was: near = crack, louder; far = distant roll, quieter. Placed off
## towards the strike (opposite the way shadows fall) so it pans that way.
func _play_thunder(wait: float, shadow_dir: Vector2) -> void:
	var near := wait < 1.2
	var pool := _thunder_near if (near and not _thunder_near.is_empty()) or _thunder_far.is_empty() else _thunder_far
	var player := AudioStreamPlayer2D.new()
	player.stream = pool.pick_random()
	player.volume_db = thunder_volume_db - wait * 2.0
	player.max_distance = 100000.0
	player.attenuation = 0.0  # volume comes from the wait, not the distance
	_room.add_child(player)
	var listener: Vector2 = _room.player.global_position if _room.player else Vector2(_room.room_size * WardenData.TILE) / 2.0
	player.global_position = listener - shadow_dir * 600.0
	player.play()
	player.finished.connect(player.queue_free)


## One 0..1 knob drives the light, the screen wash and the shadows together.
func _set_flash(k: float) -> void:
	_bolt.energy = flash_energy * k
	_flash.color.a = 0.2 * k
	if _shadow_mat:
		_shadow_mat.set_shader_parameter("cast_strength", clampf(k * 1.1, 0.0, 0.9))


# ── helpers ─────────────────────────────────────────────────────────────

func _screen() -> Vector2:
	return get_viewport().get_visible_rect().size


func _apply_args() -> void:
	for arg in OS.get_cmdline_user_args():
		if not arg.begins_with("--weather="):
			continue
		demo_flashlight = false
		clouds = false
		rain_overlay = false
		rain_in_beam = false
		rain_in_ambient = false
		lightning = false
		for item in arg.trim_prefix("--weather=").split(","):
			match item.get_slice("@", 0):
				"flashlight": demo_flashlight = true
				"clouds": clouds = true
				"overlay": rain_overlay = true
				"beam": rain_in_beam = true
				"ambient":
					rain_in_beam = true  # same rain layer, lit by the circle
					rain_in_ambient = true
				"lightning": lightning = true
				"strike":
					lightning = true
					interval_max = 0.0  # no random strikes; just the forced one
					_forced_strike = float(item.get_slice("@", 1))
