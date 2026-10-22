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
##             boop_into_fire   BOOP from behind an enemy standing just outside its IGNITE → into it
##             ignite_deny      IGNITE on its own low creeps near the enemy hero (farm them = stand in fire)
##             stance_add       px added to its stance (matchups)
##             hunt_at          an enemy hero below this health share → POUNCE / chase them down (never under their tower)
##             hunt_add         added to hunt_at (matchups)
##             wait_escape      hold its combo until the enemy's escape (dash / blink / BOOP) is spent
##             keep_out         px past the enemy hero's threat reach it keeps (steps back when inside)
##             keep_add         added to keep_out (matchups)
##             predictable_only skillshots / delayed blasts at the enemy hero only when it's predictable
##                              (standing still, or moving in a straight line for ~0.5 s)
##             bank_nerve       how long it dares bank a capsule (× bot.gd BANK_ROT; 1 = standard)
##             deny_lurk        how keen it waits by your cracked capsule for the deny (0..1, × smartness)
##             capsule_tow      how keen it tows a banked SHELL/RAMPAGE along (0..1, × smartness; bot.gd _tow_worth)
##   stages  [{"from": round, "traits": {...}, "rules": {...}}]: how it grows
##           (later stages layer over earlier ones)
##   vs      {"<hero name>": {"traits": {...}, "rules": {...}}}: matchup tweaks
## Personalities stay a black box to players: none of this is ever shown.

