extends Node2D
## Lane mode: one straight lane west ↔ east across the map.
##
##   blue base (you)  x = -BASE_X      red base  x = +BASE_X
##   blue tower       x = -TOWER_X     red tower x = +TOWER_X
##
## Every WAVE_EVERY seconds (the first after FIRST_WAVE) each base sends a
## wave — WAVE, front to back — down the lane toward the other base. Standing
## in its own base (the well) heals a hero (health and mana) and makes it
## invulnerable; an enemy hero in it burns (WELL_BURN). Hero kills are counted.
##
## OVERTIME keeps rounds from stalling: from overtime_start() seconds in,
## both towers take more and more damage and waves grow. It's symmetric, so
## whichever side is ahead in the lane breaks through — and a round can
## always be lost. In overtime nobody earns gold (Unit.no_gold): farming
## stops paying, so the round is for finishing. One part isn't symmetric: red's hero rallies (grows
## stronger) through overtime, so stalling to farm gets riskier the longer
## it goes — while the weakened towers say "push now". Destroying the enemy tower
## wins; losing yours loses. Towers and creeps are children of this node, so
## they draw above the lane.

const TowerScript := preload("res://scripts/tower.gd")
const CreepScript := preload("res://scripts/creep.gd")
const SiegeMinionScript := preload("res://scripts/siege_minion.gd")
const TotemScript := preload("res://scripts/totem.gd")
const Effects := preload("res://scripts/effects.gd")
const PlayLog := preload("res://scripts/play_log.gd")
const Unit := preload("res://scripts/unit.gd")
const Run := preload("res://scripts/run.gd")
const Bounds := preload("res://scripts/bounds.gd")

const BASE_X := 2600.0
const TOWER_X := 2000.0
const LANE_WIDTH := 560.0
const BASE_RADIUS := 300.0
const WAVE_EVERY := 20.0
const FIRST_WAVE := 3.0
const WAVE := ["melee", "melee", "melee", "ranged"]
const BASE_HEAL := 0.2       # fraction of max health and mana per second, in your base
const WELL_BURN := 0.25      # an enemy hero in your base loses this fraction of max health per second
const WELL_TICK := 0.25      # …in hits this many seconds apart
## Death timer (both sides): RESPAWN_BASE s at the start of a round, +RESPAWN_STEP s
## for every RESPAWN_EVERY s the round has run (8 s, then 10 s at 0:30, 12 s at 1:00 …).
const RESPAWN_BASE := 8.0
const RESPAWN_STEP := 2.0
const RESPAWN_EVERY := 30.0

