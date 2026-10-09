extends RefCounted
## The roguelite run — ENDLESS: lane rounds until you lose one, the shop
## between them. Your best round is remembered (best_round).
## Static, so it survives the scene reload that starts each round.
##
##   pick   choose your hero                    (round 0, game paused)
##   play   a round is on
##   shop   you won the round: spend gold       (game paused over the lane)
##   over   you lost a round: the run ends (score = the round you reached)
##
## Gold carries over between rounds; so do the upgrades you buy. Red starts
## weak and creeps up round by round (DIFFICULTY) — round 1 should be easy.
##
## Red shops too: it keeps its own gold (the bot's last hits and kills, plus
## an allowance each round), upgrades and ability levels across the run, and
## spends in its own seeded shop when yours opens (red_shop()). The next
## round's bot plays with that build. Everything random in a run
## comes from `run_seed`, and the whole run is plain data (to_dict / from_dict),
## so it can be saved — and so a Versus mode could share one later.

const Upgrades := preload("res://scripts/upgrades.gd")
const Heroes := preload("res://scripts/heroes.gd")

## Rounds the hand-tuned DIFFICULTY table covers; past it, endless growth.
const ROUNDS := 5
## Past the table, every extra round the bot's cast gap and aim error shrink
## by ENDLESS_SHARPEN, down to the floors.
const ENDLESS_GROWTH := 0.10  # (unused now: stats follow STAT_STEP below)
## Red's stats (creeps, tower hp/damage, bot hp/damage): EVEN — the same as
## yours every round (user, 2026-10-02: "an even match always"). Difficulty
## comes from skill, smartness, red's build and (late) extra creeps instead.
## The old gentle line is kept switchable: STAT_STEP 0.04 with TOWER_HP_START
## 0.6 / CREEPS_START 0.7 was 80% in round 1, 100% at round 6, +4% a round after.
const STAT_STEP := 0.0
## LATE RAMP: from RED_RAMP_FROM, all of red's stats (creeps, tower health and
## damage, its hero's health and damage) climb RED_RAMP_STEP a round, with no
## cap — so every run ends sometime, however good the player. A straight line
## is enough: rising prices flatten the player's growth, so the line wins.
##   round 12 ×1.05 · 15 ×1.20 · 20 ×1.45 · 30 ×1.95
const RED_RAMP_FROM := 12
const RED_RAMP_STEP := 0.05
const STAT_ANCHOR_ROUND := 6
const STAT_FLOOR := 0.5
const STAT_KEYS := ["creeps", "tower_hp", "tower_damage", "bot_hp", "bot_damage"]
## Red's tower health starts lower (quick early rounds) and climbs evenly to
## 100% by STAT_ANCHOR_ROUND, then follows the same line as the rest.
const TOWER_HP_START := 1.0
## Red's creeps also start weaker and climb evenly to the line by STAT_ANCHOR_ROUND.
const CREEPS_START := 1.0
## Chance the bot takes each deny it could make: rises DENY_STEP per round
## from DENY_START, capped at DENY_MAX (replaces the table's on/off bot_deny).
const DENY_START := 0.0
const DENY_STEP := 0.10
const DENY_MAX := 0.8
## Chance the bot goes for each last hit it could take (it skips the rest):
## LAST_HIT_START in round 1, +LAST_HIT_STEP per round, capped at LAST_HIT_MAX.
const LAST_HIT_START := 0.75
const LAST_HIT_STEP := 0.03
const LAST_HIT_MAX := 0.95
const ENDLESS_SHARPEN := 0.9
const CAST_GAP_FLOOR := 0.6
const AIM_ERROR_FLOOR := 12.0
## The bot's reaction (seconds from "I'm in danger" to its escape): an even
## line from REACTION_START in round 1 to REACTION_FLOOR at REACTION_FLOOR_ROUND,
## then flat. 1.0 s = a distracted beginner, 0.25 s = a sharp, practised player.
const REACTION_START := 0.7
const REACTION_FLOOR := 0.25
const REACTION_FLOOR_ROUND := 10
## The bot's hesitation: once hurt enough to run, it keeps fighting up to this
## many seconds (random each time) first. An even line from HESITATE_START in
## round 1 to none at HESITATE_END_ROUND.
const HESITATE_START := 1.0
const HESITATE_END_ROUND := 10
## Past human: from SUPER_FROM the bot keeps sharpening toward SUPER, reached
## at SUPER_FULL (an even line between). By then it reacts faster, casts more
## often and aims better than a person can, and never misses a last hit.
const SUPER_FROM := 10
const SUPER_FULL := 20
const SUPER := {"reaction": 0.12, "cast_gap": 0.35, "aim_error": 4.0, "last_hit_chance": 1.0, "deny_chance": 0.95}
## LANE GROWTH: the lane itself gets tougher over a run — the SAME for both
## sides (heroes don't scale) — in a straight line:
##   growth = 1 + LANE_GROWTH_STEP × (round − 1)
##   tower HP = LANE_TOWER_HP × growth      creep HP = base × LANE_CREEP_START × growth
## LANE_GROWTH_STEP is the best straight-line fit (rounds 1–20, starting at 1)
## to a model of an average player's damage growth: 1000 gold a round buys
## average picks (base 258, +3.14% damage each) at prices rising PRICE_RISE a
## pick → damage 1.0314^picks. Within 0.04 of that curve every round. See
## BALANCE.md; re-fit if the economy or the cards change.
const LANE_TOWER_HP := 2000.0
const LANE_CREEP_START := 0.7
const LANE_GROWTH_STEP := 0.0925
## Late rounds: red's waves get +1 melee creep from RED_EXTRA_FROM, and another
## every RED_EXTRA_EVERY rounds after (more of them, not stronger ones).
const RED_EXTRA_FROM := 15
const RED_EXTRA_EVERY := 5
## Where best_round is saved (tests point this elsewhere).
static var settings := "user://settings.cfg"
const REROLL_COST := 50
const REROLL_STEP := 25   # each reroll costs this much more — for the whole run (never resets), so chasing a combo gets dear
## Rising prices: every pick (card or ability level) makes everything cost
## this much more for the rest of the run — for you and red alike. Buy what
## matters first, while it's cheap.
const PRICE_RISE := 0.08

