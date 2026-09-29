extends Node2D
## Root of an imported room scene (tools/import_room.gd). The tile layers,
## doors and interactables are real nodes in the .tscn — edit them in the
## Godot editor. At runtime this only adds what isn't authored: the player,
## camera, darkness + flashlight, a minimal E/F, and the HUD.
##
## Controls (GameScene): WASD/arrows move, E interact (pick up / read /
## recharge / use a door; dismisses dialog), F flashlight (once carried),
## TAB inventory — arrows move the cursor, E use, Q drop, TAB/Esc close.
## What survives a room change lives in the GameState autoload; the HUD is
## hud.gd (UIScene port).
##
## Spike conveniences for scripted captures — user args after `--`:
##   --flashlight        start carrying the flashlight, switched on
##   --spectra           also carry the spectra adapter
##   --dark-level=0.92   override this room's darkness
##   --face=up|down|left|right
##   --at=x,y            start the player here instead of PlayerSpawn
##   --give=prybar,...   start carrying items with these keyIds
##   --tap=e@0.3,f@0.6   tap keys at given seconds (real input events, so
##                       they go through exactly the path a keyboard does)

const PlayerScript := preload("res://scripts/player.gd")
const FlashlightScript := preload("res://scripts/flashlight.gd")
const DoorScript := preload("res://scripts/door.gd")
const HudScript := preload("res://scripts/hud.gd")
const AfflictedScript := preload("res://scripts/afflicted.gd")
const ItemShadow := preload("res://scripts/item_shadow.gd")
## Flashlight fright needs a clear line from the beam to the afflicted.
## Phaser's cone passes through walls; here the beam visibly stops at them,
## so fright does too. false = Phaser behaviour.
const FRIGHT_NEEDS_LINE_OF_SIGHT := true
const INTERACT_DISTANCE := 75.0  # INTERACT_CONFIG.DISTANCE

@export var room_id := ""
@export var room_name := ""
## Room size in tiles — camera limits.
@export var room_size := Vector2i(20, 15)
@export var dark := false
@export_range(0.0, 1.0) var dark_level := 0.0
@export var reverb := ""
@export_range(0.0, 1.0) var reverb_mix := 0.3

@export_group("Globals")
## characters.json `player.sheet` at import time.
@export var player_sheet: Texture2D
## rooms.json `spriteScale` — character render size, visual only.
@export var sprite_scale := 1.0
## rooms.json `cameraZoom`.
@export var camera_zoom := 1.0

## Set by a host scene (the title screen) before adding the room: draw the
## room as scenery only — no player, HUD, flashlight or interaction; the
## camera sits on the room's centre at 1:1, like Phaser's MenuScene.
var backdrop := false

var player: CharacterBody2D
var flashlight: Node2D
## keyIds of carried items (stand-in for the inventory, which isn't ported).
## The same Dictionary as GameState.held, so it survives room changes.
var held: Dictionary
## The GameState autoload, looked up at runtime (not by name) so the headless
## importer, which has no autoloads, can still load this script.
var game: Node

var hud: CanvasLayer
var _fade_rect: ColorRect
var _inv_mode := false
var _cursor := 0
var afflicted: Array = []
var _cure_cooldown := 0.0
var _dying := false
var _cam: Camera2D
var _shake_time := 0.0
var _shake_px := 0.0
var _recovery_page := {}  # afflicted id -> next backstory page (session-only, as in Phaser)


