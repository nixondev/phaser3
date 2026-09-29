class_name Words
## Port of src/systems/Words.ts — all player-facing prose lives in
## words/**/*.twee (Twee 3), synced into res://shared/words/. Passage name =
## global key; any text field may hold "words:<key>", resolved at display
## time. [[links]] are stripped from display text; a missing key shows
## "[missing words: <key>]" rather than crashing.

const ROOT := "res://shared/words"
const PREFIX := "words:"
const SPECIAL := ["StoryTitle", "StoryData", "Start"]

static var _passages := {}  # key -> text
static var _loaded := false


static func resolve(text: String) -> String:
	if not text.begins_with(PREFIX):
		return text
	_load()
	var key := text.trim_prefix(PREFIX).strip_edges()
	if _passages.has(key):
		return _passages[key]
	push_warning("[words] missing passage: " + key)
	return "[missing words: %s]" % key


static func _load() -> void:
	if _loaded:
		return
	_loaded = true
	_scan(ROOT)


static func _scan(dir: String) -> void:
	for sub in DirAccess.get_directories_at(dir):
		_scan(dir + "/" + sub)
	for f in DirAccess.get_files_at(dir):
		if f.ends_with(".twee"):
			_parse(FileAccess.get_file_as_string(dir + "/" + f))


static func _parse(source: String) -> void:
	var header := RegEx.create_from_string("^::\\s*(.+?)\\s*(?:\\[(.*?)\\])?\\s*(?:\\{.*\\})?\\s*$")
	var link := RegEx.create_from_string("\\[\\[(.+?)\\]\\]")
	var key := ""
	var body: PackedStringArray = []
	for line in source.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
		var m := header.search(line) if line.begins_with("::") else null
		if m:
			_store(key, body)
			key = m.get_string(1)
			body = []
		elif key != "":
			var stripped := link.sub(line, "", true)
			if stripped.strip_edges() == "" and line.strip_edges() != "":
				continue  # a line that was only links
			body.append(stripped)
	_store(key, body)


static func _store(key: String, body: PackedStringArray) -> void:
	if key == "" or key in SPECIAL:
		return
	var lines := Array(body)
	while not lines.is_empty() and lines[0].strip_edges() == "":
		lines.pop_front()
	while not lines.is_empty() and lines[-1].strip_edges() == "":
		lines.pop_back()
	_passages[key] = "\n".join(lines)