## Gold for winning a round (you only; flat, so it matters less as prices rise).
const WIN_GOLD := 0  # removed 2026-10-02 (was 200)

## Red's allowance before round r+1 (on top of what its bot earned):
## RED_ALLOWANCE + RED_ALLOWANCE_STEP × r  → 250, 350, 450, 550 …
const RED_ALLOWANCE := 0       # removed 2026-10-01 (user): red earns only what its bot farms
const RED_ALLOWANCE_STEP := 0
## How red shops: the chance each purchase is an ability level (when it can
## afford one) rather than the priciest card it can afford.
const RED_LEVEL_CHANCE := 0.5

## Red has three separate dials:
##   stats       how strong red's stuff is: the STAT_* line below (creeps,
##               tower, bot health and damage)
##   skill       how well the bot EXECUTES: this table (+ the last-hit / deny
##               odds above), per round, the same for every personality
##   smartness   how well the bot DECIDES: the personality ladder below
##               (bot.gd blends its personality from "dumb" to tuned)
## Skill per round:
##   cast_gap      seconds the bot waits between its ability casts
##   aim_error     px the bot's aimed spells can miss by
##   (reaction: its own even line, REACTION_* below)
##   (hesitate: its own even line too, HESITATE_* below)
const DIFFICULTY := [
	{"cast_gap": 2.6, "aim_error": 90.0},
	{"cast_gap": 2.0, "aim_error": 65.0},
	{"cast_gap": 1.5, "aim_error": 45.0},
	{"cast_gap": 1.1, "aim_error": 35.0},
	{"cast_gap": 0.9, "aim_error": 25.0},
]

## The personality ladder: each red hero always plays its strongest
## personality (bot.gd PERSONALITIES; picked from the 2026-10-01 autoplay
## matrix), and gets smarter round by round: smartness SMART_START in round 1
## up to 1.0 by SMART_FULL_ROUND. Personalities are never shown to the player.
const SIGNATURE := ["opportunist", "brawler", "brawler", "farmer"]  # by hero: KYLE, CHAD, KAREN, BECKY
const SMART_START := 0.3
const SMART_FULL_ROUND := 6

static var round_num := 0
static var phase := "pick"
static var hero_index := 0
static var gold := 0
static var upgrades: Array = []
static var run_seed := 0
static var rerolls := 0   # this run so far (prices the next reroll)
static var reroll_off := 0  # Bargain: gold off every reroll from now on
## "Once" cards (Bargain): id -> the shop roll ("round:rerolls") that showed it.
## Shown once per run — skip it and it's gone.
static var once_seen := {}
## Ability levels by LETTER — they stay when you pick a different hero.
static var levels := {"Q": 1, "W": 1, "E": 1, "R": 1}
## Red's side of the economy.
static var red_gold := 0
static var red_upgrades: Array = []
static var red_levels := {"Q": 1, "W": 1, "E": 1, "R": 1}
static var red_bought: Array = []   # what red bought in the latest shop

