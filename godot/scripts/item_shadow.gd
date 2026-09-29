extends Node2D
## A pickup's shadow shaped like the item itself: its own silhouette,
## flattened onto the ground beneath it and softened slightly, instead of a
## generic ellipse. `lift` (0–1, animated with the bob) shrinks and fades it
## as the item rises. Child of the item's Sprite2D; draws behind it.
##
## Outdoors (the room's WallShadows includes the cast, and characters cast),
## it leans along the same sky bearing as buildings and characters — a bit
## further at the top of the bob, as a raised object's shadow would.

## How flat the silhouette is laid on the ground (height → depth).
const FLATTEN := 0.3
## Distance from the item's centre down to the ground (half a tile).
const GROUND := 26.0
const ALPHA := 0.55
## Outdoor lean along the cast bearing: at rest, and extra at full lift.
const LEAN := 5.0
const LIFT_LEAN := 4.0
## Edge softening: the same two-ring faint copies as character shadows, at
## the room's WallShadows.shadow_softness, so every shadow in the game matches.
const CharacterShadow := preload("res://scripts/character_shadow.gd")

var item: Sprite2D
var _lean_dir := Vector2.ZERO  # zero indoors
var _softness := CharacterShadow.DEFAULT_SOFTNESS
var lift := 0.0:
	set(v):
		lift = v
		queue_redraw()


func _ready() -> void:
	show_behind_parent = true
	var n := get_parent()
	while n and not n.has_node("WallShadows"):
		n = n.get_parent()
	if n:
		var walls := n.get_node("WallShadows")
		_softness = walls.shadow_softness
		if walls.character_cast and walls.compare in ["cast", "rim + cast"]:
			var b := deg_to_rad(walls.cast_bearing)
			_lean_dir = Vector2(sin(b), cos(b))


func _draw() -> void:
	if item == null or item.texture == null:
		return
	var region := item.region_rect if item.region_enabled else Rect2(Vector2.ZERO, item.texture.get_size())
	var shrink := lerpf(1.0, 0.7, lift)
	var size := Vector2(region.size.x, region.size.y * FLATTEN) * shrink
	var strength := ALPHA * lerpf(1.0, 0.6, lift)
	var centre := Vector2(0, GROUND) + _lean_dir * (LEAN + LIFT_LEAN * lift)
	for tap: Array in CharacterShadow.soft_taps(_softness):
		draw_texture_rect_region(item.texture, Rect2(centre - size / 2.0 + tap[0], size), region,
			Color(0, 0, 0.02, CharacterShadow._tap_alpha(strength, tap[1])))
