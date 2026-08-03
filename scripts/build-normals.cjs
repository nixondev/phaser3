#!/usr/bin/env node
/* eslint-disable no-console */
// Generate normal maps for 256×256 character spritesheets, for Phaser's
// Light2D pipeline. This is the offline half of the lighting spike — it does
// what GIMP's "Normal Map" / bump-map step does, but per animation frame and
// without leaving the repo.
//
//   public/assets/sprites/<name>.png  →  public/assets/sprites/<name>_n.png
//
// Height field = a blurred silhouette (rounds the sprite off at its edges,
// which is what makes a flat pixel character read as having volume) plus a
// weaker luminance term (keeps folds, straps and faces from going smooth).
// Sobel over that height field gives the normal.
//
// Every 64×64 frame cell is processed in isolation — sampling never crosses a
// cell boundary, or frame 3's shading would bleed into frame 4.
//
// Usage:
//   node scripts/build-normals.cjs old-man
//   node scripts/build-normals.cjs old-man player-good --strength 8
//   node scripts/build-normals.cjs --all
//
// Options (all optional):
//   --strength N  normal tilt; higher = more pronounced relief   (default 6)
//   --blur N      box-blur passes over the silhouette            (default 4)
//   --bevel N     weight of the silhouette term        0..1      (default 1.0)
//   --detail N    weight of the luminance term         0..1      (default 0.25)
//   --frame N     frame size in px                               (default 64)

'use strict';
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT       = path.resolve(__dirname, '..');
const SPRITE_DIR = path.join(ROOT, 'public', 'assets', 'sprites');
const NORMAL_SUFFIX = '_n';

// ── PNG helpers (same implementation as build-tiles.cjs) ─────────────────────
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
function makeChunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td  = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const c   = Buffer.allocUnsafe(4); c.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, c]);
}
function encodePNG(w, h, pixels) {
  const rowBytes = 1 + w * 4;
  const raw = Buffer.alloc(h * rowBytes);
  for (let y = 0; y < h; y++) {
    raw[y * rowBytes] = 0; // filter byte
    for (let x = 0; x < w; x++) {
      const si = (y * w + x) * 4;
      const di = y * rowBytes + 1 + x * 4;
      raw[di] = pixels[si]; raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2]; raw[di+3] = pixels[si+3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137,80,78,71,13,10,26,10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}
function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('Not a PNG');
  let pos = 8, width, height, idatBufs = [], palette = null, trns = null;
  while (pos < buffer.length) {
    const len  = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width  = buffer.readUInt32BE(pos + 8);
      height = buffer.readUInt32BE(pos + 12);
      const ct = buffer[pos + 17];
      if (ct !== 6 && ct !== 3)
        throw new Error(`Unsupported PNG color type ${ct} (need RGBA=6 or Indexed=3)`);
    } else if (type === 'PLTE') { palette = buffer.slice(pos+8, pos+8+len); }
      else if (type === 'tRNS') { trns    = buffer.slice(pos+8, pos+8+len); }
      else if (type === 'IDAT') { idatBufs.push(buffer.slice(pos+8, pos+8+len)); }
    pos += 12 + len;
  }
  const bpp       = palette ? 1 : 4;
  const rawStride = width * bpp;
  const decomp    = zlib.inflateSync(Buffer.concat(idatBufs));
  const recon     = new Uint8Array(height * rawStride);
  function paeth(a,b,c) {
    const p=a+b-c, pa=Math.abs(p-a), pb=Math.abs(p-b), pc=Math.abs(p-c);
    return pa<=pb && pa<=pc ? a : pb<=pc ? b : c;
  }
  for (let y = 0; y < height; y++) {
    const srcBase = y * (1 + rawStride);
    const filter  = decomp[srcBase];
    const src = srcBase + 1;
    const dst = y * rawStride;
    const prv = y ? (y-1) * rawStride : -1;
    for (let i = 0; i < rawStride; i++) {
      const raw = decomp[src + i];
      const a = i >= bpp ? recon[dst+i-bpp] : 0;
      const b = prv >= 0 ? recon[prv+i]     : 0;
      const c = prv >= 0 && i >= bpp ? recon[prv+i-bpp] : 0;
      switch (filter) {
        case 0: recon[dst+i] = raw; break;
        case 1: recon[dst+i] = (raw+a) & 0xff; break;
        case 2: recon[dst+i] = (raw+b) & 0xff; break;
        case 3: recon[dst+i] = (raw + Math.floor((a+b)/2)) & 0xff; break;
        case 4: recon[dst+i] = (raw + paeth(a,b,c)) & 0xff; break;
        default: throw new Error(`Unknown PNG filter ${filter}`);
      }
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (palette) {
        const pi = recon[y * rawStride + x];
        pixels[di]   = palette[pi*3];   pixels[di+1] = palette[pi*3+1];
        pixels[di+2] = palette[pi*3+2]; pixels[di+3] = trns && pi < trns.length ? trns[pi] : 255;
      } else {
        const si = y * rawStride + x * 4;
        pixels[di]=recon[si]; pixels[di+1]=recon[si+1]; pixels[di+2]=recon[si+2]; pixels[di+3]=recon[si+3];
      }
    }
  }
  return { width, height, pixels };
}

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { strength: 6, blur: 4, bevel: 1.0, detail: 0.25, frame: 64, all: false };
const sheets = [];
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--all') { opts.all = true; continue; }
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

if (!opts.all && sheets.length === 0) {
  console.error('Usage: node scripts/build-normals.cjs <sheet> [sheet…] [--all] [--strength N] [--blur N]');
  process.exit(1);
}

