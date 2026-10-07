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

## RoomStateManager roster: playable characters, in join order.
## Each: {id, sheet, room, x, y, traits}. The protagonist ("player") joins
## on the first room load; recovered residents join after their backstory.
var roster: Array = []
var active := "player"
## id -> that character's 12-slot inventory. `inventory` is the active one's.
var inventories := {}
## World flags (set by code for now: died/<id>). The puzzle grammar that
## reads and writes them isn't ported yet.
var flags := {}

## Capture flags (--at, --tap, --give …) apply to the first room only;
## re-applying them after a door made captures bounce between rooms.
var boot_args_used := false


func _init() -> void:
	inventory.resize(SLOTS)


func init_roster(state: Dictionary) -> void:
	if roster.is_empty():
		roster.append(state)
		inventories[state["id"]] = inventory


func add_to_roster(state: Dictionary, items: Array) -> void:
	if character(state["id"]) != null:
		return
	roster.append(state)
	var inv := []
	inv.resize(SLOTS)
	for i in mini(items.size(), SLOTS):
		inv[i] = items[i]
	inventories[state["id"]] = inv


func remove_from_roster(id: String) -> void:
	roster = roster.filter(func(c: Dictionary) -> bool: return c["id"] != id)
	inventories.erase(id)


func character(id: String) -> Variant:
	for c: Dictionary in roster:
		if c["id"] == id:
			return c
	return null


func update_position(id: String, room: String, pos: Vector2) -> void:
	var c: Variant = character(id)
	if c != null:
		c["room"] = room
		c["x"] = pos.x
		c["y"] = pos.y


## RoomStateManager.setActiveCharacter: stash the outgoing inventory, load
## the incoming one, and rebuild the keyId lookup for whoever is now active.
func set_active(id: String) -> void:
	if id == active:
		return
	if character(active) != null:
		inventories[active] = inventory
	var incoming: Variant = inventories.get(id)
	if incoming == null:
		incoming = []
		incoming.resize(SLOTS)
		inventories[id] = incoming
	inventory = incoming
	active = id
	held.clear()  # in place: rooms hold a reference to this Dictionary
	for it in inventory:
		if it is Dictionary and it.has("keyId"):
			held[it["keyId"]] = it


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
	roster.clear()
	active = "player"
	inventories.clear()
	flags.clear()
	flashlight_on = false
	flashlight_charge = 100.0
	facing = "down"
	pending_spawn = null