func _ready() -> void:
	if backdrop:
		var cam := Camera2D.new()
		cam.position = Vector2(room_size * WardenData.TILE) / 2.0
		add_child(cam)
		set_process(false)
		set_process_unhandled_input(false)
		game = get_node_or_null("/root/GameState")
		_spawn_afflicted()  # MenuScene's wanderers: they roam, the "player" is far away
		return
	game = get_node("/root/GameState")
	held = game.held
	var args := {} if game.boot_args_used else _user_args()
	game.boot_args_used = true
	if args.has("dark-level"):
		dark = true
		dark_level = float(args["dark-level"])

	player = PlayerScript.new()
	player.name = "Player"
	player.setup(player_sheet, sprite_scale)
	player.position = ($Entities/PlayerSpawn as Marker2D).position
	if args.has("at"):
		var xy: PackedStringArray = str(args["at"]).split(",")
		player.position = Vector2(float(xy[0]), float(xy[1]))
	var arrived: bool = game.pending_spawn != null  # came through a door
	if arrived:
		player.position = game.pending_spawn
		game.pending_spawn = null
	player.facing = game.facing
	if args.has("face"):
		player.facing = args["face"]
	$Entities.add_child(player)
	player.sprite.light_mask = FlashlightScript.HOLDER_MASK  # lit by the ambient circle, not their own beam
	player.collision_layer = AfflictedScript.LAYER_PLAYER  # walls stay on layer 1; afflicted touch-test layer 2
	player.collision_mask = AfflictedScript.LAYER_WALLS
	_spawn_afflicted()
	for inter in $Entities/Interactables.get_children():
		if game.collected.has(inter.interact_id):
			inter.queue_free()
		elif inter.kind == "item" and inter.texture:
			_bob(inter)

	var cam := Camera2D.new()
	cam.zoom = Vector2(camera_zoom, camera_zoom)
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = room_size.x * WardenData.TILE
	cam.limit_bottom = room_size.y * WardenData.TILE
	player.add_child(cam)
	_cam = cam

	_setup_lighting()
	hud = HudScript.new()
	hud.name = "HUD"
	add_child(hud)
	hud.show_room_name(room_name)
	if game.pending_toast != "":
		hud.show_unlock(game.pending_toast)
		game.pending_toast = ""
	_spawn_dropped()
	flashlight.charge = game.flashlight_charge
	if game.flashlight_on and held.has("flashlight"):
		flashlight.toggle()
	if arrived:
		_fade(0.0)

	if args.has("flashlight"):
		held["flashlight"] = true
		flashlight.toggle()
	if args.has("spectra"):
		held["spectra-adapter"] = true
	if args.has("give"):
		for k in str(args["give"]).split(","):
			held[k] = true
	if args.has("tap"):
		_schedule_taps(str(args["tap"]))
	hud.set_inventory(game.inventory)


func _process(delta: float) -> void:
	if _shake_time > 0.0:
		_shake_time -= delta
		_cam.offset = Vector2(randf_range(-1, 1), randf_range(-1, 1)) * _shake_px if _shake_time > 0.0 else Vector2.ZERO
	flashlight.aim(player.facing)
	flashlight.set_adapted(held.has("spectra-adapter"))
	if not held.has("flashlight"):
		flashlight.turn_off()
	player.frozen = hud.is_dialog_open() or _inv_mode
	hud.set_battery(flashlight.battery_percent(), held.has("flashlight"))
	hud.set_prompt(not _inv_mode and _nearest_target() != null)


## Afflicted AI (GameScene.update): flashlight fright first, then each one's
## own AI, then the touch test → cure or death.
func _physics_process(delta: float) -> void:
	_cure_cooldown = maxf(0.0, _cure_cooldown - delta)
	var target := player.position if player else Vector2(-99999, -99999)
	for a in afflicted:
		if not is_instance_valid(a):
			continue
		if player and flashlight.on and a.status in ["wandering", "agitated"] and _in_cone(a.position):
			a.set_status("frightened")
			continue
		a.update_ai(target, delta)
	if player and not _dying and _cure_cooldown <= 0.0:
		for a in afflicted:
			if is_instance_valid(a) and not a.is_calm() and a.touches(player):
				_on_touch(a)
				break


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key == null or not key.pressed or key.echo:
		return
	var code := key.physical_keycode
	# The two in-game debug chords (GameScene; TODO remove before ship).
	if key.ctrl_pressed and key.shift_pressed:
		if code == KEY_C:
			for a in afflicted:
				if is_instance_valid(a) and not a.is_calm():
					_apply_cure(a, -1, true)
			return
		if code == KEY_SLASH:
			for rdef: Dictionary in WardenData.load_json("data/rooms.json")["rooms"].values():
				for d: Dictionary in rdef.get("doors", []):
					game.unlocked_doors[d["id"]] = true
			hud.open_dialog("[DEBUG] All doors unlocked.", "system")
			return
	if hud.is_dialog_open():
		if code == KEY_E:
			hud.advance()
		return
	if _inv_mode:
		_inventory_input(code)
		return
	match code:
		KEY_E: _interact()
		KEY_F:
			if held.has("flashlight"):
				flashlight.toggle()
		KEY_TAB:
			_inv_mode = true
			hud.set_inventory_mode(true)
			hud.set_cursor(_cursor, game.inventory)


