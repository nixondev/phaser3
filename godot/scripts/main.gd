extends Node2D
## Builds one WARDEN room from the Phaser project's own data:
## rooms.json + the room's Tiled JSON (tiles + colorTiles) + characters.json.
##
## Draw order mirrors the Phaser depths: ground/collision layers (GROUND),
## then entities + player, then Above layers (ABOVE = 30).

const TILE := WardenData.TILE
const BELOW_LAYERS := ["Ground", "OnGround", "Collision", "OnCollision"]
const ABOVE_LAYERS := ["Above", "OnAbove"]
const ALPHA_FIELDS := {"OnGround": "onGroundAlpha", "OnCollision": "onCollisionAlpha", "OnAbove": "onAboveAlpha"}
const PlayerScript := preload("res://scripts/player.gd")
const ColorLayer := preload("res://scripts/color_layer.gd")

## Empty = rooms.json `startRoom`.
@export var room_id := ""

var world: Dictionary
var room: Dictionary
var map: Dictionary


func _ready() -> void:
	world = WardenData.load_json("data/rooms.json")
	if room_id == "":
		room_id = world.get("startRoom", "protag-house")
	room = world["rooms"][room_id]
	map = WardenData.load_json("tilemaps/%s.json" % room_id)

	var tiles := _build_tileset()
	var layers := {}
	for layer: Dictionary in map["layers"]:
		layers[layer["name"]] = layer

	for lname: String in BELOW_LAYERS:
		_add_layer(lname, layers.get(lname), tiles)
	_add_collision(layers.get("Collision"))

	var entities := Node2D.new()
	entities.name = "Entities"
	add_child(entities)
	_add_interactables(entities)
	var player := _add_player(entities)

	for lname: String in ABOVE_LAYERS:
		_add_layer(lname, layers.get(lname), tiles)
	# Spectra is the flashlight-revealed layer — not drawn until the light exists.

	_add_camera(player)
	_add_hud()


# ── Tiles ───────────────────────────────────────────────────────────────

## One TileSet holding every tileset the map lists (base + room-specific),
## plus the GID ranges needed to turn Tiled GIDs back into atlas coords.
func _build_tileset() -> Dictionary:
	var ts := TileSet.new()
	ts.tile_size = Vector2i(TILE, TILE)
	var ranges := []
	for t: Dictionary in map["tilesets"]:
		var tex := WardenData.texture("tilemaps/" + t["image"])
		if tex == null:
			continue
		var cols := int(t["columns"])
		var count := mini(int(t["tilecount"]), cols * (tex.get_height() / TILE))
		var src := TileSetAtlasSource.new()
		src.texture = tex
		src.texture_region_size = Vector2i(TILE, TILE)
		for i in count:
			src.create_tile(Vector2i(i % cols, i / cols))
		ranges.append({"first": int(t["firstgid"]), "count": count, "cols": cols, "id": ts.add_source(src)})
	return {"tileset": ts, "ranges": ranges}


func _add_layer(lname: String, layer: Variant, tiles: Dictionary) -> void:
	var group := Node2D.new()
	group.name = lname
	group.modulate.a = float(room.get(ALPHA_FIELDS.get(lname, ""), 1.0))
	add_child(group)

	# Colour tiles first, tile art over them.
	var colors: Dictionary = map.get("colorTiles", {}).get(lname, {})
	if not colors.is_empty():
		var cl := ColorLayer.new()
		cl.name = "Colors"
		for key: String in colors:
			var xy := key.split(",")
			cl.cells[Vector2i(int(xy[0]), int(xy[1]))] = WardenData.rgb(colors[key])
		group.add_child(cl)

	if layer == null:
		return
	var tml := TileMapLayer.new()
	tml.name = "Tiles"
	tml.tile_set = tiles["tileset"]
	var data: Array = layer["data"]
	var w := int(layer["width"])
	for i in data.size():
		var gid := int(data[i])
		if gid == 0:
			continue
		for r: Dictionary in tiles["ranges"]:
			var local: int = gid - r["first"]
			if local >= 0 and local < r["count"]:
				tml.set_cell(Vector2i(i % w, i / w), r["id"], Vector2i(local % r["cols"], local / r["cols"]))
				break
	group.add_child(tml)


