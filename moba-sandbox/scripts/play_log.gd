extends RefCounted
## Play log — records your runs so they can be analysed later. OFF unless
## switched on (pause menu, or the hero-pick screen; remembered in
## user://settings.cfg; `--playlog` on the command line also turns it on).
## Only exists in debug runs (F5) and builds exported with the "playlog"
## feature — the clean release build has no switch and never logs.
##
## Per run, in a `playlogs` folder next to the game's .exe in exported builds
## (easy to find and send back), or user://playlogs/ when run from the
## editor (see folder()):
##   run_<stamp>.jsonl   the timeline, one JSON event per line: run/round
##                       start and end, last hits, missed last hits, casts,
##                       deaths and kills, shop actions, pauses, and a
##                       snapshot every SNAPSHOT_EVERY seconds
##   run_<stamp>.json    the run summary in autoplay's format (policy
##                       "human"), so tools/combine_reports.py can put your
##                       runs next to the bots'
##   run_<stamp>/*.png   screenshots at deaths, round ends and the shop
##
## Everything here is static: the run spans several scene reloads.

const Run := preload("res://scripts/run.gd")
const Heroes := preload("res://scripts/heroes.gd")

const SETTINGS := "user://settings.cfg"
const SNAPSHOT_EVERY := 0.25    # seconds between position / health snapshots (TEMP 2026-10-02 for analysis; normally 1.0)
const SHOT_WIDTH := 1280        # screenshots are scaled down to this width
const MISS_RANGE := 700.0       # an enemy creep dying this close without your blow = missed

static var dir := "user://playlogs"
static var enabled := false
static var clock := 0.0         # round time, advanced by the probe (stops while paused)
static var viewport: Viewport   # for screenshots, set by the probe

static var _loaded := false
static var _run_id := ""
static var _run := {}
static var _round := {}
static var _shots := 0


# ------------------------------------------------------------------ switch

static func available() -> bool:
	return OS.is_debug_build() or OS.has_feature("playlog")


static func is_on() -> bool:
	_load()
	return enabled and available()


## Logging a run right now.
static func recording() -> bool:
	return is_on() and _run_id != ""


static func set_enabled(on: bool) -> void:
	_load()
	enabled = on
	var c := ConfigFile.new()
	c.load(SETTINGS)
	c.set_value("playlog", "enabled", on)
	c.save(SETTINGS)
	if not on and _run_id != "":
		run_end("log switched off")


static func folder() -> String:
	if dir == "user://playlogs" and OS.has_feature("template"):  # an exported build: beside the .exe
		var beside := OS.get_executable_path().get_base_dir().path_join("playlogs")
		if DirAccess.make_dir_recursive_absolute(beside) == OK:
			return beside
	return ProjectSettings.globalize_path(dir)  # the editor (or an unwritable exe folder)


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	var c := ConfigFile.new()
	if c.load(SETTINGS) == OK:
		enabled = c.get_value("playlog", "enabled", false)
	if OS.get_cmdline_user_args().has("--playlog"):
		enabled = true


# ------------------------------------------------------------------ run / round

static func run_start() -> void:
	if not is_on():
		return
	DirAccess.make_dir_recursive_absolute(folder())
	_run_id = "run_" + Time.get_datetime_string_from_system().replace(":", "-")
	_shots = 0
	_run = {"run": 1, "seed": Run.run_seed, "hero": Heroes.LIST[Run.hero_index]["name"], "policy": "human",
		"rounds": [], "result": "in progress", "build": [], "levels": Run.levels.duplicate(), "reached": 0}
	event("run_start", {"hero": _run["hero"], "seed": Run.run_seed})


## Called by main when a round's scene is built (and by the pause-menu switch
## when logging starts mid-round).
static func round_start(main: Node) -> void:
	if not recording():
		return
	clock = 0.0
	var bot: Node2D = main.bot
	_round = {"gold_start": main.hero.gold, "missed": 0, "casts": {"Q": 0, "W": 0, "E": 0, "R": 0},
		"damage_taken": {"creep": 0.0, "tower": 0.0, "hero": 0.0, "other": 0.0}, "damage_dealt": 0.0,
		"hero": main.hero.def["name"], "bot_hero": bot.def["name"] if bot else ""}
	event("round_start", {"hero": _round["hero"], "bot_hero": _round["bot_hero"], "gold": main.hero.gold,
		"levels": Run.levels.duplicate(), "upgrades": Run.upgrades.duplicate(), "difficulty": Run.difficulty()})


static func round_end(main: Node, outcome: String) -> void:
	if not recording() or _round.is_empty():
		return
	var lane: Node2D = main.lane
	var hero: Node2D = main.hero
	var bot: Node2D = main.bot
	var rec := {
		"round": Run.round_num, "outcome": outcome, "time": snappedf(clock, 0.1),
		"gold_earned": hero.gold - int(_round["gold_start"]), "gold_after": hero.gold,
		"last_hits": hero.last_hits, "missed": _round["missed"], "bot_last_hits": bot.last_hits if bot else 0,
		"denies": hero.denies, "bot_denies": bot.denies if bot else 0,
		"kills": lane.kills, "deaths": lane.deaths, "waves": lane.wave, "hero": _round["hero"], "bot_hero": _round["bot_hero"],
		"your_tower": snappedf(lane.tower(0).hp / lane.tower(0).max_hp, 0.01),
		"enemy_tower": snappedf(lane.tower(1).hp / lane.tower(1).max_hp, 0.01),
		"casts": _round["casts"], "damage_taken": _round["damage_taken"], "damage_dealt": roundi(_round["damage_dealt"]),
		"build": Run.upgrades.duplicate(), "levels": Run.levels.duplicate(),
	}
	_run["rounds"].append(rec)
	_run["reached"] = Run.round_num
	_run["build"] = Run.upgrades.duplicate()
	_run["levels"] = Run.levels.duplicate()
	event("round_end", rec)
	_round = {}
	_save_summary()


