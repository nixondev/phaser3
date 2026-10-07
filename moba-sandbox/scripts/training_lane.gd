extends Node2D
## Training's practice lane: an enemy (red) tower off to the south-east, and
## creep waves for both sides every WAVE_EVERY s — yours march from near your
## spawn to the tower, red's from the tower toward you. Practise last hits,
## denies, leashing and the tower shield (bring a creep into its range).
## A destroyed tower is rebuilt after REBUILD s. No overtime here, so the
## shield never drops. Waves are the lane's (3 melee + 1 ranged).

const TowerScript := preload("res://scripts/tower.gd")
const CreepScript := preload("res://scripts/creep.gd")
const Lane := preload("res://scripts/lane.gd")

const TOWER_AT := Vector2(1500, 520)
const BLUE_FROM := Vector2(250, 620)   # your waves start here (south of the dummies)
const WAVE_EVERY := 25.0
const FIRST_WAVE := 3.0
const REBUILD := 4.0

var effects: Node2D
var _next := FIRST_WAVE
var _rebuild := -1.0


func _ready() -> void:
	_build_tower()


func _build_tower() -> void:
	var t: Node2D = TowerScript.new(1, TOWER_AT)
	t.name = "TrainingTower"
	t.effects = effects
	t.died.connect(func(_u: Node2D) -> void: _rebuild = REBUILD)
	add_child(t)


func _process(delta: float) -> void:
	_next -= delta
	if _next <= 0.0:
		_next += WAVE_EVERY
		_spawn(0, BLUE_FROM, TOWER_AT)
		_spawn(1, TOWER_AT + (BLUE_FROM - TOWER_AT).normalized() * 120.0, BLUE_FROM)
	if _rebuild > 0.0:
		_rebuild -= delta
		if _rebuild <= 0.0:
			var old := get_node_or_null("TrainingTower")
			if old:
				old.name = "TrainingTowerRubble"
				old.queue_free()
			_build_tower()


## One wave for `team`: melee in a line across the march, ranged behind.
func _spawn(team: int, from: Vector2, to: Vector2) -> void:
	var fwd := (to - from).normalized()
	var side := fwd.orthogonal()
	var kinds: Array = Lane.WAVE
	var m := 0
	for kind: String in kinds:
		var at: Vector2
		if kind == "melee":
			at = from + fwd * 90.0 + side * ((m - 1) * 55.0)
			m += 1
		else:
			at = from + side * randf_range(-30, 30)
		var c: Node2D = CreepScript.new(team, kind, at, to)
		c.effects = effects
		add_child(c)
