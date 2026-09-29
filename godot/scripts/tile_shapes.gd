class_name TileShapes
## What a painted tile actually looks like — its art silhouette, not its
## 64px cell — for shadows (WallShadows) and flashlight occluders (room.gd).
##
## The "hollow" flag is a per-tile custom data layer on the TileSet (tick it
## in the TileSet editor → Paint → Custom Data → hollow). A hollow tile is
## treated as its whole cell: shadows never fall inside it and it blocks
## light as a full square. For trim-outline tiles (frame edges) whose
## transparent interior must not collect their own shadow — the case
## EdgeShadows.ts's whole-cell knockout protected.

const TILE := 64
const HOLLOW := "hollow"
## A tile at least this opaque counts as a full cell.
const FULL_COVERAGE := 0.95
## A PIXEL counts as solid at this alpha or more — one rule for coverage,
## occluder polygons and shadow masks. Art can carry near-invisible pixels
## (the crate tile has 257 at alpha 1–25%, some detached from the box); a
## "> 0" test made those cast and block shadow, leaving a visible gap.
const SOLID_ALPHA := 0.5

static var _images := {}    # Texture2D -> RGBA8 Image (a COPY)
static var _coverage := {}  # tile key -> fraction of opaque pixels
static var _polys := {}     # tile key -> Array[PackedVector2Array], tile-local px


## The tile's atlas image region at full resolution, or null (colour tiles
## and missing art count as solid).
static func tile_image(layer: TileMapLayer, cell: Vector2i) -> Image:
	var src := layer.tile_set.get_source(layer.get_cell_source_id(cell)) as TileSetAtlasSource
	if src == null or src.texture == null:
		return null
	if not _images.has(src.texture):
		# duplicate(): CompressedTexture2D.get_image() returns the texture's
		# own cached Image; changing it corrupts the texture in the editor.
		var img: Image = src.texture.get_image().duplicate()
		if img.is_compressed():
			img.decompress()
		img.convert(Image.FORMAT_RGBA8)
		_images[src.texture] = img
	var region := src.get_tile_texture_region(layer.get_cell_atlas_coords(cell))
	return (_images[src.texture] as Image).get_region(region)


static func is_hollow(layer: TileMapLayer, cell: Vector2i) -> bool:
	if layer.tile_set.get_custom_data_layer_by_name(HOLLOW) < 0:
		return false
	var td := layer.get_cell_tile_data(cell)
	return td != null and bool(td.get_custom_data(HOLLOW))


static func coverage(layer: TileMapLayer, cell: Vector2i) -> float:
	var key := _key(layer, cell)
	if not _coverage.has(key):
		var img := tile_image(layer, cell)
		if img == null:
			_coverage[key] = 1.0
		else:
			var data := img.get_data()
			var opaque := 0
			for i in range(3, data.size(), 4):
				if data[i] >= int(SOLID_ALPHA * 255.0):
					opaque += 1
			_coverage[key] = opaque / float(img.get_width() * img.get_height())
	return _coverage[key]


## Should this cell behave as a whole 64px square?
static func is_full(layer: TileMapLayer, cell: Vector2i) -> bool:
	return is_hollow(layer, cell) or coverage(layer, cell) >= FULL_COVERAGE


## The tile's opaque shape as polygons, in world coordinates.
static func polygons(layer: TileMapLayer, cell: Vector2i) -> Array[PackedVector2Array]:
	var key := _key(layer, cell)
	if not _polys.has(key):
		var local: Array[PackedVector2Array] = []
		var img := tile_image(layer, cell)
		if img != null:
			var bits := BitMap.new()
			bits.create_from_image_alpha(img, SOLID_ALPHA)
			for poly in bits.opaque_to_polygons(Rect2i(Vector2i.ZERO, img.get_size()), 1.5):
				if poly.size() >= 3:
					local.append(poly)
		_polys[key] = local
	var out: Array[PackedVector2Array] = []
	var offset := Vector2(cell * TILE)
	for poly: PackedVector2Array in _polys[key]:
		var moved := PackedVector2Array()
		for p in poly:
			moved.append(p + offset)
		out.append(moved)
	return out


## The tile's solid pixels as a hard white-on-transparent mask of size×size
## (for Image.blit_rect_mask, which copies wherever alpha > 0 — so faint
## pixels must be dropped here, after scaling).
static func solid_mask(img: Image, size: int) -> Image:
	var out := img.duplicate() as Image
	out.convert(Image.FORMAT_RGBA8)
	out.resize(size, size, Image.INTERPOLATE_BILINEAR)
	var data := out.get_data()
	var cut := int(SOLID_ALPHA * 255.0)
	for i in range(0, data.size(), 4):
		var solid := data[i + 3] >= cut
		data[i] = 255
		data[i + 1] = 255
		data[i + 2] = 255
		data[i + 3] = 255 if solid else 0
	return Image.create_from_data(size, size, false, Image.FORMAT_RGBA8, data)


static func _key(layer: TileMapLayer, cell: Vector2i) -> String:
	return "%d:%d:%s" % [layer.tile_set.get_instance_id(), layer.get_cell_source_id(cell), layer.get_cell_atlas_coords(cell)]
