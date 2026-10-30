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
##                       snapshot every snapshot_every seconds (each hero's
##                       line carries `near`: the creeps within NEAR_CREEPS of
##                       it as [yours, red's], and, only while they are up,
##                       `power` / `power_left`, `twin` and `shield` — the whole
##                       lane's creep count says nothing about how much of the
##                       wave is within reach of anyone, and a log could not
##                       say whether a hero had a power-up at all); power-up
##                       capsules (capsule_drop / red_capsule_drop, then
##                       capsule_open / capsule_denied with owner_dead;
##                       capsule_faded is from before they stopped fading;
##                       red_capsule_choice: hunt your capsules or press,
##                       once per death of yours with capsules out;
##                       the capsule brain: red_capsule_bank / red_capsule_open
##                       (reason + how long banked) / red_capsule_lurk /
##                       red_capsule_tow / red_capsule_park (why) /
##                       red_shell_block; capsule_open / _denied carry age),
##                       twin_end / red_twin_end (why: broken / death, absorbed, shots),
##                       Guard (guard / red_guard: D pressed),
##                       Bullets (bullet_hit / bullet_killed / bullet_fizzled, red_ versions),
##                       earned_minion / red_earned_minion (every EARN_EVERY
##                       last hits: the kind rolled, and how many of those
##                       kills weren't ability hits — nothing in the game says
##                       this happened, so the log is the only way to see it)
##                       — plus RED's side for bot analysis: its decisions as
##                       they change (red_why, with flags), casts, last hits,
##                       denies, deaths, combos (start / end + why), key runs,
##                       totem trips / contests, leashes, the numbers behind
##                       each decision (inputs), chances it passed up and why
##                       (red_passed), dice rolls that steered it (red_roll),
##                       whether each cast hit (red_cast_result), and a damage
##                       ledger per round (round_end red_ledger); its state in every
##                       snapshot; its build and skill at round start (its
##                       personality only in dev runs — never in a shipped log)
##   run_<stamp>.json    the run summary in autoplay's format (policy
##                       "human", or autoplay's shopping policy when a bot
##                       played it), so tools/combine_reports.py can put your
##                       runs next to the bots'
##   run_<stamp>/*.png   screenshots at deaths, round ends and the shop
##   try_<stamp>.jsonl   a Training session, same switch: the event stream
##                       only (slim snapshots, no round machinery or summary)
##                       — for testing things like power-ups
##
## WHICH SIDE AN EVENT BELONGS TO IS THE TEAM, NOT PLAYER-VS-BOT. Team 0 is
## always "you", team 1 is always "red_<name>" (hero.gd log_tag). That matters
## because tools/autoplay.gd --playlog writes these same logs with a bot in
## your seat: both sides then carry a brain, so a log can have `why` / `flags`
## / `blue_ledger` for team 0 as well as red_why / red_ledger for team 1, and
## round_start carries a `blue` block (mind + smartness) beside `red`. run_start
## names the `policy` that played it ("human", or autoplay's shopping policy).
## One catch: a bot's ledger is written from ITS OWN point of view, so the
## "you:" keys inside `blue_ledger` mean damage to and from RED.
##
## Everything here is static: the run spans several scene reloads.

const Run := preload("res://scripts/run.gd")
const BuildVersion := preload("res://scripts/build_version.gd")
const Heroes := preload("res://scripts/heroes.gd")

const SETTINGS := "user://settings.cfg"
const SNAPSHOT_EVERY := 0.25    # seconds between position / health snapshots (TEMP 2026-10-02 for analysis; normally 1.0)
const SHOT_WIDTH := 1280        # screenshots are scaled down to this width
const MISS_RANGE := 700.0       # an enemy creep dying this close without your blow = missed
const RACE_EVERY := 15.0        # s between tower-race samples in the round summary

static var dir := "user://playlogs"
static var enabled := false
static var snapshot_every := SNAPSHOT_EVERY  # autoplay's --snapshot-every lowers it: a 10-run x 10-round batch at 0.25 s is ~50 MB
static var clock := 0.0         # round time, advanced by the probe (stops while paused)
static var viewport: Viewport   # for screenshots, set by the probe

static var _loaded := false
static var _run_id := ""
static var _run := {}
static var _round := {}
static var _shots := 0
static var _file: FileAccess   # the open .jsonl (reopening it per event made headless autoplay crawl)
static var _file_path := ""


