extends Node2D
## Solid colour tiles (the `colorTiles` key in a tilemap JSON) for one layer.
## Phaser draws these with a Graphics object; here they're plain rects.

var cells := {}  # Vector2i -> Color


func _draw() -> void:
	var size := Vector2(WardenData.TILE, WardenData.TILE)
	for cell: Vector2i in cells:
		draw_rect(Rect2(Vector2(cell * WardenData.TILE), size), cells[cell])
