extends Node2D
## Builds the sandbox in one of two modes, then the hero, a free camera, the
## aim indicator and the HUD. Everything is made in code so the project stays
## a handful of small scripts.
##
##   lane      (default) the roguelite run (run.gd): rounds on a lane with
##             creep waves, a tower at each end and an enemy hero bot; the
##             shop between rounds (run_screen.gd)
##   training  the empty map with training dummies around the spawn; its
##             "No cooldowns" switch lives in the HUD
##
## Esc pauses (pause_menu.gd), F9 switches mode (restarts), Enter restarts
## training, F11 toggles fullscreen. The
## game starts fullscreen with the mouse confined to the window, so the
## screen edges are always there to push against for edge panning.

const GroundScript := preload("res://scripts/ground.gd")
const HeroScript := preload("res://scripts/hero.gd")
const Unit := preload("res://scripts/unit.gd")
const AimScript := preload("res://scripts/aim.gd")
const AbilityBarScript := preload("res://scripts/ability_bar.gd")
const DummyScript := preload("res://scripts/dummy.gd")
const CameraRigScript := preload("res://scripts/camera_rig.gd")
const LaneScript := preload("res://scripts/lane.gd")
const BotScript := preload("res://scripts/bot.gd")
const TrainingShopScript := preload("res://scripts/training_shop.gd")
const TrainingLaneScript := preload("res://scripts/training_lane.gd")
const Heroes := preload("res://scripts/heroes.gd")
const Upgrades := preload("res://scripts/upgrades.gd")
const Run := preload("res://scripts/run.gd")
const RunScreenScript := preload("res://scripts/run_screen.gd")
const PauseMenuScript := preload("res://scripts/pause_menu.gd")
const PlayLog := preload("res://scripts/play_log.gd")
const PlayLogProbeScript := preload("res://scripts/play_log_probe.gd")

## Training dummies around the spawn point.
const DUMMIES := [Vector2(520, -120), Vector2(640, 90), Vector2(540, 290), Vector2(-460, 180), Vector2(20, -430)]

## Survives the scene reload that F9 / Enter do.
static var mode := "lane"
## Training's "No cooldowns" switch (kept while the game is open).
static var training_no_cooldowns := false
## Training's "No mana" switch (kept while the game is open).
static var training_no_mana := false
## Training's build, from its free shop (kept while the game is open).
static var training_upgrades: Array = []
static var training_levels := {"Q": 1, "W": 1, "E": 1, "R": 1}
## Lane mode gets an enemy hero bot (tests turn it off).
static var bot_enabled := true
## `autoplay` = a bot plays your seat. `driven` = a tool drives the rounds, so
## no run screens, pause menu or Training shop are built. Headless autoplay sets
## both; the dev Watch-bots mode sets only `autoplay`, keeping the real screens.
## A bot plays your seat and no run screens open; tools/autoplay.gd drives
## the run instead (balance testing).
static var autoplay := false
static var driven := false   # tools/autoplay.gd drives the rounds: build no UI

var hero: Node2D
var lane: Node2D  # null in training mode
var bot: Node2D   # the enemy hero bot, or null


