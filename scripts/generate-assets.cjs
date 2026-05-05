/**
 * Procedural asset generator for WARDEN placeholder art.
 * Pure Node.js — zero external dependencies (uses built-in zlib).
 * Run: node scripts/generate-assets.cjs
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
  const ROWS = 8;
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

  return encodePNG(W, H, px);
}


// ── Tilemap generator ───────────────────────────────────────────────────────

const TILESET_META = {
  firstgid: 1,
  name: 'tileset',
  tilewidth: BASE * S,
  tileheight: BASE * S,
  tilecount: 128,
  columns: 8,
  image: 'tileset.png',
  imagewidth: 128 * S,   // 512px — 8 cols unchanged
  imageheight: 256 * S,  // 1024px — 16 rows (was 8)
  margin: 0,
  spacing: 0,
};

function generateTilemap(roomWidth, roomHeight, opts) {
  const {
    groundTile = 1,
    doorGaps = [],
    decorations = [],
    interiorWalls = [],
    signPositions = [],
    trees = [],
  } = opts;

  const ground = [];
  const collision = [];
  const above = [];

  for (let y = 0; y < roomHeight; y++) {
    for (let x = 0; x < roomWidth; x++) {
      above.push(0);

      // Ground: base tile
      let gTile = groundTile;
      // Door accent tile at doorway gaps
      for (const gap of doorGaps) {
        if (x >= gap.x1 && x <= gap.x2 && y >= gap.y1 && y <= gap.y2) {
          gTile = gap.tile || 29;
        }
      }
      // Decorations layered on top
      for (const d of decorations) {
        if (x >= d.x1 && x <= d.x2 && y >= d.y1 && y <= d.y2) gTile = d.tile;
      }
      
      // Trees (3x3)
      for (const t of trees) {
        if (x >= t.x && x <= t.x + 2 && y >= t.y && y <= t.y + 2) {
          const relX = x - t.x;
          const relY = y - t.y;
          const tIdx = relY * 3 + relX;
          const tileId = 41 + tIdx;
          
          if (tIdx === 7) {
            // Trunk tile
            gTile = tileId;
          } else {
            // Foliage tile
            above[above.length - 1] = tileId;
          }
        }
      }
      
      ground.push(gTile);

      // Collision: border walls + interior walls + sign blocking + tree trunk
      const isBorder = x === 0 || x === roomWidth - 1 || y === 0 || y === roomHeight - 1;
      let isInterior = false;
      for (const w of interiorWalls) {
        if (x >= w.x1 && x <= w.x2 && y >= w.y1 && y <= w.y2) {
          isInterior = true;
          break;
        }
      }
      let isSign = false;
      for (const s of signPositions) {
        if (x === s.x && y === s.y) {
          isSign = true;
          break;
        }
      }
      let treeCollisionGID = 0;
      for (const t of trees) {
        if (x === t.x + 1 && y === t.y + 2) {
          treeCollisionGID = 48; // Trunk GID
          break;
        }
      }
      let isDoorGap = false;
      for (const gap of doorGaps) {
        if (x >= gap.x1 && x <= gap.x2 && y >= gap.y1 && y <= gap.y2) {
          isDoorGap = true;
          break;
        }
      }

      if (isSign) {
        collision.push(5);
      } else if (treeCollisionGID) {
        collision.push(treeCollisionGID);
      } else if (isDoorGap) {
        collision.push(0);
      } else if (isInterior || isBorder) {
        collision.push(2);
      } else {
        collision.push(0);
      }
    }
  }

  return {
    width: roomWidth,
    height: roomHeight,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tilewidth: BASE * S,
    tileheight: BASE * S,
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    nextlayerid: 4,
    nextobjectid: 1,
    layers: [
      { id: 1, name: 'Ground', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: roomWidth, height: roomHeight, data: ground },
      { id: 2, name: 'Collision', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: roomWidth, height: roomHeight, data: collision },
      { id: 3, name: 'Above', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: roomWidth, height: roomHeight, data: above },
    ],
    tilesets: [TILESET_META],
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

const root = path.join(__dirname, '..');
const tilemapDir = path.join(root, 'public', 'assets', 'tilemaps');
const spriteDir = path.join(root, 'public', 'assets', 'sprites');

fs.mkdirSync(tilemapDir, { recursive: true });
fs.mkdirSync(spriteDir, { recursive: true });

// Tileset PNG (64 tiles)
// fs.writeFileSync(path.join(tilemapDir, 'tileset.png'), generateTileset());
// console.log(`  tileset.png  (${TILESET_META.imagewidth}x${TILESET_META.imageheight}, ${TILESET_META.tilecount} tiles)`);

// Player spritesheet PNG
const { generatePlayer, PLAYER_VARIANTS } = require('./generate-player-lib.cjs');
const { generateAfflicted, generateVialCure, AFFLICTED_VARIANTS } = require('./generate-afflicted-lib.cjs');

fs.writeFileSync(path.join(spriteDir, 'player.png'), generatePlayer(1.0625, 'cultist'));
console.log(`  player.png   (68x68, 4x4 frames of 17x17, cultist)`);

fs.writeFileSync(path.join(spriteDir, 'player-bigger.png'), generatePlayer(1.0625 * 1.35, 'cultist'));
console.log(`  player-bigger.png (${Math.round(64 * 1.0625 * 1.35)}x${Math.round(64 * 1.0625 * 1.35)})`);

// Item sprites
fs.writeFileSync(path.join(spriteDir, 'vial_cure.png'), generateVialCure());
console.log(`  vial_cure.png (32x32)`);

// Named player variant sprites for recovered residents (all except cultist = protagonist)
for (const variantName of Object.keys(PLAYER_VARIANTS).filter(v => v !== 'cultist')) {
  const outputPath = path.join(spriteDir, `player-${variantName}.png`);
  fs.writeFileSync(outputPath, generatePlayer(1.0625, variantName));
  console.log(`  player-${variantName}.png (68x68, 4x4 frames of 17x17)`);
}

// Afflicted variants
for (const variantName of Object.keys(AFFLICTED_VARIANTS)) {
  const outputPath = path.join(spriteDir, `afflicted-${variantName}.png`);
  fs.writeFileSync(outputPath, generateAfflicted(1.0625, variantName));
  console.log(`  afflicted-${variantName}.png (68x68, 4x4 frames of 17x17)`);
}

// ── City street (96×72 = 1536×1152px) ───────────────────────────────────────
//
// The city is SEALED — no border gaps. The outer walls are the game boundary.
// Escaping them is the endgame.
//
// Door zone positions from rooms.json:
//   Apt 4A:         x=128  → gap tiles x=8-9,   y=60
//   House B:        x=368  → gap tiles x=23-24, y=60
//   Protag house:   x=752  → gap tiles x=47-48, y=60
//   Laundromat:     x=928  → gap tiles x=58-59, y=60
//   House C:        x=1136 → gap tiles x=71-72, y=60
//   Depot:          x=1312 → gap tiles x=82-83, y=60
//
//   Clinic:         x=160  → gap tiles x=10-11, y=19
//   Records:        x=160  → gap tiles x=10-11, y=33
//   Utility:        x=160  → gap tiles x=10-11, y=53
//   Market:         x=1280 → gap tiles x=80-81, y=19
//   Ration:         x=1312 → gap tiles x=82-83, y=33
//   East Block:     x=1312 → gap tiles x=82-83, y=53
//
// City wall inner faces: y=1-5 (N), y=66-70 (S), x=1-4 (W), x=91-94 (E).
const cityStreet = generateTilemap(96, 72, {
  groundTile: 1, // dark pavement
  doorGaps: [
    { x1: 8,  x2: 9,  y1: 60, y2: 60 },
    { x1: 23, x2: 24, y1: 60, y2: 60 },
    { x1: 47, x2: 48, y1: 60, y2: 60 },
    { x1: 58, x2: 59, y1: 60, y2: 60 },
    { x1: 71, x2: 72, y1: 60, y2: 60 },
    { x1: 82, x2: 83, y1: 60, y2: 60 },
    { x1: 10, x2: 11, y1: 19, y2: 19 },
    { x1: 10, x2: 11, y1: 33, y2: 33 },
    { x1: 10, x2: 11, y1: 53, y2: 53 },
    { x1: 80, x2: 81, y1: 19, y2: 19 },
    { x1: 82, x2: 83, y1: 33, y2: 33 },
    { x1: 82, x2: 83, y1: 53, y2: 53 },
  ],
  decorations: [
    // Cracked pavement approach to south building row
    { x1:  5, x2: 90, y1: 57, y2: 59, tile: 32 },
    // Overgrown strips along north sidewalk (inside of north city wall)
    { x1:  5, x2: 90, y1:  6, y2:  7, tile: 6 },
    // Scattered overgrown patches — nature reclaiming the street
    { x1: 22, x2: 24, y1: 28, y2: 30, tile: 6 },
    { x1: 58, x2: 60, y1: 28, y2: 30, tile: 6 },
    { x1: 38, x2: 40, y1: 44, y2: 46, tile: 6 }, // memorial area
    { x1: 52, x2: 54, y1: 44, y2: 46, tile: 6 },
    // Rubble patches near east and west walls
    { x1:  5, x2:  8, y1: 20, y2: 25, tile: 7 },
    { x1: 86, x2: 90, y1: 20, y2: 25, tile: 7 },
  ],
  trees: [
    { x: 40, y: 42 },
    { x: 50, y: 42 },
    { x: 15, y: 10 },
    { x: 75, y: 10 },
    { x: 30, y: 25 },
    { x: 60, y: 25 },
  ],
  interiorWalls: [
    // ── City wall inner faces (sealed, no gaps) ──────────────────────────
    { x1:  1, x2: 94, y1:  1, y2:  5 }, // north
    { x1:  1, x2: 94, y1: 66, y2: 70 }, // south
    { x1:  1, x2:  4, y1:  6, y2: 65 }, // west
    { x1: 91, x2: 94, y1:  6, y2: 65 }, // east

    // ── North-side building facades ──────────────────────────
    { x1: 10, x2: 22, y1: 19, y2: 22 }, // Clinic (west side)
    { x1: 38, x2: 52, y1: 11, y2: 14 }, // Central block (north gate)
    { x1: 72, x2: 86, y1: 19, y2: 22 }, // Market Grocer (east side)

    // ── West-side building facades ──────────────────────────
    { x1:  9, x2: 15, y1: 33, y2: 36 }, // Civic Records Office
    { x1:  9, x2: 15, y1: 53, y2: 56 }, // Utilities Substation

    // ── East-side building facades ──────────────────────────
    { x1: 80, x2: 86, y1: 33, y2: 36 }, // Emergency Ration Office
    { x1: 80, x2: 86, y1: 53, y2: 56 }, // East Block Apartments

    // ── South building row — 2 tiles deep (face + one body row)
    // Layout west→east: Apt4A | [HouseB] | Boarded | [Protag] | Laundromat | [HouseC] | Depot

    // Apt 4A
    { x1:  7, x2: 15, y1: 60, y2: 61 },

    // House B — gap at x=23-24
    { x1: 20, x2: 22, y1: 60, y2: 60 },
    { x1: 25, x2: 28, y1: 60, y2: 60 },
    { x1: 20, x2: 28, y1: 61, y2: 61 },

    // Boarded suite
    { x1: 32, x2: 39, y1: 60, y2: 61 },

    // Protag house — gap at x=47-48
    { x1: 44, x2: 46, y1: 60, y2: 60 },
    { x1: 49, x2: 52, y1: 60, y2: 60 },
    { x1: 44, x2: 52, y1: 61, y2: 61 },

    // Laundromat — gap at 58-59
    { x1: 57, x2: 57, y1: 60, y2: 60 },
    { x1: 60, x2: 64, y1: 60, y2: 60 },
    { x1: 57, x2: 64, y1: 61, y2: 61 },

    // House C — gap at x=71-72
    { x1: 68, x2: 70, y1: 60, y2: 60 },
    { x1: 73, x2: 76, y1: 60, y2: 60 },
    { x1: 68, x2: 76, y1: 61, y2: 61 },

    // Depot / Maintenance — gap at 82-83
    { x1: 80, x2: 81, y1: 60, y2: 60 },
    { x1: 84, x2: 88, y1: 60, y2: 60 },
    { x1: 80, x2: 88, y1: 61, y2: 61 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'city-street.json'), JSON.stringify(cityStreet));
console.log('  city-street.json  (96x72)');

// ── House B interior — Apartment 4B (18×13 = 288×208px — fits viewport, centered) ─
// Smaller than protag house. Single room with a kitchen area, table, and a bed nook.
// Door at north wall center (x=8-9). Calendar on west wall. Note on kitchen table.
const houseB = generateTilemap(18, 13, {
  groundTile: 3,
  doorGaps: [
    { x1: 8, x2: 9, y1: 0, y2: 0 }, // north door → city street
  ],
  decorations: [
    // Bed nook (east side) — worn carpet
    { x1: 14, x2: 16, y1: 7, y2: 11, tile: 32 },
    // Kitchen area (south-west) — same interior floor, no change needed
    { x1: 1, x2: 5, y1: 9, y2: 11, tile: 3 },
  ],
  interiorWalls: [
    // Calendar wall (west, top — blocking prop)
    { x1: 1, x2: 2, y1: 1, y2: 2 },
    // Kitchen counter
    { x1: 1, x2: 5, y1: 8, y2: 8 },
    // Wardrobe (east wall)
    { x1: 16, x2: 16, y1: 1, y2: 4 },
    // Partition nook for bed
    { x1: 12, x2: 13, y1: 6, y2: 6 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'house-b.json'), JSON.stringify(houseB));
console.log('  house-b.json      (18x13)');

// ── House C interior — Community Room (26×18 = 416×288px — scrolls both axes) ─
// Larger than the others. A shared community space: notice board on north wall,
// folding tables in the center, shelving on the east wall.
// Door at north wall center (x=12-13). Notice board top-center. Logbook on table.
const houseC = generateTilemap(26, 18, {
  groundTile: 3,
  doorGaps: [
    { x1: 12, x2: 13, y1: 0, y2: 0 }, // north door → city street
  ],
  decorations: [
    // Stage / presentation area (north end) — worn carpet
    { x1: 1, x2: 24, y1: 1, y2: 3, tile: 32 },
    // Rug / gathering area (center) — worn carpet
    { x1: 4, x2: 21, y1: 8, y2: 14, tile: 32 },
  ],
  interiorWalls: [
    // Notice board (north wall, flanking door)
    { x1: 4, x2: 9,  y1: 1, y2: 2 },
    { x1: 16, x2: 21, y1: 1, y2: 2 },
    // Folding tables (center rows)
    { x1: 2,  x2: 10, y1: 9,  y2: 9  },
    { x1: 14, x2: 23, y1: 9,  y2: 9  },
    { x1: 2,  x2: 10, y1: 13, y2: 13 },
    { x1: 14, x2: 23, y1: 13, y2: 13 },
    // East shelving
    { x1: 23, x2: 24, y1: 4, y2: 16 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'house-c.json'), JSON.stringify(houseC));
console.log('  house-c.json      (26x18)');

// ── Protagonist apartment interior (20×15 = 320×240px — fits viewport exactly) ─
// Exit door at north wall (x=9-10). Player spawns near east wall (bed area) on first load.
// Desk and wardrobe block the top corners. A partition divides the main room from the sleeping area.
const protagHouse = generateTilemap(20, 15, {
  groundTile: 3,
  doorGaps: [
    { x1: 9, x2: 10, y1: 0, y2: 0 }, // north door → city street
  ],
  decorations: [
    // Bed area (east side, lower half of room) — worn carpet
    { x1: 14, x2: 17, y1: 8, y2: 12, tile: 32 },
    // Desk surface
    { x1: 1, x2: 3, y1: 1, y2: 2, tile: 19 },
    // Bed
    { x1: 15, x2: 16, y1: 9, y2: 11, tile: 22 },
  ],
  interiorWalls: [
    // Desk (west wall, top corner)
    { x1: 1, x2: 3, y1: 1, y2: 2 },
    // Wardrobe (east wall, top corner)
    { x1: 16, x2: 18, y1: 1, y2: 3 },
    // Partition wall (separates main room from bed area)
    { x1: 8, x2: 12, y1: 6, y2: 6 },
  ],
  signPositions: [],
});
fs.writeFileSync(path.join(tilemapDir, 'protag-house.json'), JSON.stringify(protagHouse));
console.log('  protag-house.json (20x15)');

// ── Clinic ──────────────────────────────────────────────────────────────────
const clinic = generateTilemap(20, 15, {
  groundTile: 4, // Concrete
  doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  decorations: [
    { x1: 2, x2: 17, y1: 2, y2: 4, tile: 32 }, // Worn carpet in waiting area
    { x1: 1, x2: 3, y1: 10, y2: 12, tile: 22 }, // Medical beds
    { x1: 6, x2: 8, y1: 10, y2: 12, tile: 22 },
  ],
  interiorWalls: [
    { x1: 1, x2: 5, y1: 1, y2: 1 }, // Shelves
    { x1: 14, x2: 18, y1: 1, y2: 1 }, // Shelves
    { x1: 1, x2: 3, y1: 10, y2: 13 }, // Beds
    { x1: 6, x2: 8, y1: 10, y2: 13 }, // Beds
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'clinic.json'), JSON.stringify(clinic));
console.log('  clinic.json       (20x15)');

// ── Records Office ──────────────────────────────────────────────────────────
const records = generateTilemap(20, 15, {
  groundTile: 3,
  doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  decorations: [
    { x1: 2, x2: 17, y1: 5, y2: 10, tile: 7 }, // Scattered papers
    { x1: 8, x2: 11, y1: 7, y2: 8, tile: 19 }, // Central desk
  ],
  interiorWalls: [
    { x1: 1, x2: 1, y1: 1, y2: 13 }, // Filing cabinets west
    { x1: 18, x2: 18, y1: 1, y2: 13 }, // Filing cabinets east
    { x1: 8, x2: 11, y1: 7, y2: 8 }, // Central desk
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'records-office.json'), JSON.stringify(records));
console.log('  records-office.json (20x15)');

// ── Utility Substation (Spruced Up) ─────────────────────────────────────────
const substation = generateTilemap(20, 15, {
  groundTile: 4, // Concrete
  doorGaps: [
    { x1: 9, x2: 10, y1: 0, y2: 0 }, // North exit
    { x1: 2, x2: 2, y1: 12, y2: 12 }, // Trapdoor location
  ],
  decorations: [
    { x1: 2, x2: 2, y1: 12, y2: 12, tile: 34 }, // Trapdoor tile
    { x1: 1, x2: 18, y1: 5, y2: 5, tile: 35 },  // Horizontal pipe
    { x1: 5, x2: 5, y1: 1, y2: 13, tile: 36 },  // Vertical pipe
    { x1: 14, x2: 14, y1: 1, y2: 13, tile: 36 }, // Vertical pipe
  ],
  interiorWalls: [
    { x1: 1, x2: 4, y1: 1, y2: 3 }, // Generators
    { x1: 15, x2: 18, y1: 1, y2: 3 }, // Generators
    { x1: 8, x2: 11, y1: 13, y2: 13 }, // Main console
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'utility-substation.json'), JSON.stringify(substation));
console.log('  utility-substation.json (20x15)');

// ── Market ──────────────────────────────────────────────────────────────────
const market = generateTilemap(20, 15, {
  groundTile: 4,
  doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  interiorWalls: [
    { x1: 1, x2: 18, y1: 4, y2: 4 }, // Shelves row 1
    { x1: 1, x2: 18, y1: 8, y2: 8 }, // Shelves row 2
    { x1: 1, x2: 18, y1: 12, y2: 12 }, // Shelves row 3
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'market.json'), JSON.stringify(market));
console.log('  market.json       (20x15)');

// ── Laundromat ──────────────────────────────────────────────────────────────
const laundromat = generateTilemap(20, 15, {
  groundTile: 4,
  doorGaps: [
    { x1: 9, x2: 10, y1: 0, y2: 0 },
    { x1: 17, x2: 17, y1: 12, y2: 12 }, // Tunnel entrance
  ],
  decorations: [
    { x1: 17, x2: 17, y1: 12, y2: 12, tile: 37 }, // Grating
  ],
  interiorWalls: [
    { x1: 1, x2: 1, y1: 1, y2: 13 }, // Washers west
    { x1: 18, x2: 18, y1: 1, y2: 11 }, // Washers east (stop before tunnel entrance at y=12)
    { x1: 8, x2: 11, y1: 5, y2: 10 }, // Folding tables
  ],
});
fs.writeFileSync(path.join(tilemapDir, 'laundromat.json'), JSON.stringify(laundromat));
console.log('  laundromat.json   (20x15)');

// ── Substation Tunnel ───────────────────────────────────────────────────────
const tunnel = generateTilemap(40, 10, {
  groundTile: 7, // Rubble/Pavement
  doorGaps: [
    { x1: 2, x2: 2, y1: 0, y2: 0 },   // To Substation
    { x1: 37, x2: 37, y1: 0, y2: 0 }, // To Laundromat
  ],
  decorations: [
    { x1: 1, x2: 38, y1: 2, y2: 2, tile: 35 }, // Long pipe
    { x1: 1, x2: 38, y1: 7, y2: 7, tile: 35 }, // Long pipe
    { x1: 5, x2: 5, y1: 1, y2: 8, tile: 36 },
    { x1: 15, x2: 15, y1: 1, y2: 8, tile: 36 },
    { x1: 25, x2: 25, y1: 1, y2: 8, tile: 36 },
    { x1: 35, x2: 35, y1: 1, y2: 8, tile: 36 },
  ],
  interiorWalls: [],
});
fs.writeFileSync(path.join(tilemapDir, 'substation-tunnel.json'), JSON.stringify(tunnel));
console.log('  substation-tunnel.json (40x10)');

// ── Generic for the rest ────────────────────────────────────────────────────
['ration-office', 'east-block', 'depot', 'apt-4a'].forEach(id => {
  const map = generateTilemap(20, 15, {
    groundTile: 3,
    doorGaps: [{ x1: 9, x2: 10, y1: 0, y2: 0 }],
  });
  fs.writeFileSync(path.join(tilemapDir, id + '.json'), JSON.stringify(map));
  console.log(`  ${id}.json`.padEnd(20) + ' (20x15)');
});

console.log('\nAll assets generated successfully!');
