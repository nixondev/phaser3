#!/usr/bin/env node
/* eslint-disable no-console */
// Create a new WARDEN room: appends a stub to src/data/rooms.json and writes
// a default tilemap to public/assets/tilemaps/<id>.json. PreloadScene already
// auto-registers every room in rooms.json — no source-code edit needed.
//
// Usage:
//   npm run new-room <id> [width] [height]
//
//   id     lowercase letters / digits / dashes, must start with letter or digit
//   width  default 20 (tiles)
//   height default 15 (tiles)

const fs = require('fs');
const path = require('path');

const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const DEFAULT_W = 20;
const DEFAULT_H = 15;
const FLOOR_GID = 3;     // floor tile (matches existing rooms)
const WALL_GID = 2;      // exterior wall (matches existing rooms)
const TILE_PX = 16;      // display tile size, used for spawn coords

const ROOT = path.resolve(__dirname, '..');
const ROOMS_JSON = path.join(ROOT, 'src/data/rooms.json');
const TILEMAPS_DIR = path.join(ROOT, 'public/assets/tilemaps');
const MUSIC_DIR = path.join(ROOT, 'public/music');

function fail(msg) {
  console.error(`new-room: ${msg}`);
  process.exit(1);
}

function usage() {
  console.error('Usage: npm run new-room <id> [width] [height]');
  console.error('  id      lowercase letters / digits / dashes, must start with letter or digit');
  console.error('  width   default 20 tiles');
  console.error('  height  default 15 tiles');
  process.exit(1);
}

// ── parse args ──
const args = process.argv.slice(2);
if (args.length < 1) usage();

const roomId = args[0];
const width = args[1] !== undefined ? parseInt(args[1], 10) : DEFAULT_W;
const height = args[2] !== undefined ? parseInt(args[2], 10) : DEFAULT_H;

if (!ROOM_ID_RE.test(roomId)) fail(`invalid room id "${roomId}" (lowercase, alphanumeric, dashes; must start with letter or digit)`);
if (!Number.isFinite(width) || width < 5 || width > 200) fail(`invalid width "${args[1]}" (5..200)`);
if (!Number.isFinite(height) || height < 5 || height > 200) fail(`invalid height "${args[2]}" (5..200)`);

// ── load rooms.json ──
let roomsRaw;
try {
  roomsRaw = fs.readFileSync(ROOMS_JSON, 'utf8');
} catch (e) {
  fail(`could not read ${ROOMS_JSON}: ${e.message}`);
}

let roomsData;
try {
  roomsData = JSON.parse(roomsRaw);
} catch (e) {
  fail(`rooms.json is not valid JSON: ${e.message}`);
}

if (roomsData.rooms[roomId]) {
  fail(`room "${roomId}" already exists in rooms.json`);
}

// ── prepare tilemap path ──
const tilemapPath = path.join(TILEMAPS_DIR, `${roomId}.json`);
if (fs.existsSync(tilemapPath)) {
  fail(`tilemap already exists at ${path.relative(ROOT, tilemapPath)}`);
}
if (!fs.existsSync(TILEMAPS_DIR)) {
  fail(`tilemaps directory missing: ${path.relative(ROOT, TILEMAPS_DIR)}`);
}

// ── prepare music dir ──
const musicRoomDir = path.join(MUSIC_DIR, roomId);
const musicGitkeep = path.join(musicRoomDir, '.gitkeep');
if (fs.existsSync(musicRoomDir)) {
  fail(`music dir already exists at ${path.relative(ROOT, musicRoomDir)}`);
}
if (!fs.existsSync(MUSIC_DIR)) {
  fail(`music directory missing: ${path.relative(ROOT, MUSIC_DIR)}`);
}

// ── build default tilemap ──
function makeFilledLayer(id, name, fillGid) {
  return {
    id, name,
    type: 'tilelayer',
    visible: true,
    opacity: 1,
    x: 0, y: 0,
    width, height,
    data: new Array(width * height).fill(fillGid)
  };
}