# ------------------------------------------------------------------ switch

## A dev run (the editor / F5), not an exported build: logs may name red's
## personality (a black box to players).
static func dev() -> bool:
	return OS.is_debug_build() and not OS.has_feature("template")


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
		if _run_id.begins_with("try_"):
			training_end("log switched off")
		else:
			run_end("log switched off")


## Autoplay switches the log on for its own runs, into its own folder and at
## its own snapshot rate, without touching the saved setting the game reads.
static func force_on(folder_path: String, every: float) -> void:
	_load()
	enabled = true
	dir = folder_path
	snapshot_every = every


## The log being written right now ("" when nothing is), so a caller can name
## the file it produced.
static func run_id() -> String:
	return _run_id


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

## `policy` labels who was at the controls: "human" for a played run, or
## autoplay's shopping policy when a bot ran it (combine_reports.py reads it).
static func run_start(policy := "human") -> void:
	if not is_on():
		return
	training_end("run starting")  # (a Training session left open: close it)
	DirAccess.make_dir_recursive_absolute(folder())
	var base := "run_" + Time.get_datetime_string_from_system().replace(":", "-")
	_run_id = base
	var n := 1
	while FileAccess.file_exists(folder().path_join(_run_id + ".jsonl")):
		n += 1  # autoplay finishes runs inside one second; the stamp alone would collide
		_run_id = "%s_%d" % [base, n]
	_shots = 0
	_run = {"run": 1, "seed": Run.run_seed, "hero": Heroes.LIST[Run.hero_index]["name"], "policy": policy,
		"rounds": [], "result": "in progress", "build": [], "levels": Run.levels.duplicate(), "reached": 0}
	var version: String = BuildVersion.VERSION
	if OS.is_debug_build() and not OS.has_feature("template"):
		version = "dev (after v%s)" % version  # run from the project: code may be newer than the last build
	var hero_script: Variant = load("res://scripts/hero.gd")
	event("run_start", {"hero": _run["hero"], "seed": Run.run_seed, "version": version, "policy": policy,
		"settings": {"cast_indicator": bool(hero_script.cast_indicator())}})


## Called by main when a round's scene is built (and by the pause-menu switch
## when logging starts mid-round).
static func round_start(main: Node) -> void:
	if not recording():
		return
	clock = 0.0
	var bot: Node2D = main.bot
	_round = {"gold_start": main.hero.gold, "missed": 0, "casts": {"Q": 0, "W": 0, "E": 0, "R": 0},
		"damage_taken": {"creep": 0.0, "tower": 0.0, "hero": 0.0, "other": 0.0}, "damage_dealt": 0.0,
		"hero": main.hero.def["name"], "bot_hero": bot.def["name"] if bot else "",
		"wave_sum": 0, "wave_n": 0, "race": [], "race_next": 0.0,
		"tower_damage": [{}, {}], "creep_deaths": [{}, {}]}
	var red := {}
	if bot:
		red = {"upgrades": Run.red_upgrades.duplicate(), "levels": Run.red_levels.duplicate(), "gold": bot.gold,
			"smartness": snappedf(float(bot.get("smartness")), 0.01), "caution": snappedf(float(bot.get("caution")), 0.01)}
		if dev():
			red["personality"] = str(bot.get("mind_name")) if str(bot.get("mind_name")) != "" else str(bot.get("personality"))  # its hero's own personality (or a pinned template)
	var d := {"hero": _round["hero"], "bot_hero": _round["bot_hero"], "gold": main.hero.gold,
		"levels": Run.levels.duplicate(), "upgrades": Run.upgrades.duplicate(), "difficulty": Run.difficulty(), "red": red}
	if main.hero.has_method("log_state"):  # autoplay: your seat is a bot as well, so say which mind it is
		d["blue"] = {"smartness": snappedf(float(main.hero.get("smartness")), 0.01),
			"caution": snappedf(float(main.hero.get("caution")), 0.01),
			"personality": str(main.hero.get("mind_name")) if str(main.hero.get("mind_name")) != "" else str(main.hero.get("personality"))}
	event("round_start", d)


