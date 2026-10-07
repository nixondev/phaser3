extends RefCounted
## Upgrades bought with gold in the shop between rounds. Three priced tiers —
## more gold buys better ones: commons are small stat bumps, rares are strong
## stats or an economy boost, epics are unique mechanics (one of each per run).
##
## Each upgrade's `mods` are summed across everything you own (stacked());
## hero.gd reads them through hero.mod("<key>"):
##
##   attack_damage  attack_speed (+fraction)  attack_range   speed
##   max_hp  max_hp_pct  max_mana  hp_regen  mana_regen  size (+fraction)
##   ability_damage (+fraction)  cooldown (−fraction)  lifesteal (fraction)
##   last_hit_gold  gold_mult (+fraction on last hits)  last_hit_mana
##   twin_shot  echo  execute (hp fraction)  ult_cd (−fraction)  ult_damage
##   deny_mana  deny_heal (Scavenger)   attack_damage_pct  attack_interval_pct
##   home_attack_speed  home_regen (near your tower)   leash_damage  leash_armor
##   last_hit_ult (s off R)   shot_speed (+fraction)   finish_damage (vs creeps < ½)
##   burn_time (+s)  burn_spread (px)   slowed_damage   serrated (bleed share, 2 s)
##   spite (shield reflect share)   second_wind (shield, once / 40 s)
##   tower_attack (+fraction)   mana_cost (+fraction)   spellblade (+dmg next attack)
##   aftershock (dmg)   q_charges   afterimage   hunters_mark (missing-hp share)
##   recruit (s)   snap_finish (hp fraction: attacks land instantly)
##
## `on_buy`: a one-time effect when bought, no mods (run.gd buy): "halve_reroll"
## (Bargain). Such cards aren't offered in Training (nothing to do there).
## `once`: shown in at most one shop roll per run (run.gd once_seen) — skip it
## and it's gone.

const CardSwitches := preload("res://scripts/card_switches.gd")

const TIERS := {
	"common": {"price": 100, "color": Color("#b0bec5")},
	"rare":   {"price": 250, "color": Color("#42a5f5")},
	"epic":   {"price": 600, "color": Color("#ba68c8")},
	"wave":   {"price": 0, "color": Color("#66bb6a")},   # creep upgrades: each card sets its own price
}
## The shop's WAVE row: upgrades for your creeps, rolled like the other tiers
## (WAVE_OFFERS of them a round, rerolled with the rest; red rolls its own).
## `max` = how many you can own; `wave` = what it does to the wave (lane.gd /
## creep.gd read these).
const WAVE_OFFERS := 3
const TIER_ORDER := ["common", "rare", "epic"]
const OFFERS_PER_TIER := 3

## Ability level cards ("Q +1"): always on offer in the shop's Abilities row.
## Price by the level you're buying; R (the ultimate) costs R_MULT times more.
const LEVEL_PRICES := {2: 200, 3: 450}
const R_MULT := 1.4
const LEVEL_COLOR := Color("#ffd54f")