function makeCollisionLayer(id) {
  const data = new Array(width * height).fill(0);
  for (let x = 0; x < width; x++) {
    data[x] = WALL_GID;
    data[(height - 1) * width + x] = WALL_GID;
  }
  for (let y = 0; y < height; y++) {
    data[y * width] = WALL_GID;
    data[y * width + (width - 1)] = WALL_GID;
  }
  return {
    id, name: 'Collision',
    type: 'tilelayer',
    visible: true, opacity: 1,
    x: 0, y: 0,
    width, height,
    data
  };
}

const tilemap = {
  width, height,
  infinite: false,
  orientation: 'orthogonal',
  renderorder: 'right-down',
  tilewidth: 64, tileheight: 64,
  type: 'map',
  version: '1.10',
  tiledversion: '1.10.2',
  nextlayerid: 4,
  nextobjectid: 1,
  layers: [
    makeFilledLayer(1, 'Ground', FLOOR_GID),
    makeCollisionLayer(2),
    makeFilledLayer(3, 'Above', 0)
  ],
  tilesets: [{
    firstgid: 1,
    name: 'tileset',
    tilewidth: 64, tileheight: 64,
    tilecount: 128,
    columns: 8,
    image: 'tileset.png',
    imagewidth: 512, imageheight: 1024,
    margin: 0, spacing: 0
  }]
};

// ── build rooms.json entry ──
const friendlyName = roomId
  .split('-')
  .map(s => s.charAt(0).toUpperCase() + s.slice(1))
  .join(' ');

const spawnX = Math.floor(width / 2) * TILE_PX + Math.floor(TILE_PX / 2);
const spawnY = Math.floor(height / 2) * TILE_PX + Math.floor(TILE_PX / 2);

const newRoom = {
  id: roomId,
  name: friendlyName,
  mapKey: roomId,
  tilemapPath: `assets/tilemaps/${roomId}.json`,
  width, height,
  reverb: 'indoor',
  playerSpawn: { x: spawnX, y: spawnY },
  doors: [],
  interactables: [],
  afflicted: []
};

roomsData.rooms[roomId] = newRoom;

// ── write atomically ──
function atomicWrite(target, contents) {
  const tmp = `${target}.tmp`;
  fs.writeFileSync(tmp, contents, 'utf8');
  fs.renameSync(tmp, target);
}

try {
  atomicWrite(tilemapPath, JSON.stringify(tilemap));
} catch (e) {
  fail(`could not write tilemap: ${e.message}`);
}

try {
  atomicWrite(ROOMS_JSON, JSON.stringify(roomsData, null, 2) + '\n');
} catch (e) {
  // try to clean up the orphan tilemap so the user isn't left in a half-state
  try { fs.unlinkSync(tilemapPath); } catch { /* ignore */ }
  fail(`could not write rooms.json: ${e.message}`);
}

// Create the per-room music directory with a .gitkeep so it's tracked in git
// even though no audio is in it yet. Drop track.mid / instruments.sf2 in here
// later to override the global fallbacks. If this step fails, leave a warning
// rather than rolling back the rest — the room still works with global audio.
try {
  fs.mkdirSync(musicRoomDir, { recursive: true });
  fs.writeFileSync(musicGitkeep, '');
} catch (e) {
  console.warn(`warning: could not create music dir ${path.relative(ROOT, musicRoomDir)}: ${e.message}`);
}

console.log(`Created room "${roomId}" (${width}x${height})`);
console.log(`  - ${path.relative(ROOT, ROOMS_JSON)}  [appended]`);
console.log(`  - ${path.relative(ROOT, tilemapPath)}  [new]`);
console.log(`  - ${path.relative(ROOT, musicRoomDir)}/  [new, with .gitkeep]`);
console.log('');
console.log('Next steps:');
console.log('  1. Reload the dev server (or just refresh the page).');
console.log(`  2. Get into the room by wiring a door from an existing room,`);
console.log(`     or by using F1 + Shift+Click to teleport into the new tilemap.`);
console.log('  3. F2 to enter editor, paint your room, X to copy tilemap JSON,');
console.log(`     paste over public/assets/tilemaps/${roomId}.json.`);
console.log(`  4. (Optional) Drop track.mid and/or instruments.sf2 into`);
console.log(`     public/music/${roomId}/ to override the global audio.`);
