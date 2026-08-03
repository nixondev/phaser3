#!/usr/bin/env node
/* eslint-disable no-console */
// Create a shaded copy of a character spritesheet — a fixed overhead-ish key
// light from the top left, baked in, to give flat pixel art some depth.
//
//   public/assets/sprites/<name>.png  →  public/assets/sprites/<name>-shaded.png
//
// The original is never modified. Shade a sheet once its art is finished;
// re-run any time to replace the shaded copy.
//
// The `$` sprite editor's SHADE button does exactly this for the open sheet,
// through the same `scripts/lib/shade.mjs` — this is the batch entry point.
//
// Usage:
//   npm run bake-depth -- old-man-2
//   npm run bake-depth -- --all
//   npm run bake-depth -- old-man-2 --strength 1.0 --blur 10
//
// Options — every numeric key of DEFAULTS in scripts/lib/shade.mjs is a flag
// (see that file for full explanations and current default values):
//   --strength N  contrast          --volume N   whole-body dome weight
//   --blur N      dome radius, px   --parts N    per-outline-region dome weight
//   --falloff N   taper steepness   --detail N   art-grain texture in the ramp
//   --steps N     tone band size    --hue N      cool shadows / warm highlights
//   --dither N    band dithering    --floor N    darkest multiplier allowed
//   --frame N     cell size, px     --ceiling N  brightest multiplier allowed
//   --palette 1   snap output to the sheet's own colours
//   --dir x,y,z   light direction, screen coords, +y is UP

'use strict';
const fs   = require('fs');
const path = require('path');
const { encodePNG, decodePNG } = require('./lib/png.cjs');
// shade.mjs is ESM (it is shared verbatim with the browser); pull it in via
// dynamic import and run the rest of the script inside that promise.
const shadeLib = import('./lib/shade.mjs');

const ROOT       = path.resolve(__dirname, '..');
const SPRITE_DIR = path.join(ROOT, 'public', 'assets', 'sprites');
const SHEET_PX   = 256; // character sheets; --all only touches these

async function main({ shadeSheet, isDerivedSheet, SHADED_SUFFIX, DEFAULTS }) {
// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
// Every numeric option of the shader is a CLI flag automatically, so this
// file can't drift out of sync when the lib grows a parameter.
const opts = {};
for (const [k, v] of Object.entries(DEFAULTS)) {
  if (typeof v === 'number') opts[k] = v;
}
let palette = DEFAULTS.palette;
let dir = [...DEFAULTS.dir];
let all = false;
const sheets = [];
const fromAll = new Set();

for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--all') { all = true; continue; }
  if (a === '--dir') { dir = argv[++i].split(',').map(Number); continue; }
  if (a === '--palette') { palette = Number(argv[++i]) !== 0; continue; }
  if (a.startsWith('--')) {
    const key = a.slice(2);
    if (!(key in opts)) { console.error(`Unknown option --${key}`); process.exit(1); }
    const val = Number(argv[++i]);
    if (!Number.isFinite(val)) { console.error(`--${key} needs a number`); process.exit(1); }
    opts[key] = val;
    continue;
  }
  sheets.push(a.replace(/\.png$/i, ''));
}

if (dir.length !== 3 || dir.some(n => !Number.isFinite(n))) {
  console.error('--dir needs three numbers, e.g. --dir -0.5,1,0.9');
  process.exit(1);
}

if (all) {
  for (const f of fs.readdirSync(SPRITE_DIR)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    const name = f.slice(0, -4);
    if (isDerivedSheet(name)) continue;
    if (!sheets.includes(name)) { sheets.push(name); fromAll.add(name); }
  }
}

if (sheets.length === 0) {
  console.error('Usage: npm run bake-depth -- <sheet> [sheet…] [--all] [--strength N] [--blur N]');
  process.exit(1);
}

// ── build ────────────────────────────────────────────────────────────────────
console.log(`dir ${dir.join(',')}  ` + Object.entries(opts)
  .filter(([k]) => k !== 'frame')
  .map(([k, v]) => `${k} ${v}`).join('  ') + `  palette ${palette ? 1 : 0}`);

let built = 0;
for (const sheet of sheets) {
  if (isDerivedSheet(sheet)) {
    console.error(`  skip ${sheet} — that's a derived sheet, shade the original instead`);
    continue;
  }

  const src = path.join(SPRITE_DIR, `${sheet}.png`);
  if (!fs.existsSync(src)) { console.error(`  skip ${sheet} — no such file`); continue; }

  let img;
  try { img = decodePNG(fs.readFileSync(src)); }
  catch (e) { console.error(`  skip ${sheet} — ${e.message}`); continue; }

  // --all is a blanket sweep, so restrict it to real character sheets; naming
  // a sheet explicitly still shades whatever size it happens to be.
  if (fromAll.has(sheet) && (img.width !== SHEET_PX || img.height !== SHEET_PX)) continue;

  let frames;
  try {
    frames = shadeSheet(img.pixels, img.width, img.height, { ...opts, dir, palette });
  } catch (e) {
    console.error(`  skip ${sheet} — ${e.message}`);
    continue;
  }

  fs.writeFileSync(path.join(SPRITE_DIR, `${sheet}${SHADED_SUFFIX}.png`),
                   encodePNG(img.width, img.height, img.pixels));
  console.log(`  ${sheet}${SHADED_SUFFIX}.png  ${frames} frames`);
  built++;
}

console.log(`\n${built} shaded sheet${built === 1 ? '' : 's'} written. Originals untouched.`);
}

shadeLib.then(main).catch(e => { console.error(e); process.exit(1); });
