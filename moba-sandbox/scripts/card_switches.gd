extends RefCounted
## Cards switched off in the Cards view (dev builds rewrite this file; it
## ships with the game). An off card stays in upgrades.gd but is never offered
## — not in your shop, red's, or Training's. Cards you already own keep working.

const OFF := []

static var off: Array = OFF.duplicate()  # the live set (the Cards view updates it without a restart)


static func is_on(id: String) -> bool:
	return not off.has(id)
