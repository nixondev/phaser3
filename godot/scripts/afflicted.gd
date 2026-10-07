extends CharacterBody2D
## Port of src/entities/Afflicted.ts — same constants, states and behaviour
## loops. room.gd spawns these from rooms.json (GameScene.spawnAfflicted),
## frightens them with the flashlight, and handles touch → cure / death.
##
##   wandering   drifts near its origin (blue tint, slow squash)
##   agitated    chases the player (red, fast squash) — within 240 px,
##               gives up beyond 480
##   frightened  flees the player (pale yellow, jitter) — calms at 600 px;
##               sentinels are immune
##   cured       still, green tint, human sheet — E to talk
##   recovered   still, no tint
##
## Behaviour loops: wander, sentinel (still; agitates), drift (3× radius, no
## pauses, NEVER agitates), pace (to and fro along paceAngle/paceLength),
## circle (orbits at wanderRadius, circleSpeed °/s).
##
## Not ported yet: the proximity sound (a MIDI loop in Phaser).

const PlayerScript := preload("res://scripts/player.gd")
const CharacterShadow := preload("res://scripts/character_shadow.gd")

const WANDER_SPEED := 80.0
const WANDER_PAUSE_MIN := 1.5
const WANDER_PAUSE_MAX := 4.0
const WANDER_RANGE := 128.0
const AGITATE_RANGE := 240.0
const AGITATE_SPEED := 300.0
const CALM_RANGE := 480.0
const FRIGHTEN_SPEED := 400.0
const FRIGHTEN_CALM := 600.0

## Physics layers (see room.gd): walls 1, player 2, afflicted 3.
const LAYER_WALLS := 1
const LAYER_PLAYER := 2
const LAYER_AFFLICTED := 4

const TINTS := {
	"wandering": Color("#aaaaff"), "agitated": Color("#ffaaaa"), "frightened": Color("#ffeebb"),
	"cured": Color("#ccffcc"), "recovered": Color.WHITE,
}

var afflicted_id := ""       # cast slug, or the placement id for extras
var character_id := ""       # "" for anonymous extras
var resident_name := "Unknown"
var role := ""
var status := "wandering"
var behavior := "wander"
var home_room := ""
var cured_clue := ""
var backstory: Array = []
var holds: Array = []

var sprite: AnimatedSprite2D
var _afflicted_frames: SpriteFrames
var _human_frames: SpriteFrames
var _base_scale := 1.0
var _facing := "down"
var _origin := Vector2.ZERO
var _wander_radius := WANDER_RANGE
var _speed_mult := 1.0
var _wander_target: Variant = null
var _pause := 0.0
var _pace_b := Vector2.ZERO
var _pacing_to_b := true
var _circle_angle := 0.0
var _circle_speed := 0.0
var _squash: Tween
var _touch: Area2D


## def = the rooms.json placement; character = its characters.json entry or {}.
func setup(def: Dictionary, character: Dictionary, initial_status: String, sprite_scale: float) -> void:
	afflicted_id = def.get("character", def.get("id", ""))
	character_id = def.get("character", "")
	resident_name = character.get("name", def.get("name", "Unknown"))
	role = character.get("role", "")
	behavior = def.get("behaviorLoop", "wander")
	home_room = character.get("home", {}).get("room", "")
	cured_clue = character.get("curedClue", "")
	backstory = character.get("backstory", [])
	holds = def.get("holds", [])
	_origin = Vector2(def["x"], def["y"])
	position = _origin
	_wander_radius = float(def.get("wanderRadius", WANDER_RANGE))
	_speed_mult = float(def.get("speedMult", 1.0))
	if behavior == "pace":
		var a := deg_to_rad(float(def.get("paceAngle", 0.0)))
		_pace_b = _origin + Vector2(cos(a), sin(a)) * float(def.get("paceLength", 128.0))
	if behavior == "circle":
		_circle_angle = deg_to_rad(float(def.get("circleStartAngle", 0.0)))
		_circle_speed = deg_to_rad(float(def.get("circleSpeed", 45.0)))

	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING
	collision_layer = LAYER_AFFLICTED
	collision_mask = LAYER_WALLS  # walls only: Phaser has no afflicted↔afflicted or ↔player collider

	var sheet_name: String = character.get("afflictedSheet", def.get("afflictedSheet", "afflicted-walker"))
	_afflicted_frames = PlayerScript.make_frames(WardenData.texture("sprites/%s.png" % sheet_name))
	if character.has("sheet"):
		_human_frames = PlayerScript.make_frames(WardenData.texture("sprites/%s.png" % character["sheet"]))
	sprite = AnimatedSprite2D.new()
	_base_scale = sprite_scale
	sprite.scale = Vector2.ONE * sprite_scale
	add_child(sprite)
	var shadow := CharacterShadow.new()
	shadow.name = "Shadow"
	shadow.sprite = sprite
	add_child(shadow)
	move_child(shadow, 0)

	# Body fixed in world px at the feet, like Player (28×42, feet at y 62).
	var rect := RectangleShape2D.new()
	rect.size = Vector2(PlayerScript.BODY_W, PlayerScript.BODY_H)
	var offset := Vector2(0, (PlayerScript.FEET_Y - 32.0) * sprite_scale - PlayerScript.BODY_H / 2.0)
	var shape := CollisionShape2D.new()
	shape.shape = rect
	shape.position = offset
	add_child(shape)
	# The touch test: Phaser's player↔afflicted overlap (polled each frame
	# by room.gd, like an arcade overlap — not just on first contact).
	_touch = Area2D.new()
	_touch.collision_layer = 0
	_touch.collision_mask = LAYER_PLAYER
	var touch_shape := CollisionShape2D.new()
	touch_shape.shape = rect
	touch_shape.position = offset
	_touch.add_child(touch_shape)
	add_child(_touch)

	status = initial_status
	_apply_visuals()
	if status == "wandering":
		_pick_wander_target()


