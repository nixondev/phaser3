extends RefCounted
## The heroes. Each has a shape, stats, an auto-attack and four abilities built
## from the ability kinds hero.gd knows:
##
##   skillshot  projectile(s) toward the cursor     count, spread (° between bolts),
##                                                  pierce (true = hits everything in line),
##                                                  pierce_creeps (through creeps, stops at a hero)
##   ground     area at the cursor, after a warning  radius; count + scatter = several;
##                                                  splash = damage share for all but the
##                                                  enemy nearest the centre (1 = everyone full);
##                                                  duration + ticks = a zone that stays, its
##                                                  damage split over the ticks; move_slow +
##                                                  slow_time = it slows enemies inside (and
##                                                  for slow_time s after); warn = warning s;
##                                                  range 0 = dropped where you stand;
##                                                  finale = damage only in its last s;
##                                                  bleed = your attacks +this on enemies inside;
##                                                  burn_dps + burn_time = enemies it touches burn
##                                                  that much a second, that long after leaving
##   dash       move quickly toward the cursor, hitting what you pass through;
##              stops at the first enemy unless pass_through (then hits each
##              once); attack_slow + slow_time slow the attack speed of those hit;
##              windup = s rooted before it goes; dash_time = s it takes
##              (0.16 default); wobble = px of side-to-side sway,
##              wobble_sways = how many; spirit = a solid ghost trail, gentler easing;
##              zone_slow = also slows movement of those hit while burning from your zone;
##              ignore_creeps = passes through creeps; tether + tether_len = the
##              hero it stops on is bound to you that long, at most that far apart
##   blink      teleport instantly toward the cursor
##   spin       you grow and spin; your corners cut  grow_start → grow_end (× size), duration,
##              (no auto-attacks while spinning)      ticks; attack_slow + slow_time on hits
##   shield     shield you + friendlies in radius    shield (heroes), duration; creeps get
##                                                    creep_pct of their own max health
##   rage       swell, burn on contact                duration, grow (radius ×), contact_reach,
##              (damage = contact damage per second)  damage_reduction, burn_dps + burn_time,
##                                                    bump (px shove per contact hit), stun +
##                                                    stun_every (a mini stun per enemy at most this often)
##   self       shockwave around you                 radius; pulses + interval = repeat;
##                                                   optional pulse_damage [..] = each pulse's damage;
##                                                   anchored = pulses stay where it was cast;
##                                                   edge_damage = share at the edge (full at the centre)
##   cone       instant wedge in front of you        range, angle (° total)
##   beam       instant piercing line                range, width
##   orb        a harmless dot flies out (through units) to the cursor / max
##              range; press again to detonate it early, otherwise it
##              explodes at the end of its line     range, speed, radius (the
##              blast), linger (s it waits at the end before exploding; 0 =
##              at once). Mana on the first press; cooldown when it explodes.
##
## Every ability: name, desc (the tooltip's hand-written line), kind,
## cooldown (s), cost (mana), damage, color, and
## `levels`: what changes at level II, III… (only the keys that change; level I
## is the ability as written). Shop cards level abilities by LETTER — "Q +1"
## raises whichever hero's Q you're playing — so levels carry across heroes.
##
## Optional on any ability: charges (> 1 = that many uses in a row, each
## refilling on the cooldown); vs_heroes / vs_creeps / vs_structures — damage
## multipliers by target type (defaults in unit.gd: ABILITY_VS_HEROES /
## _CREEPS / _STRUCTURES).
##
## Every hero: name, shape, color, speed, radius, hp, mana, regen (mana/s), attack,
## and `bot`: overrides used only when the enemy bot plays this hero — any
## top-level stat, `attack` fields, or per-ability fields under "abilities"
## (e.g. {"hp": 1000.0, "abilities": {"R": {"damage": 200.0}}}). Empty = same
## numbers as the player.

const MAX_LEVEL := 3
const ROMAN := ["", "I", "II", "III", "IV", "V"]

