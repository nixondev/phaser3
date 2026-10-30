extends CanvasLayer
## The run's screens between rounds, drawn over the paused game (this layer
## keeps processing while the tree is paused):
##
##   pick   choose your hero for the run (click a card, or 1–4)
##   shop   after a won round: pick your hero for the next round (levels
##          carry over by letter), buy ability levels (Q/W/E/R +1), three
##          priced tiers of upgrades (Gamble rerolls them), then Next round (Enter)
##   over   lost a round — the run ends (endless: score = round reached);
##          New run (Enter)
##
## It also notices the round ending (a tower falling), waits a moment so you
## see it, then opens the right screen. Emits `reload` when main should
## rebuild the scene for the next round or a new run.

const Run := preload("res://scripts/run.gd")
const Upgrades := preload("res://scripts/upgrades.gd")
const Heroes := preload("res://scripts/heroes.gd")
const HeroScript := preload("res://scripts/hero.gd")
const PlayLog := preload("res://scripts/play_log.gd")
const RunHistoryScript := preload("res://scripts/run_history.gd")
const HowToPlayScript := preload("res://scripts/how_to_play.gd")
const AbilityInfo := preload("res://scripts/ability_info.gd")

signal reload

const END_DELAY := 1.5       # seconds between the tower falling and the screen
## Shown over the lock bar after a win, one picked at random. Add freely.
const CHEERS := ["Good job!", "Nicely done!", "Tower down!", "Well played!", "Clean push!",
	"That's how it's done!", "Round won!", "Great work!", "They never stood a chance.", "Onward!",
	"Your contender stands!", "Champion of round %d!"]  # %d = the round just won
## Flavour copy calls your hero something different every time (hero, fighter,
## champ, contender, brawler, challenger) — on purpose. Instructions (tooltips,
## HOW_TO_PLAY, the controls hint, the Esc menu) always say "hero".
const SCREEN_LOCK := 1.5  # after a round ends, the shop / run-over screen ignores input this long
## Watch bots (dev only, never shipped — see _dev_tools): a bot plays your seat
## while every run screen stays, so you can watch a full run the way you'd
## watch a match. The toggle is on the hero-pick screen; picking a hero then
## starts a watched run. The shop buys itself by WATCH_POLICY (the same shopper
## autoplay uses) and sits on screen WATCH_SHOP seconds so you can read it.
## It never stops on its own: when a run ends it waits WATCH_OVER seconds on the
## score, then starts the next hero in the list and plays on, round the four
## for as long as you leave it up.
static var watch := false
static var watch_hero := 0      # the hero this watched run is playing; the next run takes the next one
const WATCH_POLICY := "greedy"  # tools/autoplay.gd --policy: greedy | levels | epic | random | none
const WATCH_SHOP := 5.0         # seconds the shop stays up before the next round starts
const WATCH_OVER := 6.0         # seconds the run-over score stays up before the next run starts
const GOLD := Color("#ffd54f")
const INK := Color("#10151a")

var hero: Node2D
var lane: Node2D

var _panel: Control
var _buttons: Array = []     # this frame's click targets: {rect, action, enabled}
var _offers := {}            # tier -> Array of upgrade dicts
var _bought: Array = []      # "tier:index" cards bought in this shop
var _ending := -1.0          # counting down to the end-of-round screen
var _tip := {}               # the shop tooltip to draw on top this frame: {info, rect}
## Price preview: hovering something you can buy shows, on every other price,
## what it will cost after that pick (prices rise each pick). Set while drawing;
## shown from the frame after (the hovered item may be drawn after the others).
var _pick_hover := ""
var _pick_hover_prev := ""
var _lock := 0.0
var _watch_next := -1.0      # watch mode: counting down to the next round
var _cheer := ""             # this win's line over the lock bar ("" after a loss)             # seconds the screen ignores clicks / Enter after a round ends


func _ready() -> void:
	layer = 20
	process_mode = Node.PROCESS_MODE_ALWAYS
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.draw.connect(_draw_screen)
	_panel.gui_input.connect(_on_gui_input)
	add_child(_panel)
	if Run.phase == "play":
		Run.save_continue()  # a round is starting: Continue comes back here
	_refresh()


## Show / hide and pause to match the run's phase.
func _refresh() -> void:
	var open := Run.phase != "play"
	visible = open
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP if open else Control.MOUSE_FILTER_IGNORE
	get_tree().paused = open
	if Run.phase == "shop":
		_offers = Run.shop_offers()
	_panel.queue_redraw()


func _process(delta: float) -> void:
	if Run.phase == "play" and lane and lane.winner >= 0:
		if _ending < 0.0:
			_ending = END_DELAY
		_ending -= delta
		if _ending <= 0.0:
			_round_over(lane.winner == hero.team)
	_lock = maxf(0.0, _lock - delta)
	if _watch_next > 0.0:  # watch mode: the shop reads itself out, then plays on
		_watch_next -= delta
		if _watch_next <= 0.0:
			_watch_next = -1.0
			if Run.phase == "over":
				watch_next_run()
			else:
				next_round()
	if visible:
		_panel.queue_redraw()  # hover highlights


