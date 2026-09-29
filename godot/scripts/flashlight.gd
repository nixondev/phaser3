extends Node2D
## Port of src/systems/Flashlight.ts + DarknessOverlay.ts's ambient circle,
## rebuilt on Godot's 2D lights instead of erasing a darkness RenderTexture.
##
## Darkness is a CanvasModulate (room.gd) that multiplies the world by
## (1 - darkLevel) — the same result as Phaser's black overlay at alpha
## darkLevel. These lights add the lost brightness back, so energy =
## darkLevel restores the art exactly where fully lit.
##
## Three lights, all children of the player:
##   ambient   72px circle round the player, no shadows (AMBIENT_RADIUS)
##   cone      the beam; shadow_enabled, so Collision walls block it —
##             new here, Phaser's cone passes through walls
##   spectra   same cone, but lights ONLY light_mask 2 (the Hidden node and
##             Spectra layer, drawn LIGHT_ONLY) — the adapter's reveal

const RANGE := 384.0
const HALF_ANGLE := PI / 5.0
const BATTERY_MAX := 100.0
const BATTERY_DRAIN_RATE := 2.0  # percent per second
const AMBIENT_RADIUS := 72.0

## Player.getFlashlightOrigin() / getFacingAngle(), per facing.
const ORIGIN := {"up": Vector2(12, -4), "down": Vector2(-12, 12), "left": Vector2(-8, 4), "right": Vector2(8, 4)}
const ANGLE := {"up": -PI / 2.0, "down": PI / 2.0, "left": PI, "right": 0.0}

const WORLD_MASK := 1
const SPECTRA_MASK := 2
## Tops of partial-tile objects (desk, crates) — room.gd moves them to their
## own layer on this bit. Lit by an UNSHADOWED copy of the beam: seen from
## above their art is the object's top, so their own occluder (or a
## neighbouring tile's, in a multi-tile desk) must not darken it.
const OBJECT_MASK := 16
## The character holding the flashlight. The ambient circle lights them;
## the beam doesn't — it points away from the body, so it shouldn't wash
## over their back (facing up) or front (facing down).
const HOLDER_MASK := 32

var on := false
var charge := BATTERY_MAX
## Set by room.gd when the active character carries the spectra adapter.
var adapted := false

var _ambient: PointLight2D
var _cone: PointLight2D
var _spectra: PointLight2D
var _cone_objects: PointLight2D

static var _cone_tex: Texture2D
static var _disc_tex: Texture2D


func setup(dark_level: float) -> void:
	_ambient = PointLight2D.new()
	_ambient.name = "Ambient"
	_ambient.texture = _disc_texture()
	_ambient.energy = dark_level
	_ambient.range_item_cull_mask = WORLD_MASK | OBJECT_MASK | HOLDER_MASK
	add_child(_ambient)

	_cone = _cone_light("Cone", dark_level, WORLD_MASK)
	_cone_objects = _cone_light("ConeObjects", dark_level, OBJECT_MASK)
	_cone_objects.shadow_enabled = false
	# LIGHT_ONLY items render albedo × light (CanvasModulate doesn't dim light),
	# so energy 1 shows them at their true colour.
	_spectra = _cone_light("Spectra", 1.0, SPECTRA_MASK)
	_apply()


func toggle() -> void:
	if not on and charge <= 0.0:
		return  # Cannot turn on if no charge
	on = not on
	_apply()


func turn_off() -> void:
	on = false
	_apply()


func set_adapted(value: bool) -> void:
	adapted = value
	_apply()


func recharge() -> void:
	charge = BATTERY_MAX


func battery_percent() -> float:
	return charge / BATTERY_MAX * 100.0


func aim(facing: String) -> void:
	for light: PointLight2D in [_cone, _cone_objects, _spectra]:
		light.position = ORIGIN[facing]
		light.rotation = ANGLE[facing]


func _process(delta: float) -> void:
	if not on:
		return
	charge -= BATTERY_DRAIN_RATE * delta
	if charge <= 0.0:
		charge = 0.0
		turn_off()


func _apply() -> void:
	_cone.enabled = on
	_cone_objects.enabled = on
	_spectra.enabled = on and adapted


func _cone_light(lname: String, energy: float, mask: int) -> PointLight2D:
	var light := PointLight2D.new()
	light.name = lname
	light.texture = _cone_texture()
	light.texture_scale = RANGE * 2.5 / _cone_tex.get_width()
	light.energy = energy
	light.range_item_cull_mask = mask
	light.shadow_enabled = true
	light.shadow_filter = Light2D.SHADOW_FILTER_PCF5
	light.shadow_item_cull_mask = WORLD_MASK
	add_child(light)
	return light


## Beam pointing right (+x), centred in the texture. Matches the Phaser
## erase stack: ~full inside RANGE / HALF_ANGLE, a 0.45 feather out to
## 1.2×RANGE / 1.4×HALF_ANGLE, with soft edges instead of polygon steps.
static func _cone_texture() -> Texture2D:
	if _cone_tex:
		return _cone_tex
	const N := 384
	var world_per_px := RANGE * 2.5 / N
	var img := Image.create_empty(N, N, false, Image.FORMAT_RGBA8)
	for py in N:
		for px in N:
			var d := (Vector2(px, py) - Vector2(N, N) / 2.0) * world_per_px
			var dist := d.length()
			var ang := absf(d.angle())
			var inner := _edge(dist, RANGE, 14.0) * _edge(ang, HALF_ANGLE, 0.04)
			var outer := _edge(dist, RANGE * 1.2, 14.0) * _edge(ang, HALF_ANGLE * 1.4, 0.04)
			var v := 0.45 * outer + 0.55 * inner
			img.set_pixel(px, py, Color(v, v, v, 1.0))
	_cone_tex = ImageTexture.create_from_image(img)
	return _cone_tex


static func _disc_texture() -> Texture2D:
	if _disc_tex:
		return _disc_tex
	var n := int(AMBIENT_RADIUS * 2.0 + 8.0)
	var img := Image.create_empty(n, n, false, Image.FORMAT_RGBA8)
	for py in n:
		for px in n:
			var dist := (Vector2(px, py) - Vector2(n, n) / 2.0).length()
			var v := _edge(dist, AMBIENT_RADIUS, 1.5)
			img.set_pixel(px, py, Color(v, v, v, 1.0))
	_disc_tex = ImageTexture.create_from_image(img)
	return _disc_tex


## 1 below `at`, 0 above, smoothed over ±width.
static func _edge(x: float, at: float, width: float) -> float:
	return 1.0 - smoothstep(at - width, at + width, x)
