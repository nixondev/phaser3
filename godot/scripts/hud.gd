extends CanvasLayer
## Port of src/scenes/UIScene.ts — same layout on the 1280×960 canvas:
##   room name        fades in at the top on entry (2 s, then 0.5 s fade)
##   unlock line      "#ffdd88" feedback under it (door-unlocked)
##   E prompt         pulsing, bottom centre, when something is in reach
##   dialog box       bottom; five text styles (TEXT_STYLES); pages split on
##                    "---" lines and every 10 lines; E dismisses / advances
##   PWR bar          top left, while a flashlight is carried
##   inventory grid   2×6, top right; cursor + item name + key hints
##   avatar bar       bottom left: a portrait per roster member, the active
##                    one highlighted; click to switch (avatar_clicked)
## Not ported: mobile buttons.

signal avatar_clicked(index: int)

const W := 1280.0
const H := 960.0
const COLS := 6
const ROWS := 2
const SS := 56  # INVENTORY_CONFIG.SLOT_SIZE
const GRID := Vector2(W - COLS * SS - 16, 16)

const SPEECH := preload("res://fonts/bitcountink/BitcountInk-Variable.ttf")
const TYPE := preload("res://fonts/workbench/Workbench-Variable.ttf")
const UI := preload("res://fonts/silkscreen/Silkscreen-Regular.ttf")

## Constants.ts TEXT_STYLES.
const STYLES := {
	"narrative": {"font": "speech", "size": 35, "color": Color("#ffffff"), "italic": false, "box": Color(0, 0, 0, 0.75)},
	"thought": {"font": "speech", "size": 35, "color": Color("#b8c4e8"), "italic": true, "box": Color(Color("#0c1424"), 0.78)},
	"lore": {"font": "type", "size": 40, "color": Color("#d8d4c0"), "italic": false, "box": Color(Color("#0a0a06"), 0.80)},
	"system": {"font": "ui", "size": 28, "color": Color("#c9c9c9"), "italic": false, "box": Color(Color("#141414"), 0.85)},
	"document": {"font": "type", "size": 34, "color": Color("#ccccbb"), "italic": false, "box": Color(Color("#0a0a0a"), 0.95)},
}

var _mono: SystemFont
var _italic: FontVariation
var _room_name: Label
var _unlock: Label
var _prompt: Label
var _dialog_bg: ColorRect
var _dialog_text: Label
var _dismiss: Label
var _pages: Array = []  # queued [text, type]
var _battery: Control
var _battery_label: Label
var _battery_pct := 100.0
var _slots: Array[Panel] = []
var _icons: Array[TextureRect] = []
var _cursor: Panel
var _item_name: Label
var _hint: Label
var _tweens := {}
var _avatars: Array[TextureRect] = []
var _avatar_highlight: Panel


