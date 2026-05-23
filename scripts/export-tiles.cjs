// Usage: node scripts/export-tiles.cjs [tileset.png]
// Exports every tile from tileset.png as tile_<index>.png into assets_src/tiles/.
// Default source: public/assets/tilemaps/tileset.png

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
      const bitDepth = buffer[pos + 16];
      if (bitDepth !== 8)
        throw new Error(`Unsupported bit depth ${bitDepth}. Only 8-bit PNGs are supported.`);
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
        pixels[di]     = raw[si];
        pixels[di + 1] = raw[si + 1];
        pixels[di + 2] = raw[si + 2];
        pixels[di + 3] = raw[si + 3];
      } else if (colorType === 2) {
        pixels[di]     = raw[si];
        pixels[di + 1] = raw[si + 1];
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

const tilesetPath = process.argv[2]
  ? path.resolve(process.argv[2])
  : path.join(__dirname, '..', 'public', 'assets', 'tilemaps', 'tileset.png');

if (!fs.existsSync(tilesetPath)) {
  console.error('Tileset not found: ' + tilesetPath);
  process.exit(1);
}

const outDir = path.join(__dirname, '..', 'assets_src', 'tiles');
fs.mkdirSync(outDir, { recursive: true });

const { width, height, pixels } = decodePNG(fs.readFileSync(tilesetPath));
const ROWS  = Math.floor(height / TILE_SIZE);
const total = COLS * ROWS;

console.log(`Tileset: ${width}×${height} → ${COLS} cols × ${ROWS} rows = ${total} tiles`);

for (let i = 0; i < total; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const ox  = col * TILE_SIZE;
  const oy  = row * TILE_SIZE;

  const tilePixels = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      const si = ((oy + ty) * width + (ox + tx)) * 4;
      const di = (ty * TILE_SIZE + tx) * 4;
      tilePixels[di]     = pixels[si];
      tilePixels[di + 1] = pixels[si + 1];
      tilePixels[di + 2] = pixels[si + 2];
      tilePixels[di + 3] = pixels[si + 3];
    }
  }

  const outPath = path.join(outDir, `tile_${i}.png`);
  fs.writeFileSync(outPath, encodePNG(TILE_SIZE, TILE_SIZE, tilePixels));
}

console.log(`Exported ${total} tiles → ${outDir}`);