const LIST := [
	{"id": "whetstone", "tier": "common", "name": "Whetstone", "text": "+8 attack damage", "mods": {"attack_damage": 8.0}},
	{"id": "quickdraw", "tier": "common", "name": "Quickdraw", "text": "+12% attack speed", "mods": {"attack_speed": 0.12}},
	{"id": "vigor", "tier": "common", "name": "Vigor", "text": "+200 max health", "mods": {"max_hp": 200.0}},
	{"id": "focus", "tier": "common", "name": "Focus", "text": "+150 max mana", "mods": {"max_mana": 150.0}},
	{"id": "boots", "tier": "common", "name": "Boots", "text": "+25 move speed", "mods": {"speed": 25.0}},
	{"id": "salve", "tier": "common", "name": "Salve", "text": "+6 health regen", "mods": {"hp_regen": 6.0}},
	{"id": "siphon", "tier": "common", "name": "Siphon", "text": "+15 mana per last hit", "mods": {"last_hit_mana": 15.0}},
	{"id": "scavenger", "tier": "common", "name": "Scavenger", "text": "Denying a creep restores 25 mana and 40 health", "mods": {"deny_mana": 25.0, "deny_heal": 40.0}},
	{"id": "heavy_hands", "tier": "common", "name": "Heavy Hands", "text": "Attacks deal +40% damage but take 25% longer", "mods": {"attack_damage_pct": 0.4, "attack_interval_pct": 0.25}},
	{"id": "homeguard", "tier": "common", "name": "Homeguard", "text": "Inside your tower's range: +25% attack speed, +5 health regen", "mods": {"home_attack_speed": 0.25, "home_regen": 5.0}},
	{"id": "rally_cry", "tier": "common", "max": 2, "name": "Rally Cry", "text": "Leashed creeps deal +30% damage and take 30% less", "mods": {"leash_damage": 0.3, "leash_armor": 0.3}},
	{"id": "adrenaline", "tier": "common", "max": 2, "name": "Adrenaline", "text": "Each last hit takes 1 s off your ultimate's cooldown", "mods": {"last_hit_ult": 1.0}},
	{"id": "keen_eye", "tier": "common", "name": "Keen Eye", "text": "Your attack shots fly 50% faster", "mods": {"shot_speed": 0.5}},
	{"id": "clean_finish", "tier": "common", "name": "Clean Finish", "text": "Your attacks deal +15% damage to creeps below half health", "mods": {"finish_damage": 0.15}},
	{"id": "bargain", "tier": "common", "max": 1, "once": true, "name": "Bargain", "text": "Halves your current reroll cost (once, when bought)", "mods": {}, "on_buy": "halve_reroll"},

	{"id": "arcane_edge", "tier": "rare", "name": "Arcane Edge", "text": "+20% ability damage", "mods": {"ability_damage": 0.2}},
	{"id": "haste", "tier": "rare", "name": "Haste", "text": "−15% cooldowns", "mods": {"cooldown": 0.15}},
	{"id": "longbow", "tier": "rare", "name": "Longbow", "text": "+120 attack range", "mods": {"attack_range": 120.0}},
	{"id": "vampirism", "tier": "rare", "name": "Vampirism", "text": "Heal 8% of damage to creeps, 16% to heroes", "mods": {"lifesteal": 0.08}},
	{"id": "bounty_hunter", "tier": "rare", "name": "Bounty Hunter", "text": "Your attacks on creeps below 25% health land instantly", "mods": {"snap_finish": 0.25}},
	{"id": "wellspring", "tier": "rare", "name": "Wellspring", "text": "+5 mana regen", "mods": {"mana_regen": 5.0}},
	{"id": "kindling", "tier": "rare", "max": 2, "name": "Kindling", "text": "Burns last 2 s longer; an enemy dying while burning ignites another within 150", "mods": {"burn_time": 2.0, "burn_spread": 150.0}},
	{"id": "cold_read", "tier": "rare", "max": 3, "name": "Cold Read", "text": "Slowed enemies take +12% damage from you", "mods": {"slowed_damage": 0.12}},
	{"id": "serrated", "tier": "rare", "max": 3, "name": "Serrated", "text": "Your attacks make heroes bleed for 2 s: your attacks on them deal +10%", "mods": {"serrated": 0.1}},
	{"id": "spite", "tier": "rare", "max": 3, "name": "Spite", "text": "Shields on you, or from you, reflect 30% of what they absorb", "mods": {"spite": 0.3}},
	{"id": "second_wind", "tier": "rare", "name": "Second Wind", "text": "Below 30% health: a 150 shield for 3 s (once every 40 s)", "mods": {"second_wind": 150.0}},
	{"id": "siege_breaker", "tier": "rare", "name": "Siege Breaker", "text": "Your attacks deal +40% damage to towers", "mods": {"tower_attack": 0.4}},
	{"id": "glass_cannon", "tier": "rare", "max": 2, "name": "Glass Cannon", "text": "+35% ability damage, −20% max health", "mods": {"ability_damage": 0.35, "max_hp_pct": -0.2}},
	{"id": "overclock", "tier": "rare", "max": 1, "name": "Overclock", "text": "−30% cooldowns; abilities cost 40% more mana", "mods": {"cooldown": 0.3, "mana_cost": 0.4}},
	{"id": "spellblade", "tier": "rare", "name": "Spellblade", "text": "After a cast, your next attack deals +40 and slows 20% for 1 s", "mods": {"spellblade": 40.0}},

	{"id": "twin_shot", "tier": "epic", "name": "Twin Shot", "text": "Auto-attacks also hit a second enemy nearby", "mods": {"twin_shot": 1.0}},
	{"id": "echo", "tier": "epic", "name": "Echo", "text": "Q hits twice: again 0.4 s later, half damage", "mods": {"echo": 1.0}},
	{"id": "overcharge", "tier": "epic", "name": "Overcharge", "text": "Ultimate: half cooldown, +30% damage", "mods": {"ult_cd": 0.5, "ult_damage": 0.3}},
	{"id": "colossus", "tier": "epic", "name": "Colossus", "text": "+40% max health, +25% size", "mods": {"max_hp_pct": 0.4, "size": 0.25}},
	{"id": "executioner", "tier": "epic", "name": "Executioner", "text": "Your hits finish creeps below 25% health", "mods": {"execute": 0.25}},
	{"id": "aftershock", "tier": "epic", "name": "Aftershock", "text": "Stuns by you or your creeps set off a shockwave: 60 within 200 (once a second)", "mods": {"aftershock": 60.0}},
	{"id": "reserve", "tier": "epic", "name": "Reserve", "text": "Your Q holds 2 charges", "mods": {"q_charges": 1.0}},
	{"id": "afterimage", "tier": "epic", "name": "Afterimage", "text": "Dashes and blinks leave a decoy: enemies chase it for 2 s, not you", "mods": {"afterimage": 2.0}},
	{"id": "hunters_mark", "tier": "epic", "name": "Hunter's Mark", "text": "Abilities mark heroes 4 s; your next attack on one deals +15% of its missing health", "mods": {"hunters_mark": 0.15}},
	{"id": "recruit", "tier": "epic", "name": "Recruit", "text": "Creeps you deny rise at half health and fight for 6 s (worth no gold)", "mods": {"recruit": 6.0}},

	{"id": "reinforcement", "tier": "wave", "price": 500, "max": 3, "name": "Reinforcement", "text": "+1 melee creep in each of your waves", "mods": {}, "wave": {"extra_melee": 1}},
	{"id": "healing_aura", "tier": "wave", "price": 350, "max": 1, "name": "Healing Aura", "text": "Ranged creeps heal nearby allies 8/s (you too)", "mods": {}, "wave": {"heal_aura": 8.0, "heal_radius": 250.0}},
	{"id": "tank_minion", "tier": "wave", "price": 550, "max": 1, "name": "Tank Minion", "text": "A tank leads your waves, stuns every 6 s", "mods": {}, "wave": {"tank": 1}},
	{"id": "siege_training", "tier": "wave", "price": 400, "max": 1, "name": "Siege Training", "text": "Your creeps deal +50% damage to towers", "mods": {}, "wave": {"siege": 0.5}},
	{"id": "command", "tier": "wave", "price": 300, "max": 2, "name": "Command", "text": "+1 leash point (T on your creeps)", "mods": {"leash_points": 1.0}},
	{"id": "vanguard", "tier": "wave", "price": 400, "max": 1, "name": "Vanguard", "text": "Your melee creeps gain a 60 shield (8 s) at the enemy tower", "mods": {}, "wave": {"vanguard": 60.0}},
	{"id": "sappers", "tier": "wave", "price": 450, "max": 1, "name": "Sappers", "text": "A ranged creep a wave blasts the enemy tower for 150 if it dies in its range", "mods": {}, "wave": {"sapper": 150.0}},
	{"id": "pathfinders", "tier": "wave", "price": 300, "max": 1, "name": "Pathfinders", "text": "Your minions move 20% faster", "mods": {}, "wave": {"wave_speed": 0.2}},
	{"id": "standard_bearer", "tier": "wave", "price": 350, "max": 1, "name": "Standard Bearer", "text": "A melee creep carries a banner: your creeps within 300 attack 25% faster", "mods": {}, "wave": {"banner": 0.25}},
]