func _ready() -> void:
	layer = 10  # above screen effects (StylePost 5, weather 2–4)
	_mono = SystemFont.new()
	_mono.font_names = PackedStringArray(["Consolas", "Courier New", "monospace"])
	_italic = FontVariation.new()
	_italic.base_font = SPEECH
	_italic.variation_transform = Transform2D(Vector2(1, 0), Vector2(0.2, 1), Vector2.ZERO)  # slant

	_room_name = _label("", _mono, 40, Color.WHITE)
	_center(_room_name, 80)
	_room_name.modulate.a = 0.0
	_unlock = _label("", _mono, 36, Color("#ffdd88"))
	_center(_unlock, 136)
	_unlock.modulate.a = 0.0

	_prompt = _key_badge()
	_prompt.position = Vector2(W / 2.0, H - 160) - _prompt.size / 2.0
	_prompt.visible = false

	_dialog_bg = ColorRect.new()
	_dialog_bg.visible = false
	add_child(_dialog_bg)
	_dialog_text = _label("", SPEECH, 36, Color.WHITE)
	_dialog_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_dialog_text.size.x = W - 160
	_dialog_text.add_theme_constant_override("line_spacing", 16)
	_dialog_text.visible = false
	_dismiss = _key_badge()
	_dismiss.visible = false

	_battery_label = _label("PWR", _mono, 24, Color("#8888aa"))
	_battery_label.position = Vector2(16, 16)
	_battery = Control.new()
	_battery.draw.connect(_draw_battery)
	add_child(_battery)

	for i in COLS * ROWS:
		var slot := Panel.new()
		slot.position = GRID + Vector2((i % COLS) * SS, (i / COLS) * SS)
		slot.size = Vector2(SS - 1, SS - 1)
		slot.add_theme_stylebox_override("panel", _box(Color(Color("#1a1a2e"), 0.75), Color("#333355"), 1))
		add_child(slot)
		_slots.append(slot)
		var icon := TextureRect.new()
		icon.position = slot.position + Vector2(2, 2)
		icon.size = Vector2(SS - 5, SS - 5)
		icon.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		icon.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		add_child(icon)
		_icons.append(icon)
	_cursor = Panel.new()
	_cursor.size = Vector2(SS - 1, SS - 1)
	_cursor.add_theme_stylebox_override("panel", _box(Color(Color("#ffdd44"), 0.12), Color("#ffdd44"), 8))
	_cursor.visible = false
	add_child(_cursor)
	_item_name = _label("", _mono, 28, Color("#aaaacc"))
	_item_name.position = GRID + Vector2(0, ROWS * SS + 8)
	_hint = _label("", _mono, 24, Color("#555566"))
	_hint.position = GRID + Vector2(0, ROWS * SS + 40)
	_hint.size.x = COLS * SS
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	set_inventory_mode(false)

	_avatar_highlight = Panel.new()
	_avatar_highlight.size = Vector2(68, 68)
	_avatar_highlight.add_theme_stylebox_override("panel", _box(Color(0, 0, 0, 0), Color("#ffdd44"), 4))
	_avatar_highlight.visible = false
	_avatar_highlight.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_avatar_highlight)


# ── API ─────────────────────────────────────────────────────────────────

## UIScene.onRosterChanged + updateAvatarHighlight: 68 px portraits (frame
## 0 of each sheet) from (16, 864), 8 px apart; yellow frame on the active.
func set_roster(roster: Array, active_id: String) -> void:
	for a in _avatars:
		a.queue_free()
	_avatars.clear()
	_avatar_highlight.visible = false
	for i in roster.size():
		var c: Dictionary = roster[i]
		var portrait := AtlasTexture.new()
		portrait.atlas = WardenData.texture("sprites/%s.png" % c["sheet"])
		portrait.region = Rect2(0, 0, 64, 64)
		var t := TextureRect.new()
		t.texture = portrait
		t.position = Vector2(16 + i * (68 + 8), 864)
		t.size = Vector2(68, 68)
		t.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		t.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		t.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				avatar_clicked.emit(i))
		add_child(t)
		_avatars.append(t)
		if c["id"] == active_id:
			_avatar_highlight.position = t.position
			_avatar_highlight.visible = true
	move_child(_avatar_highlight, -1)


## Drop any open or queued dialog (death closes the box first, like Phaser).
func close_dialog() -> void:
	_pages.clear()
	_next_page()

func show_room_name(text: String) -> void:
	_room_name.text = text
	_flash(_room_name, 2.0, 0.5)


func show_unlock(text: String) -> void:
	_unlock.text = text
	_flash(_unlock, 1.2, 0.4)


func set_prompt(on: bool) -> void:
	_prompt.visible = on and not is_dialog_open()


func is_dialog_open() -> bool:
	return _dialog_bg.visible


## GameScene.openDialog: resolve words:, split into pages, show the first
## (or queue behind an open dialog).
func open_dialog(text: String, type := "narrative") -> void:
	for page in _paginate(Words.resolve(text)):
		_pages.append([page, type])
	if not is_dialog_open():
		_next_page()


## E while a dialog is open: next page, or close.
func advance() -> void:
	_next_page()


func set_battery(percent: float, carried: bool) -> void:
	_battery_pct = percent
	_battery.visible = carried
	_battery_label.visible = carried
	_battery.queue_redraw()


func set_inventory(items: Array) -> void:
	for i in _icons.size():
		var item: Variant = items[i] if i < items.size() else null
		_icons[i].texture = _item_icon(item) if item is Dictionary else null


func set_inventory_mode(active: bool) -> void:
	_cursor.visible = active
	if active:
		_hint.text = "E:use Q:drop"
		_hint.add_theme_color_override("font_color", Color("#ffdd88"))
	else:
		_hint.text = "TAB:inventory"
		_hint.add_theme_color_override("font_color", Color("#555566"))
		_item_name.text = ""


