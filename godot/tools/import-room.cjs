#!/usr/bin/env node
/**
 * Import one Phaser room into an editable Godot scene.
 *
 *   node godot/tools/import-room.cjs <room-id> [--force]
 *
 * Runs Godot headless three times: import_room.gd `prepare` (copy art into
 * godot/art/), `--import` (so the copies become Godot resources), then
 * import_room.gd `build` (TileSet + scenes/rooms/<id>.tscn).
 *
 * Reads godot/shared/ — run sync-shared.cjs first. Refuses to overwrite an
 * existing room scene without --force (that would discard Godot-side edits).
 * Godot executable: $GODOT, else the Steam install path.
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const GODOT = process.env.GODOT
  || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Godot Engine\\godot.windows.opt.tools.64.exe';
const PROJECT = path.resolve(__dirname, '..');

const [roomId, ...rest] = process.argv.slice(2);
if (!roomId) {
  console.error('usage: node godot/tools/import-room.cjs <room-id> [--force]');
  process.exit(2);
}
const flags = rest.includes('--force') ? ['--force'] : [];

function godot(args, label) {
  console.log(`[import-room] ${label}`);
  const r = spawnSync(GODOT, ['--headless', '--path', PROJECT, ...args], { stdio: 'inherit' });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    console.error(`[import-room] ${label} failed (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

godot(['--script', 'res://tools/import_room.gd', '--', 'prepare', roomId, ...flags], 'prepare: copying art');
godot(['--import'], 'importing art into Godot');
const scene = path.join(PROJECT, 'scenes', 'rooms', `${roomId}.tscn`);
const before = fs.existsSync(scene) ? fs.statSync(scene).mtimeMs : 0;
godot(['--script', 'res://tools/import_room.gd', '--', 'build', roomId, ...flags], 'build: tileset + scene');
// Godot exits 0 even when the script fails to compile — trust the file, not the exit code.
if (!fs.existsSync(scene) || fs.statSync(scene).mtimeMs <= before) {
  console.error(`[import-room] build failed: ${scene} was not written (see errors above)`);
  process.exit(1);
}
console.log(`[import-room] done -> godot/scenes/rooms/${roomId}.tscn`);
