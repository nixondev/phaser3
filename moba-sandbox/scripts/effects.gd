extends RefCounted
## The visual effects: move marker, bolt projectile, ground blast, nova, dash
## afterimages and damage numbers. Each is a small self-drawing Node2D that
## removes itself. Hits go through targets.gd; every damaging effect has a
## `team` (default 0, yours) and only hits that team's enemies, and a
## `source` (the hero that made it, or null) passed on with each hit.

const Targets := preload("res://scripts/targets.gd")


## A number that pops up, floats and fades.
class DamageNumber extends Node2D:
	const LIFE := 0.9
	var _text: String
	var _colour: Color
	var _size: int
	var _t := 0.0

	func _init(at: Vector2, amount: int, colour: Color, big := false) -> void:
		position = at
		_text = str(amount)
		_colour = colour.lightened(0.25)
		_size = 34 if big else 24
		z_index = 10

	func _process(delta: float) -> void:
		_t += delta / LIFE
		position.y -= 55.0 * delta * (1.0 - _t)
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var pop := 1.0 + 0.35 * maxf(0.0, 1.0 - _t * 6.0)  # quick pop, then settle
		var a := clampf((1.0 - _t) * 2.0, 0.0, 1.0)
		var font := ThemeDB.fallback_font
		var size := int(_size * pop)
		var w := font.get_string_size(_text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		var at := Vector2(-w / 2.0, 0)
		draw_string_outline(font, at, _text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 6, Color(0, 0, 0, 0.8 * a))
		draw_string(font, at, _text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(_colour, a))


## "+40" in gold, rising from a last hit (only your hero's earnings show).
class GoldNumber extends Node2D:
	const LIFE := 1.1
	const GOLD := Color("#ffd54f")
	var _text: String
	var _t := 0.0

	var _tint: Color = GOLD

	func _init(at: Vector2, amount: int, tint := GOLD) -> void:
		position = at + Vector2(0, -20)
		_text = ("+%d" % amount) if amount >= 0 else ("−%d" % -amount)
		_tint = tint
		z_index = 11

	func _process(delta: float) -> void:
		_t += delta / LIFE
		position.y -= 40.0 * delta
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var a := clampf((1.0 - _t) * 2.5, 0.0, 1.0)
		var pop := 1.0 + 0.4 * maxf(0.0, 1.0 - _t * 8.0)
		var font := ThemeDB.fallback_font
		var size := int(22 * pop)
		var w := font.get_string_size(_text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		var at := Vector2(-w / 2.0 + 9.0, 0)
		draw_circle(at + Vector2(-12, -7), 7.0 * pop, Color(_tint, a))  # coin
		draw_arc(at + Vector2(-12, -7), 7.0 * pop, 0.0, TAU, 16, Color(0.45, 0.3, 0.0, a), 2.0)
		draw_string_outline(font, at, _text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, 6, Color(0, 0, 0, 0.8 * a))
		draw_string(font, at, _text, HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(_tint, a))


## "!" over a denied creep — nobody got its gold.
class DenyMark extends Node2D:
	const LIFE := 0.9
	var _colour: Color
	var _t := 0.0

	func _init(at: Vector2, colour: Color) -> void:
		position = at + Vector2(0, -24)
		_colour = colour
		z_index = 11

	func _process(delta: float) -> void:
		_t += delta / LIFE
		position.y -= 30.0 * delta
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var a := clampf((1.0 - _t) * 2.5, 0.0, 1.0)
		var size := int(34 * (1.0 + 0.4 * maxf(0.0, 1.0 - _t * 8.0)))
		var font := ThemeDB.fallback_font
		var w := font.get_string_size("!", HORIZONTAL_ALIGNMENT_LEFT, -1, size).x
		draw_string_outline(font, Vector2(-w / 2.0, 0), "!", HORIZONTAL_ALIGNMENT_LEFT, -1, size, 7, Color(0, 0, 0, 0.85 * a))
		draw_string(font, Vector2(-w / 2.0, 0), "!", HORIZONTAL_ALIGNMENT_LEFT, -1, size, Color(_colour, a))


## A short lightning line from a tank creep to what it stunned.
class Zap extends Node2D:
	var _to: Vector2
	var _colour: Color
	var _t := 0.0

	func _init(from: Vector2, to: Vector2, colour: Color) -> void:
		position = from
		_to = to - from
		_colour = colour
		z_index = 5

	func _process(delta: float) -> void:
		_t += delta / 0.25
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var pts := PackedVector2Array([Vector2.ZERO])
		var side := _to.orthogonal().normalized()
		for i in range(1, 6):
			pts.append(_to * (i / 6.0) + side * randf_range(-10.0, 10.0))
		pts.append(_to)
		draw_polyline(pts, Color(_colour.lightened(0.5), 1.0 - _t), 4.0 * (1.0 - _t) + 1.0)


## A shrinking ring where you clicked: green for move, red for attack-move.
class MoveMarker extends Node2D:
	var _t := 0.0
	var _colour: Color

	func _init(at: Vector2, colour := Color(0.45, 1.0, 0.55)) -> void:
		position = at
		_colour = colour

	func _process(delta: float) -> void:
		_t += delta / 0.45
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var r := lerpf(22.0, 6.0, _t)
		var c := Color(_colour, 1.0 - _t)
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 32, c, 3.0)
		for i in 4:
			var d := Vector2.from_angle(i * TAU / 4.0 + PI / 4.0)
			draw_line(d * (r + 4.0), d * (r + 12.0), c, 3.0)


## An auto-attack: a shot that homes on its target and hits on arrival.
## Heroes fire the default pale one; ranged creeps and towers pass their team
## colour, a size and `quiet` (no damage number unless it hits a hero).
class AttackShot extends Node2D:
	const SPEED := 1100.0
	var _target: Node2D
	var _damage: float
	var _colour: Color
	var _quiet: bool
	var _size: float
	var _source: Node2D
	var speed_mult := 1.0     # Keen Eye: faster shots
	var extra_damage := 0.0   # Spellblade: this shot carries a bonus…
	var on_hit_slow := 0.0    # …and slows what it hits for 1 s
	var volley := -1          # which round of attacks it's from (a blind misses the whole round)

	func _init(from: Vector2, target: Node2D, damage: float, colour := Color("#fff3c4"), quiet := false, size := 6.0, source: Node2D = null) -> void:
		position = from
		_target = target
		_damage = damage
		_colour = colour
		_quiet = quiet
		_size = size
		_source = source

	func _process(delta: float) -> void:
		if not is_instance_valid(_target) or not _target.is_targetable():
			queue_free()
			return
		var to := _target.position - position
		var step := SPEED * speed_mult * delta
		if to.length() <= step + _target.radius * 0.5:
			var src: Node2D = _source if is_instance_valid(_source) else null
			if src != null and src.has_method("use_miss") and src.use_miss(_target, volley):  # its attacker was blinded (RUMOR) before this landed
				queue_free()
				return
			var bonus: float = _target.bleed_bonus(src)  # bleeding in its TRAP: hits harder (and shows big)
			var dmg := _damage
			if src != null and src.has_method("attack_damage_vs"):  # a hero's on-hit cards (hero.gd)
				dmg = src.attack_damage_vs(_target, dmg)
			dmg += extra_damage  # Spellblade's flat bonus: not multiplied by the on-hit cards
			var big := bonus > 0.0 or extra_damage > 0.0
			var tgt := _target
			tgt.take_damage(dmg * (1.0 + bonus), Color("#ff8a80") if bonus > 0.0 else Color.WHITE, big, _quiet, src)
			if on_hit_slow > 0.0 and is_instance_valid(tgt) and tgt.is_targetable() and not tgt.is_in_group("towers"):
				tgt.slow_moves(on_hit_slow, 1.0)
			if src != null and src.has_method("on_attack_landed") and is_instance_valid(tgt):
				src.on_attack_landed(tgt, extra_damage > 0.0)
			queue_free()
			return
		position += to.normalized() * step
		rotation = to.angle()
		queue_redraw()

	func _draw() -> void:
		draw_line(Vector2(-3.0 * _size, 0), Vector2.ZERO, Color(_colour, 0.4), _size * 0.7)
		draw_circle(Vector2.ZERO, _size, _colour)
		if extra_damage > 0.0:  # Spellblade: a charged shot
			draw_arc(Vector2.ZERO, _size + 4.0, 0.0, TAU, 16, Color(_colour.lightened(0.5), 0.9), 2.0)



## Q — a skillshot: flies straight until it runs out of range. Stops at the
## first enemy it hits, unless `pierce` (then it hits each one once, going on).
class Bolt extends Node2D:
	var team := 0
	var source: Node2D = null
	var hit := {}  # the ability's hit info (hero.gd ability_hit)
	const SPEED := 1500.0
	const HIT_RADIUS := 12.0
	var _damage: float
	var _dir: Vector2
	var _range: float
	var _travelled := 0.0
	var _colour: Color
	var pierce := false
	var pierce_creeps := false  # flies through creeps (hitting each once), stops at the first hero / tower
	var fx := ""  # look: "" a glowing bolt, "star" a spinning barbed throwing star
	var _hit := {}
	var _spin := 0.0

	func _init(from: Vector2, dir: Vector2, max_range: float, colour: Color, damage: float) -> void:
		position = from
		_damage = damage
		_dir = dir
		_range = max_range
		_colour = colour
		rotation = dir.angle()

	func _process(delta: float) -> void:
		var step := SPEED * delta
		position += _dir * step
		_travelled += step
		_spin += delta * 46.0  # near the most a 4-point star can show at 60 fps before it seems to slow (the blur sells the rest)
		var hits: Array = Targets.enemies_in(get_tree(), position, HIT_RADIUS, team)
		if pierce:
			for u: Node2D in hits:
				if not _hit.has(u):
					_hit[u] = true
					u.take_damage(_damage, _colour, false, false, source, hit)
			if _travelled >= _range:
				queue_free()
		elif pierce_creeps:  # through the wave, cutting each creep, until it meets something that isn't one
			for u: Node2D in hits:
				if _hit.has(u):
					continue
				_hit[u] = true
				u.take_damage(_damage, _colour, false, false, source, hit)
				if not u.is_in_group("creeps"):
					queue_free()
					return
			if _travelled >= _range:
				queue_free()
		elif not hits.is_empty():  # single target: the first thing it touches
			hits[0].take_damage(_damage, _colour, false, false, source, hit)
			queue_free()
		elif _travelled >= _range:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var fade := clampf((_range - _travelled) / 120.0, 0.0, 1.0)
		if fx == "star":  # a spinning four-point star with hooked (barbed) tips
			draw_circle(Vector2(-14.0, 0), 6.0, Color(_colour, 0.25 * fade))  # a faint smear behind
			for blur in [3, 2, 1, 0]:  # motion blur: faint copies at the angles it just spun through
				var col := Color(_colour.lightened(0.25), fade * (1.0 if blur == 0 else 0.22))
				for k in 4:
					var ang: float = _spin - blur * 0.22 - rotation + TAU * k / 4.0  # spins on screen, whatever way it flies
					var tip := Vector2.from_angle(ang) * 13.0
					var hook := Vector2.from_angle(ang + 0.55) * 9.0  # the barb: a hook trailing each tip
					draw_colored_polygon(PackedVector2Array([Vector2.from_angle(ang - 0.5) * 3.5, tip, hook, Vector2.from_angle(ang + 0.5) * 3.5]), col)
			draw_circle(Vector2.ZERO, 3.5, Color(0.06, 0.08, 0.1, fade))  # the hole in the middle
			return
		for i in 6:  # trail
			var t := i / 6.0
			draw_circle(Vector2(-t * 70.0, 0), lerpf(11.0, 3.0, t), Color(_colour, (1.0 - t) * 0.5 * fade))
		draw_circle(Vector2.ZERO, 16.0, Color(_colour, 0.35 * fade))
		draw_circle(Vector2.ZERO, 10.0, Color(_colour.lightened(0.5), fade))


## W — ground-targeted: a warning ring fills in, then it detonates.
class Blast extends Node2D:
	var team := 0
	var source: Node2D = null
	var hit := {}  # the ability's hit info (hero.gd ability_hit)
	const WARN := 0.55
	const BOOM := 0.3
	const STORM := 0.6  # lightning: an electrical haze lingers this long after the burst
	## The elaborate looks (fire's flame window, lightning's burst and storm) —
	## off for now: zones and bursts draw plain, in their colour. Animation is
	## kept for things in motion (the SHOCK orb's crackle in flight).
	const ELABORATE := false
	var _damage: float
	var _detonated := false
	var _radius: float
	var _colour: Color
	var _t := 0.0
	var warn := WARN  # 0 = goes off at once (the orb's detonation)
	var splash := 1.0 # damage share for everyone but the enemy nearest the centre
	## Lingering zone: > 0 = after the warning it stays this long, dealing its
	## damage in `ticks` equal parts (standing in it throughout = the full
	## damage). The enemy nearest the centre is re-picked every tick.
	var duration := 0.0
	var ticks := 1
	var _ticked := 0
	## Slowing zone (TRAP): enemies inside move `move_slow` slower, and stay
	## slowed `slow_time` s after they leave.
	var move_slow := 0.0
	var slow_time := 1.0
	## > 0 = the zone only deals its damage in its last `finale` seconds (the
	## TRAP' closing spin), split over the ticks.
	var finale := 0.0
	## > 0 = the caster's auto-attacks hit enemies inside for this much more (bleed).
	var bleed := 0.0
	## Burn: enemies the zone touches burn, burn_dps a second for burn_time s
	## after they leave it (unit.gd burn).
	var burn_dps := 0.0
	var burn_time := 0.0
	## RUMOR: everyone it hits misses their next attack (unit.gd blind).
	var blind := false
	## Look: "" plain, "fire" (flames and embers over the zone), "lightning"
	## (the burst cracks into jagged bolts).
	var fx := ""

	func _init(at: Vector2, radius: float, colour: Color, damage: float) -> void:
		position = at
		_radius = radius
		_colour = colour
		_damage = damage

	func _process(delta: float) -> void:
		_t += delta
		if duration > 0.0:  # lingering zone: tick damage while it lasts
			if _t >= warn:  # everyone inside is marked (combos), and a slowing zone grips them
				for d: Node2D in Targets.enemies_in(get_tree(), position, _radius, team):
					if is_instance_valid(source):
						d.mark_zone(source)
					if move_slow > 0.0:
						d.slow_moves(move_slow, slow_time)
					if burn_dps > 0.0:
						d.burn(source if is_instance_valid(source) else null, burn_dps, burn_time)
					if bleed > 0.0 and is_instance_valid(source):
						d.bleed(source, bleed)
			var dmg_start := warn + (duration - finale if finale > 0.0 else 0.0)
			var dmg_span := finale if finale > 0.0 else duration
			while _ticked < ticks and _t >= dmg_start + dmg_span * (_ticked + 1) / ticks:
				_ticked += 1
				_hit(_damage / ticks)
			if _t >= warn + duration:
				queue_free()
			queue_redraw()
			return
		if _t >= warn and not _detonated:
			_detonated = true
			_hit(_damage)
		if _t >= warn + BOOM + (STORM if fx == "lightning" and ELABORATE else 0.0):
			queue_free()
		queue_redraw()

	## One hit on everything inside: the enemy nearest the centre (right now)
	## takes `amount`, the rest `amount × splash`.
	func _hit(amount: float) -> void:
		var hits: Array = Targets.enemies_in(get_tree(), position, _radius, team)
		var centre: Node2D = null
		for d: Node2D in hits:
			if centre == null or d.position.distance_to(position) < centre.position.distance_to(position):
				centre = d
		var douse: float = float(hit.get("douse", 0.0))  # SHOCK: more on your burning enemies, and the fire goes out
		for d: Node2D in hits:
			var amt: float = amount if d == centre else amount * splash
			var doused: bool = douse > 0.0 and is_instance_valid(source) and d.is_burning_from(source)
			d.take_damage(amt * (1.0 + douse) if doused else amt, _colour, doused, false, source, hit)
			if doused and is_instance_valid(d):
				d.douse(source)
				if float(hit.get("douse_slow", 0.0)) > 0.0 and d.is_targetable():
					d.slow_moves(float(hit["douse_slow"]), float(hit.get("douse_slow_time", 1.5)))
			if blind and is_instance_valid(d) and d.is_targetable():
				d.blind()

	## A window onto a much bigger fire: the circle is filled edge to edge with
	## rising, flickering flame tongues in layers (deep red at the back, white-hot
	## in front), all cut off at the rim as if the fire carries on beyond it.
	func _draw_fire(left: float) -> void:
		var r := _radius
		var circle := PackedVector2Array()
		for i in 40:
			circle.append(Vector2.from_angle(TAU * i / 40.0) * r)
		var glow := (0.45 + 0.55 * left) * 0.7  # overall opacity: lower = more see-through
		draw_colored_polygon(circle, Color(0.45, 0.06, 0.02, 0.3 * glow))  # the fire's dark heart
		var layers := [  # colour, tongue width, height, rise speed
			[Color(0.75, 0.12, 0.03), 0.55, 1.1, 70.0],
			[Color(1.0, 0.35, 0.05), 0.42, 0.9, 95.0],
			[Color(1.0, 0.62, 0.12), 0.32, 0.7, 120.0],
			[Color(1.0, 0.88, 0.45), 0.2, 0.45, 150.0],
		]
		var rng := RandomNumberGenerator.new()
		rng.seed = get_instance_id()
		for li in layers.size():
			var L: Array = layers[li]
			var w: float = r * float(L[1])
			var h: float = r * float(L[2])
			var cols := int(ceil(2.0 * r / (w * 0.7))) + 1
			for row in 3:  # rows scroll upward and wrap: the fire keeps rising past the rim
				var y_base := r + h * 0.3 - fmod(_t * float(L[3]) + row * h * 0.75 + li * 23.0, h * 2.25)
				for c in cols:
					var x := -r + c * w * 0.7 + (w * 0.35 if row % 2 == 1 else 0.0) + rng.randf_range(-6.0, 6.0)
					var ph := rng.randf() * TAU
					var hh := h * (0.75 + 0.25 * sin(_t * 9.0 + ph))  # flicker
					var tongue := PackedVector2Array()
					for k in 6:  # left side, base to tip, waving
						var t := k / 5.0
						tongue.append(Vector2(x - w * 0.5 * (1.0 - t) + sin(_t * 7.0 + ph + t * 3.0) * 5.0 * t, y_base - hh * t))
					for k in range(4, -1, -1):  # right side, tip back down
						var t := k / 5.0
						tongue.append(Vector2(x + w * 0.5 * (1.0 - t) + sin(_t * 7.0 + ph + t * 3.0) * 5.0 * t, y_base - hh * t))
					for k in range(1, 5):  # a rounded bottom, right to left (no flat base, so rows don't stripe)
						var bot := PI * k / 5.0
						tongue.append(Vector2(x + cos(bot) * w * 0.5, y_base + sin(bot) * w * 0.35))
					for piece: PackedVector2Array in Geometry2D.intersect_polygons(tongue, circle):
						draw_colored_polygon(piece, Color(L[0], (0.26 - 0.05 * li) * glow))  # front layers faintest: a subtle core
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 64, Color(1.0, 0.55, 0.15, 0.7 * glow), 2.0)

	## The burst as lightning: a white flash and jagged bolts cracking outward.
	func _draw_lightning(k: float) -> void:
		# the storm: a flickering electrical haze over the area, with stray sparks,
		# swelling with the burst and lingering a little after it
		var haze := clampf(1.0 - (_t - warn) / (BOOM + STORM), 0.0, 1.0)
		for i in 7:
			var p := Vector2.from_angle(randf() * TAU) * randf() * _radius * 0.6
			draw_circle(p, _radius * randf_range(0.35, 0.6), Color(_colour.lightened(0.2), randf_range(0.04, 0.09) * haze))
		for i in 3:
			var at := Vector2.from_angle(randf() * TAU) * randf() * _radius * 0.85
			var tip := at + Vector2.from_angle(randf() * TAU) * randf_range(10.0, 26.0)
			draw_polyline(Lightning.zigzag(at, tip, 3, 4.0), Color(Color.WHITE, 0.75 * haze), 1.5)
		if k > 1.0:
			return  # past the burst: just the haze
		var a := 1.0 - k
		draw_circle(Vector2.ZERO, _radius * lerpf(0.5, 1.0, k), Color(_colour.lightened(0.5), 0.35 * a))
		for i in 8:
			var tip := Vector2.from_angle(TAU * i / 8.0 + randf() * 0.4) * _radius * randf_range(0.75, 1.1)
			draw_polyline(Lightning.zigzag(Vector2.ZERO, tip, 5, 9.0), Color(_colour.lightened(0.3), a), 3.0 * a + 1.0)
			draw_polyline(Lightning.zigzag(Vector2.ZERO, tip * 0.8, 4, 6.0), Color(Color.WHITE, a), 1.5)
		draw_circle(Vector2.ZERO, 16.0 * a, Color(Color.WHITE, a))

	func _draw() -> void:
		if duration > 0.0 and _t >= warn:  # the zone on the ground, fading as it runs out
			var left := 1.0 - (_t - warn) / duration
			var pulse := 0.5 + 0.5 * sin(_t * 14.0)
			if move_slow > 0.0:  # TRAP: a ring of barbs creeping counter-clockwise; in the finale it whips the other way
				var col := Color(_colour.lightened(0.3), 0.55 + 0.45 * left)
				var n := maxi(10, int(_radius / 7.0))
				var fin_at := warn + duration - finale
				var spinning := finale > 0.0 and _t >= fin_at
				var spin := -0.6 * minf(_t, fin_at) if finale > 0.0 else -0.6 * _t  # screen y is down: negative = counter-clockwise
				var lean := -1.0
				if spinning:
					var f := _t - fin_at
					spin += 6.0 * f + 9.0 * f * f  # winding up, clockwise
					lean = 1.0
					col = Color(_colour.lightened(0.55), 1.0)
				for i in n:
					var ang := spin + TAU * i / n
					var half := PI / n * 0.55
					var tip := Vector2.from_angle(ang + lean * half * 0.6) * (_radius + (14.0 if spinning else 10.0))  # barbs lean the way it turns
					draw_colored_polygon(PackedVector2Array([Vector2.from_angle(ang - half) * _radius,
						Vector2.from_angle(ang + half) * _radius, tip]), col)
			draw_circle(Vector2.ZERO, _radius, Color(_colour, (0.16 + 0.06 * pulse) * (0.4 + 0.6 * left)))
			if fx == "fire" and ELABORATE:
				_draw_fire(left)
			draw_arc(Vector2.ZERO, _radius, 0.0, TAU, 64, Color(_colour.lightened(0.2), 0.8 * (0.3 + 0.7 * left)), 3.0)
			draw_arc(Vector2.ZERO, _radius * left, 0.0, TAU, 64, Color(_colour, 0.35), 2.0)  # time left
			return
		if _t < warn:
			var k := _t / warn
			draw_circle(Vector2.ZERO, _radius, Color(_colour, 0.08))
			draw_circle(Vector2.ZERO, _radius * k, Color(_colour, 0.18))
			draw_arc(Vector2.ZERO, _radius, 0.0, TAU, 64, Color(_colour, 0.8), 3.0)
		else:
			var k := (_t - warn) / BOOM
			if fx == "lightning" and ELABORATE:
				_draw_lightning(k)
				return
			draw_circle(Vector2.ZERO, _radius * lerpf(0.85, 1.1, k), Color(_colour.lightened(0.4), (1.0 - k) * 0.7))
			draw_arc(Vector2.ZERO, _radius * lerpf(1.0, 1.25, k), 0.0, TAU, 64, Color(Color.WHITE, 1.0 - k), 6.0 * (1.0 - k) + 1.0)


