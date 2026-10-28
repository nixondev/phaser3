extends RefCounted
## HERO MINDS — red plays each hero as that hero: a unique entity that knows
## its kit and its matchups and grows sharper over the run (IDEAS.md "Hero
## minds"). A mind is data:
##   name    who it is (logs and introspection only — never shown in the game)
##   personality  its own full personality (the keys are listed in
##           personality_templates.gd: decision order, retreat line, hold-back,
##           stutter / commit keenness, totem keenness, shopping priorities…).
##           Each started as a copy of the old type it used to play as
##           (`from`, for reference) and is now its own to grow.
##           Its `stance` (where it stands relative to its own front creep)
##           is worked out live (bot.gd _hold_back):
##             hold_back = base + on_wave × working range
##                         − tough_pull × (max health now ÷ base − 1)
##                         − sustain_pull × lifesteal, clamped to [min, max]
##           WORKING RANGE = the shortest reach among the tools it uses on the
##           wave (its attack and its wave-clear abilities, range bonuses
##           included) — so it stands where ALL of them reach the enemy creeps,
##           never parked at its longest spell's range with the rest idle.
##           Toughness / lifesteal (its stats after its shop picks) make it
##           braver. (Positive = behind its front creep, negative = ahead.)
##   traits  extra personality keys layered on by stages / matchups
##   rules   hero-specific behaviour switches bot.gd reads with _rule():
##             grind_for_kills  GRIND on waves only when it finishes creeps (or heals / a big clump)
##             front_first      push / clear the enemy creeps nearest its own tower first
##             threat           px: an enemy hero this close while it's in its wave → it turns on them
##             keep_burning     attacks a burning enemy hero in range (KYLE: each hit restarts the burn)
##             boop_peel        px: a melee hero this close → BOOP between, knocking both apart
##             peel_add         added to boop_peel (matchups; inert before he has boop_peel)
##             boop_into_fire   BOOP from behind an enemy standing just outside its IGNITE → into it
##             ignite_deny      IGNITE on its own low creeps near the enemy hero (farm them = stand in fire)
##             stance_add       px added to its stance (matchups)
##             hunt_at          an enemy hero below this health share → POUNCE / chase them down (never under their tower)
##             hunt_add         added to hunt_at (matchups)
##             wait_escape      hold its combo until the enemy's escape (dash / blink / BOOP) is spent
##             keep_out         px past the enemy hero's threat reach it keeps (steps back when inside)
##             keep_add         added to keep_out (matchups)
##             sidestep         0..1: would it rather step aside than give up ground down the lane when
##                              backing off from your burst (bot.gd _backoff_spot; 0.5 = neutral). The
##                              anchor holds her line and walks straight back; the ranged two slide
##                              sideways to keep their range without losing the wave
##             predictable_only skillshots / delayed blasts at the enemy hero only when it's predictable
##                              (standing still, or moving in a straight line for ~0.5 s)
##             bank_nerve       how long it dares bank a capsule (× bot.gd BANK_ROT; 1 = standard)
##             deny_lurk        how keen it waits by your cracked capsule for the deny (0..1, × smartness)
##             capsule_tow      how keen it tows a banked SHELL/RAMPAGE along (0..1, × smartness; bot.gd _tow_worth)
##           stance.crowd_pull  px it gives up per creep it's outnumbered by nearby (bot.gd _hold_back):
##                              standing in the clash is for an even clash
##             bully_reach      px past its own reach that still counts as "you stepped up to me": the
##                              anchor turns on what it can actually catch, and keeps pushing when it can't
##             shove_peel       charge through you when you crowd its wave — knock you aside and gain
##                              ground, instead of starting a fight it has to walk into (bot.gd _zone_tick)
##             bully_when_behind  its tower under threat: it fights whether or not it wins the damage race
##             drag_to_trap     tethered by POUNCE with its own TRAP down: walk back and haul you into
##                              the spikes before the rest of the combo lands (bot.gd _drag_tick)
##   stages  [{"from": round, "traits": {...}, "rules": {...}}]: how it grows
##           (later stages layer over earlier ones). THE BASE IS THE TAME ONE:
##           see TAME_UNTIL.
##   vs      {"<hero name>": {"traits": {...}, "rules": {...}}}: matchup tweaks
## Personalities stay a black box to players: none of this is ever shown.

