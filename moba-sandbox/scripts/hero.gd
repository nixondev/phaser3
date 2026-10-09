extends "res://scripts/unit.gd"
## The hero you steer like a MOBA. Which hero it is (shape, stats, attack,
## abilities) comes from heroes.gd; 1–4 switch.
##
##   Right-click        FORCE MOVE there (hold to keep steering): never
##                      attacks, even on an enemy; cancels any attack
##   Left-click         attack the enemy closest to the CLICK (Heroes of the
##                      Storm A-click); none near it → attack-move there,
##                      taking whatever comes within reach, closest to the
##                      click first
##   S                  stop (also stops attacking)
##   Q W E R (hold)     aim — shows range and a targeting preview
##     release          cast at the cursor
##     left-click       cast now (while aiming)
##     right-click      cancel the aim
##   1 2 3 4            switch hero (resets mana and cooldowns)
##
## Abilities cost mana; one you can't afford can't be aimed (the mana bar
## flashes instead). Casting doesn't stop movement (Heroes of the Storm
## style), except dashes and blinks, which move you.
##
## Collision (unit.gd push_out): towers and dummies are solid, creeps shove.
## Walking into something slides you around it; a dash stops at the first
## enemy it hits (still damaging it); a blink never leaves you inside one.
##
## Health: creeps and towers hurt you (red numbers). At 0 you drop out for
## RESPAWN seconds and come back at `spawn` with full health and mana.

const Targets := preload("res://scripts/targets.gd")
const Heroes := preload("res://scripts/heroes.gd")
const AbilityInfo := preload("res://scripts/ability_info.gd")
const Upgrades := preload("res://scripts/upgrades.gd")
const PlayLog := preload("res://scripts/play_log.gd")
const Unit := preload("res://scripts/unit.gd")
const Run := preload("res://scripts/run.gd")
const DecoyScript := preload("res://scripts/decoy.gd")
const CreepScript := preload("res://scripts/creep.gd")

const RIM := Color("#263238")
const SLOT_ORDER := ["Q", "W", "E", "R"]
const KEYS := {KEY_Q: "Q", KEY_W: "W", KEY_E: "E", KEY_R: "R"}
const ACQUIRE_RANGE := 520.0   # attack-move picks up enemies this close to the hero
const CLICK_PICK := 450.0      # left-click targets the enemy closest to the click within this
const RESPAWN := 6.0
const HP_REGEN := 2.0          # per second, always
const HURT := Color("#ff5252") # damage numbers on the hero
const HERO_BOUNTY := 120       # gold for killing a hero in round 1 (× lane growth after)
const DEATH_GOLD_LOSS := 0.15  # share of carried gold lost on death — to the killer if it's a hero
const DEATH_GOLD_CAP := 300    # …but never more than this per death
const LEASH_POINTS := 2        # leash capacity before upgrades

var facing := Vector2.RIGHT
## Driven by bot.gd instead of the mouse: no input, no click markers.
var is_bot := false
## Seconds left marked as having hit an enemy hero (see unit.gd HERO_AGGRO).
var hero_aggro := 0.0
## Measured each frame — bots lead their skillshots with it.
var velocity := Vector2.ZERO
## Gold earned from killing blows, and how many of those were creeps.
var gold := 0
var last_hits := 0
var denies := 0
## Upgrade ids owned (upgrades.gd) and their summed mods — read via mod().
var upgrade_ids: Array = []
var mods := {}
## The hero from heroes.gd to start as; 1–4 switching only when allowed
## (not during a run).
var start_index := 0
var can_switch := true
## Ability level per letter (heroes.gd `levels`); `abilities` holds each
## slot's ability at its level.
var ability_levels := {"Q": 1, "W": 1, "E": 1, "R": 1}
## Training's "No cooldowns" switch (main sets it; never on in a run).
var no_cooldowns := false
## Training's "No mana" switch: mana stays full (main sets it; never on in a run).
var no_mana := false
## Balance experiment (off in the game): Overcharge keeps its cooldown cut
## but loses its +30% ultimate damage. Set by tools/autoplay.gd --variant fixes.
static var ult_damage_off := false
## Difficulty scaling (the enemy bot's per-round strength; 1 for you).
var hp_mult := 1.0
var damage_mult := 1.0
var _last_pos := Vector2.ZERO
## The ability key being held to aim ("" = none).
var aiming := ""
## Seconds until each ability is ready again.
var cooldowns := {"Q": 0.0, "W": 0.0, "E": 0.0, "R": 0.0}
## Charges (abilities with "charges" > 1, e.g. TRAP II–III): uses stored
## right now, and each slot's refill timer. A spent charge starts the refill
## (the ability's cooldown); a full refill adds one and starts the next. Between
## uses there's CHARGE_GAP; with none left the slot waits for the refill.
var charges := {"Q": 1, "W": 1, "E": 1, "R": 1}
var recharge := {"Q": 0.0, "W": 0.0, "E": 0.0, "R": 0.0}
var _recharge_len := {"Q": 0.0, "W": 0.0, "E": 0.0, "R": 0.0}
const CHARGE_GAP := 0.5

## The current hero (an entry of heroes.gd LIST) and its stats.
var hero_index := 0
var def: Dictionary
var abilities: Dictionary
var speed := 360.0
var mana := 0.0
var max_mana := 0.0
## Counts down after a cast you couldn't afford — the HUD flashes the bar.
var no_mana_flash := 0.0

## The enemy being auto-attacked, or null. Its instance id is kept too: a
## freed creep compares equal to null, so the id is how we notice it died.
var attack_target: Node2D = null:
	set(v):
		attack_target = v
		_attack_id = v.get_instance_id() if v else 0
var _attack_id := 0
## Where you (re)spawn; seconds left until respawning while dead.
var spawn := Vector2.ZERO
var respawn_in := 0.0
## How long a death keeps you out right now (lane.gd updates it as the round
## goes on; Training keeps RESPAWN).
var respawn_time := RESPAWN
## Standing in your own well (lane mode; lane.gd sets it each frame): no damage.
var in_well := false

var _target: Variant = null  # move destination, or null
var _steering := false       # right mouse held: keep updating the destination
var _dashing := false
## SHADE's windup: planted (no moving, no attacks) for `_plant_left` s, then the
## beam in `_pending_beam` fires. A stun, a blink or dying cancels it.
var _plant_left := 0.0
var _pending_beam := {}
var _echo_beam_ok := false  # the last SHADE actually fired (Echo's beam follows only then)
var _attack_move: Variant = null  # attack-move destination, or null
var _attack_cd := 0.0
var _slide_side := 0.0  # while blocked: which way round the obstacle (±1), kept until clear
## Bots: a waypoint round a wall of enemy creeps that's in the way (null = none).
## Set when it bumps into the cluster; cleared when reached or the target moves.
var _detour: Variant = null
## GRIND in progress: no auto-attacks while spinning; the body grows from
## spin_grow[0] to [1] times its size and spins (its corners cut — Effects.Spin).
var spin_left := 0.0
var spin_time := 0.0
var spin_grow := Vector2(1.0, 1.0)
var _spin_fx: Array = []  # the GRIND in progress, plus Echo's extra spin (a dash cuts them short: _end_spin)
var _queued_spin := {}  # a GRIND cast mid-SHOVE: starts when the charge ends
## RAGE in progress (KAREN): bigger, burning on contact, takes less damage.
var rage_left := 0.0
var _rage := {}
var _rage_tick := 0.0
var _rage_radius := 0.0  # radius before it swelled
var _rage_stunned := {}  # enemy id → when it can be mini-stunned again
var _clock_rage := 0.0
var _detour_for := Vector2.ZERO  # the target it was made for
## Leashing (T on one of your creeps; with the cast indicator on, T then click): `leashing` is the pick mode;
## `leashed` the creeps following you. Capacity in leash points: LEASH_POINTS
## plus the Command card; a melee creep costs 1, ranged / tank 2.
var leashing := false
var leashed: Array = []
var leash_flash := 0.0
## Recast abilities in flight (slot -> the Orb): pressing the key again
## detonates instead of aiming.
var recast := {}
## Card state: Spellblade's charged next attack; Second Wind's and
## Aftershock's cooldowns; Afterimage's decoy (enemies lose you while it's up).
var _spellblade_ready := false
var _spellblade_shot: Node2D = null  # the charged shot in flight (only one at a time)
var _volley := 0  # counts rounds of attacks (Twin Shot's two shots are one round)
var _second_wind_cd := 0.0
var _aftershock_cd := 0.0
var decoy: Node2D = null
const SECOND_WIND_EVERY := 40.0
const SECOND_WIND_BELOW := 0.3
const AFTERSHOCK_RADIUS := 200.0
const AFTERSHOCK_EVERY := 1.0
const HOME_RANGE := 650.0  # Homeguard: "near your tower" = inside its range circle (centre to your edge, like tower.gd RANGE)


