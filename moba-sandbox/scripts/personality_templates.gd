extends RefCounted
## PERSONALITY TEMPLATES — the four old bot personality types, kept as reference:
## starting points to copy from when a new hero gets its own personality
## (hero_minds.gd), and for experiments (autoplay --personality pins one, and
## red then plays that type instead of its hero's own personality). Nothing reads
## them in normal play: every hero has its own.
##
## Keys (bot.gd reads them through _pv / _p):
##   order        its decision steps, most wanted first
##   retreat_at / healed_at   health fraction it runs at / comes back at
##   engage, trade_cap, trade_margin, race_need, trade_when ("vulnerable" /
##   "provoked" / always), hero_casts ("vulnerable" / "poke"), dash_at,
##   hold_back (px behind its front creep; negative = in front), chase_depth,
##   clump, creeps_first, siege_always, siege_reach, home_leash
##   stutter      how keen on stutter-stepping (× smartness = the odds)
##   commit       how keen on committing to a combo (× smartness)
##   totem_keen   takes creeps to its totem before round 10
##   shop         card priorities when red shops (Run.red_shop)

const TEMPLATES := {
	"standard": {"shop": ["arcane_edge", "vigor", "whetstone", "quickdraw", "haste", "spellblade", "second_wind", "overcharge",
		"colossus", "twin_shot", "echo", "hunters_mark", "reserve", "vampirism", "salve", "boots", "clean_finish",
		"keen_eye", "adrenaline", "focus", "wellspring", "executioner", "bounty_hunter", "longbow", "tank_minion",
		"reinforcement", "vanguard", "siege_training", "standard_bearer", "healing_aura", "sappers", "pathfinders",
		"scavenger", "siphon"]},
	"brawler": {"order": ["abilities", "trade", "clear", "farm", "deny", "push", "siege"], "retreat_at": 0.3, "healed_at": 0.75,
		"engage": 650.0, "trade_cap": 0.6, "trade_margin": -0.25, "dash_at": 0.6, "hold_back": 20.0,
		"race_need": 0.85, "chase_depth": 700.0, "stutter": 0.6, "commit": 1.0,
		"shop": ["vigor", "whetstone", "quickdraw", "serrated", "vampirism", "second_wind", "colossus", "spellblade",
		"cold_read", "twin_shot", "arcane_edge", "aftershock", "hunters_mark", "salve", "haste", "spite", "boots",
		"overcharge", "echo", "reserve", "afterimage", "kindling", "executioner", "clean_finish", "adrenaline",
		"scavenger", "tank_minion", "reinforcement", "vanguard", "standard_bearer", "siege_training", "healing_aura",
		"focus", "wellspring", "longbow", "siphon"]},
	"farmer": {"order": ["clear", "farm", "deny", "abilities", "trade", "push", "siege"], "retreat_at": 0.4, "trade_when": "vulnerable",
		"hero_casts": "vulnerable", "clump": 2, "hold_back": 200.0, "race_need": 1.2, "chase_depth": 0.0, "stutter": 1.0, "commit": 0.6, "totem_keen": true,
		"shop": ["arcane_edge", "haste", "focus", "wellspring", "siphon", "keen_eye", "clean_finish", "bounty_hunter",
		"echo", "reserve", "overcharge", "executioner", "adrenaline", "homeguard", "afterimage", "second_wind",
		"scavenger", "recruit", "vigor", "whetstone", "quickdraw", "longbow", "salve", "boots", "colossus", "twin_shot",
		"healing_aura", "reinforcement", "tank_minion", "siege_training", "vampirism"]},
	"pusher": {"order": ["leash", "siege", "clear", "abilities", "farm", "push", "trade"], "retreat_at": 0.25, "trade_when": "provoked",
		"creeps_first": true, "clump": 2, "hold_back": 60.0, "siege_always": true, "siege_reach": 400.0, "chase_depth": 200.0, "stutter": 0.3, "commit": 0.4, "totem_keen": true,
		"shop": ["reinforcement", "siege_training", "tank_minion", "command", "rally_cry", "sappers", "vanguard",
		"standard_bearer", "pathfinders", "healing_aura", "siege_breaker", "quickdraw", "whetstone", "twin_shot",
		"arcane_edge", "vigor", "haste", "boots", "colossus", "overcharge", "echo", "salve", "focus", "wellspring",
		"longbow", "vampirism", "executioner", "siphon"]},
	"opportunist": {"order": ["abilities", "clear", "trade", "farm", "deny", "push", "siege"], "retreat_at": 0.35, "trade_when": "vulnerable",
		"hero_casts": "poke", "engage": 800.0, "trade_cap": 0.5, "dash_at": 0.5, "hold_back": 160.0,
		"race_need": 1.1, "chase_depth": 600.0, "stutter": 1.0, "commit": 1.0,
		"shop": ["arcane_edge", "overcharge", "echo", "haste", "hunters_mark", "kindling", "cold_read", "spellblade",
		"reserve", "afterimage", "focus", "vigor", "boots", "wellspring", "colossus", "second_wind", "vampirism",
		"whetstone", "quickdraw", "salve", "twin_shot", "executioner", "keen_eye", "clean_finish", "adrenaline",
		"scavenger", "longbow", "tank_minion", "reinforcement", "siege_training", "healing_aura", "siphon"]},
}
