/**
 * Words — prose registry for all player-facing writing (Twee 3 format).
 *
 * Source of truth: every .twee file under words/, bundled at build time via
 * import.meta.glob (adding a file requires no registration). A passage's
 * name is its global key:
 *
 *   :: thoughts/protag-house-first [thought]
 *   Three days since the sirens stopped.
 *
 * Consumption:
 *   - Any authored text field (rooms.json `content`, `text`, backstory
 *     pages, …) may hold "words:<key>" instead of literal prose; refs are
 *     resolved at display time in GameScene.openDialog and
 *     DocumentReaderScene via resolveText().
 *   - thoughts.json omits `lines`; ThoughtManager looks up `thoughts/<id>`.
 *   - [[label->target]] links are parsed off the display text and kept on
 *     the passage for a future branching-dialog runner.
 *
 * Missing key → dev console warning + visible in-game placeholder, never
 * a crash. Conventions and Twine round-trip: words/README.md.
 */

export interface WordsLink {
  label: string;
  target: string;
}

export interface WordsPassage {
  key: string;
  tags: string[];
  /** Body with [[link]] markup removed and outer blank lines trimmed. */
  text: string;
  links: WordsLink[];
}

/** Twee structural passages that are metadata, not game prose. */
const SPECIAL_PASSAGES = new Set(['StoryTitle', 'StoryData', 'Start']);

/** `:: Passage Name [optional tags] {"optional":"metadata"}` */
const HEADER_RE = /^::\s*(.+?)\s*(?:\[(.*?)\])?\s*(?:\{.*\})?\s*$/;

const REF_PREFIX = 'words:';

const files = import.meta.glob('/words/**/*.twee', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

const registry = new Map<string, WordsPassage>();

/** [[label->target]] · [[target<-label]] · [[label|target]] · [[target]] */
function parseLink(inner: string): WordsLink {
  const arrow = inner.match(/^(.*?)->(.*)$/);
  if (arrow) return { label: arrow[1].trim(), target: arrow[2].trim() };
  const back = inner.match(/^(.*?)<-(.*)$/);
  if (back) return { label: back[2].trim(), target: back[1].trim() };
  const pipe = inner.match(/^(.*?)\|(.*)$/);
  if (pipe) return { label: pipe[1].trim(), target: pipe[2].trim() };
  return { label: inner.trim(), target: inner.trim() };
}

function buildPassage(key: string, tags: string[], body: string[]): WordsPassage {
  const links: WordsLink[] = [];
  const cleaned: string[] = [];
  for (const raw of body) {
    const stripped = raw.replace(/\[\[(.+?)\]\]/g, (_m, inner: string) => {
      links.push(parseLink(inner));
      return '';
    });
    // Drop lines that were nothing but link markup.
    if (stripped.trim() === '' && raw.trim() !== '') continue;
    cleaned.push(stripped);
  }
  while (cleaned.length && cleaned[0].trim() === '') cleaned.shift();
  while (cleaned.length && cleaned[cleaned.length - 1].trim() === '') cleaned.pop();
  return { key, tags, text: cleaned.join('\n'), links };
}

function parseTwee(source: string, file: string): void {
  let key: string | null = null;
  let tags: string[] = [];
  let body: string[] = [];

  const flush = (): void => {
    if (key !== null && !SPECIAL_PASSAGES.has(key)) {
      if (registry.has(key) && import.meta.env.DEV) {
        console.warn(`[words] duplicate passage "${key}" in ${file} overwrites earlier definition`);
      }
      registry.set(key, buildPassage(key, tags, body));
    }
    key = null;
    tags = [];
    body = [];
  };

  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    const header = line.startsWith('::') ? line.match(HEADER_RE) : null;
    if (header) {
      flush();
      key = header[1];
      tags = (header[2] ?? '').split(/\s+/).filter(Boolean);
    } else if (key !== null) {
      body.push(line);
    }
  }
  flush();
}

for (const [file, source] of Object.entries(files)) parseTwee(source, file);

if (import.meta.env.DEV) {
  console.info(`[words] ${registry.size} passages from ${Object.keys(files).length} twee files`);
}

export function hasWords(key: string): boolean {
  return registry.has(key);
}

export function getPassage(key: string): WordsPassage | undefined {
  return registry.get(key);
}

/** Passage text, or a loud in-game placeholder when the key has no file. */
export function getText(key: string): string {
  const passage = registry.get(key);
  if (!passage) {
    console.warn(`[words] missing passage "${key}"`);
    return `[missing words: ${key}]`;
  }
  return passage.text;
}

export function getLines(key: string): string[] {
  return getText(key).split('\n');
}

/** Authored text may be literal prose or a "words:<key>" reference. */
export function resolveText(text: string): string {
  return text.startsWith(REF_PREFIX) ? getText(text.slice(REF_PREFIX.length).trim()) : text;
}
