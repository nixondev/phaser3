#!/usr/bin/env node
/**
 * Copy the Phaser project's assets + data into godot/shared/ (read-only copies).
 *
 * The Phaser game stays the source of truth: this script only ever READS from
 * the parent project and only ever WRITES inside godot/shared/. Re-run it after
 * editing rooms, tiles or sprites in the Phaser editors.
 *
 *   node godot/tools/sync-shared.cjs
 */
const fs = require('fs');
const path = require('path');

const GODOT = path.resolve(__dirname, '..');
const ROOT = path.resolve(GODOT, '..');
const OUT = path.join(GODOT, 'shared');

const JOBS = [
  { from: 'public/assets/sprites', to: 'sprites', keep: f => f.endsWith('.png') },
  { from: 'public/assets/tilemaps', to: 'tilemaps', keep: f => f.endsWith('.png') || (f.endsWith('.json') && !f.endsWith('.old.json')) },
  { from: 'src/data', to: 'data', keep: f => f.endsWith('.json') },
  { from: 'public/assets/audio', to: 'audio', keep: f => /\.(mp3|ogg|wav)$/.test(f) },
  { from: 'words', to: 'words', keep: () => true, recursive: true },
];

function copyDir(src, dst, keep, recursive) {
  fs.mkdirSync(dst, { recursive: true });
  let n = 0;
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) { if (recursive) n += copyDir(s, d, keep, recursive); }
    else if (keep(e.name)) { fs.copyFileSync(s, d); n++; }
  }
  return n;
}

// Only ever clears godot/shared — never anything in the parent project.
if (path.basename(OUT) !== 'shared' || path.dirname(OUT) !== GODOT) throw new Error('refusing to clear ' + OUT);
fs.rmSync(OUT, { recursive: true, force: true });

for (const job of JOBS) {
  const n = copyDir(path.join(ROOT, job.from), path.join(OUT, job.to), job.keep, job.recursive);
  console.log(`[sync] ${job.from} -> shared/${job.to} (${n} files)`);
}
