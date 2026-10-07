"""Combine autoplay JSON reports into one balance summary.

    python tools/combine_reports.py autoplay_runs/*.json
    python tools/combine_reports.py some/folder            (every .json in it)

Prints: overall completion, the per-round curve, results by hero, by the
bot's hero (who beats you), by shop policy, ability levels, and card impact
(completion rate of runs that owned a card vs runs that didn't — most
trustworthy from `random` policy runs, which buy without bias).
"""
import glob
import json
import os
import sys
from collections import defaultdict


def load(paths):
    runs = []
    for p in paths:
        if os.path.isdir(p):
            runs += load(sorted(glob.glob(os.path.join(p, "*.json"))))
            continue
        with open(p, encoding="utf-8") as f:
            data = json.load(f)
        for r in data["runs"]:
            r.setdefault("policy", data["options"].get("policy", "?"))
            runs.append(r)
    return runs


def pct(a, b):
    return f"{round(100 * a / b)}%" if b else "—"


def clock(t):
    return f"{int(t) // 60}:{int(t) % 60:02d}"


def main(paths):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # · and × on the Windows console
    runs = load(paths)
    if not runs:
        print("no runs found")
        return
    done = [r for r in runs if r["result"] == "complete"]
    print(f"== {len(runs)} runs · complete {len(done)} ({pct(len(done), len(runs))})")
    ends = defaultdict(int)
    for r in runs:
        ends[r["result"]] += 1
    print("Endings: " + ", ".join(f"{k} ×{v}" for k, v in sorted(ends.items(), key=lambda kv: -kv[1])))

    print("\nRound  played  won    lost  timeout  avg time  avg gold  avg LH  avg deaths")
    rounds = defaultdict(list)
    for r in runs:
        for rd in r["rounds"]:
            rounds[rd["round"]].append(rd)
    for n in sorted(rounds):
        rs = rounds[n]
        c = lambda o: sum(1 for x in rs if x["outcome"] == o)
        avg = lambda k: sum(x[k] for x in rs) / len(rs)
        print(f"R{n:<5} {len(rs):<7} {pct(c('won'), len(rs)):<6} {c('lost'):<5} {c('timeout'):<8} "
              f"{clock(avg('time')):<9} {round(avg('gold_earned')):<9} {avg('last_hits'):<7.1f} {avg('deaths'):.1f}")

    def table(title, key_fn):
        groups = defaultdict(list)
        for r in runs:
            groups[key_fn(r)].append(r)
        print(f"\n{title}")
        for k, rs in sorted(groups.items(), key=lambda kv: -sum(x['result'] == 'complete' for x in kv[1]) / len(kv[1])):
            comp = sum(1 for x in rs if x["result"] == "complete")
            reached = sum(x["reached"] for x in rs) / len(rs)
            print(f"  {k:<10} {comp}/{len(rs)} complete ({pct(comp, len(rs))}) · avg round reached {reached:.1f}")

    table("By your starting hero:", lambda r: r["hero"])
    table("By shop policy:", lambda r: r["policy"])

    # who beats you: round results by the bot's hero
    foe = defaultdict(lambda: [0, 0])
    for r in runs:
        for rd in r["rounds"]:
            if rd.get("bot_hero"):
                foe[rd["bot_hero"]][1] += 1
                if rd["outcome"] == "won":
                    foe[rd["bot_hero"]][0] += 1
    print("\nRounds won vs the bot's hero:")
    for k, (w, n) in sorted(foe.items(), key=lambda kv: kv[1][0] / kv[1][1]):
        print(f"  vs {k:<10} {w}/{n} ({pct(w, n)})")

    # losses: which round, which hero, against whom
    losses = [(r, r["rounds"][-1]) for r in runs if r["result"] != "complete"]
    if losses:
        print("\nFailed runs:")
        for r, rd in losses:
            lv = r.get("levels", {})
            print(f"  {r['hero']:<9} {r['result']:<11} vs {rd.get('bot_hero', '?'):<9} policy {r['policy']:<7} "
                  f"levels Q{lv.get('Q', 1)} W{lv.get('W', 1)} E{lv.get('E', 1)} R{lv.get('R', 1)} · {len(r['build'])} upgrades")

    # ability levels
    lv_groups = defaultdict(list)
    for r in runs:
        total = sum(r.get("levels", {}).values()) - 4 if r.get("levels") else 0
        lv_groups["0" if total == 0 else ("1-3" if total <= 3 else ("4-6" if total <= 6 else "7-8"))].append(r)
    print("\nAbility levels bought (by the end of the run):")
    for k in ["0", "1-3", "4-6", "7-8"]:
        rs = lv_groups.get(k, [])
        if rs:
            comp = sum(1 for x in rs if x["result"] == "complete")
            print(f"  {k:<4} levels   {comp}/{len(rs)} complete ({pct(comp, len(rs))})")

    # card impact (owned by the end of round 3, to limit "rich runs buy everything")
    def owned_by(r, n):
        for rd in r["rounds"]:
            if rd["round"] == n:
                return set(rd.get("build", []))
        return set(r["build"])

    for label, pool in [("all policies", runs), ("random policy only (least biased)", [r for r in runs if r["policy"] == "random"])]:
        if len(pool) < 4:
            continue
        cards = defaultdict(lambda: [0, 0])
        for r in pool:
            have = owned_by(r, 4)  # the build going into round 4
            for c in have:
                cards[c][1] += 1
                if r["result"] == "complete":
                    cards[c][0] += 1
        base = sum(1 for r in pool if r["result"] == "complete") / len(pool)
        print(f"\nCards owned going into round 4 — {label} (baseline completion {pct(base * 100, 100)}):")
        for c, (w, n) in sorted(cards.items(), key=lambda kv: -(kv[1][0] / kv[1][1])):
            if n >= 2:
                print(f"  {c:<14} {w}/{n} complete ({pct(w, n)})")


if __name__ == "__main__":
    main(sys.argv[1:] or ["autoplay_runs"])