## Round pressure (both sides alike).
##   start           seconds into the round before overtime begins, before
##                   round 1's step (round r: start + start_per_round × r,
##                   capped at start_max → 2:50, 3:10, 3:30 … 5:00)
##   start_per_round / start_max   see start
##   tower_per_min   towers take this much extra damage per minute of
##                   overtime (0.5 = +50% after 1 min, +100% after 2…)
##   melee_every     every this many waves in overtime, waves get +1 melee
##   max_extra       cap on those extra melee creeps per wave
##   shield_drops    true: towers' shields drop for good in overtime; false
##                   (2026-10-06): heroes need one of their creeps (leashed
##                   ones count) in range to hurt a tower, overtime or not
##   ability_haste   abilities cost this much less mana and their cooldowns
##                   run this much shorter (0.25 = −25%), for both heroes
##   haste_ult       …the ultimate too (false: its cooldown runs normally)
##   red_per_min     red's hero gains this much damage and max health per
##                   minute of overtime (0.08 = +8%/min); this round only
##   red_cap         …up to this much (0.6 = +60%)
##   red_round1      share of that ramp in round 1 (keep round 1 easy)
## How much of the round's lane growth towers' damage against creeps follows
## (1.0 = all of it: a wave lasts under a tower about as long in round 10 as in
## round 1, ~14 s for a full wave, so a tower takes a hero plus more than one
## wave. 0 = flat 110, the old late-round melt: one good wave took a tower).
const TOWER_CREEP_SCALE := 1.0
## TOTEMS (totem.gd): from round TOTEM_FROM each side gets TWO on its own half,
## TOTEM_X from the middle and TOTEM_Y off the lane's centre line, one below it
## and one mirrored above (TOTEM_SIDES) — well clear
## of the lane band (±LANE_WIDTH / 2), so lane creeps never wander into its
## ring. The first rises TOTEM_FIRST s into the round; a destroyed one pays its
## reward and rises again TOTEM_RESPAWN s later.
## REWARDS are data: a totem carries {"kind": <type>, ...fields}, and
## TOTEM_REWARDS maps each type to the lane function that pays it (and the
## puff text). To swap the reward, change TOTEM_REWARD (or totem_reward_for,
## to vary it by round, side or card); to add a type, add an entry to
## TOTEM_REWARDS plus its function.
const TOTEM_FROM := 5  # cycle 2 opens (was 6, mid-cycle)
const TOTEM_X := 1000.0
const TOTEM_Y := 560.0
const TOTEM_SIDES := [1.0, -1.0]  # two a side, mirrored across the lane (2026-10-24: the top strip was bare)
const TOTEM_FIRST := 90.0
const TOTEM_RESPAWN := 45.0
const TOTEM_REWARD := {"kind": "siege", "count": 1}  # was 2 — too much (round 8: 6 siege minions did 40% of your tower damage)
const TOTEM_REWARDS := {
	"siege": {"pay": "_reward_siege", "text": "+%d SIEGE"},  # siege minions out with that side's next wave
}
var totems_on := true          # (tests can switch them off)
var _totem_at := [[-1.0, -1.0], [-1.0, -1.0]]  # [team][slot]: when that totem next rises (-1: none due)
const OVERTIME := {"start": 150.0, "start_per_round": 20.0, "start_max": 300.0, "tower_per_min": 0.5, "melee_every": 2, "max_extra": 4, "ability_haste": 0.25, "haste_ult": true, "shield_drops": false,
	"red_per_min": 0.0, "red_cap": 0.6, "red_round1": 0.5}  # rally OFF (2026-10-01): 0.08 to try it again

var effects: Node2D
var hero: Node2D
var bot: Node2D  # the enemy hero, or null
var kills := 0   # times you killed the bot
## Red's strength this round (a run.gd DIFFICULTY row; empty = full strength).
var difficulty := {}
## Each side's wave upgrades (upgrades.gd wave_mods), set by main: [blue, red].
var wave_mods := [{}, {}]
var deaths := 0
## -1 while playing; 0 or 1 once a tower falls (that team won).
var winner := -1
var wave := 0
var next_wave := FIRST_WAVE
## Seconds since the round began.
var elapsed := 0.0
var _t := 0.0
## Overtime: every hero death sends a siege minion with the OTHER side's next
## wave (siege_minion.gd). pending_siege[team] = minions team sends next wave.
var pending_siege := [0, 0]
## Earned by last hits (hero.gd EARN_EVERY): the kinds waiting to join that
## side's next wave. They go in with the other extras, so they're bonus creeps
## — worth no gold to whoever kills them.
var pending_earned := [[], []]
var _was_alive := {}  # hero -> alive last frame (to catch the moment it dies)
var _burn_cd := 0.0


## The base a team spawns at (and marches away from).
static func base_of(team: int) -> Vector2:
	return Vector2(-BASE_X if team == 0 else BASE_X, 0.0)