## Ability names — change a name here and it changes everywhere (slots,
## tooltips, shop, descriptions that mention it, Run History).
const CIRCLE_Q := "SHOCK"
const CIRCLE_W := "IGNITE"
const CIRCLE_E := "BOOP"
const CIRCLE_R := "PUNISH"
const TRIANGLE_Q := "STARS"
const TRIANGLE_W := "TRAP"
const TRIANGLE_E := "POUNCE"
const TRIANGLE_R := "FLURRY"
const SQUARE_Q := "GRIND"
const SQUARE_W := "BRACE"
const SQUARE_E := "SHOVE"
const SQUARE_R := "RAGE"
const HEXAGON_Q := "SHADE"
const HEXAGON_W := "RUMOR"
const HEXAGON_E := "GHOST"
const HEXAGON_R := "FALLOUT"

## Hero names — change one here and it changes everywhere. Play logs record
## the name, so Run History maps renamed heroes back (run_history.gd OLD_NAMES).
const CIRCLE_NAME := "KYLE"
const TRIANGLE_NAME := "CHAD"
const SQUARE_NAME := "KAREN"
const HEXAGON_NAME := "BECKY"

const LIST := [
	{
		"name": CIRCLE_NAME, "shape": "circle", "color": Color("#e0e6ea"),
		"speed": 360.0, "radius": 26.0, "hp": 700.0, "mana": 500.0, "regen": 6.0,
		"attack": {"range": 420.0, "damage": 30.0, "interval": 0.8, "stoke": true},  # stoke: each attack restarts his burn on the target at its full length
		"bot": {},
		"abilities": {
			"Q": {"name": CIRCLE_Q, "desc": "Fires an orb toward the cursor. It explodes at the end of its path — press Q again to set it off early. An enemy burning from your " + CIRCLE_W + " takes 50% more, stops burning and is slowed 15% for 1.5 s.", "kind": "orb", "douse": 0.5, "douse_slow": 0.15, "douse_slow_time": 1.5, "fx": "lightning", "range": 450.0, "speed": 900.0, "linger": 0.0, "radius": 80.0, "cooldown": 5.0, "cost": 50.0, "damage": 80.0, "color": Color("#4fc3f7"),
				"levels": [{"damage": 105.0, "radius": 95.0}, {"damage": 130.0, "radius": 110.0, "cooldown": 4.0}]},
			"W": {"name": CIRCLE_W, "desc": "Marks an area at the cursor; after a warning it burns for a moment. The enemy nearest the centre takes the most. Anyone it touches keeps burning a while after they get out; each of your attacks on them restarts their burn.", "kind": "ground", "fx": "fire", "range": 700.0, "radius": 128.0, "cooldown": 8.0, "cost": 80.0, "damage": 80.0, "splash": 0.5, "duration": 1.5, "ticks": 6, "burn_dps": 14.0, "burn_time": 2.0, "color": Color("#ff7a1a"),
				"levels": [{"radius": 150.0, "damage": 96.0, "burn_dps": 18.0}, {"damage": 112.0, "splash": 0.75, "cooldown": 6.5, "burn_dps": 22.0}]},
			"E": {"name": CIRCLE_E, "desc": "A circle at the cursor: after a beat a ring bursts out from its centre and carries everything it meets to the edge — enemies, creeps, and you if you're in it — nicking the enemies. Cast it behind someone to knock them toward you (or into your " + CIRCLE_W + "), or between you and them to knock you both apart. Breaks tethers.",
				"kind": "boop", "range": 700.0, "radius": 160.0, "push": 120.0, "windup": 0.2, "cooldown": 10.0, "cost": 60.0, "damage": 30.0, "color": Color("#81c784"),
				"levels": [{"damage": 40.0, "radius": 180.0, "cooldown": 9.0}, {"damage": 50.0, "radius": 200.0, "push": 160.0, "cooldown": 8.0}]},
			"R": {"name": CIRCLE_R, "desc": "A shockwave around you. It hits hardest up close, tapering to half damage at the edge.", "kind": "self", "radius": 260.0, "edge_damage": 0.5, "cooldown": 60.0, "cost": 150.0, "damage": 200.0, "color": Color("#ce93d8"),
				"levels": [{"damage": 270.0, "radius": 290.0}, {"damage": 350.0, "cooldown": 48.0}]},
		},
	},
	{
		"name": TRIANGLE_NAME, "shape": "triangle", "color": Color("#ef9a9a"),
		"speed": 400.0, "radius": 24.0, "hp": 800.0, "mana": 500.0, "regen": 7.0,
		"attack": {"range": 150.0, "damage": 35.0, "interval": 0.65},
		"bot": {},
		"abilities": {
			"Q": {"name": TRIANGLE_Q, "desc": "Throws a fan of spinning barbed stars toward the cursor. They cut through creeps, hitting each one, and stop at the first hero.", "face_hold": 0.3, "kind": "skillshot", "fx": "star", "pierce_creeps": true, "range": 600.0, "count": 3, "spread": 18.0, "cooldown": 5.0, "cost": 45.0, "damage": 55.0, "color": Color("#ff8a65"),
				"levels": [{"count": 4, "damage": 60.0}, {"count": 5, "damage": 70.0}]},
			"W": {"name": TRIANGLE_W, "kind": "ground", "range": 0.0, "desc": "Drops spikes where you stand. Enemies in them are slowed (a moment longer after they get out) and bleed: your attacks hit them harder. In its last second the ring whips round and cuts everyone inside.",
				"radius": 55.0, "warn": 0.0, "duration": 3.0, "finale": 1.0, "ticks": 4, "bleed": 0.2, "move_slow": 0.35, "slow_time": 1.0,
				"cooldown": 10.0, "cost": 50.0, "damage": 60.0, "color": Color("#b0bec5"),
				"levels": [{"charges": 2, "move_slow": 0.4, "damage": 80.0}, {"charges": 3, "move_slow": 0.45, "cooldown": 8.0, "damage": 100.0}]},
			"E": {"name": TRIANGLE_E, "desc": "Dash toward the cursor through creeps. The first hero you hit is tethered to you for a moment: neither of you can get away from the other. Press E again to let go.", "kind": "dash", "range": 520.0,
				"ignore_creeps": true, "tether": 1.2, "tether_len": 220.0, "cooldown": 8.0, "cost": 60.0, "damage": 70.0, "color": Color("#ffd54f"),
				"levels": [{"damage": 100.0, "range": 600.0}, {"damage": 140.0, "cooldown": 6.0}]},
			"R": {"name": TRIANGLE_R, "desc": "Rapid rings of barbs burst out around you, following you as you move.", "kind": "self", "barbed": true, "radius": 220.0, "pulses": 3, "interval": 0.25, "cooldown": 50.0, "cost": 120.0, "damage": 70.0, "color": Color("#f06292"),
				"levels": [{"pulses": 4, "damage": 105.0}, {"pulses": 5, "damage": 120.0}]},
		},
	},
	{
		"name": SQUARE_NAME, "shape": "square", "color": Color("#90a4ae"),
		"speed": 320.0, "radius": 32.0, "hp": 1000.0, "mana": 450.0, "regen": 5.0,
		"attack": {"range": 140.0, "damage": 35.0, "interval": 1.0},
		"bot": {},
		"abilities": {
			"Q": {"name": SQUARE_Q, "desc": "For 2 s you grow and spin — your corners cut everything they sweep, and enemies caught attack slower. You can move and cast but not auto-attack while spinning. Nothing stops it except your own " + SQUARE_E + "; cast during " + SQUARE_E + ", it starts when the charge ends. Each cut on a creep heals you a little.",
				"kind": "spin", "vs_creeps": 1.5, "creep_heal": 3.0, "grow_start": 1.6, "grow_end": 2.0, "duration": 2.0, "ticks": 8, "attack_slow": 0.25, "slow_time": 1.5,
				"cooldown": 7.0, "cost": 50.0, "damage": 180.0, "color": Color("#ffcc80"),
				"levels": [{"damage": 240.0, "grow_end": 2.2}, {"damage": 300.0, "grow_end": 2.4, "cooldown": 6.0}]},
			"W": {"name": SQUARE_W, "desc": "Shield yourself and every friendly hero nearby for 3 s; your creeps nearby get a shield worth a share of their own max health.",
				"kind": "shield", "radius": 300.0, "shield": 120.0, "creep_pct": 0.15, "duration": 3.0,
				"cooldown": 12.0, "cost": 60.0, "damage": 0.0, "color": Color("#c8ebff"),
				"levels": [{"shield": 170.0, "creep_pct": 0.2, "cooldown": 11.0}, {"shield": 220.0, "creep_pct": 0.25, "cooldown": 10.0}]},
			"E": {"name": SQUARE_E, "desc": "A short charge through enemies, knocking each one aside; for 3 s they take 10% more damage. Ends a " + SQUARE_Q + " in progress.",
				"kind": "dash", "range": 300.0, "pass_through": true, "knockback": 90.0, "expose": 0.1, "expose_time": 3.0,
				"cooldown": 10.0, "cost": 60.0, "damage": 40.0, "color": Color("#a5d6a7"),
				"levels": [{"damage": 60.0, "range": 340.0, "cooldown": 9.0}, {"damage": 80.0, "cooldown": 8.0}]},
			"R": {"name": SQUARE_R, "desc": "Swell up for a few seconds: you body enemies aside, anyone touching you takes damage, catches fire and is briefly stunned now and then, and you take less damage. Your " + SQUARE_Q + " and " + SQUARE_E + " hits set enemies on fire too, and reach further with your bigger body.",
				"kind": "rage", "duration": 6.0, "grow": 0.35, "contact_reach": 40.0, "damage_reduction": 0.2, "burn_dps": 15.0, "burn_time": 2.0,
				"bump": 30.0, "stun": 0.25, "stun_every": 1.5,
				"cooldown": 60.0, "cost": 150.0, "damage": 35.0, "color": Color("#ff7043"),
				"levels": [{"duration": 7.0, "damage": 50.0, "burn_dps": 20.0, "cooldown": 55.0}, {"duration": 8.0, "damage": 65.0, "burn_dps": 25.0, "cooldown": 50.0}]},
		},
	},
	{
		"name": HEXAGON_NAME, "shape": "hexagon", "color": Color("#fff59d"),
		"speed": 340.0, "radius": 26.0, "hp": 650.0, "mana": 550.0, "regen": 9.0,
		"attack": {"range": 520.0, "damage": 25.0, "interval": 0.9},
		"bot": {},
		"abilities": {
			"Q": {"name": HEXAGON_Q, "desc": "You stand still for a moment while a line shows where it will fire, then a long beam hits everything in it. It hits hardest far away. A stun during that moment cancels it.", "kind": "beam", "range": 760.0, "width": 40.0, "windup": 0.35, "near_damage": 0.6, "full_at": 600.0, "cooldown": 7.0, "cost": 60.0, "damage": 120.0, "color": Color("#81d4fa"),
				"levels": [{"damage": 150.0, "width": 55.0}, {"damage": 190.0, "cooldown": 5.25}]},
			"W": {"name": HEXAGON_W, "desc": "Drops a blast on the area at the cursor after a short warning. Everyone it hits misses their next attack. It can't land close to you.", "kind": "ground", "blind": true, "range": 850.0, "min_range": 250.0, "radius": 145.0, "cooldown": 10.0, "cost": 90.0, "damage": 85.0, "color": Color("#9fa8da"),
				"levels": [{"radius": 165.0, "damage": 110.0}, {"damage": 140.0, "cooldown": 8.0}]},
			"E": {"name": HEXAGON_E, "kind": "blink", "range": 450.0, "desc": "Teleport instantly toward the cursor. Cancels a " + HEXAGON_Q + " you're winding up.", "cooldown": 12.0, "cost": 70.0, "damage": 0.0, "color": Color("#b39ddb"),
				"levels": [{"range": 550.0, "cooldown": 10.0}, {"range": 650.0, "cooldown": 8.0}]},
			"R": {"name": HEXAGON_R, "desc": "Blasts rain down around the cursor, each after a short warning.", "kind": "ground", "range": 800.0, "radius": 130.0, "count": 6, "scatter": 320.0, "cooldown": 80.0, "cost": 200.0, "damage": 110.0, "color": Color("#bcaaa4"),
				"levels": [{"count": 8, "damage": 125.0}, {"count": 10, "scatter": 380.0, "damage": 140.0}]},
		},
	},
]

