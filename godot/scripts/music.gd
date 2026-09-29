extends Node
## Autoload — background music that carries on across room changes (the
## job MusicManager.ts does for Phaser). For now one track everywhere: the
## title theme. Phaser plays it at volume 0.5.
##
## The MP3 comes from the Phaser project via tools/sync-shared.cjs.

const TRACK := "res://shared/audio/gametheme-003.mp3"
const VOLUME := 0.5

var player: AudioStreamPlayer


func _ready() -> void:
	process_mode = Node.PROCESS_MODE_ALWAYS  # keeps playing while paused
	player = AudioStreamPlayer.new()
	player.volume_db = linear_to_db(VOLUME)
	add_child(player)
	play(TRACK)


## Switch track; asking for the one already playing doesn't restart it
## (MusicManager's "same track name = keep playing" rule).
func play(path: String) -> void:
	if player.stream and player.stream.resource_path == path and player.playing:
		return
	var stream: AudioStream = load(path)
	if stream == null:
		push_warning("[music] missing %s — run tools/sync-shared.cjs" % path)
		return
	if "loop" in stream:
		stream.loop = true
	player.stream = stream
	player.play()
