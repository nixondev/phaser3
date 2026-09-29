extends SceneTree
## WARDEN room importer: one Phaser room (rooms.json entry + Tiled JSON)
## -> an editable Godot scene at res://scenes/rooms/<id>.tscn.
##
## Run through tools/import-room.cjs, which calls this twice around an
## `--import` so the copied PNGs exist as Godot resources before `build`:
##   prepare  copy tileset/sprite PNGs into res://art/, write the colour palette
##   build    TileSet (.tres) + room scene (.tscn)
##
## The scene is a SANDBOX COPY: edits made in Godot don't flow back to
## rooms.json. Re-importing over an existing scene needs --force.

const TILE := 64
const ART := "res://art/"
const LAYERS := ["Ground", "OnGround", "Collision", "OnCollision", "Above", "OnAbove", "Spectra"]
const SOLID_LAYERS := ["Collision"]
const ALPHA_FIELDS := {"OnGround": "onGroundAlpha", "OnCollision": "onCollisionAlpha", "OnAbove": "onAboveAlpha"}
const PALETTE_COLS := 8
const INTERACTABLE_FIELDS := ["id", "x", "y", "type", "text", "item", "tileFrame", "tilesetKey"]
const DOOR_FIELDS := ["id", "x", "y", "width", "height", "targetRoom", "targetDoor", "direction",
	"spawnX", "spawnY", "requiredKeys", "requires", "lockedMessage", "unlockedMessage"]

const RoomScript := preload("res://scripts/room.gd")
const InteractableScript := preload("res://scripts/interactable.gd")
const DoorScript := preload("res://scripts/door.gd")
const EdgeShadowsScript := preload("res://scripts/edge_shadows.gd")
const WallShadowsScript := preload("res://scripts/wall_shadows.gd")
## EdgeShadows.ts DEFAULTS for the fields ported so far.
const EDGE_SHADOW_DEFAULTS := {"enabled": true, "alpha": 0.6, "blurOn": true, "blurX": 20, "blurStrength": 1, "blurSteps": 5}

var room_id: String
var world: Dictionary
var room: Dictionary
var map: Dictionary


func _init() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() < 2:
		printerr("usage: -- <prepare|build> <room-id> [--force]")
		quit(2)
		return
	var mode: String = args[0]
	room_id = args[1]

	world = WardenData.load_json("data/rooms.json")
	if not world["rooms"].has(room_id):
		printerr("[import] no room '%s' in rooms.json" % room_id)
		quit(1)
		return
	room = world["rooms"][room_id]
	map = WardenData.load_json("tilemaps/%s.json" % room_id)

	if FileAccess.file_exists(_scene_path()) and not args.has("--force"):
		printerr("[import] %s already exists — pass --force to overwrite it (discards edits made in Godot)" % _scene_path())
		quit(1)
		return

	var ok := false
	match mode:
		"prepare": ok = _prepare(args.has("--force"))
		"build": ok = _build()
		_: printerr("[import] unknown mode: " + mode)
	quit(0 if ok else 1)


func _scene_path() -> String:
	return "res://scenes/rooms/%s.tscn" % room_id


func _tileset_path() -> String:
	return ART + "tilesets/%s.tres" % room_id


func _palette_path() -> String:
	return ART + "tilesets/%s-colors.png" % room_id


func _player_sheet() -> String:
	var cast: Dictionary = WardenData.load_json("data/characters.json")["characters"]
	return cast.get("player", {}).get("sheet", "main")


## Every distinct colour used by the room's colour tiles, in a stable order.
func _colors() -> Array:
	var seen := {}
	var ct: Dictionary = map.get("colorTiles", {})
	for lname: String in ct:
		for key: String in ct[lname]:
			seen[int(ct[lname][key])] = true
	var list := seen.keys()
	list.sort()
	return list


## TilesetResolver.ts convention: no tilesetKey = the core 'tileset'.
func _tileset_name(key: Variant) -> String:
	return key if key is String and key != "" else "tileset"


## rooms.json entry -> [tileFrame, tilesetKey] of the sprite it shows, or [].
func _sprite_of(inter: Dictionary) -> Array:
	if inter.get("type") == "item" and inter.has("item"):
		if inter.get("noSprite", false) or not inter["item"].has("tileFrame"):
			return []
		return [int(inter["item"]["tileFrame"]), inter["item"].get("tilesetKey")]
	if inter.has("tileFrame"):
		return [int(inter["tileFrame"]), inter.get("tilesetKey")]
	return []


