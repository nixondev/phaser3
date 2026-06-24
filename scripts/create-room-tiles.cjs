#!/usr/bin/env node
/* eslint-disable no-console */
// Creates a blank per-room tileset PNG for every room in rooms.json that
// doesn't already have one, and registers it in rooms.json under
// room.tilesets. Also calls patch-tilemaps logic to ensure all base
// tilesets appear in every tilemap JSON.
//
// Usage:
//   npm run create-room-tiles
//
// Safe to run repeatedly — skips rooms that already have a tileset entry.

'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT         = path.resolve(__dirname, '..');
const ROOMS_JSON   = path.join(ROOT, 'src/data/rooms.json');
const TILEMAPS_DIR = path.join(ROOT, 'public/assets/tilemaps');
const TILE_PX      = 64;
const SHEET_COLS   = 8;
const TILES_PER_SHEET = 128;
const SHEET_W = SHEET_COLS * TILE_PX;
const SHEET_H = (TILES_PER_SHEET / SHEET_COLS) * TILE_PX;

function fail(msg) { console.error(`create-room-tiles: ${msg}`); process.exit(1); }

// ── minimal PNG encoder ────────────────────────────────────────────────────
function crc32(buf) {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = t[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c = Buffer.allocUnsafe(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
function blankPNG(w, h) {
  // All-transparent RGBA PNG. Each row: 1 filter byte + w*4 zeros.
  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(h * rowBytes, 0); // filter=0, all pixels transparent
  const compressed = zlib.deflateSync(raw);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit depth, RGBA
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── load rooms.json ────────────────────────────────────────────────────────
let roomsData;
try { roomsData = JSON.parse(fs.readFileSync(ROOMS_JSON, 'utf8')); }
catch (e) { fail(`cannot read rooms.json: ${e.message}`); }

const baseTilesets = roomsData.baseTilesets ?? ['tileset'];

function atomicWrite(target, contents) {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, contents);
  fs.renameSync(tmp, target);
}

// ── process rooms ──────────────────────────────────────────────────────────
let created = 0, skipped = 0;
let roomsDirty = false;

for (const [roomId, room] of Object.entries(roomsData.rooms)) {
  const tsName = `${roomId}-tiles`;
  const tsPng  = path.join(TILEMAPS_DIR, `${tsName}.png`);

  if (room.tilesets && room.tilesets.length > 0) {
    skipped++;
    continue;
  }

  // Create blank PNG if it doesn't exist yet.
  if (!fs.existsSync(tsPng)) {
    try {
      atomicWrite(tsPng, blankPNG(SHEET_W, SHEET_H));
      console.log(`  created: ${path.relative(ROOT, tsPng)}`);
    } catch (e) {
      console.warn(`  failed to write ${path.relative(ROOT, tsPng)}: ${e.message}`);
      skipped++;
      continue;
    }
  } else {
    console.log(`  exists:  ${path.relative(ROOT, tsPng)}`);
  }

  // Register in rooms.json.
  room.tilesets = [tsName];
  roomsDirty = true;
  created++;
}

if (roomsDirty) {
  try {
    atomicWrite(ROOMS_JSON, JSON.stringify(roomsData, null, 2) + '\n');
    console.log(`\nupdated: src/data/rooms.json`);
  } catch (e) { fail(`cannot write rooms.json: ${e.message}`); }
}

console.log(`\ncreate-room-tiles: ${created} created, ${skipped} skipped.`);
if (created > 0) {
  console.log('\nNow run:  npm run patch-tilemaps');
  console.log('to register base tilesets in the new room tilemap JSONs.');
}

// ── also patch all tilemap JSONs (base + room-specific tilesets) ─────────────
console.log('\nPatching tilemap JSONs...');

function tilesetEntry(name, firstgid) {
  return {
    columns: SHEET_COLS, firstgid,
    image: `${name}.png`, imageheight: SHEET_H, imagewidth: SHEET_W,
    margin: 0, name, spacing: 0, tilecount: TILES_PER_SHEET,
    tileheight: TILE_PX, tilewidth: TILE_PX,
  };
}
function ensureEntry(tilesets, want) {
  const existing = tilesets.find(ts => ts.name === want.name);
  if (!existing) {
    const at = tilesets.findIndex(ts => ts.firstgid > want.firstgid);
    if (at === -1) tilesets.push(want); else tilesets.splice(at, 0, want);
    return true;
  }
  if (existing.firstgid !== want.firstgid) { existing.firstgid = want.firstgid; return true; }
  return false;
}

const roomFirstgidBase = 1 + baseTilesets.length * TILES_PER_SHEET;
let tilemapPatched = 0;
for (const [, room] of Object.entries(roomsData.rooms)) {
  const tilemapPath = path.join(ROOT, 'public', room.tilemapPath);
  if (!fs.existsSync(tilemapPath)) continue;
  let mapData;
  try { mapData = JSON.parse(fs.readFileSync(tilemapPath, 'utf8')); }
  catch { continue; }

  const tilesets = mapData.tilesets ?? [];
  let dirty = false;
  for (let i = 0; i < baseTilesets.length; i++)
    if (ensureEntry(tilesets, tilesetEntry(baseTilesets[i], 1 + i * TILES_PER_SHEET))) dirty = true;
  for (let j = 0; j < (room.tilesets ?? []).length; j++)
    if (ensureEntry(tilesets, tilesetEntry(room.tilesets[j], roomFirstgidBase + j * TILES_PER_SHEET))) dirty = true;

  if (!dirty) continue;
  mapData.tilesets = tilesets;
  try {
    atomicWrite(tilemapPath, JSON.stringify(mapData));
    console.log(`  patched: ${room.tilemapPath}`);
    tilemapPatched++;
  } catch { /* non-fatal */ }
}

if (tilemapPatched > 0) console.log(`  ${tilemapPatched} tilemap(s) patched.`);
else console.log('  All tilemap JSONs already up to date.');