# ── Lighting ────────────────────────────────────────────────────────────

func _setup_lighting() -> void:
	flashlight = FlashlightScript.new()
	flashlight.name = "Flashlight"
	player.add_child(flashlight)
	flashlight.setup(dark_level if dark else 0.0)

	if dark:
		var cm := CanvasModulate.new()
		cm.name = "Darkness"
		var v := 1.0 - dark_level
		cm.color = Color(v, v, v)
		add_child(cm)

	_build_occluders()

	# Spectra-revealed things draw ONLY where the adapter's light hits them.
	# Done here, not in the scene, so they stay visible while editing.
	# A light() shader, not CanvasItemMaterial LIGHT_ONLY: that is per-item
	# in Godot 4 and showed the whole mark whenever the adapter light was on.
	var reveal := ShaderMaterial.new()
	reveal.shader = preload("res://shaders/light_reveal.gdshader")
	var revealed: Array[CanvasItem] = [$Spectra]
	for child in $Hidden.get_children():
		if child is CanvasItem:
			revealed.append(child)
	$Hidden.visible = true
	for item in revealed:
		item.visible = true
		item.material = reveal
		item.light_mask = FlashlightScript.SPECTRA_MASK


## Shadow-casting outline of the painted Collision cells, traced at runtime
## so it always matches what's painted. One open edge per run of exposed
## wall boundary, wound so the solid side is consistent: with
## CULL_COUNTER_CLOCKWISE only edges facing AWAY from the light cast, so a
## wall's face is lit and its shadow starts behind it. Tracing the outline
## (not per-tile squares) means neighbouring wall tiles never shadow each other.
func _build_occluders() -> void:
	# Full cells (opaque art, colour tiles, tiles flagged hollow) join the
	# outline trace. Partial tiles — a desk, a pillar — get occluders traced
	# from their art instead, so the beam isn't blocked by empty air in the
	# rest of their cell (TileShapes).
	var solid := {}
	var partial := []  # [layer, cell]
	for lname: String in ["Collision", "CollisionColor"]:
		var layer := get_node_or_null(lname) as TileMapLayer
		if layer:
			for cell in layer.get_used_cells():
				if TileShapes.is_full(layer, cell):
					solid[cell] = true
				else:
					partial.append([layer, cell])
	_build_partial_occluders(partial)
	_split_partial_tiles(partial)
	if solid.is_empty():
		return
	var lo: Vector2i = solid.keys()[0]
	var hi := lo
	for cell: Vector2i in solid:
		lo = lo.min(cell)
		hi = hi.max(cell)

	const T := WardenData.TILE
	var edges := []
	for y in range(lo.y, hi.y + 1):
		for r in _runs(lo.x, hi.x, func(x: int) -> bool: return solid.has(Vector2i(x, y)) and not solid.has(Vector2i(x, y - 1))):
			edges.append([Vector2(r.x * T, y * T), Vector2((r.y + 1) * T, y * T)])  # top, left->right
		for r in _runs(lo.x, hi.x, func(x: int) -> bool: return solid.has(Vector2i(x, y)) and not solid.has(Vector2i(x, y + 1))):
			edges.append([Vector2((r.y + 1) * T, (y + 1) * T), Vector2(r.x * T, (y + 1) * T)])  # bottom, right->left
	for x in range(lo.x, hi.x + 1):
		for r in _runs(lo.y, hi.y, func(y: int) -> bool: return solid.has(Vector2i(x, y)) and not solid.has(Vector2i(x + 1, y))):
			edges.append([Vector2((x + 1) * T, r.x * T), Vector2((x + 1) * T, (r.y + 1) * T)])  # right, top->bottom
		for r in _runs(lo.y, hi.y, func(y: int) -> bool: return solid.has(Vector2i(x, y)) and not solid.has(Vector2i(x - 1, y))):
			edges.append([Vector2(x * T, (r.y + 1) * T), Vector2(x * T, r.x * T)])  # left, bottom->top

	var holder := Node2D.new()
	holder.name = "Occluders"
	add_child(holder)
	for e: Array in edges:
		var poly := OccluderPolygon2D.new()
		poly.closed = false
		poly.cull_mode = OccluderPolygon2D.CULL_COUNTER_CLOCKWISE
		poly.polygon = PackedVector2Array(e)
		var occ := LightOccluder2D.new()
		occ.occluder = poly
		holder.add_child(occ)