# ── prepare ─────────────────────────────────────────────────────────────

func _prepare(force: bool) -> bool:
	for dir: String in ["tilesets", "sprites"]:
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(ART + dir))

	var images := {}
	for t: Dictionary in map["tilesets"]:
		images[t["image"]] = true
	for inter: Dictionary in room.get("interactables", []) + room.get("hiddenVisuals", []):
		var spr := _sprite_of(inter)
		if not spr.is_empty():
			images[_tileset_name(spr[1]) + ".png"] = true
	for img: String in images:
		if not _copy("tilemaps/" + img, ART + "tilesets/" + img, force):
			return false
	if not _copy("sprites/%s.png" % _player_sheet(), ART + "sprites/%s.png" % _player_sheet(), force):
		return false

	var colors := _colors()
	if not colors.is_empty():
		var rows := ceili(colors.size() / float(PALETTE_COLS))
		var img := Image.create_empty(PALETTE_COLS * TILE, rows * TILE, false, Image.FORMAT_RGBA8)
		for i in colors.size():
			img.fill_rect(Rect2i((i % PALETTE_COLS) * TILE, (i / PALETTE_COLS) * TILE, TILE, TILE), WardenData.rgb(colors[i]))
		img.save_png(ProjectSettings.globalize_path(_palette_path()))
		print("[import] palette: %d colour tiles -> %s" % [colors.size(), _palette_path()])
	return true


## Copies a synced file into res://art/. Existing art is kept (it may be
## shared with other imported rooms) unless --force.
func _copy(shared_rel: String, dst: String, force: bool) -> bool:
	var to := ProjectSettings.globalize_path(dst)
	if FileAccess.file_exists(dst) and not force:
		return true
	var err := DirAccess.copy_absolute(ProjectSettings.globalize_path(WardenData.SHARED + shared_rel), to)
	if err != OK:
		printerr("[import] copy failed (%s): %s — run tools/sync-shared.cjs first?" % [error_string(err), shared_rel])
		return false
	print("[import] art: " + dst)
	return true


# ── build ───────────────────────────────────────────────────────────────

func _build() -> bool:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)
	ts.add_physics_layer()
	# Per-tile "hollow" flag (TileShapes): trim-outline tiles that should act
	# as a whole cell for shadows and light. Ticked in the TileSet editor.
	ts.add_custom_data_layer()
	ts.set_custom_data_layer_name(0, TileShapes.HOLLOW)
	ts.set_custom_data_layer_type(0, TYPE_BOOL)

	var ranges := []
	for t: Dictionary in map["tilesets"]:
		var tex: Texture2D = load(ART + "tilesets/" + t["image"])
		if tex == null:
			printerr("[import] not imported: %s" % t["image"])
			return false
		var cols := int(t["columns"])
		var count := mini(int(t["tilecount"]), cols * (tex.get_height() / TILE))
		ranges.append({"first": int(t["firstgid"]), "count": count, "cols": cols, "id": _add_atlas(ts, tex, cols, count)})

	var colors := _colors()
	var color_id := -1
	var color_coords := {}
	if not colors.is_empty():
		color_id = _add_atlas(ts, load(_palette_path()), PALETTE_COLS, colors.size())
		for i in colors.size():
			color_coords[colors[i]] = Vector2i(i % PALETTE_COLS, i / PALETTE_COLS)

	ResourceSaver.save(ts, _tileset_path())
	ts = ResourceLoader.load(_tileset_path(), "", ResourceLoader.CACHE_MODE_REPLACE)

	var root := Node2D.new()
	root.name = room_id
	root.set_script(RoomScript)
	root.set("room_id", room_id)
	root.set("room_name", room.get("name", room_id))
	root.set("room_size", Vector2i(int(map["width"]), int(map["height"])))
	root.set("dark", room.get("dark", false))
	root.set("dark_level", float(room.get("darkLevel", 0.92)))  # DARKNESS_CONFIG.DEFAULT_LEVEL
	root.set("reverb", room.get("reverb", ""))
	root.set("reverb_mix", float(room.get("reverbMix", 0.3)))
	root.set("player_sheet", load(ART + "sprites/%s.png" % _player_sheet()))
	root.set("sprite_scale", float(world.get("spriteScale", 1.0)))
	root.set("camera_zoom", float(world.get("cameraZoom", 1.0)))

	var layer_data := {}
	for l: Dictionary in map["layers"]:
		layer_data[l["name"]] = l

	for lname: String in LAYERS:
		if lname == "Collision":
			root.add_child(_edge_shadows())  # Phaser depth GROUND + 0.5: over the floor, under walls
			root.add_child(_wall_shadows())
		if lname == "Above":
			root.add_child(_entities())
			root.add_child(_hidden())
		_add_layers(root, lname, layer_data.get(lname), ts, ranges, color_id, color_coords)

	_own(root, root)
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://scenes/rooms"))
	var packed := PackedScene.new()
	packed.pack(root)
	var err := ResourceSaver.save(packed, _scene_path())
	root.free()
	if err != OK:
		printerr("[import] saving scene failed: " + error_string(err))
		return false
	print("[import] scene: %s  (tileset %s)" % [_scene_path(), _tileset_path()])
	return true


