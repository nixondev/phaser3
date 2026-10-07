extends CanvasLayer
## Cards: every shop card, and plain-text requests for new ones or changes
## (dev builds run from the project only — requests live in
## cards/requests.json, card_requests.gd). Add card / Edit write a request;
## the `/cards` command builds them. Each row shows its status:
##   live        in the game
##   requested   a new card waiting to be built
##   changed     a live card with an edit waiting to be applied
##   needs info  the builder's question is under it — Edit to answer
##   off         switched off (On / Off button): never offered, nothing deleted —
##               saved in scripts/card_switches.gd, which ships with the game
## Opened from hero select; Esc or Close shuts it.

const Upgrades := preload("res://scripts/upgrades.gd")
const CardRequests := preload("res://scripts/card_requests.gd")
const CardSwitches := preload("res://scripts/card_switches.gd")
const SWITCHES_PATH := "res://scripts/card_switches.gd"

const INK := Color(0.06, 0.08, 0.1)
const BG := Color(0.02, 0.03, 0.04, 1.0)
const ROW := Color("#1c262c")
const STATUS := {
	"live": Color("#81c784"), "requested": Color("#ffd54f"), "changed": Color("#ffb74d"),
	"needs_info": Color("#ef5350"), "removed": Color(1, 1, 1, 0.4), "rejected": Color(1, 1, 1, 0.4),
	"off": Color(1, 1, 1, 0.35),
}
const TIER_CHOICES := ["(builder picks)", "common", "rare", "epic", "wave"]

var _list: VBoxContainer
var _form: PanelContainer
var _form_title: Label
var _f_request: TextEdit
var _f_name: LineEdit
var _f_tier: OptionButton
var _f_price: LineEdit
var _f_note: Label
var _editing := {}  # the request being written (new or existing)


func _ready() -> void:
	layer = 27
	process_mode = Node.PROCESS_MODE_ALWAYS
	var bg := ColorRect.new()
	bg.color = BG
	bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	bg.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(bg)
	var root := VBoxContainer.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.offset_left = 60
	root.offset_right = -60
	root.offset_top = 30
	root.offset_bottom = -30
	root.add_theme_constant_override("separation", 14)
	add_child(root)
	# header: title, what this is, Add / Close
	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 16)
	root.add_child(head)
	var title := _label("CARDS", 34)
	head.add_child(title)
	var hint := _label("Add a card or edit one in plain words — run /cards in Claude Code to build them.", 15, Color(1, 1, 1, 0.55))
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	head.add_child(hint)
	head.add_child(_button("+  Add card", func() -> void: _open_form(CardRequests.new_request("add", "")), Color("#66bb6a")))
	head.add_child(_button("Close  (Esc)", queue_free, Color("#ef5350")))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	root.add_child(scroll)
	_list = VBoxContainer.new()
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 6)
	scroll.add_child(_list)
	_build_form()
	_refresh()


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key and key.pressed and not key.echo and key.physical_keycode == KEY_ESCAPE:
		if _form.visible:
			_form.visible = false
		else:
			queue_free()
		get_viewport().set_input_as_handled()


# ------------------------------------------------------------------ the list

func _refresh() -> void:
	for c in _list.get_children():
		c.queue_free()
	var all := CardRequests.load_all()
	# new cards waiting (and ones with a question) first
	var waiting := all.filter(func(r: Dictionary) -> bool:
		return r.get("kind", "") == "add" and CardRequests.OPEN.has(r.get("status", "")))
	if not waiting.is_empty():
		_list.add_child(_section("NEW CARD REQUESTS", Color("#ffd54f")))
		for r: Dictionary in waiting:
			_list.add_child(_request_row(r))
	for tier: String in ["common", "rare", "epic", "wave"]:
		_list.add_child(_section(tier.to_upper(), Upgrades.TIERS[tier]["color"]))
		for u: Dictionary in Upgrades.LIST:
			if u["tier"] == tier:
				_list.add_child(_card_row(u, CardRequests.open_edit_for(u["id"], all)))
	var done := all.filter(func(r: Dictionary) -> bool: return not CardRequests.OPEN.has(r.get("status", "")))
	if not done.is_empty():
		_list.add_child(_section("HANDLED REQUESTS", Color(1, 1, 1, 0.5)))
		for i in range(done.size() - 1, -1, -1):  # newest first
			_list.add_child(_history_row(done[i]))


