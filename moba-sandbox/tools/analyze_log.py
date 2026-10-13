#!/usr/bin/env python3
"""Analyse a MOBA Sandbox play log (run_<stamp>.jsonl) — the numbers behind /analyze-run.

    python tools/analyze_log.py                  # newest complete run
    python tools/analyze_log.py latest --any     # newest log, even unfinished
    python tools/analyze_log.py <path or stamp>  # a specific run
    python tools/analyze_log.py --round 12       # also a detailed look at one round
    python tools/analyze_log.py --list           # recent logs

A run saved and resumed later (Continue) writes a new log per sitting, marked
with a "continue" event; the parts share the run's seed. They're stitched back
into one run: a round that appears in two parts (quit mid-round, then resumed
from its start) counts from the later part.

Sections: run header · per-round table (headline metrics) · why each round went
the way it did (towers, waves, creep kills, siege) · red's behaviour per round ·
anomalies worth a look · trends across the run. Works on older logs too: what a
log doesn't have is left out (red_* events since 2026-10-07, round metrics /
tower damage / creep deaths / waves / version since 2026-10-08).

Headline metrics (decided 2026-10-08, see moba-sandbox/IDEAS.md):
  wave      your creeps minus red's on the field, averaged — the best single sign
            of who's winning (positive in every won round of the reference run)
  dmg       damage you dealt red / damage red dealt you — how fights trend
  lh%       last hits / (last hits + missed) — your farming
  towers    the tower race (both towers over time)
Dev tool: never ships (tools/ is excluded from exports).
"""
import argparse
import collections
import glob
import json
import os
import sys

LOG_DIRS = [
    os.path.join(os.environ.get("APPDATA", ""), "Godot", "app_userdata", "MOBA Sandbox", "playlogs"),
    os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "builds", "windows-playtest", "playlogs"),
]
OT_START, OT_PER_ROUND, OT_MAX = 150.0, 20.0, 300.0  # lane.gd OVERTIME (start + per_round × round, capped)


def overtime_at(r):
    return min(OT_MAX, OT_START + OT_PER_ROUND * max(1, r))


# ------------------------------------------------------------------ loading

def find_logs():
    out = []
    for d in LOG_DIRS:
        out += glob.glob(os.path.join(d, "run_*.jsonl"))
    return sorted(out, key=os.path.getmtime, reverse=True)


def load(path):
    events = []
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                try:
                    events.append(json.loads(line))
                except json.JSONDecodeError:
                    pass
    return events


def complete(events):
    return any(e["type"] == "round_end" for e in events)


def run_seed(events):
    return next((e.get("seed") for e in events if e["type"] == "run_start"), None)


def is_continue(events):
    return any(e["type"] == "continue" for e in events)


def chain(path):
    """The parts of the run `path` belongs to, oldest first: each part that starts
    with a "continue" event joins on to the newest earlier log with the same seed
    (a replay shares the seed too, but has no continue event, so it stays separate)."""
    seed = run_seed(load(path))
    if seed is None:
        return [path]
    same = sorted((p for p in find_logs() if run_seed(load(p)) == seed), key=os.path.basename)
    key = lambda q: os.path.normcase(os.path.abspath(q))
    i = next((j for j, q in enumerate(same) if key(q) == key(path)), -1)
    if i < 0:
        return [path]
    lo = i
    while lo > 0 and is_continue(load(same[lo])):
        lo -= 1
    hi = i
    while hi + 1 < len(same) and is_continue(load(same[hi + 1])):
        hi += 1
    return same[lo:hi + 1]


def stitch(paths):
    """One run's events and rounds from its parts; later parts replace a round they replay."""
    rounds = collections.OrderedDict()
    events = []
    replayed = []
    for p in paths:
        ev = load(p)
        events += ev
        for n, r in split_rounds(ev).items():
            if n in rounds and r.start:
                if rounds[n].start:
                    replayed.append(n)
                rounds[n] = r
            elif n not in rounds:
                rounds[n] = r
            else:
                rounds[n].ev += r.ev  # (shop events after a round: same round number, no round_start)
    rounds = collections.OrderedDict(sorted(rounds.items()))
    return events, rounds, replayed