func _round_over(won: bool) -> void:
	_ending = -1.0
	_lock = SCREEN_LOCK  # clicks still landing from the fight don't buy anything
	_cheer = (CHEERS[randi() % CHEERS.size()].replace("%d", str(Run.round_num))) if won else ""
	var outcome := "won" if won else "lost"
	PlayLog.screenshot("round_" + outcome)
	PlayLog.round_end(get_parent(), outcome)
	Run.gold = hero.gold
	var bot: Node2D = get_parent().bot
	if bot:
		Run.red_gold = bot.gold  # what red's bot earned this round (on top of what it had)
	if not won:
		Run.phase = "over"
		Run.record_best()
		Run.clear_continue()  # the run is over: nothing to continue
	else:  # endless: every win leads to the shop
		Run.gold += Run.WIN_GOLD
		Run.phase = "shop"
		_bought = []
	_refresh()
	if Run.phase == "shop":
		Run.red_shop()  # red spends too; its next bot plays the build
		Run.save_continue()  # quit in the shop: Continue comes back to it (not to the round you just won)
		PlayLog.event("shop_open", {"gold": Run.gold})
		PlayLog.event("red_shop", {"bought": Run.red_bought.duplicate(), "red_upgrades": Run.red_upgrades.duplicate(),
			"red_levels": Run.red_levels.duplicate(), "red_gold_left": Run.red_gold})
		if _watching():  # nobody is holding the mouse: shop by policy and play on
			for p: Dictionary in Run.policy_shop(WATCH_POLICY):
				if p["tier"] == "level":
					PlayLog.event("buy_level", {"slot": p["slot"], "level": p["level"], "gold_left": p["gold_left"]})
				else:
					PlayLog.event("buy", {"id": p["id"], "tier": p["tier"], "gold_left": p["gold_left"]})
			_refresh()  # the offers and gold it just spent
			_watch_next = WATCH_SHOP
		_shop_screenshot.call_deferred()
	else:
		PlayLog.run_end("complete" if Run.phase == "won" else "lost R%d" % Run.round_num)
		if _watching():
			_watch_next = WATCH_OVER  # read the score, then the next hero goes


# ------------------------------------------------------------------ actions

func pick(i: int) -> void:
	if watch:
		watch_hero = i
		get_parent().start_watch(i)  # dev: a bot takes your seat; the scene rebuilds
		return
	get_parent().clear_watch()  # an earlier watched run may have left a bot in your seat
	Run.start(i)
	hero.set_hero(i)
	hero.start_ult_cooldown()  # picking rebuilt the hero (cooldowns reset): round 1 opens with the ultimate cooling down too
	if get_parent().has_method("repick_bot"):
		get_parent().repick_bot()  # red for round 1, from this run's seed
	Run.save_continue()
	_refresh()
	if PlayLog.is_on():
		PlayLog.run_start()
		get_parent().start_play_log_probe()


func _shop_screenshot() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	PlayLog.screenshot("shop")


## Buy the card at `index` in `tier`'s row.
func buy(tier: String, index: int) -> bool:
	var key := "%s:%d" % [tier, index]
	var u: Dictionary = _offers[tier][index]
	if _bought.has(key) or not Run.buy(u["id"]):
		return false
	_bought.append(key)
	PlayLog.event("buy", {"id": u["id"], "tier": u["tier"], "gold_left": Run.gold})
	if u.get("on_buy", "") == "reroll":  # Gamble: every offer rolls again
		_offers = Run.shop_offers()
		_bought = []
		PlayLog.event("reroll", {"gold_left": Run.gold})
	return true


## Raise `slot` (Q/W/E/R) one level — applies to whichever hero you play.
func buy_level(slot: String) -> bool:
	if not Run.buy_level(slot):
		return false
	PlayLog.event("buy_level", {"slot": slot, "level": Run.levels[slot], "gold_left": Run.gold})
	return true


## The hero for the next round (free; levels and upgrades carry over).
func choose_hero(i: int) -> void:
	Run.choose_hero(i)
	PlayLog.event("choose_hero", {"hero": Heroes.LIST[i]["name"]})


func next_round() -> void:
	PlayLog.event("next_round", {"hero": Heroes.LIST[Run.hero_index]["name"], "gold": Run.gold})
	Run.next_round()
	get_tree().paused = false
	reload.emit()


## A bot is in your seat right now (Watch bots), so no one is going to click.
func _watching() -> bool:
	return get_parent().has_method("watching") and bool(get_parent().watching())


## Dev tools (the Cards view): only when run from the project — never in an
## exported build, which doesn't even contain their scripts (export_presets.cfg
## excludes them), so they're loaded by path, not preloaded.
static func _dev_tools() -> bool:
	return OS.is_debug_build() and not OS.has_feature("template")


## The card list and plain-text card requests (dev only; on top of this screen).
func open_cards() -> void:
	if not _dev_tools() or get_parent().has_node("CardView"):
		return
	var v: CanvasLayer = load("res://scripts/card_view.gd").new()
	v.name = "CardView"
	get_parent().add_child(v)


