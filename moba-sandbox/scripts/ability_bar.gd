extends CanvasLayer
## The HUD:
##   ability bar   bottom centre — one slot per Q W E R: key, name, mana cost,
##                 cooldown sweep + seconds; dimmed blue when you can't afford
##                 it; the slot being aimed lights up
##   health bar    above the slots — current / max; "Respawning in N" while dead
##   mana bar      under the slots — current / max; flashes red with "Not
##                 enough mana" when you try to cast without it
##   hero list     top left — the four heroes (1–4, or click), current one lit;
##                 in a run (no switching) your build instead
##   mode          top right — Lane / Training (in Training, F9 or click goes
##                 back to the run; the run can't switch to Training); in
##                 Training "No cooldowns" and "No mana" switches and a Shop
##                 button (the free build editor, also B) sit under it
##   lane status   top centre (lane mode) — round (and your best), both
##                 towers' health and the wave / overtime timer (deaths are in
##                 the hero boxes); each side's gold under its tower bar;
##   minimap       bottom right (lane mode) — the lane, bases, towers,
##                 creeps, both heroes and your camera's view; left-click (or
##                 drag) on it to move the camera there (unlocks a Y lock)
##   opponent      top right under the mode box (lane mode) — the bot's hero,
##                 ability levels and red's upgrades (it shops too);
##                 a Victory / Defeat banner once a tower falls
## A controls hint sits above the ability bar. Hovering a Q W E R slot shows
## its tooltip (ability_info.gd: live numbers, next level); hovering the build
## panel's hero box shows your attack and stats.

const Heroes := preload("res://scripts/heroes.gd")
const HeroScript := preload("res://scripts/hero.gd")
const Run := preload("res://scripts/run.gd")
const Upgrades := preload("res://scripts/upgrades.gd")
const PlayLog := preload("res://scripts/play_log.gd")
const Unit := preload("res://scripts/unit.gd")
const AbilityInfo := preload("res://scripts/ability_info.gd")
const Bounds := preload("res://scripts/bounds.gd")
const CapsuleScript := preload("res://scripts/power_capsule.gd")

const SLOT := 78.0
const GAP := 12.0
const MANA_BLUE := Color("#42a5f5")
const LIST_ROW := 54.0
const HEALTH_GREEN := Color("#66bb6a")
const GOLD := Color("#ffd54f")
const TEAM_COLORS := [Color("#4f8ff7"), Color("#ef5350")]
const MODE_BOX := Vector2(230, 48)
const HERO_BOX := Vector2(230, 58)  # the hero boxes (yours top left, red's top right): name, levels, vitals

signal mode_clicked
signal cooldowns_clicked
signal mana_clicked
signal shop_clicked

var hero: Node2D
var lane: Node2D  # null in training mode
var _panel: Control
var _mode_hit: Control
const MAP_SIZE := Vector2(400, 96)       # the minimap on screen
const MAP_WORLD := Rect2(-3000, -720, 6000, 1440)  # the slice of world it shows (the whole field)
var _cd_hit: Control
var _mana_hit: Control
var _shop_hit: Control
var _map_hit: Control
var _build_hit: Control
## The build panel's upgrade list folded down to one row of tier counts
## (click the hero box to toggle; remembered in Run.settings).
var build_collapsed := false
## The same for the opponent panel (top right): click its hero box.
var opponent_collapsed := false
var _opp_hit: Control


func _ready() -> void:
	_panel = Control.new()
	_panel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_panel.draw.connect(_draw_hud)
	add_child(_panel)
	# Click targets for the hero list (drawn by _draw_hud).
	for i in Heroes.LIST.size():
		var hit := Control.new()
		hit.position = Vector2(16, 16 + i * LIST_ROW)
		hit.size = Vector2(190, LIST_ROW - 6)
		hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		hit.gui_input.connect(func(ev: InputEvent) -> void:
			if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
				hero.set_hero(i))
		hit.visible = hero.can_switch  # no switching mid-run
		add_child(hit)
	_mode_hit = Control.new()  # click target for the mode box (top right)
	_mode_hit.size = MODE_BOX
	_mode_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_mode_hit.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			mode_clicked.emit())
	add_child(_mode_hit)
	_cd_hit = Control.new()  # click target for Training's "No cooldowns" switch
	_cd_hit.size = MODE_BOX
	_cd_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_cd_hit.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			cooldowns_clicked.emit())
	_cd_hit.visible = false
	add_child(_cd_hit)
	_mana_hit = Control.new()  # click target for Training's "No mana" switch
	_mana_hit.size = MODE_BOX
	_mana_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_mana_hit.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			mana_clicked.emit())
	_mana_hit.visible = false
	add_child(_mana_hit)
	_shop_hit = Control.new()  # click target for Training's Shop button
	_shop_hit.size = MODE_BOX
	_shop_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_shop_hit.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			shop_clicked.emit())
	_shop_hit.visible = false
	add_child(_shop_hit)
	_map_hit = Control.new()  # the minimap: click / drag to move the camera (placed by _draw_minimap)
	_map_hit.size = MAP_SIZE
	_map_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_map_hit.gui_input.connect(_on_map_input)
	_map_hit.visible = false
	add_child(_map_hit)
	_build_hit = Control.new()  # click target for the build panel's hero box: fold / unfold the list
	_build_hit.position = Vector2(16, 16)
	_build_hit.size = HERO_BOX
	_build_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_build_hit.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			build_collapsed = not build_collapsed
			var c := ConfigFile.new()
			c.load(Run.settings)
			c.set_value("hud", "build_collapsed", build_collapsed)
			c.save(Run.settings))
	_build_hit.visible = not hero.can_switch
	add_child(_build_hit)
	_opp_hit = Control.new()  # click target for the opponent panel's hero box (placed by _draw_opponent)
	_opp_hit.size = HERO_BOX
	_opp_hit.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_opp_hit.gui_input.connect(func(ev: InputEvent) -> void:
		if ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT:
			opponent_collapsed = not opponent_collapsed
			var c := ConfigFile.new()
			c.load(Run.settings)
			c.set_value("hud", "opponent_collapsed", opponent_collapsed)
			c.save(Run.settings))
	_opp_hit.visible = false
	add_child(_opp_hit)
	var cfg := ConfigFile.new()
	if cfg.load(Run.settings) == OK:
		build_collapsed = bool(cfg.get_value("hud", "build_collapsed", false))
		opponent_collapsed = bool(cfg.get_value("hud", "opponent_collapsed", false))