static func round_end(main: Node, outcome: String) -> void:
	if not recording() or _round.is_empty():
		return
	var lane: Node2D = main.lane
	var hero: Node2D = main.hero
	var bot: Node2D = main.bot
	for h: Variant in [hero, bot]:  # the last casts of the round still have their hits pending (both seats, under autoplay)
		if h != null and is_instance_valid(h) and h.has_method("flush_open_casts"):
			h.flush_open_casts()
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
	if bot and bot.has_method("ledger_summary"):
		rec["red_ledger"] = bot.ledger_summary()  # red's damage by source, both ways, and last hits it skipped
	if hero.has_method("ledger_summary"):
		rec["blue_ledger"] = hero.ledger_summary()  # autoplay only: the same ledger for your seat
	rec["metrics"] = round_metrics(rec, _round)
	rec["tower_damage"] = {"yours": _rounded(_round["tower_damage"][0]), "reds": _rounded(_round["tower_damage"][1])}
	rec["creep_deaths"] = {"yours": _round["creep_deaths"][0], "reds": _round["creep_deaths"][1]}
	_run["rounds"].append(rec)
	_run["reached"] = Run.round_num
	_run["build"] = Run.upgrades.duplicate()
	_run["levels"] = Run.levels.duplicate()
	event("round_end", rec)
	_round = {}
	_save_summary()


## The round's headline numbers (also worked out by Run History for older logs):
##   wave_adv   your creeps minus red's on the field, averaged over the round —
##              the best single sign of who's winning (pushing decides rounds)
##   dmg_ratio  damage you dealt red ÷ damage red dealt you (fights trending)
##   lh_pct     last hits ÷ (last hits + missed) — your farming, the skill you control
##   race       [time, your tower, red's tower] (fractions) every RACE_EVERY s
static func round_metrics(rec: Dictionary, r: Dictionary) -> Dictionary:
	var led: Dictionary = rec.get("red_ledger", {})
	var to_red := 0.0
	for k: String in led.get("taken", {}):
		if k.begins_with("you"):
			to_red += float(led["taken"][k])
	var to_you := 0.0
	for k: String in led.get("dealt", {}):
		to_you += float(led["dealt"][k])
	var lh := int(rec.get("last_hits", 0))
	var missed := int(rec.get("missed", 0))
	return {
		"wave_adv": snappedf(float(r.get("wave_sum", 0)) / maxf(1.0, float(r.get("wave_n", 0))), 0.1),
		"dmg_ratio": snappedf(to_red / to_you, 0.01) if to_you > 0.0 else -1.0,
		"lh_pct": roundi(100.0 * lh / maxi(1, lh + missed)),
		"race": r.get("race", []),
	}


## A tower lost `lost` health to `source`: tallied by who did it (creeps, you,
## red, siege minions…), with the share overtime's crumble added on top.
static func tower_hit(team: int, lost: float, source: Variant, vulnerability: float) -> void:
	if not recording() or _round.is_empty() or lost <= 0.0:
		return
	var key := _who(source, team)
	var d: Dictionary = _round["tower_damage"][team]
	d[key] = float(d.get(key, 0.0)) + lost
	if vulnerability > 1.0:  # how much of it was overtime's crumble
		d["overtime_bonus"] = float(d.get("overtime_bonus", 0.0)) + lost * (1.0 - 1.0 / vulnerability)


## A creep of `team` died: tallied by its killer (and attack / ability for heroes).
static func creep_died(team: int, killer: Variant, by_ability: bool) -> void:
	if not recording() or _round.is_empty():
		return
	var key := _who(killer, team)
	if key == "you" or key == "red":
		key += " ability" if by_ability else " attack"
	var d: Dictionary = _round["creep_deaths"][team]
	d[key] = int(d.get(key, 0)) + 1


## Who `s` is: you, red, creeps, tower, totem, siege, other. Team 0 is "you"
## (see hero.gd log_tag) — under autoplay your seat is a bot, so splitting on
## is_bot here labelled red's own creep kills "red attack".
static func _who(s: Variant, _team: int) -> String:
	if s == null or not is_instance_valid(s):
		return "other"  # (an attacker that died before its shot landed)
	if s.is_in_group("siege_minions"):
		return "siege"
	if s.is_in_group("heroes"):
		return "you" if int(s.get("team")) == 0 else "red"
	if s.is_in_group("creeps"):
		return "creeps"
	if s.is_in_group("towers"):
		return "tower"
	if s.is_in_group("totems"):
		return "totem"
	return "other"


