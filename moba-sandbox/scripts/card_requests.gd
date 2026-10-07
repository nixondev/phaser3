extends RefCounted
## Card requests: plain-text card ideas and edits made in the Cards view
## (card_view.gd), kept in cards/requests.json until they're built. The live
## cards stay in upgrades.gd — the game never runs on a request. The `/cards`
## command (.claude/skills/cards) reads every "requested" entry, builds or
## applies it, and marks it "live" with a note (or "needs_info" with a
## question, answered by editing the request).
##
## One request:
##   id        "r<unix time>_<n>"
##   kind      "add" (a new card) | "edit" (a change to the live card `card`)
##   card      the live card's id (edits; set on adds once built)
##   request   the plain-text description / instruction
##   name, tier, price   optional: "" / 0 = left to the builder
##   status    "requested" | "needs_info" | "live" | "removed" | "rejected"
##   note      the builder's answer: what was built, or the question
##   created   "2026-10-04 12:00"

const PATH := "res://cards/requests.json"
const OPEN := ["requested", "needs_info"]  # not handled yet


## Only from the project (the editor / a debug run): res:// isn't writable in an export.
static func available() -> bool:
	return OS.is_debug_build() and not OS.has_feature("template")


static func load_all() -> Array:
	if not FileAccess.file_exists(PATH):
		return []
	var data: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if data is Dictionary and data.get("requests") is Array:
		return data["requests"]
	return []


static func save_all(requests: Array) -> void:
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(PATH.get_base_dir()))
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	if f == null:
		push_warning("card requests: can't write %s" % PATH)
		return
	f.store_string(JSON.stringify({"requests": requests}, "  "))


static func new_request(kind: String, card: String) -> Dictionary:
	var now := Time.get_datetime_dict_from_system()
	return {"id": "r%d_%d" % [int(Time.get_unix_time_from_system()), randi() % 1000], "kind": kind, "card": card,
		"request": "", "name": "", "tier": "", "price": 0, "status": "requested", "note": "",
		"created": "%04d-%02d-%02d %02d:%02d" % [now["year"], now["month"], now["day"], now["hour"], now["minute"]]}


## Add `r`, or replace the request with the same id (editing it re-opens it).
static func put(r: Dictionary) -> void:
	var all := load_all()
	r["status"] = "requested"
	for i in all.size():
		if all[i].get("id", "") == r["id"]:
			all[i] = r
			save_all(all)
			return
	all.append(r)
	save_all(all)


static func remove(id: String) -> void:
	save_all(load_all().filter(func(r: Dictionary) -> bool: return r.get("id", "") != id))


## The open (not yet handled) edit request for live card `card_id`, or {}.
static func open_edit_for(card_id: String, all: Array) -> Dictionary:
	for r: Dictionary in all:
		if r.get("kind", "") == "edit" and r.get("card", "") == card_id and OPEN.has(r.get("status", "")):
			return r
	return {}
