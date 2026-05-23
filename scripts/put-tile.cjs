// Usage: node scripts/put-tile.cjs <frame> <source.png>
// Splices a 64x64 PNG into the correct slot in tileset.png (in place).
// Also copies source to assets_src/tiles/ with the canonical name for that slot.

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
    raw[y * rowBytes] = 0; // filter type 0 (None)
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
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
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
      const bitDepth = buffer[pos + 16];
      if (bitDepth !== 8)
        throw new Error(`Unsupported bit depth ${bitDepth}. Only 8-bit PNGs are supported.`);
      if (![0, 2, 3, 4, 6].includes(colorType))
        throw new Error(`Unsupported PNG color type ${colorType}.`);
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

  // channels per pixel in the raw filtered data
  const bpp = colorType === 6 ? 4
            : colorType === 4 ? 2
            : colorType === 3 ? 1
            : colorType === 2 ? 3
            : 1; // grayscale
  const stride = width * bpp;

  // Reconstruct raw pixels by applying filter types row by row
  const raw = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filterType = decompressed[y * (stride + 1)];
    const srcOff     = y * (stride + 1) + 1;
    const dstOff     = y * stride;
    const prevOff    = (y - 1) * stride;

    for (let x = 0; x < stride; x++) {
      const filt = decompressed[srcOff + x];
      const a    = x >= bpp    ? raw[dstOff + x - bpp]                    : 0; // left
      const b    = y >  0      ? raw[prevOff + x]                         : 0; // above
      const c    = y >  0 && x >= bpp ? raw[prevOff + x - bpp]           : 0; // upper-left

      switch (filterType) {
        case 0: raw[dstOff + x] = filt;                                        break;
        case 1: raw[dstOff + x] = (filt + a)                          & 0xff; break;
        case 2: raw[dstOff + x] = (filt + b)                          & 0xff; break;
        case 3: raw[dstOff + x] = (filt + Math.floor((a + b) / 2))   & 0xff; break;
        case 4: raw[dstOff + x] = (filt + paethPredictor(a, b, c))   & 0xff; break;
        default: throw new Error(`Unknown PNG filter type ${filterType} at row ${y}`);
      }
    }
  }

  // Convert raw channels → RGBA Uint8Array
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di  = (y * width + x) * 4;
      const si  = y * stride + x * bpp;
      if (colorType === 6) {                         // RGBA
        pixels[di]     = raw[si];
        pixels[di + 1] = raw[si + 1];
        pixels[di + 2] = raw[si + 2];
        pixels[di + 3] = raw[si + 3];
      } else if (colorType === 2) {                  // RGB
        pixels[di]     = raw[si];
        pixels[di + 1] = raw[si + 1];
        pixels[di + 2] = raw[si + 2];
        pixels[di + 3] = trns
          ? (raw[si] === trns[1] && raw[si+1] === trns[3] && raw[si+2] === trns[5] ? 0 : 255)
          : 255;
      } else if (colorType === 4) {                  // Grayscale+Alpha
        pixels[di]     = raw[si];
        pixels[di + 1] = raw[si];
        pixels[di + 2] = raw[si];
        pixels[di + 3] = raw[si + 1];
      } else if (colorType === 3) {                  // Indexed
        const idx = raw[si];
        pixels[di]     = palette[idx * 3];
        pixels[di + 1] = palette[idx * 3 + 1];
        pixels[di + 2] = palette[idx * 3 + 2];
        pixels[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else {                                       // Grayscale
        pixels[di]     = raw[si];
        pixels[di + 1] = raw[si];
        pixels[di + 2] = raw[si];
        pixels[di + 3] = trns ? (raw[si] === trns[1] ? 0 : 255) : 255;
      }
    }
  }
  return { width, height, pixels };
}

// ── Resolve canonical assets_src name for a frame slot ──────────────────

function resolveAssetSrcName(frame) {
  return `tile_${frame}.png`;
}

// ── Main ──────────────────────────────────────────────────────────────────

const TILE_SIZE = 64;
const COLS      = 8;

const [,, frameArg, srcArg] = process.argv;
if (frameArg === undefined || srcArg === undefined) {
  console.error('Usage: node scripts/put-tile.cjs <frame> <source.png>');
  process.exit(1);
}
const frame = parseInt(frameArg, 10);
if (isNaN(frame) || frame < 0) {
  console.error('Frame must be a non-negative integer.');
  process.exit(1);
}

const srcPath = path.resolve(srcArg);
if (!fs.existsSync(srcPath)) {
  console.error('Source file not found: ' + srcPath);
  process.exit(1);
}

const src = decodePNG(fs.readFileSync(srcPath));
if (src.width !== TILE_SIZE || src.height !== TILE_SIZE) {
  console.warn(`Warning: source is ${src.width}×${src.height}, expected ${TILE_SIZE}×${TILE_SIZE}. Only the top-left region will be used.`);
}

const tilesetPath = path.join(__dirname, '..', 'public', 'assets', 'tilemaps', 'tileset.png');
if (!fs.existsSync(tilesetPath)) {
  console.error('tileset.png not found at ' + tilesetPath);
  process.exit(1);
}
const tileset = decodePNG(fs.readFileSync(tilesetPath));

const col = frame % COLS;
const row = Math.floor(frame / COLS);
const ox  = col * TILE_SIZE;
const oy  = row * TILE_SIZE;

if (ox + TILE_SIZE > tileset.width || oy + TILE_SIZE > tileset.height) {
  console.error(`Frame ${frame} is out of bounds for a ${tileset.width}×${tileset.height} tileset.`);
  process.exit(1);
}

for (let ty = 0; ty < Math.min(TILE_SIZE, src.height); ty++) {
  for (let tx = 0; tx < Math.min(TILE_SIZE, src.width); tx++) {
    const si = (ty * src.width + tx) * 4;
    const di = ((oy + ty) * tileset.width + (ox + tx)) * 4;
    tileset.pixels[di]     = src.pixels[si];
    tileset.pixels[di + 1] = src.pixels[si + 1];
    tileset.pixels[di + 2] = src.pixels[si + 2];
    tileset.pixels[di + 3] = src.pixels[si + 3];
  }
}

fs.writeFileSync(tilesetPath, encodePNG(tileset.width, tileset.height, tileset.pixels));
console.log(`Updated tileset: tile #${frame} (col ${col}, row ${row}) → ${tilesetPath}`);

const distPath = path.join(__dirname, '..', 'dist', 'assets', 'tilemaps', 'tileset.png');
if (fs.existsSync(path.dirname(distPath))) {
  fs.writeFileSync(distPath, fs.readFileSync(tilesetPath));
  console.log(`Synced → ${distPath}`);
}

const srcDir = path.join(__dirname, '..', 'assets_src', 'tiles');
if (fs.existsSync(srcDir)) {
  const destName = resolveAssetSrcName(frame);
  const destPath = path.join(srcDir, destName);
  fs.copyFileSync(srcPath, destPath);
  console.log(`Synced → ${destPath}`);
}
