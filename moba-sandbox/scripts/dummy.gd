extends "res://scripts/unit.gd"
## A training dummy (Training mode): takes hits, shows floating damage numbers
## and a health bar. At 0 HP it's "defeated" and pops back to full; left alone
## for a few seconds it heals to full. Neutral — every side can hit it — and
## solid: it blocks movement.

const RADIUS := 30.0
const MAX_HP := 1000.0
const HEAL_AFTER := 4.0      # seconds without damage before it resets to full
const RESPAWN := 1.2         # seconds shown "defeated" before popping back
const BODY := Color("#8d6e63")

var _defeated := 0.0


func _init(at: Vector2) -> void:
	position = at
	team = -1
	radius = RADIUS
	max_hp = MAX_HP
	hp = MAX_HP
	solid = true


func _ready() -> void:
	add_to_group("dummies")


func _process(delta: float) -> void:
	tick_unit(delta)
	if _defeated > 0.0:
		_defeated -= delta
		if _defeated <= 0.0:
			hp = MAX_HP
	elif _since_hit > HEAL_AFTER and hp < MAX_HP:
		hp = minf(MAX_HP, hp + MAX_HP * delta * 2.0)  # quick refill once out of combat
	queue_redraw()


func _die() -> void:
	_defeated = RESPAWN
	super()


func _draw() -> void:
	draw_circle(Vector2(3, 5), RADIUS, Color(0, 0, 0, 0.35))  # drop shadow
	var body := BODY.lerp(Color.WHITE, _flash * 0.8)
	if _defeated > 0.0:
		body = body.darkened(0.6)
	draw_circle(Vector2.ZERO, RADIUS, body)
	draw_arc(Vector2.ZERO, RADIUS, 0.0, TAU, 48, Color("#3e2723"), 3.0)
	draw_arc(Vector2.ZERO, RADIUS * 0.55, 0.0, TAU, 32, Color("#3e2723", 0.6), 3.0)  # target ring
	draw_circle(Vector2.ZERO, 5.0, Color("#3e2723"))
	draw_health_bar(70.0, Color("#e57373") if _defeated <= 0.0 else Color("#555555"))