func _ready() -> void:
	add_to_group("heroes")
	loud = not is_bot
	bounty = roundi(HERO_BOUNTY * Run.lane_growth())  # a kill is worth more as the run goes on (Training: round 1's)
	position = spawn
	_last_pos = spawn
	set_hero(start_index)


## A waypoint round the cluster of enemy creeps around `blocker` (everyone
## within 160 px of it, chained): past whichever end of the wall is nearer,
## level with the cluster, then on to the target.
func _route_round(blocker: Node2D) -> Vector2:
	var heading := ((_target as Vector2) - position).normalized()
	var across := heading.orthogonal()
	var cluster: Array = [blocker]
	var i := 0
	while i < cluster.size():  # grow the cluster: enemy creeps touching it
		for c: Node2D in get_tree().get_nodes_in_group("creeps"):
			if c.team != team and c.is_targetable() and not cluster.has(c) and c.position.distance_to(cluster[i].position) < 160.0:
				cluster.append(c)
		i += 1
	var best := Vector2.ZERO
	var best_d := INF
	for side: float in [1.0, -1.0]:
		var reach := 0.0
		var ahead := 0.0
		for c: Node2D in cluster:
			var off: Vector2 = c.position - position
			reach = maxf(reach, off.dot(across * side) + c.radius)
			ahead = maxf(ahead, off.dot(heading))
		var p := position + across * side * (reach + radius + 18.0) + heading * ahead
		if Bounds.active:
			p = Bounds.clamp_point(p, radius)
		var d := position.distance_to(p) + p.distance_to(_target)
		if d < best_d:
			best_d = d
			best = p
	return best


## Become hero `i` from heroes.gd — full health and mana, abilities ready.
func set_hero(i: int) -> void:
	if not is_targetable() and not def.is_empty():
		return  # dead: wait for the respawn
	hero_index = i
	rage_left = 0.0  # a new body: no swollen RAGE radius carried over
	_rage_radius = 0.0
	damage_taken_mult = 1.0
	spin_left = 0.0
	def = Heroes.bot_version(i) if is_bot else Heroes.LIST[i]  # the bot may have its own numbers
	abilities = {}
	for slot: String in SLOT_ORDER:
		abilities[slot] = Heroes.ability_at(def, slot, ability_levels[slot])
	mods = Upgrades.stacked(upgrade_ids)
	radius = def["radius"] * (1.0 + mod("size"))
	speed = def["speed"] + mod("speed")
	max_mana = def["mana"] + mod("max_mana")
	mana = max_mana
	max_hp = (def["hp"] + mod("max_hp")) * maxf(0.2, 1.0 + mod("max_hp_pct")) * hp_mult  # (Glass Cannon can't zero it)
	hp = max_hp
	no_mana_flash = 0.0
	for k: String in recast.keys():  # a dot left out by the previous hero fizzles
		if has_recast(k):
			recast[k]._finish()
	recast.clear()
	for k: String in cooldowns:
		cooldowns[k] = 0.0
		charges[k] = max_charges(k)
		recharge[k] = 0.0
	aiming = ""
	_stop_attacking()
	effects.add_child(Effects.Ghost.new(position, radius * 1.6, def["color"]))


func _process(delta: float) -> void:
	tick_unit(delta)
	hero_aggro = maxf(0.0, hero_aggro - delta)
	for k: String in cooldowns:  # cooldowns and charges keep running while dead
		var cd_delta := delta
		if Unit.ability_haste > 0.0 and (k != "R" or Unit.haste_ult):  # overtime: cooldowns run shorter
			cd_delta = delta / (1.0 - Unit.ability_haste)
		cooldowns[k] = 0.0 if no_cooldowns else maxf(0.0, cooldowns[k] - cd_delta)
		if no_cooldowns:
			charges[k] = max_charges(k)
			recharge[k] = 0.0
		elif recharge[k] > 0.0:
			recharge[k] -= cd_delta
			if recharge[k] <= 0.0:  # a charge back; keep refilling until full
				charges[k] = mini(charges[k] + 1, max_charges(k))
				recharge[k] = _recharge_len[k] if charges[k] < max_charges(k) else 0.0
	_second_wind_cd = maxf(0.0, _second_wind_cd - delta)
	_aftershock_cd = maxf(0.0, _aftershock_cd - delta)
	if not is_targetable():
		respawn_in -= delta
		if respawn_in <= 0.0:
			_respawn()
		return
	var home := _near_home()
	hp = minf(max_hp, hp + (HP_REGEN + mod("hp_regen") + (mod("home_regen") if home else 0.0)) * delta)
	mana = max_mana if no_mana else minf(max_mana, mana + (def["regen"] + mod("mana_regen")) * delta)
	no_mana_flash = maxf(0.0, no_mana_flash - delta)
	leash_flash = maxf(0.0, leash_flash - delta)
	leashed = leashed.filter(func(c: Variant) -> bool: return is_instance_valid(c) and c.leader == self)
	_attack_cd = maxf(0.0, _attack_cd - delta)
	spin_left = maxf(0.0, spin_left - delta)
	if rage_left > 0.0:
		_tick_rage(delta)
	if not _queued_spin.is_empty() and not _dashing and is_targetable():  # GRIND after SHOVE
		var q := _queued_spin
		_queued_spin = {}
		_cast_effects(q["a"], position + facing, q["dmg"])
	if _plant_left > 0.0:
		_plant_left -= delta
		if is_stunned():
			_cancel_plant()  # stunned while aiming: the beam is lost
		elif _plant_left <= 0.0:
			_fire_beam()
		queue_redraw()
	if is_stunned():  # frozen: orders wait until it wears off
		push_out()
		queue_redraw()
		return
	if _steering and not _dashing:
		_target = _reachable(get_global_mouse_position())
	if not _dashing and _plant_left <= 0.0:
		_update_attack()
	if _detour != null and (_target == null or (_target as Vector2).distance_to(_detour_for) > 80.0 \
			or position.distance_to(_detour) < 20.0):
		_detour = null  # reached it, or it's heading somewhere else now
	if _target != null and not _dashing and _plant_left <= 0.0:
		var goal: Vector2 = _detour if _detour != null else _target
		var to: Vector2 = goal - position
		var step := speed * move_speed_mult() * delta
		if to.length() <= step and _detour != null:
			position = goal
			_detour = null
		elif to.length() <= step:
			position = _target
			_target = null
		else:
			facing = to.normalized()
			var before := position
			position += facing * step
			var blocker := push_out()
			# Blocked: walk round the obstacle along its edge. Pick a side once
			# (the one that turns you towards the destination; right if dead
			# ahead) and keep it until clear, so you don't jitter in place.
			if blocker and position.distance_to(before) < step * 0.6 and is_bot and _detour == null \
					and blocker.is_in_group("creeps") and blocker.team != team:
				_detour = _route_round(blocker)  # a wall of enemy creeps: go round the end of it
				_detour_for = _target
			elif blocker and position.distance_to(before) < step * 0.6:
				var tangent := (position - blocker.position).normalized().orthogonal()
				if _slide_side == 0.0:
					var side := signf(tangent.dot(_target - position))
					_slide_side = side if absf(tangent.dot((_target - position).normalized())) > 0.05 else 1.0
				position += tangent * _slide_side * step
				push_out()
			else:
				_slide_side = 0.0
	push_out()
	var half := 3000.0 - radius  # keep inside the map
	position = position.clamp(Vector2(-half, -half), Vector2(half, half))
	velocity = ((position - _last_pos) / maxf(delta, 0.0001)).limit_length(speed * 1.5)  # (a blink / respawn jump isn't a speed: bots lead their aim by this)
	_last_pos = position
	queue_redraw()


