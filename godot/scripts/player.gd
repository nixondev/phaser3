extends CharacterBody2D
## Port of src/entities/Player.ts: 4x4 sheet (rows down/left/right/up,
## 4 walk frames each), 220 px/s, 8 fps. The physics body stays
## 28x42 world px at the feet whatever the sprite scale (visual only).

const SPEED := 220.0
const ANIM_FPS := 8.0
const BODY_W := 28.0
const BODY_H := 42.0
const FEET_Y := 62.0
const DIR_ROWS := {"down": 0, "left": 1, "right": 2, "up": 3}
const CharacterShadow := preload("res://scripts/character_shadow.gd")

var facing := "down"
var sprite: AnimatedSprite2D
## Stand still (dialog open, inventory mode) — GameScene stops the body too.
var frozen := false


func setup(sheet: Texture2D, sprite_scale: float) -> void:
	motion_mode = CharacterBody2D.MOTION_MODE_FLOATING

	sprite = AnimatedSprite2D.new()
	sprite.sprite_frames = make_frames(sheet)
	sprite.scale = Vector2.ONE * sprite_scale
	add_child(sprite)
	var shadow := CharacterShadow.new()
	shadow.name = "Shadow"
	shadow.sprite = sprite
	add_child(shadow)
	move_child(shadow, 0)

	# Feet sit FEET_Y px down the unscaled 64px frame (centre = 32).
	var rect := RectangleShape2D.new()
	rect.size = Vector2(BODY_W, BODY_H)
	var shape := CollisionShape2D.new()
	shape.shape = rect
	shape.position = Vector2(0, (FEET_Y - 32.0) * sprite_scale - BODY_H / 2.0)
	add_child(shape)

	sprite.play("idle-down")


## Player.setSheet — character switch.
func set_sheet(sheet: Texture2D) -> void:
	sprite.sprite_frames = make_frames(sheet)
	sprite.play("idle-" + facing)


## animHelpers.ensureCharacterAnims: walk-<dir> (4 frames, 8 fps) and
## idle-<dir> (the row's first frame) from a 4×4 sheet. Shared with afflicted.
static func make_frames(sheet: Texture2D) -> SpriteFrames:
	var frames := SpriteFrames.new()
	for dir: String in DIR_ROWS:
		var row: int = DIR_ROWS[dir]
		frames.add_animation("walk-" + dir)
		frames.set_animation_speed("walk-" + dir, ANIM_FPS)
		frames.add_animation("idle-" + dir)
		for i in 4:
			var frame := AtlasTexture.new()
			frame.atlas = sheet
			frame.region = Rect2(i * 64, row * 64, 64, 64)
			frames.add_frame("walk-" + dir, frame)
			if i == 0:
				frames.add_frame("idle-" + dir, frame)
	return frames


func _physics_process(_delta: float) -> void:
	if frozen:
		velocity = Vector2.ZERO
		sprite.play("idle-" + facing)
		return
	var input := Vector2(
		_axis(KEY_D, KEY_RIGHT) - _axis(KEY_A, KEY_LEFT),
		_axis(KEY_S, KEY_DOWN) - _axis(KEY_W, KEY_UP))
	velocity = input.normalized() * SPEED
	move_and_slide()

	if input == Vector2.ZERO:
		sprite.play("idle-" + facing)
		return
	if absf(input.x) > absf(input.y):
		facing = "right" if input.x > 0 else "left"
	else:
		facing = "down" if input.y > 0 else "up"
	sprite.play("walk-" + facing)


func _axis(a: Key, b: Key) -> float:
	return 1.0 if Input.is_physical_key_pressed(a) or Input.is_physical_key_pressed(b) else 0.0