func _ready() -> void:
	get_tree().paused = false  # the run screen pauses again if it's open
	# confining the cursor is for aiming; with a bot in your seat it would just
	# trap the mouse in the window (watch mode, or a windowed autoplay run)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE if autoplay else Input.MOUSE_MODE_CONFINED
	var ground: Node2D = GroundScript.new()
	add_child(ground)

	var effects := Node2D.new()  # projectiles, blasts, markers draw here, above the ground
	effects.name = "Effects"

	hero = BotScript.new() if autoplay and mode == "lane" else HeroScript.new()
	hero.name = "Hero"
	hero.effects = effects

	if mode == "lane":
		if bot_enabled:
			bot = BotScript.new()
			bot.name = "Bot"
			bot.effects = effects
			bot.team = 1
			bot.spawn = LaneScript.base_of(1)
			bot.pick = Run.bot_hero_for(Run.round_num)
			bot.enemy_hero = hero
			bot.difficulty = Run.difficulty()
			bot.personality = Run.red_personality_for(bot.pick)  # never shown: learned by playing it
			bot.smartness = Run.red_smartness_now()
			bot.caution = Run.red_caution if Run.red_caution >= 0.0 else bot.smartness  # flat: the ladder raises skill, not fear (-1 restores the old lockstep)
			bot.upgrade_ids = Run.red_upgrades.duplicate()  # red's build from its shopping
			bot.ability_levels = Run.red_levels.duplicate()
			bot.gold = Run.red_gold
		lane = LaneScript.new()
		lane.name = "Lane"
		lane.effects = effects
		lane.hero = hero
		lane.bot = bot
		lane.difficulty = Run.difficulty()
		lane.wave_mods = [Upgrades.wave_mods(Run.upgrades), Upgrades.wave_mods(Run.red_upgrades)]
		if autoplay:  # the two bots face each other; yours plays a fixed strong human
			hero.enemy_hero = bot
			hero.lane = lane
			hero.difficulty = Run.blue_difficulty()  # NOT Run.difficulty(): your stand-in must not climb with red
			hero.smartness = Run.blue_smartness
			hero.caution = Run.blue_caution if Run.blue_caution >= 0.0 else hero.smartness
		add_child(lane)
		hero.spawn = LaneScript.base_of(0)
		# the run carries over: hero, upgrades, gold; no switching mid-run
		hero.start_index = Run.hero_index
		hero.upgrade_ids = Run.upgrades.duplicate()
		hero.ability_levels = Run.levels.duplicate()
		hero.gold = Run.gold
		hero.can_switch = false
	else:
		hero.upgrade_ids = training_upgrades.duplicate()  # the Training shop's build
		hero.ability_levels = training_levels.duplicate()
		for at: Vector2 in DUMMIES:
			var dummy: Node2D = DummyScript.new(at)
			dummy.effects = effects
			add_child(dummy)
		var practice: Node2D = TrainingLaneScript.new()  # an enemy tower and creep waves to practise on
		practice.name = "TrainingLane"
		practice.effects = effects
		add_child(practice)
	add_child(effects)  # after towers / creeps / dummies, so hits and numbers draw over them
	add_child(hero)
	if bot:
		bot.lane = lane
		add_child(bot)
	if lane:  # every round opens with both ultimates on cooldown
		hero.start_ult_cooldown()
		if bot:
			bot.start_ult_cooldown()

	var aim: Node2D = AimScript.new()  # targeting preview while an ability key is held
	aim.hero = hero
	add_child(aim)
	move_child(aim, hero.get_index())  # under the hero

	var cam: Camera2D = CameraRigScript.new()  # free camera: edge-pan, Space to hero, Y to lock
	cam.name = "Camera"
	cam.hero = hero
	cam.locked = autoplay  # watching a bot: follow it by default (Y unlocks), and
	# the lock skips edge panning, so an idle cursor can't drift the view away
	add_child(cam)

	var bar: CanvasLayer = AbilityBarScript.new()
	bar.hero = hero
	bar.lane = lane
	bar.mode_clicked.connect(switch_mode)
	bar.cooldowns_clicked.connect(toggle_no_cooldowns)
	bar.mana_clicked.connect(toggle_no_mana)
	hero.no_cooldowns = lane == null and training_no_cooldowns
	hero.no_mana = lane == null and training_no_mana
	add_child(bar)

	if lane and not driven:
		var screen: CanvasLayer = RunScreenScript.new()  # hero pick, shop, run over
		screen.name = "RunScreen"
		screen.hero = hero
		screen.lane = lane
		screen.reload.connect(func() -> void: get_tree().reload_current_scene())
		add_child(screen)

	if lane and PlayLog.recording() and Run.phase == "play":
		start_play_log_probe()  # autoplay logs too (tools/autoplay.gd --playlog), from both bots' point of view
	elif lane == null and not driven and PlayLog.is_on():  # Training logs too (try_*.jsonl), same switch
		PlayLog.training_start(self)
		start_play_log_probe()

	if not driven:
		var pause: CanvasLayer = PauseMenuScript.new()  # Esc
		pause.name = "PauseMenu"
		pause.hero = hero
		pause.in_run = lane != null
		pause.restart.connect(func() -> void:
			if lane == null:  # Training's Restart: back to the hero-pick screen
				PlayLog.training_end("left training")
				mode = "lane"
				Run.reset()
			get_tree().reload_current_scene())
		add_child(pause)

	if lane == null and not driven:  # Training's free shop (B, or the HUD button)
		var shop: CanvasLayer = TrainingShopScript.new()
		shop.name = "TrainingShop"
		shop.main = self
		shop.hero = hero
		shop.changed.connect(apply_training_build)
		bar.shop_clicked.connect(shop.toggle)
		add_child(shop)


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	match key.physical_keycode:
		KEY_F9:
			switch_mode()
		KEY_ENTER, KEY_KP_ENTER:
			if lane == null:  # in a run, Enter belongs to the run screens
				get_tree().reload_current_scene()
		KEY_F11:
			var win := get_window()
			win.mode = Window.MODE_WINDOWED if win.mode == Window.MODE_FULLSCREEN else Window.MODE_FULLSCREEN
			Input.mouse_mode = Input.MOUSE_MODE_CONFINED  # re-apply after the window changes