## How to Play, as a modal over this screen.
func open_help() -> void:
	if not get_parent().has_node("HowToPlay"):
		var h: CanvasLayer = load("res://scripts/how_to_play.gd").new()
		h.name = "HowToPlay"
		get_parent().add_child(h)


## The post-game visualizer over the play logs (on top of this screen).
func open_history() -> void:
	if get_parent().has_node("RunHistory"):
		return
	var h: CanvasLayer = RunHistoryScript.new()
	h.name = "RunHistory"
	get_parent().add_child(h)


## Continue the saved run: back to the start of the round it was on.
func continue_run() -> void:
	var d := Run.load_continue()
	if d.is_empty():
		return
	Run.from_dict(d)  # (its phase: "play" = the start of a round, "shop" = the shop after a win)
	if PlayLog.is_on():  # a continued run gets its own play log (marked as one)
		PlayLog.run_start()
		PlayLog.event("continue", {"round": Run.round_num, "phase": Run.phase})
	get_tree().paused = false
	reload.emit()


## Watch mode: that run is done — take the next hero and keep playing, so the
## view cycles KYLE → CHAD → KAREN → BECKY → KYLE for as long as it's left up.
func watch_next_run() -> void:
	Run.clear_continue()
	Run.reset()
	watch_hero = (watch_hero + 1) % Heroes.LIST.size()
	get_tree().paused = false
	get_parent().start_watch(watch_hero)


func new_run() -> void:
	Run.clear_continue()
	Run.reset()
	get_tree().paused = false
	reload.emit()


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if not visible or key == null or not key.pressed or key.echo:
		return
	if key.physical_keycode == KEY_ESCAPE and Run.phase in ["pick", "over", "won"]:
		get_tree().quit()  # Esc on the hero pick / run over screens quits
		return
	if _lock > 0.0:
		get_viewport().set_input_as_handled()
		return
	match Run.phase:
		"pick":
			if key.physical_keycode >= KEY_1 and key.physical_keycode < KEY_1 + Heroes.LIST.size():
				pick(key.physical_keycode - KEY_1)
		"shop":
			if key.physical_keycode in [KEY_ENTER, KEY_KP_ENTER]:
				next_round()
		"over", "won":
			if key.physical_keycode in [KEY_ENTER, KEY_KP_ENTER]:
				new_run()
	get_viewport().set_input_as_handled()


func _on_gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb == null or not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT or _lock > 0.0:
		return
	for b: Dictionary in _buttons:
		if b["enabled"] and (b["rect"] as Rect2).has_point(mb.position):
			b["action"].call()
			return


# ------------------------------------------------------------------ drawing

func _draw_screen() -> void:
	_buttons = []
	var view := _panel.get_viewport_rect().size
	# hero select hides the game behind it entirely (its HUD means nothing before a pick)
	_panel.draw_rect(Rect2(Vector2.ZERO, view), Color(0.02, 0.03, 0.04, 1.0 if Run.phase == "pick" else 0.78))
	match Run.phase:
		"pick":
			_draw_pick(view)
		"shop":
			_draw_shop(view)
		"over", "won":
			_draw_end(view)
	if _lock > 0.0:  # just after a round: dimmed, with a bar filling until clicks count
		var f := 1.0 - _lock / SCREEN_LOCK
		_panel.draw_rect(Rect2(Vector2.ZERO, view), Color(0.02, 0.03, 0.04, 0.45))
		var bar := Rect2(Vector2(view.x / 2.0 - 160.0, view.y / 2.0 - 4.0), Vector2(320, 8))
		_panel.draw_rect(bar.grow(2.0), INK)
		_panel.draw_rect(Rect2(bar.position, Vector2(bar.size.x * f, bar.size.y)), GOLD)
		if _cheer != "":
			_panel.draw_string_outline(ThemeDB.fallback_font, Vector2(0, bar.position.y - 24.0), _cheer, HORIZONTAL_ALIGNMENT_CENTER, view.x, 40, 8, Color(0, 0, 0, 0.8))
			_text(Vector2(0, bar.position.y - 24.0), _cheer, 40, GOLD, view.x, HORIZONTAL_ALIGNMENT_CENTER)


func _text(at: Vector2, s: String, size: int, colour: Color, width := -1.0, align := HORIZONTAL_ALIGNMENT_LEFT) -> void:
	_panel.draw_string(ThemeDB.fallback_font, at, s, align, width, size, colour)


func _centered(y: float, s: String, size: int, colour: Color) -> void:
	_text(Vector2(0, y), s, size, colour, _panel.get_viewport_rect().size.x, HORIZONTAL_ALIGNMENT_CENTER)


func _hovered(r: Rect2) -> bool:
	return r.has_point(_panel.get_local_mouse_position())


