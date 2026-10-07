extends RefCounted
## Tooltips: what an ability (or your hero's attack) does right now — the
## numbers at its current level with your upgrades applied, the base value
## dimmed beside any number an upgrade changed, and what the next level brings.
## Used by the HUD (hover a Q W E R slot / the build panel's hero box) and the
## shop's ability row. hero.gd's cast() uses damage_scale / cooldown_scale too,
## so the tooltip and the real cast can't disagree.
##
## The description line is each ability's hand-written `desc` in heroes.gd.

const Heroes := preload("res://scripts/heroes.gd")
const Unit := preload("res://scripts/unit.gd")

const WIDTH := 360.0
const BG := Color(0.05, 0.07, 0.09, 0.95)
const DIM := Color(1, 1, 1, 0.45)
const NEXT := Color("#ffd54f")


## Multiplier on an ability's damage from upgrades (`mods` = Upgrades.stacked).
static func damage_scale(mods: Dictionary, slot: String, ult_off := false) -> float:
	var s: float = 1.0 + mods.get("ability_damage", 0.0)
	if slot == "R" and not ult_off:
		s *= 1.0 + mods.get("ult_damage", 0.0)
	return s


## Cooldown cards add up, but never past COOLDOWN_CAP; the ultimate's own
## cut (Overcharge) applies on top, never below ULT_FLOOR of its cooldown.
## Breaking the game should be very hard, not impossible.
const COOLDOWN_CAP := 0.6
const ULT_FLOOR := 0.2


## Multiplier on an ability's cooldown from upgrades.
static func cooldown_scale(mods: Dictionary, slot: String) -> float:
	var s: float = 1.0 - minf(mods.get("cooldown", 0.0), COOLDOWN_CAP)
	if slot == "R":
		s = maxf(ULT_FLOOR, s * (1.0 - mods.get("ult_cd", 0.0)))
	return s


