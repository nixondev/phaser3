extends Area2D
## A door zone from rooms.json `doors`. Data only for now — transitions
## aren't ported yet. The CollisionShape2D child is the zone (resize it in
## the editor).

@export var door_id := ""
@export var target_room := ""
@export var target_door := ""
@export_enum("up", "down", "left", "right") var direction: String = "up"
## Where the player appears in THIS room when arriving through this door.
@export var spawn := Vector2.ZERO
@export var required_keys := PackedStringArray()
@export var requires: Array = []
@export_multiline var locked_message := ""
@export_multiline var unlocked_message := ""
## Every other rooms.json field, kept verbatim.
@export var extra: Dictionary = {}