func _ready() -> void:
	Bounds.active = true  # the football-shaped field: heroes and creeps stay inside
	hero.died.connect(func(_u: Node2D) -> void: deaths += 1)
	if bot:
		bot.died.connect(func(_u: Node2D) -> void: kills += 1)
	for team in 2:
		var tower: Node2D = TowerScript.new(team, Vector2(-TOWER_X if team == 0 else TOWER_X, 0.0))
		tower.name = "Tower%d" % team
		tower.effects = effects
		tower.max_hp = Run.lane_tower_hp()  # both towers grow with the round, the same
		tower.hp = tower.max_hp
		tower.creep_damage_mult = 1.0 + TOWER_CREEP_SCALE * (Run.lane_growth() - 1.0)  # …and shoot creeps harder as their health grows
		if team == 1:  # red's stat dial (even: 1.0) — kept for experiments
			tower.max_hp *= difficulty.get("tower_hp", 1.0)
			tower.hp = tower.max_hp
			tower.damage *= difficulty.get("tower_damage", 1.0)
		tower.died.connect(func(_u: Node2D) -> void:
			if winner < 0:
				winner = 1 - team
				Unit.ability_haste = 0.0)  # (the shop's tooltips show normal costs)
		add_child(tower)


func _process(delta: float) -> void:
	_t += delta
	if winner < 0:
		elapsed += delta
		Unit.no_gold = elapsed >= overtime_start()
		Unit.ability_haste = float(OVERTIME["ability_haste"]) if Unit.no_gold else 0.0
		Unit.haste_ult = bool(OVERTIME["haste_ult"])
		for h: Node2D in get_tree().get_nodes_in_group("heroes"):
			var alive: bool = h.is_targetable()
			if _was_alive.get(h, true) and not alive and elapsed >= overtime_start():
				pending_siege[1 - h.team] += 1  # a death in overtime: the other side sends a siege minion
			_was_alive[h] = alive
		var weak := tower_vulnerability()
		for team in 2:
			var t := tower(team)
			if t:
				t.vulnerability = weak
				t.doors_open = bool(OVERTIME["shield_drops"]) and elapsed >= overtime_start()  # (off: heroes always need a creep, leashed ones count)
		_tick_totems()
		if bot:
			bot.set_rally(red_rally())
		next_wave -= delta
		if next_wave <= 0.0:
			next_wave += WAVE_EVERY
			spawn_wave()
	_burn_cd -= delta
	var burn := _burn_cd <= 0.0
	if burn:
		_burn_cd += WELL_TICK
	var respawn := respawn_seconds()
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		h.respawn_time = respawn
		h.in_well = h.is_targetable() and in_well(h.position, h.team)
		if h.in_well:
			h.hp = minf(h.max_hp, h.hp + h.max_hp * BASE_HEAL * delta)
			h.mana = minf(h.max_mana, h.mana + h.max_mana * BASE_HEAL * delta)
		elif burn and h.is_targetable() and in_well(h.position, 1 - h.team):  # no camping the enemy's well
			h.take_damage(h.max_hp * WELL_BURN * WELL_TICK, Unit.TEAM_COLORS[1 - h.team])
	queue_redraw()


func _exit_tree() -> void:
	Bounds.active = false
	Unit.no_gold = false  # never leak into Training or the next round's start
	Unit.ability_haste = 0.0


## Is `p` inside `team`'s well (its base circle)?
static func in_well(p: Vector2, team: int) -> bool:
	return p.distance_to(base_of(team)) < BASE_RADIUS