static func find(id: String) -> Dictionary:
	for u: Dictionary in LIST:
		if u["id"] == id:
			return u
	return {}


static func price(u: Dictionary) -> int:
	return u.get("price", TIERS[u["tier"]]["price"])


## Gold to raise `slot` to level `to`.
static func level_price(slot: String, to: int) -> int:
	return int(LEVEL_PRICES.get(to, 0) * (R_MULT if slot == "R" else 1.0))


## All mods of `ids` summed into one dictionary.
static func stacked(ids: Array) -> Dictionary:
	var total := {}
	for id: String in ids:
		var u := find(id)
		for k: String in u.get("mods", {}):
			total[k] = total.get(k, 0.0) + float(u["mods"][k])
	return total


## Epics are one per run; commons and rares stack — unless a card sets `max`
## (the stack-risk ones: Overclock, Adrenaline, Kindling, Spite, Cold Read,
## Serrated), like wave cards do.
static func can_offer(u: Dictionary, owned: Array) -> bool:
	if u.has("max"):
		return owned.count(u["id"]) < int(u["max"])
	return u["tier"] != "epic" or not owned.has(u["id"])


## What a side's owned upgrades do to its waves: {extra_melee, heal_aura, heal_radius}.
static func wave_mods(owned: Array) -> Dictionary:
	var out := {"extra_melee": 0, "heal_aura": 0.0, "heal_radius": 0.0, "tank": 0, "siege": 0.0,
		"vanguard": 0.0, "sapper": 0.0, "wave_speed": 0.0, "banner": 0.0}
	for id: String in owned:
		var w: Dictionary = find(id).get("wave", {})
		out["extra_melee"] += int(w.get("extra_melee", 0))
		out["heal_aura"] = maxf(out["heal_aura"], float(w.get("heal_aura", 0.0)))
		out["heal_radius"] = maxf(out["heal_radius"], float(w.get("heal_radius", 0.0)))
		out["tank"] += int(w.get("tank", 0))
		out["siege"] = maxf(out["siege"], float(w.get("siege", 0.0)))
		for k: String in ["vanguard", "sapper", "wave_speed", "banner"]:
			out[k] = maxf(out[k], float(w.get(k, 0.0)))
	return out


## Up to `count` different upgrades of `tier` that can still be offered,
## drawn with `rng` — seeded, so the same run seed rolls the same shop.
static func offers(tier: String, count: int, owned: Array, rng: RandomNumberGenerator) -> Array:
	var pool := LIST.filter(func(u: Dictionary) -> bool: return u["tier"] == tier and can_offer(u, owned) and CardSwitches.is_on(u["id"]))
	var picked: Array = []
	while picked.size() < count and not pool.is_empty():
		picked.append(pool.pop_at(rng.randi_range(0, pool.size() - 1)))
	return picked