def pick(arg, any_log):
    logs = find_logs()
    if arg and arg != "latest":
        if os.path.exists(arg):
            return arg
        hits = [p for p in logs if arg in os.path.basename(p)]
        if hits:
            return hits[0]
        sys.exit("no log matches %r" % arg)
    for p in logs:
        if any_log or complete(load(p)):
            return p
    sys.exit("no play logs found in " + " or ".join(LOG_DIRS))


# ------------------------------------------------------------------ helpers

def pct(a, b):
    return 100.0 * a / b if b else 0.0


def fmt_t(t):
    return "%d:%02d" % (int(t) // 60, int(t) % 60)


def share(counter, n, top=8):
    return ", ".join("%s %d%%" % (k, pct(v, n)) for k, v in counter.most_common(top)) or "—"


def dist(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


class Round:
    def __init__(self, n):
        self.n = n
        self.start = {}
        self.end = {}
        self.ev = []
        self.snaps = []

    def of(self, *types):
        return [e for e in self.ev if e["type"] in types]


def split_rounds(events):
    rounds = collections.OrderedDict()
    for e in events:
        n = e.get("round")
        if n is None:
            continue
        r = rounds.setdefault(n, Round(n))
        if e["type"] == "round_start":
            r.start = e
        elif e["type"] == "round_end":
            r.end = e
        elif e["type"] == "snap":
            r.snaps.append(e)
        r.ev.append(e)
    return rounds


# ------------------------------------------------------------------ metrics

def metrics(r):
    """The headline numbers: from the round summary, else worked out from the timeline."""
    m = dict(r.end.get("metrics") or {})
    if "wave_adv" not in m and r.snaps:
        m["wave_adv"] = sum(s["creeps"][0] - s["creeps"][1] for s in r.snaps) / len(r.snaps)
    if "dmg_ratio" not in m:
        led = r.end.get("red_ledger") or {}
        to_red = sum(v for k, v in led.get("taken", {}).items() if k.startswith("you"))
        to_you = sum(led.get("dealt", {}).values())
        m["dmg_ratio"] = to_red / to_you if to_you else None
    if "lh_pct" not in m and r.end:
        lh, missed = r.end.get("last_hits", 0), r.end.get("missed", 0)
        m["lh_pct"] = round(pct(lh, lh + missed))
    return m


def tower_at(r, t, side):
    """Tower `side` (0 you, 1 red) as a fraction at time t."""
    if not r.snaps:
        return None
    full = r.snaps[0]["towers"][side] or 1
    best = r.snaps[0]
    for s in r.snaps:
        if s["t"] <= t:
            best = s
        else:
            break
    return best["towers"][side] / full


def melt(r, side):
    """Seconds the tower took from 50% to rubble, if it fell (the round ends the
    moment a tower dies, so the last snapshot is usually just before)."""
    if not r.snaps:
        return None
    fell = (side == 0 and r.end.get("outcome") == "lost") or (side == 1 and r.end.get("outcome") == "won")
    full = r.snaps[0]["towers"][side] or 1
    half = None
    for s in r.snaps:
        if half is None and s["towers"][side] <= full * 0.5:
            half = s["t"]
        if s["towers"][side] <= 0:
            fell = True
            end_t = s["t"]
            break
    else:
        end_t = r.end.get("time", r.snaps[-1]["t"])
    if not fell:
        return None
    return end_t - (half if half is not None else end_t)


# ------------------------------------------------------------------ sections

def header(paths, events, rounds, replayed=()):
    rs = next((e for e in reversed(events) if e["type"] == "run_start"), {})  # (the newest part: its build)
    rp = next((e for e in events if e["type"] == "replay"), None)
    end = next((e for e in reversed(events) if e["type"] == "run_end"), None)
    print("# Run %s" % os.path.basename(paths[-1]))
    if len(paths) > 1:
        parts = []
        for p in paths:
            ev = load(p)
            ns = sorted({e["round"] for e in ev if e["type"] == "round_start"})
            v = next((e.get("version") for e in ev if e["type"] == "run_start"), "?")
            span = ("rounds %d–%d" % (ns[0], ns[-1]) if len(ns) > 1 else "round %d" % ns[0]) if ns else "no rounds"
            parts.append("%s (%s, %s)" % (os.path.basename(p), span, v))
        print("- stitched from %d saved sittings: %s" % (len(paths), " → ".join(parts)))
        if replayed:
            print("- replayed after a continue (quit mid-round; the later try counts): round %s" % ", ".join(map(str, replayed)))
    heroes = sorted({r.start.get("hero", "?") for r in rounds.values() if r.start})
    print("- hero(es): %s · seed %s · version %s · cast indicator %s" % (
        ", ".join(heroes) or rs.get("hero", "?"), rs.get("seed", "?"), rs.get("version", "not logged (before 2026-10-08)"),
        (rs.get("settings") or {}).get("cast_indicator", "not logged")))
    if rp:
        print("- replay of %s from round %s" % (rp.get("from", "?"), rp.get("round", "?")))
    print("- result: %s" % (end.get("result") if end else "unfinished (no run_end)"))
    print()


def round_table(rounds):
    print("## Rounds")
    print("| R | you vs red (personality, smart) | result | time | OT at | wave | dmg | lh% | K-D | red tower @OT | latches you/red | totems down you/red |")
    print("|---|---|---|---|---|---|---|---|---|---|---|---|")
    for r in rounds.values():
        if not r.start:
            continue
        red = r.start.get("red", {}) or {}
        m = metrics(r)
        e = r.end
        ot = overtime_at(r.n)
        rt = tower_at(r, ot, 1) if e.get("time", 0) > ot else None
        lat = collections.Counter(x["team"] for x in r.of("latch"))
        dn = collections.Counter(x["team"] for x in r.of("totem_down"))
        print("| %d | %s vs %s (%s, %s) | %s | %s | %s | %s | %s | %s | %s-%s | %s | %d/%d | %d/%d |" % (
            r.n, r.start.get("hero", "?"), r.start.get("bot_hero", "?"), red.get("personality", "?"), red.get("smartness", "?"),
            e.get("outcome", "unfinished"), fmt_t(e.get("time", r.snaps[-1]["t"] if r.snaps else 0)), fmt_t(ot),
            "%+.1f" % m["wave_adv"] if m.get("wave_adv") is not None else "—",
            "%.2f" % m["dmg_ratio"] if m.get("dmg_ratio") is not None else "—",
            "%s%%" % m.get("lh_pct", "—") if e else "—",
            e.get("kills", "—"), e.get("deaths", "—"),
            "%.0f%%" % (rt * 100) if rt is not None else "ended before OT",
            lat.get(0, 0), lat.get(1, 0), dn.get(0, 0), dn.get(1, 0)))
    print()


def why(r):
    print("### Round %d — why it went %s" % (r.n, r.end.get("outcome", "unfinished")))
    td = r.end.get("tower_damage")
    if td:
        for who, d in (("your tower", td.get("yours", {})), ("red's tower", td.get("reds", {}))):
            tot = sum(v for k, v in d.items() if k != "overtime_bonus")
            if tot:
                parts = ", ".join("%s %d%%" % (k, pct(v, tot)) for k, v in sorted(d.items(), key=lambda kv: -kv[1]) if k != "overtime_bonus")
                print("- %s took %d: %s (overtime crumble added %d)" % (who, tot, parts, d.get("overtime_bonus", 0)))
    for side, name in ((0, "your"), (1, "red's")):
        m = melt(r, side)
        if m is not None:
            print("- %s tower went from 50%% to rubble in %.0f s" % (name, m))
    if r.snaps:
        last = [s for s in r.snaps if s["t"] >= r.snaps[-1]["t"] - 120]
        print("- wave: max creeps you/red %d/%d; last 2 min average %+.1f" % (
            max(s["creeps"][0] for s in r.snaps), max(s["creeps"][1] for s in r.snaps),
            sum(s["creeps"][0] - s["creeps"][1] for s in last) / max(1, len(last))))
        fr = [s for s in r.snaps if s.get("front")]
        if fr:
            at = [s.get("at_tower", [0, 0]) for s in r.snaps if s.get("at_tower")]
            print("- creeps at the enemy tower (avg): yours %.1f, red's %.1f" % (
                sum(a[0] for a in at) / max(1, len(at)), sum(a[1] for a in at) / max(1, len(at))))
    cd = r.end.get("creep_deaths")
    if cd:
        for who, d in (("your creeps", cd.get("yours", {})), ("red's creeps", cd.get("reds", {}))):
            if d:
                print("- %s died to: %s" % (who, ", ".join("%s %d" % kv for kv in sorted(d.items(), key=lambda kv: -kv[1]))))
    waves = r.of("wave")
    if waves:
        sb = sum(w["blue"]["creeps"] for w in waves)
        sr = sum(w["red"]["creeps"] for w in waves)
        sieges = (sum(w["blue"]["siege"] for w in waves), sum(w["red"]["siege"] for w in waves))
        print("- waves sent: %d · creeps you/red %d/%d · siege minions you/red %d/%d · last tower multiplier ×%.2f" % (
            len(waves), sb, sr, sieges[0], sieges[1], waves[-1].get("tower_mult", 1.0)))
    print()


def red_behaviour(r):
    al = [s for s in r.snaps if s["bot"].get("alive")]
    if not any(e["type"].startswith("red_") for e in r.ev):
        return
    n = max(1, len(al))
    print("### Round %d — red (%s)" % (r.n, r.start.get("bot_hero", "?")))
    print("- doing: " + share(collections.Counter(s["bot"].get("why", "?").split(" ")[0] for s in al), n))
    print("- flags: " + share(collections.Counter(f for s in al for f in s["bot"].get("flags", [])), n))
    combos = collections.Counter(tuple(e["seq"]) for e in r.of("red_combo"))
    if combos:
        print("- combos: %s · ended: %s" % (
            ", ".join("%s×%d" % ("→".join(k), v) for k, v in combos.most_common()),
            dict(collections.Counter(e.get("reason", "?") for e in r.of("red_combo_end")))))
    by = collections.defaultdict(lambda: [0, 0, 0, 0])
    for e in r.of("red_cast_result"):
        b = by[e["ability"]]
        b[0] += 1; b[1] += bool(e.get("hit_you")); b[2] += e.get("you_dmg", 0); b[3] += e.get("creeps_hit", 0)
    if by:
        print("- casts (hit you / cast, damage to you, creeps hit): " + ", ".join(
            "%s %d/%d %d %d" % (k, v[1], v[0], v[2], v[3]) for k, v in by.items()))
    passed = collections.Counter(e.get("reason", "?") for e in r.of("red_passed"))
    if passed:
        print("- chances passed: " + ", ".join("%s ×%d" % kv for kv in passed.most_common(6)))
    deaths = r.of("red_death")
    if deaths:
        print("- deaths: " + ", ".join("%s (%s, doing %s)" % (fmt_t(e["t"]), e.get("killer", "?"), e.get("why", "?")) for e in deaths))
    keys = r.of("red_key")
    if keys:
        ends = collections.Counter(e.get("reason", "?").split(":")[0] for e in r.of("red_key_end"))
        print("- key runs: %d (sent %d) · ended: %s" % (len(keys), len(r.of("red_key_send")), dict(ends)))
    trips, cont = r.of("red_totem_trip"), r.of("red_totem_contest")
    if trips or cont:
        print("- totem: %d trips, %d contests" % (len(trips), len(cont)))
    led = r.end.get("red_ledger")
    if led:
        print("- damage to you: %s · taken: %s · last hits skipped %s" % (
            led.get("dealt"), led.get("taken"), led.get("skipped_last_hits")))
    print()


def anomalies(rounds):
    found = []
    for r in rounds.values():
        # red died low without retreating
        for e in r.of("red_death"):
            if e.get("why") not in ("retreat",) and e.get("killer") == "creep":
                found.append("R%d %s: red died to creeps while '%s' (retreat failure?)" % (r.n, fmt_t(e["t"]), e.get("why")))
        # casts aimed off the map
        for e in r.of("red_cast"):
            at = e.get("at") or [0, 0]
            if abs(at[0]) > 3200 or abs(at[1]) > 3200:
                found.append("R%d %s: red cast %s at %s — off the map (aim bug?)" % (r.n, fmt_t(e["t"]), e.get("ability"), at))
        # red standing still a long time while alive and not holding
        still, since = None, None
        for s in r.snaps:
            b = s["bot"]
            if not b.get("alive"):
                still = since = None
                continue
            w = b.get("why", "")
            if still and dist(still, b["at"]) < 8 and w.startswith("leash:key"):
                if s["t"] - since >= 3.0:
                    found.append("R%d %s: red stood still %.0f s on a key run (freeze?)" % (r.n, fmt_t(since), s["t"] - since))
                    still = since = None
                continue
            still, since = b["at"], s["t"]
        # BOOP / opener pulls with nothing after (the poke pattern)
        casts = r.of("red_cast")
        for i, e in enumerate(casts):
            if e.get("ability") == "BOOP":
                after = [c for c in casts[i + 1:] if c["t"] - e["t"] <= 2.0]
                if not after and any(c["t"] for c in r.of("red_combo") if abs(c["t"] - e["t"]) < 1.0):
                    found.append("R%d %s: red BOOP-opened a combo with nothing cast after (poke)" % (r.n, fmt_t(e["t"])))
        # decision churn
        whys = r.of("red_why")
        if r.snaps and whys:
            mins = max(1.0, (r.snaps[-1]["t"] - r.snaps[0]["t"]) / 60)
            if len(whys) / mins > 60:
                found.append("R%d: red changed its mind %.0f times a minute (indecision?)" % (r.n, len(whys) / mins))
        # long rounds and melts
        if r.end.get("time", 0) > 480:
            found.append("R%d: long round (%s) — tempo?" % (r.n, fmt_t(r.end["time"])))
        for side, name in ((0, "your"), (1, "red's")):
            m = melt(r, side)
            if m is not None and m < 30:
                found.append("R%d: %s tower melted 50%%→0 in %.0f s — was it readable?" % (r.n, name, m))
    print("## Anomalies worth a look")
    if found:
        for f in found[:40]:
            print("- " + f)
        if len(found) > 40:
            print("- … and %d more" % (len(found) - 40))
    else:
        print("- none found")
    print()


def trends(rounds):
    rs = [r for r in rounds.values() if r.end]
    if len(rs) < 2:
        return
    print("## Trends across the run")
    for key, label, fmt in (("wave_adv", "wave", "%+.1f"), ("dmg_ratio", "dmg", "%.2f"), ("lh_pct", "lh%", "%d")):
        vals = [metrics(r).get(key) for r in rs]
        print("- %s: %s" % (label, "  ".join((fmt % v) if v is not None else "—" for v in vals)))
    print("- length: %s" % "  ".join(fmt_t(r.end.get("time", 0)) for r in rs))
    print("- result: %s" % "  ".join(r.end.get("outcome", "?")[0] for r in rs))
    print()


def detail(r):
    print("## Round %d in detail (every 15 s)" % r.n)
    print("| t | towers you/red | creeps you/red | front you/red | you x hp | red x hp doing |")
    print("|---|---|---|---|---|---|")
    for s in r.snaps:
        if int(s["t"] * 4) % 60:
            continue
        y, b = s["you"], s["bot"]
        print("| %s | %s | %s | %s | %d %s | %d %s %s |" % (
            fmt_t(s["t"]), s["towers"], s["creeps"], s.get("front", "—"),
            y["at"][0], y["hp"] if y["alive"] else "DEAD", b["at"][0], b["hp"] if b.get("alive") else "DEAD", b.get("why", "")))
    keys = ("death", "kill", "red_death", "red_key", "red_key_end", "totem_down", "red_totem_trip", "red_totem_contest", "red_combo", "red_combo_end")
    print()
    for e in r.of(*keys):
        print("- %s %s %s" % (fmt_t(e["t"]), e["type"], {k: v for k, v in e.items() if k not in ("t", "round", "type", "inputs", "flags")}))
    print()


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # (the Windows console defaults to cp1252)
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("log", nargs="?", default="latest")
    ap.add_argument("--any", action="store_true", help="allow an unfinished run")
    ap.add_argument("--round", type=int, help="also show this round in detail")
    ap.add_argument("--list", action="store_true", help="list recent logs")
    a = ap.parse_args()
    if a.list:
        for p in find_logs()[:15]:
            ev = load(p)
            ends = [e for e in ev if e["type"] == "round_end"]
            print("%s  %s  rounds %d  %s%s" % (os.path.basename(p), next((e.get("hero") for e in ev if e["type"] == "run_start"), "?"),
                                          len(ends), "complete" if ends else "unfinished",
                                          "  (continues an earlier log)" if is_continue(ev) else ""))
        return
    paths = chain(pick(a.log, a.any))
    events, rounds, replayed = stitch(paths)
    header(paths, events, rounds, replayed)
    round_table(rounds)
    for r in rounds.values():
        if r.start:
            why(r)
            red_behaviour(r)
    anomalies(rounds)
    trends(rounds)
    if a.round and a.round in rounds:
        detail(rounds[a.round])


if __name__ == "__main__":
    main()
