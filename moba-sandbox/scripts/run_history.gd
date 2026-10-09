extends CanvasLayer
## Run History: a post-game visualizer over the play logs (only exists for runs
## recorded with the play log switch on). A dropdown picks a past run (newest
## first); tabs show it:
##   Overview  one row per round — matchup, length, K / D, last hits, gold
##   Gold      your gold across the whole run (round lines), gold earned per round
##   Round     one round's timeline: both towers, both heroes' health, deaths,
##             overtime — ◀ ▶ picks the round
##   Lane      time each side spent in the other's half per round, and the
##             chosen round's positions over time
##   Build     what you and red bought after each round
## Opened from the hero-pick and run-over screens; Esc or Close shuts it.
## Dev builds: the Round tab's "Play from round N" restarts the game at the
## start of that round as it was logged — same seed (so the same opponent),
## your gold, cards, levels and hero, red's build — to test the bot there.

const PlayLog := preload("res://scripts/play_log.gd")
const Upgrades := preload("res://scripts/upgrades.gd")
const Heroes := preload("res://scripts/heroes.gd")
const Run := preload("res://scripts/run.gd")

const TABS := ["Overview", "Gold", "Round", "Lane", "Build"]
## Logs from before the heroes had people names: old name → hero index.
const OLD_NAMES := {"Arcanist": 0, "Striker": 1, "Bulwark": 2, "Oracle": 3}
const BLUE := Color("#4f8ff7")
const RED := Color("#ef5350")
const GOLD := Color("#ffd54f")
const INK := Color(0.06, 0.08, 0.1)
const DIM := Color(1, 1, 1, 0.5)
const OVERTIME := {"start": 150.0, "per_round": 20.0, "max": 300.0}  # mirrors lane.gd (for the marker)

var _panel: Control
var _picker: OptionButton
var _files: Array = []        # play log .jsonl paths, newest first
var _run := {}                # the parsed run
var _tab := "Overview"
var _round := 1
var _buttons: Array = []      # this frame's click targets: {rect, action}


func _ready() -> void:
	layer = 26
	process_mode = Node.PROCESS_MODE_ALWAYS
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP
	_panel.draw.connect(_draw_screen)
	_panel.gui_input.connect(_on_gui_input)
	add_child(_panel)
	_picker = OptionButton.new()
	_picker.position = Vector2(40, 70)
	_picker.custom_minimum_size = Vector2(620, 40)
	_picker.add_theme_font_size_override("font_size", 16)
	_picker.item_selected.connect(_load_run)
	add_child(_picker)
	_list_runs()
	if not _files.is_empty():
		_load_run(0)


## Is there anything to show? (The play log feature exists and has logged a run.)
static func has_runs() -> bool:
	if not PlayLog.available():
		return false
	var d := DirAccess.open(PlayLog.folder())
	if d == null:
		return false
	for f: String in d.get_files():
		if f.ends_with(".jsonl"):
			return true
	return false


func _list_runs() -> void:
	var folder := PlayLog.folder()
	var d := DirAccess.open(folder)
	if d == null:
		return
	var names: Array = []
	for f: String in d.get_files():
		if f.ends_with(".jsonl"):
			names.append(f)
	names.sort()
	names.reverse()  # run_<timestamp>: newest first
	for f: String in names:
		var path := folder.path_join(f)
		_files.append(path)
		_picker.add_item(_label_for(path))


## "Oct 03 11:49 · CHAD · reached round 10 · lost", from the run's small
## summary file (falls back to the file name).
func _label_for(path: String) -> String:
	var stamp := path.get_file().trim_prefix("run_").trim_suffix(".jsonl")  # 2026-10-03T11-49-34
	var when := stamp.substr(5, 5).replace("-", "/") + " " + stamp.substr(11, 5).replace("-", ":")
	var summary := path.trim_suffix(".jsonl") + ".json"
	if FileAccess.file_exists(summary):
		var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(summary))
		if data is Dictionary and data.has("runs") and not data["runs"].is_empty():
			var r: Dictionary = data["runs"][0]
			return "%s  ·  %s  ·  reached round %d  ·  %s" % [when, _hero_name(r.get("hero", "?")), int(r.get("reached", 0)), str(r.get("result", "")).split(" ")[0]]
	return when


# ------------------------------------------------------------------ parsing

