extends CanvasLayer
## Training's shop: a free build editor for trying cards against the dummies.
## Every card is listed (no random offers, no gold): left-click adds a copy,
## right-click removes one (capped cards stop at their max). Each ability
## letter's level can be set I–III. The build lives in Main.training_upgrades
## / training_levels, so it survives hero switches and restarts while the game
## is open. B or the HUD's Shop button opens it; B / Esc / Close shuts it.
## Wave cards are left out: Training has no lane.

const Upgrades := preload("res://scripts/upgrades.gd")
const Heroes := preload("res://scripts/heroes.gd")

signal changed   # main re-applies the build to the hero

var main: Node   # main.gd: owns training_upgrades / training_levels
var hero: Node2D

var _panel: Control
var _buttons: Array = []   # this frame's click targets: {rect, left, right}

const INK := Color("#10151a")
const CARD := Vector2(300, 46)


func _ready() -> void:
	layer = 25
	process_mode = Node.PROCESS_MODE_ALWAYS
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.draw.connect(_draw_shop)
	_panel.gui_input.connect(_on_gui_input)
	add_child(_panel)
	_set_open(false)


func toggle() -> void:
	_set_open(not visible)


func _set_open(open: bool) -> void:
	visible = open
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP if open else Control.MOUSE_FILTER_IGNORE
	get_tree().paused = open
	_panel.queue_redraw()


func _process(_delta: float) -> void:
	if visible:
		_panel.queue_redraw()  # hover highlights


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	if key.physical_keycode == KEY_B or (visible and key.physical_keycode == KEY_ESCAPE):
		toggle()
		get_viewport().set_input_as_handled()


func _on_gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb == null or not mb.pressed or mb.button_index not in [MOUSE_BUTTON_LEFT, MOUSE_BUTTON_RIGHT]:
		return
	for b: Dictionary in _buttons:
		if (b["rect"] as Rect2).has_point(mb.position):
			var fn: Variant = b["left"] if mb.button_index == MOUSE_BUTTON_LEFT else b.get("right")
			if fn != null:
				(fn as Callable).call()
			return


# ------------------------------------------------------------------ build edits

func _add(u: Dictionary) -> void:
	var ups: Array = main.training_upgrades
	if u.has("max") and ups.count(u["id"]) >= int(u["max"]):
		return
	ups.append(u["id"])
	changed.emit()


func _remove(u: Dictionary) -> void:
	var ups: Array = main.training_upgrades
	var i := ups.rfind(u["id"])
	if i >= 0:
		ups.remove_at(i)
		changed.emit()


func _level(slot: String, step: int) -> void:
	var lv: Dictionary = main.training_levels
	lv[slot] = clampi(int(lv[slot]) + step, 1, Heroes.MAX_LEVEL)
	changed.emit()


func _clear() -> void:
	main.training_upgrades.clear()
	for slot: String in main.training_levels:
		main.training_levels[slot] = 1
	changed.emit()


# ------------------------------------------------------------------ drawing

func _text(at: Vector2, s: String, size: int, colour: Color, width := -1.0, align := HORIZONTAL_ALIGNMENT_LEFT) -> void:
	_panel.draw_string(ThemeDB.fallback_font, at, s, align, width, size, colour)


func _hot(r: Rect2) -> bool:
	return r.has_point(_panel.get_local_mouse_position())


