class_name WardenData
## Reads the Phaser project's files (synced into res://shared/) as plain data.
## PNGs are loaded straight from disk rather than through Godot's importer so
## the spike always shows exactly what the Phaser editors last saved.

const SHARED := "res://shared/"
const TILE := 64

static var _textures := {}


static func load_json(rel: String) -> Variant:
	var text := FileAccess.get_file_as_string(SHARED + rel)
	if text.is_empty():
		push_error("[warden] missing or empty: " + rel)
		return null
	return JSON.parse_string(text)


static func texture(rel: String) -> Texture2D:
	if _textures.has(rel):
		return _textures[rel]
	var img := Image.load_from_file(ProjectSettings.globalize_path(SHARED + rel))
	var tex: Texture2D = ImageTexture.create_from_image(img) if img else null
	if tex == null:
		push_warning("[warden] could not load texture: " + rel)
	_textures[rel] = tex
	return tex


## rooms.json `tileFrame` + optional `tilesetKey` -> the tileset PNG it lives in.
## Mirrors src/utils/TilesetResolver.ts: no key = the core 'tileset'.
static func tileset_texture(tileset_key: Variant) -> Texture2D:
	var tname: String = tileset_key if tileset_key is String and tileset_key != "" else "tileset"
	return texture("tilemaps/%s.png" % tname)


## 0-indexed frame in an 8-column 64px tileset -> its pixel rect.
static func frame_rect(frame: int, columns: int = 8) -> Rect2:
	return Rect2((frame % columns) * TILE, (frame / columns) * TILE, TILE, TILE)


## Tiled/Phaser colour ints are 0xRRGGBB.
static func rgb(value: Variant) -> Color:
	return Color.hex((int(value) << 8) | 0xFF)