if (opts.all) {
  for (const f of fs.readdirSync(SPRITE_DIR)) {
    if (!f.toLowerCase().endsWith('.png')) continue;
    const name = f.slice(0, -4);
    if (name.endsWith(NORMAL_SUFFIX)) continue;
    if (!sheets.includes(name)) sheets.push(name);
  }
}

// ── height field → normal ────────────────────────────────────────────────────

/**
 * N passes of a 3×3 box blur over one frame cell, treating outside the cell as
 * EMPTY (zero) rather than a copy of the edge pixel. Clamping would flatten the
 * silhouette wherever art runs up against a frame boundary — e.g. the walk
 * frame where the bob puts the head on row 0 — losing the normal there while
 * every other frame in the cycle keeps it.
 */
function boxBlur(src, size, passes) {
  let cur = src;
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const sy = y + dy;
          if (sy < 0 || sy >= size) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx;
            if (sx < 0 || sx >= size) continue;
            sum += cur[sy * size + sx];
          }
        }
        out[y * size + x] = sum / 9;
      }
    }
    cur = out;
  }
  return cur;
}

/**
 * Normal map for one frame cell, written into `out` at the cell's offset.
 *
 * Convention: Phaser's Light2D shader works in GL screen space (Y up) and
 * decodes the texel as `normal = rgb * 2 - 1`. With image coords u→right and
 * v→down, screen-space y = -v, so the normal is (-dh/du, +dh/dv, 1/strength).
 * Flat = (128, 128, 255), same as every other OpenGL-convention normal map.
 */
function cellNormals(pixels, w, x0, y0, size, out) {
  const alpha = new Float32Array(size * size);
  const lum   = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const si = ((y0 + y) * w + (x0 + x)) * 4;
      const a  = pixels[si + 3] / 255;
      alpha[y * size + x] = a;
      lum[y * size + x] = a === 0 ? 0
        : (0.299 * pixels[si] + 0.587 * pixels[si+1] + 0.114 * pixels[si+2]) / 255;
    }
  }

  const bevel  = boxBlur(alpha, size, opts.blur);
  const detail = boxBlur(lum,   size, 1);
  const h = new Float32Array(size * size);
  for (let i = 0; i < size * size; i++) {
    h[i] = opts.bevel * bevel[i] + opts.detail * detail[i];
  }

  // Same rule as the blur: off the edge of the cell is empty, height 0.
  const at = (x, y) => (x < 0 || x >= size || y < 0 || y >= size) ? 0 : h[y * size + x];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const di = ((y0 + y) * w + (x0 + x)) * 4;

      // Fully transparent texels never light — leave them flat so a sloppy
      // silhouette can't throw stray highlights outside the sprite.
      if (alpha[y * size + x] === 0) {
        out[di] = 128; out[di+1] = 128; out[di+2] = 255; out[di+3] = 255;
        continue;
      }

      // Sobel, normalised to a per-pixel gradient (the kernel sums to 8× the
      // central difference on a linear ramp).
      const gu = (
        -at(x-1,y-1) + at(x+1,y-1)
        - 2*at(x-1,y) + 2*at(x+1,y)
        - at(x-1,y+1) + at(x+1,y+1)
      ) / 8;
      const gv = (
        -at(x-1,y-1) - 2*at(x,y-1) - at(x+1,y-1)
        + at(x-1,y+1) + 2*at(x,y+1) + at(x+1,y+1)
      ) / 8;

      let nx = -gu * opts.strength;
      let ny =  gv * opts.strength;
      let nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      nx /= len; ny /= len; nz /= len;

      out[di]   = Math.round((nx * 0.5 + 0.5) * 255);
      out[di+1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[di+2] = Math.round((nz * 0.5 + 0.5) * 255);
      out[di+3] = 255;
    }
  }
}

// ── build ────────────────────────────────────────────────────────────────────
let built = 0;
const names = [];

for (const sheet of sheets) {
  const src = path.join(SPRITE_DIR, `${sheet}.png`);
  if (!fs.existsSync(src)) {
    console.error(`  skip ${sheet} — no such file: ${path.relative(ROOT, src)}`);
    continue;
  }

  let img;
  try { img = decodePNG(fs.readFileSync(src)); }
  catch (e) { console.error(`  skip ${sheet} — ${e.message}`); continue; }

  const F = opts.frame;
  if (img.width % F !== 0 || img.height % F !== 0) {
    console.error(`  skip ${sheet} — ${img.width}×${img.height} is not a whole number of ${F}px frames`);
    continue;
  }

  const out = new Uint8Array(img.width * img.height * 4);
  for (let fy = 0; fy < img.height; fy += F) {
    for (let fx = 0; fx < img.width; fx += F) {
      cellNormals(img.pixels, img.width, fx, fy, F, out);
    }
  }

  const dest = path.join(SPRITE_DIR, `${sheet}${NORMAL_SUFFIX}.png`);
  fs.writeFileSync(dest, encodePNG(img.width, img.height, out));
  const frames = (img.width / F) * (img.height / F);
  console.log(`  ${sheet}${NORMAL_SUFFIX}.png  ${img.width}×${img.height}  ${frames} frames`);
  names.push(sheet);
  built++;
}

console.log(`\n${built} normal map${built === 1 ? '' : 's'} written to ${path.relative(ROOT, SPRITE_DIR)}`);
if (names.length) {
  console.log('\nAdd to LIGHTING_CONFIG.NORMAL_MAPPED_SHEETS in src/utils/Constants.ts so');
  console.log('PreloadScene pairs them with their sheet:');
  console.log(`  ${names.map(n => `'${n}'`).join(', ')}`);
}
