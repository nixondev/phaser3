---
name: cards
description: Build the moba-sandbox shop card requests the user wrote in the in-game Cards view (moba-sandbox/cards/requests.json) — new cards and edits to live cards, in plain words.
---

# /cards — build the card requests

The user adds and edits shop cards in plain words in the game's **Cards** view
(hero select → Cards, dev builds run from the project). Each one is a request in
`moba-sandbox/cards/requests.json` (schema at the top of
`moba-sandbox/scripts/card_requests.gd`). Your job: build every open request.

## Steps

1. Read `moba-sandbox/cards/requests.json`. Work on requests with
   `"status": "requested"` only (`needs_info` waits for the user's edit, which
   flips it back to `requested`; `live` / `removed` / `rejected` are history).
   None open → say so and stop.
2. Read `moba-sandbox/scripts/upgrades.gd` (the live cards, `LIST`, tiers and
   prices) and the mod keys `hero.gd` reads via `hero.mod("<key>")`.
3. For each request:
   - **`kind: "add"`** — design the card from the plain text:
     - `id` (snake_case), `name` (the user's if given, else pick a short one,
       Title Case like the others), `tier` (theirs, else by strength: common =
       a small stat, rare = strong stat / economy, epic = a unique mechanic, one
       per run; `wave` = a creep upgrade with its own `price` and `max`),
       `price` only if they gave one or it's a wave card.
     - `text`: the shop line — **plain description of what it does, numbers
       included, no flavour or advice** (the player interprets).
     - `mods`: reuse existing mod keys when they fit. A new mechanic → add a new
       mod key and implement it where it belongs (hero.gd / unit.gd / bot.gd /
       lane.gd / creep.gd), documenting it in the mod-key list at the top of
       `upgrades.gd`. Follow the visual-cue standard (one colour per status, on
       the zone and the unit; rings nested round the unit — `unit.gd`).
     - Pick numbers that sit beside the existing cards of that tier.
     - Add it to `Upgrades.LIST` in its tier block. Do **not** add it to red's
       `RED_PRIORITY` lists (run.gd) — say in the summary that red doesn't buy
       it yet.
   - **`kind: "edit"`** — change live card `card`: apply any non-empty `name`,
     `tier`, nonzero `price`, and interpret `request` (a new description, a
     number change, an added effect, or "remove it" → take it out of LIST and
     every reference, status `removed`). Keep its `id` (play logs and red's
     lists key on it).
   - **Can't build it as written** (contradictory, too vague to pick a
     mechanic, or would break a locked rule) → don't guess: set
     `"status": "needs_info"` and put one short question in `note`.
   - **Shouldn't build it** (duplicates a live card exactly, or the user asked
     for something against a standing rule) → `"status": "rejected"` with the
     reason in `note`.
4. Mark each built request `"status": "live"`, set `card` to the card's id, and
   write `note`: one line — what was built and the numbers chosen (e.g.
   "Chill Aura (rare 250): enemies within 300 attack 15% slower"). Write the
   JSON back (2-space indent, keep every request — it's the history).
5. Docs: add / update the card in `moba-sandbox/BALANCE.md` section 6 (the
   card tables) and add a change-log line (dated) listing what was built.
6. Parse-check every touched script:
   `"/c/Program Files (x86)/Steam/steamapps/common/Godot Engine/godot.windows.opt.tools.64.exe" --headless --path moba-sandbox --check-only --script res://scripts/<file>.gd`
   (ignore "resources still in use"). No other tests — the user playtests.
7. Report: a short table — request → card (tier, price, shop text) → status,
   any questions asked, and "red doesn't buy new cards yet" if any were added.

## Rules

- Live cards live in code (`upgrades.gd`); the JSON is only requests. Never
  make the game read the JSON.
- Don't commit. Don't change cards nobody asked about (point out a problem you
  notice instead).
- Ability / hero names come from constants in `heroes.gd` — use them in code.
- `scripts/card_switches.gd` (`OFF`) is the user's On / Off switches from the
  Cards view: a switched-off card stays in `LIST` but is never offered. Leave
  it alone unless a request asks; an edit to an off card keeps it off.