## Hero `i` as the enemy bot plays it: LIST[i] with its `bot` overrides
## applied (top-level stats, `attack` fields, per-ability fields).
static func bot_version(i: int) -> Dictionary:
	var h: Dictionary = LIST[i].duplicate(true)
	var o: Dictionary = h.get("bot", {})
	for k: String in o:
		if k == "abilities":
			for slot: String in o[k]:
				h["abilities"][slot].merge(o[k][slot], true)
		elif k == "attack":
			h["attack"].merge(o[k], true)
		else:
			h[k] = o[k]
	return h


## How level changes read on a shop card.
const LABELS := {"damage": "damage", "cooldown": "cooldown", "cost": "mana", "radius": "radius",
	"range": "range", "count": "count", "pulses": "pulses", "pulse_damage": "pulses", "width": "width", "angle": "angle",
	"scatter": "spread", "spread": "spread", "interval": "interval", "speed": "speed", "linger": "linger",
	"splash": "splash", "attack_slow": "attack slow", "slow_time": "slow time", "move_slow": "slow", "duration": "lasts", "charges": "charges", "bleed": "bleed", "tether": "tether", "tether_len": "tether length", "burn_dps": "burn /s", "burn_time": "burn time",
	"grow_end": "grows to", "shield": "shield", "knockback": "knockback", "push": "push"}