const MINDS := {
	# KYLE — the zoner: back by most of his attack reach (his shortest wave
	# tool; IGNITE and BOOP reach further), so attacks, SHOCK and IGNITE all land
	# on the wave; steps in as he toughens up.
	"KYLE": {"name": "the zoner", "from": "opportunist",
		"stance": {"base": 0.0, "on_wave": 0.7, "tough_pull": 120.0, "sustain_pull": 200.0, "min": 40.0, "max": 360.0},
		# controls where fights happen: keeps you burning, knocks you out of his
		# face or into his fire, and burns the creeps you want to farm
		"rules": {"keep_burning": true, "boop_peel": 200.0, "bank_nerve": 1.0, "deny_lurk": 0.7, "capsule_tow": 0.6},
		"stages": [
			{"from": 4, "rules": {"boop_into_fire": true}},   # learns to use BOOP with IGNITE
			{"from": 7, "rules": {"ignite_deny": true}},      # learns to zone the farm
		],
		"vs": {
			"CHAD": {"rules": {"boop_peel": 260.0}},      # the diver: knock him off sooner
			"KAREN": {"rules": {"stance_add": 40.0}},     # stays out of the anchor's threat zone
			"BECKY": {"rules": {"stance_add": -60.0}},    # the artillery out-ranges him: step in to reach her
		},
		"personality": {"order": ["abilities", "clear", "trade", "farm", "deny", "push", "siege"], "retreat_at": 0.35, "trade_when": "vulnerable",
		"hero_casts": "poke", "engage": 800.0, "trade_cap": 0.5, "dash_at": 0.5, "hold_back": 160.0,
		"race_need": 1.1, "chase_depth": 600.0, "stutter": 1.0, "commit": 1.0,
		"shop": ["arcane_edge", "overcharge", "echo", "haste", "hunters_mark", "kindling", "cold_read", "spellblade",
		"reserve", "afterimage", "focus", "vigor", "boots", "wellspring", "colossus", "second_wind", "vampirism",
		"whetstone", "quickdraw", "salve", "twin_shot", "executioner", "keen_eye", "clean_finish", "adrenaline",
		"scavenger", "longbow", "tank_minion", "reinforcement", "siege_training", "healing_aura", "siphon"]}},
	# CHAD — the diver: in the wave (TRAP drops at his feet, his attacks are
	# melee), POUNCE ready for whoever comes.
	"CHAD": {"name": "the diver", "from": "brawler",
		"stance": {"base": -10.0, "on_wave": 0.5, "tough_pull": 60.0, "sustain_pull": 100.0, "min": -40.0, "max": 80.0},
		# waits in the wave for an opening, then POUNCEs and commits fully; never
		# lets a hurt hero walk away. Grows from impulsive to patient.
		"rules": {"hunt_at": 0.25, "bank_nerve": 1.3, "deny_lurk": 0.4, "capsule_tow": 0.9},  # the diver holds SHELL for a dive — and carries it there; too impatient to lurk
		"stages": [
			{"from": 4, "traits": {"trade_when": "vulnerable"}, "rules": {"hunt_at": 0.35, "wait_escape": true}},  # learns patience
			{"from": 7, "rules": {"hunt_at": 0.4}},
		],
		"vs": {
			"BECKY": {"rules": {"hunt_add": 0.1}},    # fragile: finish her sooner
			"KAREN": {"rules": {"hunt_add": -0.1}},   # tanky: don't chase her too early
		},
		"personality": {"order": ["abilities", "trade", "clear", "farm", "deny", "push", "siege"], "retreat_at": 0.3, "healed_at": 0.75,
		"engage": 650.0, "trade_cap": 0.6, "trade_margin": -0.25, "dash_at": 0.6, "hold_back": 20.0,
		"race_need": 0.85, "chase_depth": 700.0, "stutter": 0.6, "commit": 1.0,
		"shop": ["vigor", "whetstone", "quickdraw", "serrated", "vampirism", "second_wind", "colossus", "spellblade",
		"cold_read", "twin_shot", "arcane_edge", "aftershock", "hunters_mark", "salve", "haste", "spite", "boots",
		"overcharge", "echo", "reserve", "afterimage", "kindling", "executioner", "clean_finish", "adrenaline",
		"scavenger", "tank_minion", "reinforcement", "vanguard", "standard_bearer", "siege_training", "healing_aura",
		"focus", "wellspring", "longbow", "siphon"]}},
	# KAREN — the anchor: plants herself in the wave and gnaws it away, too tanky
	# to move, and punishes anyone who steps in to stop her pushing. (hold_back
	# −30: she stands in the clash, ahead of her own front creep.)
	"KAREN": {"name": "the anchor", "from": "brawler",
		"stance": {"base": -40.0, "on_wave": 0.3, "tough_pull": 60.0, "sustain_pull": 100.0, "min": -70.0, "max": 30.0},
		"personality": {"order": ["abilities", "trade", "clear", "farm", "deny", "push", "siege"], "retreat_at": 0.3, "healed_at": 0.75,
		"engage": 650.0, "trade_cap": 0.6, "trade_margin": -0.25, "dash_at": 0.6, "hold_back": -30.0,
		"race_need": 0.85, "chase_depth": 700.0, "stutter": 0.6, "commit": 1.0,
		"shop": ["vigor", "whetstone", "quickdraw", "serrated", "vampirism", "second_wind", "colossus", "spellblade",
		"cold_read", "twin_shot", "arcane_edge", "aftershock", "hunters_mark", "salve", "haste", "spite", "boots",
		"overcharge", "echo", "reserve", "afterimage", "kindling", "executioner", "clean_finish", "adrenaline",
		"scavenger", "tank_minion", "reinforcement", "vanguard", "standard_bearer", "siege_training", "healing_aura",
		"focus", "wellspring", "longbow", "siphon"]},
		"rules": {"grind_for_kills": true, "front_first": true, "threat": 250.0, "bank_nerve": 0.7, "deny_lurk": 0.5, "capsule_tow": 0.3},  # the anchor plays it straight
		"stages": [
			{"from": 4, "rules": {"threat": 350.0}},   # reads the lane: steps up sooner
			{"from": 8, "rules": {"threat": 400.0}},
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
		"rules": {"keep_out": 60.0, "bank_nerve": 1.0, "deny_lurk": 0.9, "capsule_tow": 0.4},  # the artillery lurks denies from range
		"stages": [
			{"from": 4, "traits": {"hero_casts": "poke"}, "rules": {"predictable_only": true}},  # learns to punish
			{"from": 7, "rules": {"keep_out": 100.0}},
		],
		"vs": {
			"CHAD": {"rules": {"keep_add": 100.0}},   # POUNCE's long reach
			"KAREN": {"rules": {"keep_add": 40.0}},
		},
		"personality": {"order": ["clear", "farm", "deny", "abilities", "trade", "push", "siege"], "retreat_at": 0.4, "trade_when": "vulnerable",
		"hero_casts": "vulnerable", "clump": 2, "hold_back": 200.0, "race_need": 1.2, "chase_depth": 0.0, "stutter": 1.0, "commit": 0.6, "totem_keen": true,
		"shop": ["arcane_edge", "haste", "focus", "wellspring", "siphon", "keen_eye", "clean_finish", "bounty_hunter",
		"echo", "reserve", "overcharge", "executioner", "adrenaline", "homeguard", "afterimage", "second_wind",
		"scavenger", "recruit", "vigor", "whetstone", "quickdraw", "longbow", "salve", "boots", "colossus", "twin_shot",
		"healing_aura", "reinforcement", "tank_minion", "siege_training", "vampirism"]}},
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
	return {"name": str(m.get("name", hero_name)), "personality": traits, "rules": rules, "stance": m.get("stance", {})}
