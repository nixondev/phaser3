/**
 * Standalone Tileset Generator for WARDEN placeholder art.
 * Pure Node.js — zero external dependencies (uses built-in zlib).
 * Run: node scripts/generate-tileset.cjs
 *
 * This intentionally only generates:
 *   public/assets/tilemaps/tileset.png
 *
 * The existing generate-assets.cjs file can stay unchanged for now.
 */

const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

// ── PNG encoder ─────────────────────────────────────────────────────────────

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
    const c = Buffer.alloc(4);
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

// ── Drawing helpers ─────────────────────────────────────────────────────────

const S = 4; // Scale Factor (e.g. 4x)
const BASE = 16;
const TILE = BASE * S;

function setPixel(px, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function fillRect(px, w, x1, y1, x2, y2, r, g, b, a = 255) {
  // Scale fillRect coordinates
  for (let y = y1 * S; y <= (y2 + 1) * S - 1; y++)
    for (let x = x1 * S; x <= (x2 + 1) * S - 1; x++) 
      setPixel(px, w, x, y, r, g, b, a);
}

  // ── Tileset (Upscaled) ─────────────────────────────────────────────────────

function generateTileset() {
  const COLS = 8;
  const ROWS = 16;
  const W = COLS * TILE, H = ROWS * TILE;
  const px = new Uint8Array(W * H * 4);

  // Draw one TILExTILE tile at column col (0-indexed)
  function tile(index, fn) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const ox = col * TILE;
    const oy = row * TILE;
    for (let py = 0; py < TILE; py++)
      for (let px = 0; px < TILE; px++)
        fn(px / S, py / S, ox + px, oy + py);
  }
  function sp(ax, ay, r, g, b, a = 255) { setPixel(px, W, ax, ay, r, g, b, a); }
  function tr(ax, ay) { setPixel(px, W, ax, ay, 0, 0, 0, 0); } // transparent

  // ── Palette ────────────────────────────────────────────────────────────────
  const PAV  = [30, 30, 40];   const PAV2 = [42, 42, 54];   const PAV3 = [56, 56, 70];
  const WAL  = [24, 20, 28];   const WAL2 = [36, 30, 42];   const WAL3 = [50, 42, 58];
  const FLR  = [46, 38, 30];   const FLR2 = [58, 48, 38];   const FLR3 = [72, 60, 48];
  const CON  = [36, 36, 38];   const CON2 = [48, 48, 50];
  const GRN  = [20, 35, 14];   const GRN2 = [30, 50, 20];   const GRN3 = [44, 68, 30];
  const RUB  = [38, 34, 28];   const RUB2 = [52, 46, 38];
  const MTL  = [26, 26, 34];   const MTL2 = [40, 40, 52];   const MTL3 = [60, 60, 76];
  const WOD  = [42, 28, 16];   const WOD2 = [58, 42, 26];
  const CRP  = [40, 30, 46];   const CRP2 = [54, 42, 62];   const CRP3 = [68, 54, 78];
  const PAP  = [182, 164, 126]; const PAP2 = [140, 124, 90]; const PAP3 = [112, 98, 70];

  // ── GID 1 | frame 0 — Dark pavement (city street ground) ─────────────────
  tile(0, (x, y, px, py) => {
    let [r,g,b] = PAV;
    const fx = Math.floor(x), fy = Math.floor(y);
    if (fx === 0 || fx === 8 || fy === 0 || fy === 8) { [r,g,b] = PAV2; }
    if ((fx*7 + fy*13 + fx*fy) % 19 === 0) { r += 8; g += 8; b += 10; }
    sp(px, py, r, g, b);
  });

  // ── GID 2 | frame 1 — Exterior wall (dark brick, used for ALL collision walls)
  tile(1, (x, y, px, py) => {
    const row = Math.floor(y / 4);
    const lx  = (x + (row % 2) * 8) % 8;
    const ly  = y % 4;
    if (lx < 1 || ly < 1) { sp(px, py, ...WAL); }
    else {
      let [r,g,b] = WAL2;
      if (lx < 2 && ly < 2) { [r,g,b] = WAL3; }
      sp(px, py, r, g, b);
    }
  });

  // ── GID 3 | frame 2 — Interior floor (warm wood tile, apartment ground) ──
  tile(2, (x, y, px, py) => {
    const lx = x % 8, ly = y % 8;
    if (lx < 1 || ly < 1) { sp(px, py, ...FLR); }
    else {
      let [r,g,b] = FLR2;
      if ((Math.floor(x) + Math.floor(y) * 2) % 7 === 0) { r -= 6; g -= 5; b -= 4; }
      if (lx < 2 && ly < 2)  { [r,g,b] = FLR3; }
      sp(px, py, r, g, b);
    }
  });

  // ── GID 4 | frame 3 — Concrete floor (industrial/energy facility) ─────────
  tile(3, (x, y, px, py) => {
    let [r,g,b] = CON;
    if (x < 1 || y < 1) { [r,g,b] = CON2; }
    if ((Math.floor(x) * 3 + Math.floor(y) * 5) % 11 === 0) { r += 5; g += 5; b += 5; }
    sp(px, py, r, g, b);
  });

  // ── GID 5 | frame 4 — Barricade (prop collision tile) ────────────────────
  tile(4, (x, y, px, py) => {
    const board = Math.floor(y / 3);
    if (y % 3 < 1) { sp(px, py, ...WOD); }
    else {
      let [r,g,b] = WOD2;
      if (x < 1 || x >= 15) { [r,g,b] = WOD; }
      if ((Math.floor(x) + board * 3) % 6 === 0) { r -= 8; g -= 6; b -= 4; }
      sp(px, py, r, g, b);
    }
  });

  // ── GID 6 | frame 5 — Overgrown ground (weeds reclaiming pavement) ───────
  tile(5, (x, y, px, py) => {
    let [r,g,b] = PAV;
    const h = 15 - y;
    const d = (x * 7 + y * 11) % 13;
    if (h > 5 && d < 3)       { [r,g,b] = GRN; }
    else if (h > 2 && d < 2)  { [r,g,b] = GRN2; }
    else if (y < 5 && (x * 5 + y * 7) % 9 === 0) { [r,g,b] = GRN3; }
    sp(px, py, r, g, b);
  });

  // ── GID 7 | frame 6 — Rubble/debris ground ───────────────────────────────
  tile(6, (x, y, px, py) => {
    let [r,g,b] = PAV;
    const h = (x * 13 + y * 7 + x * y) % 17;
    if (h < 3) { [r,g,b] = RUB2; }
    else if (h < 6) { [r,g,b] = RUB; }
    if (x>=4&&x<=7&&y>=6&&y<=9)   { [r,g,b] = RUB2; }
    if (x>=10&&x<=13&&y>=3&&y<=5) { [r,g,b] = PAV2; }
    sp(px, py, r, g, b);
  });

  // ── GID 8 | frame 7 — Document/paper item sprite ─────────────────────────
  tile(7, (x, y, px, py) => {
    tr(px, py);
    if (x>=3&&x<=13&&y>=2&&y<=14) {
      if (x===3||x===13||y===2||y===14) { sp(px, py,...PAP2); }
      else {
        sp(px, py,...PAP);
        if ((y===5||y===7||y===9||y===11) && x>=5&&x<=11) { sp(px, py,...PAP3); }
      }
    }
  });

  // ── GID 9 | frame 8 — Skeleton Key sprite ────────────────────────────────
  tile(8, (x, y, px, py) => {
    tr(px, py);
    const K=[210,180,40], KL=[255,240,100], KD=[140,110,20]; // Golden Brass
    
    // Handle: Ornate ring (Clover shape)
    const hx=x-7.5, hy=y-4;
    const dist = Math.sqrt(hx*hx + hy*hy);
    if (dist < 4.5 && dist > 1.5) {
      const angle = Math.atan2(hy, hx);
      const clover = Math.abs(Math.cos(angle * 2));
      if (clover > 0.2) {
        let c = K;
        if (hy < 0 && hx < 0) c = KL;
        if (hy > 0 && hx > 0) c = KD;
        sp(px, py, ...c);
      }
    }
    
    // Stem
    if (x >= 7 && x < 9 && y >= 7 && y <= 15) {
      const isLeft = x < 8;
      sp(px, py, (isLeft?KL:K)[0], (isLeft?KL:K)[1], (isLeft?KL:K)[2]);
    }
    
    // Bit (teeth) — more key-like
    if (Math.floor(y) === 13 && x >= 9 && x <= 11) sp(px, py, ...K);
    if (Math.floor(y) === 15 && x >= 9 && x <= 12) sp(px, py, ...K);
    if (Math.floor(x) === 12 && y >= 13 && y <= 15) sp(px, py, ...KD);
  });

  // ── GID 10 | frame 9 — Vial/cure item sprite ─────────────────────────────
  tile(9, (x, y, px, py) => {
    tr(px, py);
    const GL = [150, 200, 255, 180], G = [50, 100, 200, 220], GH = [200, 240, 255]; // Glass/Liquid
    const CK = [80, 50, 30]; // Cork
    
    // Cork/Cap
    if (x >= 7 && x <= 8 && y >= 1 && y <= 2) sp(px, py, ...CK);
    
    // Neck
    if (x >= 7 && x <= 8 && y >= 3 && y <= 5) sp(px, py, ...GL);
    
    // Body (Round flask)
    const dx = x - 7.5, dy = y - 10;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 4.5) {
      let c = G;
      if (dist < 4) {
        c = (dx < -1 && dy < -1) ? GH : G;
      }
      if (dist > 4) c = GL;
      sp(px, py, ...c);
    }
  });

  // ── GID 11 | frame 10 — Skeleton NPC / Remains sprite ──────────────────
  tile(10, (x, y, px, py) => {
    tr(px, py);
    const B = [220, 220, 200], BL = [255, 255, 240], BD = [160, 160, 140]; // Bone colors
    
    // Skull
    if (x >= 6 && x <= 9 && y >= 1 && y <= 4) {
      sp(px, py, ...B);
      if (y >= 2.5 && y <= 3.5 && (x >= 6.5 && x <= 7.5 || x >= 8 && x <= 9)) sp(px, py, 20, 20, 20); // Eyes
    }
    
    // Spine
    if (x >= 7 && x < 8 && y >= 5 && y <= 11) sp(px, py, ...BD);
    if (x >= 8 && x < 9 && y >= 5 && y <= 11) sp(px, py, ...B);
    
    // Ribs
    if (Math.floor(y) === 6 || Math.floor(y) === 8 || Math.floor(y) === 10) {
      if (x >= 5 && x <= 10) sp(px, py, ...B);
    }
    
    // Pelvis
    if (Math.floor(y) === 12 && x >= 6 && x <= 9) sp(px, py, ...B);
    
    // Limbs (curled up/broken)
    if (y >= 13 && x >= 4 && x <= 7) sp(px, py, ...BD);
    if (y >= 13 && x >= 8 && x <= 11) sp(px, py, ...B);
  });

  // ── GID 12 | frame 11 — Component item sprite (Gear/Mechanical) ──────────
  tile(11, (x, y, px, py) => {
    tr(px, py);
    const C1 = [160, 160, 170], C2 = [100, 100, 110], C3 = [220, 220, 230];
    const dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx*dx + dy*dy);
    
    // Gear shape
    if (d < 6) {
      const angle = Math.atan2(dy, dx);
      const teeth = Math.abs(Math.cos(angle * 4)); // 8 teeth
      if (d < 4 || (d < 6 && teeth > 0.5)) {
        let c = C2;
        if (d < 5 && dx < 0 && dy < 0) c = C3;
        else if (d < 5) c = C1;
        if (d < 2) tr(px, py); // Hole in center
        sp(px, py, ...c);
      }
    }
  });

  // ── GID 13 | frame 12 — Street lamp (off) ────────────────────────────────
  tile(12, (x, y, px, py) => {
    tr(px, py);
    if (x >= 7 && x < 9 && y >= 4 && y <= 15) sp(px, py,...MTL);
    if (x >= 7 && x < 8 && y >= 4 && y <= 15) sp(px, py,...MTL2);
    if (x >= 5 && x <= 10 && y >= 1 && y <= 4) {
      if (y >= 3.5 || x < 6 || x > 9.5) sp(px, py,...MTL);
      else sp(px, py,6,6,8);
    }
    if (y >= 4 && y < 5 && x >= 8 && x <= 11) sp(px, py,...MTL);
  });

  // ── GID 14 | frame 13 — Dead screen / monitor ────────────────────────────
  tile(13, (x, y, px, py) => {
    tr(px, py);
    if (x >= 1 && x <= 14 && y >= 2 && y <= 13) {
      if (x < 2 || x > 13 || y < 3 || y > 12) sp(px, py,...MTL);
      else {
        sp(px, py,5,5,8);
        if (x >= 3 && x < 4 && y >= 4 && y <= 7) sp(px, py,16,16,20); // faint reflection
      }
    }
    if (x >= 6 && x <= 9 && y >= 13 && y <= 15) sp(px, py,...MTL);
    if (x >= 4 && x <= 11 && y >= 14 && y <= 15) sp(px, py,...MTL);
  });

  // ── GID 15 | frame 14 — Security camera ──────────────────────────────────
  tile(14, (x, y, px, py) => {
    tr(px, py);
    if (x >= 6 && x <= 9 && y >= 1 && y <= 4) sp(px, py,...MTL2);
    if (x >= 2 && x <= 13 && y >= 4 && y <= 10) {
      if (x < 3 || x > 12 || y < 5 || y > 9) sp(px, py,...MTL);
      else sp(px, py,...MTL2);
    }
    const d = Math.abs(x-7.5)+Math.abs(y-7);
    if (d<2.5) sp(px, py,6,6,10);
    else if (d<4.5) sp(px, py,...MTL);
  });

  // ── GID 16 | frame 15 — Bench ────────────────────────────────────────────
  tile(15, (x, y, px, py) => {
    tr(px, py);
    if (x >= 1 && x <= 14 && y >= 5 && y <= 8) {
      if (x < 2 || x > 13) sp(px, py,...WOD); else sp(px, py,...WOD2);
    }
    if (x >= 1 && x <= 14 && y >= 2 && y <= 4.5) {
      if (y < 3) sp(px, py,...WOD); else sp(px, py,...WOD2);
    }
    for (const lx of [2,3,12,13]) {
      if (x >= lx && x < lx + 1 && y >= 9 && y <= 13) sp(px, py,...MTL);
    }
  });

  // ── GID 17 | frame 16 — Trash pile ───────────────────────────────────────
  tile(16, (x, y, px, py) => {
    let [r,g,b] = PAV;
    const d = Math.abs(x-8)*0.5 + Math.abs(y-10)*0.8;
    if (d<5) {
      const h=(x*5+y*3)%7;
      if (h<1)       [r,g,b]=MTL;
      else if (h<3)  [r,g,b]=WOD;
      else           [r,g,b]=RUB2;
    } else if (d<7) { [r,g,b]=RUB; }
    sp(px, py, r, g, b);
  });

  // ── GID 18 | frame 17 — Crate / storage box ──────────────────────────────
  tile(17, (x, y, px, py) => {
    tr(px, py);
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(px, py,...WOD);
      else {
        sp(px, py,...WOD2);
        if (x===7||x===8||y===7||y===8) sp(px, py,...WOD);
        if ((x<=3||x>=12)&&(y<=4||y>=11)) sp(px, py,...MTL);
      }
    }
  });

  // ── GID 19 | frame 18 — Interior wall (warmer brick, apartment walls) ─────
  tile(18, (x, y, px, py) => {
    const IW=[40,34,28], IW2=[54,46,38], IW3=[68,58,48];
    const row=Math.floor(y/4), lx=(x+(row%2)*8)%8, ly=y%4;
    if (lx===0||ly===0) sp(px, py,...IW);
    else {
      let [r,g,b]=IW2;
      if (lx===1&&ly===1) [r,g,b]=IW3;
      sp(px, py,r,g,b);
    }
  });

  // ── GID 20 | frame 19 — Counter / desk surface (top-down) ────────────────
  tile(19, (x, y, px, py) => {
    tr(px, py);
    if (x>=1&&x<=14&&y>=3&&y<=12) {
      if (x===1||x===14||y===3||y===12) sp(px, py,...MTL);
      else {
        sp(px, py,...MTL2);
        if (x===2&&y>=4&&y<=11) sp(px, py,...MTL3);
      }
    }
  });

  // ── GID 21 | frame 20 — Shelving unit ────────────────────────────────────
  tile(20, (x, y, px, py) => {
    tr(px, py);
    if ((x===1||x===14)&&y>=1&&y<=14) sp(px, py,...WOD);
    for (const sy of [3,7,11]) {
      if (y===sy&&x>=1&&x<=14) sp(px, py,...WOD2);
    }
    if (y>=1&&y<=2&&x>=3&&x<=5)   sp(px, py,...MTL);
    if (y>=4&&y<=6&&x>=8&&x<=10)  sp(px, py,...RUB);
    if (y>=8&&y<=10&&x>=3&&x<=4)  sp(px, py,...WOD);
  });

  // ── GID 22 | frame 21 — Table (top-down) ──────────────────────────────────
  tile(21, (x, y, px, py) => {
    tr(px, py);
    if (x>=2&&x<=13&&y>=3&&y<=12) {
      if (x===2||x===13||y===3||y===12) sp(px, py,...WOD);
      else {
        sp(px, py,...WOD2);
        if ((x+y)%6===0) sp(px, py,...WOD);
      }
    }
  });

  // ── GID 23 | frame 22 — Bed / cot ────────────────────────────────────────
  tile(22, (x, y, px, py) => {
    tr(px, py);
    const MAT=[50,42,54], MATL=[66,56,72];
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(px, py,...MTL);
      else {
        sp(px, py,...MAT);
        if (x>=3&&x<=6&&y>=3&&y<=6) sp(px, py,...MATL); // pillow
      }
    }
  });

  // ── GID 24 | frame 23 — Locked gate / metal bars ─────────────────────────
  tile(23, (x, y, px, py) => {
    let [r,g,b]=WAL;
    if (Math.floor(x)%4 === 1 || Math.floor(x)%4 === 2) { [r,g,b]=MTL2; }
    if (y >= 7 && y < 9) { [r,g,b]=MTL; }
    sp(px, py,r,g,b);
    if (x>=6&&x<=9&&y>=6&&y<=9) {
      sp(px, py,...MTL);
      if (x >= 7 && x < 9 && y >= 7 && y < 9) sp(px, py,6,6,10);
    }
  });

  // ── GID 25 | frame 24 — Manhole cover ────────────────────────────────────
  tile(24, (x, y, px, py) => {
    let [r,g,b]=PAV;
    const dx=x-7.5, dy=y-7.5, d=Math.sqrt(dx*dx+dy*dy);
    if (d < 7) {
      if (d > 5.5) { [r,g,b] = MTL; }
      else {
        [r,g,b] = MTL2;
        if (Math.abs(dx) < 1.1 || Math.abs(dy) < 1.1) [r,g,b] = MTL;
        if (Math.abs(dx+dy) < 1.3 || Math.abs(dx-dy) < 1.3) [r,g,b] = MTL;
      }
    }
    sp(px, py,r,g,b);
  });

  // ── GID 26 | frame 25 — Generator block ──────────────────────────────────
  tile(25, (x, y, px, py) => {
    tr(px, py);
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x < 2 || x > 13 || y < 3 || y > 12) sp(px, py,...MTL);
      else {
        sp(px, py,...MTL2);
        for (const vy of [4,6,8,10]) {
          if (Math.floor(y) === vy && x >= 3 && x <= 12) sp(px, py,...MTL);
        }
        if (x>=6&&x<=8&&y>=11&&y<=12) sp(px, py,38,10,8); // off indicator
      }
    }
  });

  // ── GID 27 | frame 26 — Electrical panel ─────────────────────────────────
  tile(26, (x, y, px, py) => {
    tr(px, py);
    if (x>=2&&x<=13&&y>=1&&y<=14) {
      if (x < 3 || x > 12 || y < 2 || y > 13) sp(px, py,...MTL);
      else {
        sp(px, py,...CON);
        if (y>=2&&y<=3) sp(px, py,...MTL);
        for (const sy of [5,8,11]) for (const sx of [4,7,10]) {
          if (Math.floor(x)===sx && Math.floor(y)===sy) sp(px, py,...MTL2);
          if (Math.floor(x)===sx+1 && Math.floor(y)===sy) sp(px, py,...MTL);
        }
      }
    }
  });

  // ── GID 28 | frame 27 — Dark window (unlit) in wall ──────────────────────
  tile(27, (x, y, px, py) => {
    let [r,g,b]=WAL2;
    if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
      if (x < 3 || x > 12 || y < 3 || y > 12 || (x >= 7 && x < 9) || (y >= 7 && y < 9)) [r,g,b] = MTL;
      else {
        [r,g,b] = [10,12,18];
        if (x >= 3.5 && x <= 5.5 && y >= 3.5 && y <= 5.5) [r,g,b] = [20,22,30];
      }
    }
    sp(px, py,r,g,b);
  });

  // ── GID 29 | frame 28 — Door frame / threshold ───────────────────────────
  tile(28, (x, y, px, py) => {
    let [r,g,b]=FLR;
    if (x < 1 || x >= 15 || y < 1) { [r,g,b] = MTL; }
    if (x >= 2 && x <= 13 && y >= 1 && y <= 13) { r += 10; g += 8; b += 6; }
    if (y >= 14) { [r,g,b] = MTL; }
    sp(px, py,r,g,b);
  });

  // ── GID 30 | frame 29 — Reinforced wall (sealed city boundary) ───────────
  tile(29, (x, y, px, py) => {
    const RW=[16,14,20], RW2=[26,22,32];
    const row=Math.floor(y/8), lx=(x+(row%2)*8)%16, ly=y%8;
    if (lx < 1 || ly < 1) sp(px, py,...RW); else sp(px, py,...RW2);
  });

  // ── GID 31 | frame 30 — Memorial / civic marker ───────────────────────────
  tile(30, (x, y, px, py) => {
    tr(px, py);
    const ST=[42,34,34], STL=[58,46,46];
    if (x>=3&&x<=12&&y>=10&&y<=14) {
      if (x===3||x===12||y===14) sp(px, py,...ST); else sp(px, py,...STL);
    }
    if (x>=6&&x<=9&&y>=5&&y<=10) sp(px, py,...ST);
    const d=Math.sqrt((x-7.5)**2+(y-3.5)**2);
    if (d<3) sp(px, py,...(d<2?STL:ST));
  });

  // ── GID 32 | frame 31 — Worn carpet (interior floor variation) ───────────
  tile(31, (x, y, px, py) => {
    let [r,g,b]=CRP;
    if (x===0||x===15||y===0||y===15) { [r,g,b]=CRP2; }
    else if (x%4===0&&y%4===0) { [r,g,b]=CRP3; }
    else if ((x+y)%8<2) { r-=4; g-=4; b-=3; }
    sp(px, py,r,g,b);
  });

  // ── GID 33 | frame 32 — Cracked pavement (street variation) ──────────────
  tile(32, (x, y, px, py) => {
    let [r,g,b]=PAV;
    if (x===0||x===8||y===0||y===8) { [r,g,b]=PAV2; }
    if ((x*7+y*13+x*y)%19===0) { r+=8; g+=8; b+=10; }
    // Diagonal crack from (3,1) to (11,14)
    const cr = Math.abs(13*(x-3)-8*(y-1))/Math.sqrt(169+64);
    if (cr < 1.2 && x >= 3 && x <= 11 && y >= 1 && y <= 14) {
      [r,g,b] = PAV3;
      if (cr < 0.6) { r += 8; g += 8; b += 10; }
    }
    sp(px, py,r,g,b);
  });

  // ── GID 34 | frame 33 — Trap door ────────────────────────────────────────
  tile(33, (x, y, px, py) => {
    tr(px, py);
    const WD=[42, 28, 16], WD2=[58, 42, 26];
    if (x>=1&&x<=14&&y>=1&&y<=14) {
      if (x===1||x===14||y===1||y===14) sp(px, py,...WD);
      else {
        sp(px, py,...WD2);
        if (x>=6&&x<=9&&y>=6&&y<=9) sp(px, py,...WD); // handle
      }
    }
  });

  // ── GID 35 | frame 34 — Metal pipe (Horizontal) ──────────────────────────
  tile(34, (x, y, px, py) => {
    tr(px, py);
    if (y >= 5 && y <= 10) {
      let c = MTL2;
      if (y < 6.5 || y > 8.5) c = MTL;
      if (y >= 7 && y < 8) c = MTL3;
      sp(px, py,...c);
    }
  });

  // ── GID 36 | frame 35 — Metal pipe (Vertical) ────────────────────────────
  tile(35, (x, y, px, py) => {
    tr(px, py);
    if (x >= 5 && x <= 10) {
      let c = MTL2;
      if (x < 6.5 || x > 8.5) c = MTL;
      if (x >= 7 && x < 8) c = MTL3;
      sp(px, py,...c);
    }
  });

  // ── GID 37 | frame 36 — Drainage Grating ─────────────────────────────────
  tile(36, (x, y, px, py) => {
    let [r,g,b] = PAV;
    if (x>=2&&x<=13&&y>=2&&y<=13) {
      if (Math.floor(x)%3===0) [r,g,b] = [10,10,15];
      else [r,g,b] = MTL;
    }
    sp(px, py,r,g,b);
  });

  // ── GID 38 | frame 37 — Small Bush ───────────────────────────────────────
  tile(37, (x, y, px, py) => {
    tr(px, py);
    const d = Math.sqrt(Math.pow(x-8,2) + Math.pow(y-10,2));
    if (d < 6) {
      let c = GRN;
      if (Math.floor(x+y)%4 === 0) c = GRN2;
      sp(px, py,...c);
    }
  });

  // ── GID 39 | frame 38 — Small dead tree ──────────────────────────────────
  tile(38, (x, y, px, py) => {
    tr(px, py);
    if (x>=7 && x<10 && y>=8) sp(px, py,...WOD);
    if ((Math.floor(x)===6||Math.floor(x)===10) && y>=10) sp(px, py,...WOD2);
    if (y < 10 && Math.abs(x-8) < (11-y)/2) sp(px, py,...WOD);
  });

  // ── GID 40 | frame 39 — Flashlight Charger ─────────────────────────────────
  tile(39, (x, y, px, py) => {
    let [r,g,b] = MTL;
    if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
       [r,g,b] = MTL2;
       if (x < 3 || x > 12 || y < 3 || y > 12) [r,g,b] = MTL;
       // Lightning bolt / Indicator
       const isBolt = (x >= 7.5 && x < 8.5 && y >= 4 && y <= 11) || (x >= 6.5 && x < 7.5 && y >= 7 && y < 8) || (x >= 8.5 && x < 9.5 && y >= 7 && y < 8);
       if (isBolt) {
         [r,g,b] = [255, 255, 0]; // Bright Yellow
       }
    }
    sp(px, py,r,g,b);
  });

  // ── GID 41-49 | frame 40-48 — Large City Tree (3x3) ──────────────────────
  // We'll define a helper to draw the 3x3 tree
  const treeTiles = [40, 41, 42, 43, 44, 45, 46, 47, 48];
  treeTiles.forEach((tileId, index) => {
    const tx = index % 3;
    const ty = Math.floor(index / 3);
    tile(tileId, (x, y, px, py) => {
      tr(px, py);
      const gx = tx * 16 + x;
      const gy = ty * 16 + y;

      // Trunk logic (centered in bottom-middle)
      const isTrunk = (gx >= 20 && gx <= 28 && gy >= 30) || (gx >= 22 && gx <= 26 && gy >= 16);
      
      // Foliage logic (SDF-ish)
      const distToTop = Math.sqrt(Math.pow(gx-24, 2) + Math.pow(gy-12, 2));
      const distToLeft = Math.sqrt(Math.pow(gx-12, 2) + Math.pow(gy-20, 2));
      const distToRight = Math.sqrt(Math.pow(gx-36, 2) + Math.pow(gy-20, 2));
      
      let isFoliage = distToTop < 10 || distToLeft < 9 || distToRight < 9;
      
      // Make it gnarled/sparse
      const noise = (Math.sin(gx * 0.5) * Math.cos(gy * 0.5) * 5);
      if (isFoliage && (distToTop + noise > 9 && distToLeft + noise > 8 && distToRight + noise > 8)) {
        if ((gx + gy) % 3 === 0) isFoliage = false; // Sparsity
      }

      if (isTrunk) {
        let c = WOD;
        if (Math.floor(gx) % 4 === 0) c = WOD2;
        sp(px, py, ...c);
      } else if (isFoliage) {
        let c = GRN;
        if (Math.floor(gx + gy) % 5 === 0) c = GRN2;
        if (Math.floor(gx - gy) % 7 === 0) c = GRN3;
        // Post-outbreak: some brown leaves
        if (Math.floor(gx * 3 + gy) % 13 === 0) c = RUB;
        sp(px, py, ...c);
      }
    });
  });

  // ── GID 50 | frame 49 — Fuel canister item sprite ────────────────────────
  tile(49, (x, y, px, py) => {
    tr(px, py);
    const FC=[180,40,30], FM=[220,60,50], FD=[120,20,20]; // Red canister
    if (x>=6&&x<=9&&y>=1&&y<=3) { if(y < 2 || x < 7 || x > 8) sp(px, py,...MTL); }
    if (x>=5&&x<=10&&y>=3&&y<=5) { sp(px, py,...MTL); }
    if (x>=3&&x<=12&&y>=6&&y<=14) {
      if (x < 4 || x > 11 || y > 13) sp(px, py,...FD);
      else sp(px, py,...FC);
      if (x >= 4 && x < 5 && y >= 7 && y <= 12) sp(px, py,...FM);
    }
  });

  // ── Interior floor tiles ─────────────────────────────────────────────────

  // ── GID 51 | frame 50 — Bathroom tile floor ──────────────────────────────
  tile(50, (x, y, px, py) => {
    const lx = Math.floor(x) % 4, ly = Math.floor(y) % 4;
    if (lx === 0 || ly === 0) { sp(px, py, 150, 145, 140); }
    else {
      let r = 218, g = 213, b = 208;
      if (lx === 1 && ly === 1) { r = 230; g = 226; b = 222; }
      sp(px, py, r, g, b);
    }
  });

  // ── GID 52 | frame 51 — Medical / clinic floor ────────────────────────────
  tile(51, (x, y, px, py) => {
    const lx = Math.floor(x) % 8, ly = Math.floor(y) % 8;
    if (lx === 0 || ly === 0) { sp(px, py, 155, 153, 150); }
    else {
      let r = 183, g = 181, b = 178;
      if (lx < 2 && ly < 2) { r = 196; g = 194; b = 191; }
      sp(px, py, r, g, b);
    }
  });

  // ── GID 53 | frame 52 — Stained concrete ─────────────────────────────────
  tile(52, (x, y, px, py) => {
    let [r, g, b] = CON;
    if (x < 1 || y < 1) [r, g, b] = CON2;
    const stain = (Math.floor(x) * 7 + Math.floor(y) * 11) % 13;
    if (stain < 2) { r -= 14; g -= 12; b -= 10; }
    else if (stain < 5) { r -= 6; g -= 5; b -= 4; }
    if ((Math.floor(x) * 3 + Math.floor(y) * 5) % 11 === 0) { r += 4; g += 4; b += 4; }
    sp(px, py, r, g, b);
  });

  // ── Interior prop tiles ───────────────────────────────────────────────────

  // ── GID 54 | frame 53 — Chair (top-down) ─────────────────────────────────
  tile(53, (x, y, px, py) => {
    tr(px, py);
    // Backrest (thicker bar at top)
    if (x >= 3 && x <= 12 && y >= 2 && y <= 4) {
      sp(px, py, ...(y < 3 ? WOD : WOD2));
    }
    // Seat
    if (x >= 3 && x <= 12 && y >= 5 && y <= 13) {
      const edge = x < 4 || x > 11 || y < 6 || y > 12;
      sp(px, py, ...(edge ? WOD : WOD2));
    }
  });

  // ── GID 55 | frame 54 — Filing cabinet (top-down) ────────────────────────
  tile(54, (x, y, px, py) => {
    tr(px, py);
    if (x >= 2 && x <= 13 && y >= 1 && y <= 14) {
      if (x < 3 || x > 12 || y < 2 || y > 13) { sp(px, py, ...MTL); return; }
      sp(px, py, ...MTL2);
      if (Math.floor(y) === 5 || Math.floor(y) === 9) sp(px, py, ...MTL);
      const isHandle = x >= 6 && x <= 9 && (Math.floor(y) === 3 || Math.floor(y) === 7 || Math.floor(y) === 11);
      if (isHandle) sp(px, py, ...MTL3);
    }
  });

  // ── GID 56 | frame 55 — Bookcase (top-down) ──────────────────────────────
  tile(55, (x, y, px, py) => {
    tr(px, py);
    if (x >= 1 && x <= 14 && y >= 2 && y <= 13) {
      if (x < 2 || x > 13 || y < 3 || y > 12) { sp(px, py, ...WOD); return; }
      if (x === 7 || x === 8) { sp(px, py, ...WOD2); return; }
      const BK = [[80,28,28],[28,50,82],[55,78,38],[82,65,28]];
      sp(px, py, ...BK[Math.floor((x - 2) / 2) % 4]);
    }
  });

  // ── GID 57 | frame 56 — Toilet (top-down) ────────────────────────────────
  tile(56, (x, y, px, py) => {
    tr(px, py);
    const T = [210, 205, 200], T2 = [182, 177, 172];
    // Tank
    if (x >= 4 && x <= 11 && y >= 1 && y <= 5) {
      sp(px, py, ...(x < 5 || x > 10 || y < 2 || y > 4 ? T2 : T));
    }
    // Neck
    if (x >= 6 && x <= 9 && y >= 5 && y <= 6) sp(px, py, ...T2);
    // Bowl (oval SDF)
    const dx = x - 7.5, dy = y - 11;
    if ((dx * dx) / (4.2 * 4.2) + (dy * dy) / (4.8 * 4.8) < 1) {
      const inner = (dx * dx) / (2.8 * 2.8) + (dy * dy) / (3.4 * 3.4) < 1;
      sp(px, py, ...(inner ? [14, 18, 26] : T));
    }
  });

  // ── GID 58 | frame 57 — Sink (top-down) ──────────────────────────────────
  tile(57, (x, y, px, py) => {
    tr(px, py);
    const SN = [196, 193, 190], SN2 = [168, 165, 162];
    // Basin
    if (x >= 2 && x <= 13 && y >= 3 && y <= 12) {
      if (x < 3 || x > 12 || y < 4 || y > 11) { sp(px, py, ...SN2); return; }
      sp(px, py, 16, 20, 30);
      if (Math.abs(x - 7.5) < 1.5 && Math.abs(y - 7.5) < 1.5) sp(px, py, 42, 40, 38);
      if (Math.abs(x - 7.5) < 0.6 && Math.abs(y - 7.5) < 0.6) sp(px, py, 22, 20, 18);
    }
    // Faucet
    if (x >= 6 && x <= 9 && y >= 2 && y <= 4) sp(px, py, ...SN);
  });

  // ── GID 59 | frame 58 — Dead potted plant ────────────────────────────────
  tile(58, (x, y, px, py) => {
    tr(px, py);
    const P = [82, 56, 40], P2 = [102, 72, 54], SOIL = [32, 22, 16], DEAD = [54, 48, 30];
    // Dead stems and wilted leaves
    if (x >= 6 && x <= 7 && y >= 3 && y <= 9) sp(px, py, ...DEAD);
    if (x >= 8 && x <= 9 && y >= 5 && y <= 9) sp(px, py, ...DEAD);
    if (y >= 4 && y <= 6 && x >= 3 && x <= 6) sp(px, py, ...DEAD);
    if (y >= 6 && y <= 8 && x >= 9 && x <= 12) sp(px, py, ...DEAD);
    // Pot
    if (x >= 4 && x <= 11 && y >= 9 && y <= 14) {
      if (x < 5 || x > 10 || y > 13) sp(px, py, ...P);
      else sp(px, py, y < 10 ? P2 : SOIL);
    }
  });

  // ── Exterior prop tiles ───────────────────────────────────────────────────

  // ── GID 60 | frame 59 — Dumpster ─────────────────────────────────────────
  tile(59, (x, y, px, py) => {
    tr(px, py);
    const D = [28, 52, 34], D2 = [44, 72, 50], D3 = [18, 34, 22];
    // Lid
    if (x >= 2 && x <= 13 && y >= 1 && y <= 4) {
      sp(px, py, ...(x >= 3 && x <= 12 && y >= 2 && y <= 3 ? D : D3));
    }
    // Body
    if (x >= 1 && x <= 14 && y >= 3 && y <= 14) {
      if (x < 2 || x > 13 || y > 13) { sp(px, py, ...D3); return; }
      sp(px, py, ...(x < 4 ? D2 : D));
    }
    // Wheels
    if ((x <= 3 || x >= 12) && y >= 13 && y <= 15) sp(px, py, 18, 18, 18);
  });

  // ── GID 61 | frame 60 — Fire hydrant ─────────────────────────────────────
  tile(60, (x, y, px, py) => {
    tr(px, py);
    const H = [172, 34, 24], H2 = [214, 58, 42], H3 = [116, 18, 12];
    if (x >= 4 && x <= 11 && y >= 11 && y <= 14) sp(px, py, ...(x < 5 || x > 10 ? H3 : H));
    if (x >= 5 && x <= 10 && y >= 5 && y <= 11) sp(px, py, ...(x < 7 ? H2 : H));
    if (x >= 6 && x <= 9 && y >= 3 && y <= 5) sp(px, py, ...H3);
    if ((x >= 3 && x <= 4 || x >= 11 && x <= 12) && y >= 7 && y <= 9) sp(px, py, ...H3);
  });

  // ── GID 62 | frame 61 — Bus stop sign ────────────────────────────────────
  tile(61, (x, y, px, py) => {
    tr(px, py);
    // Pole
    if (x >= 7 && x < 9 && y >= 4 && y <= 15) sp(px, py, ...(x < 8 ? MTL2 : MTL));
    // Sign panel
    if (x >= 3 && x <= 12 && y >= 1 && y <= 5) {
      if (x < 4 || x > 11 || y < 2 || y > 4) { sp(px, py, 22, 68, 148); return; }
      sp(px, py, 40, 98, 190);
      if (y >= 3 && y <= 3 && x >= 5 && x <= 10) sp(px, py, 220, 220, 230);
    }
  });

  // ── Item sprite tiles ─────────────────────────────────────────────────────

  // ── GID 63 | frame 62 — Crowbar ──────────────────────────────────────────
  tile(62, (x, y, px, py) => {
    tr(px, py);
    const C = [54, 54, 64], C2 = [74, 74, 86], C3 = [34, 34, 42];
    // Shaft
    if (x >= 7 && x <= 9 && y >= 3 && y <= 13) sp(px, py, ...(x < 8 ? C2 : x < 9 ? C : C3));
    // Curved hook end (top)
    if (y >= 3 && y <= 5 && x >= 9 && x <= 12) sp(px, py, ...C);
    if (y >= 2 && y <= 4 && x >= 11 && x <= 13) sp(px, py, ...C3);
    // Flat pry end (bottom)
    if (y >= 13 && y <= 14 && x >= 5 && x <= 8) sp(px, py, ...C);
    if (y >= 14 && y <= 15 && x >= 4 && x <= 6) sp(px, py, ...C3);
  });

  // ── GID 64 | frame 63 — Electronic keycard ───────────────────────────────
  tile(63, (x, y, px, py) => {
    tr(px, py);
    const KC = [48, 88, 138], KC2 = [68, 118, 176];
    if (x >= 2 && x <= 13 && y >= 4 && y <= 11) {
      if (x < 3 || x > 12 || y < 5 || y > 10) { sp(px, py, ...KC); return; }
      sp(px, py, ...KC2);
      if (y >= 6 && y <= 7) sp(px, py, 195, 172, 38); // magnetic stripe
      if (x >= 9 && x <= 11 && y >= 8 && y <= 9) sp(px, py, 195, 172, 38); // chip
    }
  });

  // ── GID 65 | frame 64 — Battery pack ─────────────────────────────────────
  tile(64, (x, y, px, py) => {
    tr(px, py);
    const B = [50, 50, 56], B2 = [70, 70, 78], B3 = [100, 100, 112];
    // Body
    if (x >= 3 && x <= 12 && y >= 4 && y <= 13) {
      if (x < 4 || x > 11 || y < 5 || y > 12) { sp(px, py, ...B); return; }
      sp(px, py, ...B2);
      if (y >= 7 && y <= 9 && x >= 5 && x <= 10) sp(px, py, 18, 138, 48); // charge indicator
    }
    // Positive terminal
    if (x >= 5 && x <= 10 && y >= 2 && y <= 4) sp(px, py, ...B3);
    if (x >= 7 && x <= 8 && y >= 1 && y <= 2) sp(px, py, ...B3);
  });

  // ── GID 66 | frame 65 — Map fragment ─────────────────────────────────────
  tile(65, (x, y, px, py) => {
    tr(px, py);
    const M = [168, 148, 106], M2 = [138, 120, 80], M3 = [108, 90, 60];
    // Torn corner (top-right missing)
    if (x >= 11 && y < 7) return;
    if (x >= 2 && x <= 13 && y >= 1 && y <= 14) {
      if (x < 3 || x > 12 || y < 2 || y > 13) { sp(px, py, ...M2); return; }
      sp(px, py, ...M);
      if (Math.floor(x) % 3 === 0 || Math.floor(y) % 3 === 0) sp(px, py, ...M3);
      if (x >= 4 && x <= 7 && y >= 4 && y <= 7) sp(px, py, ...M3); // block A
      if (x >= 8 && x <= 11 && y >= 8 && y <= 11) sp(px, py, ...M3); // block B
    }
  });

  // ── GID 67 | frame 66 — Medicine bottle ──────────────────────────────────
  tile(66, (x, y, px, py) => {
    tr(px, py);
    const MED = [52, 80, 52], MED2 = [72, 108, 72], CAP = [220, 220, 60];
    const dx = x - 7.5, dy = y - 9.5;
    if (dx * dx / (3.5 * 3.5) + dy * dy / (5.5 * 5.5) < 1) {
      sp(px, py, ...(dx < -0.5 && dy < -1 ? MED2 : MED));
      if (dy >= -1.5 && dy <= 1.5 && Math.abs(dx) < 2.5) sp(px, py, 230, 228, 224); // label
      if (dy >= -0.5 && dy <= 0.5 && Math.abs(dx) < 1.5) sp(px, py, 190, 38, 38);   // red cross
    }
    if (x >= 6 && x <= 9 && y >= 1 && y <= 4) sp(px, py, ...CAP);
  });

  // ── More interior prop tiles ──────────────────────────────────────────────

  // ── GID 68 | frame 67 — Locker ───────────────────────────────────────────
  tile(67, (x, y, px, py) => {
    tr(px, py);
    if (x >= 2 && x <= 13 && y >= 1 && y <= 14) {
      if (x < 3 || x > 12 || y < 2 || y > 13) { sp(px, py, ...MTL); return; }
      sp(px, py, ...MTL2);
      for (let vy = 3; vy <= 5; vy++) if (Math.floor(y) === vy && x >= 4 && x <= 11) sp(px, py, 14, 14, 20);
      if (x >= 7 && x <= 8 && y >= 7 && y <= 9) sp(px, py, ...MTL3); // handle
      if (x >= 7 && x < 8 && y >= 6 && y <= 13) sp(px, py, ...MTL);  // seam
    }
  });

  // ── GID 69 | frame 68 — Small trash can ──────────────────────────────────
  tile(68, (x, y, px, py) => {
    tr(px, py);
    const TC = [50, 50, 54], TC2 = [68, 68, 74];
    // Tapered body
    if (x >= 4 && x <= 11 && y >= 5 && y <= 14) {
      const taper = Math.max(0, Math.floor((y - 8) / 3));
      if (x < 4 + taper || x > 11 - taper || y > 13) { sp(px, py, ...TC); return; }
      sp(px, py, ...TC2);
      if (Math.floor(y) % 3 === 0) sp(px, py, ...TC); // rings
    }
    if (x >= 3 && x <= 12 && y >= 4 && y <= 6) sp(px, py, ...TC); // rim
    if (x >= 5 && x <= 10 && y >= 4 && y <= 6) sp(px, py, 38, 36, 34); // trash visible
  });

  // ── GID 70 | frame 69 — Curtain / drape ──────────────────────────────────
  tile(69, (x, y, px, py) => {
    tr(px, py);
    const CR = [78, 48, 58], CR2 = [98, 62, 74], CR3 = [58, 34, 44];
    if (y >= 1 && y <= 2 && x >= 1 && x <= 14) sp(px, py, ...MTL); // rod
    for (const rx of [2, 5, 8, 11, 14]) if (Math.floor(x) === rx && y >= 2 && y <= 3) sp(px, py, ...MTL2);
    if (y >= 3 && y <= 15 && x >= 1 && x <= 14) {
      const fold = Math.floor(x / 2) % 2;
      sp(px, py, ...(x < 2 || x > 13 ? CR3 : fold === 0 ? CR : CR2));
    }
  });

  return encodePNG(W, H, px);
}

// ── Main ────────────────────────────────────────────────────────────────────

const root = path.join(__dirname, '..');
const tilemapDir = path.join(root, 'public', 'assets', 'tilemaps');

fs.mkdirSync(tilemapDir, { recursive: true });

const outputPath = path.join(tilemapDir, 'tileset.png');
fs.writeFileSync(outputPath, generateTileset());

console.log(`Generated: ${outputPath}`);
console.log(`  tileset.png  (512x1024, 8x16 tiles, 64x64px each)`);