## Shown as percentages on the cards.
const PERCENT := ["splash", "attack_slow", "move_slow", "bleed"]
const FLAGS := {"pierce": "pierces"}


## Hero `h`'s ability in `slot` at `level` (I = as written; each level above
## applies its changes on top of the one below).
static func ability_at(h: Dictionary, slot: String, level: int) -> Dictionary:
	var a: Dictionary = h["abilities"][slot].duplicate()
	var levels: Array = a.get("levels", [])
	for i in mini(level - 1, levels.size()):
		a.merge(levels[i], true)
	a["level"] = level
	return a


## What going from level `to - 1` to `to` does, e.g. ["damage 60 → 85",
## "cooldown 4 → 3.5"] — shown on the shop's letter cards.
static func level_changes(h: Dictionary, slot: String, to: int) -> Array:
	var before := ability_at(h, slot, to - 1)
	var after := ability_at(h, slot, to)
	var out: Array = []
	# splash abilities: one line with both numbers, centre/others (and the
	# splash change folded in), shown first
	var split: bool = before.get("splash", 1.0) < 1.0 or after.get("splash", 1.0) < 1.0
	if split and (before.get("damage") != after.get("damage") or before.get("splash") != after.get("splash")):
		out.append("damage %s → %s" % [_split(before), _split(after)])
	for k: String in after:
		if k == "level" or k == "levels" or before.get(k) == after[k]:
			continue
		if split and (k == "damage" or k == "splash"):
			continue
		if k == "damage" and after.has("pulse_damage"):
			continue  # the per-pulse line says it
		if FLAGS.has(k):
			if after[k]:
				out.append(FLAGS[k])
		elif LABELS.has(k):
			if after[k] is Array:  # e.g. Quake's pulse_damage: "110/80/110 → 130/95/130"
				out.append("%s %s → %s" % [LABELS[k], _nums(before.get(k, [])), _nums(after[k])])
			elif PERCENT.has(k):
				out.append("%s %d%% → %d%%" % [LABELS[k], roundi(float(before.get(k, 0)) * 100.0), roundi(float(after[k]) * 100.0)])
			else:
				out.append("%s %s → %s" % [LABELS[k], _num(before.get(k, 1 if k == "charges" else 0)), _num(after[k])])
	return out


## "centre/others" damage for a splash ability, e.g. "100/50".
static func _split(a: Dictionary) -> String:
	var d := float(a.get("damage", 0.0))
	return "%s/%s" % [_num(d), _num(roundf(d * float(a.get("splash", 1.0))))]


## "110/80/110" for a list of numbers.
static func _nums(list: Array) -> String:
	var parts: Array = []
	for v: Variant in list:
		parts.append(_num(v))
	return "/".join(PackedStringArray(parts))


static func _num(v: Variant) -> String:
	var f := float(v)
	return str(int(f)) if is_equal_approx(f, roundf(f)) else "%.1f" % f