## Closed occluders shaped like each partial tile's art, wound the same way
## as the outline edges so CULL_COUNTER_CLOCKWISE again lights the faces
## towards the light and casts only from the far side.
func _build_partial_occluders(partial: Array) -> void:
	if partial.is_empty():
		return
	var ref := PackedVector2Array([Vector2(0, 0), Vector2(1, 0), Vector2(1, 1), Vector2(0, 1)])
	var ref_clockwise := Geometry2D.is_polygon_clockwise(ref)
	var holder := Node2D.new()
	holder.name = "PartialOccluders"
	add_child(holder)
	for entry: Array in partial:
		for shape in TileShapes.polygons(entry[0], entry[1]):
			if Geometry2D.is_polygon_clockwise(shape) != ref_clockwise:
				shape.reverse()
			var poly := OccluderPolygon2D.new()
			poly.cull_mode = OccluderPolygon2D.CULL_COUNTER_CLOCKWISE
			poly.polygon = shape
			var occ := LightOccluder2D.new()
			occ.occluder = poly
			holder.add_child(occ)


## Moves partial tiles onto their own "<Layer>Partial" TileMapLayer on the
## flashlight's OBJECT_MASK, so the beam lights their tops without shadows
## (see flashlight.gd). Same TileSet, so collision is unchanged — whole-cell,
## as in Phaser. Runtime only; the scene keeps them on Collision.
func _split_partial_tiles(partial: Array) -> void:
	var by_layer := {}
	for entry: Array in partial:
		if not by_layer.has(entry[0]):
			by_layer[entry[0]] = []
		by_layer[entry[0]].append(entry[1])
	for layer: TileMapLayer in by_layer:
		var objects := TileMapLayer.new()
		objects.name = layer.name + "Partial"
		objects.tile_set = layer.tile_set
		objects.modulate = layer.modulate
		objects.collision_enabled = layer.collision_enabled
		objects.light_mask = FlashlightScript.OBJECT_MASK
		for cell: Vector2i in by_layer[layer]:
			objects.set_cell(cell, layer.get_cell_source_id(cell), layer.get_cell_atlas_coords(cell), layer.get_cell_alternative_tile(cell))
			layer.erase_cell(cell)
		add_child(objects)
		move_child(objects, layer.get_index() + 1)


## Contiguous runs [start, end] (inclusive) of i in from..to where exposed(i).
func _runs(from: int, to: int, exposed: Callable) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	var start := -1
	for i in range(from, to + 2):
		var hit: bool = i <= to and exposed.call(i)
		if hit and start < 0:
			start = i
		elif not hit and start >= 0:
			out.append(Vector2i(start, i - 1))
			start = -1
	return out


# ── Interaction ─────────────────────────────────────────────────────────