static func _rounded(d: Dictionary) -> Dictionary:
	var out := {}
	for k: String in d:
		out[k] = roundi(float(d[k]))
	return out


## Each wave as it leaves: what each side sends (normal / bonus creeps, tanks,
## siege minions, `earned`: the kinds earned by last hits) and overtime's
## state — tempo and escalation across rounds.
static func wave(data: Dictionary) -> void:
	event("wave", data)


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


## A Training session log (try_<stamp>.jsonl), on the same switch as runs:
## the event stream only — no rounds, no summary .json. main starts one when
## Training is built with the log on; leaving Training ends it.
static func training_start(main: Node) -> void:
	if not is_on():
		return
	DirAccess.make_dir_recursive_absolute(folder())
	_run_id = "try_" + Time.get_datetime_string_from_system().replace(":", "-")
	_shots = 0
	clock = 0.0
	_run = {}
	_round = {}  # (stays empty: snapshot skips the round metrics)
	var version: String = BuildVersion.VERSION
	if dev():
		version = "dev (after v%s)" % version
	event("training_start", {"hero": main.hero.def["name"], "version": version,
		"no_cooldowns": bool(main.hero.no_cooldowns), "no_mana": bool(main.hero.no_mana)})


static func training_end(reason: String) -> void:
	if _run_id == "" or not _run_id.begins_with("try_"):
		return
	event("training_end", {"why": reason})
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


static func cast(slot: String, a: Dictionary, at := Vector2.INF) -> void:
	if not recording() or _round.is_empty():
		return
	_round["casts"][slot] += 1
	var d := {"slot": slot, "ability": a["name"], "level": a.get("level", 1)}
	if at != Vector2.INF:
		d["at"] = _v(at)  # where it was aimed
	event("cast", d)


## `extra` is what a bot in the player seat adds (autoplay): why it was there.
static func death(killer: Variant, at: Vector2, extra := {}) -> void:
	var d := {"killer": _source_kind(killer), "killer_name": _source_name(killer), "at": _v(at)}
	d.merge(extra)
	event("death", d)
	screenshot("death")


static func kill(at: Vector2) -> void:
	event("kill", {"at": _v(at)})


## Position / health of everything that matters, every snapshot_every s.
static func snapshot(main: Node) -> void:
	var hero: Node2D = main.hero
	var bot: Node2D = main.bot
	var creeps: Array = main.get_tree().get_nodes_in_group("creeps")
	if main.lane == null:  # Training: a slim snapshot — you, the creeps, the practice front
		event("snap", {
			"you": _hero_snap(hero, creeps),
			"creeps": [creeps.filter(func(c: Node2D) -> bool: return c.team == 0).size(), creeps.filter(func(c: Node2D) -> bool: return c.team == 1).size()],
			"gold": hero.gold,
			"front": _fronts(creeps),
		})
		return
	if not _round.is_empty():  # the round's metrics as it goes: wave advantage, the tower race
		var c0 := creeps.filter(func(c: Node2D) -> bool: return c.team == 0).size()
		var c1 := creeps.filter(func(c: Node2D) -> bool: return c.team == 1).size()
		_round["wave_sum"] = int(_round["wave_sum"]) + c0 - c1
		_round["wave_n"] = int(_round["wave_n"]) + 1
		if clock >= float(_round["race_next"]):
			_round["race_next"] = clock + RACE_EVERY
			var t0: Node2D = main.lane.tower(0)
			var t1: Node2D = main.lane.tower(1)
			_round["race"].append([snappedf(clock, 0.1), snappedf(t0.hp / t0.max_hp, 0.01), snappedf(t1.hp / t1.max_hp, 0.01)])
	event("snap", {
		"you": _hero_snap(hero, creeps),
		"bot": _bot_snap(bot, creeps) if bot else {},
		"creeps": [creeps.filter(func(c: Node2D) -> bool: return c.team == 0).size(), creeps.filter(func(c: Node2D) -> bool: return c.team == 1).size()],
		"towers": [roundi(main.lane.tower(0).hp), roundi(main.lane.tower(1).hp)],
		"gold": hero.gold,
		"totems": _totems(main),
		"front": _fronts(creeps),
		"at_tower": _at_towers(main, creeps),
	})


