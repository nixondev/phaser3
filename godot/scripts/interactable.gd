extends Sprite2D
## An E-target from a rooms.json `interactables` entry. Data only for now —
## interaction isn't ported yet. The sprite is its tileFrame region.

@export var interact_id := ""
## rooms.json `type`: sign, item, recharge, container, ...
@export var kind := ""
## Shown on E. May be a `words:<key>` reference.
@export_multiline var text := ""
## The item this picks up as (type = item).
@export var item: Dictionary = {}
## Every other rooms.json field, kept verbatim so nothing is lost on import.
@export var extra: Dictionary = {}