## Balance experiments — all OFF in the game; tools/autoplay.gd's
## `--variant fixes` turns them on to A/B test proposed changes.
##   red_no_economy     red's shop skips economy cards (ECONOMY_CARDS)
##   bot_stats_from     from this round on, the bot's hp/damage multipliers
##                      are 1.0 (its power comes from its shop); 0 = off
static var red_no_economy := false
static var bot_stats_from := 0
## Autoplay experiments: pin red's hero (-1 = rolled per round as usual) and
## give red's bot a personality (bot.gd PERSONALITIES; "" = standard).
static var red_hero_fixed := -1
static var red_personality := ""   # "" = the ladder (SIGNATURE); "standard" = the plain bot
static var red_smartness := -1.0   # -1 = the ladder's per-round value
const ECONOMY_CARDS := []  # none left: Midas removed 2026-10-02, Bounty Hunter gives no gold since 2026-10-04
## Highest round ever reached (saved in `settings`).
static var best_round := -1


static func reset() -> void:
	round_num = 0
	phase = "pick"
	gold = 0
	upgrades = []
	rerolls = 0
	reroll_off = 0
	once_seen = {}
	levels = {"Q": 1, "W": 1, "E": 1, "R": 1}
	red_gold = 0
	red_upgrades = []
	red_levels = {"Q": 1, "W": 1, "E": 1, "R": 1}
	red_bought = []
	run_seed = randi()


static func start(hero: int) -> void:
	if run_seed == 0:
		run_seed = randi()
	hero_index = hero
	round_num = 1
	phase = "play"


## Red's late ramp this round (1.0 before RED_RAMP_FROM, then +RED_RAMP_STEP a round).
static func red_ramp() -> float:
	return 1.0 + RED_RAMP_STEP * maxi(0, maxi(round_num, 1) - RED_RAMP_FROM + 1)


## Red's strength this round: a DIFFICULTY row, and past the table the last
## row grown for every extra round (endless).
static func difficulty() -> Dictionary:
	var d := _difficulty().duplicate()
	var stat := maxf(STAT_FLOOR, 1.0 + STAT_STEP * (maxi(round_num, 1) - STAT_ANCHOR_ROUND))
	for k: String in STAT_KEYS:  # one gentle line for red's stats (the table keeps the bot's behaviour)
		d[k] = stat
	var r := maxi(round_num, 1)
	d["deny_chance"] = clampf(DENY_START + DENY_STEP * (r - 1), 0.0, DENY_MAX)
	d["last_hit_chance"] = clampf(LAST_HIT_START + LAST_HIT_STEP * (r - 1), 0.0, LAST_HIT_MAX)
	d["reaction"] = lerpf(REACTION_START, REACTION_FLOOR, clampf(float(r - 1) / float(REACTION_FLOOR_ROUND - 1), 0.0, 1.0))
	d["hesitate"] = lerpf(HESITATE_START, 0.0, clampf(float(r - 1) / float(HESITATE_END_ROUND - 1), 0.0, 1.0))
	if r > SUPER_FROM:  # beyond human
		var st := clampf(float(r - SUPER_FROM) / float(SUPER_FULL - SUPER_FROM), 0.0, 1.0)
		for k: String in SUPER:
			d[k] = lerpf(float(d[k]), float(SUPER[k]), st)
	if r < STAT_ANCHOR_ROUND:  # the tower's own, quicker start
		d["tower_hp"] = lerpf(TOWER_HP_START, 1.0, float(r - 1) / float(STAT_ANCHOR_ROUND - 1))
		d["creeps"] = lerpf(CREEPS_START, 1.0, float(r - 1) / float(STAT_ANCHOR_ROUND - 1))
	var ramp := red_ramp()
	if ramp != 1.0:
		for k: String in STAT_KEYS:
			d[k] = float(d[k]) * ramp
	if bot_stats_from > 0 and round_num >= bot_stats_from:  # experiment: skill-only bot
		d = d.duplicate()
		d["bot_hp"] = 1.0
		d["bot_damage"] = 1.0
	return d


