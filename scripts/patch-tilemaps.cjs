#!/usr/bin/env node
/* eslint-disable no-console */
// Ensures every room's Tiled JSON contains the correct tileset entries:
//   • Base tilesets (from rooms.json → baseTilesets) at firstgid 1, 129, 257, …
//   • Room-specific tilesets (from room.tilesets) at firstgid 1 + N_base*128, …
//
// Run after:
//   • Adding a new base tileset PNG
//   • Running create-room-tiles (backfill for existing rooms)
//   • Any time a tilemap is missing a tileset entry
//
// Usage: npm run patch-tilemaps

'use strict';
const fs   = require('fs');
const path = require('path');

const ROOT         = path.resolve(__dirname, '..');
const ROOMS_JSON   = path.join(ROOT, 'src', 'data', 'rooms.json');
const TILE_PX         = 64;
const SHEET_COLS      = 8;
const TILES_PER_SHEET = 128;
const SHEET_W = SHEET_COLS * TILE_PX;
const SHEET_H = (TILES_PER_SHEET / SHEET_COLS) * TILE_PX;

function fail(msg) { console.error(`patch-tilemaps: ${msg}`); process.exit(1); }

let roomsData;
try { roomsData = JSON.parse(fs.readFileSync(ROOMS_JSON, 'utf8')); }
catch (e) { fail(`cannot read rooms.json: ${e.message}`); }

const baseTilesets = roomsData.baseTilesets ?? ['tileset'];
if (!baseTilesets.length) { console.log('patch-tilemaps: baseTilesets is empty, nothing to do.'); process.exit(0); }

// ── helpers ───────────────────────────────────────────────────────────────────
function tilesetEntry(name, firstgid) {
  return {
    columns: SHEET_COLS, firstgid,
    image: `${name}.png`, imageheight: SHEET_H, imagewidth: SHEET_W,
    margin: 0, name, spacing: 0,
    tilecount: TILES_PER_SHEET, tileheight: TILE_PX, tilewidth: TILE_PX,
  };
}

function ensureEntry(tilesets, want, dirty) {
  const existing = tilesets.find(ts => ts.name === want.name);
  if (!existing) {
    const insertAt = tilesets.findIndex(ts => ts.firstgid > want.firstgid);
    if (insertAt === -1) tilesets.push(want); else tilesets.splice(insertAt, 0, want);
    return true;
  }
  if (existing.firstgid !== want.firstgid) { existing.firstgid = want.firstgid; return true; }
  return dirty;
}

function atomicWrite(target, contents) {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, target);
}

// ── process each room ─────────────────────────────────────────────────────────
let patched = 0, skipped = 0;

for (const [, room] of Object.entries(roomsData.rooms)) {
  const tilemapPath = path.join(ROOT, 'public', room.tilemapPath);
  if (!fs.existsSync(tilemapPath)) {
    console.warn(`  skip (missing): ${room.tilemapPath}`);
    skipped++;
    continue;
  }

  let mapData;
  try { mapData = JSON.parse(fs.readFileSync(tilemapPath, 'utf8')); }
  catch (e) { console.warn(`  skip (bad JSON): ${room.tilemapPath} — ${e.message}`); skipped++; continue; }

  const tilesets = mapData.tilesets ?? [];
  let dirty = false;

  // 1. Base tilesets: firstgid = 1, 129, 257, …
  for (let i = 0; i < baseTilesets.length; i++)
    dirty = ensureEntry(tilesets, tilesetEntry(baseTilesets[i], 1 + i * TILES_PER_SHEET), dirty);

  // 2. Room-specific tilesets: firstgid starts right after all base tilesets.
  const roomFirstgid = 1 + baseTilesets.length * TILES_PER_SHEET;
  for (let j = 0; j < (room.tilesets ?? []).length; j++)
    dirty = ensureEntry(tilesets, tilesetEntry(room.tilesets[j], roomFirstgid + j * TILES_PER_SHEET), dirty);

  // Also dirty if array is not sorted by firstgid.
  if (!dirty) {
    for (let i = 1; i < tilesets.length; i++)
      if (tilesets[i].firstgid < tilesets[i-1].firstgid) { dirty = true; break; }
  }

  if (!dirty) { skipped++; continue; }

  mapData.tilesets = tilesets.slice().sort((a, b) => a.firstgid - b.firstgid);
  try {
    atomicWrite(tilemapPath, JSON.stringify(mapData));
    console.log(`  patched: ${room.tilemapPath}`);
    patched++;
  } catch (e) {
    console.warn(`  failed to write ${room.tilemapPath}: ${e.message}`);
    skipped++;
  }
}

console.log(`\npatch-tilemaps: ${patched} patched, ${skipped} skipped.`);
console.log(`Base tilesets: [${baseTilesets.join(', ')}]`);
