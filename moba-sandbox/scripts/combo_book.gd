extends RefCounted
## The combo book: each hero's burst, in the order that hits hardest — what
## red's bots run in commit mode (bot.gd). Seeded 2026-10-06 from the combo lab
## (every order of Q W E R at a hero ringed by creeps, still and running) and
## your own logged bursts. The rules it encodes: a gap-closer first when the
## payoff is close (POUNCE; BOOP pulling you in before PUNISH), setup / amplifier before the
## payoff (IGNITE → SHOCK, SHOVE → GRIND), the ultimate last once in range,
## and against a runner the area ability first (FALLOUT, STARS). Abilities that
## deal no damage stay out (BECKY's GHOST).
##
## Per hero (heroes.gd order): still / flee = the order against a standing /
## running target; open = how far away it can start (its opener's reach);
## damage = what the "still" order dealt at level I in the lab (scaled by the
## bot's levels and cards when it decides).
## ult (optional) = the ULT COMBO, used instead whenever its ultimate is ready:
## KAREN's RAGE first (huge body; contact burns and stuns now and then), SHOVE
## through the lot (burning, exposing: +10% damage taken), GRIND in the middle of
## them (the swollen spin cuts everyone around while RAGE's stuns hold them in
## it), BRACE to soak the answer — the hero AND the wave.

const BOOK := [
	{"still": ["E", "W", "Q", "R"], "flee": ["E", "W", "Q", "R"], "open": 600.0, "damage": 517.0},   # KYLE: BOOP from behind you (pulls you in, or back when you run), IGNITE, SHOCK, PUNISH
	{"still": ["E", "Q", "R", "W"], "flee": ["Q", "E", "R", "W"], "open": 520.0, "damage": 889.0},   # CHAD: POUNCE, STARS, FLURRY, TRAP
	{"still": ["E", "Q", "W"], "flee": ["E", "Q", "W"], "ult": ["R", "E", "Q", "W"], "open": 300.0, "damage": 200.0},   # KAREN: SHOVE (expose), GRIND, BRACE; ult combo RAGE → SHOVE → GRIND → BRACE
	{"still": ["Q", "W", "R"], "flee": ["R", "Q", "W"], "open": 760.0, "damage": 873.0},             # BECKY: SHADE, RUMOR, FALLOUT
]
