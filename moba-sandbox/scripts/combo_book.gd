extends RefCounted
## The combo book: each hero's burst, in the order that hits hardest — what
## red's bots run in commit mode (bot.gd). Seeded 2026-10-06 from the combo lab
## (every order of Q W E R at a hero ringed by creeps, still and running) and
## your own logged bursts. The rules it encodes: a gap-closer first when the
## payoff is close (POUNCE, WRAITH before PUNISH), setup / amplifier before the
## payoff (IGNITE → SHOCK, SHOVE → GRIND), the ultimate last once in range,
## and against a runner the area ability first (FALLOUT, STARS). Abilities that
## deal no damage stay out (BECKY's GHOST).
##
## Per hero (heroes.gd order): still / flee = the order against a standing /
## running target; open = how far away it can start (its opener's reach);
## damage = what the "still" order dealt at level I in the lab (scaled by the
## bot's levels and cards when it decides).

const BOOK := [
	{"still": ["E", "W", "Q", "R"], "flee": ["E", "W", "R", "Q"], "open": 420.0, "damage": 517.0},   # KYLE: WRAITH in, IGNITE, SHOCK, PUNISH
	{"still": ["E", "Q", "R", "W"], "flee": ["Q", "E", "R", "W"], "open": 520.0, "damage": 889.0},   # CHAD: POUNCE, STARS, FLURRY, TRAP
	{"still": ["E", "W", "Q", "R"], "flee": ["E", "Q", "W", "R"], "open": 300.0, "damage": 200.0},   # KAREN: SHOVE (expose), BRACE, GRIND, RAGE
	{"still": ["Q", "W", "R"], "flee": ["R", "Q", "W"], "open": 760.0, "damage": 873.0},             # BECKY: SHADE, RUMOR, FALLOUT
]