func _unhandled_input(event: InputEvent) -> void:
	if not is_targetable():
		return  # dead
	var mb := event as InputEventMouseButton
	if mb:
		if leashing and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			leashing = false  # T then click: leash / release the creep under the cursor
			var c := _own_creep_at(get_global_mouse_position())
			if c:
				toggle_leash(c)
			return
		if leashing and mb.pressed and mb.button_index == MOUSE_BUTTON_RIGHT:
			leashing = false  # right-click cancels
			return
		if mb.button_index == MOUSE_BUTTON_RIGHT:
			if mb.pressed and aiming != "":
				aiming = ""  # right-click cancels the aim
			elif mb.pressed:
				order_move(get_global_mouse_position())
				_steering = true
			else:
				_steering = false
		elif mb.button_index == MOUSE_BUTTON_LEFT and mb.pressed:
			if aiming != "":
				cast(aiming, get_global_mouse_position())
			else:
				order_attack(get_global_mouse_position())
		return
	var key := event as InputEventKey
	if key == null or key.echo:
		return
	var code := key.physical_keycode
	if code == KEY_T and key.pressed:
		aiming = ""
		if cast_indicator():
			leashing = not leashing  # with the cast indicator on: T, then click a creep (T again cancels)
		else:
			var c := _own_creep_at(get_global_mouse_position())  # quick cast: leash / release the creep under the cursor
			if c:
				toggle_leash(c)
		return
	if code == KEY_S and key.pressed:
		_target = null
		_steering = false
		_stop_attacking()
	elif code >= KEY_1 and code <= KEY_4 and key.pressed:
		if can_switch and code - KEY_1 < Heroes.LIST.size():
			set_hero(code - KEY_1)
	elif KEYS.has(code):
		var slot: String = KEYS[code]
		if key.pressed and (has_recast(slot) or can_untether(slot)):
			cast(slot, get_global_mouse_position())  # the second press: detonate / untether, no aiming
		elif key.pressed:
			if not can_afford(slot) and is_ready(slot):
				no_mana_flash = 0.6
			elif is_ready(slot):
				if cast_indicator():
					aiming = slot  # quick cast with indicator: aim while held, cast on release
				else:
					cast(slot, get_global_mouse_position())  # quick cast: fire at the cursor on key-down
		elif aiming == slot:
			cast(slot, get_global_mouse_position())


## Casting mode (a setting, Esc menu): off = quick cast (an ability fires at
## the cursor the moment its key goes down — the default); on = quick cast with
## indicator (hold to see the aim preview, release to cast). Saved in Run.settings.
static var _cast_indicator := -1  # -1 = not loaded yet


static func cast_indicator() -> bool:
	if _cast_indicator < 0:
		var c := ConfigFile.new()
		_cast_indicator = 1 if c.load(Run.settings) == OK and bool(c.get_value("input", "cast_indicator", false)) else 0
	return _cast_indicator == 1


static func set_cast_indicator(on: bool) -> void:
	_cast_indicator = 1 if on else 0
	var c := ConfigFile.new()
	c.load(Run.settings)
	c.set_value("input", "cast_indicator", on)
	c.save(Run.settings)


## An upgrade stat (0 when you don't have it). See upgrades.gd for the keys.
func mod(key: String) -> float:
	return mods.get(key, 0.0)


func attack_damage() -> float:
	return (def["attack"]["damage"] + mod("attack_damage")) * (1.0 + mod("attack_damage_pct")) * damage_mult


func attack_range() -> float:
	return def["attack"]["range"] + mod("attack_range")


func attack_interval() -> float:
	var spd := mod("attack_speed") + (mod("home_attack_speed") if _near_home() else 0.0)
	return def["attack"]["interval"] * (1.0 + mod("attack_interval_pct")) / (1.0 + spd) * attack_time_mult()


## Homeguard: inside your own tower's range circle?
func _near_home() -> bool:
	if mod("home_attack_speed") <= 0.0 and mod("home_regen") <= 0.0:
		return false
	for t: Node2D in get_tree().get_nodes_in_group("towers"):
		if t.team == team and t.is_targetable() and position.distance_to(t.position) - radius <= HOME_RANGE:
			return true
	return false


## An ability's mana cost for you right now (Overclock raises it).
func ability_cost(slot: String) -> float:
	return float(abilities[slot]["cost"]) * (1.0 + mod("mana_cost")) * (1.0 - Unit.ability_haste)  # Overclock; overtime


## The play log: your casts, or red's (with where it aimed and how far you were).
func _log_cast(slot: String, a: Dictionary, point: Vector2) -> void:
	if not is_bot:
		PlayLog.cast(slot, a, point)
	elif PlayLog.recording():
		var foe: Variant = get("enemy_hero")
		var d: int = roundi(position.distance_to(foe.position)) if foe != null and is_instance_valid(foe) and foe.is_targetable() else -1
		PlayLog.event("red_cast", {"slot": slot, "ability": a.get("name", ""), "at": [roundi(point.x), roundi(point.y)], "you_dist": d, "mana": roundi(mana)})
		if has_method("track_cast"):
			call("track_cast", str(a.get("name", "")), slot)  # bot.gd: did it hit?


## Afterimage: enemies have lost track of you while your decoy is up.
func hidden_by_decoy() -> bool:
	return is_instance_valid(decoy) and decoy.is_targetable()


## On-hit cards, when one of your attacks lands on `target` for `dmg`:
## Clean Finish, the tower bonus, Hunter's Mark (spends the mark).
func attack_damage_vs(target: Node2D, dmg: float) -> float:
	if target.is_in_group("creeps") and target.hp < target.max_hp * 0.5:
		dmg *= 1.0 + mod("finish_damage")
	if target.is_in_group("towers"):
		dmg *= 1.0 + mod("tower_attack")
	if mod("hunters_mark") > 0.0 and target.has_method("marked_by") and target.marked_by(self):
		dmg += (target.max_hp - target.hp) * mod("hunters_mark")
		target.clear_mark()
	return dmg


## After one of your attacks lands: Serrated makes heroes bleed; a charged
## Spellblade shot spends the charge; KYLE's attacks stoke his burn on it.
func on_attack_landed(target: Node2D, charged := false) -> void:
	if charged:
		_spellblade_ready = false
		_spellblade_shot = null
	if mod("serrated") > 0.0 and target.is_in_group("heroes") and target.is_targetable():
		target.bleed(self, mod("serrated"), 2.0)
	if def["attack"].get("stoke", false) and is_instance_valid(target) and target.has_method("stoke_burn"):
		target.stoke_burn(self)  # KYLE: each hit restarts your burn on them at its full length


## Aftershock: you (or your Tank Minion) stunned `victim` — a shockwave there.
func on_stunned(victim: Node2D) -> void:
	if mod("aftershock") <= 0.0 or _aftershock_cd > 0.0 or not is_instance_valid(victim) or not is_targetable():
		return
	_aftershock_cd = AFTERSHOCK_EVERY
	var nova := Effects.Nova.new(victim.position, AFTERSHOCK_RADIUS, Color("#fff176"), mod("aftershock") * damage_mult)
	nova.team = team
	nova.source = self
	nova.hit = {"aoe": true, "heroes": Unit.ABILITY_VS_HEROES, "creeps": Unit.ABILITY_VS_CREEPS, "structures": Unit.ABILITY_VS_STRUCTURES}
	effects.add_child(nova)


## BOOP's ring has reached `u` (Effects.Boop carries it out): enemies take
## `dmg`, tethers snap, and Afterimage fires if it's you being carried.
func _booped(u: Node2D, a: Dictionary, dmg: float) -> void:
	if u == self and mod("afterimage") > 0.0:
		_leave_decoy()  # booping yourself away counts as a getaway
	if u.is_tethered():
		u.break_tether()  # (POUNCE's hold snaps)
	if u.team != team and dmg > 0.0 and is_instance_valid(self):
		u.take_damage(dmg, a["color"], false, false, self, ability_hit(a))


## Afterimage: leave a decoy here (before a dash or blink moves you).
func _leave_decoy() -> void:
	if mod("afterimage") <= 0.0:
		return
	if is_instance_valid(decoy):
		decoy.queue_free()
	var d: Node2D = DecoyScript.new()
	d.team = team
	d.effects = effects
	d.position = position
	d.radius = radius
	d.life = mod("afterimage")
	d.points = shape_points(def.get("shape", "circle"), radius, facing)
	d.slot = "hero_" + str(def.get("shape", "circle"))
	d.facing = facing
	d.colour = def["color"]
	effects.add_child(d)
	decoy = d


## A round starts with the ultimate cooling down (its full cooldown, with
## your cooldown cards): no ultimate in the opening seconds.
func start_ult_cooldown() -> void:
	if abilities.has("R"):
		cooldowns["R"] = float(abilities["R"]["cooldown"]) * AbilityInfo.cooldown_scale(mods, "R")


## GRIND: how big the spinning body is right now (1 = normal).
func spin_scale() -> float:
	if spin_left <= 0.0 or spin_time <= 0.0:
		return 1.0
	return lerpf(spin_grow.x, spin_grow.y, 1.0 - spin_left / spin_time)