## TAME EARLY ROUNDS (2026-10-25). The base of each mind is the round-1 red:
## the same character, pruned - shorter reach, no chasing, and none of the
## rules that grind down a player who owns nothing (the diver's drag, the
## zoner's shove and burn, the anchor's bully). Each mind's first stage
## puts the real numbers back, so from that round red is exactly what it was.
## Why: smartness only blends how WELL red decides (bot.gd DUMB: think,
## blunder, healed_at, trade_margin, race_need, plus some odds rolls) - never
## how HARD it plays. So a smartness-0.3 diver had the same reach, chase depth
## and hunt threshold as a smartness-1.0 one, against a player with no cards.
## Round 1 was lost for the first time on 2026-10-25 (KYLE vs CHAD, 0-2, red's
## tower untouched), and 2 of the 3 round 2s before it, all to aggressive
## draws. Keep the two axes apart: run.gd's ladder = how well, these = how hard.
## The last round red plays its tame base; every mind's first stage is
## TAME_UNTIL + 1, where it becomes its real self. Raise it to keep red gentle
## for longer, lower it to hand the characters back sooner.
## 4 (2026-10-25, user): red's heroes are a shuffle of the four that repeats
## every 4 rounds (run.gd bot_hero_for), so rounds 1-4 are one full cycle. Tame
## for exactly that cycle means you meet all four gentle versions, then all
## four real ones from round 5 — instead of meeting three tame and one grown.
const TAME_UNTIL := 4
## Cycle 3's stage: the late form of each mind, all on one boundary (they were
## scattered at 7, 7, 7 and 8 — mid-cycle, so you met two heroes before the
## change and two after, and could not compare them).
const LATE_FROM := 9