## Every tile gets a full-square collision polygon; only layers with
## collision_enabled (the Collision layers) use it — WARDEN's "any tile on
## Collision is solid" rule. Refine per-tile shapes in the TileSet editor.
## (Light occluders are NOT per tile: room.gd traces the outline of the
## painted Collision cells at runtime, so walls don't shadow each other.)
func _add_atlas(ts: TileSet, tex: Texture2D, cols: int, count: int) -> int:
	var src := TileSetAtlasSource.new()
	src.texture = tex
	src.texture_region_size = Vector2i(TILE, TILE)
	var id := ts.add_source(src)
	var h := TILE / 2.0
	var square := PackedVector2Array([Vector2(-h, -h), Vector2(h, -h), Vector2(h, h), Vector2(-h, h)])
	for i in count:
		var coords := Vector2i(i % cols, i / cols)
		src.create_tile(coords)
		var td := src.get_tile_data(coords, 0)
		td.add_collision_polygon(0)
		td.set_collision_polygon_points(0, 0, square)
	return id


## A layer's colour tiles go on their own "<Layer>Color" TileMapLayer just
## ABOVE its tile art — Phaser draws colour graphics at the layer's depth +
## 0.05, so a colour cell covers the tile under it. (Phaser allows both in
## one cell; Godot allows one tile per cell, hence the second layer.)
func _add_layers(root: Node2D, lname: String, layer: Variant, ts: TileSet,
		ranges: Array, color_id: int, color_coords: Dictionary) -> void:
	var tl := _new_layer(lname, ts)
	if layer != null:
		var data: Array = layer["data"]
		var w := int(layer["width"])
		for i in data.size():
			var gid := int(data[i])
			if gid == 0:
				continue
			for r: Dictionary in ranges:
				var local: int = gid - r["first"]
				if local >= 0 and local < r["count"]:
					tl.set_cell(Vector2i(i % w, i / w), r["id"], Vector2i(local % r["cols"], local / r["cols"]))
					break
	root.add_child(tl)

	var colors: Dictionary = map.get("colorTiles", {}).get(lname, {})
	if not colors.is_empty():
		var cl := _new_layer(lname + "Color", ts)
		for key: String in colors:
			var xy := key.split(",")
			cl.set_cell(Vector2i(int(xy[0]), int(xy[1])), color_id, color_coords[int(colors[key])])
		root.add_child(cl)


func _new_layer(lname: String, ts: TileSet) -> TileMapLayer:
	var base := lname.trim_suffix("Color")
	var tml := TileMapLayer.new()
	tml.name = lname
	tml.tile_set = ts
	tml.modulate.a = float(room.get(ALPHA_FIELDS.get(base, ""), 1.0))
	tml.collision_enabled = base in SOLID_LAYERS
	# Spectra is revealed by the flashlight — toggle its eye icon to see it.
	tml.visible = base != "Spectra"
	return tml


## DEFAULTS <- rooms.json global `edgeShadows` <- the room's own override,
## the same merge as EdgeShadows.ts buildEdgeShadows().
func _edge_shadows() -> Node2D:
	var s := EDGE_SHADOW_DEFAULTS.duplicate()
	s.merge(world.get("edgeShadows", {}), true)
	s.merge(room.get("edgeShadows", {}), true)
	var node := Node2D.new()
	node.name = "EdgeShadows"
	node.set_script(EdgeShadowsScript)
	node.set("enabled", s["enabled"])
	node.set("shadow_alpha", float(s["alpha"]))
	# Phaser blur = blurSteps passes of a 5-tap gaussian (sigma ≈ 1.12 × spacing).
	var sigma := 1.12 * float(s["blurX"]) * float(s["blurStrength"]) * sqrt(float(s["blurSteps"]))
	node.set("blur_sigma", snappedf(sigma, 0.1) if s["blurOn"] else 0.0)
	return node