## GRIND: how far it has turned so far — a quick spin-up, full speed, then a
## slow wind-down to a stop. The total is a whole number of quarter turns, so
## the square stops looking exactly as it started (no snap at the end).
const SPIN_UP := 0.15     # s to reach full speed
const SPIN_TOOTH := 0.22  # GRIND's teeth: each an equilateral triangle on the last 22% of a side
const RAGE_TICK := 0.5    # s between RAGE's contact hits (damage, burn, bump, stun check)
const SPIN_DOWN := 0.7    # s to slow from full speed to a stop
const SPIN_SPEED := 16.0  # rad/s at full speed (rounded to finish on a quarter turn)


func spin_angle() -> float:
	if spin_left <= 0.0 or spin_time <= 0.0:
		return 0.0
	var dur := spin_time
	var up := minf(SPIN_UP, dur * 0.3)
	var down := minf(SPIN_DOWN, dur * 0.5)
	var span := dur - up / 2.0 - down / 2.0  # full-speed-equivalent time
	var w := roundf(SPIN_SPEED * span / (PI / 2.0)) * (PI / 2.0) / span
	var t := dur - spin_left
	if t < up:
		return w * t * t / (2.0 * up)
	var a := w * up / 2.0
	var flat_end := dur - down
	if t < flat_end:
		return a + w * (t - up)
	a += w * (flat_end - up)
	var u := t - flat_end
	return a + w * (u - u * u / (2.0 * down))


## GRIND: how fast it's spinning right now, 0..1 of full speed.
func spin_speed() -> float:
	if spin_left <= 0.0 or spin_time <= 0.0:
		return 0.0
	var up := minf(SPIN_UP, spin_time * 0.3)
	var down := minf(SPIN_DOWN, spin_time * 0.5)
	var t := spin_time - spin_left
	if t < up:
		return t / up
	if t < spin_time - down:
		return 1.0
	return clampf(spin_left / down, 0.0, 1.0)


## GRIND: how far the spinning corners reach (hits land within this).
func spin_reach() -> float:
	return radius * corner_factor(def.get("shape", "")) * spin_scale()


## How far a shape's corners sit from its centre, as a share of its radius
## (shape_points uses the same numbers).
const ICON_BASE_RADIUS := 26.0  # a body this size draws its icon at exactly r


static func corner_factor(shape: String) -> float:
	return 1.25 if shape == "triangle" else (1.1 if shape == "square" else 1.0)


## RAGE: swell by `grow`, burn whoever you touch for `duration` s, take
## `damage_reduction` less damage. `dmg` is its contact damage per second.
func _start_rage(a: Dictionary, dmg: float) -> void:
	if rage_left > 0.0:
		_end_rage()
	_rage = a.duplicate()
	_rage["dps"] = dmg
	rage_left = float(a.get("duration", 6.0))
	_rage_tick = 0.0
	_rage_stunned = {}
	_rage_radius = radius
	radius *= 1.0 + float(a.get("grow", 0.35))  # the hitbox grows too
	damage_taken_mult = 1.0 - float(a.get("damage_reduction", 0.0))
	effects.add_child(Effects.Ghost.new(position, radius * 1.6, a["color"]))


func _tick_rage(delta: float) -> void:
	rage_left -= delta
	_clock_rage += delta
	_rage_tick -= delta
	if _rage_tick <= 0.0:
		_rage_tick += RAGE_TICK
		var reach: float = radius + float(_rage.get("contact_reach", 40.0))
		for u: Node2D in Targets.enemies_in(get_tree(), position, reach, team):
			u.take_damage(float(_rage["dps"]) * RAGE_TICK, _rage["color"], false, false, self, ability_hit(_rage))
			if not u.solid and u.is_targetable():  # bodied: bumped away, and now and then a mini stun
				var away: Vector2 = (u.position - position).normalized() if u.position.distance_to(position) > 1.0 else facing
				u.position += away * float(_rage.get("bump", 0.0))
				var id := u.get_instance_id()
				if float(_rage.get("stun", 0.0)) > 0.0 and _clock_rage >= float(_rage_stunned.get(id, -99.0)):
					u.stun(float(_rage["stun"]), self)
					_rage_stunned[id] = _clock_rage + float(_rage.get("stun_every", 1.5))
			if float(_rage.get("burn_dps", 0.0)) > 0.0:
				u.burn(self, float(_rage["burn_dps"]) * AbilityInfo.damage_scale(mods, "R") * damage_mult, float(_rage.get("burn_time", 2.0)) + mod("burn_time"))
	if rage_left <= 0.0:
		_end_rage()


func _end_rage() -> void:
	rage_left = 0.0
	if _rage_radius > 0.0:
		radius = _rage_radius
	_rage_radius = 0.0
	damage_taken_mult = 1.0


## How many charges `slot` holds at its current level (1 = a normal ability).
func max_charges(slot: String) -> int:
	var n := int(abilities[slot].get("charges", 1)) if abilities.has(slot) else 1
	if slot == "Q":
		n += int(mod("q_charges"))  # Reserve
	return n


## A recast ability of `slot` is out and waiting for its second press.
## POUNCE tethered someone: pressing its key again cuts the tether.
func can_untether(slot: String) -> bool:
	return abilities.has(slot) and abilities[slot].get("tether", 0.0) > 0.0 and is_tethered() and tether_owner


func has_recast(slot: String) -> bool:
	return recast.has(slot) and is_instance_valid(recast[slot])


func is_ready(slot: String) -> bool:
	return cooldowns[slot] <= 0.0


func can_afford(slot: String) -> bool:
	return mana >= ability_cost(slot)


## Right-click: force move. Clears any attack / attack-move; a point on a
## solid unit becomes the near edge of it (you walk up to it, never attack it).
func order_move(point: Vector2) -> void:
	if not is_targetable():
		return  # dead
	_stop_attacking()
	_target = _reachable(point)
	if not is_bot:
		effects.add_child(Effects.MoveMarker.new(point))


## `point`, or — when it's inside a solid unit (tower, dummy) — the spot on
## its edge facing the hero, so a move order never aims somewhere blocked.
func _reachable(point: Vector2) -> Vector2:
	if Bounds.active:  # off the field: the nearest spot on its edge
		point = Bounds.clamp_point(point, radius)
	for d: Node2D in get_tree().get_nodes_in_group("units"):
		if not d.solid or not d.is_targetable():
			continue
		var gap: float = radius + d.radius
		if point.distance_to(d.position) < gap:
			var from_dummy := position - d.position
			return d.position + (from_dummy.normalized() if from_dummy.length() > 0.01 else -facing) * gap
	return point


## Left-click: attack the enemy closest to the click point; with none near
## it, attack-move there. Either way the click point is remembered, so the
## next target is again the one closest to where you clicked.
func order_attack(point: Vector2) -> void:
	if not is_targetable():
		return  # dead
	_steering = false
	var ally := _deniable_at(point)
	if ally:  # clicked right on one of your own low creeps: deny it (attack-move never does)
		order_deny(ally)
		if not is_bot:
			effects.add_child(Effects.MoveMarker.new(point, Color("#ffca28")))
		return
	_attack_move = point
	attack_target = _closest_enemy(point, CLICK_PICK)
	if attack_target == null:
		_target = point
	if not is_bot:
		effects.add_child(Effects.MoveMarker.new(point, Color("#ff6b6b")))


## Attack one of your own creeps (below Unit.DENY_BELOW health) to deny it.
func order_deny(creep: Node2D) -> void:
	if not is_targetable() or not creep.deniable_by(team):
		return
	_steering = false
	_attack_move = null
	attack_target = creep


## One of your own deniable creeps under the click (on it, not just near), or null.
func _deniable_at(point: Vector2) -> Node2D:
	var best: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.deniable_by(team) and point.distance_to(c.position) <= c.radius + 30.0:
			if best == null or point.distance_to(c.position) < point.distance_to(best.position):
				best = c
	return best


func leash_capacity() -> int:
	return LEASH_POINTS + int(mod("leash_points"))


func leash_used() -> int:
	var n := 0
	for c: Variant in leashed:
		if is_instance_valid(c):
			n += c.leash_cost()
	return n


## Leash a creep of yours (it follows you and attacks what you attack), or
## release it if it's already following. False if you lack the points.
func toggle_leash(c: Node2D) -> bool:
	if c.team != team or not c.is_in_group("creeps") or not c.is_targetable():
		return false
	if leashed.has(c):
		leashed.erase(c)
		c.leader = null
		PlayLog.event("unleash" if not is_bot else "red_unleash", {"kind": c.kind})
		return true
	if leash_used() + c.leash_cost() > leash_capacity():
		leash_flash = 0.8
		return false
	c.leader = self
	c.set("camp", null)  # (leashing a creep off a totem takes it off)
	c.leash_slot = leashed.size()
	leashed.append(c)
	PlayLog.event("leash" if not is_bot else "red_leash", {"kind": c.kind})
	return true