func _process(_delta: float) -> void:
	_panel.queue_redraw()


func _draw_hud() -> void:
	var view := _panel.get_viewport_rect().size
	var font := ThemeDB.fallback_font
	if hero.can_switch:
		_draw_hero_list(font)
	else:
		_draw_build(font)
	_draw_mode(font, view)
	if lane:
		_draw_lane_status(font, view)
		_draw_opponent(font, view)
		_draw_minimap(view)

	var slots: Array = hero.SLOT_ORDER
	var width := slots.size() * SLOT + (slots.size() - 1) * GAP
	var origin := Vector2((view.x - width) / 2.0, view.y - SLOT - 46.0)

	_draw_health_bar(font, Rect2(origin - Vector2(0, 30.0), Vector2(width, 18.0)))
	# (the controls live in How to Play — hero select and the Esc menu)

	for i in slots.size():
		var key: String = slots[i]
		var a: Dictionary = hero.abilities[key]
		var c: Color = a["color"]
		var r := Rect2(origin + Vector2(i * (SLOT + GAP), 0), Vector2(SLOT, SLOT))
		var centre := r.get_center()
		var affordable: bool = hero.can_afford(key)
		_panel.draw_rect(r, Color("#10151a"))
		_panel.draw_rect(r.grow(-6), Color(c, 0.85))
		var name_size := 14
		while name_size > 9 and font.get_string_size(a["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, name_size).x > SLOT - 14.0:
			name_size -= 1  # long names shrink to fit the slot
		_panel.draw_string(font, r.position + Vector2(0, SLOT * 0.58), a["name"], HORIZONTAL_ALIGNMENT_CENTER, SLOT, name_size, Color("#10151a"))

		var left: float = hero.cooldowns[key]
		var max_ch: int = hero.max_charges(key)
		if left > 0.0:  # dark sweep over the part still cooling down
			var frac: float = clampf(left / a["cooldown"], 0.0, 1.0)
			var pts := PackedVector2Array([centre])
			for s in 33:
				pts.append(centre + Vector2.from_angle(-PI / 2.0 + TAU * frac * s / 32.0) * SLOT)
			var sweep := _clip_to(pts, r.grow(-6))
			if frac > 0.01 and sweep.size() >= 3:  # a sliver can be too thin to triangulate
				_panel.draw_colored_polygon(sweep, Color(0, 0, 0, 0.62))
			_panel.draw_string(font, r.position + Vector2(0, SLOT * 0.6), str(ceili(left)), HORIZONTAL_ALIGNMENT_CENTER, SLOT, 26, Color.WHITE)
		elif not affordable:  # ready but too expensive: blue wash
			_panel.draw_rect(r.grow(-6), Color(0.05, 0.12, 0.35, 0.65))

		var second: bool = hero.has_recast(key) or hero.can_untether(key)
		if second:  # waiting for its second press (detonate / untether)
			var p := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 150.0)
			_panel.draw_rect(r.grow(-6), Color(1, 1, 1, 0.15 + 0.15 * p))
			_panel.draw_string(font, r.position + Vector2(0, SLOT * 0.86), "UNTETHER" if hero.can_untether(key) else "RECAST", HORIZONTAL_ALIGNMENT_CENTER, SLOT, 12, Color.WHITE)
		var border := Color.WHITE if hero.aiming == key or second else Color("#37474f")
		_panel.draw_rect(r, border, false, 3.0 if hero.aiming == key else 2.0)
		# key letter badge, top-left
		_panel.draw_rect(Rect2(r.position + Vector2(3, 3), Vector2(20, 20)), Color("#10151a"))
		_panel.draw_string(font, r.position + Vector2(3, 19), key, HORIZONTAL_ALIGNMENT_CENTER, 20, 15, Color.WHITE)
		# ability level, top-right (I / II / III)
		var lvl: int = a.get("level", 1)
		var roman: String = Heroes.ROMAN[lvl]
		var lw := font.get_string_size(roman, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x + 8.0
		var lr := Rect2(Vector2(r.end.x - lw - 3.0, r.position.y + 3.0), Vector2(lw, 18.0))
		_panel.draw_rect(lr, Color("#10151a"))
		_panel.draw_string(font, lr.position + Vector2(0, 14), roman, HORIZONTAL_ALIGNMENT_CENTER, lw, 13,
			Upgrades.LEVEL_COLOR if lvl > 1 else Color(1, 1, 1, 0.5))
		if max_ch > 1:  # charges: a pip per charge, bottom-left; the next one's refill as a thin bar
			for ci in max_ch:
				var pc := r.position + Vector2(12 + ci * 13, SLOT - 12)
				_panel.draw_circle(pc, 5.0, Color("#10151a"))
				_panel.draw_circle(pc, 3.5, Color.WHITE if ci < int(hero.charges[key]) else Color(1, 1, 1, 0.15))
			if hero.recharge[key] > 0.0 and hero._recharge_len[key] > 0.0:
				var fill: float = 1.0 - hero.recharge[key] / hero._recharge_len[key]
				_panel.draw_rect(Rect2(r.position + Vector2(6, SLOT - 5), Vector2((SLOT - 12) * fill, 3)), Color(1, 1, 1, 0.7))
		# mana cost, bottom-right
		var cost := str(int(hero.ability_cost(key)))
		var cost_w := font.get_string_size(cost, HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x + 8.0
		var cost_r := Rect2(r.end - Vector2(cost_w + 3.0, 21.0), Vector2(cost_w, 18.0))
		_panel.draw_rect(cost_r, Color("#10151a"))
		_panel.draw_string(font, cost_r.position + Vector2(0, 14), cost, HORIZONTAL_ALIGNMENT_CENTER, cost_w, 14, MANA_BLUE if affordable else Color("#ef5350"))

	_draw_mana_bar(font, Rect2(origin + Vector2(0, SLOT + 10.0), Vector2(width, 16.0)))
	_draw_guard_slot(font, Rect2(origin + Vector2(width + GAP * 2.0, SLOT * 0.4), Vector2(SLOT * 0.6, SLOT * 0.6)))
	if hero.leashing:  # pick mode
		_panel.draw_string_outline(font, Vector2(0, origin.y - 70.0), "LEASH: click one of your creeps   ·   T or right-click to cancel", HORIZONTAL_ALIGNMENT_CENTER, view.x, 18, 6, Color(0, 0, 0, 0.8))
		_panel.draw_string(font, Vector2(0, origin.y - 70.0), "LEASH: click one of your creeps   ·   T or right-click to cancel", HORIZONTAL_ALIGNMENT_CENTER, view.x, 18, Color("#80deea"))
	if hero.leash_flash > 0.0:
		_panel.draw_string(font, Vector2(0, origin.y - 96.0), "Not enough leash points", HORIZONTAL_ALIGNMENT_CENTER, view.x, 18, Color(1, 0.5, 0.5, minf(1.0, hero.leash_flash * 2.0)))
	_draw_tooltips(font, view, origin)
	if lane and lane.winner < 0:  # the moment overtime begins: say what it means, for a few seconds
		var since: float = lane.elapsed - lane.overtime_start()
		if since >= 0.0 and since < 4.0:
			var a := minf(1.0, (4.0 - since) * 1.5)
			var msg := "OVERTIME  —  kills pay no gold, abilities %d%% cheaper and quicker. Finish it!" % roundi(Unit.ability_haste * 100.0) if Unit.ability_haste > 0.0 else "OVERTIME  —  kills no longer pay gold. Finish it!"
			_panel.draw_string_outline(font, Vector2(0, view.y * 0.3), msg, HORIZONTAL_ALIGNMENT_CENTER, view.x, 30, 8, Color(0, 0, 0, 0.8 * a))
			_panel.draw_string(font, Vector2(0, view.y * 0.3), msg, HORIZONTAL_ALIGNMENT_CENTER, view.x, 30, Color(1.0, 0.54, 0.4, a))


## D (Guard in code): a small slot right of R — every hero's own shield. Hover: what it does.
func _draw_guard_slot(font: Font, r: Rect2) -> void:
	var col: Color = hero.GUARD_COLOR
	_panel.draw_rect(r, Color("#10151a"))
	_panel.draw_rect(r.grow(-4), Color(col, 0.85))
	_panel.draw_string(font, r.position + Vector2(0, r.size.y * 0.66), "D", HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 18, Color("#10151a"))
	var left: float = hero.guard_cd
	if left > 0.0:  # dark cover over the part still cooling down, top down
		var frac: float = clampf(left / hero.GUARD_COOLDOWN, 0.0, 1.0)
		var inner := r.grow(-4)
		_panel.draw_rect(Rect2(inner.position, Vector2(inner.size.x, inner.size.y * frac)), Color(0, 0, 0, 0.62))
		_panel.draw_string(font, r.position + Vector2(0, r.size.y * 0.66), str(ceili(left)), HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 18, Color.WHITE)
	_panel.draw_rect(r, Color("#37474f"), false, 2.0)
	if hero.aiming == "" and r.has_point(_panel.get_local_mouse_position()):
		var msg := "D — %d shield for %s s. Clears bad effects and blocks new ones for %s s. %d s cooldown." % [
			int(hero.GUARD_SHIELD), str(hero.GUARD_TIME), str(hero.GUARD_IMMUNE), int(hero.GUARD_COOLDOWN)]
		var w := font.get_string_size(msg, HORIZONTAL_ALIGNMENT_LEFT, -1, 15).x + 20.0
		var at := Vector2(clampf(r.get_center().x - w / 2.0, 8.0, _panel.get_viewport_rect().size.x - w - 8.0), r.position.y - 40.0)
		_panel.draw_rect(Rect2(at, Vector2(w, 28.0)), Color(0.05, 0.07, 0.09, 0.95))
		_panel.draw_string(font, at + Vector2(10, 19), msg, HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color.WHITE)


## Hover tooltips: an ability slot (above it), or the build panel's hero box
## (beside it). Not while aiming.
func _draw_tooltips(font: Font, view: Vector2, origin: Vector2) -> void:
	if hero.aiming != "":
		return
	var m := _panel.get_local_mouse_position()
	var slots: Array = hero.SLOT_ORDER
	for i in slots.size():
		var r := Rect2(origin + Vector2(i * (SLOT + GAP), 0), Vector2(SLOT, SLOT))
		if r.has_point(m):
			var key: String = slots[i]
			var info := AbilityInfo.ability(hero.def, key, hero.abilities[key].get("level", 1), hero.mods, hero.damage_mult)
			AbilityInfo.draw(_panel, font, info, r, view)
			return
	var box := Rect2(Vector2(16, 16), Vector2(230, 48))
	if not hero.can_switch and box.has_point(m):
		AbilityInfo.draw(_panel, font, AbilityInfo.hero_stats(hero), box, view, false, true)


func _draw_mana_bar(font: Font, r: Rect2) -> void:
	var flash: float = hero.no_mana_flash
	_panel.draw_rect(r.grow(2), Color("#10151a"))
	_panel.draw_rect(Rect2(r.position, Vector2(r.size.x * hero.mana / hero.max_mana, r.size.y)), MANA_BLUE)
	if flash > 0.0:
		_panel.draw_rect(r, Color(1, 0.2, 0.2, flash * 0.8))
		_panel.draw_string(font, Vector2(r.position.x, r.position.y - SLOT - 104.0), "Not enough mana", HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 20, Color(1, 0.4, 0.4, minf(1.0, flash * 2.0)))
	_panel.draw_string(font, r.position + Vector2(0, 13), "%d / %d" % [int(hero.mana), int(hero.max_mana)], HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 13, Color.WHITE)


func _draw_health_bar(font: Font, r: Rect2) -> void:
	_panel.draw_rect(r.grow(2), Color("#10151a"))
	_panel.draw_rect(Rect2(r.position, Vector2(r.size.x * hero.hp / hero.max_hp, r.size.y)), HEALTH_GREEN)
	_panel.draw_string(font, r.position + Vector2(0, 14), "%d / %d" % [ceili(hero.hp), int(hero.max_hp)], HORIZONTAL_ALIGNMENT_CENTER, r.size.x, 14, Color.WHITE)
	if not hero.is_targetable():
		var view := _panel.get_viewport_rect().size
		_panel.draw_rect(Rect2(Vector2.ZERO, view), Color(0.3, 0.0, 0.0, 0.18))
		_panel.draw_string_outline(font, Vector2(0, view.y * 0.42), "Respawning in %d" % ceili(hero.respawn_in), HORIZONTAL_ALIGNMENT_CENTER, view.x, 40, 8, Color(0, 0, 0, 0.8))
		_panel.draw_string(font, Vector2(0, view.y * 0.42), "Respawning in %d" % ceili(hero.respawn_in), HORIZONTAL_ALIGNMENT_CENTER, view.x, 40, Color("#ff8a80"))


func _draw_mode(font: Font, view: Vector2) -> void:
	var r := Rect2(Vector2(view.x - MODE_BOX.x - 16.0, 16.0), MODE_BOX)
	_mode_hit.position = r.position
	_mode_hit.visible = lane == null  # only Training has a mode box (back to the run)
	if PlayLog.recording():  # play log is on: say so, bottom-left
		var blink := 0.55 + 0.45 * sin(Time.get_ticks_msec() / 300.0)
		_panel.draw_circle(Vector2(24, view.y - 22), 6.0, Color(0.94, 0.33, 0.31, blink))
		_panel.draw_string(font, Vector2(38, view.y - 17), "PLAY LOG", HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("#ef9a9a"))
	if lane == null:
		_panel.draw_rect(r, Color(0.06, 0.08, 0.1, 0.7))
		_panel.draw_string(font, r.position + Vector2(14, 21), "TRAINING MODE", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
		_panel.draw_string(font, r.position + Vector2(14, 39), "F9 / click: back to hero select", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.45))
	_cd_hit.visible = lane == null
	_mana_hit.visible = lane == null
	_shop_hit.visible = lane == null
	if lane == null:  # Training: the "No cooldowns" and "No mana" switches
		var c := Rect2(r.position + Vector2(0, MODE_BOX.y + 8.0), MODE_BOX)
		_cd_hit.position = c.position
		_draw_switch(font, c, "No cooldowns", hero.no_cooldowns)
		var m := Rect2(c.position + Vector2(0, MODE_BOX.y + 8.0), MODE_BOX)
		_mana_hit.position = m.position
		_draw_switch(font, m, "No mana", hero.no_mana)
		var s := Rect2(m.position + Vector2(0, MODE_BOX.y + 8.0), MODE_BOX)
		_shop_hit.position = s.position
		_panel.draw_rect(s, Color(0.06, 0.08, 0.1, 0.7))
		_panel.draw_rect(s, GOLD.darkened(0.3), false, 2.0)
		_panel.draw_string(font, s.position + Vector2(14, 21), "Shop  (B)", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, GOLD)
		_panel.draw_string(font, s.position + Vector2(14, 39), "free: try any build", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.45))


## A Training on/off switch box.
func _draw_switch(font: Font, c: Rect2, label: String, on: bool) -> void:
	_panel.draw_rect(c, Color(0.06, 0.08, 0.1, 0.7))
	_panel.draw_rect(c, Color("#66bb6a") if on else Color("#37474f"), false, 2.0)
	_panel.draw_string(font, c.position + Vector2(14, 21), label + ": " + ("ON" if on else "OFF"), HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color("#a5d6a7") if on else Color.WHITE)
	_panel.draw_string(font, c.position + Vector2(14, 39), "click to switch", HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.45))


## Both towers' health either side of the wave timer; the banner at the end.
func _draw_lane_status(font: Font, view: Vector2) -> void:
	var w := 600.0
	var r := Rect2(Vector2((view.x - w) / 2.0, 12.0), Vector2(w, 68.0))  # towers, round, wave / overtime
	_panel.draw_rect(r, Color(0.06, 0.08, 0.1, 0.78))
	# the middle: ROUND, then WAVE, then when overtime starts (or OVERTIME)
	_panel.draw_string(font, r.position + Vector2(0, 24), "ROUND %d" % Run.round_num, HORIZONTAL_ALIGNMENT_CENTER, w, 18, Color.WHITE)
	if lane.winner < 0:
		var secs := int(lane.elapsed)  # this round's clock, under ROUND
		_panel.draw_string(font, r.position + Vector2(0, 43), "%d:%02d  ·  WAVE %d" % [secs / 60, secs % 60, lane.wave], HORIZONTAL_ALIGNMENT_CENTER, w, 12, Color(1, 1, 1, 0.6))
		var start: float = lane.overtime_start()
		if lane.elapsed < start:
			_panel.draw_string(font, r.position + Vector2(0, 60), "OVERTIME AT %d:%02d" % [int(start) / 60, int(start) % 60], HORIZONTAL_ALIGNMENT_CENTER, w, 12, Color(1, 1, 1, 0.6))
		else:
			_panel.draw_string(font, r.position + Vector2(0, 60), "OVERTIME  ·  NO GOLD", HORIZONTAL_ALIGNMENT_CENTER, w, 12, Color("#ff8a65"))
	# either side: the tower's health, and that side's gold beneath it
	for team in 2:
		var t: Node2D = lane.tower(team)
		var frac: float = t.hp / t.max_hp if t else 0.0
		var bx := 16.0 if team == 0 else w - 16.0 - 200.0
		var bar := Rect2(r.position + Vector2(bx, 28.0), Vector2(200.0, 10.0))
		_panel.draw_rect(bar.grow(1.5), Color("#10151a"))
		_panel.draw_rect(Rect2(bar.position, Vector2(bar.size.x * frac, bar.size.y)), TEAM_COLORS[team])
		var label := ("Your tower" if team == 0 else "Enemy tower") + "  %d" % ceili(t.hp if t else 0.0)
		_panel.draw_string(font, bar.position + Vector2(0, -6), label, HORIZONTAL_ALIGNMENT_LEFT if team == 0 else HORIZONTAL_ALIGNMENT_RIGHT, bar.size.x, 12, TEAM_COLORS[team].lightened(0.3))
		var side: Node2D = hero if team == 0 else lane.bot
		if side:  # that side's gold, under its tower: a coin and the amount (coin greys in overtime: no gold)
			var coin_x: float = bar.position.x + 6.0 if team == 0 else bar.end.x - 6.0
			_panel.draw_circle(Vector2(coin_x, bar.end.y + 13.0), 5.0, Color(0.55, 0.55, 0.55) if side.no_gold else GOLD)
			_panel.draw_string(font, Vector2(bar.position.x + (16.0 if team == 0 else 0.0), bar.end.y + 18.0), str(side.gold),
				HORIZONTAL_ALIGNMENT_LEFT if team == 0 else HORIZONTAL_ALIGNMENT_RIGHT, bar.size.x - 16.0, 14, GOLD)
	if lane.winner >= 0:
		var won: bool = lane.winner == hero.team
		var text := "ROUND WON" if won else "ROUND LOST"
		var col := Color("#ffd54f") if won else Color("#ff5252")
		var y := view.y * 0.3
		_panel.draw_rect(Rect2(0, y - 70.0, view.x, 110.0), Color(0, 0, 0, 0.45))
		_panel.draw_string_outline(font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, view.x, 72, 10, Color(0, 0, 0, 0.85))
		_panel.draw_string(font, Vector2(0, y), text, HORIZONTAL_ALIGNMENT_CENTER, view.x, 72, col)


## Bottom right: the whole lane at a glance. World → map is a straight scale
## of MAP_WORLD onto the minimap's rectangle.
func _map_rect(view: Vector2) -> Rect2:
	return Rect2(view - MAP_SIZE - Vector2(16, 16), MAP_SIZE)


## Click or drag on the minimap: the camera jumps to that spot in the world.
func _on_map_input(ev: InputEvent) -> void:
	var press: bool = ev is InputEventMouseButton and ev.pressed and ev.button_index == MOUSE_BUTTON_LEFT
	var drag: bool = ev is InputEventMouseMotion and (ev.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0
	if not press and not drag:
		return
	var cam := get_viewport().get_camera_2d()
	if cam == null:
		return
	var frac: Vector2 = (ev.position / MAP_SIZE).clamp(Vector2.ZERO, Vector2.ONE)
	if "locked" in cam:
		cam.locked = false  # looking elsewhere: drop the follow lock
	cam.position = MAP_WORLD.position + frac * MAP_WORLD.size


func _to_map(r: Rect2, p: Vector2) -> Vector2:
	return r.position + (p - MAP_WORLD.position) / MAP_WORLD.size * r.size


func _draw_minimap(view: Vector2) -> void:
	var r := _map_rect(view)
	_map_hit.position = r.position
	_map_hit.visible = true
	_panel.draw_rect(r.grow(3), Color(0.03, 0.04, 0.05, 0.9))
	# the lane and the two bases
	var field := Bounds.outline(100.0)  # the playable field
	for i in field.size():
		field[i] = _to_map(r, field[i])
	_panel.draw_colored_polygon(field, Color("#27302f"))
	for team in 2:
		var b := _to_map(r, lane.base_of(team))
		_panel.draw_circle(b, lane.BASE_RADIUS / MAP_WORLD.size.x * r.size.x, Color(TEAM_COLORS[team], 0.25))
	# towers: a square, dimmer as it loses health; rubble is a dark dot
	for team in 2:
		var t: Node2D = lane.tower(team)
		if t == null:
			continue
		var tp := _to_map(r, t.position)
		if t.is_targetable():
			var a: float = 0.45 + 0.55 * t.hp / t.max_hp
			_panel.draw_rect(Rect2(tp - Vector2(6, 6), Vector2(12, 12)), Color(TEAM_COLORS[team], a))
			_panel.draw_rect(Rect2(tp - Vector2(6, 6), Vector2(12, 12)), Color.WHITE, false, 1.0)
		else:
			_panel.draw_circle(tp, 4.0, Color(0.2, 0.2, 0.2))
	# creeps (tanks a little bigger)
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.is_targetable():
			_panel.draw_circle(_to_map(r, c.position), 3.0 if c.kind == "tank" else 2.0, TEAM_COLORS[c.team].lightened(0.15))
	# totems: a square in the side's colour, its meter as a gold rim
	for t: Node2D in get_tree().get_nodes_in_group("totems"):
		if t.is_targetable():
			var tp := _to_map(r, t.position)
			_panel.draw_rect(Rect2(tp - Vector2(4, 4), Vector2(8, 8)), TEAM_COLORS[t.owner_team])
			_panel.draw_arc(tp, 7.0, -PI / 2.0, -PI / 2.0 + TAU * maxf(0.02, t.meter()), 16, Color("#ffd54f"), 1.5)
	# siege minions: a small arrowhead in the team's colour, outlined to stand out
	for m: Node2D in get_tree().get_nodes_in_group("siege_minions"):
		var mp := _to_map(r, m.position)
		var d := Vector2.RIGHT if m.team == 0 else Vector2.LEFT
		var tri := PackedVector2Array([mp + d * 6.0, mp + d.orthogonal() * 4.0 - d * 3.0, mp - d.orthogonal() * 4.0 - d * 3.0])
		_panel.draw_colored_polygon(tri, TEAM_COLORS[m.team].lightened(0.2))
		tri.append(tri[0])
		_panel.draw_polyline(tri, Color("#ffcc80"), 1.5)
	# power-up capsules: a diamond in the power's colour, rimmed in its owner's —
	# yours always; red's only while red is dead (open to you until it's back)
	for c: Node2D in get_tree().get_nodes_in_group("capsules"):
		var mine: bool = c.owner_hero != null and is_instance_valid(c.owner_hero) and not c.owner_hero.is_bot
		if not c.is_targetable() or not (mine or c.owner_down()):
			continue
		var cp := _to_map(r, c.position)
		var dia := PackedVector2Array([cp + Vector2(0, -5), cp + Vector2(5, 0), cp + Vector2(0, 5), cp + Vector2(-5, 0)])
		_panel.draw_colored_polygon(dia, CapsuleScript.POWER_COLOR[c.power])
		dia.append(dia[0])
		_panel.draw_polyline(dia, TEAM_COLORS[c.owner_team], 1.5)
	# heroes: you with a white ring
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		if not h.is_targetable():
			continue
		var hp := _to_map(r, h.position)
		_panel.draw_circle(hp, 5.0, TEAM_COLORS[h.team])
		if not h.is_bot:
			_panel.draw_arc(hp, 6.5, 0.0, TAU, 16, Color.WHITE, 1.5)
	# what the camera sees
	var cam := get_viewport().get_camera_2d()
	if cam:
		var half: Vector2 = cam.get_viewport_rect().size / 2.0 / cam.zoom
		var a := _to_map(r, cam.get_screen_center_position() - half)
		var b := _to_map(r, cam.get_screen_center_position() + half)
		var box := Rect2(a, b - a).intersection(r)
		_panel.draw_rect(box, Color(1, 1, 1, 0.8), false, 1.5)
	_panel.draw_rect(r.grow(3), Color(1, 1, 1, 0.15), false, 1.0)


## Lane mode, top right: who you're facing — the bot's hero, its ability
## levels and red's upgrades (red shops between rounds, so this grows).
func _draw_opponent(font: Font, view: Vector2) -> void:
	var bot: Node2D = lane.bot
	_opp_hit.visible = bot != null
	if bot == null:
		return
	var x := view.x - 230.0 - 16.0  # mirrors your panel (top left): same size, top right
	var r := Rect2(Vector2(x, 16.0), HERO_BOX)
	_opp_hit.position = r.position
	_panel.draw_rect(r, Color(0.1, 0.05, 0.06, 0.85))
	_draw_vitals(font, bot, r, true, lane.kills)
	_panel.draw_rect(Rect2(Vector2(r.end.x - 4.0, r.position.y), Vector2(4, r.size.y)), TEAM_COLORS[1])
	HeroScript.draw_icon(_panel, bot.def, r.position + Vector2(r.size.x - 28.0, 24), 14.0, Vector2.LEFT)
	_panel.draw_string(font, r.position + Vector2(0, 21), bot.def["name"], HORIZONTAL_ALIGNMENT_RIGHT, r.size.x - 52.0, 16, Color("#ef9a9a"))
	var lv: Array = bot.SLOT_ORDER.map(func(k: String) -> String: return "%s %s" % [k, Heroes.ROMAN[bot.ability_levels[k]]])
	_panel.draw_string(font, r.position + Vector2(0, 38), "  ".join(lv), HORIZONTAL_ALIGNMENT_RIGHT, r.size.x - 52.0, 12, Color(1, 1, 1, 0.55))
	if not bot.upgrade_ids.is_empty():  # fold arrow: click the box to fold / unfold red's upgrade list
		_panel.draw_string(font, r.position + Vector2(10, 21), "▸" if opponent_collapsed else "▾", HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(1, 1, 1, 0.5))
	var y := r.end.y + 8.0  # rows like yours (24 tall, 28 apart), stripe on the mirrored side
	var lr := Rect2(Vector2(x, y), Vector2(230, 24))  # red's leash points, mirroring your meter
	_panel.draw_rect(lr, Color(0.1, 0.05, 0.06, 0.7))
	var used: int = bot.leash_used()
	var cap: int = bot.leash_capacity()
	_panel.draw_string(font, lr.position + Vector2(0, 17), "%d / %d  leash" % [used, cap], HORIZONTAL_ALIGNMENT_RIGHT, lr.size.x - 12.0, 13, Color("#ef9a9a"))
	for i in cap:
		_panel.draw_circle(lr.position + Vector2(lr.size.x - 110.0 - i * 16.0, 12), 5.0, Color("#ef9a9a") if i < used else Color(1, 1, 1, 0.2))
	y += 28.0
	if opponent_collapsed:
		if not bot.upgrade_ids.is_empty():
			_draw_tier_counts(font, bot.upgrade_ids, Rect2(Vector2(x, y), Vector2(230, 24)), Color(0.1, 0.05, 0.06, 0.7))
		return
	var seen: Array = []
	for id: String in bot.upgrade_ids:
		if seen.has(id):
			continue
		seen.append(id)
		var u := Upgrades.find(id)
		if u.is_empty():
			continue
		var n: int = bot.upgrade_ids.count(id)
		var tc: Color = Upgrades.TIERS[u["tier"]]["color"]
		var row := Rect2(Vector2(x, y), Vector2(230, 24))
		_panel.draw_rect(row, Color(0.1, 0.05, 0.06, 0.7))
		_panel.draw_rect(Rect2(Vector2(row.end.x - 4.0, row.position.y), Vector2(4, row.size.y)), tc)
		_panel.draw_string(font, row.position + Vector2(0, 17), u["name"] + (" ×%d" % n if n > 1 else ""), HORIZONTAL_ALIGNMENT_RIGHT, row.size.x - 12.0, 14, tc.lightened(0.3))
		y += 28.0


## Inside a hero box: thin health and mana bars along the bottom and a death
## count on the levels row (mirrored for red's box).
func _draw_vitals(font: Font, h: Node2D, r: Rect2, mirror: bool, deaths: int) -> void:
	var bx := r.position.x + (10.0 if mirror else 52.0)
	var bw := r.size.x - 62.0
	var hp_frac: float = h.hp / h.max_hp if h.is_targetable() else 0.0
	var mp_frac: float = h.mana / h.max_mana
	for bar: Array in [[44.0, 4.0, hp_frac, HEALTH_GREEN if not mirror else Color("#ef5350")], [50.0, 3.0, mp_frac, MANA_BLUE]]:
		var full := Rect2(Vector2(bx, r.position.y + float(bar[0])), Vector2(bw, float(bar[1])))
		_panel.draw_rect(full, Color(0, 0, 0, 0.5))
		var w: float = full.size.x * float(bar[2])
		_panel.draw_rect(Rect2(Vector2(full.end.x - w if mirror else full.position.x, full.position.y), Vector2(w, full.size.y)), bar[3])
	var txt := "dead %ds" % ceili(h.respawn_in) if not h.is_targetable() else "deaths %d" % deaths  # short: shares the levels row
	if mirror:
		_panel.draw_string(font, Vector2(r.position.x + 10.0, r.position.y + 38), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#ef9a9a", 0.8))
	else:
		_panel.draw_string(font, Vector2(r.position.x, r.position.y + 38), txt, HORIZONTAL_ALIGNMENT_RIGHT, r.size.x - 10.0, 11, Color("#ef9a9a", 0.8))


## A folded upgrade list: one row, a dot and a count per tier.
func _draw_tier_counts(font: Font, ids: Array, row: Rect2, bg: Color) -> void:
	_panel.draw_rect(row, bg)
	var x := row.position.x + 14.0
	var mid := row.position.y + row.size.y / 2.0
	for tier: String in Upgrades.TIERS:
		var n := 0
		for id: String in ids:
			if Upgrades.find(id)["tier"] == tier:
				n += 1
		if n == 0:
			continue
		var tc: Color = Upgrades.TIERS[tier]["color"]
		_panel.draw_circle(Vector2(x, mid), 5.0, tc)
		_panel.draw_string(font, Vector2(x + 9.0, mid + 5.0), str(n), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, tc.lightened(0.3))
		x += 46.0


## In a run: your hero and every upgrade owned (stacks counted), by tier.
func _draw_build(font: Font) -> void:
	var r := Rect2(Vector2(16, 16), HERO_BOX)
	_panel.draw_rect(r, Color(0.06, 0.08, 0.1, 0.85))
	_panel.draw_rect(Rect2(r.position, Vector2(4, r.size.y)), TEAM_COLORS[0])  # your team's stripe (red's box has its own)
	_draw_vitals(font, hero, r, false, lane.deaths if lane else 0)
	HeroScript.draw_icon(_panel, hero.def, r.position + Vector2(28, 24), 14.0, Vector2.RIGHT)
	_panel.draw_string(font, r.position + Vector2(52, 21), hero.def["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE)
	var lv: Array = hero.SLOT_ORDER.map(func(k: String) -> String: return "%s %s" % [k, Heroes.ROMAN[hero.ability_levels[k]]])
	_panel.draw_string(font, r.position + Vector2(52, 38), "  ".join(lv), HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.55))
	if not hero.upgrade_ids.is_empty():  # fold arrow: click the box to fold / unfold the upgrade list
		_panel.draw_string(font, r.position + Vector2(0, 21), "▸" if build_collapsed else "▾", HORIZONTAL_ALIGNMENT_RIGHT, r.size.x - 10.0, 16, Color(1, 1, 1, 0.5))
	var y := r.end.y + 8.0
	if lane:  # leash points: T on one of your creeps to have it follow you
		var lr := Rect2(Vector2(16, y), Vector2(230, 24))
		_panel.draw_rect(lr, Color(0.06, 0.08, 0.1, 0.7))
		var used: int = hero.leash_used()
		var cap: int = hero.leash_capacity()
		_panel.draw_string(font, lr.position + Vector2(12, 17), "leash  %d / %d" % [used, cap], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color("#80deea"))
		for i in cap:
			_panel.draw_circle(lr.position + Vector2(110 + i * 16, 12), 5.0, Color("#80deea") if i < used else Color(1, 1, 1, 0.2))
		_panel.draw_string(font, lr.position + Vector2(0, 17), "T", HORIZONTAL_ALIGNMENT_RIGHT, lr.size.x - 10.0, 12, Color(1, 1, 1, 0.4))
		y += 28.0
	if build_collapsed:  # one row: a dot and a count per tier
		if not hero.upgrade_ids.is_empty():
			_draw_tier_counts(font, hero.upgrade_ids, Rect2(Vector2(16, y), Vector2(230, 24)), Color(0.06, 0.08, 0.1, 0.7))
		return
	var seen: Array = []
	for id: String in hero.upgrade_ids:
		if seen.has(id):
			continue
		seen.append(id)
		var u := Upgrades.find(id)
		var n: int = hero.upgrade_ids.count(id)
		var tc: Color = Upgrades.TIERS[u["tier"]]["color"]
		var row := Rect2(Vector2(16, y), Vector2(230, 24))
		_panel.draw_rect(row, Color(0.06, 0.08, 0.1, 0.7))
		_panel.draw_rect(Rect2(row.position, Vector2(4, row.size.y)), tc)
		_panel.draw_string(font, row.position + Vector2(12, 17), u["name"] + (" ×%d" % n if n > 1 else ""), HORIZONTAL_ALIGNMENT_LEFT, -1, 14, tc.lightened(0.3))
		y += 28.0


func _draw_hero_list(font: Font) -> void:
	for i in Heroes.LIST.size():
		var h: Dictionary = Heroes.LIST[i]
		var r := Rect2(Vector2(16, 16 + i * LIST_ROW), Vector2(190, LIST_ROW - 6))
		var current: bool = hero.hero_index == i
		_panel.draw_rect(r, Color(0.06, 0.08, 0.1, 0.85 if current else 0.55))
		if current:
			_panel.draw_rect(r, Color.WHITE, false, 2.0)
		HeroScript.draw_icon(_panel, h, r.position + Vector2(30, r.size.y / 2.0), 14.0, Vector2.RIGHT)
		_panel.draw_string(font, r.position + Vector2(52, 21), h["name"], HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color.WHITE if current else Color(1, 1, 1, 0.6))
		_panel.draw_string(font, r.position + Vector2(52, 38), h["shape"], HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.35))


## The sweep polygon clipped to the slot's inner square.
func _clip_to(poly: PackedVector2Array, rect: Rect2) -> PackedVector2Array:
	var box := PackedVector2Array([rect.position, Vector2(rect.end.x, rect.position.y), rect.end, Vector2(rect.position.x, rect.end.y)])
	var clipped := Geometry2D.intersect_polygons(poly, box)
	return clipped[0] if not clipped.is_empty() else PackedVector2Array()