## Record this round in the play log (also called when logging is switched on
## mid-round, or when the run starts from the hero pick).
## Picking your hero starts the run: red for round 1 is rebuilt for this run's
## seed (the lane behind the hero-select screen built it from the last run's).
func repick_bot() -> void:
	if bot == null or not is_instance_valid(bot):
		return
	bot.pick = Run.bot_hero_for(Run.round_num)
	bot.difficulty = Run.difficulty()
	bot.personality = Run.red_personality_for(bot.pick)
	bot.smartness = Run.red_smartness_now()
	bot.upgrade_ids = Run.red_upgrades.duplicate()
	bot.ability_levels = Run.red_levels.duplicate()
	bot.set_hero(bot.pick)
	bot.apply_personality()
	bot.start_ult_cooldown()


func start_play_log_probe() -> void:
	if has_node("PlayLogProbe"):
		return
	var probe: Node = PlayLogProbeScript.new()
	probe.name = "PlayLogProbe"
	probe.main = self
	add_child(probe)


## Training only: abilities come back instantly.
func toggle_no_cooldowns() -> void:
	if lane != null:
		return
	training_no_cooldowns = not training_no_cooldowns
	hero.no_cooldowns = training_no_cooldowns


## Training only: mana stays full, so abilities never cost anything.
func toggle_no_mana() -> void:
	if lane != null:
		return
	training_no_mana = not training_no_mana
	hero.no_mana = training_no_mana


## The Training shop changed the build: the hero takes it at once (refreshed).
func apply_training_build() -> void:
	hero.upgrade_ids = training_upgrades.duplicate()
	hero.ability_levels = training_levels.duplicate()
	hero.set_hero(hero.hero_index)


## Straight into Training (the opening screen's button).
## Dev Watch-bots mode: put a bot in your seat and rebuild the scene, keeping
## every run screen. The hero-pick screen's toggle starts it; clear_watch()
## hands the seat back.
func start_watch(i: int) -> void:
	autoplay = true
	Run.start(i)
	Run.save_continue()
	if PlayLog.is_on():
		PlayLog.run_start("watch")
	get_tree().reload_current_scene()  # your seat has to be rebuilt as a bot


func clear_watch() -> void:
	autoplay = false


## A bot is in your seat (Watch bots, or a windowed autoplay run). An instance
## method on purpose: run_screen.gd can't preload main.gd (main preloads it),
## so it has only get_parent() to ask through.
func watching() -> bool:
	return autoplay and not driven


func start_training() -> void:
	mode = "training"
	get_tree().reload_current_scene()


## Training → back to the run (F9 / the mode box). There's no way into
## Training from inside the game: only the hero-pick screen's button.
func switch_mode() -> void:
	if mode == "lane":
		return
	mode = "lane"
	get_tree().reload_current_scene()