## One of your own creeps under the cursor, or null.
func _own_creep_at(point: Vector2) -> Node2D:
	var best: Node2D = null
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.is_targetable() and point.distance_to(c.position) <= c.radius + 30.0:
			if best == null or point.distance_to(c.position) < point.distance_to(best.position):
				best = c
	return best


## Paid by unit.gd when this hero lands the killing blow on its own creep.
func on_deny(at: Vector2, creep: Node2D = null) -> void:
	denies += 1
	if is_targetable():  # Scavenger
		mana = minf(max_mana, mana + mod("deny_mana"))
		hp = minf(max_hp, hp + mod("deny_heal"))
	if mod("recruit") > 0.0 and creep != null and is_instance_valid(creep) and not creep.get("risen"):
		_raise(creep)
	effects.add_child(Effects.DenyMark.new(at, Color("#ffca28") if not is_bot else Color("#ef9a9a")))
	if not is_bot:
		PlayLog.event("deny")
	else:
		PlayLog.event("red_deny")


## Recruit: the creep you just denied gets back up for a while at half health.
func _raise(dead: Node2D) -> void:
	var c: Node2D = CreepScript.new(team, dead.kind, dead.position, dead.goal)
	c.effects = effects
	c.max_hp = dead.max_hp
	c.hp = dead.max_hp * 0.5
	c.power = dead.power
	c.siege = dead.siege
	c.speed_bonus = dead.speed_bonus
	c.risen = true
	c.life_left = mod("recruit")
	c.bounty = 0  # worth no gold to anyone
	dead.get_parent().add_child.call_deferred(c)


func _stop_attacking() -> void:
	attack_target = null
	_attack_move = null


## Chase / shoot the target; while attack-moving, acquire the closest enemy
## within reach and resume walking once the target is gone.
func _update_attack() -> void:
	if spin_left > 0.0:
		return  # spinning: no auto-attacks
	if is_bot and is_instance_valid(attack_target) and attack_target.is_in_group("heroes") and attack_target.hidden_by_decoy():
		attack_target = null  # Afterimage: it lost track of you
		_attack_id = 0
	if _attack_id != 0 and (not is_instance_valid(attack_target) or not attack_target.is_targetable()):
		attack_target = null
		if _attack_move != null:
			_target = _attack_move
	if attack_target == null and _attack_move != null:
		# Of the enemies within reach of the hero, the one closest to the click.
		attack_target = _closest_to(_attack_move, Targets.enemies_in(get_tree(), position, ACQUIRE_RANGE, team).filter(
			func(u: Node2D) -> bool: return not (is_bot and u.is_in_group("heroes") and u.hidden_by_decoy())))
		if attack_target == null and _target == null:
			_attack_move = null  # arrived with nothing to fight
	if attack_target == null:
		return
	var to := attack_target.position - position
	if to.length() > attack_range() + attack_target.radius:
		_target = attack_target.position  # close in
		return
	_target = null
	facing = to.normalized()
	if _attack_cd <= 0.0:
		_attack_cd = attack_interval()
		_volley += 1
		_shoot(attack_target)
		if mod("twin_shot") > 0.0:  # a second shot at the nearest other enemy in range
			var others := Targets.enemies_in(get_tree(), position, attack_range(), team).filter(
				func(u: Node2D) -> bool: return u != attack_target and not (is_bot and u.is_in_group("heroes") and u.hidden_by_decoy()))
			var second := _closest_to(position, others)
			if second:
				_shoot(second)


func _shoot(at: Node2D) -> void:
	var shot := Effects.AttackShot.new(position + facing * radius, at, attack_damage(),
		Color("#fff3c4") if team == 0 else Color("#ffab91"), false, 6.0, self)
	shot.speed_mult = 1.0 + mod("shot_speed")  # Keen Eye
	shot.volley = _volley
	if at.is_in_group("creeps") and at.hp < at.max_hp * mod("snap_finish"):
		shot.speed_mult = 60.0  # Bounty Hunter: lands at once on a low creep
	if _spellblade_ready and not is_instance_valid(_spellblade_shot) and not at.is_in_group("towers"):  # Spellblade: this one's charged
		shot.extra_damage = mod("spellblade")
		shot.on_hit_slow = 0.2
		_spellblade_shot = shot  # the charge is spent when it lands (on_attack_landed), not now
	effects.add_child(shot)


func _closest_enemy(at: Vector2, within: float) -> Node2D:
	return _closest_to(at, Targets.enemies_in(get_tree(), at, within, team))


func _closest_to(point: Vector2, candidates: Array) -> Node2D:
	var best: Node2D = null
	for d: Node2D in candidates:
		if best == null or d.position.distance_to(point) < best.position.distance_to(point):
			best = d
	return best


## Cast `slot` towards / at `point` (world space).
func cast(slot: String, point: Vector2) -> void:
	aiming = ""
	if can_untether(slot):  # second press of POUNCE: let go of whoever's tethered
		break_tether()
		return
	if has_recast(slot):  # second press of a recast ability: set it off
		var a2: Dictionary = abilities[slot]
		var d2: float = a2["damage"] * AbilityInfo.damage_scale(mods, slot, ult_damage_off) * damage_mult
		recast[slot].detonate(d2, slot == "Q" and mod("echo") > 0.0)
		return
	if not is_ready(slot) or not is_targetable() or is_stunned():
		return
	if not can_afford(slot):
		no_mana_flash = 0.6
		return
	var a: Dictionary = abilities[slot]
	var dmg: float = a["damage"] * AbilityInfo.damage_scale(mods, slot, ult_damage_off) * damage_mult
	var cd: float = a["cooldown"] * AbilityInfo.cooldown_scale(mods, slot)
	if a["kind"] == "orb":  # recast: no cooldown until it explodes or fizzles
		var dir := (point - position).normalized() if point.distance_to(position) > 1.0 else facing
		facing = dir
		var orb := Effects.Orb.new(position + dir * radius, point, a["range"], a["speed"], a["linger"], a["radius"], a["color"])
		orb.team = team
		orb.source = self
		orb.hit = ability_hit(a)
		orb.auto_damage = dmg
		orb.echo = slot == "Q" and mod("echo") > 0.0
		orb.fx = a.get("fx", "")
		var charged := max_charges(slot) > 1  # Reserve: a charge per orb, refilled on the cooldown
		if charged:
			charges[slot] -= 1
			_recharge_len[slot] = cd
			if recharge[slot] <= 0.0:
				recharge[slot] = cd
		orb.finished.connect(func() -> void:
			recast.erase(slot)
			if charged:
				cooldowns[slot] = CHARGE_GAP if charges[slot] > 0 else recharge[slot]
			else:
				cooldowns[slot] = cd)
		recast[slot] = orb
		effects.add_child(orb)
		mana -= ability_cost(slot)
		_spellblade_ready = mod("spellblade") > 0.0
		_log_cast(slot, a, point)
		return
	_cast_effects(a, point, dmg)
	_log_cast(slot, a, point)
	if slot == "Q" and mod("echo") > 0.0:  # Echo: the same shot again, half strength
		var aim_dir := (point - position).normalized()
		_later(0.4, func() -> void:
			if not is_targetable():
				return
			if a["kind"] == "spin":  # GRIND: a half-strength spin alongside the one going (doesn't restart it)
				if spin_left > 0.0:
					var sp := Effects.Spin.new(a["color"], dmg * 0.5)
					sp.position = position
					sp.duration = spin_left
					sp.ticks = maxi(1, int(round(float(a.get("ticks", 8)) * spin_left / float(a.get("duration", 2.0)))))
					sp.attack_slow = a.get("attack_slow", 0.0)
					sp.slow_time = a.get("slow_time", 1.5)
					_fx(sp, a)
					_spin_fx.append(sp)
			elif a["kind"] == "beam":  # SHADE: the echo beam goes off at once — no second plant — and not if the first was cancelled
				if _echo_beam_ok:
					var beam := Effects.Beam.new(position + aim_dir * radius, aim_dir, a["range"], a["width"], a["color"], dmg * 0.5)
					beam.near_mult = float(a.get("near_damage", 1.0))
					beam.full_at = float(a.get("full_at", 0.0))
					_fx(beam, a)
			else:
				_cast_effects(a, position + aim_dir * position.distance_to(point), dmg * 0.5))
	mana -= ability_cost(slot)
	_spellblade_ready = mod("spellblade") > 0.0  # Spellblade: the next attack is charged
	if max_charges(slot) > 1:  # spend a charge; the refill runs on the cooldown
		charges[slot] -= 1
		_recharge_len[slot] = cd
		if recharge[slot] <= 0.0:
			recharge[slot] = cd
		cooldowns[slot] = CHARGE_GAP if charges[slot] > 0 else recharge[slot]
	else:
		cooldowns[slot] = cd