## One wave from each base: melee in a line across the lane, ranged behind.
func spawn_wave() -> void:
	wave += 1
	var sent := [{}, {}]  # for the play log: what each side sends this wave
	for team in 2:
		var home := base_of(team)
		var forward := -signf(home.x)  # toward the enemy
		var goal := Vector2(TOWER_X if team == 0 else -TOWER_X, 0.0)  # the enemy tower: never on into the well
		var kinds: Array = WAVE.duplicate()
		var late: int = Run.red_extra_melee() if team == 1 else 0  # red's late-round extra creeps
		for i in extra_melee() + int(wave_mods[team].get("extra_melee", 0)) + late:  # overtime + Reinforcement + late
			kinds.push_front("melee")
		for i in int(wave_mods[team].get("tank", 0)):  # Tank Minion leads
			kinds.push_front("tank")
		var earned: Array = pending_earned[team]  # earned by last hits (hero.gd)
		for kind: String in earned:
			kinds.push_front(kind)
		pending_earned[team] = []
		# bonus creeps (pushed to the front above: Tank Minion, Reinforcement,
		# red's late extras, overtime's extras) are worth no gold — buying more
		# creeps mustn't feed the other side's farm
		var bonus_left: int = kinds.size() - WAVE.size()
		sent[team] = {"creeps": kinds.size(), "bonus": bonus_left, "tanks": kinds.count("tank"),
			"overtime_extra": extra_melee(), "reinforcement": int(wave_mods[team].get("extra_melee", 0)), "late": late,
			"siege": int(pending_siege[team]), "earned": earned}
		var melee := kinds.count("melee")
		var m := 0
		var w: Dictionary = wave_mods[team]
		for i in pending_siege[team]:  # siege minions earned by enemy deaths go out with this wave
			var sm: Node2D = SiegeMinionScript.new()
			sm.team = team
			sm.effects = effects
			sm.target = tower(1 - team)
			sm.speed_bonus = float(w.get("wave_speed", 0.0))  # Pathfinders
			sm.position = home + Vector2(forward * 120.0, (i - (pending_siege[team] - 1) / 2.0) * 44.0)
			add_child(sm)
		pending_siege[team] = 0
		var sapper_left := 1 if float(w.get("sapper", 0.0)) > 0.0 else 0  # Sappers: one ranged creep a wave
		var banner_left := 1 if float(w.get("banner", 0.0)) > 0.0 else 0   # Standard Bearer: one melee creep a wave
		for kind: String in kinds:
			var at: Vector2
			if kind == "tank":
				at = home + Vector2(forward * 170.0, 0.0)  # out in front
			elif kind == "melee":
				at = home + Vector2(forward * 90.0, (m - (melee - 1) / 2.0) * 55.0)
				m += 1
			else:
				at = home + Vector2(randf_range(-20, 20), randf_range(-40, 40))
			var creep: Node2D = CreepScript.new(team, kind, at, Vector2(goal.x, at.y))
			creep.effects = effects
			if bonus_left > 0:
				bonus_left -= 1
				creep.bonus = true
				creep.bounty = 0
			creep.siege = wave_mods[team].get("siege", 0.0)  # Siege Training
			creep.speed_bonus = float(w.get("wave_speed", 0.0))  # Pathfinders
			creep.vanguard = float(w.get("vanguard", 0.0))  # Vanguard
			if kind == "ranged" and sapper_left > 0:
				sapper_left -= 1
				creep.sapper = float(w["sapper"])
			if kind == "melee" and banner_left > 0 and m == (melee + 1) / 2:  # the middle of the front line
				banner_left -= 1
				creep.banner = float(w["banner"])
			if kind == "ranged" and wave_mods[team].get("heal_aura", 0.0) > 0.0:  # Healing Aura
				creep.heal_aura = wave_mods[team]["heal_aura"]
				creep.heal_radius = wave_mods[team]["heal_radius"]
			creep.max_hp *= Run.lane_creep_hp()  # both sides' creeps grow with the round, the same
			creep.hp = creep.max_hp
			if team == 1:  # red's stat dial (even: 1.0) — kept for experiments
				var p: float = difficulty.get("creeps", 1.0)
				creep.max_hp *= p
				creep.hp = creep.max_hp
				creep.power = p
			add_child(creep)


## How long a death keeps a hero out right now: grows as the round goes on.
	PlayLog.wave({"n": wave, "blue": sent[0], "red": sent[1], "overtime": elapsed >= overtime_start(),
		"tower_mult": snappedf(tower_vulnerability(), 0.01)})


