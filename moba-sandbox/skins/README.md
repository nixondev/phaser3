# Skins

One painted sheet replaces the shapes the game draws (`scripts/skin.gd`).
Drawing only: collisions, hits and ranges never change.

## Making a skin

1. Start from `template.png` (1024 × 1024: a 4 × 4 grid of 256 px cells).
   Regenerate it any time with
   `godot --headless --path . --script res://tools/skin_template.gd`.
2. Paint over each cell. Every cell shows today's shape as a placeholder, plus
   guides in pure magenta (#FF00FF):
   - **the guide circle** = the unit's size in game (its radius). Keep the
     body roughly inside it; details (arms, spikes) may poke out.
   - **the arrow** = which way the art faces: **right**. Heroes, creeps and
     siege minions turn to face where they're going; towers and totems don't
     turn.
3. Save it as `skin.png`:
   - **next to the game's .exe, in `skins/skin.png`**: swap skins without
     rebuilding (exported builds);
   - or here, `skins/skin.png` in the project (dev runs, and packed into
     builds).

## Rules

- Transparent background. Clean alpha: fully opaque or fully transparent pixels.
- Pure magenta (#FF00FF) counts as transparent, so leftover guide lines never
  show. Don't use it in the art.
- A cell left empty (fully transparent) keeps today's shape for that thing, so
  you can skin one cell at a time.
- No `skin.png`: the game looks exactly as it does without skins.
- Team rings, shadows, the hit flash, health bars and status rings still draw
  on top of the art.

## The cells (left to right, top to bottom)

| Row | 1 | 2 | 3 | 4 |
|---|---|---|---|---|
| 1 | KYLE | CHAD | KAREN | BECKY |
| 2 | blue melee creep | blue ranged creep | blue tank creep | blue tower |
| 3 | red melee creep | red ranged creep | red tank creep | red tower |
| 4 | blue siege minion | red siege minion | blue totem | red totem |