## What an ability does, at `point`, for `dmg` (cast() handles cost/cooldown).
func _cast_effects(a: Dictionary, point: Vector2, dmg: float) -> void:
	var to := point - position
	var dir := to.normalized() if to.length() > 1.0 else facing
	var c: Color = a["color"]
	facing = dir
	match a["kind"]:
		"skillshot":
			var n: int = a.get("count", 1)
			for i in n:
				var d := dir.rotated(deg_to_rad(a.get("spread", 0.0)) * (i - (n - 1) / 2.0))
				var bolt := Effects.Bolt.new(position + d * radius, d, a["range"], c, dmg)
				bolt.pierce = a.get("pierce", false)
				bolt.pierce_creeps = a.get("pierce_creeps", false)
				bolt.fx = a.get("fx", "")
				_fx(bolt, a)
		"ground":
			var reach := clampf(to.length(), float(a.get("min_range", 0.0)), float(a["range"]))  # RUMOR can't land close
			var at := position + dir * reach
			var n: int = a.get("count", 1)
			for i in n:  # several = scattered and staggered, like a meteor shower
				var spot: Vector2 = at if n == 1 else at + Vector2.from_angle(randf() * TAU) * randf() * float(a["scatter"])
				_later(i * 0.15, func() -> void:
					var b := Effects.Blast.new(spot, a["radius"], c, dmg)
					b.splash = a.get("splash", 1.0)
					b.duration = a.get("duration", 0.0)
					b.ticks = a.get("ticks", 1)
					b.warn = a.get("warn", b.warn)
					b.move_slow = a.get("move_slow", 0.0)
					b.slow_time = a.get("slow_time", 1.0)
					b.finale = a.get("finale", 0.0)
					b.bleed = a.get("bleed", 0.0)
					b.fx = a.get("fx", "")
					b.burn_dps = a.get("burn_dps", 0.0) * AbilityInfo.damage_scale(mods, "W") * damage_mult
					b.burn_time = a.get("burn_time", 0.0) + (mod("burn_time") if a.get("burn_time", 0.0) > 0.0 else 0.0)  # Kindling
					b.blind = a.get("blind", false)  # RUMOR
					_fx(b, a))
		"dash":
			if spin_left > 0.0:
				_end_spin()  # SHOVE cuts a GRIND short
			_leave_decoy()  # Afterimage
			var dest := position + to.limit_length(a["range"])
			var windup: float = a.get("windup", 0.0)
			if windup > 0.0:  # a brief crouch before it goes: rooted, aimed where you cast
				_dashing = true
				_target = null
				var aim := to.normalized() if to.length() > 1.0 else facing
				facing = aim
				effects.add_child(Effects.Ghost.new(position, radius * 1.4, c))
				# the windup: a tight little spin on the spot (a small loop with
				# afterimages), facing where it's going the whole time
				var origin := position
				var spin := create_tween()
				spin.tween_method(func(t: float) -> void:
					var ang := aim.angle() + PI + t * TAU * 1.5  # one and a half turns
					position = origin + Vector2.from_angle(ang) * 9.0 * sin(t * PI)
					facing = aim  # it loops round but keeps facing where it's going
					if randf() < 0.7:
						effects.add_child(Effects.Ghost.new(position, radius * 0.8, c)),
					0.0, 1.0, windup).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN)
				_later(windup, func() -> void:
					position = origin
					facing = aim
					if is_targetable():
						_dash(dest, c, dmg, a))
			else:
				_dash(dest, c, dmg, a)
		"boop":  # BOOP: a circle at the cursor; after a beat a ring bursts out and carries everything it meets
			var at := position + dir * minf(to.length(), float(a["range"]))
			var boop := Effects.Boop.new(at, float(a["radius"]), float(a.get("push", 120.0)), c, float(a.get("windup", 0.2)))
			boop.facing = facing
			boop.on_contact = func(u: Node2D) -> void: _booped(u, a, dmg)  # (u: anyone the ring reaches)
			effects.add_child(boop)
		"blink":
			_cancel_plant()  # GHOST out of a SHADE windup: the beam is lost
			_leave_decoy()  # Afterimage
			var dest := position + to.limit_length(a["range"])
			effects.add_child(Effects.Ghost.new(position, radius * 1.3, c))
			position = dest
			push_out()  # never land inside anything
			_target = null
			_stop_attacking()
			effects.add_child(Effects.Ghost.new(position, radius * 1.3, c))
		"spin":  # GRIND: a growing spin that follows you; no attacks meanwhile
			if _dashing:  # cast mid-SHOVE: it goes once the charge is over
				_queued_spin = {"a": a, "dmg": dmg}
				return
			var sp := Effects.Spin.new(c, dmg)
			sp.position = position
			sp.duration = a.get("duration", 2.0)
			sp.ticks = a.get("ticks", 8)
			sp.attack_slow = a.get("attack_slow", 0.0)
			sp.slow_time = a.get("slow_time", 1.5)
			sp.creep_heal = float(a.get("creep_heal", 0.0))
			spin_left = sp.duration
			spin_time = sp.duration
			spin_grow = Vector2(float(a.get("grow_start", 1.6)), float(a.get("grow_end", 2.0)))
			_stop_attacking()
			_fx(sp, a)
			_spin_fx = [sp]
		"shield":  # BRACE: a shield on you and every friendly nearby (creeps: a share of their max health)
			effects.add_child(Effects.Ghost.new(position, a["radius"], c))
			for u: Node2D in get_tree().get_nodes_in_group("units"):
				if u.team == team and u.is_targetable() and position.distance_to(u.position) <= a["radius"] + u.radius:
					if u.is_in_group("creeps"):  # grows with the creeps, round after round
						u.add_shield(u.max_hp * float(a.get("creep_pct", 0.15)), a.get("duration", 3.0), self)
					elif u.is_in_group("heroes"):
						u.add_shield(float(a["shield"]), a.get("duration", 3.0), self)
		"rage":  # RAGE: swell, burn whoever you touch, take less damage
			_start_rage(a, dmg)
		"self":
			var n: int = a.get("pulses", 1)
			var at := position
			for i in n:  # repeated pulses follow the hero, unless anchored where it was cast
				var pd: Array = a.get("pulse_damage", [])  # per-pulse damage, scaled by the same mods
				var d: float = dmg * pd[i] / a["damage"] if i < pd.size() else dmg
				_later(i * a.get("interval", 0.0), func() -> void:
					var nova := Effects.Nova.new(at if a.get("anchored", false) else position, a["radius"], c, d)
					nova.edge_damage = a.get("edge_damage", 1.0)
					nova.barbed = a.get("barbed", false)
					_fx(nova, a))
		"cone":
			_fx(Effects.Cone.new(position, dir, a["range"], deg_to_rad(a["angle"]) / 2.0, c, dmg), a)
		"beam":
			_echo_beam_ok = false
			_pending_beam = {"a": a, "dir": dir, "dmg": dmg}
			_plant_left = float(a.get("windup", 0.0))
			if _plant_left <= 0.0:
				_fire_beam()
			else:  # planted: stop where you are
				_target = null
				_stop_attacking()


## RAGE: an ability touching `u` (GRIND's cuts, SHOVE's charge) sets it on
## fire like RAGE's own contact does — no extra damage, bump or stun.
func rage_contact(u: Node2D) -> void:
	if rage_left <= 0.0 or float(_rage.get("burn_dps", 0.0)) <= 0.0 or not is_instance_valid(u) or not u.is_targetable():
		return
	u.burn(self, float(_rage["burn_dps"]) * AbilityInfo.damage_scale(mods, "R") * damage_mult, float(_rage.get("burn_time", 2.0)) + mod("burn_time"))


## Stop a GRIND now (its remaining hits are lost).
func _end_spin() -> void:
	spin_left = 0.0
	for sp: Variant in _spin_fx:
		if is_instance_valid(sp):
			sp.queue_free()
	_spin_fx = []


## SHADE: the beam goes off (after its windup), damage rising with distance.
func _fire_beam() -> void:
	if _pending_beam.is_empty() or not is_targetable():
		_pending_beam = {}
		return
	var a: Dictionary = _pending_beam["a"]
	var dir: Vector2 = _pending_beam["dir"]
	var dmg: float = _pending_beam["dmg"]
	_pending_beam = {}
	_plant_left = 0.0
	_echo_beam_ok = true
	var beam := Effects.Beam.new(position + dir * radius, dir, a["range"], a["width"], a["color"], dmg)
	beam.near_mult = float(a.get("near_damage", 1.0))
	beam.full_at = float(a.get("full_at", 0.0))
	_fx(beam, a)
	queue_redraw()