## Ability levels from a log (JSON numbers come back as floats).
func _int_levels(d: Dictionary) -> Dictionary:
	var out := {"Q": 1, "W": 1, "E": 1, "R": 1}
	for k: String in d:
		out[k] = int(d[k])
	return out


## A logged hero name → its index in heroes.gd (0 if unknown).
func _hero_index(n: String) -> int:
	if OLD_NAMES.has(n):
		return OLD_NAMES[n]
	for i in Heroes.LIST.size():
		if Heroes.LIST[i]["name"] == n:
			return i
	return 0


## Dev: restart the game at the start of logged round `n`, as it was.
func _play_from(n: int) -> void:
	var st: Dictionary = _rd(n).get("start", {})
	if st.is_empty():
		return
	Run.from_dict(st)
	if PlayLog.is_on():  # a replay gets its own play log (marked as one), like a fresh run
		PlayLog.run_start()
		PlayLog.event("replay", {"from": _run.get("file", ""), "round": n})
	get_tree().paused = false
	get_tree().reload_current_scene()


## A logged hero name as it reads today (old logs used the old names).
func _hero_name(n: String) -> String:
	return Heroes.LIST[OLD_NAMES[n]]["name"] if OLD_NAMES.has(n) else n


func _load_run(index: int) -> void:
	_run = _parse(_files[index])
	_run["file"] = str(_files[index]).get_file()  # (a replay's log names where it came from)
	_round = 1
	_panel.queue_redraw()