## The tooltip for hero `h`'s ability in `slot` at `level`:
## {title, desc, rows: [[label, value, base]], next: [String]}. `base` is ""
## unless upgrades changed the value.
static func ability(h: Dictionary, slot: String, level: int, mods: Dictionary, damage_mult := 1.0) -> Dictionary:
	var a := Heroes.ability_at(h, slot, level)
	var ds := damage_scale(mods, slot) * damage_mult
	var rows: Array = []
	var d: float = a.get("damage", 0.0)
	if a["kind"] == "rage":
		rows.append(["contact", "%s/s for %ss" % [_d(d * ds), _n(a.get("duration", 0.0))], _d(d) + "/s" if ds != 1.0 else ""])
		rows.append(["swells", "+%d%% size (hitbox too)" % roundi(float(a.get("grow", 0.0)) * 100.0), ""])
		rows.append(["damage taken", "−%d%%" % roundi(float(a.get("damage_reduction", 0.0)) * 100.0), ""])
		if float(a.get("stun", 0.0)) > 0.0:
			rows.append(["bodies", "shoves aside; %ss stun every %ss" % [_n(a["stun"]), _n(a.get("stun_every", 1.5))], ""])
		d = 0.0  # handled
	elif a["kind"] == "spin":
		rows.append(["damage", "%s over %ss" % [_d(d * ds), _n(a.get("duration", 0.0))], _d(d) if ds != 1.0 else ""])
		rows.append(["grows", "×%s → ×%s (its corners cut)" % [_n(a.get("grow_start", 1.0)), _n(a.get("grow_end", 1.0))], ""])
		d = 0.0
	elif a["kind"] == "shield":
		rows.append(["shield", "%s (creeps %d%% of their max health) for %ss" % [_n(a["shield"]), roundi(float(a.get("creep_pct", 0.15)) * 100.0), _n(a.get("duration", 3.0))], ""])
	if d > 0.0:
		var pd: Array = a.get("pulse_damage", [])
		var each := "each" if int(a.get("count", 1)) > 1 else ""
		if not pd.is_empty():
			rows.append(["pulses", _list(pd, ds), _list(pd, 1.0) if ds != 1.0 else ""])
		elif a.get("splash", 1.0) < 1.0:
			var o: float = d * a["splash"]
			rows.append(["damage", "%s centre · %s others" % [_d(d * ds), _d(o * ds)], "%s · %s" % [_d(d), _d(o)] if ds != 1.0 else ""])
		elif a.get("edge_damage", 1.0) < 1.0:
			var e: float = a["edge_damage"]
			rows.append(["damage", "%s centre → %s edge" % [_d(d * ds), _d(d * e * ds)], "%s → %s" % [_d(d), _d(d * e)] if ds != 1.0 else ""])
		elif a.has("pulses"):
			rows.append(["damage", "%s × %d pulses" % [_d(d * ds), a["pulses"]], _d(d) if ds != 1.0 else ""])
		else:
			rows.append(["damage", (_d(d * ds) + " " + each).strip_edges(), _d(d) if ds != 1.0 else ""])
		if a.get("finale", 0.0) > 0.0:
			rows[-1][1] += " in its last %ss" % _n(a["finale"])
		elif a.has("duration"):
			rows[-1][1] += " over %ss" % _n(a["duration"])
	if a.has("count"):
		rows.append(["blasts" if a["kind"] == "ground" else "projectiles", str(a["count"]), ""])
	for k: String in ["radius", "range", "width", "scatter"]:
		if a.has(k) and float(a[k]) > 0.0 and not (k == "radius" and a["kind"] == "spin"):
			rows.append([Heroes.LABELS.get(k, k), _n(a[k]), ""])
	if a.get("expose", 0.0) > 0.0:
		rows.append(["exposed", "+%d%% damage taken for %ss" % [roundi(a["expose"] * 100.0), _n(a.get("expose_time", 3.0))], ""])
	if a.get("blind", false):
		rows.append(["blind", "enemies hit miss their next attack", ""])
	if a.get("min_range", 0.0) > 0.0:
		rows.append(["can't land", "within %s of you" % _n(a["min_range"]), ""])
	if a.get("near_damage", 1.0) < 1.0:
		rows.append(["by distance", "%d%% up close → full at %s" % [roundi(a["near_damage"] * 100.0), _n(a.get("full_at", 0.0))], ""])
	if a.has("angle"):
		rows.append(["angle", "%s°" % _n(a["angle"]), ""])
	if a.get("attack_slow", 0.0) > 0.0:
		rows.append(["attack slow", "%d%% for %ss" % [roundi(a["attack_slow"] * 100.0), _n(a.get("slow_time", 0.0))], ""])
	if a.get("burn_dps", 0.0) > 0.0:
		var bt: float = a.get("burn_time", 0.0) + mods.get("burn_time", 0.0)  # Kindling
		rows.append(["burn", "%s/s for %ss after they leave" % [_d(a["burn_dps"] * ds), _n(bt)], _d(a["burn_dps"]) + "/s" if ds != 1.0 else ""])
	if a.get("bleed", 0.0) > 0.0:
		rows.append(["bleed", "your attacks +%d%% on enemies inside" % roundi(a["bleed"] * 100.0), ""])
	if a.get("move_slow", 0.0) > 0.0 and a["kind"] == "ground":
		rows.append(["slow", "%d%% while inside, then %ss" % [roundi(a["move_slow"] * 100.0), _n(a.get("slow_time", 1.0))], ""])
		if a.has("duration"):
			rows.append(["lasts", _n(a["duration"]) + "s", ""])
	elif a.get("move_slow", 0.0) > 0.0:
		rows.append(["slow", "%d%% for %ss" % [roundi(a["move_slow"] * 100.0), _n(a.get("slow_time", 1.5))], ""])
	if a.get("knockback", 0.0) > 0.0:
		rows.append(["knockback", "%s px aside" % _n(a["knockback"]), ""])
	if a.get("windup", 0.0) > 0.0:
		rows.append(["windup", _n(a["windup"]) + "s before it goes" + (" (planted; a stun cancels it)" if a["kind"] == "beam" else ""), ""])
	if a.get("pierce_creeps", false):
		rows.append(["creeps", "cuts through them, stops at a hero", ""])
	if a.get("ignore_creeps", false):
		rows.append(["creeps", "passes through them", ""])
	if a.get("tether", 0.0) > 0.0:
		rows.append(["tether", "%ss, at most %s apart" % [_n(a["tether"]), _n(a.get("tether_len", 220.0))], ""])
	if a.get("zone_slow", 0.0) > 0.0:
		rows.append(["combo", "slows %d%% if they're burning from your Blast" % roundi(a["zone_slow"] * 100.0), ""])
	if a.get("pass_through", false):
		rows.append(["passes through", "hits each enemy once", ""])
	if a.get("pierce", false):
		rows.append(["pierces", "hits everything in line", ""])
	if d > 0.0:
		for t: Array in [["heroes", "vs_heroes", Unit.ABILITY_VS_HEROES], ["creeps", "vs_creeps", Unit.ABILITY_VS_CREEPS], ["towers", "vs_structures", Unit.ABILITY_VS_STRUCTURES]]:
			var m: float = a.get(t[1], t[2])
			if m != 1.0:
				rows.append(["vs " + t[0], "%d%%" % roundi(m * 100.0), ""])
	if slot == "Q" and mods.get("echo", 0.0) > 0.0:
		rows.append(["Echo", "hits again 0.4 s later, half damage", ""])
	var ch := int(a.get("charges", 1)) + (int(mods.get("q_charges", 0.0)) if slot == "Q" else 0)  # Reserve
	if ch > 1:
		rows.append(["charges", "%d in a row, each refills on the cooldown" % ch, ""])
	var cs := cooldown_scale(mods, slot)
	rows.append(["cooldown", _n(a["cooldown"] * cs) + "s", _n(a["cooldown"]) + "s" if cs != 1.0 else ""])
	var mc := (1.0 + float(mods.get("mana_cost", 0.0))) * (1.0 - Unit.ability_haste)  # Overclock; overtime
	rows.append(["mana", _n(a["cost"] * mc), _n(a["cost"]) if mc != 1.0 else ""])
	var nxt: Array = []
	if level < Heroes.MAX_LEVEL:
		nxt = Heroes.level_changes(h, slot, level + 1)
	return {"title": "%s   %s · level %s" % [a["name"], slot, Heroes.ROMAN[level]], "desc": a.get("desc", ""),
		"rows": rows, "next": nxt, "next_title": "Level %s:" % Heroes.ROMAN[mini(level + 1, Heroes.MAX_LEVEL)]}


