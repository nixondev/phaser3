extends Node2D
## TWIN — the power-up that replaced Spread (2026-10-20; power_capsule.gd
## "twin"; shooter roots: Gradius's Option). A half-size copy of its hero at
## its side that fires its own shot at whatever the hero shoots (each Twin Shot
## shot too) for TWIN_DAMAGE of the hero's attack — the hero's damage cards and
## attack speed count, on-hit cards don't (no Spellblade, Serrated, Excess,
## KYLE's stoke) — and it fires its own Pierce line while the hero has Pierce.
## It soaks TWIN_SHARE of every hit the hero takes (after armor, before
## shields) until its health is gone. It never heals — not even in the well —
## and goes when its hero dies. Nobody can target it (it isn't a unit).
## The hero holds it (hero.gd `twin`); not a timed power, so it sits alongside one.

const Effects := preload("res://scripts/effects.gd")
const PlayLog := preload("res://scripts/play_log.gd")

const TWIN_HP := 800.0       # an annoying amount (user): it outlasts a lot of trading
const TWIN_SHARE := 0.35     # of each hit the hero takes, after armor
const TWIN_DAMAGE := 0.6     # × the hero's attack, per shot
const OFFSET := 70.0         # px to the hero's side
const TRAIL := 24.0          # px behind the hero
const COLOR := Color("#c6ff00")  # the power's colour (power_capsule.gd POWER_COLOR)

var hero: Node2D
var effects: Node
var hp := TWIN_HP
var max_hp := TWIN_HP
var absorbed := 0.0
var shots := 0
var _flash := 0.0
var _gone := false


func _init(owner: Node2D) -> void:
	hero = owner
	position = owner.position
	z_index = 4


func _process(delta: float) -> void:
	if _gone:
		return
	if not is_instance_valid(hero) or not hero.is_targetable():
		end("death")
		return
	_flash = maxf(0.0, _flash - delta * 4.0)
	var f: Vector2 = hero.facing
	var want: Vector2 = hero.position + f.orthogonal() * OFFSET - f * TRAIL  # (switches sides as the hero turns)
	position = position.lerp(want, minf(1.0, delta * 10.0))
	queue_redraw()


## The hero just attacked `targets` (its target, plus Twin Shot's second): a shot at each.
func fire(targets: Array) -> void:
	if _gone:
		return
	for t: Variant in targets:
		if not is_instance_valid(t) or not t.is_targetable():
			continue
		var pierce: float = hero.PIERCE_DAMAGE * hero.PIERCE_TARGET if hero.power == "pierce" and not t.is_in_group("towers") else 1.0  # (Pierce: its target takes 25% less than the line)
		var shot := Effects.AttackShot.new(position, t, hero.attack_damage() * TWIN_DAMAGE * pierce,
			COLOR.lightened(0.3), false, 4.5, hero)
		shot.speed_mult = 1.0 + hero.mod("shot_speed")  # Keen Eye
		shot.volley = hero._volley
		shot.twin = self
		effects.add_child(shot)
		shots += 1


## Take `amount` off the hero's hit; returns how much it took.
func absorb(amount: float) -> float:
	if _gone or amount <= 0.0:
		return 0.0
	var took := minf(amount, hp)
	hp -= took
	absorbed += took
	_flash = 1.0
	if hp <= 0.0:
		end("broken")
	return took


## Gone: `why` is "broken" (its health ran out) or "death" (its hero died).
func end(why: String) -> void:
	if _gone:
		return
	_gone = true
	hp = 0.0
	if effects:
		effects.add_child(Effects.Ghost.new(position, 40.0, COLOR))
	PlayLog.event(hero.log_tag("twin_end"),
		{"why": why, "absorbed": roundi(absorbed), "shots": shots})
	if is_instance_valid(hero) and hero.twin == self:
		hero.twin = null
	queue_free()


func _draw() -> void:
	var r: float = hero.radius * 0.5
	draw_circle(Vector2.ZERO, r + 7.0, Color(COLOR, 0.15))
	hero.draw_body_on(self, Vector2.ZERO, r, hero.facing)
	draw_arc(Vector2.ZERO, r + 5.0, 0.0, TAU, 32, Color(COLOR, 0.9), 2.0)  # the power's ring
	if _flash > 0.0:
		draw_circle(Vector2.ZERO, r, Color(1, 0.3, 0.3, _flash * 0.5))
	var w := 30.0
	var bar := Rect2(Vector2(-w / 2.0, -r - 14.0), Vector2(w, 4.0))
	draw_rect(bar.grow(1.0), Color("#1b1b1b"))
	draw_rect(Rect2(bar.position, Vector2(w * hp / max_hp, bar.size.y)), COLOR)
