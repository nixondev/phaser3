// Usage: node scripts/build-tileset.cjs
// Composes assets_src/tiles/tile_<N>.png files into public/assets/tilemaps/tileset.png.
// Layout: 8 columns × 16 rows, 64×64 px per tile (512×1024 total).
// Missing slots are left transparent.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

// ── PNG helpers (full filter support) ────────────────────────────────────

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
      raw[di]     = pixels[si];
      raw[di + 1] = pixels[si + 1];
      raw[di + 2] = pixels[si + 2];
      raw[di + 3] = pixels[si + 3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c  = Buffer.allocUnsafe(4);
    c.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width,  0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('Not a PNG');
  let pos = 8;
  let width, height, colorType, idatChunks = [], palette = null, trns = null;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type   = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width     = buffer.readUInt32BE(pos + 8);
      height    = buffer.readUInt32BE(pos + 12);
      colorType = buffer[pos + 17];
    } else if (type === 'PLTE') {
      palette = buffer.slice(pos + 8, pos + 8 + length);
    } else if (type === 'tRNS') {
      trns = buffer.slice(pos + 8, pos + 8 + length);
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.slice(pos + 8, pos + 8 + length));
    }
    pos += 12 + length;
  }

  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const bpp    = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1;
  const stride = width * bpp;
  const raw    = new Uint8Array(height * stride);

  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * (stride + 1)];
    const srcOff     = y * (stride + 1) + 1;
    const dstOff     = y * stride;
    const prevOff    = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const filt = decompressed[srcOff + x];
      const a    = x >= bpp           ? raw[dstOff + x - bpp]              : 0;
      const b    = y >  0             ? raw[prevOff + x]                   : 0;
      const c    = y >  0 && x >= bpp ? raw[prevOff + x - bpp]            : 0;
      switch (filterType) {
        case 0: raw[dstOff + x] = filt;                                       break;
        case 1: raw[dstOff + x] = (filt + a)                        & 0xff;  break;
        case 2: raw[dstOff + x] = (filt + b)                        & 0xff;  break;
        case 3: raw[dstOff + x] = (filt + Math.floor((a + b) / 2)) & 0xff;  break;
        case 4: raw[dstOff + x] = (filt + paethPredictor(a, b, c)) & 0xff;  break;
        default: throw new Error(`Unknown filter type ${filterType} at row ${y}`);
      }
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      const si = y * stride + x * bpp;
      if (colorType === 6) {
        pixels[di]     = raw[si];     pixels[di+1] = raw[si+1];
        pixels[di + 2] = raw[si + 2]; pixels[di+3] = raw[si+3];
      } else if (colorType === 2) {
        pixels[di]     = raw[si];     pixels[di+1] = raw[si+1];
        pixels[di + 2] = raw[si + 2];
        pixels[di + 3] = trns
          ? (raw[si] === trns[1] && raw[si+1] === trns[3] && raw[si+2] === trns[5] ? 0 : 255)
          : 255;
      } else if (colorType === 4) {
        pixels[di] = pixels[di+1] = pixels[di+2] = raw[si];
        pixels[di + 3] = raw[si + 1];
      } else if (colorType === 3) {
        const idx = raw[si];
        pixels[di]     = palette[idx * 3];
        pixels[di + 1] = palette[idx * 3 + 1];
        pixels[di + 2] = palette[idx * 3 + 2];
        pixels[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {
        pixels[di] = pixels[di+1] = pixels[di+2] = raw[si];
        pixels[di + 3] = trns ? (raw[si] === trns[1] ? 0 : 255) : 255;
      }
    }
  }
  return { width, height, pixels };
}

// ── Main ──────────────────────────────────────────────────────────────────

const TILE_SIZE = 64;
const COLS      = 8;
const ROWS      = 16;
const W         = COLS * TILE_SIZE;  // 512
const H         = ROWS * TILE_SIZE;  // 1024

const srcDir    = path.join(__dirname, '..', 'assets_src', 'tiles');
const outPath   = path.join(__dirname, '..', 'public', 'assets', 'tilemaps', 'tileset.png');

if (!fs.existsSync(srcDir)) {
  console.error('Source dir not found: ' + srcDir);
  process.exit(1);
}

// Collect tile_<N>.png files
const files = fs.readdirSync(srcDir).filter(f => /^tile_\d+\.png$/.test(f));
const tileMap = new Map();
for (const f of files) {
  const n = parseInt(f.match(/^tile_(\d+)\.png$/)[1], 10);
  if (n >= 0 && n < COLS * ROWS) tileMap.set(n, f);
}

// Build output canvas (transparent by default)
const outPixels = new Uint8Array(W * H * 4);

let placed = 0;
for (const [index, file] of tileMap) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const ox  = col * TILE_SIZE;
  const oy  = row * TILE_SIZE;

  try {
    const { width, height, pixels } = decodePNG(fs.readFileSync(path.join(srcDir, file)));
    for (let ty = 0; ty < Math.min(TILE_SIZE, height); ty++) {
      for (let tx = 0; tx < Math.min(TILE_SIZE, width); tx++) {
        const si = (ty * width + tx) * 4;
        const di = ((oy + ty) * W + (ox + tx)) * 4;
        outPixels[di]     = pixels[si];
        outPixels[di + 1] = pixels[si + 1];
        outPixels[di + 2] = pixels[si + 2];
        outPixels[di + 3] = pixels[si + 3];
      }
    }
    placed++;
  } catch (e) {
    console.error(`  Error reading ${file}: ${e.message}`);
  }
}

fs.writeFileSync(outPath, encodePNG(W, H, outPixels));
console.log(`Built tileset: ${placed} tiles placed → ${outPath}`);

// Sync dist copy if present
const distPath = path.join(__dirname, '..', 'dist', 'assets', 'tilemaps', 'tileset.png');
if (fs.existsSync(path.dirname(distPath))) {
  fs.writeFileSync(distPath, fs.readFileSync(outPath));
  console.log(`Synced → ${distPath}`);
}
