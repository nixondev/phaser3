extends Node
## Added by main during a round while the play log is recording: keeps the
## round clock (it stops while the game is paused), gives the log a viewport
## for screenshots, and takes a snapshot every PlayLog.snapshot_every seconds.

const PlayLog := preload("res://scripts/play_log.gd")

var main: Node
var _next := 0.0


func _ready() -> void:
	PlayLog.viewport = get_viewport()
	if main.lane != null:
		PlayLog.round_start(main)  # Training (no lane) logs a session, not a round


func _process(delta: float) -> void:
	PlayLog.clock += delta
	if PlayLog.clock >= _next and (main.lane == null or main.lane.winner < 0):
		_next = PlayLog.clock + PlayLog.snapshot_every
		PlayLog.snapshot(main)
