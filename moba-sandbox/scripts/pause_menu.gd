extends CanvasLayer
## Esc pauses: freezes the game, frees the mouse (so you can leave the
## window), and offers Resume (or Esc again), Restart (in a run: Abandon run,
## back to the hero pick) and Quit. Stays out of the way while the run's own
## screens (hero pick, shop, run over) have the game paused.

const Run := preload("res://scripts/run.gd")
const PlayLog := preload("res://scripts/play_log.gd")

signal restart   # main reloads the scene

var hero: Node2D
var in_run := false   # lane mode: Restart abandons the run

var _panel: Control
var _buttons: Array = []   # this frame's click targets: {rect, action}
var _slider := Rect2()     # the Music slider's track, this frame
var _dragging := false


func _ready() -> void:
	layer = 30
	process_mode = Node.PROCESS_MODE_ALWAYS
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.draw.connect(_draw_menu)
	_panel.gui_input.connect(_on_gui_input)
	add_child(_panel)
	visible = false  # just hide — don't touch the pause the run screen may own
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE


func is_open() -> bool:
	return visible


func toggle() -> void:
	if visible:
		resume()
	elif not get_tree().paused:  # the run's screens own the pause while they're up
		_show(true)


func resume() -> void:
	_show(false)


func _show(open: bool) -> void:
	visible = open
	_panel.mouse_filter = Control.MOUSE_FILTER_STOP if open else Control.MOUSE_FILTER_IGNORE
	# closing: stay paused if a run screen (shop, run over) opened meanwhile — Esc
	# pressed as a round ends used to unpause the game behind the shop
	var screen := get_parent().get_node_or_null("RunScreen")
	get_tree().paused = open or (screen != null and screen.visible)
	PlayLog.event("pause" if open else "resume")
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if open else Input.MOUSE_MODE_CONFINED
	if open and hero:
		hero.aiming = ""  # don't come back mid-aim
		hero._steering = false
	_panel.queue_redraw()


func _do_restart() -> void:
	if in_run:
		PlayLog.run_end("abandoned R%d" % Run.round_num)
		Run.reset()  # abandon: back to the hero pick
	_show(false)
	restart.emit()


## Pause-menu switch. Switching on mid-round starts recording right away.
func _toggle_play_log() -> void:
	var on := not PlayLog.is_on()
	PlayLog.set_enabled(on)
	if on and in_run and Run.phase == "play" and not PlayLog.recording():
		PlayLog.run_start()
		hero.get_parent().start_play_log_probe()


func _process(_delta: float) -> void:
	if visible:
		_panel.queue_redraw()  # hover highlights


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key and key.pressed and not key.echo and key.physical_keycode == KEY_ESCAPE:
		toggle()
		get_viewport().set_input_as_handled()


func _on_gui_input(event: InputEvent) -> void:
	var mb := event as InputEventMouseButton
	if mb and mb.button_index == MOUSE_BUTTON_LEFT and not mb.pressed:
		_dragging = false
	var mm := event as InputEventMouseMotion
	if mm and _dragging:  # dragging the Music slider
		_set_music_from(mm.position.x)
		return
	if mb == null or not mb.pressed or mb.button_index != MOUSE_BUTTON_LEFT:
		return
	if _slider.grow(10.0).has_point(mb.position):  # click (and drag) on the Music slider
		_dragging = true
		_set_music_from(mb.position.x)
		return
	for b: Dictionary in _buttons:
		if (b["rect"] as Rect2).has_point(mb.position):
			b["action"].call()
			return


func _music() -> Node:
	return get_node_or_null("/root/Music")


func _set_music_from(x: float) -> void:
	var m := _music()
	if m and _slider.size.x > 0.0:
		m.set_level((x - _slider.position.x) / _slider.size.x)
		_panel.queue_redraw()


## How to Play, over the menu (Esc closes it first).
func _open_help() -> void:
	if not get_parent().has_node("HowToPlay"):
		var h: CanvasLayer = load("res://scripts/how_to_play.gd").new()
		h.name = "HowToPlay"
		get_parent().add_child(h)