static func run_end(result: String) -> void:
	if _run_id == "":
		return
	_run["result"] = result
	_run["build"] = Run.upgrades.duplicate()
	_run["levels"] = Run.levels.duplicate()
	_run["reached"] = maxi(int(_run["reached"]), Run.round_num)
	event("run_end", {"result": result})
	_save_summary()
	_run_id = ""


# ------------------------------------------------------------------ game hooks

static func last_hit(kind: String, gold: int) -> void:
	event("last_hit", {"kind": kind, "gold": gold})


static func missed(kind: String) -> void:
	if not recording() or _round.is_empty():
		return
	_round["missed"] += 1
	event("missed_last_hit", {"kind": kind})


static func damage_taken(amount: float, source: Variant) -> void:
	if not recording() or _round.is_empty():
		return
	var k := _source_kind(source)
	_round["damage_taken"][k] += amount


static func damage_dealt(amount: float) -> void:
	if recording() and not _round.is_empty():
		_round["damage_dealt"] += amount


static func cast(slot: String, a: Dictionary) -> void:
	if not recording() or _round.is_empty():
		return
	_round["casts"][slot] += 1
	event("cast", {"slot": slot, "ability": a["name"], "level": a.get("level", 1)})


static func death(killer: Variant, at: Vector2) -> void:
	event("death", {"killer": _source_kind(killer), "killer_name": _source_name(killer), "at": _v(at)})
	screenshot("death")


static func kill(at: Vector2) -> void:
	event("kill", {"at": _v(at)})


## Position / health of everything that matters, every SNAPSHOT_EVERY s.
static func snapshot(main: Node) -> void:
	var hero: Node2D = main.hero
	var bot: Node2D = main.bot
	var creeps: Array = main.get_tree().get_nodes_in_group("creeps")
	event("snap", {
		"you": {"at": _v(hero.position), "hp": roundi(hero.hp), "mana": roundi(hero.mana), "alive": hero.is_targetable()},
		"bot": {"at": _v(bot.position), "hp": roundi(bot.hp), "alive": bot.is_targetable()} if bot else {},
		"creeps": [creeps.filter(func(c: Node2D) -> bool: return c.team == 0).size(), creeps.filter(func(c: Node2D) -> bool: return c.team == 1).size()],
		"towers": [roundi(main.lane.tower(0).hp), roundi(main.lane.tower(1).hp)],
		"gold": hero.gold,
	})


static func screenshot(reason: String) -> void:
	if not recording() or viewport == null or DisplayServer.get_name() == "headless":
		return
	var img := viewport.get_texture().get_image()
	if img == null:
		return
	if img.get_width() > SHOT_WIDTH:
		img.resize(SHOT_WIDTH, int(img.get_height() * float(SHOT_WIDTH) / img.get_width()))
	var sub := folder().path_join(_run_id)
	DirAccess.make_dir_recursive_absolute(sub)
	_shots += 1
	var file := "%03d_R%d_%s.png" % [_shots, Run.round_num, reason]
	img.save_png(sub.path_join(file))
	event("screenshot", {"file": _run_id + "/" + file, "reason": reason})


# ------------------------------------------------------------------ writing

## One line in the run's timeline. No-op unless recording.
static func event(type: String, data: Dictionary = {}) -> void:
	if not recording():
		return
	var e := {"t": snappedf(clock, 0.01), "round": Run.round_num, "type": type}
	e.merge(data)
	var path := folder().path_join(_run_id + ".jsonl")
	var f := FileAccess.open(path, FileAccess.READ_WRITE) if FileAccess.file_exists(path) else FileAccess.open(path, FileAccess.WRITE)
	if f == null:
		return
	f.seek_end()
	f.store_line(JSON.stringify(e))


static func _save_summary() -> void:
	var f := FileAccess.open(folder().path_join(_run_id + ".json"), FileAccess.WRITE)
	if f:
		f.store_string(JSON.stringify({"options": {"policy": "human"}, "runs": [_run]}, "  "))


static func _source_kind(s: Variant) -> String:
	if s == null or not is_instance_valid(s):
		return "other"
	if s.is_in_group("creeps"):
		return "creep"
	if s.is_in_group("towers"):
		return "tower"
	if s.is_in_group("heroes"):
		return "hero"
	return "other"


static func _source_name(s: Variant) -> String:
	if s == null or not is_instance_valid(s):
		return ""
	if s.is_in_group("heroes"):
		return s.def["name"]
	if s.is_in_group("creeps"):
		return s.kind + " creep"
	return "tower" if s.is_in_group("towers") else ""


static func _v(p: Vector2) -> Array:
	return [roundi(p.x), roundi(p.y)]
