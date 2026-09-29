extends Node2D
## Shadows under a character (Player, Afflicted). Replaces Entity.ts's three
## stacked ellipses with two layers tied to the room's WallShadows node, so
## characters and buildings agree about where the light is:
##
##   contact  the character's CURRENT frame flattened straight down under
##            the feet and softened (the item-shadow trick) — always on; the
##            shape follows the pose, stride and body
##   cast     the character's CURRENT animation frame as a flat silhouette on
##            the ground, pointing along WallShadows' cast bearing — only in
##            rooms whose WallShadows includes the cast (outdoors). It walks
##            when they walk.
##
## Settings live on WallShadows ("Characters" group); read once at spawn.

## Where the feet are in the unscaled 64px frame (Player.FEET_Y).
const FEET_Y := 62.0
## How flat the contact silhouette is laid under the feet.
const CONTACT_FLATTEN := 0.22
## Edge softness default (px) when the room has no WallShadows node; the
## room's WallShadows.shadow_softness sets it otherwise. Each shadow is drawn
## as faint copies on two rings (radius softness/2 and softness), nearer ones
## heavier, so the edge fades out over about that many px.
const DEFAULT_SOFTNESS := 2.5

static var _soft := {}  # softness -> [[offset: Vector2, weight: float], ...], weights sum to 1

var sprite: AnimatedSprite2D
var contact := 0.45
var cast_strength := 0.0
var cast_dir := Vector2(0.447, 0.894)
## Shadow length per px of height above the feet.
var cast_scale := 0.6
var softness := DEFAULT_SOFTNESS


func _ready() -> void:
	show_behind_parent = true
	var walls := _find_wall_shadows()
	if walls:
		contact = walls.character_contact
		softness = walls.shadow_softness
		if walls.character_cast and walls.compare in ["cast", "rim + cast"]:
			cast_strength = walls.cast_strength * 0.8
			var b := deg_to_rad(walls.cast_bearing)
			cast_dir = Vector2(sin(b), cos(b))
			cast_scale = walls.character_cast_scale
	visible = contact > 0.0 or cast_strength > 0.0


func _process(_delta: float) -> void:
	queue_redraw()  # follows the walk cycle and the afflicted squash


func _draw() -> void:
	if sprite == null:
		return
	var s := sprite.scale
	var feet := sprite.position + Vector2(0, (FEET_Y - 32.0) * s.y)

	if cast_strength > 0.0:
		var frame := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
		if frame:
			# Frame pixel (x, y) lands on the ground at
			#   feet + ((x − 32)·sx, 0) + (FEET_Y − y)·k·sy·dir
			# i.e. flattened and laid out along the light direction, from the feet.
			var k := cast_scale * s.y
			var origin := feet + Vector2(-32.0 * s.x, 0) + cast_dir * FEET_Y * k
			for tap: Array in soft_taps(softness):
				draw_set_transform_matrix(Transform2D(Vector2(s.x, 0), -cast_dir * k, origin + tap[0]))
				draw_texture(frame, Vector2.ZERO, Color(0, 0, 0.02, _tap_alpha(cast_strength, tap[1])))
			draw_set_transform_matrix(Transform2D.IDENTITY)

	if contact > 0.0:
		var frame := sprite.sprite_frames.get_frame_texture(sprite.animation, sprite.frame)
		if frame:
			# The frame squashed vertically about its middle, centred on the
			# feet (nudged towards the light's far side, as Entity.ts did).
			var size := Vector2(64.0 * s.x, 64.0 * s.y * CONTACT_FLATTEN)
			var centre := feet + cast_dir * 3.0
			for tap: Array in soft_taps(softness):
				draw_texture_rect(frame, Rect2(centre - size / 2.0 + tap[0], size), false,
					Color(0, 0, 0.02, _tap_alpha(contact, tap[1])))


## Centre + 8 taps at softness/2 + 8 at softness; weights 1 : 0.7 : 0.35.
## Softness 0 = a single hard copy. Cached per softness value.
static func soft_taps(soft_px: float) -> Array:
	if not _soft.has(soft_px):
		var taps := [[Vector2.ZERO, 1.0]]
		for ring: Array in ([] if soft_px <= 0.0 else [[soft_px * 0.5, 0.7], [soft_px, 0.35]]):
			for i in 8:
				taps.append([Vector2.from_angle(i * TAU / 8.0 + ring[0] * 0.2) * ring[0], ring[1]])
		var total := 0.0
		for t: Array in taps:
			total += t[1]
		for t: Array in taps:
			t[1] /= total
		_soft[soft_px] = taps
	return _soft[soft_px]


## Per-copy alpha so the stacked copies reach `strength` where they all
## overlap (inside the shape) and fade across the edge.
static func _tap_alpha(strength: float, weight: float) -> float:
	return 1.0 - pow(1.0 - clampf(strength, 0.0, 0.99), weight)


func _find_wall_shadows() -> Node:
	var n := get_parent()
	while n:
		if n.has_node("WallShadows"):
			return n.get_node("WallShadows")
		n = n.get_parent()
	return null