static func _difficulty() -> Dictionary:
	var i := clampi(round_num - 1, 0, 9999)
	if i < DIFFICULTY.size():
		return DIFFICULTY[i]
	var d: Dictionary = DIFFICULTY[DIFFICULTY.size() - 1].duplicate()
	var extra := i - (DIFFICULTY.size() - 1)
	var sharpen := pow(ENDLESS_SHARPEN, extra)
	d["cast_gap"] = maxf(CAST_GAP_FLOOR, float(d["cast_gap"]) * sharpen)
	d["aim_error"] = maxf(AIM_ERROR_FLOOR, float(d["aim_error"]) * sharpen)
	return d


## Record the round reached if it's a new best (called when a run ends).
static func record_best() -> void:
	load_best()
	if round_num > best_round:
		best_round = round_num
		var c := ConfigFile.new()
		c.load(settings)
		c.set_value("run", "best_round", best_round)
		c.save(settings)


static func load_best() -> int:
	if best_round < 0:
		var c := ConfigFile.new()
		best_round = int(c.get_value("run", "best_round", 0)) if c.load(settings) == OK else 0
	return best_round


static func reroll_cost() -> int:
	return maxi(5, REROLL_COST + REROLL_STEP * rerolls - reroll_off)


## The shop's offers after this round: OFFERS_PER_TIER per tier, the same for
## the same run seed, round and reroll count.
static func shop_offers() -> Dictionary:
	var rng := RandomNumberGenerator.new()
	rng.seed = hash([run_seed, round_num, rerolls])
	var key := "%d:%d" % [round_num, rerolls]
	var blocked := upgrades.duplicate()  # owned, plus "once" cards an earlier roll already showed
	for id: String in once_seen:
		if once_seen[id] != key:
			blocked.append(id)
	var out := {}
	for tier: String in Upgrades.TIER_ORDER:
		out[tier] = Upgrades.offers(tier, Upgrades.OFFERS_PER_TIER, blocked, rng)
	out["wave"] = Upgrades.offers("wave", Upgrades.WAVE_OFFERS, blocked, rng)
	for row: Array in out.values():
		for u: Dictionary in row:
			if u.get("once", false) and not once_seen.has(u["id"]):
				once_seen[u["id"]] = key
	return out


## Spend gold on upgrade `id`. False when it can't be afforded or offered.
## Picks made so far (cards + ability levels bought) — drives rising prices.
static func picks(ups: Array, lvls: Dictionary) -> int:
	var cards := ups.filter(func(id: String) -> bool: return not Upgrades.find(id).has("on_buy")).size()  # (one-time shop cards like Bargain don't count)
	return cards + int(lvls.values().reduce(func(a, b): return a + b, 0)) - 4


## `base` gold after `n` picks of rising prices (rounded to 5).
static func inflate(base: int, n: int) -> int:
	return int(roundf(base * (1.0 + PRICE_RISE * n) / 5.0) * 5.0)


## What a card / level costs you right now.
static func card_cost(u: Dictionary) -> int:
	return inflate(Upgrades.price(u), picks(upgrades, levels))


static func level_cost(slot: String, to: int) -> int:
	return inflate(Upgrades.level_price(slot, to), picks(upgrades, levels))


## …and what it costs red right now.
static func red_card_cost(u: Dictionary) -> int:
	return inflate(Upgrades.price(u), picks(red_upgrades, red_levels))


static func red_level_cost(slot: String, to: int) -> int:
	return inflate(Upgrades.level_price(slot, to), picks(red_upgrades, red_levels))


static func buy(id: String) -> bool:
	var u := Upgrades.find(id)
	if u.is_empty() or gold < card_cost(u) or not Upgrades.can_offer(u, upgrades):
		return false
	gold -= card_cost(u)
	upgrades.append(id)
	if u.get("on_buy", "") == "halve_reroll":  # Bargain: the reroll price drops by half of what it is now (the climb carries on from there)
		reroll_off += reroll_cost() / 2
	return true


static func reroll() -> bool:
	if gold < reroll_cost():
		return false
	gold -= reroll_cost()
	rerolls += 1
	return true


## Buy the next level of `slot` (Q/W/E/R). False when maxed or unaffordable.
static func buy_level(slot: String) -> bool:
	var to: int = levels[slot] + 1
	if to > Heroes.MAX_LEVEL or gold < level_cost(slot, to):
		return false
	gold -= level_cost(slot, to)
	levels[slot] = to
	return true


## Pick the hero for the next round (free between rounds; levels carry over).
static func choose_hero(i: int) -> void:
	hero_index = clampi(i, 0, Heroes.LIST.size() - 1)


