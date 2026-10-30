extends SceneTree
## Autoplay — plays full roguelite runs with a bot in your seat, headless and
## as fast as the CPU allows, and reports how they went. For balancing: is
## round 1 easy, which cards win runs, how long rounds take.
##
##   tools\autoplay.cmd --runs 10
##   godot --headless --fixed-fps 60 --path . --script res://tools/autoplay.gd -- --runs 10
##
## Options (after the `--`; `--key value` or `--key=value`):
##   --runs N          how many runs                                  (5)
##   --hero H          cycle | random | 0–3 (KYLE, CHAD,
##                     KAREN, BECKY)                                (cycle)
##   --policy P        how your bot shops between rounds:             (greedy)
##                       greedy  buy the priciest affordable card or ability
##                               level, repeat
##                       levels  ability levels first (Q/W/E/R), then cards
##                       epic    only buy epics (saves up for them)
##                       random  random affordable cards / levels
##                       none    buy nothing — the no-upgrades baseline
##   --seed S          base seed; run i uses S + i, so the same seed
##                     replays the same runs (0 = pick one)            (0)
##   --max-round SECS  a round still going after this much game time
##                     counts as a timeout and ends the run            (900)
##   --max-rounds N    runs are endless; stop a run after N rounds won
##                     (result "capped RN")                            (10)
##   --out DIR         where the JSON report goes         (res://autoplay_runs)
##   --quiet           only the summary, no per-run lines
##   --red-hero H      pin red's hero for every round: 0-3, or -1 =
##                     rolled per round as in a real run               (-1)
##   --personality P   red bot's personality: brawler | farmer | pusher |
##                     opportunist | standard, or "" = the ladder (each
##                     red hero's signature)                           ("")
##   --smartness S     red bot's smartness 0..1, or -1 = the ladder's
##                     per-round value                                 (-1)
##   --osc             report bot oscillations: 8+ turnarounds within 5 s
##                     (a decision loop), with the decisions it flipped
##                     between — for finding back-and-forth bugs
##   --no-key          bots never make key runs (bot.gd) — A/B tests
##   --no-totem        no totems (lane.gd) — A/B tests
##   --start-round N   start each run at round N (no cards or levels for the
##                     rounds skipped) — to test late-round mechanics   (1)
##   --variant V       base (today's game) | fixes (red skips economy
##                     cards, bot stats 1.0 from round 3, Overcharge
##                     cooldown-only) — for A/B balance tests           (base)
##   --playlog         also write a full play log per run (run_*.jsonl +
##                     run_*.json), the same format a played run writes, so
##                     tools/analyze_log.py reads them. Your seat is team 0
##                     ("you"), red is team 1 — and because both seats are
##                     bots, BOTH sides log their why / flags / ledger    (off)
##   --snapshot-every S  seconds between play-log snapshots. A played run
##                     uses 0.25; 10 runs x 10 rounds at 0.25 is ~50 MB    (1.0)
##   --log-dir DIR     where the play logs go — kept apart from your own
##                     runs by default            (user://playlogs/autoplay)
##   --blue-round N    how good YOUR seat is: the difficulty ladder frozen at
##                     round N. 9 is the top of the human range (past it the
##                     ladder goes superhuman — run.gd SUPER_FROM)         (9)
##   --blue-smartness S  your seat's smartness 0..1 — competence only       (1)
##   --caution C       red's caution 0..1: how readily it notices trouble.
##                     Separate from smartness and flat across the run, so
##                     the ladder raises skill, not fear. Lower = bolder,
##                     pushes more, dies more. -1 = the old behaviour,
##                     caution tracking smartness, for A/B                (0.5)
##   --blue-caution C  the same dial for your seat                        (0.5)
##
## `--fixed-fps 60` matters: every frame is exactly 1/60 s of game time and the
## engine doesn't wait for real time, so runs finish fast and play the same
## as at normal speed. Your bot plays at full strength; red follows the run's
## difficulty curve exactly as in a real run.

const Run := preload("res://scripts/run.gd")
const Upgrades := preload("res://scripts/upgrades.gd")
const Heroes := preload("res://scripts/heroes.gd")
const Main := preload("res://scripts/main.gd")
const PlayLog := preload("res://scripts/play_log.gd")

const STEP := 1.0 / 60.0   # game seconds per frame under --fixed-fps 60