## KAREN's GRIND: a spinning ring of blades that follows its hero, hitting
## everything inside `ticks` times over `duration`, growing from `radius` to
## `radius_end`; hits slow attacks (attack_slow for slow_time).
class Spin extends Node2D:
	const TRAIL := 0.9  # radians of trail behind each corner at full speed
	var team := 0
	var source: Node2D = null
	var hit := {}
	var duration := 2.0
	var ticks := 8
	var attack_slow := 0.0
	var slow_time := 1.5
	var creep_heal := 0.0  # GRIND: the hero heals this much for each creep each cut lands on
	var _damage: float
	var _colour: Color
	var _t := 0.0
	var _ticked := 0

	func _init(colour: Color, damage: float) -> void:
		_colour = colour
		_damage = damage
		z_index = 5

	func _reach() -> float:  # the hero's spinning corners (the body grows as it spins)
		return float(source.spin_reach()) if is_instance_valid(source) and source.has_method("spin_reach") else 60.0

	func _process(delta: float) -> void:
		_t += delta
		if not is_instance_valid(source) or not source.is_targetable():
			queue_free()
			return
		position = source.position
		while _ticked < ticks and _t >= duration * (_ticked + 1) / ticks:
			_ticked += 1
			for u: Node2D in Targets.enemies_in(get_tree(), position, _reach(), team):
				u.take_damage(_damage / ticks, _colour, false, false, source, hit)
				if source.has_method("rage_contact"):
					source.rage_contact(u)  # during RAGE, GRIND's cuts burn like a touch
				if attack_slow > 0.0:
					u.slow_attacks(attack_slow, slow_time)
				if creep_heal > 0.0 and u.is_in_group("creeps") and source.is_targetable():
					source.hp = minf(source.max_hp, source.hp + creep_heal)
		if _t >= duration:
			queue_free()
		queue_redraw()

	func _draw() -> void:  # motion trails swept by the four corners
		var r := _reach()
		var a := 0.6 * (1.0 - maxf(0.0, (_t - duration + 0.2) / 0.2))
		var spin: float = source.spin_angle() + source.facing.angle() if is_instance_valid(source) and source.has_method("spin_angle") else 0.0
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 48, Color(_colour.lightened(0.3), a * 0.35), 2.0)
		var speed: float = source.spin_speed() if is_instance_valid(source) and source.has_method("spin_speed") else 1.0
		for k in 4:  # trails follow the corners, shorter and fainter as the spin winds down
			var ang := spin + PI / 4.0 + TAU * k / 4.0
			if speed > 0.05:
				draw_arc(Vector2.ZERO, r, ang - TRAIL * speed, ang, 12, Color(_colour.lightened(0.4), a * speed), 3.0)