## The enemy bot's hero in round `r`: the heroes are shuffled once per run
## (from the seed) and that order repeats for the whole run — every hero once
## every 4 rounds, never the same one twice in a row. Seeded, so the shop can
## show who you'll face next and the same run always meets the same heroes.
static func bot_hero_for(r: int) -> int:
	if red_hero_fixed >= 0:
		return red_hero_fixed
	var order: Array = range(Heroes.LIST.size())
	# sorted by a per-hero hash of the seed: well mixed (a freshly seeded RNG's
	# first draws barely move with the seed — every run got the same order)
	order.sort_custom(func(a: int, b: int) -> bool: return hash([run_seed, "bot order", a]) < hash([run_seed, "bot order", b]))
	return int(order[(maxi(r, 1) - 1) % order.size()])


## Red's bot personality for hero `i`: its SIGNATURE (unless an experiment
## pins one).
static func red_personality_for(i: int) -> String:
	if red_personality != "":
		return red_personality
	return SIGNATURE[i] if i < SIGNATURE.size() else "standard"


## Red's bot smartness this round (0 = dumb, 1 = its tuned personality).
static func red_smartness_now() -> float:
	if red_smartness >= 0.0:
		return red_smartness
	var t := float(maxi(round_num, 1) - 1) / float(SMART_FULL_ROUND - 1)
	return clampf(lerpf(SMART_START, 1.0, t), 0.0, 1.0)


## How much tougher the lane is this round (1 in round 1).
static func lane_growth() -> float:
	return 1.0 + LANE_GROWTH_STEP * (maxi(round_num, 1) - 1)


## Both towers' health this round.
static func lane_tower_hp() -> float:
	return LANE_TOWER_HP * lane_growth()


## Both sides' creep health multiplier this round.
static func lane_creep_hp() -> float:
	return LANE_CREEP_START * lane_growth()


## Extra melee creeps in each red wave this round (late-round pressure).
static func red_extra_melee() -> int:
	if round_num < RED_EXTRA_FROM:
		return 0
	return 1 + (round_num - RED_EXTRA_FROM) / RED_EXTRA_EVERY


static func red_allowance() -> int:
	return RED_ALLOWANCE + RED_ALLOWANCE_STEP * round_num


## Red's turn in the shop, after round `round_num` (call once per shop):
## adds its allowance, then buys from its own seeded offers — about half
## ability levels (lowest letter first), otherwise the priciest card it can
## afford — until nothing is affordable. Returns what it bought ("Q+" etc.
## for levels).
## How red picks cards: the upcoming red hero's personality's list, best
## first — the first affordable card on the list is bought. Cards missing from
## a list are never bought by that personality (Command / leashing is only on
## the pusher's, the only one that leashes; Midas and Bounty Hunter on none —
## red's short rounds can't repay economy cards). Simple, but it scales: damage
## and survival first, then the rest.
const RED_PRIORITY := {
	"standard": ["arcane_edge", "vigor", "whetstone", "quickdraw", "haste", "spellblade", "second_wind", "overcharge",
		"colossus", "twin_shot", "echo", "hunters_mark", "reserve", "vampirism", "salve", "boots", "clean_finish",
		"keen_eye", "adrenaline", "focus", "wellspring", "executioner", "bounty_hunter", "longbow", "tank_minion",
		"reinforcement", "vanguard", "siege_training", "standard_bearer", "healing_aura", "sappers", "pathfinders",
		"scavenger", "siphon"],
	"brawler": ["vigor", "whetstone", "quickdraw", "serrated", "vampirism", "second_wind", "colossus", "spellblade",
		"cold_read", "twin_shot", "arcane_edge", "aftershock", "hunters_mark", "salve", "haste", "spite", "boots",
		"overcharge", "echo", "reserve", "afterimage", "kindling", "executioner", "clean_finish", "adrenaline",
		"scavenger", "tank_minion", "reinforcement", "vanguard", "standard_bearer", "siege_training", "healing_aura",
		"focus", "wellspring", "longbow", "siphon"],
	"farmer": ["arcane_edge", "haste", "focus", "wellspring", "siphon", "keen_eye", "clean_finish", "bounty_hunter",
		"echo", "reserve", "overcharge", "executioner", "adrenaline", "homeguard", "afterimage", "second_wind",
		"scavenger", "recruit", "vigor", "whetstone", "quickdraw", "longbow", "salve", "boots", "colossus", "twin_shot",
		"healing_aura", "reinforcement", "tank_minion", "siege_training", "vampirism"],
	"pusher": ["reinforcement", "siege_training", "tank_minion", "command", "rally_cry", "sappers", "vanguard",
		"standard_bearer", "pathfinders", "healing_aura", "siege_breaker", "quickdraw", "whetstone", "twin_shot",
		"arcane_edge", "vigor", "haste", "boots", "colossus", "overcharge", "echo", "salve", "focus", "wellspring",
		"longbow", "vampirism", "executioner", "siphon"],
	"opportunist": ["arcane_edge", "overcharge", "echo", "haste", "hunters_mark", "kindling", "cold_read", "spellblade",
		"reserve", "afterimage", "focus", "vigor", "boots", "wellspring", "colossus", "second_wind", "vampirism",
		"whetstone", "quickdraw", "salve", "twin_shot", "executioner", "keen_eye", "clean_finish", "adrenaline",
		"scavenger", "longbow", "tank_minion", "reinforcement", "siege_training", "healing_aura", "siphon"],
}


