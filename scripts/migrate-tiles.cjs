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

// Simple PNG decoder for IHDR and IDAT only
function decodePNG(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504E47) throw new Error('Not a PNG');
  let pos = 8;
  let width, height, idatChunks = [];
  while (pos < buffer.length) {
    const length = buffer.readUInt32BE(pos);
    const type = buffer.toString('ascii', pos + 4, pos + 8);
    if (type === 'IHDR') {
      width = buffer.readUInt32BE(pos + 8);
      height = buffer.readUInt32BE(pos + 12);
    } else if (type === 'IDAT') {
      idatChunks.push(buffer.slice(pos + 8, pos + 8 + length));
    }
    pos += 12 + length;
  }
  const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
  const pixels = new Uint8Array(width * height * 4);
  const rowBytes = 1 + width * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const si = y * rowBytes + 1 + x * 4;
      const di = (y * width + x) * 4;
      pixels[di] = decompressed[si];
      pixels[di + 1] = decompressed[si + 1];
      pixels[di + 2] = decompressed[si + 2];
      pixels[di + 3] = decompressed[si + 3];
    }
  }
  return { width, height, pixels };
}

const TILE_SIZE = 64; // 16px * 4 scale
const COLS = 8;
const ROWS = 8;

const srcFile = path.join(__dirname, '..', 'public', 'assets', 'tilemaps', 'tileset.png');
const outDir = path.join(__dirname, '..', 'assets_src', 'tiles');

if (!fs.existsSync(srcFile)) {
  console.error('Source tileset.png not found at ' + srcFile);
  process.exit(1);
}

if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const tileNames = [
  "dark_pavement", "exterior_wall", "interior_floor", "concrete_floor", "barricade", "overgrown_ground", "rubble_debris", "document_paper",
  "skeleton_key", "vial_cure", "skeleton_remains", "component_gear", "street_lamp", "monitor_screen", "security_camera", "bench",
  "trash_pile", "crate_box", "interior_wall", "counter_desk", "shelving", "table", "bed_cot", "locked_gate",
  "manhole_cover", "generator", "electrical_panel", "dark_window", "door_frame", "reinforced_wall", "memorial", "worn_carpet",
  "cracked_pavement", "trap_door", "metal_pipe_h", "metal_pipe_v", "drainage_grating", "small_bush", "small_dead_tree", "flashlight_charger",
  "tree_tl", "tree_tc", "tree_tr", "tree_ml", "tree_mc", "tree_mr", "tree_bl", "tree_bc", "tree_br", "fuel_canister"
];

const { width, height, pixels } = decodePNG(fs.readFileSync(srcFile));

for (let i = 0; i < 64; i++) {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const ox = col * TILE_SIZE;
  const oy = row * TILE_SIZE;
  
  if (ox + TILE_SIZE > width || oy + TILE_SIZE > height) continue;

  const tilePixels = new Uint8Array(TILE_SIZE * TILE_SIZE * 4);
  for (let ty = 0; ty < TILE_SIZE; ty++) {
    for (let tx = 0; tx < TILE_SIZE; tx++) {
      const si = ((oy + ty) * width + (ox + tx)) * 4;
      const di = (ty * TILE_SIZE + tx) * 4;
      tilePixels[di] = pixels[si];
      tilePixels[di + 1] = pixels[si + 1];
      tilePixels[di + 2] = pixels[si + 2];
      tilePixels[di + 3] = pixels[si + 3];
    }
  }

  const name = tileNames[i] || `tile_${i.toString().padStart(2, '0')}`;
  const filename = `${i.toString().padStart(2, '0')}_${name}.png`;
  fs.writeFileSync(path.join(outDir, filename), encodePNG(TILE_SIZE, TILE_SIZE, tilePixels));
  console.log(`Extracted ${filename}`);
}

console.log('Finished extracting tiles.');