func set_cursor(slot: int, items: Array) -> void:
	_cursor.position = _slots[slot].position
	var item: Variant = items[slot]
	_item_name.text = item.get("name", "") if item is Dictionary else ""


# ── internals ───────────────────────────────────────────────────────────

func _next_page() -> void:
	if _pages.is_empty():
		_dialog_bg.visible = false
		_dialog_text.visible = false
		_dismiss.visible = false
		return
	var page: Array = _pages.pop_front()
	var style: Dictionary = STYLES.get(page[1], STYLES["narrative"])
	var font: Font = {"speech": SPEECH, "type": TYPE, "ui": UI}[style["font"]]
	if style["italic"]:
		font = _italic
	_dialog_text.add_theme_font_override("font", font)
	_dialog_text.add_theme_font_size_override("font_size", style["size"])
	_dialog_text.add_theme_color_override("font_color", style["color"])
	_dialog_bg.color = style["box"]
	_dialog_text.text = page[0]
	_dialog_text.size.y = 0
	_dialog_text.reset_size()
	_dialog_text.size.x = W - 160
	var text_h := _dialog_text.get_minimum_size().y
	var box_h := maxf(120.0, text_h + 80.0)
	var bottom := H - 32.0
	_dialog_bg.position = Vector2(32, bottom - box_h)
	_dialog_bg.size = Vector2(W - 64, box_h)
	_dialog_text.position = Vector2(64, bottom - box_h + 40)
	_dismiss.position = Vector2(W - 80, bottom - 36) - _dismiss.size / 2.0
	_dialog_bg.visible = true
	_dialog_text.visible = true
	_dismiss.visible = true
	_prompt.visible = false


## GameScene.paginateText: split on "\n---\n", then every 10 lines.
func _paginate(text: String) -> Array:
	var pages := []
	for section in text.split("\n---\n"):
		section = section.strip_edges()
		if section == "":
			continue
		var lines := section.split("\n")
		for i in range(0, lines.size(), 10):
			pages.append("\n".join(lines.slice(i, i + 10)))
	return pages if not pages.is_empty() else [text]


func _draw_battery() -> void:
	var r := Rect2(80, 24, 160, 16)
	_battery.draw_rect(r, Color(Color("#333333"), 0.8))
	var fill := Color("#44ff44") if _battery_pct > 20.0 else Color("#ff4444")
	_battery.draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(_battery_pct, 0.0, 100.0) / 100.0, r.size.y)), fill)
	_battery.draw_rect(r, Color("#666666"), false, 4.0)


func _item_icon(item: Dictionary) -> Texture2D:
	if not item.has("tileFrame"):
		return null
	var key: Variant = item.get("tilesetKey")
	var atlas := AtlasTexture.new()
	atlas.atlas = WardenData.tileset_texture(key)
	atlas.region = WardenData.frame_rect(int(item["tileFrame"]))
	return atlas


## Visible now, then fade out after `hold` seconds.
func _flash(node: CanvasItem, hold: float, fade: float) -> void:
	if _tweens.has(node):
		_tweens[node].kill()
	node.modulate.a = 1.0
	var tw := create_tween()
	tw.tween_interval(hold)
	tw.tween_property(node, "modulate:a", 0.0, fade)
	_tweens[node] = tw


## The pulsing "E" key badge (interact / dismiss prompts).
func _key_badge() -> Label:
	var l := _label("E", _mono, 32, Color.WHITE)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color(0, 0, 0, 0x88 / 255.0)
	sb.set_content_margin_all(0)
	sb.content_margin_left = 24
	sb.content_margin_right = 24
	sb.content_margin_top = 12
	sb.content_margin_bottom = 12
	l.add_theme_stylebox_override("normal", sb)
	l.reset_size()
	var tw := create_tween().set_loops()
	tw.tween_property(l, "modulate:a", 0.5, 0.6)
	tw.tween_property(l, "modulate:a", 1.0, 0.6)
	return l


func _label(text: String, font: Font, size: int, color: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_override("font", font)
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", color)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(l)
	return l


func _center(l: Label, y: float) -> void:
	l.size = Vector2(W, 0)
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.position = Vector2(0, y - l.get_minimum_size().y / 2.0)


func _box(bg: Color, border: Color, width: int) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new()
	sb.bg_color = bg
	sb.border_color = border
	sb.set_border_width_all(width)
	return sb
