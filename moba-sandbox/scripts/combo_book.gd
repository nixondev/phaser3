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
## The lab could only try cast ORDERS, so it never found a combo whose key step
## is a walk: CHAD's TRAP sat last for that reason and hit a hero 0 times in 58
## casts (run of 2026-10-22). It's an amplifier (bleed: his hits land harder),
## so it goes first, and the `drag_to_trap` rule (bot.gd) does the walking —
## POUNCE tethers you, he hauls you back into the spikes, then STARS.
##
## KYLE has the mirror of that problem: PUNISH is a 260 px shockwave on a hero
## who fights at 400-760, and last in the order it fired twice in a 17-round
## run. Its ult combo spends the BOOP pull on it instead — the pull is what
## brings you inside 260 — and the rest follows while you're there.
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
	{"still": ["E", "W", "Q", "R"], "flee": ["E", "W", "Q", "R"], "ult": ["E", "R", "W", "Q"], "open": 600.0, "damage": 517.0},   # KYLE: BOOP from behind you (pulls you in, or back when you run), IGNITE, SHOCK, PUNISH; ult combo PUNISH straight off the pull, while you're still inside its 260
	{"still": ["W", "E", "Q", "R"], "flee": ["W", "Q", "E", "R"], "open": 520.0, "damage": 889.0},   # CHAD: TRAP at his feet, POUNCE to you (drag_to_trap hauls you into it), STARS into the bleed, FLURRY  (damage = the old lab figure for POUNCE-first)
	{"still": ["E", "Q", "W"], "flee": ["E", "Q", "W"], "ult": ["R", "E", "Q", "W"], "open": 300.0, "damage": 200.0},   # KAREN: SHOVE (expose), GRIND, BRACE; ult combo RAGE → SHOVE → GRIND → BRACE
	{"still": ["Q", "W", "R"], "flee": ["R", "Q", "W"], "open": 760.0, "damage": 873.0},             # BECKY: SHADE, RUMOR, FALLOUT
]