## A hero hit on a shielded tower: "SHIELDED" pops up with a flash of the plate.
class ShieldPuff extends Node2D:
	const LIFE := 0.7
	var _colour: Color
	var _t := 0.0
	var _word := "SHIELDED"

	func _init(at: Vector2, colour: Color, word := "SHIELDED") -> void:
		position = at
		_word = word
		_colour = colour.lightened(0.5)
		z_index = 10

	func _process(delta: float) -> void:
		_t += delta / LIFE
		position.y -= 40.0 * delta
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var a := clampf((1.0 - _t) * 2.0, 0.0, 1.0)
		var font := ThemeDB.fallback_font
		var w := font.get_string_size(_word, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x
		draw_string_outline(font, Vector2(-w / 2.0, 0), _word, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, 5, Color(0, 0, 0, 0.8 * a))
		draw_string(font, Vector2(-w / 2.0, 0), _word, HORIZONTAL_ALIGNMENT_LEFT, -1, 16, Color(_colour, a))


## Lightning shapes for the effects above and below.
class Lightning:
	## A jagged bolt from `a` to `b`: `segs` kinks, each knocked sideways up to `jag` px.
	static func zigzag(a: Vector2, b: Vector2, segs: int, jag: float) -> PackedVector2Array:
		var pts := PackedVector2Array([a])
		var side := (b - a).orthogonal().normalized()
		for i in range(1, segs):
			pts.append(a.lerp(b, float(i) / segs) + side * randf_range(-jag, jag))
		pts.append(b)
		return pts


## Recast orb (KYLE's Bolt): a harmless dot flies out — through units —
## to `target` (at most max range). detonate() (the second press) blows it up
## wherever it is; otherwise it explodes by itself at the end of its line
## (after `linger` seconds there; 0 = at once) for `auto_damage`. Emits
## `finished` so the hero can start the cooldown.
class Orb extends Node2D:
	signal finished
	const DOT := 12.0      # radius: twice an auto-attack shot's
	var team := 0
	var source: Node2D = null
	var hit := {}  # the ability's hit info (hero.gd ability_hit)
	var auto_damage := 0.0  # the blast it sets off by itself at the end
	var echo := false       # Echo epic: the blast repeats at half damage
	var fx := ""            # look of its blasts (and "lightning" crackles in flight)
	var _dir: Vector2
	var _length: float
	var _speed: float
	var _linger: float
	var _radius: float
	var _colour: Color
	var _travelled := 0.0
	var _t := 0.0
	var _done := false

	func _init(from: Vector2, target: Vector2, max_range: float, speed: float, linger: float, radius: float, colour: Color) -> void:
		position = from
		var to := target - from
		_dir = to.normalized() if to.length() > 1.0 else Vector2.RIGHT
		_length = clampf(to.length(), 60.0, max_range)
		_speed = speed
		_linger = linger
		_radius = radius
		_colour = colour

	func stopped() -> bool:
		return _travelled >= _length

	func _process(delta: float) -> void:
		_t += delta
		if not stopped():
			var step := minf(_speed * delta, _length - _travelled)
			position += _dir * step
			_travelled += step
		else:
			_linger -= delta
			if _linger <= 0.0:
				detonate(auto_damage, echo)  # never reactivated: explodes at the end of its line
				return
		queue_redraw()

	## The second press: blast at the dot's position (a second, half-strength
	## one `echo_delay` later when `echo` — the Echo epic).
	func detonate(damage: float, echo := false) -> void:
		if _done:
			return
		var parent := get_parent()
		var b := Blast.new(position, _radius, _colour, damage)
		b.warn = 0.0
		b.fx = fx
		b.team = team
		b.source = source
		b.hit = hit
		parent.add_child(b)
		if echo:  # copy what the echo needs — this orb is gone by the time it fires
			var at := position
			var r := _radius
			var col := _colour
			var tm := team
			var src := source
			var h := hit
			var look := fx
			parent.get_tree().create_timer(0.4).timeout.connect(func() -> void:
				if is_instance_valid(parent):
					var e := Blast.new(at, r, col, damage * 0.5)
					e.warn = 0.0
					e.fx = look
					e.team = tm
					e.source = src if is_instance_valid(src) else null
					e.hit = h
					parent.add_child(e))
		_finish()

	func _finish() -> void:
		if _done:
			return
		_done = true
		finished.emit()
		queue_free()

	func _draw() -> void:
		var pulse := 0.5 + 0.5 * sin(_t * 10.0)
		if not stopped():
			for i in range(1, 5):  # a short trail
				draw_circle(-_dir * (i * 9.0), DOT * (0.7 - i * 0.12), Color(_colour, 0.35 - i * 0.07))
		draw_circle(Vector2.ZERO, DOT, Color(_colour, 0.45))
		draw_circle(Vector2.ZERO, DOT * 0.6 + 1.0 * pulse, _colour.lightened(0.5))
		if fx == "lightning":  # a crackling storm round the ball: flickering haze and little arcs
			for i in 4:
				var p := Vector2.from_angle(randf() * TAU) * randf() * 6.0
				draw_circle(p, randf_range(DOT + 8.0, DOT + 20.0), Color(_colour.lightened(0.3), randf_range(0.05, 0.12)))
			for i in 3:
				var tip := Vector2.from_angle(randf() * TAU) * randf_range(DOT + 6.0, DOT + 16.0)
				draw_polyline(Lightning.zigzag(Vector2.ZERO, tip, 3, 3.0), Color(Color.WHITE, 0.85), 1.5)


## R — the ultimate: a shockwave ring expanding from where you stood.
class Nova extends Node2D:
	var team := 0
	var source: Node2D = null
	var hit := {}  # the ability's hit info (hero.gd ability_hit)
	const DURATION := 0.5
	## < 1 = tapers off: full damage at the centre, falling evenly to
	## `edge_damage` × damage at the edge.
	var edge_damage := 1.0
	## Barbed (CHAD's Flurry): the expanding ring is a spinning ring of barbs,
	## like TRAP, instead of a plain band.
	var barbed := false
	var _damage: float
	var _hit := {}
	var _radius: float
	var _colour: Color
	var _t := 0.0

	func _init(at: Vector2, radius: float, colour: Color, damage: float) -> void:
		position = at
		_radius = radius
		_colour = colour
		_damage = damage

	func _process(delta: float) -> void:
		_t += delta / DURATION
		for d in Targets.enemies_in(get_tree(), position, _ring(), team):
			if not _hit.has(d):  # once per unit, as the ring reaches it
				_hit[d] = true
				var near := 1.0 - clampf(d.position.distance_to(position) / _radius, 0.0, 1.0)
				d.take_damage(_damage * lerpf(edge_damage, 1.0, near), _colour, true, false, source, hit)
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _ring() -> float:
		return _radius * (1.0 - pow(1.0 - minf(_t, 1.0), 3.0))  # fast out, eases at the edge

	func _draw() -> void:
		var r := _ring()
		var a := 1.0 - _t
		if barbed:  # a whirling ring of barbs flying outward
			draw_circle(Vector2.ZERO, r, Color(_colour, 0.08 * a))
			draw_arc(Vector2.ZERO, r, 0.0, TAU, 64, Color(_colour, 0.5 * a), 2.0)
			var n := maxi(12, int(r / 9.0))
			var spin := _t * 7.0 + float(get_instance_id() % 7)  # each pulse starts at its own angle
			var half := PI / n * 0.55
			var col := Color(_colour.lightened(0.35), a)
			for i in n:
				var ang := spin + TAU * i / n
				draw_colored_polygon(PackedVector2Array([Vector2.from_angle(ang - half) * r,
					Vector2.from_angle(ang + half) * r, Vector2.from_angle(ang + half * 0.6) * (r + 14.0)]), col)
			return
		draw_circle(Vector2.ZERO, r, Color(_colour, 0.12 * a))
		draw_arc(Vector2.ZERO, r, 0.0, TAU, 96, Color(_colour.lightened(0.3), a), 18.0 * a + 2.0)
		draw_circle(Vector2.ZERO, 40.0 * a, Color(Color.WHITE, 0.6 * a))


## E — afterimages left along the dash.
class Ghost extends Node2D:
	var _radius: float
	var _colour: Color
	var _t := 0.0

	func _init(at: Vector2, radius: float, colour: Color) -> void:
		position = at
		_radius = radius
		_colour = colour

	func _process(delta: float) -> void:
		_t += delta / 0.3
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		draw_circle(Vector2.ZERO, _radius, Color(_colour, 0.35 * (1.0 - _t)))


## BOOP, a snowplow: two circles. The OUTER one is as far as the push goes
## (radius + push) and shows from the start, filling in during the windup.
## Then the INNER one — the push itself — bursts from the centre to the outer
## one, fast then slowing (ease-out), and carries every hero and creep it meets
## (anyone inside the outer circle, or walking into it mid-sweep): they don't
## move until the ring reaches them, then ride its edge to the outer circle.
## (It used to catch only those within `radius` when it went off — someone in
## the band between looked inside it and was swept straight over.)
## on_contact(unit) fires once per unit the moment the ring reaches it.
class Boop extends Node2D:
	const SLIDE := 0.3   # s the ring takes to reach the outer circle
	const FADE := 0.2
	var facing := Vector2.RIGHT  # who's dead centre goes back this way
	var on_contact: Callable
	var _radius: float
	var _reach: float
	var _colour: Color
	var _windup: float
	var _t := 0.0
	var _dirs := {}        # unit id -> the way the ring carries it (fixed at first contact)
	var _went_off := false

	func _init(at: Vector2, radius: float, push: float, colour: Color, windup: float) -> void:
		position = at
		_radius = radius
		_reach = radius + push
		_colour = colour
		_windup = windup

	static func ease_out(k: float) -> float:
		var m := 1.0 - clampf(k, 0.0, 1.0)
		return 1.0 - m * m * m

	func _ring() -> float:
		return _reach * ease_out((_t - _windup) / SLIDE)

	func _process(delta: float) -> void:
		_t += delta
		if _t >= _windup:
			_went_off = true
		if _went_off and _t <= _windup + SLIDE:
			var ring := _ring()
			for u: Node2D in get_tree().get_nodes_in_group("units"):  # every hero and creep the ring has reached
				if not u.is_targetable() or u.solid or u.is_in_group("decoys") or u.is_in_group("towers"):
					continue
				if not (u.is_in_group("heroes") or u.is_in_group("creeps")):
					continue
				var off: Vector2 = u.position - position
				if off.length() >= ring:
					continue  # the ring hasn't got there yet
				var id: int = u.get_instance_id()
				if not _dirs.has(id):  # first contact
					_dirs[id] = off.normalized() if off.length() > 1.0 else -facing
					if on_contact.is_valid():
						on_contact.call(u)
					if not is_instance_valid(u) or not u.is_targetable():
						continue  # the hit killed it
				u.position = position + _dirs[id] * ring  # carried on the edge
		if _t >= _windup + SLIDE + FADE:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		if _t < _windup:  # the outer ring (how far it'll go — and everyone inside it gets carried) filling in
			var k := _t / maxf(_windup, 0.01)
			draw_arc(Vector2.ZERO, _reach, 0.0, TAU, 64, Color(_colour, 0.7), 2.0)
			draw_circle(Vector2.ZERO, _reach * k, Color(_colour, 0.14))
			return
		var after := clampf((_t - _windup - SLIDE) / FADE, 0.0, 1.0)
		var fade := 1.0 - after
		var ring := _ring()
		draw_arc(Vector2.ZERO, _reach, 0.0, TAU, 64, Color(_colour, 0.45 * fade), 2.0)  # outer: the limit
		draw_circle(Vector2.ZERO, ring, Color(_colour, 0.12 * fade))
		draw_arc(Vector2.ZERO, ring, 0.0, TAU, 64, Color(_colour, 0.95 * fade), 5.0)  # inner: the push itself
		for i in 8:  # arrows riding the push
			var d := Vector2.from_angle(TAU * i / 8.0)
			var tip := d * ring
			draw_line(tip - d * 22.0, tip, Color(_colour, fade), 3.0)
			draw_line(tip, tip - d.rotated(0.5) * 11.0, Color(_colour, fade), 3.0)
			draw_line(tip, tip - d.rotated(-0.5) * 11.0, Color(_colour, fade), 3.0)


## Slam (cone): an instant wedge in front of the hero; hits everything inside.
class Cone extends Node2D:
	var team := 0
	var source: Node2D = null
	var hit := {}  # the ability's hit info (hero.gd ability_hit)
	const LIFE := 0.3
	var _range: float
	var _half: float
	var _colour: Color
	var _t := 0.0

	func _init(at: Vector2, dir: Vector2, max_range: float, half_angle: float, colour: Color, damage: float) -> void:
		position = at
		rotation = dir.angle()
		_range = max_range
		_half = half_angle
		_colour = colour
		_hit.call_deferred(dir, damage)

	func _hit(dir: Vector2, damage: float) -> void:
		for d in Targets.enemies_in(get_tree(), position, _range, team):
			var to: Vector2 = d.position - position
			var slack := atan2(d.radius, maxf(to.length(), 1.0))  # the target's own width counts
			if absf(angle_difference(dir.angle(), to.angle())) <= _half + slack:
				d.take_damage(damage, _colour, false, false, source, hit)

	func _process(delta: float) -> void:
		_t += delta / LIFE
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var pts := PackedVector2Array([Vector2.ZERO])
		for i in 17:
			pts.append(Vector2.from_angle(-_half + 2.0 * _half * i / 16.0) * _range * lerpf(0.85, 1.0, _t))
		draw_colored_polygon(pts, Color(_colour.lightened(0.3), 0.55 * (1.0 - _t)))


## Lance (beam): an instant piercing line; hits everything along it.
class Beam extends Node2D:
	var team := 0
	var source: Node2D = null
	var hit := {}  # the ability's hit info (hero.gd ability_hit)
	const LIFE := 0.35
	const POINT_SIZE := 20.0  # SHADE's damage point at full damage (px radius)
	## Damage by distance from the caster: near_mult × at point blank, rising
	## to full at full_at px (0 = full everywhere). SHADE hits hardest far away.
	var near_mult := 1.0
	var full_at := 0.0
	var _length: float
	var _width: float
	var _colour: Color
	var _t := 0.0

	func _init(from: Vector2, dir: Vector2, length: float, width: float, colour: Color, damage: float) -> void:
		position = from
		rotation = dir.angle()
		_length = length
		_width = width
		_colour = colour
		_hit.call_deferred(from + dir * length, damage)

	func _hit(end: Vector2, damage: float) -> void:
		for d in Targets.enemies_on_line(get_tree(), position, end, _width / 2.0, team):
			var k := 1.0 if full_at <= 0.0 else lerpf(near_mult, 1.0, clampf(d.position.distance_to(position) / full_at, 0.0, 1.0))
			d.take_damage(damage * k, _colour, false, false, source, hit)

	func _process(delta: float) -> void:
		_t += delta / LIFE
		if _t >= 1.0:
			queue_free()
		queue_redraw()

	func _draw() -> void:
		var a := 1.0 - _t
		var w := _width * lerpf(1.0, 0.3, _t)
		if full_at <= 0.0:
			draw_rect(Rect2(0, -w / 2.0, _length, w), Color(_colour, 0.5 * a))
			draw_rect(Rect2(0, -w / 6.0, _length, w / 3.0), Color(Color.WHITE, 0.8 * a))
			return
		# SHADE: the beam swells as it goes — thin and dim near the caster, full
		# width from full_at on — and a bright pulse races out along it, growing
		# as it travels: the damage building with distance
		var f := clampf(full_at / _length, 0.0, 1.0)
		var body := PackedVector2Array([Vector2(0, -w * near_mult / 2.0), Vector2(_length * f, -w / 2.0), Vector2(_length, -w / 2.0),
			Vector2(_length, w / 2.0), Vector2(_length * f, w / 2.0), Vector2(0, w * near_mult / 2.0)])
		draw_colored_polygon(body, Color(_colour, 0.5 * a))
		var core := PackedVector2Array()
		for p: Vector2 in body:
			core.append(Vector2(p.x, p.y / 3.0))
		draw_colored_polygon(core, Color(Color.WHITE, 0.55 * a))
		var x := _length * clampf(_t / 0.6, 0.0, 1.0)  # the pulse: out to the tip in the first 60% of the beam's life
		var k := lerpf(near_mult, 1.0, clampf(x / maxf(full_at, 1.0), 0.0, 1.0))  # how hard the beam hits here
		var pw := _width * (0.4 + 1.6 * k * k)  # small near the caster, big once it hits full damage
		draw_circle(Vector2(x, 0), pw * 0.55, Color(_colour.lightened(0.4), 0.5 * a))
		draw_circle(Vector2(x, 0), pw * 0.3, Color(Color.WHITE, 0.9 * a))
		# the damage point: a crisp, high-contrast marker riding the pulse, its
		# size in step with the damage there (60% → 100%), gone quickly at the tip
		var fade := 1.0 - clampf((_t - 0.6) / 0.2, 0.0, 1.0)
		if fade > 0.0:
			var pr := POINT_SIZE * k
			draw_circle(Vector2(x, 0), pr + 3.0, Color(0.05, 0.05, 0.12, 0.9 * fade))  # dark rim: stands out on anything
			draw_arc(Vector2(x, 0), pr, 0.0, TAU, 24, Color(1.0, 0.84, 0.2, fade), 3.5)  # gold ring
			draw_circle(Vector2(x, 0), pr * 0.35, Color(1.0, 1.0, 1.0, fade))
