'use strict';
const zlib = require('zlib');

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

module.exports = { encodePNG, decodePNG };