## One play log → {rounds: {n: round}, order: [n…]}. A round holds its
## start / end facts, snapshots, your deaths and red's (from snapshots), and
## the purchases made after it.
func _parse(path: String) -> Dictionary:
	var rounds := {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		return {"rounds": {}, "order": []}
	var last := 0
	var seed := 0
	var rerolls := 0
	var red_state := {}  # red's build after the latest shop
	while not f.eof_reached():
		var line := f.get_line()
		if line.is_empty():
			continue
		var e: Variant = JSON.parse_string(line)
		if not (e is Dictionary):
			continue
		var n := int(e.get("round", last))
		var t: String = e.get("type", "")
		if t == "run_start":
			seed = int(e.get("seed", 0))
		elif t == "reroll":
			rerolls += 1
		if not rounds.has(n) and n > 0:
			rounds[n] = {"n": n, "snaps": [], "your_deaths": [], "red_deaths": [], "you_bought": [], "red_bought": []}
		if n <= 0:
			continue
		last = n
		var r: Dictionary = rounds[n]
		match t:
			"round_start":
				r["hero"] = _hero_name(e.get("hero", "?"))
				r["bot_hero"] = _hero_name(e.get("bot_hero", "?"))
				r["gold_start"] = int(e.get("gold", 0))
				r["start"] = {"round": n, "phase": "play", "hero": _hero_index(str(e.get("hero", ""))), "gold": int(e.get("gold", 0)),
					"upgrades": e.get("upgrades", []), "seed": seed, "rerolls": rerolls, "levels": _int_levels(e.get("levels", {})),
					"red": red_state.duplicate(true)}
			"round_end":
				for k: String in ["outcome", "time", "kills", "deaths", "last_hits", "missed", "bot_last_hits", "denies", "bot_denies", "gold_earned", "red_ledger", "metrics"]:
					r[k] = e.get(k)
			"snap":
				r["snaps"].append(e)
			"death":
				r["your_deaths"].append(float(e.get("t", 0.0)))
			"buy":
				r["you_bought"].append(str(e.get("id", "")))
			"buy_level":
				r["you_bought"].append(str(e.get("slot", "")) + "+")
			"red_shop":
				r["red_bought"] = e.get("bought", [])
				red_state = {"gold": int(e.get("red_gold_left", 0)), "upgrades": e.get("red_upgrades", []), "levels": _int_levels(e.get("red_levels", {}))}
	# red's deaths: when it goes from alive to dead between snapshots
	for n: int in rounds:
		var s: Array = rounds[n]["snaps"]
		for i in range(1, s.size()):
			if s[i - 1]["bot"]["alive"] and not s[i]["bot"]["alive"]:
				rounds[n]["red_deaths"].append(float(s[i]["t"]))
	var order := rounds.keys()
	order.sort()
	return {"rounds": rounds, "order": order}


# ------------------------------------------------------------------ input

func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key and key.pressed and not key.echo and key.physical_keycode == KEY_ESCAPE:
		queue_free()
		get_viewport().set_input_as_handled()


func _on_gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb == null or not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	for b: Dictionary in _buttons:
		if (b["rect"] as Rect2).has_point(mb.position):
			b["action"].call()
			_panel.queue_redraw()
			return


func _process(_delta: float) -> void:
	_panel.queue_redraw()  # hover highlights


# ------------------------------------------------------------------ drawing helpers

func _text(at: Vector2, s: String, size: int, colour: Color, width := -1.0, align := HORIZONTAL_ALIGNMENT_LEFT) -> void:
	_panel.draw_string(ThemeDB.fallback_font, at, s, align, width, size, colour)


func _button(r: Rect2, label: String, action: Callable, on := false) -> void:
	_buttons.append({"rect": r, "action": action})
	var hot := r.has_point(_panel.get_local_mouse_position())
	_panel.draw_rect(r, Color("#2a3a44") if on else (Color("#22303a") if hot else Color("#1a242b")))
	_panel.draw_rect(r, Color("#80cbc4") if on else Color("#37474f"), false, 2.0)
	_text(r.position + Vector2(0, r.size.y / 2.0 + 6.0), label, 16, Color.WHITE, r.size.x, HORIZONTAL_ALIGNMENT_CENTER)


## A line chart frame: axes, a title, value labels. Returns the plot rect.
func _frame(r: Rect2, title: String, y_max: float, y_label := "") -> Rect2:
	_panel.draw_rect(r, Color(0.08, 0.1, 0.12, 0.9))
	_text(r.position + Vector2(12, 22), title, 16, Color.WHITE)
	var plot := Rect2(r.position + Vector2(56, 36), r.size - Vector2(72, 60))
	for i in 5:  # faint grid with values
		var y := plot.end.y - plot.size.y * i / 4.0
		_panel.draw_line(Vector2(plot.position.x, y), Vector2(plot.end.x, y), Color(1, 1, 1, 0.07), 1.0)
		_text(Vector2(r.position.x + 4, y + 5), _short(y_max * i / 4.0), 12, DIM, 48, HORIZONTAL_ALIGNMENT_RIGHT)
	if y_label != "":
		_text(Vector2(plot.position.x, r.end.y - 6), y_label, 12, DIM)
	return plot


func _short(v: float) -> String:
	return "%.1fk" % (v / 1000.0) if v >= 1000.0 else str(roundi(v))


func _polyline(plot: Rect2, pts: Array, x_max: float, y_max: float, colour: Color, width := 2.0) -> void:
	if pts.size() < 2:
		return
	var line := PackedVector2Array()
	for p: Vector2 in pts:
		line.append(plot.position + Vector2(plot.size.x * clampf(p.x / maxf(x_max, 0.001), 0.0, 1.0), plot.size.y * (1.0 - clampf(p.y / maxf(y_max, 0.001), 0.0, 1.0))))
	_panel.draw_polyline(line, colour, width, true)


func _legend(at: Vector2, items: Array) -> void:
	var x := at.x
	for it: Array in items:
		_panel.draw_rect(Rect2(Vector2(x, at.y - 9), Vector2(14, 4)), it[1])
		_text(Vector2(x + 20, at.y), it[0], 13, Color(1, 1, 1, 0.8))
		x += 30.0 + ThemeDB.fallback_font.get_string_size(it[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x


# ------------------------------------------------------------------ the screen

func _draw_screen() -> void:
	_buttons = []
	var view := _panel.get_viewport_rect().size
	_panel.draw_rect(Rect2(Vector2.ZERO, view), Color(0.03, 0.04, 0.05, 0.97))
	_text(Vector2(40, 50), "RUN HISTORY", 30, Color.WHITE)
	_button(Rect2(Vector2(view.x - 200, 24), Vector2(160, 44)), "Close  (Esc)", queue_free)
	if _files.is_empty():
		_text(Vector2(0, view.y / 2.0), "No logged runs yet — turn the play log on (hero-pick screen) and play a run.", 18, DIM, view.x, HORIZONTAL_ALIGNMENT_CENTER)
		return
	var x := 690.0
	for t: String in TABS:
		var tab: String = t
		_button(Rect2(Vector2(x, 70), Vector2(112, 40)), t, func() -> void: _tab = tab, _tab == t)
		x += 120.0
	var order: Array = _run.get("order", [])
	if order.is_empty():
		_text(Vector2(0, view.y / 2.0), "This run has no finished rounds to show.", 18, DIM, view.x, HORIZONTAL_ALIGNMENT_CENTER)
		return
	var area := Rect2(Vector2(40, 130), view - Vector2(80, 160))
	match _tab:
		"Overview":
			_draw_overview(area, order)
		"Gold":
			_draw_gold(area, order)
		"Round":
			_draw_round(area, order)
		"Lane":
			_draw_lane(area, order)
		"Build":
			_draw_build(area, order)


func _rd(n: int) -> Dictionary:
	return _run["rounds"][n]


# ------------------------------------------------------------------ tabs

func _draw_overview(area: Rect2, order: Array) -> void:
	var cols := [["Round", 60], ["You vs red", 200], ["Result", 80], ["Length", 70], ["Wave", 80], ["Damage", 90], ["Last hits", 130], ["K / D", 70], ["Red's LH", 90], ["Denies", 100], ["Gold", 90]]
	var y := area.position.y + 24.0
	var x := area.position.x
	for c: Array in cols:
		_text(Vector2(x, y), c[0], 14, DIM)
		x += float(c[1])
	y += 10.0
	for n: int in order:
		var r := _rd(n)
		y += 30.0
		var won: bool = str(r.get("outcome", "")) == "won"
		_panel.draw_rect(Rect2(Vector2(area.position.x - 8, y - 21), Vector2(area.size.x + 16, 28)), Color(1, 1, 1, 0.03 if n % 2 == 0 else 0.0))
		var t := float(r.get("time", 0.0))
		var m := _metrics(r)
		var cells := [str(n), "%s vs %s" % [r.get("hero", "?"), r.get("bot_hero", "?")],
			str(r.get("outcome", "—")), "%d:%02d" % [int(t) / 60, int(t) % 60],
			"%+.1f" % float(m["wave_adv"]) if m.has("wave_adv") else "—",
			"%.2f" % float(m["dmg_ratio"]) if float(m.get("dmg_ratio", -1.0)) >= 0.0 else "—",
			"%s (%d%%)" % [str(r.get("last_hits", "—")), int(m["lh_pct"])] if m.has("lh_pct") else "—",
			"%s / %s" % [str(r.get("kills", "—")), str(r.get("deaths", "—"))],
			str(r.get("bot_last_hits", "—")),
			"%s / %s" % [str(r.get("denies", "—")), str(r.get("bot_denies", "—"))], str(r.get("gold_earned", "—"))]
		x = area.position.x
		for i in cells.size():
			var colour := Color.WHITE
			if i == 2:
				colour = Color("#81c784") if won else (RED if r.has("outcome") else DIM)
			elif i == 4 and m.has("wave_adv"):  # wave: ahead green, behind red
				colour = Color("#81c784") if float(m["wave_adv"]) > 0.0 else (RED if float(m["wave_adv"]) < 0.0 else Color.WHITE)
			_text(Vector2(x, y), cells[i], 15, colour)
			x += float(cols[i][1])


func _draw_gold(area: Rect2, order: Array) -> void:
	# your gold on hand across the whole run (time strung end to end), round lines
	var top := Rect2(area.position, Vector2(area.size.x, area.size.y * 0.58))
	var pts: Array = []
	var marks: Array = []
	var offset := 0.0
	var gmax := 100.0
	for n: int in order:
		var snaps: Array = _rd(n)["snaps"]
		marks.append([offset, n])
		for s: Dictionary in snaps:
			var g := float(s.get("gold", 0))
			pts.append(Vector2(offset + float(s["t"]), g))
			gmax = maxf(gmax, g)
		offset += float(snaps[-1]["t"]) if not snaps.is_empty() else 0.0
	var plot := _frame(top, "Your gold on hand over the run", gmax * 1.1, "time →  (spent in the shop between rounds)")
	for m: Array in marks:
		var mx: float = plot.position.x + plot.size.x * m[0] / maxf(offset, 1.0)
		_panel.draw_line(Vector2(mx, plot.position.y), Vector2(mx, plot.end.y), Color(1, 1, 1, 0.12), 1.0)
		_text(Vector2(mx + 3, plot.position.y + 12), "R%d" % m[1], 11, DIM)
	_polyline(plot, pts, offset, gmax * 1.1, GOLD)
	# gold earned per round: bars
	var bottom := Rect2(area.position + Vector2(0, top.size.y + 16), Vector2(area.size.x, area.size.y - top.size.y - 16))
	var emax := 100.0
	for n: int in order:
		emax = maxf(emax, float(_rd(n).get("gold_earned", 0)))
	var bp := _frame(bottom, "Gold earned per round", emax * 1.1)
	var w := bp.size.x / order.size()
	for i in order.size():
		var e := float(_rd(order[i]).get("gold_earned", 0))
		var h := bp.size.y * e / (emax * 1.1)
		_panel.draw_rect(Rect2(Vector2(bp.position.x + i * w + w * 0.15, bp.end.y - h), Vector2(w * 0.7, h)), Color(GOLD, 0.8))
		_text(Vector2(bp.position.x + i * w, bp.end.y - h - 4), str(int(e)), 12, Color.WHITE, w, HORIZONTAL_ALIGNMENT_CENTER)
		_text(Vector2(bp.position.x + i * w, bp.end.y + 16), "R%d" % order[i], 12, DIM, w, HORIZONTAL_ALIGNMENT_CENTER)


func _round_picker(area: Rect2, order: Array) -> void:
	_round = clampi(_round, int(order[0]), int(order[-1]))
	var r := _rd(_round) if _run["rounds"].has(_round) else {}
	_button(Rect2(area.position, Vector2(44, 36)), "◀", func() -> void: _round = maxi(int(order[0]), _round - 1))
	_button(Rect2(area.position + Vector2(52, 0), Vector2(44, 36)), "▶", func() -> void: _round = mini(int(order[-1]), _round + 1))
	_text(area.position + Vector2(110, 25), "Round %d  ·  %s vs %s  ·  %s" % [_round, r.get("hero", "?"), r.get("bot_hero", "?"), r.get("outcome", "—")], 18, Color.WHITE)
	if OS.is_debug_build() and not OS.has_feature("template") and r.has("start"):  # dev only: replay from here
		var n := _round
		_button(Rect2(Vector2(area.end.x - 230.0, area.position.y), Vector2(230, 36)), "▶ Play from round %d" % n, func() -> void: _play_from(n))


## A round's headline numbers: from its summary (play_log.gd round_metrics), or
## worked out from the timeline for logs written before they were saved.
##   wave_adv: your creeps minus red's, averaged · dmg_ratio: your damage to red ÷
##   red's to you · lh_pct: last hits ÷ (last hits + missed)
func _metrics(r: Dictionary) -> Dictionary:
	var m: Dictionary = r.get("metrics", {}) if r.get("metrics") is Dictionary else {}
	if not m.is_empty():
		return m
	m = {}
	var snaps: Array = r.get("snaps", [])
	if not snaps.is_empty():
		var sum := 0.0
		for s: Dictionary in snaps:
			sum += float(s["creeps"][0]) - float(s["creeps"][1])
		m["wave_adv"] = sum / snaps.size()
	if r.get("red_ledger") is Dictionary:
		var led: Dictionary = r["red_ledger"]
		var to_red := 0.0
		for k: String in led.get("taken", {}):
			if k.begins_with("you"):
				to_red += float(led["taken"][k])
		var to_you := 0.0
		for k: String in led.get("dealt", {}):
			to_you += float(led["dealt"][k])
		if to_you > 0.0:
			m["dmg_ratio"] = to_red / to_you
	if r.get("last_hits") != null and r.get("missed") != null:
		m["lh_pct"] = roundi(100.0 * float(r["last_hits"]) / maxf(1.0, float(r["last_hits"]) + float(r["missed"])))
	return m


func _draw_round(area: Rect2, order: Array) -> void:
	_round_picker(area, order)
	var r := _rd(_round)
	var snaps: Array = r["snaps"]
	var m := _metrics(r)  # the headline numbers, over the charts
	var line := "Wave %s    Damage ratio %s    Last hits %s" % [
		"%+.1f" % float(m["wave_adv"]) if m.has("wave_adv") else "—",
		"%.2f" % float(m["dmg_ratio"]) if float(m.get("dmg_ratio", -1.0)) >= 0.0 else "—",
		"%d%%" % int(m["lh_pct"]) if m.has("lh_pct") else "—"]
	_text(area.position + Vector2(520, 25), line, 15, Color(1, 1, 1, 0.85))
	if snaps.size() < 2:
		_text(area.position + Vector2(0, 80), "No timeline recorded for this round.", 16, DIM)
		return
	var t_max := float(snaps[-1]["t"])
	var ot := minf(OVERTIME["max"], OVERTIME["start"] + OVERTIME["per_round"] * _round)
	var half := (area.size.y - 60.0) / 2.0
	# towers
	var top := Rect2(area.position + Vector2(0, 48), Vector2(area.size.x, half - 8))
	var tmax := maxf(float(snaps[0]["towers"][0]), float(snaps[0]["towers"][1]))
	var tp := _frame(top, "Towers", tmax)
	var yours: Array = []
	var theirs: Array = []
	for s: Dictionary in snaps:
		yours.append(Vector2(float(s["t"]), float(s["towers"][0])))
		theirs.append(Vector2(float(s["t"]), float(s["towers"][1])))
	_mark_time(tp, ot, t_max, "overtime", Color("#ff8a65"))
	_polyline(tp, yours, t_max, tmax, BLUE, 2.5)
	_polyline(tp, theirs, t_max, tmax, RED, 2.5)
	_legend(Vector2(top.end.x - 300, top.position.y + 22), [["your tower", BLUE], ["red's tower", RED]])
	# heroes' health with deaths
	var bot := Rect2(area.position + Vector2(0, 48 + half + 8), Vector2(area.size.x, half - 8))
	var hmax := 1.0
	for s: Dictionary in snaps:
		hmax = maxf(hmax, maxf(float(s["you"]["hp"]), float(s["bot"]["hp"])))
	var hp := _frame(bot, "Health  (✕ = a death)", hmax)
	var you_line: Array = []
	var bot_line: Array = []
	for s: Dictionary in snaps:
		you_line.append(Vector2(float(s["t"]), float(s["you"]["hp"]) if s["you"]["alive"] else 0.0))
		bot_line.append(Vector2(float(s["t"]), float(s["bot"]["hp"]) if s["bot"]["alive"] else 0.0))
	_mark_time(hp, ot, t_max, "", Color("#ff8a65"))
	_polyline(hp, you_line, t_max, hmax, BLUE, 1.5)
	_polyline(hp, bot_line, t_max, hmax, RED, 1.5)
	for d: float in r["your_deaths"]:
		_cross(hp, d, t_max, BLUE)
	for d: float in r["red_deaths"]:
		_cross(hp, d, t_max, RED)
	_legend(Vector2(bot.end.x - 300, bot.position.y + 22), [["you", BLUE], ["red", RED]])
	_text(Vector2(bot.position.x + 56, bot.end.y - 6), "time →  %d:%02d" % [int(t_max) / 60, int(t_max) % 60], 12, DIM)


func _mark_time(plot: Rect2, t: float, t_max: float, label: String, colour: Color) -> void:
	if t > t_max:
		return
	var x := plot.position.x + plot.size.x * t / maxf(t_max, 1.0)
	_panel.draw_line(Vector2(x, plot.position.y), Vector2(x, plot.end.y), Color(colour, 0.5), 1.5)
	if label != "":
		_text(Vector2(x + 4, plot.position.y + 12), label, 11, colour)


func _cross(plot: Rect2, t: float, t_max: float, colour: Color) -> void:
	var c := Vector2(plot.position.x + plot.size.x * t / maxf(t_max, 1.0), plot.end.y - 8)
	_panel.draw_line(c + Vector2(-6, -6), c + Vector2(6, 6), colour, 2.5)
	_panel.draw_line(c + Vector2(-6, 6), c + Vector2(6, -6), colour, 2.5)


func _draw_lane(area: Rect2, order: Array) -> void:
	# per round: share of time in the other side's half (you: x > 0, red: x < 0)
	var top := Rect2(area.position, Vector2(area.size.x, area.size.y * 0.42))
	var bp := _frame(top, "Time in the enemy's half, per round", 100.0, "%")
	var w := bp.size.x / order.size()
	for i in order.size():
		var snaps: Array = _rd(order[i])["snaps"]
		var ya := snaps.filter(func(s: Dictionary) -> bool: return s["you"]["alive"])
		var ba := snaps.filter(func(s: Dictionary) -> bool: return s["bot"]["alive"])
		var yp: float = 100.0 * ya.filter(func(s: Dictionary) -> bool: return float(s["you"]["at"][0]) > 0.0).size() / maxf(ya.size(), 1.0)
		var bpct: float = 100.0 * ba.filter(func(s: Dictionary) -> bool: return float(s["bot"]["at"][0]) < 0.0).size() / maxf(ba.size(), 1.0)
		for j in 2:
			var v: float = yp if j == 0 else bpct
			var h := bp.size.y * v / 100.0
			_panel.draw_rect(Rect2(Vector2(bp.position.x + i * w + w * (0.15 + 0.36 * j), bp.end.y - h), Vector2(w * 0.32, h)), BLUE if j == 0 else RED)
		_text(Vector2(bp.position.x + i * w, bp.end.y + 16), "R%d" % order[i], 12, DIM, w, HORIZONTAL_ALIGNMENT_CENTER)
	_legend(Vector2(top.end.x - 330, top.position.y + 22), [["you in red's half", BLUE], ["red in your half", RED]])
	# the chosen round: positions along the lane over time
	var lower := Rect2(area.position + Vector2(0, top.size.y + 16), Vector2(area.size.x, area.size.y - top.size.y - 16))
	_round_picker(lower, order)
	var snaps2: Array = _rd(_round)["snaps"]
	if snaps2.size() < 2:
		return
	var t_max := float(snaps2[-1]["t"])
	var chart := Rect2(lower.position + Vector2(0, 44), lower.size - Vector2(0, 44))
	var pp := _frame(chart, "Position along the lane  (top = red's base, bottom = yours)", 5200.0)
	var mid := pp.position.y + pp.size.y / 2.0
	_panel.draw_line(Vector2(pp.position.x, mid), Vector2(pp.end.x, mid), Color(1, 1, 1, 0.25), 1.0)
	var you_pts: Array = []
	var bot_pts: Array = []
	for s: Dictionary in snaps2:
		if s["you"]["alive"]:
			you_pts.append(Vector2(float(s["t"]), float(s["you"]["at"][0]) + 2600.0))
		if s["bot"]["alive"]:
			bot_pts.append(Vector2(float(s["t"]), float(s["bot"]["at"][0]) + 2600.0))
	_polyline(pp, you_pts, t_max, 5200.0, BLUE, 1.5)
	_polyline(pp, bot_pts, t_max, 5200.0, RED, 1.5)


func _draw_build(area: Rect2, order: Array) -> void:
	_text(area.position + Vector2(0, 20), "Bought after each round", 16, Color.WHITE)
	var y := area.position.y + 52.0
	for n: int in order:
		var r := _rd(n)
		_text(Vector2(area.position.x, y + 18), "R%d" % n, 15, DIM)
		_chips(Vector2(area.position.x + 50, y), "you", r["you_bought"], BLUE)
		_chips(Vector2(area.position.x + 50, y + 30), "red", r["red_bought"], RED)
		y += 70.0
		if y > area.end.y - 40.0:
			_text(Vector2(area.position.x, y + 10), "…", 16, DIM)
			return


func _chips(at: Vector2, who: String, ids: Array, colour: Color) -> void:
	_text(at + Vector2(0, 18), who, 13, colour)
	var x := at.x + 40.0
	if ids.is_empty():
		_text(Vector2(x, at.y + 18), "—", 13, DIM)
	for id: Variant in ids:
		var s := str(id)
		var name := s
		var tc := Upgrades.LEVEL_COLOR
		if not s.ends_with("+"):
			var u := Upgrades.find(s)
			if not u.is_empty():
				name = u["name"]
				tc = Upgrades.TIERS[u["tier"]]["color"]
		else:
			name = s.trim_suffix("+") + " level"
		var w := ThemeDB.fallback_font.get_string_size(name, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 18.0
		_panel.draw_rect(Rect2(Vector2(x, at.y), Vector2(w, 24)), Color(tc, 0.18))
		_panel.draw_rect(Rect2(Vector2(x, at.y), Vector2(4, 24)), tc)
		_text(Vector2(x + 10, at.y + 17), name, 13, Color.WHITE)
		x += w + 6.0
