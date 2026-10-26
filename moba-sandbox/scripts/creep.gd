extends "res://scripts/unit.gd"
## A lane creep. Marches toward `goal` (the enemy tower) and fights whatever
## enemy comes within ACQUIRE of it:
##
##   0. an enemy hero that just hit one of our heroes (unit.gd HERO_AGGRO)
##   1. enemy creeps
##   2. then an enemy hero
##   3. then the enemy tower
##
## (nearest within each group). It sticks with a target it can already hit —
## unless a hero-attacking hero turns up — and re-picks every RETARGET
## seconds otherwise. Melee creeps hit instantly
## with a lunge; ranged ones throw a shot. Creeps shove each other and heroes
## (soft bodies) and walk round towers. Dead creeps are removed.

const PlayLog := preload("res://scripts/play_log.gd")

## Every creep's gold (KINDS "gold") is multiplied by this — the lane-income
## knob for both sides. 0.6 → melee 24 / ranged 33 / tank 42, every round, so
## a good round 1 (75% of last hits before overtime) pays just over an epic
## (≈630); later rounds pay more only through their longer farm windows.
const GOLD_MULT := 0.6
const ACQUIRE := 460.0
const RETARGET := 0.4
const KINDS := {
	"melee":  {"hp": 500.0, "radius": 20.0, "speed": 240.0, "range": 18.0,  "damage": 21.0, "interval": 1.0, "gold": 40, "leash": 1},
	"ranged": {"hp": 320.0, "radius": 17.0, "speed": 240.0, "range": 400.0, "damage": 24.0, "interval": 1.0, "gold": 55, "leash": 2},
	# Tank Minion (a wave upgrade): leads the wave; every stun_cd s stuns the
	# closest enemy (creep or hero) within stun_range for stun_time s
	"tank":   {"hp": 1100.0, "radius": 26.0, "speed": 240.0, "range": 18.0, "damage": 14.0, "interval": 1.2, "gold": 70, "leash": 2,
		"stun_cd": 6.0, "stun_range": 300.0, "stun_time": 1.0},
}

var kind: String
var goal: Vector2
var target: Node2D = null
var facing := Vector2.RIGHT
var _stats: Dictionary
var _cd := 0.0
var _retarget := 0.0
var _lunge := 0.0
var _slide_side := 0.0
## Damage multiplier (red creeps get tougher each stage of a run).
var power := 1.0
## Healing Aura (a wave upgrade): heals friendly creeps and heroes within heal_radius by
## heal_aura health per second.
var heal_aura := 0.0
var heal_radius := 0.0
var _aura_t := 0.0
## Siege Training (a wave upgrade): extra share of damage against towers.
var siege := 0.0
var _stun_cd := 2.0  # a tank's first stun comes soon after it spawns
## Leashed (T on it): follows `leader` and attacks what it attacks, instead
## of marching the lane. `leash_slot` spreads several followers out.
var leader: Node2D = null
var leash_slot := 0
## Pathfinders (wave): walks this much faster (0.2 = +20%).
var speed_bonus := 0.0
## Vanguard (wave): a melee creep gains this shield (8 s) the first time it's
## inside the enemy tower's range.
var vanguard := 0.0
var _vanguard_done := false
## Sappers (wave): dying inside the enemy tower's range, it blasts the tower for this.
var sapper := 0.0
## Standard Bearer (wave): this creep carries the banner — friendly creeps
## within BANNER_RANGE attack `banner` faster while it lives.
var banner := 0.0
const BANNER_RANGE := 300.0
## Recruit: a denied creep risen for its hero — crumbles after `life_left` s, worth no gold.
var life_left := 0.0
var risen := false
## A bonus creep (Tank Minion, Reinforcement, red's late extras, overtime's
## extras: lane.gd sets it, with bounty 0) — worth no gold to anyone.
var bonus := false
const NO_GOLD_GREY := Color("#9e9e9e")
## Latched on a totem (totem.gd): attacks it and nothing else until one of
## them dies. `camp_hero` led it there.
var camp: Node2D = null
var camp_hero: Node2D = null
const CAMP_REACH := 40.0  # px: latched creeps hit the totem only from this close, ranged ones included
## Sent on a key run (bot.gd): walks straight into this enemy tower's range,
## ignoring everything on the way — then Tower Vision takes over.
var dive_to: Node2D = null


func _init(team_: int, kind_: String, at: Vector2, goal_: Vector2) -> void:
	team = team_
	kind = kind_
	position = at
	goal = goal_
	_stats = KINDS[kind]
	radius = _stats["radius"]
	max_hp = _stats["hp"]
	hp = max_hp
	bounty = roundi(_stats["gold"] * GOLD_MULT)
	facing = (goal - at).normalized()
	_retarget = randf() * RETARGET  # spread the searches across frames


