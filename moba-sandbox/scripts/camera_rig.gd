extends Camera2D
## Free camera, Dota-style: push the mouse against a screen edge (or use the
## arrow keys) to pan; Space snaps to the hero (hold to keep following);
## Y toggles a lock that follows the hero permanently. Stays inside the map.

const EDGE := 18.0          # px from the window edge that start panning
const PAN_SPEED := 1500.0   # screen px per second
const MAP_HALF := 3000.0

var hero: Node2D
var locked := false
## Edge panning only while the mouse is really in the window — otherwise a
## cursor that left through an edge would keep the view drifting.
var _mouse_in := false


func _ready() -> void:
	position = hero.position
	make_current()
	get_window().mouse_exited.connect(func() -> void: _mouse_in = false)


func _process(delta: float) -> void:
	if locked or Input.is_physical_key_pressed(KEY_SPACE):
		position = hero.position
	else:
		var dir := Vector2.ZERO
		var vp := get_viewport()
		if _mouse_in and DisplayServer.window_is_focused():
			dir += edge_direction(vp.get_mouse_position(), vp.get_visible_rect().size)
		dir += Vector2(
			float(Input.is_physical_key_pressed(KEY_RIGHT)) - float(Input.is_physical_key_pressed(KEY_LEFT)),
			float(Input.is_physical_key_pressed(KEY_DOWN)) - float(Input.is_physical_key_pressed(KEY_UP)))
		if dir != Vector2.ZERO:
			position += dir.normalized() * PAN_SPEED * delta / zoom.x
	var half := get_viewport_rect().size / 2.0 / zoom
	position = position.clamp(Vector2(-MAP_HALF, -MAP_HALF) + half, Vector2(MAP_HALF, MAP_HALF) - half)


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_mouse_in = true  # any motion means the cursor is over the window


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key and key.pressed and not key.echo and key.physical_keycode == KEY_Y:
		locked = not locked


## Which way to pan for a mouse at `m` in a window of `size` (zero when the
## mouse is away from the edges or outside the window).
static func edge_direction(m: Vector2, size: Vector2) -> Vector2:
	if m.x < 0.0 or m.y < 0.0 or m.x > size.x or m.y > size.y:
		return Vector2.ZERO
	var d := Vector2.ZERO
	if m.x <= EDGE:
		d.x -= 1.0
	elif m.x >= size.x - EDGE:
		d.x += 1.0
	if m.y <= EDGE:
		d.y -= 1.0
	elif m.y >= size.y - EDGE:
		d.y += 1.0
	return d