func respawn_seconds() -> float:
	return RESPAWN_BASE + RESPAWN_STEP * floorf(elapsed / RESPAWN_EVERY)


## Seconds of overtime so far (0 before it starts).
func overtime() -> float:
	return maxf(0.0, elapsed - overtime_start())


## Seconds into this round when overtime begins (later in later rounds).
func overtime_start() -> float:
	return minf(float(OVERTIME["start_max"]), float(OVERTIME["start"]) + float(OVERTIME["start_per_round"]) * maxi(1, Run.round_num))


## How much damage towers take right now (1 = normal).
func tower_vulnerability() -> float:
	return 1.0 + overtime() / 60.0 * float(OVERTIME["tower_per_min"])


## Red's hero's overtime rally right now (0.16 = +16% damage and health).
func red_rally() -> float:
	var r: float = minf(float(OVERTIME["red_cap"]), overtime() / 60.0 * float(OVERTIME["red_per_min"]))
	return r * float(OVERTIME["red_round1"]) if Run.round_num <= 1 else r


## A hero earned an extra creep with its last hits (hero.gd `_earn_minion`):
## it joins that side's next wave.
func earn_creep(team: int, kind: String) -> void:
	pending_earned[team].append(kind)


## Extra melee creeps per wave right now.
func extra_melee() -> int:
	if elapsed < overtime_start():
		return 0
	var waves_in := int(overtime() / WAVE_EVERY)  # waves sent since overtime began
	return mini(1 + waves_in / int(OVERTIME["melee_every"]), int(OVERTIME["max_extra"]))


## Totems: all four at TOTEM_FIRST s (from round TOTEM_FROM), then each again
## TOTEM_RESPAWN s after it falls — every one on its own timer.
func _tick_totems() -> void:
	if not totems_on or Run.round_num < TOTEM_FROM:
		return
	for team in 2:
		for slot in TOTEM_SIDES.size():
			if totem_at(team, slot) != null:
				continue
			if _totem_at[team][slot] < 0.0:
				_totem_at[team][slot] = TOTEM_FIRST
			if elapsed < _totem_at[team][slot]:
				continue
			_totem_at[team][slot] = INF  # (set again when it falls)
			var at := Vector2(-TOTEM_X if team == 0 else TOTEM_X, TOTEM_Y * float(TOTEM_SIDES[slot]))
			var t: Node2D = TotemScript.new(team, at)
			t.name = "Totem%d_%d" % [team, slot]
			t.reward = totem_reward_for(team)
			t.effects = effects
			t.died.connect(func(_u: Node2D) -> void:
				var text := _pay_totem_reward(team, t.reward)
				_totem_at[team][slot] = elapsed + TOTEM_RESPAWN
				if text != "":
					effects.add_child(Effects.ShieldPuff.new(t.position + Vector2(0, -80), Unit.TEAM_COLORS[team], text))
				PlayLog.event("totem_down", {"team": team, "slot": slot, "reward": t.reward})
				t.queue_free())
			add_child(t)
			PlayLog.event("totem_up", {"team": team, "slot": slot})


## The reward a new totem of `team`'s carries. One place to vary it (by round,
## side, a card…); today every totem pays TOTEM_REWARD.
func totem_reward_for(_team: int) -> Dictionary:
	return TOTEM_REWARD.duplicate()


## Pays a destroyed totem's reward to `team`; returns the puff text ("" = none).
func _pay_totem_reward(team: int, reward: Dictionary) -> String:
	var entry: Dictionary = TOTEM_REWARDS.get(str(reward.get("kind", "")), {})
	if entry.is_empty():
		push_warning("lane.gd: unknown totem reward %s" % str(reward))
		return ""
	call(entry["pay"], team, reward)
	var text: String = entry.get("text", "")
	return text % int(reward.get("count", 1)) if "%d" in text else text