var opts := {"runs": 5, "hero": "cycle", "policy": "greedy", "seed": 0,
	"max-round": 900.0, "max-rounds": 10, "out": "res://autoplay_runs", "quiet": false, "variant": "base", "osc": false, "start-round": 1, "no-key": false, "no-totem": false,
	"red-hero": -1, "personality": "", "smartness": -1.0,
	"playlog": false, "snapshot-every": 1.0, "log-dir": "user://playlogs/autoplay",
	"blue-round": 9, "blue-smartness": 1.0, "caution": 0.5, "blue-caution": 0.5}
var _seed_base := 0


func _init() -> void:
	_parse_args()
	_seed_base = int(opts["seed"]) if int(opts["seed"]) != 0 else randi() % 1000000
	var fixes := str(opts["variant"]) == "fixes"
	Run.red_no_economy = fixes
	Run.bot_stats_from = 3 if fixes else 0
	load("res://scripts/hero.gd").ult_damage_off = fixes
	Run.red_hero_fixed = int(opts["red-hero"])
	Run.red_personality = str(opts["personality"])
	Run.red_smartness = float(opts["smartness"])
	Run.blue_round = int(opts["blue-round"])
	Run.blue_smartness = float(opts["blue-smartness"])
	Run.red_caution = float(opts["caution"])
	Run.blue_caution = float(opts["blue-caution"])
	Main.mode = "lane"
	Main.autoplay = true
	Main.driven = true   # headless: no run screens — this script drives the rounds
	Main.bot_enabled = true
	if opts["playlog"]:
		PlayLog.force_on(str(opts["log-dir"]), float(opts["snapshot-every"]))
		print("Play log: ON -> %s  (snapshot every %.2f s)" % [PlayLog.folder(), PlayLog.snapshot_every])
	var started := Time.get_ticks_msec()
	var runs: Array = []
	for i in int(opts["runs"]):
		runs.append(await _play_run(i))
	var wall := (Time.get_ticks_msec() - started) / 1000.0
	_report(runs, wall)
	_save(runs, wall)
	quit()


func _parse_args() -> void:
	var args := OS.get_cmdline_user_args()
	var i := 0
	while i < args.size():
		var a: String = args[i]
		if a.begins_with("--"):
			var key := a.substr(2)
			var value: Variant = true
			if "=" in key:
				value = key.get_slice("=", 1)
				key = key.get_slice("=", 0)
			elif i + 1 < args.size() and not args[i + 1].begins_with("--"):
				i += 1
				value = args[i]
			if not opts.has(key):
				push_error("autoplay: unknown option --%s" % key)
			elif opts[key] is float:
				opts[key] = float(value)
			elif opts[key] is int:
				opts[key] = int(value)
			else:
				opts[key] = value
		i += 1


func _hero_for(i: int) -> int:
	match str(opts["hero"]):
		"cycle":
			return i % Heroes.LIST.size()
		"random":
			return randi() % Heroes.LIST.size()
		_:
			return clampi(int(opts["hero"]), 0, Heroes.LIST.size() - 1)


# ------------------------------------------------------------------ playing

func _play_run(i: int) -> Dictionary:
	Run.reset()
	Run.run_seed = _seed_base + i
	seed(Run.run_seed)
	var hero_i := _hero_for(i)
	Run.start(hero_i)
	Run.round_num = maxi(1, int(opts["start-round"]))  # (no shop gold for the rounds skipped: for testing late-round mechanics)
	var run := {"run": i + 1, "seed": Run.run_seed, "hero": Heroes.LIST[hero_i]["name"],
		"policy": opts["policy"], "rounds": [], "result": "",
		"red_hero": Heroes.LIST[Run.red_hero_fixed]["name"] if Run.red_hero_fixed >= 0 else "rolled",
		"personality": Run.red_personality if Run.red_personality != "" else "ladder",
		"blue_round": Run.blue_round, "blue_smartness": Run.blue_smartness,
		"caution": Run.red_caution, "blue_caution": Run.blue_caution}
	PlayLog.run_start(str(opts["policy"]))  # no-op unless --playlog
	run["playlog"] = PlayLog.run_id()
	while true:
		var rec := await _play_round()
		run["rounds"].append(rec)
		Run.gold = rec["gold_after"]
		if rec["outcome"] != "won":
			run["result"] = "%s R%d" % [rec["outcome"], Run.round_num]
			break
		if Run.round_num >= int(opts["max-rounds"]):
			run["result"] = "capped R%d" % Run.round_num
			break
		PlayLog.event("shop_open", {"gold": Run.gold})
		rec["bought"] = _shop()
		Run.red_gold = rec["bot_gold_after"]
		rec["red_gold_before_shop"] = Run.red_gold + Run.red_allowance()
		rec["red_bought"] = Run.red_shop()
		rec["red_gold_left"] = Run.red_gold
		PlayLog.event("red_shop", {"bought": Run.red_bought.duplicate(), "red_upgrades": Run.red_upgrades.duplicate(),
			"red_levels": Run.red_levels.duplicate(), "red_gold_left": Run.red_gold})
		Run.next_round()
	run["build"] = Run.upgrades.duplicate()
	run["levels"] = Run.levels.duplicate()
	run["red_upgrades"] = Run.red_upgrades.duplicate()
	run["red_levels"] = Run.red_levels.duplicate()
	run["reached"] = Run.round_num
	PlayLog.run_end(run["result"])
	if not opts["quiet"]:
		print(_run_line(run))
	return run