func _cancel_plant() -> void:
	_plant_left = 0.0
	_pending_beam = {}


## Paid by unit.gd when this hero lands a killing blow worth `amount`.
func earn_gold(amount: int, at: Vector2, last_hit: bool) -> void:
	if last_hit:
		last_hits += 1
		amount = int((amount + mod("last_hit_gold")) * (1.0 + mod("gold_mult")))
		mana = minf(max_mana, mana + mod("last_hit_mana"))  # Siphon
		cooldowns["R"] = maxf(0.0, cooldowns["R"] - mod("last_hit_ult"))  # Adrenaline
	if no_gold:  # overtime: kills pay nothing (the last hit still counts, Siphon still works)
		if last_hit and not is_bot:
			PlayLog.last_hit("creep", 0)
		return
	if last_hit and not is_bot:
		PlayLog.last_hit("creep", amount)
	elif last_hit:
		PlayLog.event("red_last_hit", {"gold": amount})
	gold += amount
	if not is_bot:
		effects.add_child(Effects.GoldNumber.new(at, amount))


## Called by unit.gd for every hit this hero lands: Vampirism heals.
func on_dealt(amount: float, _hit: Dictionary = {}, victim: Node2D = null) -> void:
	if not is_bot:
		PlayLog.damage_dealt(amount)
	if mod("lifesteal") > 0.0 and is_targetable():  # Vampirism: double the share from heroes
		var vs_hero: bool = victim != null and is_instance_valid(victim) and victim.is_in_group("heroes")
		hp = minf(max_hp, hp + amount * mod("lifesteal") * (Unit.LIFESTEAL_VS_HEROES if vs_hero else 1.0))


## What an ability's hits carry: whether it's an area / multi-target hit (for
## lifesteal) and its damage multipliers by target (heroes.gd vs_* or the
## Unit defaults).
static func ability_hit(a: Dictionary) -> Dictionary:
	var aoe: bool = a["kind"] in ["ground", "self", "cone", "beam", "orb", "boop"] or a.get("pierce", false) \
		or a.get("pass_through", false) or int(a.get("count", 1)) > 1
	return {"aoe": aoe, "ability": a.get("name", ""), "douse": float(a.get("douse", 0.0)), "douse_slow": float(a.get("douse_slow", 0.0)), "douse_slow_time": float(a.get("douse_slow_time", 1.5)),
		"heroes": a.get("vs_heroes", Unit.ABILITY_VS_HEROES),
		"creeps": a.get("vs_creeps", Unit.ABILITY_VS_CREEPS),
		"structures": a.get("vs_structures", Unit.ABILITY_VS_STRUCTURES)}


## A damaging effect from this hero's ability `a`: it hits our enemies,
## credits us, and carries the ability's hit info.
func _fx(node: Node2D, a: Dictionary) -> void:
	node.team = team
	node.source = self
	node.hit = ability_hit(a)
	if node is Effects.Blast and node.duration > 0.0:  # a lingering zone lies on the ground, under every unit
		_add_to_ground(node)
	else:
		effects.add_child(node)


## Lay `node` on the ground: in the lane, under the creeps and towers (first
## child of the lane, drawn right after the field); in Training, just above
## the floor, under the dummies.
func _add_to_ground(node: Node2D) -> void:
	var main := effects.get_parent()
	var lane_node := main.get_node_or_null("Lane")
	if lane_node:
		lane_node.add_child(node)
		lane_node.move_child(node, 0)
	else:
		main.add_child(node)
		main.move_child(node, 1)  # child 0 is the ground


## Hits on your hero always show, in red. (A bot shows them like any unit.)
func take_damage(amount: float, colour: Color, big := false, quiet := false, source: Node2D = null, hit: Dictionary = {}) -> void:
	if in_well:
		return  # invulnerable in your own well
	if not is_bot:
		colour = HURT
		quiet = false
		if is_targetable():
			PlayLog.damage_taken(amount, source)
	super(amount, colour, big, quiet, source, hit)
	if mod("second_wind") > 0.0 and _second_wind_cd <= 0.0 and is_targetable() and hp < max_hp * SECOND_WIND_BELOW:
		_second_wind_cd = SECOND_WIND_EVERY  # Second Wind: a shield when you drop low
		add_shield(mod("second_wind"), 3.0, self)


func _die() -> void:
	leashing = false
	if rage_left > 0.0:
		_end_rage()
	spin_left = 0.0
	phasing = false
	for c: Variant in leashed:  # followers go back to the lane
		if is_instance_valid(c):
			c.leader = null
	leashed.clear()
	var lost := mini(int(gold * DEATH_GOLD_LOSS), DEATH_GOLD_CAP)  # dying costs gold; an enemy hero who killed you takes it
	gold -= lost
	if lost > 0:
		var to_hero: bool = killed_by != null and killed_by.is_in_group("heroes") and killed_by.team != team
		if to_hero:
			killed_by.gold += lost
		if not is_bot:
			effects.add_child(Effects.GoldNumber.new(position + Vector2(0, -30), -lost, Color("#ef5350")))
		elif to_hero:
			effects.add_child(Effects.GoldNumber.new(position + Vector2(0, -30), lost))
	if not is_bot:
		PlayLog.death(killed_by, position)
	else:
		if killed_by and killed_by.is_in_group("heroes") and not killed_by.is_bot:
			PlayLog.kill(position)
		PlayLog.event("red_death", {"at": [roundi(position.x), roundi(position.y)], "killer": PlayLog._source_kind(killed_by),
			"why": str(get("why")), "leashed": leashed.size()})
	respawn_in = respawn_time
	aiming = ""
	_target = null
	_steering = false
	_dashing = false
	_queued_spin = {}
	_cancel_plant()
	_stop_attacking()
	clear_statuses()
	effects.add_child(Effects.Ghost.new(position, radius * 2.0, HURT))
	visible = false
	super()


func _respawn() -> void:
	position = spawn
	visible = true
	hp = max_hp
	mana = max_mana
	effects.add_child(Effects.Ghost.new(position, radius * 1.6, def["color"]))


## Run `fn` after `delay` seconds (immediately when 0).
func _later(delay: float, fn: Callable) -> void:
	if delay <= 0.0:
		fn.call()
	else:  # a child Timer, so it dies with the hero (a round ending mid-ability doesn't fire into freed nodes)
		var t := Timer.new()
		t.one_shot = true
		t.wait_time = delay
		t.timeout.connect(fn)
		t.timeout.connect(t.queue_free)
		add_child(t)
		t.start()


## Dashes toward `dest`; the first enemy it runs into takes the damage and
## stops the dash there.
func _dash(dest: Vector2, colour: Color, damage: float, a: Dictionary = {}) -> void:
	_dashing = true
	var through: bool = a.get("pass_through", false)
	var hit := {}
	_target = null
	_stop_attacking()
	var start := position
	phasing = a.get("ignore_creeps", false)  # POUNCE: through friends and creeps alike
	var wobble: float = a.get("wobble", 0.0)  # px of side-to-side sway, none at either end
	# the same wobble and speed whatever the length: sways and time are for a
	# full-range dash, so a short dash is just a shorter stretch of it
	var full: float = float(a.get("range", start.distance_to(dest)))
	var frac: float = clampf(start.distance_to(dest) / maxf(full, 1.0), 0.05, 1.0)
	var sways: float = float(a.get("wobble_sways", 1.5)) * frac
	var trail: float = 1.0 if a.get("spirit", false) else 0.6  # spirit: a solid ghost trail
	var side := (dest - start).normalized().orthogonal()
	var tw := create_tween()
	tw.tween_method(func(t: float) -> void:
		if not _dashing:
			return  # already stopped against an enemy
		position = start.lerp(dest, t) + side * sin(t * TAU * sways) * sin(t * PI) * wobble
		# Only an enemy ahead that we've actually run into (not one we're
		# merely touching as we set off away from it).
		var ahead := (dest - start).normalized()
		if through:  # pass through: each enemy touched is hit (and slowed) once
			for u: Node2D in Targets.enemies_in(get_tree(), position, radius, team):
				if not hit.has(u):
					hit[u] = true
					u.take_damage(damage, colour, false, false, self, ability_hit(a))
					if a.get("attack_slow", 0.0) > 0.0:
						u.slow_attacks(a["attack_slow"], a.get("slow_time", 2.0))
					if a.get("zone_slow", 0.0) > 0.0 and (u.is_burning_from(self) or u.in_zone_of(self)):  # combo: dashed through them while they burn
						u.slow_moves(a["zone_slow"], a.get("slow_time", 2.0))
					if a.get("move_slow", 0.0) > 0.0:
						u.slow_moves(a["move_slow"], a.get("slow_time", 1.5))
					if a.get("expose", 0.0) > 0.0 and u.is_targetable():  # SHOVE: -armor for a few seconds
						u.expose(a["expose"], a.get("expose_time", 3.0))
					rage_contact(u)  # during RAGE, SHOVE's hits burn like a touch
					if a.get("knockback", 0.0) > 0.0 and not u.solid:  # barged aside, off the charge's line
						var line := (dest - start).normalized()
						var off: Vector2 = u.position - start
						var aside := line.orthogonal() * (1.0 if off.dot(line.orthogonal()) >= 0.0 else -1.0)
						u.position += aside * float(a["knockback"])
						u.push_out()
			if randf() < trail:
				effects.add_child(Effects.Ghost.new(position, radius, colour))
			return
		var skip_creeps: bool = a.get("ignore_creeps", false)
		var hits: Array = Targets.enemies_in(get_tree(), position, radius - 2.0, team).filter(
			func(d: Node2D) -> bool: return (d.position - position).dot(ahead) > 0.0 				and not (skip_creeps and d.is_in_group("creeps")))
		if not hits.is_empty():
			phasing = false
			hits[0].take_damage(damage, colour, false, false, self, ability_hit(a) if not a.is_empty() else {})
			if a.get("tether", 0.0) > 0.0 and (hits[0].is_in_group("heroes") or hits[0].is_in_group("dummies")):
				tether_with(hits[0], a["tether"], a.get("tether_len", 220.0))  # bound together: neither gets away
			push_out()
			_dashing = false
			tw.kill()
			return
		if randf() < 0.6:
			effects.add_child(Effects.Ghost.new(position, radius, colour)),
		0.0, 1.0, float(a.get("dash_time", 0.16)) * (frac if a.get("spirit", false) else 1.0)).set_trans(Tween.TRANS_SINE if a.get("spirit", false) else Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)
	tw.tween_callback(func() -> void:
		_dashing = false
		phasing = false
		push_out())  # landed: step out of anything it ended up inside


