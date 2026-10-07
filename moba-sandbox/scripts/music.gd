extends AudioStreamPlayer
## Background music (autoload "Music"): one looping track for the whole game,
## kept playing across round reloads. Skipped in headless runs (tests,
## autoplay sims). Swap TRACK for another file in audio/ to change it.
## `level` (0–1) is the Esc menu's Music slider, saved in the settings file.

const Run := preload("res://scripts/run.gd")
const TRACK := "res://audio/game4.mp3"
const VOLUME_DB := -10.0  # at full slider

var level := 1.0


func _ready() -> void:
	if DisplayServer.get_name() == "headless":
		return
	process_mode = Node.PROCESS_MODE_ALWAYS  # keeps playing through the shop and pause menu
	var s := load(TRACK) as AudioStreamMP3
	if s == null:
		push_warning("music: couldn't load " + TRACK)
		return
	s.loop = true
	stream = s
	var cfg := ConfigFile.new()
	if cfg.load(Run.settings) == OK:
		level = clampf(float(cfg.get_value("audio", "music", 1.0)), 0.0, 1.0)
	_apply()
	play()


## Set the music volume (0 = off, 1 = full) and remember it.
func set_level(v: float) -> void:
	level = clampf(v, 0.0, 1.0)
	_apply()
	var cfg := ConfigFile.new()
	cfg.load(Run.settings)
	cfg.set_value("audio", "music", level)
	cfg.save(Run.settings)


func _apply() -> void:
	volume_db = VOLUME_DB + linear_to_db(maxf(level, 0.0001))
	stream_paused = level <= 0.001  # at zero, silent (and not just very quiet)