func _ready() -> void:
	add_to_group("creeps")


func _process(delta: float) -> void:
	tick_unit(delta)
	if risen:  # Recruit: its borrowed time runs out
		life_left -= delta
		if life_left <= 0.0 and is_targetable():
			hp = 0.0
			_die()
			return
	if heal_aura > 0.0:  # heal nearby friendly creeps, twice a second
		_aura_t += delta
		if _aura_t >= 0.5:
			_aura_t -= 0.5
			for c: Node2D in get_tree().get_nodes_in_group("units"):  # creeps and your hero
				if c.team == team and (c.is_in_group("creeps") or c.is_in_group("heroes")) 						and c.is_targetable() and c.position.distance_to(position) <= heal_radius:
					c.hp = minf(c.max_hp, c.hp + heal_aura * 0.5)
	_cd = maxf(0.0, _cd - delta)
	_lunge = maxf(0.0, _lunge - delta * 5.0)
	if is_stunned():
		queue_redraw()
		return  # stunned: no moving, no attacking
	if kind == "tank":
		_stun_cd -= delta
		if _stun_cd <= 0.0 and _try_stun():
			_stun_cd = _stats["stun_cd"]
	if camp != null:
		if not is_instance_valid(camp) or not camp.is_targetable():
			camp = null  # it fell: back to the lane
			camp_hero = null
		else:
			_on_camp(delta)
			queue_redraw()
			return
	if leader != null:
		if not is_instance_valid(leader) or not leader.is_targetable():
			leader = null  # its hero died: back to the lane
		elif _try_latch():
			queue_redraw()
			return
		else:
			if vanguard > 0.0 and not _vanguard_done and kind == "melee" and _tower_vision():  # Vanguard, leashed too
				_vanguard_done = true
				add_shield(vanguard, 8.0, null, "vanguard")
			_follow_leader(delta)
			queue_redraw()
			return
	_retarget -= delta
	if not is_instance_valid(target) or not target.is_targetable() or _safe_in_well(target):
		target = null  # gone, or a hero that reached its well: back to the lane
	if is_instance_valid(target) and target.is_in_group("heroes") and target.hidden_by_decoy():
		target = null  # Afterimage: it lost track of that hero
	var focus := _tower_vision()
	if focus and vanguard > 0.0 and not _vanguard_done and kind == "melee":  # Vanguard: shield up at the tower
		_vanguard_done = true
		add_shield(vanguard, 8.0, null, "vanguard")
	if focus:  # Tower Vision: inside an enemy tower's range, the tower and nothing else
		target = focus
	elif dive_to != null and is_instance_valid(dive_to) and dive_to.is_targetable():
		target = dive_to  # a key run: into the tower's range first, no stopping for your creeps
	elif _retarget <= 0.0:
		_retarget = RETARGET
		var picked := _pick_target()
		if not _in_reach(target) or (picked != null and picked.is_in_group("heroes") and picked.hero_aggro > 0.0):
			target = picked
	if focus:
		dive_to = null  # in: the dive's done its job

	var dest := goal
	if target:
		if _in_reach(target):
			dest = position  # plant and fight
			facing = (target.position - position).normalized()
			if _cd <= 0.0:
				_attack()
		else:
			dest = target.position
	var to := dest - position
	if to.length() > 2.0:
		facing = to.normalized()
		var step := minf(_stats["speed"] * (1.0 + speed_bonus) * move_speed_mult() * delta, to.length())
		var before := position
		position += facing * step
		var blocker := push_out()
		# Walked into a tower (or dummy): slide round its edge, on the side
		# that turns toward the destination, kept until clear.
		if blocker and blocker.solid and position.distance_to(before) < step * 0.6:
			var tangent := (position - blocker.position).normalized().orthogonal()
			if _slide_side == 0.0:
				var lean := tangent.dot(dest - position)
				_slide_side = signf(lean) if absf(lean) > 1.0 else 1.0
			position += tangent * _slide_side * step
			push_out()
		else:
			_slide_side = 0.0
	else:
		push_out()
	position = position.clamp(Vector2(-2990, -2990), Vector2(2990, 2990))
	queue_redraw()


func _in_reach(u: Variant) -> bool:  # untyped: `u` may already be freed
	return is_instance_valid(u) and u.is_targetable() \
		and position.distance_to(u.position) - radius - u.radius <= _stats["range"]