## The hero's outline: circle, or a triangle/square/hexagon turned to face
## where it's going.
## A UI icon of hero `h` at size `r`, scaled by its body radius so the icons
## keep their in-game proportions (KAREN's square is the big one).
static func icon_points(h: Dictionary, r: float, dir: Vector2) -> PackedVector2Array:
	return shape_points(h["shape"], r * float(h["radius"]) / ICON_BASE_RADIUS, dir)


## Draw hero `h`'s icon on `canvas` at `at` (size `r`, facing `dir`): its skin
## art if the skin has one, else its shape.
static func draw_icon(canvas: CanvasItem, h: Dictionary, at: Vector2, r: float, dir: Vector2) -> void:
	var size: float = r * float(h["radius"]) / ICON_BASE_RADIUS
	if SkinArt.draw(canvas, "hero_" + str(h["shape"]), at, size, dir):
		return
	var icon := icon_points(h, r, dir)
	for p in icon.size():
		icon[p] += at
	canvas.draw_colored_polygon(icon, h["color"])


static func shape_points(shape: String, r: float, dir: Vector2) -> PackedVector2Array:
	var sides: int = {"triangle": 3, "square": 4, "hexagon": 6}.get(shape, 32)
	var start := dir.angle() + (PI / 4.0 if shape == "square" else 0.0)
	var pts := PackedVector2Array()
	var k := corner_factor(shape)  # similar visual size
	for i in sides:
		pts.append(Vector2.from_angle(start + TAU * i / sides) * r * k)
	return pts


func _draw() -> void:
	if _plant_left > 0.0 and not _pending_beam.is_empty():  # SHADE's warning: the line it will fire down, filling in
		var a: Dictionary = _pending_beam["a"]
		var dir: Vector2 = _pending_beam["dir"]
		var k := 1.0 - _plant_left / maxf(float(a.get("windup", 0.35)), 0.01)
		var from := dir * radius
		var tip := from + dir * float(a["range"]) * k  # the line draws itself out over the windup
		draw_line(from, tip, Color(a["color"], 0.12), 14.0)  # a soft aura round it
		draw_line(from, tip, Color(a["color"], 0.3), 7.0)
		draw_line(from, tip, Color(1, 1, 1, 0.95), 2.0)  # the line itself
	var shape: String = def.get("shape", "circle")
	var spinning := spin_left > 0.0
	var art_dir := facing.rotated(spin_angle()) if spinning else facing
	var pts := shape_points(shape, radius * spin_scale(), art_dir)
	var slot := "hero_" + shape
	if SkinArt.has(slot):  # painted art (skin.gd): shadow, team ring, the art, the hit flash
		var ar := radius * spin_scale()
		SkinArt.draw(self, slot, Vector2(3, 5), ar, art_dir, Color(0, 0, 0, 0.35))
		draw_arc(Vector2.ZERO, radius + 9.0, 0.0, TAU, 48, Color(TEAM_COLORS[team], 0.85), 3.0)  # whose side
		SkinArt.draw(self, slot, Vector2.ZERO, ar, art_dir)
		if _flash > 0.0:
			SkinArt.draw(self, slot, Vector2.ZERO, ar, art_dir, Color(1, 0.3, 0.3, _flash * 0.5))
	else:
		var shadow := PackedVector2Array()
		for p in pts:
			shadow.append(p + Vector2(3, 5))
		draw_colored_polygon(shadow, Color(0, 0, 0, 0.35))  # soft drop shadow
		draw_arc(Vector2.ZERO, radius + 9.0, 0.0, TAU, 48, Color(TEAM_COLORS[team], 0.85), 3.0)  # whose side
		draw_colored_polygon(pts, def["color"])
		if spinning:  # GRIND: an equilateral tooth on the last stretch of each side, at its leading corner
			for i in pts.size():
				var a: Vector2 = pts[i]
				var b: Vector2 = pts[(i + 1) % pts.size()]  # the corner this side runs into, the way it spins
				var along := (b - a).normalized()
				var base := (b - a).length() * SPIN_TOOTH  # the tooth's side = this share of the square's side
				var out := Vector2(along.y, -along.x)
				if out.dot((a + b) / 2.0) < 0.0:
					out = -out  # point away from the middle
				var start := b - along * base
				var tip := (start + b) / 2.0 + out * base * sqrt(3.0) / 2.0
				draw_colored_polygon(PackedVector2Array([start, b, tip]), def["color"].lightened(0.25))
		var outline := pts.duplicate()
		outline.append(pts[0])
		draw_polyline(outline, RIM, 3.0)
		# facing notch
		var tip := facing * (radius - 4.0)
		var side := facing.orthogonal() * 7.0
		draw_colored_polygon(PackedVector2Array([tip, tip - facing * 12.0 + side, tip - facing * 12.0 - side]), RIM)
		if _flash > 0.0:  # just got hit
			draw_colored_polygon(pts, Color(1, 0.3, 0.3, _flash * 0.5))
	if is_tethered() and tether_owner:  # the tether: a taut line to whoever it's bound to
		var to_other: Vector2 = tether_to.position - position
		var taut := clampf(to_other.length() / maxf(tether_len, 1.0), 0.0, 1.0)
		var tc := Color("#ffd54f")
		draw_line(Vector2.ZERO, to_other, Color(tc, 0.35 + 0.5 * taut), 2.0 + 3.0 * taut)
		draw_arc(to_other, tether_to.radius + 5.0, 0.0, TAU, 32, Color(tc, 0.8), 2.0)
	if rage_left > 0.0:  # RAGE: a hot, flickering glow round its swollen body
		var flick := 0.5 + 0.5 * sin(Time.get_ticks_msec() / 70.0)
		draw_circle(Vector2.ZERO, radius + 8.0 + 4.0 * flick, Color(1.0, 0.4, 0.1, 0.18 + 0.1 * flick))
		draw_arc(Vector2.ZERO, radius + float(_rage.get("contact_reach", 40.0)), 0.0, TAU, 48, Color(1.0, 0.5, 0.15, 0.35), 2.0)
	draw_health_bar(76.0, Color("#66bb6a") if not is_bot else TEAM_COLORS[team], 9.0)
	draw_stun_mark()
	if is_bot:
		var font := ThemeDB.fallback_font
		var label: String = def["name"]
		var y := -radius - 27.0
		draw_string_outline(font, Vector2(-80, y), label, HORIZONTAL_ALIGNMENT_CENTER, 160, 14, 4, Color(0, 0, 0, 0.7))
		draw_string(font, Vector2(-80, y), label, HORIZONTAL_ALIGNMENT_CENTER, 160, 14, TEAM_COLORS[team].lightened(0.35))
