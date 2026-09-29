extends Node
## Autoload — what survives a room change. A minimal stand-in for
## RoomStateManager.ts: carried items by keyId, collected interactables,
## unlocked doors, the flashlight, and where to appear in the next room.

const SLOTS := 12  # INVENTORY_CONFIG: 2 × 6

## The inventory: SLOTS entries, each a rooms.json item dict or null.
var inventory: Array = []
## keyId -> item, for every carried item that has a keyId (locks, the
## flashlight, the adapter look here). Kept in step with `inventory`;
## capture flags may also grant a keyId directly (value true, no slot).
var held := {}
## room id -> [{item, x, y}] — items dropped with Q, where they were left.
var dropped := {}
## Shown by the next room's HUD (the unlock message outlives the door).
var pending_toast := ""
## Interactable ids picked up / used up — they don't respawn.
var collected := {}
## Door ids unlocked with a key — stay unlocked.
var unlocked_doors := {}
## Afflicted ids (cast slug, or placement id for extras) — RoomStateManager
## curedResidents / recoveredResidents.
var cured := {}
var recovered := {}

var flashlight_on := false
var flashlight_charge := 100.0
var facing := "down"

## Set by a door before changing scene; consumed by the next room.
var pending_spawn: Variant = null

## Capture flags (--at, --tap, --give …) apply to the first room only;
## re-applying them after a door made captures bounce between rooms.
var boot_args_used := false


func _init() -> void:
	inventory.resize(SLOTS)


## RoomStateManager.addToInventory: first free slot, or -1 when full.
func add_item(item: Dictionary) -> int:
	var slot := inventory.find(null)
	if slot < 0:
		return -1
	inventory[slot] = item
	if item.has("keyId"):
		held[item["keyId"]] = item
	return slot


func remove_slot(slot: int) -> Variant:
	var item: Variant = inventory[slot]
	inventory[slot] = null
	if item is Dictionary and item.has("keyId") and not _carrying_key(item["keyId"]):
		held.erase(item["keyId"])
	return item


## Use up a key by keyId (its inventory slot, or a granted one).
func remove_key(key_id: String) -> void:
	for i in SLOTS:
		if inventory[i] is Dictionary and inventory[i].get("keyId") == key_id:
			remove_slot(i)
			return
	held.erase(key_id)


func _carrying_key(key_id: String) -> bool:
	for it in inventory:
		if it is Dictionary and it.get("keyId") == key_id:
			return true
	return false


## A fresh run (the title screen's Start).
func reset() -> void:
	inventory.fill(null)
	dropped.clear()
	pending_toast = ""
	held.clear()
	collected.clear()
	unlocked_doors.clear()
	cured.clear()
	recovered.clear()
	flashlight_on = false
	flashlight_charge = 100.0
	facing = "down"
	pending_spawn = null