## One round, start to finish; returns what happened.
func _play_round() -> Dictionary:
	seed(hash([Run.run_seed, Run.round_num]))  # the same run replays the same
	var before := current_scene
	change_scene_to_file("res://scenes/main.tscn")
	while current_scene == before or current_scene == null or current_scene.get("lane") == null:
		await process_frame
	var main := current_scene
	var lane: Node2D = main.lane
	var hero: Node2D = main.hero
	var bot: Node2D = main.bot
	lane.totems_on = not opts["no-totem"]
	for b: Variant in [hero, bot]:
		if b != null and b.get("key_runs") != null:
			b.key_runs = not opts["no-key"]
	var gold_start: int = hero.gold
	var frames := 0
	var outcome := ""
	var osc := {}  # unit -> {px, last, turns: [t], whys: [[t, why]], quiet_until}
	while outcome == "":
		await process_frame
		frames += 1
		if opts["osc"] and frames % 15 == 0:
			_watch_osc(osc, [hero, bot], frames * STEP)
			for tm in 2:  # totems rising and falling
				var up: bool = lane.totem(tm) != null
				if up != bool(osc.get("totem%d" % tm, false)):
					osc["totem%d" % tm] = up
					print("TOTEM R%d t=%.0f %s totem %s" % [Run.round_num, frames * STEP, "blue" if tm == 0 else "red", "up" if up else "DOWN (+siege)"])
		if lane.winner >= 0:
			outcome = "won" if lane.winner == hero.team else "lost"
		elif frames * STEP > float(opts["max-round"]):
			outcome = "timeout"
	PlayLog.round_end(main, outcome)  # last_hits / gold / red_ledger / metrics (no-op unless --playlog)
	var yours: Node2D = lane.tower(0)
	var theirs: Node2D = lane.tower(1)
	return {
		"round": Run.round_num,
		"outcome": outcome,
		"time": snappedf(frames * STEP, 0.1),
		"gold_earned": hero.gold - gold_start,
		"gold_after": hero.gold,
		"last_hits": hero.last_hits,
		"bot_last_hits": bot.last_hits if bot else 0,
		"denies": hero.denies,
		"bot_denies": bot.denies if bot else 0,
		"bot_gold_after": bot.gold if bot else 0,
		"red_upgrades": Run.red_upgrades.duplicate(),
		"red_levels": Run.red_levels.duplicate(),
		"kills": lane.kills,
		"deaths": lane.deaths,
		"waves": lane.wave,
		"bot_hero": bot.def["name"] if bot else "",
		"bot_personality": (bot.mind_name if bot.mind_name != "" else bot.personality) if bot else "",
		"bot_smartness": snappedf(bot.smartness, 0.01) if bot else 0.0,
		"your_tower": snappedf(yours.hp / yours.max_hp, 0.01),
		"enemy_tower": snappedf(theirs.hp / theirs.max_hp, 0.01),
		"build": Run.upgrades.duplicate(),
		"levels": Run.levels.duplicate(),
	}