const MINDS := {
	# KYLE — the zoner: back by most of his attack reach (his shortest wave
	# tool; IGNITE and BOOP reach further), so attacks, SHOCK and IGNITE all land
	# on the wave; steps in as he toughens up.
	"KYLE": {"name": "the zoner", "from": "opportunist",
		"stance": {"base": 0.0, "on_wave": 0.7, "tough_pull": 120.0, "sustain_pull": 200.0, "min": 40.0, "max": 360.0},
		# controls where fights happen: keeps you burning, knocks you out of his
		# face or into his fire, and burns the creeps you want to farm.
		# Tame start: he farms his own wave from range - no shove, no burn held
		# on you, and he doesn't step out to trade.
		"rules": {"bank_nerve": 1.0, "deny_lurk": 0.3, "capsule_tow": 0.6, "sidestep": 0.8},
		"stages": [
			# becomes the zoner: his reach, his shove, his burn - and BOOP into IGNITE
			{"from": TAME_UNTIL + 1, "traits": {"engage": 800.0, "trade_cap": 0.5, "dash_at": 0.5, "chase_depth": 600.0},
				"rules": {"keep_burning": true, "boop_peel": 200.0, "deny_lurk": 0.7, "boop_into_fire": true}},
			{"from": LATE_FROM, "rules": {"ignite_deny": true}},   # learns to zone the farm
		],
		"vs": {
			"CHAD": {"rules": {"peel_add": 60.0}},        # the diver: knock him off sooner (inert while he has no shove)
			"KAREN": {"rules": {"stance_add": 40.0}},     # stays out of the anchor's threat zone
			"BECKY": {"rules": {"stance_add": -60.0}},    # the artillery out-ranges him: step in to reach her
		},
		"personality": {"order": ["abilities", "clear", "trade", "farm", "deny", "push", "siege"], "retreat_at": 0.35, "trade_when": "vulnerable",
		"hero_casts": "poke", "engage": 520.0, "trade_cap": 0.7, "dash_at": 0.3, "hold_back": 160.0,
		"race_need": 1.1, "chase_depth": 250.0, "stutter": 1.0, "commit": 1.0,
		"shop": ["tank_minion", "arcane_edge", "overcharge", "echo", "haste", "hunters_mark",
		"kindling", "cold_read", "spellblade", "reinforcement", "reserve", "afterimage",
		"focus", "vigor", "boots", "siege_training", "wellspring", "healing_aura",
		"colossus", "second_wind", "vampirism", "whetstone", "quickdraw", "salve",
		"twin_shot", "executioner", "keen_eye", "clean_finish", "adrenaline", "scavenger",
		"longbow", "siphon"]}},
	# CHAD — the diver: in the wave (TRAP drops at his feet, his attacks are
	# melee), POUNCE ready for whoever comes.
	"CHAD": {"name": "the diver", "from": "brawler",
		"stance": {"base": -10.0, "on_wave": 0.5, "tough_pull": 60.0, "sustain_pull": 100.0, "min": -40.0, "max": 80.0},
		# waits in the wave for an opening, then POUNCEs and commits fully; never
		# lets a hurt hero walk away. Grows from impulsive to patient.
		# Tame start: still the impulsive brawler (trading on sight IS young
		# CHAD), but he swings at what is beside him and lets it go - no long
		# step-in, no chase over the middle, no haul into his spikes, and he
		# finishes you only when you are nearly dead.
		"rules": {"hunt_at": 0.12, "bank_nerve": 1.3, "deny_lurk": 0.4, "capsule_tow": 0.4, "sidestep": 0.5},
		"stages": [
			# becomes the diver: patient, long-armed, and he carries SHELL to the dive
			{"from": TAME_UNTIL + 1, "traits": {"trade_when": "vulnerable", "engage": 650.0, "trade_cap": 0.6, "dash_at": 0.6, "chase_depth": 700.0},
				"rules": {"hunt_at": 0.35, "wait_escape": true, "drag_to_trap": true, "capsule_tow": 0.9}},
			{"from": LATE_FROM, "rules": {"hunt_at": 0.4}},
		],
		"vs": {
			"BECKY": {"rules": {"hunt_add": 0.1}},    # fragile: finish her sooner
			"KAREN": {"rules": {"hunt_add": -0.1}},   # tanky: don't chase her too early
		},
		"personality": {"order": ["abilities", "trade", "clear", "farm", "deny", "push", "siege"], "retreat_at": 0.3, "healed_at": 0.75,
		"engage": 420.0, "trade_cap": 0.75, "trade_margin": -0.25, "dash_at": 0.35, "hold_back": 20.0,
		"race_need": 0.85, "chase_depth": 250.0, "stutter": 0.6, "commit": 1.0,
		"shop": ["tank_minion", "vigor", "whetstone", "quickdraw", "serrated", "vampirism",
		"second_wind", "colossus", "spellblade", "vanguard", "cold_read", "standard_bearer",
		"twin_shot", "reinforcement", "arcane_edge", "siege_training", "aftershock", "healing_aura",
		"hunters_mark", "salve", "haste", "spite", "boots", "overcharge",
		"echo", "reserve", "afterimage", "kindling", "executioner", "clean_finish",
		"adrenaline", "scavenger", "focus", "wellspring", "longbow", "siphon"]}},
	# KAREN — the anchor: plants herself in the wave and gnaws it away, too tanky
	# to move, and punishes anyone who steps in to stop her pushing. (hold_back
	# −30: she stands in the clash, ahead of her own front creep.)
	"KAREN": {"name": "the anchor", "from": "brawler",
		"stance": {"base": -40.0, "on_wave": 0.3, "tough_pull": 60.0, "sustain_pull": 100.0, "crowd_pull": 25.0, "min": -70.0, "max": 200.0},  # crowd_pull: she holds the clash, but not against a wave that outnumbers hers
		# Her own order, not the brawler's: she wins by attrition and lane pressure,
		# so the wave comes first and the tower before the fight. Trading is the
		# last thing she reaches for — the anchor rule (threat) still turns her on
		# anyone who steps up to her wave, out of turn.
		"personality": {"order": ["abilities", "clear", "farm", "siege", "push", "deny", "trade"], "retreat_at": 0.3, "healed_at": 0.75,
		"engage": 320.0, "trade_cap": 0.75, "trade_margin": -0.25, "dash_at": 0.35, "hold_back": -30.0,
		"race_need": 0.85, "chase_depth": 250.0, "stutter": 0.6, "commit": 1.0,
		"shop": ["tank_minion", "healing_aura", "reinforcement", "colossus", "vigor", "vampirism",
		"second_wind", "salve", "vanguard", "standard_bearer", "siege_training", "boots",
		"haste", "serrated", "whetstone", "spite", "aftershock", "quickdraw",
		"spellblade", "cold_read", "executioner", "clean_finish", "twin_shot", "adrenaline",
		"scavenger", "arcane_edge", "overcharge", "echo", "reserve", "kindling",
		"hunters_mark", "afterimage", "focus", "wellspring", "longbow", "siphon"]},  # her own list: survive, then make the wave win
		# Tame start: she holds her ground on the wave and turns only on someone
		# right on top of her - no shoving for room, no fighting out of spite
		# because her tower is being hit.
		"rules": {"grind_for_kills": true, "front_first": true, "threat": 150.0, "bank_nerve": 0.7, "deny_lurk": 0.5, "capsule_tow": 0.3, "sidestep": 0.2},
		"stages": [
			# becomes the anchor: reads the lane, steps up sooner, bullies for room
			{"from": TAME_UNTIL + 1, "traits": {"engage": 400.0, "trade_cap": 0.6, "dash_at": 0.6, "chase_depth": 700.0},
				"rules": {"threat": 350.0, "bully_reach": 60.0, "shove_peel": true, "bully_when_behind": true}},
			{"from": LATE_FROM, "rules": {"threat": 400.0}},
		],
		"vs": {
			"KYLE": {"rules": {"threat_add": 50.0}},   # ranged: they poke from afar, she steps up
			"BECKY": {"rules": {"threat_add": 50.0}},
			"CHAD": {"rules": {"threat_add": -50.0}},  # a diver comes to her anyway
		}},
	# BECKY — the artillery: furthest back — but by her attack reach (her
	# shortest wave tool), not SHADE's 760, so her attacks still land; fragile,
	# she steps up only as she gets tougher.
	"BECKY": {"name": "the artillery", "from": "farmer",
		"stance": {"base": 0.0, "on_wave": 0.75, "tough_pull": 150.0, "sustain_pull": 150.0, "min": 150.0, "max": 460.0},
		# never in reach, always in range: poke-farms from safety, punishes anyone
		# who stands still or walks in a straight line
		# Tame start: already the gentlest of the four - she poke-farms and keeps
		# her distance. Only her capsule lurking waits for the grown stage.
		"rules": {"keep_out": 60.0, "bank_nerve": 1.0, "deny_lurk": 0.4, "capsule_tow": 0.4, "sidestep": 0.9},
		"stages": [
			# becomes the artillery: punishes anyone predictable, lurks your capsules
			{"from": TAME_UNTIL + 1, "traits": {"hero_casts": "poke"}, "rules": {"predictable_only": true, "deny_lurk": 0.9}},
			{"from": LATE_FROM, "rules": {"keep_out": 100.0}},
		],
		"vs": {
			"CHAD": {"rules": {"keep_add": 100.0}},   # POUNCE's long reach
			"KAREN": {"rules": {"keep_add": 40.0}},
		},
		"personality": {"order": ["clear", "farm", "deny", "abilities", "trade", "push", "siege"], "retreat_at": 0.4, "trade_when": "vulnerable",
		"hero_casts": "vulnerable", "clump": 2, "hold_back": 200.0, "race_need": 1.2, "chase_depth": 0.0, "stutter": 1.0, "commit": 0.6, "totem_keen": true,
		"shop": ["tank_minion", "arcane_edge", "haste", "focus", "wellspring", "siphon",
		"keen_eye", "clean_finish", "bounty_hunter", "reinforcement", "echo", "healing_aura",
		"reserve", "overcharge", "executioner", "siege_training", "adrenaline", "homeguard",
		"afterimage", "second_wind", "scavenger", "recruit", "vigor", "whetstone",
		"quickdraw", "longbow", "salve", "boots", "colossus", "twin_shot",
		"vampirism"]}},
}