## "siege": `count` siege minions go out with `team`'s next wave.
func _reward_siege(team: int, reward: Dictionary) -> void:
	pending_siege[team] += int(reward.get("count", 1))


func totem_at(team: int, slot: int) -> Node2D:
	var t := get_node_or_null("Totem%d_%d" % [team, slot])
	return t if t != null and not t.is_queued_for_deletion() and t.is_targetable() else null


## All of `team`'s living totems.
func totems_of(team: int) -> Array:
	var out: Array = []
	for slot in TOTEM_SIDES.size():
		var t := totem_at(team, slot)
		if t != null:
			out.append(t)
	return out


## One of `team`'s: the one nearest `near`, or any of them when it isn't given.
func totem(team: int, near := Vector2.INF) -> Node2D:
	var best: Node2D = null
	for t: Node2D in totems_of(team):
		if best == null or (near != Vector2.INF and near.distance_to(t.position) < near.distance_to(best.position)):
			best = t
	return best


## Siege minions headed for `team`'s tower: walking now, plus waiting for the next wave.
func siege_incoming(team: int) -> int:
	var t := tower(team)
	var n: int = pending_siege[1 - team]
	for m: Node2D in get_tree().get_nodes_in_group("siege_minions"):
		if m.target == t:
			n += 1
	return n


func tower(team: int) -> Node2D:
	return get_node_or_null("Tower%d" % team)


func _draw() -> void:
	# the field (bounds.gd): a long football closing into the wells, a darker
	# rim, the lane band down the middle and a dashed centre line
	var field := Bounds.outline()
	draw_colored_polygon(field, Color("#222a29"))
	var length := Bounds.half_length() * 2.0
	var lane := Rect2(-length / 2.0, -LANE_WIDTH / 2.0, length, LANE_WIDTH)
	var band := PackedVector2Array([lane.position, Vector2(lane.end.x, lane.position.y), lane.end, Vector2(lane.position.x, lane.end.y)])
	for piece: PackedVector2Array in Geometry2D.intersect_polygons(band, field):  # the band, cut to the field's shape
		draw_colored_polygon(piece, Color("#27302f"))
	var rim := field.duplicate()
	rim.append(field[0])
	draw_polyline(rim, Color("#4a5c58"), 5.0)
	var x := lane.position.x + 40.0
	while x < lane.end.x - 40.0:
		draw_line(Vector2(x, 0), Vector2(x + 50.0, 0), Color(1, 1, 1, 0.05), 4.0)
		x += 110.0
	# the bases: team-coloured pads that pulse gently
	for team in 2:
		var c: Color = Unit.TEAM_COLORS[team]
		var at := base_of(team)
		var pulse := 0.5 + 0.5 * sin(_t * 2.0 + team * PI)
		draw_circle(at, BASE_RADIUS, Color(c, 0.10 + 0.04 * pulse))
		draw_arc(at, BASE_RADIUS, 0.0, TAU, 96, Color(c, 0.6), 4.0)
		draw_arc(at, BASE_RADIUS * 0.72, 0.0, TAU, 96, Color(c, 0.25), 2.0)
		draw_circle(at, 26.0, Color(c, 0.5 + 0.3 * pulse))
	if bot and bot.is_targetable() and bot.rally > 0.0:  # red's rally: a red glow that grows with it
		var g: float = bot.rally / float(OVERTIME["red_cap"])
		var p := 0.5 + 0.5 * sin(_t * 4.0)
		draw_circle(bot.position, bot.radius + 14.0 + 10.0 * g, Color(Unit.TEAM_COLORS[1], 0.12 + 0.3 * g + 0.08 * p))
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):  # safe in its well: a shield ring
		if h.in_well:
			draw_arc(h.position, h.radius + 12.0, 0.0, TAU, 32, Color(Unit.TEAM_COLORS[h.team].lightened(0.5), 0.8), 3.0)
