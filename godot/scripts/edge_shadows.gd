@tool
extends Node2D
## Port of src/systems/EdgeShadows.ts ('silhouette' style): the soft dark rim
## around collision walls that makes them read as raised above the floor.
##
## Same recipe as Phaser: stamp the art of every Collision-layer tile (and
## Collision colour tile) in black, blur it, then knock the solid cells back
## out so the shadow only shows on the floor around them.
##
## Rebuilt from the sibling Collision layers — LIVE in the editor: paint a
## wall and its shadow follows. Nothing is baked into the scene file.
##
## Not ported yet: the directional drop shadow (`shadowOn`) and the rough
## border (`borderOn`) — both are off for protag-house.

## Built at half resolution; the blur hides it and big rooms stay cheap.
const RES := 0.5

@export var enabled := true:
	set(v):
		enabled = v
		_queue()
## rooms.json edgeShadows.alpha
@export_range(0.0, 1.0) var shadow_alpha := 1.0:
	set(v):
		shadow_alpha = v
		self_modulate.a = v
## Softness: the blur's gaussian sigma in world px (0 = no blur). Phaser's
## postFX blur runs `blurSteps` passes of a 5-tap gaussian spaced
## blurX × blurStrength apart, i.e. sigma ≈ 1.12 × blurX × blurStrength ×
## √blurSteps — the importer converts rooms.json's values with that.
@export_range(0.0, 64.0) var blur_sigma := 18.0:
	set(v):
		blur_sigma = v
		_queue()
## Sibling TileMapLayers whose painted cells cast the shadow.
## Each one's runtime "<name>Partial" layer (room.gd moves partial tiles
## there) is included automatically — not listed here, because this list is
## saved into scenes and a new default wouldn't reach them.
@export var source_layers := PackedStringArray(["Collision", "CollisionColor"])

var _tex: Texture2D
var _queued := false
var _cells_sig := 0
var _poll := 0.0
var _masks := {}  # atlas texture -> its image at RES (alpha = tile shape)
var _blacks := {}  # Vector2i size -> opaque black image


func _ready() -> void:
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	self_modulate.a = shadow_alpha
	_cells_sig = _cells_signature()
	_rebuild()


func _draw() -> void:
	if _tex:
		draw_texture_rect(_tex, Rect2(Vector2.ZERO, _tex.get_size() / RES), false)


## Painting cells doesn't emit TileMapLayer.changed (checked in Godot 4.7:
## zero emissions for set_cell / erase_cell), so the live rebuild polls a
## cheap fingerprint of the source layers' cell data instead.
func _process(delta: float) -> void:
	_poll -= delta
	if _poll > 0.0:
		return
	_poll = 0.25
	var sig := _cells_signature()
	if sig != _cells_sig:
		_cells_sig = sig
		_queue()


func _cells_signature() -> int:
	var sig := 0
	for layer in _layers():
		sig = hash([sig, layer.tile_map_data])
	return sig


func _queue() -> void:
	if _queued or not is_inside_tree():
		return
	_queued = true
	_rebuild.call_deferred()


func _layers() -> Array[TileMapLayer]:
	var out: Array[TileMapLayer] = []
	if get_parent() == null:
		return out
	for lname in source_layers:
		for n in [lname, lname + "Partial"]:
			var layer := get_parent().get_node_or_null(NodePath(n)) as TileMapLayer
			if layer:
				out.append(layer)
	return out


func _rebuild() -> void:
	_queued = false
	_tex = null
	queue_redraw()
	if not enabled:
		return

	var cells := {}  # Vector2i -> the TileMapLayer painting it
	for layer in _layers():
		for cell in layer.get_used_cells():
			cells[cell] = layer
	if cells.is_empty():
		return
	var hi := Vector2i.ZERO
	for cell: Vector2i in cells:
		hi = hi.max(cell)

	# 1) Silhouette: each solid cell's tile art, in black.
	var t := int(WardenData.TILE * RES)
	var img := Image.create_empty((hi.x + 1) * t, (hi.y + 1) * t, false, Image.FORMAT_RGBA8)
	for cell: Vector2i in cells:
		var layer: TileMapLayer = cells[cell]
		var src := layer.tile_set.get_source(layer.get_cell_source_id(cell)) as TileSetAtlasSource
		if src == null or src.texture == null:
			img.fill_rect(Rect2i(cell * t, Vector2i(t, t)), Color.BLACK)
			continue
		var mask := _mask(src.texture)
		var region := src.get_tile_texture_region(layer.get_cell_atlas_coords(cell))
		img.blit_rect_mask(_black(mask.get_size()), mask, Rect2i(Vector2i(Vector2(region.position) * RES), Vector2i(t, t)), cell * t)

	# 2) Blur: box-average down by k (repeated halving = proper averaging),
	#    then cubic back up — roughly a gaussian of sigma 0.58k. All native
	#    Image ops, so it's quick enough to rerun live while painting.
	var r := 1.72 * blur_sigma * RES
	if r >= 1.0:
		var w := img.get_width()
		var h := img.get_height()
		var tw := maxi(1, int(w / r))
		var th := maxi(1, int(h / r))
		while img.get_width() / 2 >= tw and img.get_height() / 2 >= th:
			img.resize(img.get_width() / 2, img.get_height() / 2, Image.INTERPOLATE_BILINEAR)
		img.resize(tw, th, Image.INTERPOLATE_BILINEAR)
		img.resize(w, h, Image.INTERPOLATE_CUBIC)

	# 3) Knockout: shadows only ever show OUTSIDE solid cells.
	for cell: Vector2i in cells:
		img.fill_rect(Rect2i(cell * t, Vector2i(t, t)), Color(0, 0, 0, 0))

	_tex = ImageTexture.create_from_image(img)
	queue_redraw()


func _mask(tex: Texture2D) -> Image:
	if not _masks.has(tex):
		# duplicate(): CompressedTexture2D.get_image() hands back the texture's
		# own cached Image. Resizing that in place halves the texture for
		# everything else in the editor (tiles render as 2x2 minis).
		var img: Image = tex.get_image().duplicate()
		if img.is_compressed():
			img.decompress()
		img.convert(Image.FORMAT_RGBA8)
		img.resize(int(img.get_width() * RES), int(img.get_height() * RES), Image.INTERPOLATE_BILINEAR)
		# blit_rect_mask copies wherever alpha > 0; drop near-invisible pixels
		# first (TileShapes.SOLID_ALPHA) or they cast shadow like solid art.
		var data := img.get_data()
		var cut := int(TileShapes.SOLID_ALPHA * 255.0)
		for i in range(3, data.size(), 4):
			data[i] = 255 if data[i] >= cut else 0
		img = Image.create_from_data(img.get_width(), img.get_height(), false, Image.FORMAT_RGBA8, data)
		_masks[tex] = img
	return _masks[tex]


func _black(size: Vector2i) -> Image:
	if not _blacks.has(size):
		var img := Image.create_empty(size.x, size.y, false, Image.FORMAT_RGBA8)
		img.fill(Color.BLACK)
		_blacks[size] = img
	return _blacks[size]