## Tower Vision (like tunnel vision): an enemy tower whose range this creep is
## inside (its edge within the tower's RANGE) — it then attacks only that
## tower — or null.
func _tower_vision() -> Node2D:
	for t: Node2D in get_tree().get_nodes_in_group("towers"):
		if t.team != team and t.is_targetable() and position.distance_to(t.position) - radius <= t.RANGE:
			return t
	return null


## A hero standing in its own well: invulnerable, so creeps lose interest.
func _safe_in_well(u: Variant) -> bool:
	return is_instance_valid(u) and u.is_in_group("heroes") and u.in_well


## Creeps before heroes before towers; nearest within each group.
func _pick_target() -> Node2D:
	var best: Node2D = null
	var best_rank := 99
	var best_d := INF
	for u: Node2D in get_tree().get_nodes_in_group("units"):
		if u.team == team or u.team < 0 or not u.is_targetable() or _safe_in_well(u) or u.is_in_group("bullets"):  # (a Bullet is a heroes-only problem)
			continue
		if u.is_in_group("heroes") and u.hidden_by_decoy():
			continue  # Afterimage: that hero is lost; its decoy is the hero now
		var d: float = position.distance_to(u.position) - u.radius
		if d > ACQUIRE:
			continue
		var rank: int = 0 if u.is_in_group("creeps") else (1 if u.is_in_group("heroes") or u.is_in_group("decoys") else 2)
		if u.is_in_group("heroes") and u.hero_aggro > 0.0:
			rank = -1
		if rank < best_rank or (rank == best_rank and d < best_d):
			best = u
			best_rank = rank
			best_d = d
	return best


## Leash points this creep takes up (melee 1, ranged / tank 2).
func leash_cost() -> int:
	return int(_stats.get("leash", 1))


## Worth no gold right now (a bonus or risen creep, or anything in overtime):
## drawn grey with a "no" slash through it.
func worthless() -> bool:
	return bounty <= 0 or no_gold  # (no_gold: the overtime flag, unit.gd)


## Led into its own side's totem ring: latch on (off the leash, the points are free).
func _try_latch() -> bool:
	for t: Node2D in get_tree().get_nodes_in_group("totems"):
		if t.in_latch(self):
			var by: Node2D = leader
			by.toggle_leash(self)  # (sets leader = null)
			camp = t
			camp_hero = by
			target = t
			PlayLog.event("latch", {"team": team, "kind": kind})
			return true
	return false


## Latched: walk into reach of the totem and hit it — nothing else.
func _on_camp(delta: float) -> void:
	target = camp
	if position.distance_to(camp.position) - radius - camp.radius <= minf(_stats["range"], CAMP_REACH):  # (ranged too: from on the totem, not from 400 px — booped away, it shot on from far off)
		facing = (camp.position - position).normalized()
		if _cd <= 0.0:
			_attack()
		push_out()
		return
	var to: Vector2 = camp.position - position
	facing = to.normalized()
	position += facing * minf(_stats["speed"] * move_speed_mult() * delta, to.length())
	push_out()


## The hero whose leash cards count for this creep: the one leading it
## (totem-latched creeps don't count).
func _boss() -> Node2D:
	if leader != null and is_instance_valid(leader):
		return leader
	return null


## Leashed: attack whatever the leader is attacking; otherwise trail behind it.
func _follow_leader(delta: float) -> void:
	var lt: Variant = leader.attack_target  # untyped: it may already be freed (a creep that just died)
	var t: Node2D = lt if is_instance_valid(lt) else null
	var speed: float = maxf(_stats["speed"], leader.speed)  # keep up with the hero
	var dest: Vector2
	if t != null and is_instance_valid(t) and t.is_targetable() and t.team != team and not _safe_in_well(t):
		target = t
		if _in_reach(t):
			facing = (t.position - position).normalized()
			if _cd <= 0.0:
				_attack()
			push_out()
			return
		dest = t.position
	else:
		target = null
		var side: Vector2 = leader.facing.orthogonal() * (45.0 * (leash_slot - 0.5))
		dest = leader.position - leader.facing * 70.0 + side  # just behind the hero
		if position.distance_to(dest) < 25.0:
			push_out()
			return
	var to := dest - position
	facing = to.normalized()
	position += facing * minf(speed * move_speed_mult() * delta, to.length())
	push_out()


## The hero on this creep's side (Aftershock credits a Tank Minion's stuns to it), or null.
func _team_hero() -> Node2D:
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		if h.team == team:
			return h
	return null