## --osc: every 0.25 s, count direction turnarounds per bot; 8+ in 5 s is a
## decision loop — print it once (per 5 s) with the decisions it flipped between.
var osc_found := 0
func _watch_osc(osc: Dictionary, units: Array, t: float) -> void:
	for u: Variant in units:
		if u == null or not is_instance_valid(u) or not u.is_targetable():
			continue
		var st: Dictionary = osc.get(u, {"px": u.position.x, "last": 0.0, "turns": [], "whys": [], "quiet_until": 0.0})
		var dx: float = u.position.x - float(st["px"])
		st["px"] = u.position.x
		if absf(dx) > 6.0:
			if float(st["last"]) != 0.0 and (dx > 0.0) != (float(st["last"]) > 0.0):
				st["turns"].append(t)
			st["last"] = dx
		st["whys"].append([t, ("x%d y%d " % [int(u.position.x), int(u.position.y)]) + str(u.get("why")) + ("+combo" if not u.get("_combo").is_empty() else "") + ("+retreat" if u.get("_retreating") else "") + ("+wary" if u.get("_wary") else "")])
		var tw := str(u.get("why"))
		if tw.begins_with("totem:") and tw != str(st.get("tw", "")):
			print("TOTEM R%d t=%.0f %s %s %s" % [Run.round_num, t, "blue" if u.team == 0 else "red", u.def["name"], tw])
		st["tw"] = tw if tw.begins_with("totem:") else ""
		var keying := str(u.get("why")).begins_with("leash:key")  # key runs (bot.gd): print each start and end
		if keying != bool(st.get("key", false)):
			st["key"] = keying
			var et: Node2D = u.get("lane").tower(1 - u.team) if u.get("lane") else null
			print("KEY %s R%d t=%.0f %s %s  enemy tower %d%%  (%s)" % ["start" if keying else "end  ", Run.round_num, t, "blue" if u.team == 0 else "red",
				u.def["name"], int(100.0 * et.hp / et.max_hp) if et else -1, str(u.get("why")) if keying else "ended: " + str(u.get("key_ended"))])
		st["turns"] = st["turns"].filter(func(x: float) -> bool: return x > t - 5.0)
		st["whys"] = st["whys"].filter(func(x: Array) -> bool: return float(x[0]) > t - 5.0)
		if st["turns"].size() >= 8 and t > float(st["quiet_until"]):
			st["quiet_until"] = t + 5.0
			osc_found += 1
			var seen := {}
			for w: Array in st["whys"]:
				var label: String = str(w[1]).split(" ", true, 2)[2] if str(w[1]).count(" ") >= 2 else str(w[1])
				seen[label] = int(seen.get(label, 0)) + 1
			print("   trail: " + " | ".join(st["whys"].map(func(w: Array) -> String: return "%.1f %s" % [w[0], w[1]])))
			var foe: Node2D = u.enemy_hero
			var dist: float = u.position.distance_to(foe.position) if is_instance_valid(foe) and foe.is_targetable() else -1.0
			print("OSC R%d t=%.0f %s %s x=%d hp=%.0f%% foe dist=%d  decisions: %s" % [Run.round_num, t, "blue" if u.team == 0 else "red",
				u.def["name"], int(u.position.x), 100.0 * u.hp / u.max_hp, int(dist), str(seen)])
		osc[u] = st


## Spend gold in the between-round shop by the chosen policy (Run.policy_shop,
## shared with the dev Watch-bots mode); returns what it bought (upgrade ids,
## and "Q+", "W+"… for ability levels), and writes the play-log lines.
func _shop() -> Array:
	var bought: Array = []
	for p: Dictionary in Run.policy_shop(str(opts["policy"])):
		if p["tier"] == "level":
			PlayLog.event("buy_level", {"slot": p["slot"], "level": p["level"], "gold_left": p["gold_left"]})
		else:
			PlayLog.event("buy", {"id": p["id"], "tier": p["tier"], "gold_left": p["gold_left"]})
		bought.append(p["id"])
	return bought


# ------------------------------------------------------------------ reporting

static func _clock(t: float) -> String:
	return "%d:%02d" % [int(t) / 60, int(t) % 60]


func _run_line(run: Dictionary) -> String:
	var parts: Array = []
	for r: Dictionary in run["rounds"]:
		parts.append("R%d %s %s +%dg %dlh %dk/%dd" % [r["round"], r["outcome"].substr(0, 1).to_upper(),
			_clock(r["time"]), r["gold_earned"], r["last_hits"], r["kills"], r["deaths"]])
	var lv: Dictionary = run["levels"]
	return "Run %-2d seed %-7d %-9s %-12s %s   levels Q%d W%d E%d R%d   build: %s" % [run["run"], run["seed"], run["hero"],
		run["result"].to_upper(), " | ".join(parts), lv["Q"], lv["W"], lv["E"], lv["R"],
		", ".join(run["build"].map(func(id: String) -> String: return Upgrades.find(id)["name"]))]


