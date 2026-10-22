extends CanvasLayer
## How to Play: a modal over whatever opened it (hero select, the Esc menu) —
## the rules, controls and colour key in short, scrollable when it's taller
## than the screen. Esc, Close or a click outside the panel shuts it.
## Instruction copy: always "hero" here (see run_screen.gd CHEERS).

const ACCENT := Color("#80cbc4")
const GOLD := Color("#ffd54f")
const INK := Color("#10151a")
const PANEL := Color("#141c21")
const TEXT := Color(1, 1, 1, 0.85)
const DIM := Color(1, 1, 1, 0.55)

## The page: [kind, ...]. "h" = section heading, "p" = a line of text,
## "k" = a key and what it does, "c" = a colour swatch and what it means.
const PAGE := [
	["h", "THE RUN"],
	["p", "One lane, you against a bot hero. Destroy the enemy tower to win the round."],
	["p", "Win → visit the shop → next round, endlessly. Lose your tower and the run is over."],
	["p", "Red shops too, and gets sharper every round. Your best round is saved."],
	["h", "GOLD"],
	["p", "Only last hits pay: land the killing blow on an enemy creep. The white tick on its bar marks your attack damage."],
	["p", "Deny: kill your own creep below half health and nobody gets its gold. No denying in overtime."],
	["p", "Grey creeps with a slash through them are worth no gold: extra creeps from cards and late rounds, and every creep in overtime."],
	["p", "Dying costs 15% of your gold (max 300) — the enemy hero takes it if it got the kill."],
	["h", "TOWERS AND THE LANE"],
	["p", "Waves leave each base every 20 s. Creeps inside an enemy tower's range attack only the tower."],
	["p", "Towers are shielded against heroes: you can only hurt one while one of your creeps is in its range."],
	["p", "A tower shoots creeps first — but hit its hero under it and it switches to you."],
	["p", "Your well heals you and nothing can hurt you there. The enemy's well burns you."],
	["p", "Overtime (later each round): kills pay nothing, towers crumble faster, waves grow, and abilities cost 25% less mana and cool down 25% faster. Finish it."],
	["p", "A ranged creep you last-hit sometimes drops a capsule in your colour (1 in 10, or 1 in 3 in overtime). It has 300 health and never goes away: attack it (a click on it — or an attack-move: it's a target like any other, so mind where you aim near your own) and break it to open it: Twin (a small copy of you at your side: it shoots what you shoot, soaks part of the damage you take, never heals, and lasts until it breaks or you die), Rampage (faster, tougher, and hurts everything close, for 10 s), Pierce (shots go on a long way through the target and hit everything behind it four times as hard, the target three times; it lasts until it has done extra damage worth over half the enemy hero's health, creeps counting for less), Shield (a shield worth over half your health that stays until it's used up), or Shell (blue): a minion that walks straight at the enemy hero and, if it reaches them, takes half their health and stuns them for 2 s (D blocks the stun). Red can't touch yours until it's below half health (the white line); if red breaks it, it's gone. The same goes for you and red's — except while its owner is dead: then anyone can break it, and red's show on your minimap. You can leash your own capsule like a creep (2 points): it floats after you, a little slower than you walk — but while it follows you, red can break it at any health. Creeps ignore capsules."],
	["p", "From round 6 each side has a totem on its own half, off the lane. Lead one of your creeps into its ring and it latches on: it leaves your leash and attacks only the totem until one of them falls. Only your own creeps can hurt your totem, and it wears them down. Destroy it and a siege minion goes out with your next wave; another rises 45 s later."],
	["p", "In overtime every hero death sends a siege minion with the other side's next wave: nothing can stop it, and it blows up on the tower for 10% of its health."],
	["h", "CONTROLS"],
	["k", "Right-click", "Move (hold to keep steering)"],
	["k", "Left-click", "Attack the enemy nearest the cursor"],
	["k", "Left-click own creep", "Deny it (below half health)"],
	["k", "Q  W  E  R", "Cast at the cursor (quick cast) — Esc menu → Cast indicator to aim first"],
	["k", "Q / E again", "Second press: set off SHOCK early, let go of POUNCE"],
	["k", "T on your creep or capsule", "Leash it: a creep follows you and hits what you hit (melee 1 point, ranged 2); your own capsule floats after you (2 points) but can be broken at any health while it follows"],
	["k", "D", "300 shield for 2 s; clears bad effects and blocks new ones for 0.5 s (60 s cooldown)"],
	["k", "S", "Stop"],
	["k", "Hover Q W E R", "What the ability does right now"],
	["k", "Mouse to edge", "Pan the camera (or arrows, or click the minimap)"],
	["k", "Space / Y", "Camera to your hero / lock it on"],
	["k", "Esc  ·  F11", "Pause menu  ·  fullscreen"],
	["h", "TRAINING"],
	["p", "Dummies, a practice tower and waves. Free shop (B), switch hero (1–4), no-cooldown and no-mana switches, Enter restarts, F9 back to hero select. Every ranged creep you last-hit drops a power-up."],
	["h", "THE SHOP"],
	["p", "Abilities: level Q W E R up to III. Levels belong to the letter — they carry over if you switch hero."],
	["p", "Cards: commons, rares and epics (one of each epic per run), plus WAVE cards for your creeps. 3 random offers per row."],
	["p", "Every pick makes everything 8% dearer. No rerolls — except the Gamble card, once per run."],
	["p", "Switching hero between rounds is free."],
	["h", "COLOURS"],
	["c", Color(1.0, 0.45, 0.1), "Burning — takes damage over time"],
	["c", Color(0.9, 0.12, 0.15), "Bleeding — takes extra damage from one hero's attacks"],
	["c", Color(0.7, 0.4, 1.0), "Slowed"],
	["c", Color(0.6, 0.85, 0.25), "Attacks slowed — takes longer between attacks"],
	["c", Color(0.78, 0.92, 1.0), "Shielded — the thicker the ring, the more it holds"],
	["c", Color("#fff176"), "Stunned — can't move, attack or cast"],
	["c", Color(1.0, 0.35, 0.8), "Marked — the next hit from its hunter hurts more"],
	["c", Color(0.85, 0.87, 0.9), "Blinded (dashed ring) — its next attack misses"],
	["c", Color(0.25, 0.85, 0.75), "Exposed — takes 10% more damage from everything"],
	["c", Color(1.0, 0.92, 0.55), "D up (pulsing ring) — nothing bad can land for a moment"],
]

