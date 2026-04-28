const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG encoder/decoder helpers
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
      raw[di] = pixels[si];
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
    const c = Buffer.allocUnsafe(4);
    c.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('Not a PNG');
  let pos = 8;
  let width, height, idatChunks = [], palette = null, trns = null;
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(pos + 8);
      height = buffer.readUInt32BE(pos + 12);
      const colorType = buffer[pos + 17];
      if (colorType !== 6 && colorType !== 3) {
        throw new Error('Unsupported color type: ' + colorType + '. Only RGBA (6) and Indexed (3) are supported.');
      }
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
  const pixels = new Uint8Array(width * height * 4);
  
  const isIndexed = palette !== null;
  const rowBytes = 1 + (isIndexed ? width : width * 4);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const di = (y * width + x) * 4;
      if (isIndexed) {
        const si = y * rowBytes + 1 + x;
        const paletteIdx = decompressed[si];
        pixels[di] = palette[paletteIdx * 3];
        pixels[di + 1] = palette[paletteIdx * 3 + 1];
        pixels[di + 2] = palette[paletteIdx * 3 + 2];
        
        // Handle transparency for indexed color
        if (trns && paletteIdx < trns.length) {
          pixels[di + 3] = trns[paletteIdx];
        } else {
          pixels[di + 3] = 255;
        }
      } else {
        const si = y * rowBytes + 1 + x * 4;
        pixels[di] = decompressed[si];
        pixels[di + 1] = decompressed[si + 1];
        pixels[di + 2] = decompressed[si + 2];
        pixels[di + 3] = decompressed[si + 3];
      }
    }
  }
  return { width, height, pixels };
}

const TILE_SIZE = 64; 
const COLS = 8;
const ROWS = 8;
const W = COLS * TILE_SIZE;
const H = ROWS * TILE_SIZE;

const srcDir = path.join(__dirname, '..', 'assets_src', 'tiles');
const outFile = path.join(__dirname, '..', 'public', 'assets', 'tilemaps', 'tileset.png');

if (!fs.existsSync(srcDir)) {
  console.error('Source directory not found: ' + srcDir);
  process.exit(1);
}

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.png'));
const tiles = new Array(64).fill(null);

files.forEach(file => {
  const match = file.match(/^(\d+)_/);
  if (match) {
    const index = parseInt(match[1], 10);
    if (index >= 0 && index < 64) {
      if (tiles[index]) {
        console.log(`Note: Multiple files for index ${index}, using ${file} (previously ${tiles[index]})`);
      }
      tiles[index] = file;
    }
  }
});

const outPixels = new Uint8Array(W * H * 4);

// Fill with transparency by default
for (let i = 0; i < outPixels.length; i += 4) {
  outPixels[i] = 0;     // R
  outPixels[i + 1] = 0; // G
  outPixels[i + 2] = 0; // B
  outPixels[i + 3] = 0; // A
}

tiles.forEach((file, index) => {
  if (!file) {
    return;
  }
  
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const ox = col * TILE_SIZE;
  const oy = row * TILE_SIZE;
  
  try {
    const srcPath = path.join(srcDir, file);
    const { width, height, pixels } = decodePNG(fs.readFileSync(srcPath));
    
    let pixelCount = 0;
    let nonTransparentCount = 0;

    // Scale or crop if necessary? For now assume 64x64
    for (let ty = 0; ty < Math.min(height, TILE_SIZE); ty++) {
      for (let tx = 0; tx < Math.min(width, TILE_SIZE); tx++) {
        const si = (ty * width + tx) * 4;
        const di = ((oy + ty) * W + (ox + tx)) * 4;
        outPixels[di] = pixels[si];
        outPixels[di + 1] = pixels[si + 1];
        outPixels[di + 2] = pixels[si + 2];
        outPixels[di + 3] = pixels[si + 3];
        
        pixelCount++;
        if (pixels[si + 3] > 0) nonTransparentCount++;
      }
    }
    
    // Safety check for index 7 specifically to help user debug
    if (index === 7) {
        console.log(`DEBUG: Index 7 [${file}] - Width: ${width}, Height: ${height}, Visible Pixels: ${nonTransparentCount}`);
        if (nonTransparentCount === 0) {
            console.warn(`WARNING: Index 7 is COMPLETELY TRANSPARENT! Check ${file}`);
        }
    }
  } catch (e) {
    console.error(`Error processing ${file}: ${e.message}`);
  }
});

const pngBuffer = encodePNG(W, H, outPixels);
fs.writeFileSync(outFile, pngBuffer);
console.log(`Successfully built ${outFile}`);

// Also update dist if it exists to prevent stale assets during dev
const distFile = path.join(__dirname, '..', 'dist', 'assets', 'tilemaps', 'tileset.png');
if (fs.existsSync(path.dirname(distFile))) {
    fs.writeFileSync(distFile, pngBuffer);
    console.log(`Successfully synced to ${distFile}`);
}