## Nearest door, interactable or dropped item within reach — GameScene's
## one-verb E. Doors are measured to their zone centre, like Phaser.
func _nearest_target() -> Node2D:
	var nearest: Node2D = null
	var best := INF
	var calm := afflicted.filter(func(a: Node) -> bool: return is_instance_valid(a) and a.is_calm())
	var candidates: Array = $Entities/Interactables.get_children() + $Entities/Doors.get_children() + _dropped_nodes() + calm
	for target in candidates:
		if target.is_queued_for_deletion():
			continue
		var extra: Variant = target.get("extra")
		var radius := float(extra.get("interactRadius", INTERACT_DISTANCE)) if extra is Dictionary else INTERACT_DISTANCE
		var dist: float = player.position.distance_to(target.position)
		if dist < radius and dist < best:
			best = dist
			nearest = target
	return nearest


func _interact() -> void:
	var nearest := _nearest_target()
	if nearest == null:
		return
	if nearest.get_script() == DoorScript:
		_use_door(nearest)
		return
	if nearest.has_meta("drop"):
		_pick_up_dropped(nearest)
		return
	if nearest in afflicted:
		_talk_to(nearest)
		return

	match nearest.kind:
		"item":
			var item: Dictionary = nearest.item
			if game.add_item(item) < 0:
				hud.open_dialog("Inventory is full!\nDrop something first. (TAB)", "system")
				return
			game.collected[nearest.interact_id] = true
			hud.set_inventory(game.inventory)
			hud.open_dialog(nearest.text if nearest.text != "" else "Picked up %s." % item.get("name", "something"), "lore")
			nearest.queue_free()
		"recharge":
			flashlight.recharge()
			hud.open_dialog(nearest.text, "lore")
		_:
			hud.open_dialog(nearest.text, "lore")


## GameScene.handleDoorTransition: a locked door (requiredKeys) opens with
## any listed key — which is used up unless consumedOnUse is false — and
## stays unlocked. `requires` conditions (flags etc.) aren't ported yet.
func _use_door(door: Node) -> void:
	var keys: PackedStringArray = door.required_keys
	if not keys.is_empty() and not game.unlocked_doors.has(door.door_id):
		var key := ""
		for k in keys:
			if held.has(k):
				key = k
				break
		if key == "":
			hud.open_dialog(door.locked_message if door.locked_message != "" else "This door is locked.\nYou need a key to open it.", "system")
			return
		var item: Variant = held[key]
		if not (item is Dictionary and item.get("consumedOnUse", true) == false):
			game.remove_key(key)
			hud.set_inventory(game.inventory)
		game.unlocked_doors[door.door_id] = true
		# UIScene outlives the room in Phaser, so the unlock line shows over
		# the next room; carry it across the scene change.
		game.pending_toast = door.unlocked_message if door.unlocked_message != "" else "Door unlocked!"

	var target := "res://scenes/rooms/%s.tscn" % door.target_room
	if not ResourceLoader.exists(target):
		hud.open_dialog("[%s isn't imported yet — node godot/tools/import-room.cjs %s]" % [door.target_room, door.target_room], "system")
		return
	game.pending_spawn = _arrival_spawn(door.target_room, door.target_door)
	game.facing = player.facing
	game.flashlight_on = flashlight.on
	game.flashlight_charge = flashlight.charge
	set_process_unhandled_input(false)
	await _fade(1.0)
	get_tree().change_scene_to_file(target)


## RoomManager.getSpawnForDoor: the target door's spawnX/spawnY in rooms.json.
func _arrival_spawn(room_name: String, door_name: String) -> Variant:
	var rooms: Dictionary = WardenData.load_json("data/rooms.json")["rooms"]
	for d: Dictionary in rooms.get(room_name, {}).get("doors", []):
		if d["id"] == door_name:
			return Vector2(d["spawnX"], d["spawnY"])
	return null  # unknown door: the room's own PlayerSpawn