## The mind for `hero_name` in round `round_num` against `foe_name`:
## {"name", "personality", "rules"} with its stages and matchup layered in.
static func mind_for(hero_name: String, round_num: int, foe_name: String) -> Dictionary:
	var m: Dictionary = MINDS.get(hero_name, {})
	var traits: Dictionary = (m.get("personality", {}) as Dictionary).duplicate(true)
	var rules: Dictionary = (m.get("rules", {}) as Dictionary).duplicate()
	for st: Dictionary in m.get("stages", []):
		if round_num >= int(st.get("from", 1)):
			traits.merge(st.get("traits", {}), true)
			rules.merge(st.get("rules", {}), true)
	var vs: Dictionary = (m.get("vs", {}) as Dictionary).get(foe_name, {})
	traits.merge(vs.get("traits", {}), true)
	rules.merge(vs.get("rules", {}), true)
	if rules.has("threat_add") and rules.has("threat"):
		rules["threat"] = float(rules["threat"]) + float(rules["threat_add"])
	if rules.has("hunt_add") and rules.has("hunt_at"):
		rules["hunt_at"] = float(rules["hunt_at"]) + float(rules["hunt_add"])
	if rules.has("keep_add") and rules.has("keep_out"):
		rules["keep_out"] = float(rules["keep_out"]) + float(rules["keep_add"])
	if rules.has("peel_add") and rules.has("boop_peel"):
		rules["boop_peel"] = float(rules["boop_peel"]) + float(rules["peel_add"])
	return {"name": str(m.get("name", hero_name)), "personality": traits, "rules": rules, "stance": m.get("stance", {})}