## Creeps within NEAR_CREEPS of `pos`, as [team 0's, team 1's]. The plain
## `creeps` field counts the whole lane, so no log could say how much of the
## wave was actually around a hero — which is what any wave-radius tuning and
## the "is it worth leaving the lane" question both need.
const NEAR_CREEPS := 460.0  # px: creep ACQUIRE (creep.gd) — the range a creep can engage from


static func _near(creeps: Array, pos: Vector2) -> Array:
	var n := [0, 0]
	for c: Node2D in creeps:
		if c.is_targetable() and c.position.distance_to(pos) <= NEAR_CREEPS:
			n[c.team] += 1
	return n


## One hero's line of a snapshot — both sides go through here, so the two are
## always measured the same way. The optional fields are left out when they are
## not up, which keeps a snapshot the size it was in the usual case.
## (Distance off the lane and time in the well are NOT fields: both follow from
## `at`, against bounds.gd's HALF_HEIGHT and WELL_X / WELL_R.)
static func _hero_snap(h: Node2D, creeps: Array) -> Dictionary:
	var d := {"at": _v(h.position), "hp": roundi(h.hp), "mana": roundi(h.mana),
		"alive": h.is_targetable(), "near": _near(creeps, h.position)}
	if h.has_method("log_state"):
		d.merge(h.log_state())  # what the brain is doing: red always, and your seat too under autoplay
	if str(h.get("power")) != "" and float(h.get("power_left")) > 0.0:
		d["power"] = h.power  # a timed capsule power-up running now (rampage / pierce)
		d["power_left"] = snappedf(h.power_left, 0.1)
	var tw: Variant = h.get("twin")
	if is_instance_valid(tw):
		d["twin"] = roundi(tw.hp)  # TWIN isn't timed, so it never shows in `power`
	if h.shield_hp > 0.0:
		d["shield"] = roundi(h.shield_hp)  # Guard, BRACE, the SHIELD power-up, Second Wind
	return d


## Each side's most advanced creep (x; the lane runs blue −x → red +x), or null.
static func _fronts(creeps: Array) -> Array:
	var f: Array = [null, null]
	for c: Node2D in creeps:
		if not c.is_targetable():
			continue
		var x := roundi(c.position.x)
		if c.team == 0:
			f[0] = x if f[0] == null else maxi(int(f[0]), x)
		else:
			f[1] = x if f[1] == null else mini(int(f[1]), x)
	return f


## [your creeps inside red's tower range, red's creeps inside yours].
static func _at_towers(main: Node, creeps: Array) -> Array:
	var out := [0, 0]
	for team in 2:
		var t: Node2D = main.lane.tower(1 - team)
		if t == null:
			continue
		for c: Node2D in creeps:
			if c.team == team and c.is_targetable() and t.position.distance_to(c.position) <= t.RANGE + c.radius:
				out[team] += 1
	return out


## Red in a snapshot: where, health, mana, gold, and what it's doing (bot.gd log_state).
static func _bot_snap(bot: Node2D, creeps: Array) -> Dictionary:
	var d := _hero_snap(bot, creeps)  # (log_state is merged in there, for whichever seat has one)
	d["gold"] = bot.gold
	return d


## Each side's living totems' meters (0–1), as [team 0's, team 1's]; an empty
## list for a side whose totems are both down (or before TOTEM_FROM).
static func _totems(main: Node) -> Array:
	var lane: Node = main.lane
	if lane == null or not lane.has_method("totem"):
		return []
	var out := []
	for team in 2:
		var ms := []
		for t: Node2D in lane.totems_of(team):
			ms.append(snappedf(t.meter(), 0.01))
		out.append(ms)  # one entry per living totem of that side (two a side since 2026-10-24)
	return out


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
	if _file == null or not _file.is_open() or _file_path != path:
		_file = FileAccess.open(path, FileAccess.READ_WRITE) if FileAccess.file_exists(path) else FileAccess.open(path, FileAccess.WRITE)
		_file_path = path
		if _file == null:
			return
		_file.seek_end()
	_file.store_line(JSON.stringify(e))
	_file.flush()  # every line hits disk, so a crash loses nothing (as it did when each event reopened the file)


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
