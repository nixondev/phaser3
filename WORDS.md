# WORDS.md — the prose system

All player-facing writing in WARDEN lives in `words/` as **Twee 3** plain-text
files, parsed at build time by `src/systems/Words.ts`. Writing happens in a
text file that reads like writing — never inside a JSON node.

Companion docs: `CLAUDE.md` (short summary), `AUTHORING.md`, `PARADIGM.md`.

---

## Design

- **Prose in files, logic in data.** Selection metadata (who/where/when,
  requires, priorities) stays in `src/data/*.json`. The writing itself lives
  in `words/`. The two meet through keys.
- **Passage name = global key.** Files are organization, passage names are
  identity. Move passages between files freely; keys don't change.
- **Zero registration.** The whole directory is bundled via
  `import.meta.glob` — creating a file is all it takes. Hot reload works in
  dev.
- **Fail soft, fail loud.** A missing key never crashes: it shows
  `[missing words: <key>]` in-game and warns in the console. Duplicate
  passage names warn in dev (last one wins).

---

## Format (Twee 3)

```twee
:: thoughts/protag-house-first [thought]
Three days since the sirens stopped.
Nobody came for us. Nobody is coming.
Whoever is left out there — that part falls to me now.
```

- `::` at the start of a line begins a passage; everything up to the next
  `::` is its body.
- The passage name is the **key** — unique across *all* files.
- `[tags]` are optional and purely organizational for now (the condition
  convention below will use them later).
- The body is just writing: no quoting, no escaping, no `\n`, no commas.
- One line of the file = one displayed line. Keep lines short.
- Interior blank lines are preserved (beats inside a page); leading and
  trailing blank lines are trimmed.
- `StoryTitle`, `StoryData`, and `Start` passages are ignored (Twee
  structural passages, not game prose).

### Pagination

A `---` alone on a line is an **explicit page break — everywhere** (dialog
box and document reader). That's the intended authoring tool: you decide
where pages turn. The automatic split at **10 lines** per page is only a
safety net for unbroken text.

- Dialog box: `GameScene.paginateText`
- Document reader: `DocumentReaderScene.splitPages`

---

## Key namespaces

| Prefix | Used for | How it's wired |
|--------|----------|----------------|
| `thoughts/<id>` | Introspection entries | Looked up **automatically** by the `id` in `src/data/thoughts.json` |
| `documents/<slug>` | Readable items (`category: "document"`) | `words:` ref in the item's `content` |
| `dialog/<character>/<slug>` | Character speech, backstory pages | `words:` ref in `backstory` etc. |

New namespaces are free — they're just naming convention, nothing to
register.

---

## Referencing from rooms.json

Any authored text field may hold a reference instead of literal prose:

```json
"content": "words:documents/supply-manifest"
```

```json
"backstory": [
  "words:dialog/kai/backstory-1",
  "words:dialog/kai/backstory-2",
  "words:dialog/kai/backstory-3"
]
```

Refs resolve **at display time** in exactly two places —
`GameScene.openDialog` and `DocumentReaderScene` — so every field that ends
up on screen supports them (`text`, `content`, `backstory` pages,
`lockedMessage`, …) with no per-field wiring. Literal prose in those fields
still works; migration is opt-in per field.

Because the same key can be referenced from multiple places (e.g. an
afflicted duplicated across spawn room and `associatedRoom`), prose is
never duplicated in data.

---

## Thoughts

`src/data/thoughts.json` holds only selection metadata (WHO/WHERE/WHEN,
`priority`, `repeat`). At load, `ThoughtManager` resolves each entry's prose
from passage `thoughts/<id>`:

```json
{ "id": "protag-house-first", "character": "player",
  "room": "protag-house", "priority": 10, "repeat": "never" }
```

```twee
:: thoughts/protag-house-first [thought]
Three days since the sirens stopped.
```

An inline `lines` array in the JSON still wins if present (escape hatch;
prefer the words file).

---

## Conversations — the speaker×listener layer

**Built.** Recovered residents live in the world as **parked roster
bodies** — pressing E near one *talks* to them (click still switches into
them). E plays the best entry from `src/data/conversations.json`, selected
by (this NPC, active character, world state) — the third application of the
thoughts selection pattern.

```json
{ "id": "kai/to-player-first",
  "npc": "kai",
  "requires": [{ "type": "character", "value": "player" }],
  "produces": [{ "type": "setFlag", "value": "kai/heard-your-voice" }],
  "priority": 10,
  "repeat": "never",
  "text": "words:dialog/kai/to-player-first" }
```

- **Selection** (`src/systems/ConversationManager.ts`): pool = the NPC's
  entries whose `requires`/`requiresAny` pass, minus read `never` entries;
  unread beats read, then highest `priority`, ties by file order. No entry →
  the stock solo line.
- **Speaker gating is ordinary condition grammar** — `character`, `trait`,
  `flag`, `characterPresent`, … in `requires`. No dedicated speaker fields.
- **`produces` fires once**, the first time the entry is opened (guarded by
  the read set). Talk can set flags that ungate other talks — the web of
  conversation grows from flat linear pieces.