static func red_shop() -> Array:
	red_gold += red_allowance()
	var rng := RandomNumberGenerator.new()
	rng.seed = hash([run_seed, round_num, "red"])
	var cards: Array = []
	for tier: String in Upgrades.TIER_ORDER:
		cards.append_array(Upgrades.offers(tier, Upgrades.OFFERS_PER_TIER, red_upgrades, rng))
	cards.append_array(Upgrades.offers("wave", Upgrades.WAVE_OFFERS, red_upgrades, rng))  # red's own WAVE roll
	red_bought = []
	while true:
		var lv: Array = []
		for slot: String in ["Q", "W", "E", "R"]:
			var to: int = red_levels[slot] + 1
			if to <= Heroes.MAX_LEVEL and red_level_cost(slot, to) <= red_gold:
				lv.append(slot)
		var wanted: Array = RED_PRIORITY.get(red_personality_for(bot_hero_for(round_num + 1)), RED_PRIORITY["standard"])
		var cs := cards.filter(func(u: Dictionary) -> bool:
			return red_card_cost(u) <= red_gold and Upgrades.can_offer(u, red_upgrades) and wanted.has(u["id"]) \
				and not (red_no_economy and ECONOMY_CARDS.has(u["id"])))
		if lv.is_empty() and cs.is_empty():
			break
		if not lv.is_empty() and (cs.is_empty() or rng.randf() < RED_LEVEL_CHANCE):
			var low: int = lv.map(func(k: String) -> int: return red_levels[k]).min()
			var lowest := lv.filter(func(k: String) -> bool: return red_levels[k] == low)
			var slot: String = lowest[rng.randi_range(0, lowest.size() - 1)]  # seeded, like the rest
			red_gold -= red_level_cost(slot, red_levels[slot] + 1)
			red_levels[slot] += 1
			red_bought.append(slot + "+")
		else:  # the affordable card highest on its personality's list
			var best: Dictionary = cs[0]
			for u: Dictionary in cs:
				if wanted.find(u["id"]) < wanted.find(best["id"]):
					best = u
			red_gold -= red_card_cost(best)
			red_upgrades.append(best["id"])
			cards.erase(best)
			red_bought.append(best["id"])
	return red_bought


## Leave the shop for the next round.
static func next_round() -> void:
	round_num += 1
	phase = "play"


static func to_dict() -> Dictionary:
	return {"round": round_num, "phase": phase, "hero": hero_index, "gold": gold,
		"upgrades": upgrades.duplicate(), "seed": run_seed, "rerolls": rerolls, "reroll_off": reroll_off, "once_seen": once_seen.duplicate(), "levels": levels.duplicate(),
		"red": {"gold": red_gold, "upgrades": red_upgrades.duplicate(), "levels": red_levels.duplicate()}}


static func from_dict(d: Dictionary) -> void:
	round_num = d["round"]
	phase = d["phase"]
	hero_index = d["hero"]
	gold = d["gold"]
	upgrades = d["upgrades"].duplicate()
	run_seed = d["seed"]
	rerolls = d["rerolls"]
	once_seen = d.get("once_seen", {})
	reroll_off = int(d.get("reroll_off", 0))
	levels = d.get("levels", {"Q": 1, "W": 1, "E": 1, "R": 1}).duplicate()
	var red: Dictionary = d.get("red", {})
	red_gold = red.get("gold", 0)
	red_upgrades = red.get("upgrades", []).duplicate()
	red_levels = red.get("levels", {"Q": 1, "W": 1, "E": 1, "R": 1}).duplicate()