func _draw_shop() -> void:
	_buttons = []
	var view := _panel.get_viewport_rect().size
	_panel.draw_rect(Rect2(Vector2.ZERO, view), Color(0.02, 0.03, 0.04, 0.85))
	_text(Vector2(0, 52), "TRAINING SHOP", 30, Color.WHITE, view.x, HORIZONTAL_ALIGNMENT_CENTER)
	_text(Vector2(0, 76), "Free: try any build on the dummies.  Left-click adds a card, right-click removes one.  B / Esc closes.",
		14, Color(1, 1, 1, 0.6), view.x, HORIZONTAL_ALIGNMENT_CENTER)

	var gap := 20.0
	var x0 := (view.x - 3.0 * CARD.x - 2.0 * gap) / 2.0
	# ability levels, by letter (they carry across heroes, like in a run)
	var y := 100.0
	var lv: Dictionary = main.training_levels
	var slot_w := (3.0 * CARD.x + 2.0 * gap - 3.0 * 12.0) / 4.0
	for i in 4:
		var slot: String = ["Q", "W", "E", "R"][i]
		var r := Rect2(Vector2(x0 + i * (slot_w + 12.0), y), Vector2(slot_w, 44))
		var a: Dictionary = hero.def["abilities"][slot]
		_panel.draw_rect(r, Color("#1c262c"))
		_panel.draw_rect(Rect2(r.position, Vector2(6, r.size.y)), a["color"])
		_text(r.position + Vector2(16, 28), "%s  %s  %s" % [slot, a["name"], Heroes.ROMAN[int(lv[slot])]], 17, Color.WHITE)
		var minus := Rect2(r.end - Vector2(72, 38), Vector2(30, 32))
		var plus := Rect2(r.end - Vector2(36, 38), Vector2(30, 32))
		for b: Array in [[minus, "−", -1], [plus, "+", 1]]:
			var br: Rect2 = b[0]
			var ok: bool = (b[2] < 0 and int(lv[slot]) > 1) or (b[2] > 0 and int(lv[slot]) < Heroes.MAX_LEVEL)
			_panel.draw_rect(br, Color("#2a363d") if ok and _hot(br) else INK)
			_text(br.position + Vector2(0, 23), b[1], 20, Color.WHITE if ok else Color(1, 1, 1, 0.25), br.size.x, HORIZONTAL_ALIGNMENT_CENTER)
			_buttons.append({"rect": br, "left": _level.bind(slot, int(b[2]))})

	# the cards, one column per tier — rows squeeze to fit the tallest column
	# (above the buttons); squeezed rows show the name, the text on hover
	y = 168.0
	var ups: Array = main.training_upgrades
	var rows := 1
	for tier: String in Upgrades.TIER_ORDER:
		rows = maxi(rows, Upgrades.LIST.filter(func(u: Dictionary) -> bool:
			return u["tier"] == tier and Upgrades.CardSwitches.is_on(u["id"]) and not u.has("on_buy")).size())
	var step := minf(CARD.y + 6.0, (view.y - 92.0 - (y + 10.0)) / rows)
	var card := Vector2(CARD.x, step - 4.0)
	var compact := card.y < CARD.y
	var tip := {}
	for c in Upgrades.TIER_ORDER.size():
		var tier: String = Upgrades.TIER_ORDER[c]
		var tc: Color = Upgrades.TIERS[tier]["color"]
		var x := x0 + c * (CARD.x + gap)
		_text(Vector2(x, y), tier.to_upper(), 18, tc)
		var cy := y + 10.0
		for u: Dictionary in Upgrades.LIST:
			if u["tier"] != tier or not Upgrades.CardSwitches.is_on(u["id"]) or u.has("on_buy"):
				continue  # (switched-off and one-time shop cards aren't offered here)
			var r := Rect2(Vector2(x, cy), card)
			var n := ups.count(u["id"])
			var hot := _hot(r)
			if hot and compact:
				tip = {"rect": r, "name": u["name"], "text": u["text"]}
			_panel.draw_rect(r, Color("#22303a") if hot else Color("#1c262c"))
			_panel.draw_rect(Rect2(r.position, Vector2(5, r.size.y)), tc)
			if n > 0:
				_panel.draw_rect(r, tc, false, 2.0)
			if compact:
				var mid := card.y / 2.0 + 5.0
				_text(r.position + Vector2(14, mid), u["name"], 14, Color.WHITE)
				var nw := ThemeDB.fallback_font.get_string_size(u["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
				_text(r.position + Vector2(24.0 + nw, mid), u["text"], 11, Color(1, 1, 1, 0.5), CARD.x - nw - 70.0)
				if n > 0:
					_text(r.position + Vector2(0, mid), "×%d" % n, 16, tc.lightened(0.3), CARD.x - 10.0, HORIZONTAL_ALIGNMENT_RIGHT)
			else:
				_text(r.position + Vector2(14, 19), u["name"], 15, Color.WHITE)
				_text(r.position + Vector2(14, 37), u["text"], 12, Color(1, 1, 1, 0.6), CARD.x - 70.0)
				if n > 0:
					_text(r.position + Vector2(0, 30), "×%d" % n, 20, tc.lightened(0.3), CARD.x - 12.0, HORIZONTAL_ALIGNMENT_RIGHT)
			_buttons.append({"rect": r, "left": _add.bind(u), "right": _remove.bind(u)})
			cy += step

	var by := view.y - 80.0
	for b: Array in [[Rect2(Vector2(view.x / 2.0 - 320, by), Vector2(300, 52)), "Clear build", _clear, Color("#ef5350")],
			[Rect2(Vector2(view.x / 2.0 + 20, by), Vector2(300, 52)), "Close   (B / Esc)", toggle, Color("#66bb6a")]]:
		var r: Rect2 = b[0]
		_panel.draw_rect(r, Color("#1c262c"))
		_panel.draw_rect(r, (b[3] as Color).lightened(0.3) if _hot(r) else b[3], false, 2.0)
		_text(r.position + Vector2(0, 33), b[1], 19, Color.WHITE, r.size.x, HORIZONTAL_ALIGNMENT_CENTER)
		_buttons.append({"rect": r, "left": b[2]})
	if not tip.is_empty():  # a squeezed card's full text, beside it
		var font := ThemeDB.fallback_font
		var w := maxf(font.get_string_size(tip["text"], HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x, font.get_string_size(tip["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x) + 24.0
		var tr: Rect2 = tip["rect"]
		var at := Vector2(tr.end.x + 8.0, tr.position.y)
		if at.x + w > view.x - 8.0:
			at.x = tr.position.x - w - 8.0
		var box := Rect2(at, Vector2(w, 52))
		_panel.draw_rect(box, Color("#10151a"))
		_panel.draw_rect(box, Color(1, 1, 1, 0.3), false, 1.5)
		_text(box.position + Vector2(12, 21), tip["name"], 16, Color.WHITE)
		_text(box.position + Vector2(12, 41), tip["text"], 14, Color(1, 1, 1, 0.75))