func _report(runs: Array, wall: float) -> void:
	print("")
	print("== AUTOPLAY  %d runs · policy %s · heroes %s · seed %d · %.1f s wall" % [runs.size(), opts["policy"], opts["hero"], _seed_base, wall])
	print("")
	print("Round  played  won    lost   timeout  avg time  avg gold  avg LH  avg kills  avg deaths")
	var top := 0
	for run: Dictionary in runs:
		top = maxi(top, run["rounds"].size())
	for n in range(1, top + 1):
		var rs: Array = []
		for run: Dictionary in runs:
			for r: Dictionary in run["rounds"]:
				if r["round"] == n:
					rs.append(r)
		if rs.is_empty():
			continue
		var c := func(o: String) -> int: return rs.filter(func(r: Dictionary) -> bool: return r["outcome"] == o).size()
		var avg := func(k: String) -> float: return rs.reduce(func(acc: float, r: Dictionary) -> float: return acc + float(r[k]), 0.0) / rs.size()
		print("R%-5d %-7d %-6s %-6d %-8d %-9s %-9d %-7.1f %-10.1f %.1f" % [n, rs.size(), "%d%%" % roundi(100.0 * c.call("won") / rs.size()),
			c.call("lost"), c.call("timeout"), _clock(avg.call("time")), roundi(avg.call("gold_earned")),
			avg.call("last_hits"), avg.call("kills"), avg.call("deaths")])
	var done := runs.filter(func(r: Dictionary) -> bool: return r["result"].begins_with("capped"))
	var reached: float = runs.reduce(func(acc: float, r: Dictionary) -> float: return acc + float(r["reached"]), 0.0) / maxi(runs.size(), 1)
	print("")
	print("Average round reached: %.1f   ·   hit the %d-round cap: %d / %d" % [reached, int(opts["max-rounds"]), done.size(), runs.size()])
	var ends := {}
	for run: Dictionary in runs:
		ends[run["result"]] = ends.get(run["result"], 0) + 1
	print("Endings: " + ", ".join(ends.keys().map(func(k: String) -> String: return "%s ×%d" % [k, ends[k]])))
	var by_hero := {}
	for run: Dictionary in runs:
		var h: Array = by_hero.get(run["hero"], [0, 0])
		h[1] += 1
		h[0] += int(run["reached"])
		by_hero[run["hero"]] = h
	print("By hero (avg round reached): " + ", ".join(by_hero.keys().map(func(k: String) -> String: return "%s %.1f" % [k, float(by_hero[k][0]) / by_hero[k][1]])))
	var picks := {}
	for run: Dictionary in runs:
		for id: String in run["build"]:
			var p: Array = picks.get(id, [0, 0])
			p[0] += 1
			if run["result"] == "complete":
				p[1] += 1
			picks[id] = p
	if not picks.is_empty():
		var ids := picks.keys()
		ids.sort_custom(func(a: String, b: String) -> bool: return picks[a][0] > picks[b][0])
		print("Bought (times · in completed runs): " + ", ".join(ids.map(func(id: String) -> String:
			return "%s %d·%d" % [Upgrades.find(id)["name"], picks[id][0], picks[id][1]])))


func _save(runs: Array, wall: float) -> void:
	var dir := ProjectSettings.globalize_path(str(opts["out"]))
	DirAccess.make_dir_recursive_absolute(dir)
	var stamp := Time.get_datetime_string_from_system().replace(":", "-")
	var path := dir.path_join("autoplay_%s_%s_%s.json" % [stamp, opts["policy"], opts["variant"]])
	var f := FileAccess.open(path, FileAccess.WRITE)
	f.store_string(JSON.stringify({"options": opts, "seed": _seed_base, "wall_seconds": wall,
		"difficulty": Run.DIFFICULTY, "runs": runs}, "  "))
	print("Saved: " + path)
	if opts["playlog"]:
		print("Play logs: %s   (python tools/analyze_log.py --dir autoplay --list)" % PlayLog.folder())