## Your hero's auto-attack and core stats, live (`hero` = a hero.gd node).
static func hero_stats(hero: Node) -> Dictionary:
	var dmg: float = hero.attack_damage()
	var per_s: float = 1.0 / hero.attack_interval()
	var rows: Array = [
		["attack", _d(dmg), _d(hero.def["attack"]["damage"]) if not is_equal_approx(dmg, hero.def["attack"]["damage"]) else ""],
		["attacks / s", "%.2f" % per_s, ""],
		["DPS", _d(dmg * per_s) + (" (+ twin shot)" if hero.mod("twin_shot") > 0.0 else ""), ""],
		["attack range", _n(hero.attack_range()), ""],
		["speed", _n(hero.speed), ""],
		["health", "%d / %d" % [ceili(hero.hp), int(hero.max_hp)], ""],
		["mana regen", "%s / s" % _n(hero.def["regen"] + hero.mod("mana_regen")), ""],
	]
	return {"title": hero.def["name"], "desc": "", "rows": rows, "next": [], "next_title": ""}


## A hero's base stats from its definition (hero select: no hero node yet).
static func hero_base(h: Dictionary) -> Dictionary:
	var atk: Dictionary = h["attack"]
	var rows: Array = [
		["health", _n(h["hp"]), ""],
		["mana", "%s  (+%s / s)" % [_n(h["mana"]), _n(h["regen"])], ""],
		["speed", _n(h["speed"]), ""],
		["attack", "%s every %ss" % [_d(atk["damage"]), _n(atk["interval"])], ""],
		["attack range", _n(atk["range"]), ""],
	]
	return {"title": h["name"], "desc": "", "rows": rows, "next": [], "next_title": ""}