## Unified silhouette shadows. Outdoor rooms (with weather) get rim + a sky
## cast shadow; indoor rooms just the rim — their directional shadows come
## from the flashlight. `compare` = "legacy rim" brings EdgeShadows back.
func _wall_shadows() -> Node2D:
	var node := Node2D.new()
	node.name = "WallShadows"
	node.set_script(WallShadowsScript)
	node.set("compare", "rim + cast" if room.has("weather") else "rim")
	return node


func _entities() -> Node2D:
	var entities := Node2D.new()
	entities.name = "Entities"

	var spawn := Marker2D.new()
	spawn.name = "PlayerSpawn"
	var ps: Dictionary = room.get("playerSpawn", {"x": 0, "y": 0})
	spawn.position = Vector2(ps["x"], ps["y"])
	entities.add_child(spawn)

	var doors := Node2D.new()
	doors.name = "Doors"
	entities.add_child(doors)
	for door: Dictionary in room.get("doors", []):
		doors.add_child(_door(door))

	var inters := Node2D.new()
	inters.name = "Interactables"
	entities.add_child(inters)
	for inter: Dictionary in room.get("interactables", []):
		if not inter.get("hidden", false):
			inters.add_child(_interactable(inter))
	return entities


## Spectra-revealed things (hidden interactables + hiddenVisuals). Hidden in
## the editor by default — toggle the eye icon to see them.
func _hidden() -> Node2D:
	var hidden := Node2D.new()
	hidden.name = "Hidden"
	hidden.visible = false
	for inter: Dictionary in room.get("interactables", []):
		if inter.get("hidden", false):
			hidden.add_child(_interactable(inter))
	for vis: Dictionary in room.get("hiddenVisuals", []):
		var s := Sprite2D.new()
		s.name = vis["id"]
		s.position = Vector2(vis["x"], vis["y"])
		_set_frame(s, _sprite_of(vis))
		hidden.add_child(s)
	return hidden


func _interactable(inter: Dictionary) -> Sprite2D:
	var s := Sprite2D.new()
	s.set_script(InteractableScript)
	s.name = inter["id"]
	s.position = Vector2(inter["x"], inter["y"])
	_set_frame(s, _sprite_of(inter))
	s.set("interact_id", inter["id"])
	s.set("kind", inter.get("type", ""))
	s.set("text", str(inter.get("text", "")))
	s.set("item", inter.get("item", {}))
	s.set("extra", _without(inter, INTERACTABLE_FIELDS))
	return s


func _door(door: Dictionary) -> Area2D:
	var w := float(door.get("width", TILE))
	var h := float(door.get("height", TILE))
	var a := Area2D.new()
	a.set_script(DoorScript)
	a.name = door["id"]
	a.position = Vector2(door["x"] + w / 2.0, door["y"] + h / 2.0)  # Phaser zones are top-left
	var rect := RectangleShape2D.new()
	rect.size = Vector2(w, h)
	var shape := CollisionShape2D.new()
	shape.name = "Zone"
	shape.shape = rect
	a.add_child(shape)
	a.set("door_id", door["id"])
	a.set("target_room", door.get("targetRoom", ""))
	a.set("target_door", door.get("targetDoor", ""))
	a.set("direction", door.get("direction", "up"))
	a.set("spawn", Vector2(door.get("spawnX", 0), door.get("spawnY", 0)))
	a.set("required_keys", PackedStringArray(door.get("requiredKeys", [])))
	a.set("requires", door.get("requires", []))
	a.set("locked_message", door.get("lockedMessage", ""))
	a.set("unlocked_message", door.get("unlockedMessage", ""))
	a.set("extra", _without(door, DOOR_FIELDS))
	return a


func _set_frame(s: Sprite2D, spr: Array) -> void:
	if spr.is_empty():
		return
	s.texture = load(ART + "tilesets/%s.png" % _tileset_name(spr[1]))
	s.region_enabled = true
	s.region_rect = WardenData.frame_rect(spr[0])


func _without(d: Dictionary, keys: Array) -> Dictionary:
	var out := {}
	for k: String in d:
		if not k in keys:
			out[k] = d[k]
	return out


func _own(node: Node, root: Node) -> void:
	for child in node.get_children():
		child.owner = root
		_own(child, root)