func _draw_menu() -> void:
	_buttons = []
	var view := _panel.get_viewport_rect().size
	var font := ThemeDB.fallback_font
	_panel.draw_rect(Rect2(Vector2.ZERO, view), Color(0.02, 0.03, 0.04, 0.85))
	var items := [
		["Resume   (Esc)", resume, Color("#66bb6a")],
		["Abandon run" if in_run else "Back to hero select", _do_restart, Color("#ffb74d")],
	]
	if PlayLog.available() and in_run:  # dev builds only
		items.append(["Play log: %s" % ("ON (recording)" if PlayLog.is_on() else "OFF"), _toggle_play_log,
			Color("#ef5350") if PlayLog.is_on() else Color("#546e7a")])
	var ind: bool = hero.cast_indicator() if hero else false
	items.append(["Cast indicator: %s" % ("ON (hold, release)" if ind else "OFF (quick cast)"),
		func() -> void: hero.set_cast_indicator(not hero.cast_indicator()), Color("#80cbc4") if ind else Color("#546e7a")])
	items.append(["How to play", _open_help, Color("#80cbc4")])
	items.append(["Quit", func() -> void: get_tree().quit(), Color("#ef5350")])
	# the whole menu (title, buttons, Music fader) centred on screen, clear of the HUD
	var size := Vector2(360, 58)
	var height := 130.0 + items.size() * (size.y + 16.0) + 54.0
	var top := maxf(24.0, (view.y - height) / 2.0 - 50.0)  # a little above centre: the controls hint and ability bar sit low
	_panel.draw_string(font, Vector2(0, top + 56.0), "PAUSED", HORIZONTAL_ALIGNMENT_CENTER, view.x, 64, Color.WHITE)
	if in_run:
		_panel.draw_string(font, Vector2(0, top + 96.0), "Round %d   ·   best %d" % [Run.round_num, Run.load_best()],
			HORIZONTAL_ALIGNMENT_CENTER, view.x, 18, Color(1, 1, 1, 0.55))
	var y := top + 130.0
	for item: Array in items:
		var r := Rect2(Vector2((view.x - size.x) / 2.0, y), size)
		_buttons.append({"rect": r, "action": item[1]})
		var hot := r.has_point(_panel.get_local_mouse_position())
		var accent: Color = item[2]
		_panel.draw_rect(r, Color("#1c262c"))
		_panel.draw_rect(r, accent.lightened(0.3) if hot else accent, false, 3.0 if hot else 2.0)
		_panel.draw_string(font, r.position + Vector2(0, 37), item[0], HORIZONTAL_ALIGNMENT_CENTER, size.x, 20, Color.WHITE)
		y += size.y + 16.0
	# the Music fader: click or drag along the track
	var m := _music()
	var lvl: float = m.level if m else 1.0
	y += 8.0
	_panel.draw_string(font, Vector2((view.x - size.x) / 2.0, y + 14.0), "Music", HORIZONTAL_ALIGNMENT_LEFT, -1, 18, Color.WHITE)
	_panel.draw_string(font, Vector2((view.x - size.x) / 2.0, y + 14.0), "%d%%" % roundi(lvl * 100.0) if lvl > 0.001 else "off",
		HORIZONTAL_ALIGNMENT_RIGHT, size.x, 16, Color(1, 1, 1, 0.6))
	_slider = Rect2(Vector2((view.x - size.x) / 2.0, y + 30.0), Vector2(size.x, 8.0))
	_panel.draw_rect(_slider.grow(2.0), Color("#10151a"))
	_panel.draw_rect(Rect2(_slider.position, Vector2(_slider.size.x * lvl, _slider.size.y)), Color("#80cbc4"))
	var knob := Vector2(_slider.position.x + _slider.size.x * lvl, _slider.get_center().y)
	var hot := _dragging or _slider.grow(10.0).has_point(_panel.get_local_mouse_position())
	_panel.draw_circle(knob, 11.0 if hot else 9.0, Color.WHITE)
	_panel.draw_circle(knob, 5.0, Color("#80cbc4"))