## TransitionManager: fade to black (to = 1) or back in (to = 0).
func _fade(to: float) -> void:
	if _fade_rect == null:
		var layer := CanvasLayer.new()
		layer.layer = 50  # DEPTH.TRANSITION — above everything
		_fade_rect = ColorRect.new()
		_fade_rect.color = Color(0, 0, 0, 1.0 - to)
		_fade_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
		_fade_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		layer.add_child(_fade_rect)
		add_child(layer)
	var tw := create_tween()
	tw.tween_property(_fade_rect, "color:a", to, 0.25)
	await tw.finished


# ── Afflicted (GameScene.spawnAfflicted / applyCure / collision) ───────

func _spawn_afflicted() -> void:
	var rooms: Dictionary = WardenData.load_json("data/rooms.json")["rooms"]
	var cast: Dictionary = WardenData.load_json("data/characters.json")["characters"]
	var cured: Dictionary = game.cured if game else {}
	var recovered: Dictionary = game.recovered if game else {}
	# 1) Placements — where each afflicted spawns before its cure.
	for def: Dictionary in rooms.get(room_id, {}).get("afflicted", []):
		var character: Dictionary = cast.get(def.get("character", ""), {})
		var sid: String = def.get("character", def.get("id", ""))
		if recovered.has(sid):
			continue  # recovered residents are roster bodies, not NPCs
		if cured.has(sid) and character.has("home"):
			continue  # cured cast members have gone home
		_add_afflicted(def, character, "cured" if cured.has(sid) else "wandering")
	# 2) Home spawns — cured-but-not-recovered cast members wait at home.
	for cid: String in cast:
		var c: Dictionary = cast[cid]
		if c.get("home", {}).get("room", "") != room_id or not cured.has(cid) or recovered.has(cid):
			continue
		_add_afflicted({"id": cid, "character": cid, "x": c["home"]["x"], "y": c["home"]["y"], "behaviorLoop": "sentinel"}, c, "cured")


func _add_afflicted(def: Dictionary, character: Dictionary, initial: String) -> void:
	var a: CharacterBody2D = AfflictedScript.new()
	a.name = "Afflicted-" + def.get("id", "x")
	a.setup(def, character, initial, sprite_scale)
	$Entities.add_child(a)
	if player:
		$Entities.move_child(a, player.get_index())  # drawn under the player
	afflicted.append(a)


## Flashlight.isInCone from the beam origin — plus, here, line of sight.
func _in_cone(target: Vector2) -> bool:
	var origin: Vector2 = player.position + FlashlightScript.ORIGIN[player.facing]
	var d := target - origin
	if d.length() > FlashlightScript.RANGE or d.length() < 1.0:
		return false
	if absf(angle_difference(FlashlightScript.ANGLE[player.facing], d.angle())) > FlashlightScript.HALF_ANGLE:
		return false
	if FRIGHT_NEEDS_LINE_OF_SIGHT:
		var ray := PhysicsRayQueryParameters2D.create(origin, target, AfflictedScript.LAYER_WALLS)
		if not get_world_2d().direct_space_state.intersect_ray(ray).is_empty():
			return false
	return true


## GameScene.handleAfflictedCollision: carrying a matching cure cures them;
## otherwise it's death. With no roster yet, death is the full run reset.
func _on_touch(a: Node) -> void:
	for i in game.inventory.size():
		var it: Variant = game.inventory[i]
		if it is Dictionary and it.get("category") == "cure" and it.get("useTarget", "") in ["", a.afflicted_id]:
			_apply_cure(a, i, false)
			return
	_die()


## GameScene.applyCure — the single cure entry point.
func _apply_cure(a: Node, slot: int, debug: bool) -> void:
	_cure_cooldown = 0.5
	var item: Variant = game.inventory[slot] if slot >= 0 else null
	if slot >= 0:
		game.remove_slot(slot)
		hud.set_inventory(game.inventory)
	game.cured[a.afflicted_id] = true
	a.set_status("cured")
	if a.home_room != "":
		_unlock_doors_to(a.home_room)
	_shake(0.2, 0.006)
	for held_item: Dictionary in a.holds:  # dropHeldItems
		_drop_at(held_item, a.position + Vector2(0, 8))
	if debug:
		return
	var item_name: String = item.get("name", "cure") if item is Dictionary else "cure"
	var clue := Words.resolve(a.cured_clue) if a.cured_clue != "" else ""
	if clue != "":
		hud.open_dialog("The %s shattered on impact.\n%s slumps against the wall.\n\n%s" % [item_name, a.resident_name, clue], "narrative")
	else:
		hud.open_dialog("The %s shattered on impact.\n%s seems to be calming down.\nThey seem to need some time alone." % [item_name, a.resident_name], "narrative")