## Tank: stun the closest enemy creep or hero within range. True if it did.
func _try_stun() -> bool:
	var best: Node2D = null
	for u: Node2D in get_tree().get_nodes_in_group("units"):
		if u.team == team or u.team < 0 or not u.is_targetable() or u.is_in_group("towers") or u.is_in_group("decoys") or u.is_in_group("bullets"):
			continue
		var d: float = position.distance_to(u.position) - u.radius
		if d <= _stats["stun_range"] and (best == null or d < position.distance_to(best.position) - best.radius):
			best = u
	if best == null:
		return false
	best.stun(_stats["stun_time"], _team_hero())
	effects.add_child(Effects.Zap.new(position, best.position, TEAM_COLORS[team]))
	return true


func _attack() -> void:
	_cd = _stats["interval"] * attack_time_mult() / (1.0 + _banner_bonus())
	var quiet: bool = not target.loud
	var dmg: float = _stats["damage"] * power * (1.0 + siege if target.is_in_group("towers") else 1.0)
	var boss := _boss()
	if boss != null:  # Wonderpets (rally_cry): leashed creeps hit harder
		dmg *= 1.0 + boss.mod("leash_damage")
	if kind != "ranged":
		_lunge = 1.0
		if use_miss(target):  # blinded by RUMOR: a melee hit lands at once — and misses
			return
		target.take_damage(dmg, Color.WHITE, false, quiet, self)
	else:
		effects.add_child(Effects.AttackShot.new(position + facing * radius, target, dmg,
			TEAM_COLORS[team].lightened(0.4), quiet, 5.0, self))


## Standard Bearer: the attack-speed bonus from a friendly banner within range (0 = none).
func _banner_bonus() -> float:
	var best := 0.0
	for c: Node2D in get_tree().get_nodes_in_group("creeps"):
		if c.team == team and c.banner > 0.0 and c.is_targetable() and c.position.distance_to(position) <= BANNER_RANGE:
			best = maxf(best, c.banner)
	return best


## Armor (unit.gd): Wonderpets (rally_cry), a leashed creep takes less damage.
func armor_mult(source: Node2D, hit: Dictionary) -> float:
	var m := super(source, hit)
	var boss := _boss()
	if boss != null:
		m *= 1.0 - minf(boss.mod("leash_armor"), 0.75)  # never immune (or healed) by stacking
	return m


func _die() -> void:
	if sapper > 0.0:  # Sappers: dying inside the enemy tower's range, it blows up on the tower
		var t := _tower_vision()
		if t:
			t.take_damage(sapper, Color("#ffb74d"), true, false, self)
			effects.add_child(Effects.Zap.new(position, t.position, Color("#ffb74d")))
			effects.add_child(Effects.Ghost.new(position, radius * 3.0, Color("#ffb74d")))
	if PlayLog.recording() and not worthless():  # an enemy creep dying near you to someone else's blow: a missed last hit
		for h: Node2D in get_tree().get_nodes_in_group("heroes"):
			if not h.is_bot and h.team != team and h.is_targetable() and killed_by != h \
					and h.position.distance_to(position) < PlayLog.MISS_RANGE:
				PlayLog.missed(kind)
	effects.add_child(Effects.Ghost.new(position, radius * 1.4, TEAM_COLORS[team]))
	super()
	queue_free()