- **`repeat`** works like thoughts: `never` / `silent` / `notify`.
- **`?` glyph** floats over any recovered resident with an unheard entry for
  the *current* character (override per entry with `glyph`). It re-lights on
  character switch — this is how players discover the pairing mechanic.
- **Precedence** on E: partner conversation (`conversationRequires` /
  `conversationDialog`, legacy path on recovered afflicted entities) → this
  layer → stock "I'm ready when you are." line.
- The passage is **linear**; `---` breaks pages. By design there are no
  choices, no stages inside an entry (evolving relationships = several
  flag-gated entries), no attribution machinery, no mid-talk events.

### Flag hygiene

- Namespace flags like paths: `kai/heard-your-voice`, `generator/powered`.
- Dev startup runs `src/systems/FlagAudit.ts`: warns on flags checked but
  never set (a gate that can never open) and set but never checked (dead
  weight) across rooms.json + conversations.json.
- The F1 debug HUD shows all currently-set world flags.

---

## Engine internals (`src/systems/Words.ts`)

```ts
getText(key): string        // passage text, or "[missing words: key]"
getLines(key): string[]     // getText split on newlines
getPassage(key)             // { key, tags, text, links } | undefined
hasWords(key): boolean
resolveText(text): string   // "words:<key>" → getText(key); else pass-through
```

- Registry built once at module load from `import.meta.glob('/words/**/*.twee')`.
- Dev console logs `[words] N passages from M twee files` at startup.
- `\r\n` normalized, so files written on Windows are fine.
- Resolution points: `GameScene.openDialog` (all dialog),
  `DocumentReaderScene.create` (documents), `ThoughtManager` (thoughts, at
  load).

---

## Branching dialog — parsed, not yet traversed

Standard Twine link syntax is parsed off the display text and stored as
structured data on the passage:

```twee
:: dialog/example/gate-warden [dialog example]
The old gate warden doesn't look up from the ledger.
"Nobody crosses. Not since the sealing."

[[Ask about the sealing->dialog/example/sealing]]
[[Show the lab keycard->dialog/example/keycard]]
[[Leave->dialog/example/leave]]
```

All four link forms work: `[[label->target]]`, `[[target<-label]]`,
`[[label|target]]`, `[[target]]`. Lines that are nothing but link markup are
dropped from the displayed text; `WordsPassage.links` keeps `{label, target}`.

**The engine does not follow links yet.** Trees written now become playable
when a dialog runner lands. See `words/dialog/example-branching.twee` for
the intended shape.

### Runner design (agreed, not built)

- When a dialog passage has links: render text + choice list; Up/Down moves
  a cursor, E confirms (choosing *is* the interaction — one-verb E holds).
  Jump to the chosen target; repeat until a link-less (terminal) passage,
  which behaves like today's dialog.
- Entry point: a field like `"conversationTree": "dialog/<char>/<slug>"` on
  the NPC in `rooms.json`. Existing linear `backstory` / `conversation`
  arrays keep working unchanged.
- **Conditional choices**: a `requires:` tag on the *target* passage, e.g.
  `[dialog requires:item:lab-keycard]` — the runner filters links whose
  target has unmet requirements, evaluated through the existing
  `RequireCondition` grammar / `InteractionResolver`, so conditions mean
  the same thing everywhere.
- **Effects** (`produces:` tag on terminal passages) deferred until a real
  conversation needs one.
- Deliberately not yet: visited-state tracking, mid-tree game events,
  interleaved character switching. Stateless traversal first.

---

## Twine round-trip (optional)

The files are standard Twee 3, so [tweego](https://www.motoslave.net/tweego/)
or [extwee](https://github.com/videlais/extwee) can compile them into a
Twine HTML story — useful for the visual node graph once conversations get
tangled — and decompile back:

```bash
tweego -o story.html words/        # open in Twine / browser to view & edit
tweego -d story.html -o out.twee   # back to twee text
```

The `.twee` files in git remain the source of truth; Twine is a viewport.

---

## Current inventory

| File | Passages |
|------|----------|
| `words/thoughts/protag-house.twee` | 3 protag-house thoughts |
| `words/documents/found-writing.twee` | `supply-manifest`, `your-notes`, `neighbors-note`, `wardens-log` |
| `words/dialog/kai.twee` | Kai backstory pages 1–3 |
| `words/dialog/maren.twee` | Maren backstory pages 1–3 |
| `words/dialog/example-branching.twee` | Gate-warden branching example (4 passages, not wired to any NPC) |

17 passages total (startup log confirms the count).

---

## Adding writing — checklist

1. Open (or create) a `.twee` file under the right namespace directory.
2. Write: `:: <namespace>/<slug>` then the prose. That's it for thoughts
   (if the passage is `thoughts/<id>` for an existing thoughts.json entry).
3. For documents / dialog: point the field in `rooms.json` at it —
   `"content": "words:documents/<slug>"`.
4. Check the dev console on reload: passage count went up, no
   `[words]` warnings.