## A clickable box: registers the click target and draws the frame.
func _button(r: Rect2, label: String, action: Callable, enabled := true, accent := Color("#546e7a")) -> void:
	_buttons.append({"rect": r, "action": action, "enabled": enabled})
	var hot := enabled and _hovered(r)
	_panel.draw_rect(r, Color("#1c262c") if enabled else Color("#141a1e"))
	_panel.draw_rect(r, accent.lightened(0.3) if hot else (accent if enabled else Color("#2a3338")), false, 3.0 if hot else 2.0)
	if label != "":
		_text(r.position + Vector2(0, r.size.y / 2.0 + 7.0), label, 20, Color.WHITE if enabled else Color(1, 1, 1, 0.35), r.size.x, HORIZONTAL_ALIGNMENT_CENTER)


func _draw_pick(view: Vector2) -> void:
	_tip = {}
	_button(Rect2(Vector2(view.x - 196.0, 20.0), Vector2(176, 44)), "Quit   (Esc)", func() -> void: get_tree().quit(), true, Color("#ef5350"))
	var dy := 15.0  # the whole layout sits a little lower: balanced top and bottom
	var below := 40.0  # room for the best-round callout under the title
	_centered(140 + dy, "CHOOSE YOUR FIGHTER", 40, Color.WHITE)
	var best := Run.load_best()
	_centered(180 + dy, "Endless: win a round to visit the shop — last hits are your gold. Lose one and the run is over.", 16, Color(1, 1, 1, 0.6))
	_draw_best(view, 228.0 + dy, best)
	var w := 300.0
	var gap := 24.0
	var n := Heroes.LIST.size()
	var x0 := (view.x - (n * w + (n - 1) * gap)) / 2.0
	var widest := 0.0  # ability lists: one block width for every card, centred, so they line up across cards
	for hh: Dictionary in Heroes.LIST:
		for slot: String in ["Q", "W", "E", "R"]:
			widest = maxf(widest, ThemeDB.fallback_font.get_string_size(hh["abilities"][slot]["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x)
	var lx := (w - (34.0 + widest)) / 2.0
	for i in n:
		var h: Dictionary = Heroes.LIST[i]
		var r := Rect2(Vector2(x0 + i * (w + gap), 230 + dy + below), Vector2(w, 345))
		_button(r, "", pick.bind(i), true, h["color"].darkened(0.3))
		HeroScript.draw_icon(_panel, h, r.position + Vector2(w / 2.0, 70), 34.0, Vector2.RIGHT)
		_text(r.position + Vector2(0, 150), h["name"], 26, Color.WHITE, w, HORIZONTAL_ALIGNMENT_CENTER)
		var top := Rect2(r.position, Vector2(w, 170))
		if _hovered(top):  # tooltip: the hero's stats (types are found out by playing)
			_tip = {"info": AbilityInfo.hero_base(h), "rect": top}
		var y := 202.0
		for slot: String in ["Q", "W", "E", "R"]:
			var a: Dictionary = h["abilities"][slot]
			_panel.draw_rect(Rect2(r.position + Vector2(lx, y - 16), Vector2(22, 22)), a["color"])
			_text(r.position + Vector2(lx, y), slot, 14, INK, 22, HORIZONTAL_ALIGNMENT_CENTER)
			_text(r.position + Vector2(lx + 34.0, y), a["name"], 15, Color(1, 1, 1, 0.85))
			var row := Rect2(r.position + Vector2(20, y - 22), Vector2(w - 40, 32))
			if _hovered(row):  # tooltip: what the ability does, at level I
				_tip = {"info": AbilityInfo.ability(h, slot, 1, {}), "rect": row}
			y += 38.0
	# under the cards: Training (practice, no run), and the play log switch in dev builds
	var both := PlayLog.available()
	var bw := 360.0
	var row1: Array = []  # first row, for everyone: Continue (a saved run), Training and How to Play (hidden while SHOW_BUTTON is off)
	var saved := Run.load_continue()
	if not saved.is_empty():
		var where := "shop after round %d" % int(saved["round"]) if str(saved.get("phase", "")) == "shop" else "round %d" % int(saved["round"])
		row1.append(["Continue  ·  %s  (%s)" % [where, Heroes.LIST[int(saved["hero"])]["name"]], continue_run, Color("#66bb6a")])
	row1.append(["Training mode", func() -> void: get_parent().start_training(), Color("#80cbc4")])
	if HowToPlayScript.SHOW_BUTTON:
		row1.append(["How to play", open_help, Color("#90a4ae")])
	var widths: Array = row1.map(func(b: Array) -> float: return maxf(bw, ThemeDB.fallback_font.get_string_size(b[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 20).x + 40.0))
	var total := 24.0 * (row1.size() - 1)
	for wd: float in widths:
		total += wd
	var bx := view.x / 2.0 - total / 2.0
	for i in row1.size():
		_button(Rect2(Vector2(bx, 615 + dy + below), Vector2(widths[i], 48)), row1[i][0], row1[i][1], true, row1[i][2])
		bx += float(widths[i]) + 24.0
	# second row: the play log switch (dev / playtest builds: record this run), Run history, Cards (dev)
	var row2: Array = []
	if both:
		var on := PlayLog.is_on()
		row2.append(["Play log: %s" % ("ON — recording" if on else "OFF"), func() -> void: PlayLog.set_enabled(not PlayLog.is_on()),
			Color("#ef5350") if on else Color("#546e7a")])
	if RunHistoryScript.has_runs():
		row2.append(["Run history", open_history, Color("#ffd54f").darkened(0.3)])
	if _dev_tools():
		row2.append(["Watch bots: %s" % ("ON — pick a hero" if watch else "OFF"),
			func() -> void: watch = not watch, Color("#4dd0e1") if watch else Color("#546e7a")])
		row2.append(["Cards", open_cards, Color("#ba68c8")])
	var rx := view.x / 2.0 - (row2.size() * bw + (row2.size() - 1) * 24.0) / 2.0
	for b: Array in row2:
		_button(Rect2(Vector2(rx, 675 + dy + below), Vector2(bw, 48)), b[0], b[1], true, b[2])
		rx += bw + 24.0
	if not _tip.is_empty():
		AbilityInfo.draw(_panel, ThemeDB.fallback_font, _tip["info"], _tip["rect"], view, true)


func _draw_shop(view: Vector2) -> void:
	_tip = {}
	_pick_hover_prev = _pick_hover
	_pick_hover = ""
	_centered(58, "ROUND %d CLEARED" % Run.round_num, 32, Color.WHITE)
	if Run.WIN_GOLD > 0:
		_centered(106, "+%d gold for the win" % Run.WIN_GOLD, 15, GOLD)
	_centered(84, "Spend your gold before round %d. Better upgrades cost more — unspent gold carries over. Red shops too." % (Run.round_num + 1), 14, Color(1, 1, 1, 0.6))
	_draw_gold_line(Vector2(view.x / 2.0, 128))
	var np := Run.picks(Run.upgrades, Run.levels)
	if _pick_hover_prev != "":  # previewing a pick: say what it does to prices
		_text(Vector2(view.x / 2.0 + 150.0, 128), "after this pick: prices +%d%%" % roundi(Run.rise(Run.upgrades) * (np + 1) * 100.0), 13, GOLD)
	elif np > 0:
		_text(Vector2(view.x / 2.0 + 150.0, 128), "prices +%d%% (%d pick%s)" % [roundi(Run.rise(Run.upgrades) * np * 100.0), np, "" if np == 1 else "s"], 13, Color(1, 1, 1, 0.5))

	var card := Vector2(300, 84)
	var gap := 20.0
	var width := 3 * card.x + 2 * gap
	var x0 := (view.x - width) / 2.0 + 60.0
	var label_x := x0 - 150.0
	_draw_hero_row(Vector2(x0, 150), width, label_x)
	_draw_ability_row(Vector2(x0, 222), width, label_x)
	_draw_wave_row(Vector2(x0, 332), width, label_x)

	var y := 422.0
	for tier: String in Upgrades.TIER_ORDER:
		var tc: Color = Upgrades.TIERS[tier]["color"]
		var price: int = Run.inflate(Upgrades.TIERS[tier]["price"], Run.picks(Run.upgrades, Run.levels), Run.rise(Run.upgrades))  # rising prices
		_text(Vector2(label_x, y + 38), tier.to_upper(), 20, tc)
		_text(Vector2(label_x, y + 60), "%d gold" % price, 15, GOLD if Run.gold >= price else Color(1, 1, 1, 0.4))
		var row: Array = _offers.get(tier, [])
		for i in row.size():
			var u: Dictionary = row[i]
			var r := Rect2(Vector2(x0 + i * (card.x + gap), y), card)
			var bought := _bought.has("%s:%d" % [tier, i])
			var can: bool = not bought and Run.gold >= price
			_button(r, "", func() -> void: buy(tier, i), can, tc)
			_panel.draw_rect(Rect2(r.position, Vector2(6, card.y)), tc)  # tier stripe
			var dim := 1.0 if can or bought else 0.45
			_text(r.position + Vector2(20, 27), u["name"], 20, Color(1, 1, 1, dim))
			_card_text(r.position + Vector2(20, 50), u["text"], 15, card.x - 34.0, Color(1, 1, 1, 0.75 * dim))
			var owned := Run.upgrades.count(u["id"])
			if owned > 0 and not bought:
				_text(r.position + Vector2(20, 74), "owned ×%d" % owned, 13, Color(1, 1, 1, 0.45))
			if bought:
				_text(r.position + Vector2(0, 74), "BOUGHT", 16, Color("#81c784"), card.x - 20, HORIZONTAL_ALIGNMENT_RIGHT)
			else:
				_price(r, "%s:%d" % [tier, i], price, Upgrades.TIERS[tier]["price"], can, 74.0, card.x - 20.0, 18)
		if row.is_empty():
			_text(Vector2(x0, y + 56), "Nothing left in this tier.", 16, Color(1, 1, 1, 0.4))
		y += card.y + 10.0

	_draw_build(Vector2(label_x, y + 22), view.x - 2.0 * label_x)
	var by := view.y - 96.0
	_button(Rect2(Vector2(view.x / 2.0 - 150, by), Vector2(300, 56)), "Next round  ▶   (Enter)", next_round, true, Color("#66bb6a"))
	if not _tip.is_empty():
		AbilityInfo.draw(_panel, ThemeDB.fallback_font, _tip["info"], _tip["rect"], view, true)


## A shop price at the bottom right of card `r` (`key` names the pick). When
## another pick is hovered, a small "next N" beside it says what this will cost
## after that pick — plan the budget before prices climb.
func _price(r: Rect2, key: String, now: int, base: int, can: bool, y: float, width: float, size: int) -> void:
	if can and _hovered(r):
		_pick_hover = key
	_text(r.position + Vector2(0, y), "%d" % now, size, GOLD if can else Color("#ef5350"), width, HORIZONTAL_ALIGNMENT_RIGHT)
	if _pick_hover_prev != "" and _pick_hover_prev != key:
		var next := Run.inflate(base, Run.picks(Run.upgrades, Run.levels) + 1, Run.rise(Run.upgrades))
		var pw := ThemeDB.fallback_font.get_string_size("%d" % now, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		_text(r.position + Vector2(0, y - 1.0), "next %d" % next, 12, Color(1, 1, 1, 0.55), width - pw - 8.0, HORIZONTAL_ALIGNMENT_RIGHT)  # beside the price, clear of the text


## Largest font size ≤ `size` at which `s` fits in `width`.
func _fit(s: String, size: int, width: float) -> int:
	while size > 10 and ThemeDB.fallback_font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x > width:
		size -= 1
	return size


## Hero select: your best round, front and centre in gold.
func _draw_best(view: Vector2, y: float, best: int) -> void:
	_centered(y, "BEST RUN  ·  ROUND %d" % best if best > 0 else "NO RECORD YET", 28, GOLD)


## A card's description at `at` (baseline) within `width`: one line, shrunk
## down to 12 px; if it still doesn't fit, two lines split at the word that
## balances them best — the second line kept clear of the price in the
## card's bottom-right corner (PRICE_ROOM).
const PRICE_ROOM := 64.0


func _card_text(at: Vector2, s: String, size: int, width: float, colour: Color) -> void:
	var font := ThemeDB.fallback_font
	var one := _fit(s, size, width)
	if one >= 12 and font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, one).x <= width:
		_text(at, s, one, colour)
		return
	var words := s.split(" ")
	var best := 1
	var best_w := INF
	for i in range(1, words.size()):
		var w := maxf(font.get_string_size(" ".join(words.slice(0, i)), HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x,
			font.get_string_size(" ".join(words.slice(i)), HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + PRICE_ROOM)
		if w < best_w:
			best_w = w
			best = i
	var a := " ".join(words.slice(0, best))
	var b := " ".join(words.slice(best))
	var two := mini(_fit(a, 13, width), _fit(b, 13, width - PRICE_ROOM))
	_text(at + Vector2(0, -6), a, two, colour)
	_text(at + Vector2(0, 10), b, two, colour)


## The four heroes (click to play one next round) and who you'll face.
func _draw_hero_row(at: Vector2, width: float, label_x: float) -> void:
	_text(Vector2(label_x, at.y + 26), "CHAMP", 20, Color.WHITE)
	_text(Vector2(label_x, at.y + 48), "next round", 13, Color(1, 1, 1, 0.45))
	var n := Heroes.LIST.size()
	var chip := Vector2(150, 56)
	for i in n:
		var h: Dictionary = Heroes.LIST[i]
		var r := Rect2(at + Vector2(i * (chip.x + 10.0), 0), chip)
		var current := Run.hero_index == i
		_button(r, "", choose_hero.bind(i), true, Color.WHITE if current else h["color"].darkened(0.45))
		if current:
			_panel.draw_rect(r, Color.WHITE, false, 3.0)
		HeroScript.draw_icon(_panel, h, r.position + Vector2(26, chip.y / 2.0), 14.0, Vector2.RIGHT)
		_text(r.position + Vector2(48, 34), h["name"], 17, Color.WHITE if current else Color(1, 1, 1, 0.6))
	# who the bot plays next round — rolled from the run seed
	var foe: Dictionary = Heroes.LIST[Run.bot_hero_for(Run.round_num + 1)]
	var fx := at.x + n * (chip.x + 10.0) + 14.0
	_text(Vector2(fx, at.y + 12), "NEXT CHALLENGER", 11, Color(1, 1, 1, 0.45))
	HeroScript.draw_icon(_panel, foe, Vector2(fx + 10.0, at.y + 26.0), 10.0, Vector2.LEFT)
	_text(Vector2(fx + 26.0, at.y + 32), foe["name"], 16, Color("#ef9a9a"))
	# red's build — it shopped when you did: levels beside the name, cards below
	var name_w := ThemeDB.fallback_font.get_string_size(foe["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
	var lv: Array = ["Q", "W", "E", "R"].map(func(k: String) -> String: return "%s %s" % [k, Heroes.ROMAN[Run.red_levels[k]]])
	_text(Vector2(fx + 36.0 + name_w, at.y + 31), "  ".join(lv), 11, Color(1, 1, 1, 0.55))
	var names: Array = []
	for id: String in Run.red_upgrades:
		var nm: String = Upgrades.find(id)["name"]
		var cnt := Run.red_upgrades.count(id)
		var label := nm + (" ×%d" % cnt if cnt > 1 else "")
		if not names.has(label):
			names.append(label)
	var build := ", ".join(names) if not names.is_empty() else "no upgrades"
	_text(Vector2(fx, at.y + 50), build, _fit(build, 12, 360.0), Color("#ef9a9a", 0.85))


## WAVE: upgrades for your creeps, rolled with the rest (a card you bought
## stays until it's maxed). Red rolls and buys its own.
func _draw_wave_row(at: Vector2, width: float, label_x: float) -> void:
	_text(Vector2(label_x, at.y + 36), "WAVE", 20, Upgrades.TIERS["wave"]["color"])
	_text(Vector2(label_x, at.y + 56), "your creeps", 13, Color(1, 1, 1, 0.45))
	var cards: Array = _offers.get("wave", [])
	if cards.is_empty():
		_text(Vector2(at.x, at.y + 44), "Nothing left in this tier.", 16, Color(1, 1, 1, 0.4))
		return
	var gap := 12.0
	var n := Upgrades.WAVE_OFFERS
	var size := Vector2((width - gap * (n - 1)) / n, 78)
	for i in cards.size():
		var u: Dictionary = cards[i]
		var r := Rect2(at + Vector2(i * (size.x + gap), 0), size)
		var owned := Run.upgrades.count(u["id"])
		var maxed := owned >= int(u.get("max", 1))
		var price := Run.card_cost(u)
		var can := not maxed and Run.gold >= price
		_button(r, "", func() -> void: buy_wave(u["id"]), can, Upgrades.TIERS["wave"]["color"].darkened(0.3))
		_panel.draw_rect(Rect2(r.position, Vector2(6, size.y)), Upgrades.TIERS["wave"]["color"])
		_text(r.position + Vector2(18, 27), u["name"], _fit(u["name"], 19, size.x - 30.0), Color(1, 1, 1, 1.0 if can or maxed else 0.5))
		_card_text(r.position + Vector2(18, 50), u["text"], 14, size.x - 28.0, Color(1, 1, 1, 0.75 if can or maxed else 0.4))
		var status := ("owned %d / %d" % [owned, int(u["max"])]) if int(u.get("max", 1)) > 1 else ("owned" if owned > 0 else "")
		if status != "":
			_text(r.position + Vector2(20, 70), status, 13, Color(1, 1, 1, 0.5))
		if maxed:
			_text(r.position + Vector2(0, 70), "MAX", 16, Upgrades.TIERS["wave"]["color"], size.x - 16, HORIZONTAL_ALIGNMENT_RIGHT)
		else:
			_price(r, "wave:" + u["id"], price, Upgrades.price(u), can, 70.0, size.x - 16.0, 18)


## Buy a WAVE card (no per-shop limit; `max` caps how many you own).
func buy_wave(id: String) -> bool:
	if not Run.buy(id):
		return false
	PlayLog.event("buy", {"id": id, "tier": "wave", "gold_left": Run.gold})
	return true


## Q / W / E / R: raise that letter one level. The card shows what it does for
## the hero you've picked; the level stays with the letter if you switch.
func _draw_ability_row(at: Vector2, width: float, label_x: float) -> void:
	_text(Vector2(label_x, at.y + 44), "ABILITIES", 20, Upgrades.LEVEL_COLOR)
	_text(Vector2(label_x, at.y + 66), "by letter", 13, Color(1, 1, 1, 0.45))
	var h: Dictionary = Heroes.LIST[Run.hero_index]
	var gap := 12.0
	var size := Vector2((width - 3.0 * gap) / 4.0, 100)
	var slots := ["Q", "W", "E", "R"]
	for i in slots.size():
		var slot: String = slots[i]
		var lvl: int = Run.levels[slot]
		var r := Rect2(at + Vector2(i * (size.x + gap), 0), size)
		var a: Dictionary = h["abilities"][slot]
		if _hovered(r):  # tooltip: the ability now, with your upgrades (drawn last, on top)
			_tip = {"info": AbilityInfo.ability(h, slot, lvl, Upgrades.stacked(Run.upgrades)), "rect": r}
		var maxed := lvl >= Heroes.MAX_LEVEL
		var price := 0 if maxed else Run.level_cost(slot, lvl + 1)
		var can := not maxed and Run.gold >= price
		_button(r, "", buy_level.bind(slot), can, Upgrades.LEVEL_COLOR.darkened(0.35))
		_panel.draw_rect(Rect2(r.position + Vector2(10, 10), Vector2(22, 22)), a["color"])
		_text(r.position + Vector2(10, 26), slot, 14, INK, 22, HORIZONTAL_ALIGNMENT_CENTER)
		var title := "%s  %s" % [a["name"], Heroes.ROMAN[lvl]] if maxed else "%s  %s → %s" % [a["name"], Heroes.ROMAN[lvl], Heroes.ROMAN[lvl + 1]]
		_text(r.position + Vector2(40, 27), title, _fit(title, 17, size.x - 50.0), Color.WHITE if can or maxed else Color(1, 1, 1, 0.5))
		if maxed:
			_text(r.position + Vector2(0, 88), "MAX", 16, Upgrades.LEVEL_COLOR, size.x - 14, HORIZONTAL_ALIGNMENT_RIGHT)
			continue
		var lines: Array = Heroes.level_changes(h, slot, lvl + 1)
		for j in mini(lines.size(), 3):  # up to three changes per level
			var w := size.x - ((140.0 if _pick_hover_prev != "" else 70.0) if j == 2 else 20.0)  # the third line stops short of the price (and its "next")
			_text(r.position + Vector2(12, 49 + j * 16), lines[j], _fit(lines[j], 13, w), Color(1, 1, 1, 0.75 if can else 0.4))
		_price(r, "level:" + slot, price, Upgrades.level_price(slot, lvl + 1), can, 90.0, size.x - 14.0, 17)


func _draw_end(view: Vector2) -> void:
	var won := Run.phase == "won"
	_centered(250, "RUN COMPLETE" if won else "RUN OVER", 64, Color("#ffd54f") if won else Color("#ff5252"))
	var best := Run.load_best()
	var line := "All rounds cleared." if won else "Reached round %d." % Run.round_num + ("   New best!" if Run.round_num >= best and Run.round_num > 0 else "   Best: round %d" % best)
	_centered(300, line, 22, Color(1, 1, 1, 0.8))
	var who: String = Heroes.LIST[Run.hero_index]["name"]
	_centered(334, ("Champion: %s" % who) if won else ("Your brawler %s fell in round %d." % [who, Run.round_num]), 18, Color(1, 1, 1, 0.6))
	_draw_gold_line(Vector2(view.x / 2.0, 390))
	_draw_build(Vector2(view.x / 2.0 - 450, 450), 900.0)
	_button(Rect2(Vector2(view.x / 2.0 - 320, view.y - 200), Vector2(300, 64)), "New run   (Enter)", new_run, true, Color("#66bb6a"))
	_button(Rect2(Vector2(view.x / 2.0 + 20, view.y - 200), Vector2(300, 64)), "Quit   (Esc)", func() -> void: get_tree().quit(), true, Color("#ef5350"))
	if RunHistoryScript.has_runs():
		_button(Rect2(Vector2(view.x / 2.0 - 150, view.y - 120), Vector2(300, 48)), "Run history", open_history, true, Color("#ffd54f").darkened(0.3))


func _draw_gold_line(centre: Vector2) -> void:
	var s := "%d gold" % Run.gold
	var w := ThemeDB.fallback_font.get_string_size(s, HORIZONTAL_ALIGNMENT_LEFT, -1, 30).x
	var coin := centre + Vector2(-w / 2.0 - 22.0, -10.0)
	_panel.draw_circle(coin, 13.0, GOLD)
	_panel.draw_arc(coin, 13.0, 0.0, TAU, 20, Color(0.45, 0.3, 0.0), 3.0)
	_text(Vector2(centre.x - w / 2.0, centre.y), s, 30, GOLD)


## "Your build": every upgrade owned, stacks counted, coloured by tier.
func _draw_build(at: Vector2, width: float) -> void:
	_text(at, "YOUR BUILD", 14, Color(1, 1, 1, 0.5))
	var levelled: Array = ["Q", "W", "E", "R"].filter(func(k: String) -> bool: return Run.levels[k] > 1)
	if Run.upgrades.is_empty() and levelled.is_empty():
		_text(at + Vector2(0, 28), "nothing yet", 16, Color(1, 1, 1, 0.35))
		return
	var x := 0.0
	var y := 28.0
	var h: Dictionary = Heroes.LIST[Run.hero_index]
	for k: String in levelled:  # ability levels first (they follow the letter, so show the current hero's names)
		var label := "%s  %s %s" % [k, h["abilities"][k]["name"], Heroes.ROMAN[Run.levels[k]]]
		var lw := ThemeDB.fallback_font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 20.0
		if x + lw > width:
			x = 0.0
			y += 32.0
		var lr := Rect2(at + Vector2(x, y - 18), Vector2(lw, 26))
		_panel.draw_rect(lr, Color(Upgrades.LEVEL_COLOR, 0.18))
		_panel.draw_rect(lr, Upgrades.LEVEL_COLOR, false, 1.5)
		_text(lr.position + Vector2(10, 19), label, 16, Color.WHITE)
		x += lw + 8.0
	var seen: Array = []
	for id: String in Run.upgrades:
		if seen.has(id):
			continue
		seen.append(id)
		var u := Upgrades.find(id)
		var n := Run.upgrades.count(id)
		var label: String = u["name"] + (" ×%d" % n if n > 1 else "")
		var w := ThemeDB.fallback_font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 20.0
		if x + w > width:
			x = 0.0
			y += 32.0
		var r := Rect2(at + Vector2(x, y - 18), Vector2(w, 26))
		_panel.draw_rect(r, Color(Upgrades.TIERS[u["tier"]]["color"], 0.22))
		_panel.draw_rect(r, Upgrades.TIERS[u["tier"]]["color"], false, 1.5)
		_text(r.position + Vector2(10, 19), label, 16, Color.WHITE)
		x += w + 8.0