## Every non-empty Collision cell (tile or colour) is solid, like Phaser's
## setCollisionByExclusion([-1]). Horizontal runs merge into one box.
func _add_collision(layer: Variant) -> void:
	var solid := {}
	if layer != null:
		var data: Array = layer["data"]
		var w := int(layer["width"])
		for i in data.size():
			if int(data[i]) != 0:
				solid[Vector2i(i % w, i / w)] = true
	for key: String in map.get("colorTiles", {}).get("Collision", {}):
		var xy := key.split(",")
		solid[Vector2i(int(xy[0]), int(xy[1]))] = true

	var body := StaticBody2D.new()
	body.name = "Walls"
	add_child(body)
	for y in int(map["height"]):
		var x := 0
		while x < int(map["width"]):
			if not solid.has(Vector2i(x, y)):
				x += 1
				continue
			var start := x
			while solid.has(Vector2i(x, y)):
				x += 1
			var rect := RectangleShape2D.new()
			rect.size = Vector2((x - start) * TILE, TILE)
			var shape := CollisionShape2D.new()
			shape.shape = rect
			shape.position = Vector2((start + x) * TILE / 2.0, y * TILE + TILE / 2.0)
			body.add_child(shape)


# ── Entities ────────────────────────────────────────────────────────────

## Same visibility rules as GameScene's interactable pass. Hidden ones
## (spectra-revealed) are skipped until the flashlight exists.
func _add_interactables(parent: Node2D) -> void:
	for inter: Dictionary in room.get("interactables", []):
		if inter.get("hidden", false):
			continue
		var frame: Variant = null
		var key: Variant = null
		if inter.get("type") == "item" and inter.has("item"):
			if inter.get("noSprite", false):
				continue
			frame = inter["item"].get("tileFrame")
			key = inter["item"].get("tilesetKey")
		elif inter.has("tileFrame"):
			frame = inter["tileFrame"]
			key = inter.get("tilesetKey")
		if frame == null:
			continue
		var s := Sprite2D.new()
		s.name = inter["id"]
		s.texture = WardenData.tileset_texture(key)
		s.region_enabled = true
		s.region_rect = WardenData.frame_rect(int(frame))
		s.position = Vector2(inter["x"], inter["y"])
		parent.add_child(s)


func _add_player(parent: Node2D) -> CharacterBody2D:
	var cast: Dictionary = WardenData.load_json("data/characters.json")["characters"]
	var sheet_name: String = cast.get("player", {}).get("sheet", "main")
	var sheet := WardenData.texture("sprites/%s.png" % sheet_name)
	var player: CharacterBody2D = PlayerScript.new()
	player.name = "Player"
	player.setup(sheet, float(world.get("spriteScale", 1.0)))
	var spawn: Dictionary = room.get("playerSpawn", {"x": 0, "y": 0})
	player.position = Vector2(spawn["x"], spawn["y"])
	parent.add_child(player)
	return player


# ── Camera / HUD ────────────────────────────────────────────────────────

func _add_camera(player: Node2D) -> void:
	var cam := Camera2D.new()
	var zoom := float(world.get("cameraZoom", 1.0))
	cam.zoom = Vector2(zoom, zoom)
	cam.limit_left = 0
	cam.limit_top = 0
	cam.limit_right = int(map["width"]) * TILE
	cam.limit_bottom = int(map["height"]) * TILE
	player.add_child(cam)


## A CanvasLayer is screen-space by definition — the camera zoom never
## touches it (the job ScreenSpace.ts does by hand in Phaser).
func _add_hud() -> void:
	var hud := CanvasLayer.new()
	var label := Label.new()
	label.text = room.get("name", room_id)
	label.position = Vector2(16, 12)
	label.add_theme_font_size_override("font_size", 28)
	hud.add_child(label)
	add_child(hud)