func _card_row(u: Dictionary, edit: Dictionary) -> Control:
	var on := CardSwitches.is_on(u["id"])
	var status := "live" if on else "off"
	if not edit.is_empty():
		status = "needs_info" if edit["status"] == "needs_info" else "changed"
	var row := _row()
	if not on:
		row.modulate = Color(1, 1, 1, 0.5)  # switched off: dimmed
	var box := _line(row)
	box.add_child(_chip(Upgrades.TIERS[u["tier"]]["color"]))
	box.add_child(_fixed(_label(u["name"], 18), 210))
	box.add_child(_fixed(_label("%d" % Upgrades.price(u) + ("  · max %d" % u["max"] if u.has("max") else ""), 15, Color("#ffd54f")), 110))
	var text := _label(u["text"], 16, Color(1, 1, 1, 0.85))
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	box.add_child(text)
	box.add_child(_status_label(status))
	box.add_child(_button("On " if on else "Off", func() -> void: _toggle(u["id"]), Color("#81c784") if on else Color("#546e7a")))
	box.add_child(_button("Edit", func() -> void: _open_edit(u, edit), Color("#546e7a")))
	if not edit.is_empty():  # the waiting change (and any question) under the card
		_lines(row).add_child(_sub("→ " + _summary(edit), Color("#ffb74d")))
		if edit.get("note", "") != "":
			_lines(row).add_child(_sub("? " + edit["note"], STATUS["needs_info"]))
	return row


func _request_row(r: Dictionary) -> Control:
	var row := _row()
	var box := _line(row)
	box.add_child(_chip(Upgrades.TIERS[r["tier"]]["color"] if Upgrades.TIERS.has(r.get("tier", "")) else Color(1, 1, 1, 0.3)))
	box.add_child(_fixed(_label(r["name"] if r.get("name", "") != "" else "(unnamed)", 18), 210))
	box.add_child(_fixed(_label("%d" % int(r["price"]) if int(r.get("price", 0)) > 0 else "—", 15, Color("#ffd54f")), 110))
	var text := _label(r.get("request", ""), 16, Color(1, 1, 1, 0.85))
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	box.add_child(_status_label(r["status"]))
	box.add_child(_button("Edit", func() -> void: _open_form(r.duplicate()), Color("#546e7a")))
	box.add_child(_button("Delete", func() -> void:
		CardRequests.remove(r["id"])
		_refresh(), Color("#ef5350")))
	if r.get("note", "") != "":
		_lines(row).add_child(_sub("? " + r["note"], STATUS["needs_info"]))
	return row


func _history_row(r: Dictionary) -> Control:
	var row := _row()
	var box := _line(row)
	box.add_child(_fixed(_label(r.get("created", ""), 13, Color(1, 1, 1, 0.45)), 140))
	var what: String = ("new: " if r.get("kind", "") == "add" else "edit %s: " % r.get("card", "")) + r.get("request", "")
	var text := _label(what, 14, Color(1, 1, 1, 0.6))
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(text)
	box.add_child(_status_label(r.get("status", "")))
	if r.get("note", "") != "":
		_lines(row).add_child(_sub(r["note"], Color(1, 1, 1, 0.5)))
	return row


