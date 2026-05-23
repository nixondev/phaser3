// POC: take tile_76, apply dark/gritty treatment, write to tile_86 + tileset slot 86.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG helpers ───────────────────────────────────────────────────────────

function crc32(buf) {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function encodePNG(width, height, pixels) {
  const rowBytes = 1 + width * 4;
  const raw = Buffer.alloc(height * rowBytes);
  for (let y = 0; y < height; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < width; x++) {
      const si = (y * width + x) * 4;
      const di = y * rowBytes + 1 + x * 4;
      raw[di] = pixels[si]; raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2]; raw[di+3] = pixels[si+3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  function chunk(type, data) {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c  = Buffer.allocUnsafe(4); c.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('Not a PNG');
  let pos = 8, width, height, colorType, idatChunks = [], palette = null, trns = null;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type   = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(pos + 8); height = buffer.readUInt32BE(pos + 12);
      colorType = buffer[pos + 17];
    } else if (type === 'PLTE') { palette = buffer.slice(pos + 8, pos + 8 + length);
    } else if (type === 'tRNS') { trns    = buffer.slice(pos + 8, pos + 8 + length);
    } else if (type === 'IDAT') { idatChunks.push(buffer.slice(pos + 8, pos + 8 + length)); }
    pos += 12 + length;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const ft = decompressed[y * (stride + 1)];
    const src = y * (stride + 1) + 1, dst = y * stride, prv = (y-1) * stride;
    for (let x = 0; x < stride; x++) {
      const f = decompressed[src + x];
      const a = x >= bpp ? raw[dst + x - bpp] : 0;
      const b = y > 0   ? raw[prv + x]        : 0;
      const c = y > 0 && x >= bpp ? raw[prv + x - bpp] : 0;
      switch (ft) {
        case 0: raw[dst+x] = f; break;
        case 1: raw[dst+x] = (f+a)&0xff; break;
        case 2: raw[dst+x] = (f+b)&0xff; break;
        case 3: raw[dst+x] = (f+Math.floor((a+b)/2))&0xff; break;
        case 4: raw[dst+x] = (f+paethPredictor(a,b,c))&0xff; break;
      }
    }
  }
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4, si = y * stride + x * bpp;
      if (colorType === 6) {
        pixels[di]=raw[si]; pixels[di+1]=raw[si+1]; pixels[di+2]=raw[si+2]; pixels[di+3]=raw[si+3];
      } else if (colorType === 2) {
        pixels[di]=raw[si]; pixels[di+1]=raw[si+1]; pixels[di+2]=raw[si+2]; pixels[di+3]=255;
      } else if (colorType === 3 && palette) {
        const idx=raw[si];
        pixels[di]=palette[idx*3]; pixels[di+1]=palette[idx*3+1]; pixels[di+2]=palette[idx*3+2];
        pixels[di+3]=trns&&idx<trns.length?trns[idx]:255;
      } else {
        pixels[di]=pixels[di+1]=pixels[di+2]=raw[si]; pixels[di+3]=255;
      }
    }
  }
  return { width, height, pixels };
}

// ── Effects ───────────────────────────────────────────────────────────────

function clamp(v) { return Math.max(0, Math.min(255, Math.round(v))); }

// Simple seeded PRNG (mulberry32) — deterministic grain so every run matches.
function makePrng(seed) {
  let s = seed >>> 0;
  return function() {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ s >>> 15, 1 | s);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t);
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function applyGritty(pixels, width, height) {
  const out  = new Uint8Array(pixels.length);
  const rand = makePrng(0xdeadbeef);

  // Tile is already very dark (max ~98). Strategy: lift darks so grain is
  // visible, tint with a warm-brown grime colour, add per-channel grain.
  const LIFT       = 14;    // base ambient lift so pure blacks aren't flat
  const GRAIN      = 20;    // ±grain magnitude per channel
  const CONTRAST   = 1.12;  // very light contrast on original values first
  const TINT_R     = 10;    // warm brown tint added to shadows
  const TINT_G     =  4;
  const TINT_B     = -6;

  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    let r = pixels[p], g = pixels[p+1], b = pixels[p+2];
    const a = pixels[p+3];

    if (a === 0) { out[p]=0; out[p+1]=0; out[p+2]=0; out[p+3]=0; continue; }

    // 1. Gentle contrast on original values (works in the 0-98 range, not 0-255)
    const pivot = 49; // midpoint of the actual range
    r = (r - pivot) * CONTRAST + pivot;
    g = (g - pivot) * CONTRAST + pivot;
    b = (b - pivot) * CONTRAST + pivot;

    // 2. Lift — raises the floor so grain has something to show on dark pixels
    r += LIFT; g += LIFT; b += LIFT;

    // 3. Warm-brown shadow tint, stronger on darker pixels
    const luma = 0.299 * r + 0.587 * g + 0.114 * b;
    const darkness = 1 - Math.min(1, luma / 80); // normalise against lifted range
    r += TINT_R * darkness;
    g += TINT_G * darkness;
    b += TINT_B * darkness;

    // 4. Grain — one shared luminance value keeps it grey (film grain),
    //    plus a tiny per-channel spread for just a touch of texture colour.
    const grainBase   = (rand() - 0.5) * GRAIN * 2;
    const grainChroma = 4;
    r += grainBase + (rand() - 0.5) * grainChroma * 2;
    g += grainBase + (rand() - 0.5) * grainChroma * 2;
    b += grainBase + (rand() - 0.5) * grainChroma * 2;

    out[p]   = clamp(r);
    out[p+1] = clamp(g);
    out[p+2] = clamp(b);
    out[p+3] = a;
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────

const TILE_SIZE = 64;
const COLS      = 8;
const ROOT      = path.join(__dirname, '..');
const tilesDir  = path.join(ROOT, 'assets_src', 'tiles');
const tilesetPath = path.join(ROOT, 'public', 'assets', 'tilemaps', 'tileset.png');

// Read source tile (slot 76)
const srcPath = path.join(tilesDir, 'tile_76.png');
const { width, height, pixels } = decodePNG(fs.readFileSync(srcPath));
console.log(`Source: tile_76.png  (${width}×${height})`);

// Apply effect
const gritty = applyGritty(pixels, width, height);
console.log('Effects applied: darken, contrast, desaturate, shadow tint, grain');

// Write individual tile to slot 86
const destTilePath = path.join(tilesDir, 'tile_86.png');
fs.writeFileSync(destTilePath, encodePNG(width, height, gritty));
console.log(`Written → ${destTilePath}`);

// Splice into tileset at slot 86
const tileset = decodePNG(fs.readFileSync(tilesetPath));
const col = 86 % COLS, row = Math.floor(86 / COLS);
const ox = col * TILE_SIZE, oy = row * TILE_SIZE;
for (let ty = 0; ty < TILE_SIZE; ty++) {
  for (let tx = 0; tx < TILE_SIZE; tx++) {
    const si = (ty * width + tx) * 4;
    const di = ((oy + ty) * tileset.width + (ox + tx)) * 4;
    tileset.pixels[di]   = gritty[si];   tileset.pixels[di+1] = gritty[si+1];
    tileset.pixels[di+2] = gritty[si+2]; tileset.pixels[di+3] = gritty[si+3];
  }
}
fs.writeFileSync(tilesetPath, encodePNG(tileset.width, tileset.height, tileset.pixels));
console.log(`Tileset updated: slot 86 (col ${col}, row ${row}) → ${tilesetPath}`);