func _draw() -> void:
	var c: Color = TEAM_COLORS[team]
	if heal_aura > 0.0:  # the aura's reach, faint green (dim: every ranged creep in the wave wears one, and they overlap)
		draw_circle(Vector2.ZERO, heal_radius, Color(0.4, 0.9, 0.5, 0.025))
		draw_arc(Vector2.ZERO, heal_radius, 0.0, TAU, 48, Color(0.4, 0.9, 0.5, 0.13), 1.0)
	var o := facing * 8.0 * sin(_lunge * PI)  # lunge toward the target on a melee hit
	var body := c.lerp(Color.WHITE, _flash * 0.6)
	var nothing := worthless()
	if nothing:  # worth no gold: greyed (and slashed, below)
		body = body.lerp(NO_GOLD_GREY, 0.45)
	if risen:  # Recruit: a pale, see-through body on borrowed time
		body = Color(body.lightened(0.4), 0.45)
	if banner > 0.0:  # Standard Bearer: a flag on a pole, and its reach
		draw_arc(Vector2.ZERO, BANNER_RANGE, 0.0, TAU, 48, Color(c.lightened(0.3), 0.12), 1.5)
		draw_line(o + Vector2(0, -radius), o + Vector2(0, -radius - 30.0), c.darkened(0.5), 3.0)
		draw_colored_polygon(PackedVector2Array([o + Vector2(0, -radius - 30.0), o + Vector2(20, -radius - 24.0), o + Vector2(0, -radius - 18.0)]), c.lightened(0.3))
	if sapper > 0.0:  # Sappers: a lit fuse
		draw_circle(o + Vector2(0, -radius - 6.0), 4.0, Color("#ffb74d"))
	var cslot := "creep_%s_%d" % [kind, team]
	if SkinArt.has(cslot):  # painted art (skin.gd): shadow, then the art (grey when worth nothing, see-through when risen)
		var tint := Color(1, 1, 1, body.a).lerp(Color(0.62, 0.62, 0.62, body.a), 0.45 if nothing else 0.0)
		SkinArt.draw(self, cslot, o + Vector2(2, 4), radius, facing, Color(0, 0, 0, 0.3 * body.a))
		SkinArt.draw(self, cslot, o, radius, facing, tint)
	elif kind == "tank":  # a heavy armoured square
		var sq := PackedVector2Array()
		for i in 4:
			sq.append(o + Vector2.from_angle(PI / 4.0 + i * TAU / 4.0) * radius * 1.2)
		var sh := PackedVector2Array()
		for p in sq:
			sh.append(p + Vector2(3, 5))
		draw_colored_polygon(sh, Color(0, 0, 0, 0.3))
		draw_colored_polygon(sq, body.darkened(0.15))
		sq.append(sq[0])
		draw_polyline(sq, c.darkened(0.6), 4.0)
		draw_circle(o, radius * 0.35, c.lightened(0.35))
	elif kind == "melee":
		draw_circle(o + Vector2(2, 4), radius, Color(0, 0, 0, 0.3))
		draw_circle(o, radius, body)
		draw_arc(o, radius, 0.0, TAU, 32, c.darkened(0.55), 2.5)
	else:  # ranged: a diamond
		var pts := PackedVector2Array()
		for i in 4:
			pts.append(o + Vector2.from_angle(facing.angle() + i * TAU / 4.0) * radius * 1.25)
		var shadow := PackedVector2Array()
		for p in pts:
			shadow.append(p + Vector2(2, 4))
		draw_colored_polygon(shadow, Color(0, 0, 0, 0.3))
		draw_colored_polygon(pts, body)
		pts.append(pts[0])
		draw_polyline(pts, c.darkened(0.55), 2.5)
	if not SkinArt.has(cslot):
		draw_circle(o + facing * (radius * 0.55), 3.5, c.darkened(0.6))  # which way it faces
	if nothing:  # the "no" sign: a ring with a slash through it
		var nr := radius * (1.1 if kind == "melee" else 1.2)
		var d := Vector2(-1, -1).normalized() * nr
		draw_arc(o, nr, 0.0, TAU, 32, Color(0.88, 0.88, 0.88, 0.4), 1.5)
		draw_line(o + d, o - d, Color(0.88, 0.88, 0.88, 0.4), 1.5)
	if hp < max_hp:
		draw_health_bar(56.0 if kind == "tank" else 40.0, c.lightened(0.15), 5.0)
		_draw_last_hit_tick()
	draw_stun_mark()
	if leader != null and is_instance_valid(leader):  # the leash: a faint line to its hero
		draw_line(Vector2.ZERO, leader.position - position, Color(c.lightened(0.4), 0.35), 2.0)
		draw_arc(Vector2.ZERO, radius + 5.0, 0.0, TAU, 24, Color(c.lightened(0.5), 0.7), 2.0)


## On your enemies' bars: a tick at your hero's attack damage, and a white
## outline once one attack will kill — the last-hit window.
func _draw_last_hit_tick() -> void:
	var you: Node2D = null
	for h: Node2D in get_tree().get_nodes_in_group("heroes"):
		if not h.is_bot:
			you = h
	if you == null or not you.is_targetable():
		return
	var dmg: float = you.attack_damage()
	var w := 40.0
	var r := Rect2(Vector2(-w / 2.0, -radius - 17.0), Vector2(w, 5.0))
	if you.team == team:  # your own creep: amber outline once you can deny it
		if deniable_by(you.team):
			draw_rect(r.grow(2.0), Color("#ffca28") if hp > dmg else Color("#fff176"), false, 2.0)
		return
	if worthless():
		return  # no gold in it: no last-hit window to show
	if hp <= dmg:
		draw_rect(r.grow(2.0), Color.WHITE, false, 2.0)
	else:
		var x := r.position.x + w * minf(dmg / max_hp, 1.0)
		draw_line(Vector2(x, r.position.y - 2.0), Vector2(x, r.end.y + 2.0), Color(1, 1, 1, 0.9), 2.0)