## Switch card `id` on / off: takes effect at once, and is saved into
## card_switches.gd (shipped) so it holds in every build.
func _toggle(id: String) -> void:
	if CardSwitches.off.has(id):
		CardSwitches.off.erase(id)
	else:
		CardSwitches.off.append(id)
	var src := FileAccess.get_file_as_string(SWITCHES_PATH)
	var start := src.find("const OFF := [")
	var end := src.find("]", start)
	if start < 0 or end < 0:
		push_warning("card switches: can't find OFF in %s" % SWITCHES_PATH)
	else:
		var ids := ", ".join(PackedStringArray(CardSwitches.off.map(func(x: String) -> String: return "\"%s\"" % x)))
		var f := FileAccess.open(SWITCHES_PATH, FileAccess.WRITE)
		if f:
			f.store_string(src.substr(0, start) + "const OFF := [" + ids + src.substr(end))
	_refresh()


## What an edit request asks for, in one line.
func _summary(r: Dictionary) -> String:
	var bits: Array = []
	if r.get("name", "") != "":
		bits.append("name " + r["name"])
	if r.get("tier", "") != "":
		bits.append("tier " + r["tier"])
	if int(r.get("price", 0)) > 0:
		bits.append("price %d" % int(r["price"]))
	if r.get("request", "") != "":
		bits.append("\"%s\"" % r["request"])
	return "  ·  ".join(bits)


# ------------------------------------------------------------------ the form

func _build_form() -> void:
	_form = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color("#141c21")
	sb.border_color = Color("#66bb6a")
	sb.set_border_width_all(2)
	sb.set_content_margin_all(22)
	_form.add_theme_stylebox_override("panel", sb)
	_form.set_anchors_preset(Control.PRESET_CENTER)
	_form.custom_minimum_size = Vector2(760, 0)
	_form.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_form.grow_vertical = Control.GROW_DIRECTION_BOTH
	_form.visible = false
	add_child(_form)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 10)
	_form.add_child(v)
	_form_title = _label("", 24)
	v.add_child(_form_title)
	v.add_child(_label("In plain words — what it should do (or what to change):", 14, Color(1, 1, 1, 0.6)))
	_f_request = TextEdit.new()
	_f_request.custom_minimum_size = Vector2(0, 110)
	_f_request.wrap_mode = TextEdit.LINE_WRAPPING_BOUNDARY
	_f_request.add_theme_font_size_override("font_size", 17)
	_f_request.placeholder_text = "e.g. slow the attack speed of enemies near you"
	v.add_child(_f_request)
	var g := GridContainer.new()
	g.columns = 2
	g.add_theme_constant_override("h_separation", 14)
	g.add_theme_constant_override("v_separation", 8)
	v.add_child(g)
	g.add_child(_label("Name", 15, Color(1, 1, 1, 0.6)))
	_f_name = LineEdit.new()
	_f_name.placeholder_text = "(builder picks)"
	_f_name.custom_minimum_size = Vector2(360, 0)
	g.add_child(_f_name)
	g.add_child(_label("Tier", 15, Color(1, 1, 1, 0.6)))
	_f_tier = OptionButton.new()
	for t: String in TIER_CHOICES:
		_f_tier.add_item(t)
	g.add_child(_f_tier)
	g.add_child(_label("Price", 15, Color(1, 1, 1, 0.6)))
	_f_price = LineEdit.new()
	_f_price.placeholder_text = "(builder picks)"
	g.add_child(_f_price)
	_f_note = _label("", 14, STATUS["needs_info"])
	_f_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(_f_note)
	var buttons := HBoxContainer.new()
	buttons.alignment = BoxContainer.ALIGNMENT_END
	buttons.add_theme_constant_override("separation", 12)
	v.add_child(buttons)
	buttons.add_child(_button("Cancel", func() -> void: _form.visible = false, Color("#546e7a")))
	buttons.add_child(_button("Save request", _save_form, Color("#66bb6a")))


## Edit a live card: re-open its waiting edit, or start one from its current values.
func _open_edit(u: Dictionary, edit: Dictionary) -> void:
	if not edit.is_empty():
		_open_form(edit.duplicate(), u)
		return
	_open_form(CardRequests.new_request("edit", u["id"]), u)