var _card: PanelContainer


func _ready() -> void:
	layer = 40
	process_mode = Node.PROCESS_MODE_ALWAYS
	var shade := ColorRect.new()  # the dim behind it; a click here closes
	shade.color = Color(0.02, 0.03, 0.04, 0.8)
	shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	shade.gui_input.connect(func(e: InputEvent) -> void:
		var mb := e as InputEventMouseButton
		if mb and mb.pressed and mb.button_index == MOUSE_BUTTON_LEFT:
			queue_free())
	add_child(shade)
	_card = PanelContainer.new()
	var sb := StyleBoxFlat.new()
	sb.bg_color = PANEL
	sb.border_color = ACCENT
	sb.set_border_width_all(2)
	sb.set_content_margin_all(28)
	_card.add_theme_stylebox_override("panel", sb)
	add_child(_card)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 14)
	_card.add_child(v)
	var head := HBoxContainer.new()
	v.add_child(head)
	var title := _label("HOW TO PLAY", 34, Color.WHITE)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(title)
	head.add_child(_button("Close  (Esc)", queue_free))
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	v.add_child(scroll)
	var body := VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 6)
	scroll.add_child(body)
	for item: Array in PAGE:
		body.add_child(_row(item))
	get_viewport().size_changed.connect(_place)
	_place()


## Centre the panel, as tall as the screen allows (the page scrolls inside).
func _place() -> void:
	var view := get_viewport().get_visible_rect().size
	var size := Vector2(minf(900.0, view.x - 80.0), view.y - 100.0)
	_card.position = (view - size) / 2.0
	_card.size = size
	_card.custom_minimum_size = size


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key and key.pressed and not key.echo and key.physical_keycode == KEY_ESCAPE:
		queue_free()
		get_viewport().set_input_as_handled()


func _row(item: Array) -> Control:
	match item[0]:
		"h":
			var h := _label(item[1], 17, GOLD)
			h.custom_minimum_size.y = 38
			h.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
			return h
		"k":
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 16)
			var k := _label(item[1], 15, ACCENT)
			k.custom_minimum_size.x = 210
			row.add_child(k)
			var t := _label(item[2], 15, TEXT)
			t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			row.add_child(t)
			return row
		"c":
			var row := HBoxContainer.new()
			row.add_theme_constant_override("separation", 14)
			var ring := _Ring.new()
			ring.colour = item[1]
			ring.custom_minimum_size = Vector2(28, 24)
			row.add_child(ring)
			row.add_child(_label(item[2], 15, TEXT))
			return row
	var p := _label(item[1], 15, TEXT)
	p.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	return p


func _label(text: String, size: int, colour: Color) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	return l


func _button(text: String, action: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.add_theme_font_size_override("font_size", 16)
	var sb := StyleBoxFlat.new()
	sb.bg_color = Color("#1c262c")
	sb.border_color = Color("#ef5350")
	sb.set_border_width_all(2)
	sb.set_content_margin_all(8)
	sb.content_margin_left = 16
	sb.content_margin_right = 16
	b.add_theme_stylebox_override("normal", sb)
	var hover := sb.duplicate() as StyleBoxFlat
	hover.border_color = Color("#ef5350").lightened(0.3)
	b.add_theme_stylebox_override("hover", hover)
	b.add_theme_stylebox_override("pressed", hover)
	b.add_theme_stylebox_override("focus", StyleBoxEmpty.new())
	b.pressed.connect(action)
	return b


## A status ring swatch, drawn like the ones round units in the game.
class _Ring extends Control:
	var colour := Color.WHITE

	func _draw() -> void:
		var c := Vector2(size.x / 2.0, size.y / 2.0)
		draw_circle(c, 9.0, Color(colour, 0.15))
		draw_arc(c, 9.0, 0.0, TAU, 24, colour, 2.5)