## Draw tooltip `info` beside `anchor`: above it (or below when `below`),
## kept on screen.
static func draw(c: CanvasItem, font: Font, info: Dictionary, anchor: Rect2, view: Vector2, below := false, beside := false) -> void:
	var pad := 12.0
	var desc: String = info["desc"]
	var desc_h := 0.0
	if desc != "":
		desc_h = font.get_multiline_string_size(desc, HORIZONTAL_ALIGNMENT_LEFT, WIDTH - 2.0 * pad, 14).y + 6.0
	var rows: Array = info["rows"]
	var nxt: Array = info["next"]
	var h := pad + 22.0 + desc_h + rows.size() * 19.0 + (8.0 + 18.0 + nxt.size() * 17.0 if not nxt.is_empty() else 0.0) + pad
	var pos: Vector2
	if beside:
		pos = Vector2(anchor.end.x + 10.0, anchor.position.y)
	elif below:
		pos = Vector2(anchor.get_center().x - WIDTH / 2.0, anchor.end.y + 8.0)
	else:
		pos = Vector2(anchor.get_center().x - WIDTH / 2.0, anchor.position.y - h - 8.0)
	pos.x = clampf(pos.x, 8.0, view.x - WIDTH - 8.0)
	pos.y = clampf(pos.y, 8.0, view.y - h - 8.0)
	var r := Rect2(pos, Vector2(WIDTH, h))
	c.draw_rect(r, BG)
	c.draw_rect(r, Color(1, 1, 1, 0.25), false, 1.5)
	var y := pos.y + pad + 16.0
	c.draw_string(font, Vector2(pos.x + pad, y), info["title"], HORIZONTAL_ALIGNMENT_LEFT, WIDTH - 2.0 * pad, 17, Color.WHITE)
	y += 8.0
	if desc != "":
		c.draw_multiline_string(font, Vector2(pos.x + pad, y + 12.0), desc, HORIZONTAL_ALIGNMENT_LEFT, WIDTH - 2.0 * pad, 14, -1, Color(1, 1, 1, 0.75))
		y += desc_h
	for row: Array in rows:
		y += 19.0
		c.draw_string(font, Vector2(pos.x + pad, y), row[0], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, DIM)
		var vx := pos.x + pad + 110.0
		c.draw_string(font, Vector2(vx, y), row[1], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, Color.WHITE)
		if row[2] != "":
			var w := font.get_string_size(row[1], HORIZONTAL_ALIGNMENT_LEFT, -1, 14).x
			c.draw_string(font, Vector2(vx + w + 8.0, y), "(%s)" % row[2], HORIZONTAL_ALIGNMENT_LEFT, -1, 13, DIM)
	if not nxt.is_empty():
		y += 8.0 + 18.0
		c.draw_string(font, Vector2(pos.x + pad, y), info["next_title"], HORIZONTAL_ALIGNMENT_LEFT, -1, 14, NEXT)
		for line: String in nxt:
			y += 17.0
			c.draw_string(font, Vector2(pos.x + pad + 12.0, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, 13, Color(NEXT, 0.8))


static func _n(v: Variant) -> String:
	var f := float(v)
	return str(roundi(f)) if absf(f - roundf(f)) < 0.05 else "%.1f" % f


static func _d(v: float) -> String:  # damage: whole numbers
	return str(roundi(v))


static func _list(vals: Array, s: float) -> String:
	var parts: Array = []
	for v: Variant in vals:
		parts.append(_d(float(v) * s))
	return " / ".join(PackedStringArray(parts))