func _open_form(r: Dictionary, card := {}) -> void:
	_editing = r
	_editing["_card"] = card  # the live card being edited (not saved)
	if r["kind"] == "edit":
		_form_title.text = "Edit  %s  —  now: %s" % [card.get("name", r["card"]), card.get("text", "")]
	else:
		_form_title.text = "New card" if r.get("request", "") == "" else "Edit request"
	_f_request.text = r.get("request", "")
	# edits show the live card's values; only what you change is sent
	_f_name.text = r["name"] if r.get("name", "") != "" else card.get("name", "")
	var tier: String = r["tier"] if r.get("tier", "") != "" else card.get("tier", "")
	_f_tier.select(maxi(0, TIER_CHOICES.find(tier)))
	var price := int(r.get("price", 0))
	_f_price.text = str(price) if price > 0 else (str(Upgrades.price(card)) if not card.is_empty() else "")
	_f_note.text = ("Question: " + r["note"] + "  (answer by changing the request)") if r.get("status", "") == "needs_info" and r.get("note", "") != "" else ""
	_form.visible = true
	_f_request.grab_focus()


func _save_form() -> void:
	var r := _editing
	var card: Dictionary = r.get("_card", {})
	r.erase("_card")
	r["request"] = _f_request.text.strip_edges()
	var card_name := _f_name.text.strip_edges()
	var tier: String = TIER_CHOICES[_f_tier.selected] if _f_tier.selected > 0 else ""
	var price := int(_f_price.text) if _f_price.text.strip_edges().is_valid_int() else 0
	if card.is_empty():  # a new card: everything as typed
		r["name"] = card_name
		r["tier"] = tier
		r["price"] = price
	else:  # an edit: only what differs from the live card
		r["name"] = card_name if card_name != card["name"] else ""
		r["tier"] = tier if tier != card["tier"] else ""
		r["price"] = price if price != Upgrades.price(card) else 0
	var empty: bool = r["request"] == "" and r["name"] == "" and r["tier"] == "" and int(r["price"]) == 0
	if empty:
		if r["kind"] == "edit":  # nothing left to change: drop the edit
			CardRequests.remove(r["id"])
		_form.visible = false
		_refresh()
		return
	CardRequests.put(r)
	_form.visible = false
	_refresh()


# ------------------------------------------------------------------ widgets

func _label(text: String, size: int, colour := Color.WHITE) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	return l


func _fixed(c: Control, width: float) -> Control:
	c.custom_minimum_size.x = width
	return c


func _button(text: String, action: Callable, accent: Color) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", 16)
	var sb := StyleBoxFlat.new()
	sb.bg_color = ROW
	sb.border_color = accent
	sb.set_border_width_all(2)
	sb.set_content_margin_all(8)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	b.add_theme_stylebox_override("normal", sb)
	var hover := sb.duplicate() as StyleBoxFlat
	hover.border_color = accent.lightened(0.3)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", hover)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.pressed.connect(action)
	return b


func _section(text: String, colour: Color) -> Control:
	var l := _label(text, 15, colour)
	l.custom_minimum_size.y = 34
	l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	return l


## A card row: a dark box holding one line (_line) and optional lines under it (_lines).
func _row() -> PanelContainer:
	var p := PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = ROW
	sb.set_content_margin_all(8)
	sb.content_margin_left = 12
	p.add_theme_stylebox_override("panel", sb)
	var v := VBoxContainer.new()
	p.add_child(v)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 14)
	v.add_child(h)
	return p


func _lines(row: PanelContainer) -> VBoxContainer:
	return row.get_child(0) as VBoxContainer


func _line(row: PanelContainer) -> HBoxContainer:
	return _lines(row).get_child(0) as HBoxContainer


func _sub(text: String, colour: Color) -> Label:
	var l := _label(text, 14, colour)
	l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return l


func _chip(colour: Color) -> Control:
	var c := ColorRect.new()
	c.color = colour
	c.custom_minimum_size = Vector2(6, 26)
	return c


func _status_label(status: String) -> Label:
	var l := _label(status.replace("_", " "), 14, STATUS.get(status, Color.WHITE))
	l.custom_minimum_size.x = 96
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	return l