## GameScene.unlockDoorsToRoom: every door, in every room, leading home.
func _unlock_doors_to(target_room: String) -> void:
	for rdef: Dictionary in WardenData.load_json("data/rooms.json")["rooms"].values():
		for d: Dictionary in rdef.get("doors", []):
			if d.get("targetRoom") == target_room:
				game.unlocked_doors[d["id"]] = true


## No roster yet, so every death is the last one: shake, fade, fresh run
## from startRoom (GameScene: rsm.reset() + scene.restart()).
func _die() -> void:
	_dying = true
	player.frozen = true
	_shake(0.4, 0.01)
	await get_tree().create_timer(0.4).timeout
	await _fade(1.0)
	game.reset()
	var start: String = WardenData.load_json("data/rooms.json").get("startRoom", "protag-house")
	get_tree().change_scene_to_file("res://scenes/rooms/%s.tscn" % start)


## E on a calm afflicted (GameScene.handleAfflictedInteract).
func _talk_to(a: Node) -> void:
	if a.status == "recovered":
		hud.open_dialog("%s\n\"I'm ready when you are.\"" % a.resident_name, "narrative")
		return
	if a.home_room != "" and a.home_room != room_id:
		hud.open_dialog("%s stares past you. They seem distant.\nMaybe they need somewhere familiar." % a.resident_name, "narrative")
		return
	if not a.is_cast():
		hud.open_dialog("%s seems to be calming down.\nThey need some time alone." % a.resident_name, "narrative")
		return
	# Home: one backstory page per E; after the last, they're recovered.
	# (Phaser then adds them to the roster — not ported yet.)
	var page: int = _recovery_page.get(a.afflicted_id, 0)
	if page < a.backstory.size():
		hud.open_dialog(a.backstory[page], "narrative")
		_recovery_page[a.afflicted_id] = page + 1
	if page + 1 >= a.backstory.size():
		game.recovered[a.afflicted_id] = true
		a.set_status("recovered")


## Camera shake: duration s, intensity as a fraction of the screen width
## (Phaser's cameras.main.shake).
func _shake(duration: float, intensity: float) -> void:
	_shake_time = duration
	_shake_px = intensity * 1280.0 / camera_zoom


func _drop_at(item: Dictionary, at: Vector2) -> void:
	var entry := {"item": item, "x": at.x, "y": at.y}
	if not game.dropped.has(room_id):
		game.dropped[room_id] = []
	game.dropped[room_id].append(entry)
	_spawn_drop(entry)


# ── Inventory (GameScene.handleInventoryMode) ──────────────────────────

func _inventory_input(code: Key) -> void:
	var col := _cursor % 6
	var row := _cursor / 6
	match code:
		KEY_RIGHT, KEY_D:
			if col < 5: _cursor += 1
		KEY_LEFT, KEY_A:
			if col > 0: _cursor -= 1
		KEY_DOWN, KEY_S:
			if row < 1: _cursor += 6
		KEY_UP, KEY_W:
			if row > 0: _cursor -= 6
		KEY_E:
			_use_item(_cursor)
			return
		KEY_Q:
			_drop_item(_cursor)
		KEY_TAB, KEY_ESCAPE:
			_close_inventory()
			return
	hud.set_cursor(_cursor, game.inventory)


func _close_inventory() -> void:
	_inv_mode = false
	hud.set_inventory_mode(false)