func is_cast() -> bool:
	return character_id != ""


func touches(body: Node2D) -> bool:
	return _touch.overlaps_body(body)


func is_calm() -> bool:
	return status == "cured" or status == "recovered"


## Afflicted.updateAI, run each physics frame with the player's position.
func update_ai(player_pos: Vector2, delta: float) -> void:
	velocity = Vector2.ZERO
	if is_calm():
		_animate()
		return
	var dist := position.distance_to(player_pos)

	if status == "wandering" and dist < AGITATE_RANGE and behavior != "drift":
		set_status("agitated")
		return
	if status == "agitated" and dist >= CALM_RANGE:
		set_status("wandering")
		return
	if status == "frightened" and dist >= FRIGHTEN_CALM:
		set_status("wandering")
		return

	if status == "agitated":
		velocity = position.direction_to(player_pos) * AGITATE_SPEED * _speed_mult
	elif status == "frightened":
		velocity = player_pos.direction_to(position) * FRIGHTEN_SPEED * _speed_mult
	elif behavior == "sentinel":
		pass
	elif behavior == "pace":
		var target := _pace_b if _pacing_to_b else _origin
		if position.distance_to(target) < 6.0:
			_pacing_to_b = not _pacing_to_b
		else:
			velocity = position.direction_to(target) * WANDER_SPEED * _speed_mult
	elif behavior == "circle":
		_circle_angle += _circle_speed * delta
		var t := _origin + Vector2(cos(_circle_angle), sin(_circle_angle)) * _wander_radius
		var arc := _wander_radius * _circle_speed * _speed_mult
		# Arc speed + a correction term that pulls back onto the orbit after a collision.
		velocity = position.direction_to(t) * (arc + position.distance_to(t) * 4.0)
	elif _wander_target != null:
		if position.distance_to(_wander_target) < 4.0:
			_wander_target = null
			if behavior == "drift":
				_pick_wander_target()  # no pause
			else:
				_pause = randf_range(WANDER_PAUSE_MIN, WANDER_PAUSE_MAX)
		else:
			velocity = position.direction_to(_wander_target) * WANDER_SPEED * _speed_mult
	elif _pause > 0.0:
		_pause -= delta
		if _pause <= 0.0:
			_pick_wander_target()
	move_and_slide()
	_animate()


func set_status(new_status: String) -> void:
	if status == new_status:
		return
	if new_status == "frightened" and behavior == "sentinel":
		return  # sentinels react to proximity, never to light
	status = new_status
	velocity = Vector2.ZERO
	_wander_target = null
	_pause = 0.0
	_apply_visuals()
	if status == "wandering":
		_pick_wander_target()


func _pick_wander_target() -> void:
	if behavior in ["pace", "sentinel", "circle"]:
		return
	var radius := _wander_radius * 3.0 if behavior == "drift" else _wander_radius
	var a := randf() * TAU
	_wander_target = _origin + Vector2(cos(a), sin(a)) * randf() * radius


## Tint + the squash/jitter "breathing" per state (Afflicted.setupVisuals);
## cured/recovered switch to the human sheet.
func _apply_visuals() -> void:
	if _squash:
		_squash.kill()
	sprite.scale = Vector2.ONE * _base_scale
	sprite.modulate = TINTS.get(status, Color.WHITE)
	sprite.sprite_frames = _human_frames if is_calm() and _human_frames else _afflicted_frames
	sprite.play("idle-" + _facing)
	var b := _base_scale
	match status:
		"wandering": _breathe(Vector2(b, b), Vector2(b * 1.05, b * 0.95), 0.6)
		"agitated": _breathe(Vector2(b, b), Vector2(b * 1.12, b * 0.88), 0.2)
		"frightened": _breathe(Vector2(b * 0.9, b * 1.1), Vector2(b * 1.1, b * 0.9), 0.12)


func _breathe(from: Vector2, to: Vector2, half: float) -> void:
	sprite.scale = from
	_squash = create_tween().set_loops()
	_squash.tween_property(sprite, "scale", to, half).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	_squash.tween_property(sprite, "scale", from, half).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


func _animate() -> void:
	if velocity.length() > 0.01:
		if absf(velocity.y) >= absf(velocity.x):
			_facing = "up" if velocity.y < 0 else "down"
		else:
			_facing = "left" if velocity.x < 0 else "right"
		sprite.play("walk-" + _facing)
	else:
		sprite.play("idle-" + _facing)
