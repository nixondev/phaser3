---
name: analyze-run
description: Analyse a moba-sandbox play log (the latest run, or one the user names) — round results and the headline metrics, why each round was won or lost, how red's bot played and why, anomalies that look like bugs, and what it means for the game loop. Use when the user says "look at my last game / run / round", "analyze run", or asks how red played.
---

# /analyze-run — read a play log the way we've agreed

## Purpose

Every analysis serves one goal: **a fun loop that scales in difficulty until
the player is overwhelmed — but never feels bad.** Like Dr. Mario: each round a
little harder, always readable, so the run ends because the player was finally
outpaced, not because something was unfair, invisible or stupid.

Judge everything against that:
- **Scaling**: does difficulty climb steadily round to round (red's skill, the
  ramp, tempo) — no flat stretches, no cliffs?
- **Overwhelmed in the end**: does the run end by being outpaced (a strong
  player around the mid-teens), not by stalling into long grinds?
- **Never feels bad**: was every loss readable before it happened (could the
  player see the wave turning, the siege coming, the tower crumbling)? Was red's
  win earned, never a bug, a stupid-looking bot moment, or an unseen rule? Did
  the player have an answer available?
- **A round's two acts**: before overtime is out-farming (last hits, trades,
  wave edge); overtime is finding a way to win. Overtime is the expected
  finish — a barely-touched tower at overtime is normal, and a huge late wave
  breaking a tower fast is earned. Flag only early towers crumbling the moment
  one normal wave arrives (IDEAS.md "A round's two acts").
- Recommend the change that best moves the game toward this goal, and say which
  part of it (scaling, the end, or feeling fair) a finding touches.

The game writes a play log per run (`run_<stamp>.jsonl`, one JSON event per
line) in `%APPDATA%/Godot/app_userdata/MOBA Sandbox/playlogs/` (dev runs) or
next to a playtest build's exe in `playlogs/`. What's in it is documented at the
top of `moba-sandbox/scripts/play_log.gd`.

## Steps

1. **Run the analysis script first** — it computes everything the same way every
   time:
   ```
   python moba-sandbox/tools/analyze_log.py              # newest complete run
   python moba-sandbox/tools/analyze_log.py --list       # what's there
   python moba-sandbox/tools/analyze_log.py <stamp>      # a named run
   python moba-sandbox/tools/analyze_log.py --round N    # + one round in detail
   python moba-sandbox/tools/analyze_log.py latest --any # include an unfinished run
   ```
   A run saved and resumed later (Continue) writes one log per sitting (each
   resumed part starts with a `continue` event; all share the run's seed). The
   script stitches them into one run automatically and says so in the header
   ("stitched from N saved sittings"); a round quit mid-way and resumed from
   its start counts from the later try. Report the whole stitched run.
   If the newest log is unfinished (a paused or abandoned round, no
   `round_end`), say so in one line and analyse the newest complete run — unless
   the user clearly meant the unfinished one.
2. **Read the output, then dig** into the raw events only where a question
   needs it (a moment the user mentions, an anomaly, a death). Snapshots come
   4× a second: `you` / `bot` positions, health, red's `why` and `flags`,
   `towers`, `creeps`, `front`, `at_tower`, `totems`.
3. **Report** (sections below), plainly, with the numbers. Lead with the answer
   to what the user asked.

## What to report

- **The run**: hero(es), rounds, result, version (logs from playtest zips name
  their build), whether it's a replay.
- **Per round, the headline metrics** (decided 2026-10-08):
  - **wave** — your creeps minus red's, averaged. The best single sign of who's
    winning: in the reference run it was positive in all 11 wins, negative in the
    one loss. Pushing decides rounds; nobody freezes.
  - **tower race** — both towers over time (Run History charts it).
  - **dmg** — damage you dealt red ÷ damage red dealt you: how fights trend
    (red sharpening shows here before results do).
  - **lh%** — last hits ÷ (last hits + missed): the player's farming, the skill
    they control. A practice metric, not a result metric.
  - Dropped as uninformative: last hits vs red, K/D, low-health time, gold/min.
- **Why each round went that way**: tower damage by source (creeps, heroes,
  siege, how much was overtime's crumble), melts (50% → rubble in seconds), the
  wave at the end, creep kills by killer, siege minions, totems.
- **Red's behaviour and why**: what it spent its time doing, its flags (wary,
  retreat, pressing…), combos and how they ended, cast hit rates, chances it
  passed up and the reasons, deaths (killer, what it was doing), key runs and
  how they ended, totem trips / contests, its damage ledger. Explain the "why"
  from the bot's rules (`moba-sandbox/scripts/bot.gd`, `combo_book.gd`) — read
  the code when the reason isn't obvious.
- **Anomalies** the script flags, checked before calling them bugs: retreat
  failures, off-map aim, key-run freezes, BOOP pokes with no follow-up, decision
  churn, long rounds, unreadable melts.
- **The game loop**: what the run says about the Dr. Mario goal — steady,
  readable escalation the player can answer. Round length creep (tempo), whether
  losses were readable before they happened, how red's difficulty climbed, the
  totem and overtime systems doing their job.

## Rules

- **Report, don't fix**: findings and suggestions only. Fix bugs or tune when
  the user asks (they often say "do both" / "fix them").
- **Personalities are a black box to players**: name red's personality only
  from dev logs (they log it; shipped logs don't), never as something to show
  in the game.
- **Plain language**: descriptions of what happened, numbers included. No meme
  copy. Vary the hero word only in flavour text, never here.
- **Bot mistakes should look human, never stupid**: flag anything that looks
  stupid (standing still being hit, running into a tower, wasting an ability)
  as a likely bug.
- **Autoplay logs are different**: both sides are bots there, so "red_*" events
  can come from blue too; real games have one bot (red).
- **New ideas** that come out of an analysis go in `moba-sandbox/IDEAS.md` when
  the user wants them kept; tuning changes go in `moba-sandbox/BALANCE.md`'s
  change log when made.
- **Keep the script current**: when the play log gains new data, add it to
  `tools/analyze_log.py` and to this skill.