## GameScene.useInventoryItem.
func _use_item(slot: int) -> void:
	var item: Variant = game.inventory[slot]
	if not item is Dictionary:
		return
	_close_inventory()
	match item.get("category", ""):
		"key":
			hud.open_dialog("Keys are used automatically\nat locked doors.", "system")
		"cure":
			hud.open_dialog("Walk into them to administer the cure.", "system")
		"document":
			# Phaser opens DocumentReaderScene; shown here in the document style.
			hud.open_dialog("%s\n\n%s" % [item.get("name", ""), Words.resolve(item.get("content", ""))], "document")
		_:
			var content: String = item.get("content", "")
			hud.open_dialog(content if content != "" else "Nothing to use this on right now.", "lore" if content != "" else "system")
			if item.get("consumedOnUse", false):
				game.remove_slot(slot)
				hud.set_inventory(game.inventory)


## GameScene.dropInventoryItem / dropItemToWorld: at the player's feet,
## remembered per room so it's still there when you come back.
func _drop_item(slot: int) -> void:
	var item: Variant = game.remove_slot(slot)
	if not item is Dictionary:
		return
	var entry := {"item": item, "x": player.position.x, "y": player.position.y + 12.0}
	if not game.dropped.has(room_id):
		game.dropped[room_id] = []
	game.dropped[room_id].append(entry)
	_spawn_drop(entry)
	hud.set_inventory(game.inventory)


func _pick_up_dropped(node: Node2D) -> void:
	var entry: Dictionary = node.get_meta("drop")
	if game.add_item(entry["item"]) < 0:
		hud.open_dialog("Inventory is full!", "system")
		return
	game.dropped[room_id].erase(entry)
	node.queue_free()
	hud.set_inventory(game.inventory)


func _spawn_dropped() -> void:
	for entry: Dictionary in game.dropped.get(room_id, []):
		_spawn_drop(entry)


func _spawn_drop(entry: Dictionary) -> void:
	var item: Dictionary = entry["item"]
	var s := Sprite2D.new()
	s.position = Vector2(entry["x"], entry["y"])
	if item.has("tileFrame"):
		s.texture = WardenData.tileset_texture(item.get("tilesetKey"))
		s.region_enabled = true
		s.region_rect = WardenData.frame_rect(int(item["tileFrame"]))
	s.set_meta("drop", entry)
	s.add_to_group("dropped")
	$Entities/Interactables.add_sibling(s)
	if s.texture:
		_bob(s)


## GameScene.createItemSprite: pickups bob 3 px over 0.8 s (sine, yoyo) and
## their shadow shrinks and fades as they rise. The shadow is the item's own
## silhouette flattened on the ground (item_shadow.gd), not Phaser's rings.
## The texture moves via `offset`, so the node — and its shadow — stay put.
func _bob(item: Sprite2D) -> void:
	var shadow: Node2D = ItemShadow.new()
	shadow.item = item
	item.add_child(shadow)
	var tw := item.create_tween().set_loops().set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	tw.tween_property(item, "offset:y", -3.0, 0.8)
	tw.parallel().tween_property(shadow, "lift", 1.0, 0.8)
	tw.tween_property(item, "offset:y", 0.0, 0.8)
	tw.parallel().tween_property(shadow, "lift", 0.0, 0.8)


func _dropped_nodes() -> Array:
	return get_tree().get_nodes_in_group("dropped").filter(func(n: Node) -> bool: return is_ancestor_of(n) and not n.is_queued_for_deletion())


func _schedule_taps(spec: String) -> void:
	for tap in spec.split(","):
		var parts := tap.split("@")
		var code := OS.find_keycode_from_string(parts[0].to_upper())
		get_tree().create_timer(float(parts[1])).timeout.connect(func() -> void:
			for pressed: bool in [true, false]:
				var ev := InputEventKey.new()
				ev.physical_keycode = code
				ev.keycode = code
				ev.pressed = pressed
				Input.parse_input_event(ev))


func _user_args() -> Dictionary:
	var out := {}
	for arg in OS.get_cmdline_user_args():
		var kv := arg.trim_prefix("--").split("=", true, 1)
		out[kv[0]] = kv[1] if kv.size() > 1 else true
	return out
