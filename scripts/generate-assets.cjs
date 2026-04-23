/**
 * Procedural asset generator for Legend RPG placeholder art.
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

function setPixel(px, w, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= w) return;
  const i = (y * w + x) * 4;
  px[i] = r;
  px[i + 1] = g;
  px[i + 2] = b;
  px[i + 3] = a;
}

function fillRect(px, w, x1, y1, x2, y2, r, g, b, a = 255) {
  for (let y = y1; y <= y2; y++)
    for (let x = x1; x <= x2; x++) setPixel(px, w, x, y, r, g, b, a);
}

  // ── Tileset (96×16, six 16×16 tiles) ────────────────────────────────────────

function generateTileset() {
  // 40 tiles × 16px = 640px wide
  const W = 640, H = 16;
  const px = new Uint8Array(W * H * 4);

  // Draw one 16×16 tile at column col (0-indexed)
  function tile(col, fn) {
    const ox = col * 16;
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++)
        fn(x, y, ox + x);
  }
  function sp(x, y, r, g, b, a = 255) { setPixel(px, W, x, y, r, g, b, a); }
  function tr(x, y) { setPixel(px, W, x, y, 0, 0, 0, 0); } // transparent

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
  tile(0, (x, y, px_) => {
    let [r,g,b] = PAV;
    if (x === 0 || x === 8 || y === 0 || y === 8) { [r,g,b] = PAV2; }
    if ((x*7 + y*13 + x*y) % 19 === 0) { r += 8; g += 8; b += 10; }
    sp(px_, y, r, g, b);
  });

  // ── GID 2 | frame 1 — Exterior wall (dark brick, used for ALL collision walls)
  tile(1, (x, y, px_) => {
    const row = Math.floor(y / 4);
    const lx  = (x + (row % 2) * 8) % 8;
    const ly  = y % 4;
    if (lx === 0 || ly === 0) { sp(px_, y, ...WAL); }
    else {
      let [r,g,b] = WAL2;
      if (lx === 1 && ly === 1) { [r,g,b] = WAL3; }
      sp(px_, y, r, g, b);
    }
  });

  // ── GID 3 | frame 2 — Interior floor (warm wood tile, apartment ground) ──
  tile(2, (x, y, px_) => {
    const lx = x % 8, ly = y % 8;
    if (lx === 0 || ly === 0) { sp(px_, y, ...FLR); }
    else {
      let [r,g,b] = FLR2;
      if ((x + y * 2) % 7 === 0) { r -= 6; g -= 5; b -= 4; }
      if (lx === 2 && ly === 2)  { [r,g,b] = FLR3; }
      sp(px_, y, r, g, b);
    }
  });

  // ── GID 4 | frame 3 — Concrete floor (industrial/energy facility) ─────────
  tile(3, (x, y, px_) => {
    let [r,g,b] = CON;
    if (x === 0 || y === 0) { [r,g,b] = CON2; }
    if ((x * 3 + y * 5) % 11 === 0) { r += 5; g += 5; b += 5; }
    sp(px_, y, r, g, b);
  });

  // ── GID 5 | frame 4 — Barricade (prop collision tile) ────────────────────
  tile(4, (x, y, px_) => {
    const board = Math.floor(y / 3);
    if (y % 3 === 0) { sp(px_, y, ...WOD); }
    else {
      let [r,g,b] = WOD2;
      if (x === 0 || x === 15) { [r,g,b] = WOD; }
      if ((x + board * 3) % 6 === 0) { r -= 8; g -= 6; b -= 4; }
      sp(px_, y, r, g, b);
    }
  });

  // ── GID 6 | frame 5 — Overgrown ground (weeds reclaiming pavement) ───────
  tile(5, (x, y, px_) => {
    let [r,g,b] = PAV;
    const h = 15 - y;
    const d = (x * 7 + y * 11) % 13;
    if (h > 5 && d < 3)       { [r,g,b] = GRN; }
    else if (h > 2 && d < 2)  { [r,g,b] = GRN2; }
    else if (y < 5 && (x * 5 + y * 7) % 9 === 0) { [r,g,b] = GRN3; }
    sp(px_, y, r, g, b);
  });

  // ── GID 7 | frame 6 — Rubble/debris ground ───────────────────────────────
  tile(6, (x, y, px_) => {
    let [r,g,b] = PAV;
    const h = (x * 13 + y * 7 + x * y) % 17;
    if (h < 3) { [r,g,b] = RUB2; }
    else if (h < 6) { [r,g,b] = RUB; }
    if (x>=4&&x<=7&&y>=6&&y<=9)   { [r,g,b] = RUB2; }
    if (x>=10&&x<=13&&y>=3&&y<=5) { [r,g,b] = PAV2; }
    sp(px_, y, r, g, b);
  });

  // ── GID 8 | frame 7 — Document/paper item sprite ─────────────────────────
  tile(7, (x, y, px_) => {
    tr(px_, y);
    if (x>=3&&x<=13&&y>=2&&y<=14) {
      if (x===3||x===13||y===2||y===14) { sp(px_,y,...PAP2); }
      else {
        sp(px_,y,...PAP);
        if ((y===5||y===7||y===9||y===11) && x>=5&&x<=11) { sp(px_,y,...PAP3); }
      }
    }
  });

  // ── GID 9 | frame 8 — Key item sprite ────────────────────────────────────
  tile(8, (x, y, px_) => {
    tr(px_, y);
    const K=[90,86,96], KL=[126,120,136], KD=[60,56,66];
    const hx=x-7.5, hy=y-4.5, ring=hx*hx/9+hy*hy/9;
    if (ring<1.0&&ring>0.32) { sp(px_,y,...(hy<0?KL:K)); }
    if (x>=7&&x<=8&&y>=7&&y<=13) { sp(px_,y,...K); }
    if (y>=10&&y<=11&&x>=9&&x<=10) { sp(px_,y,...KD); }
    if (y>=12&&y<=13&&x>=9&&x<=11) { sp(px_,y,...KD); }
  });

  // ── GID 10 | frame 9 — Vial/cure item sprite ─────────────────────────────
  tile(9, (x, y, px_) => {
    tr(px_, y);
    const VF=[26,40,62], VL=[52,84,126], VH=[76,114,166], CK=[68,48,26];
    if (x>=6&&x<=9&&y>=1&&y<=3) { sp(px_,y,...(y===1||x===6||x===9?[48,34,14]:CK)); }
    if (x>=6&&x<=9&&y>=4&&y<=6) { sp(px_,y,...VF); }
    if (x>=4&&x<=11&&y>=7&&y<=13) {
      if (x===4||x===11) sp(px_,y,...VF);
      else sp(px_,y,...VL);
      if (x===5&&y>=8&&y<=11) sp(px_,y,...VH);
    }
    if (x>=5&&x<=10&&y===14) { sp(px_,y,...VF); }
  });

  // ── GID 11 | frame 10 — Fuel canister item sprite ────────────────────────
  tile(10, (x, y, px_) => {
    tr(px_, y);
    const FC=[56,30,16], FM=[76,46,26], FD=[46,24,12];
    if (x>=6&&x<=9&&y>=1&&y<=3) { if(y===1||x===6||x===9) sp(px_,y,...MTL); }
    if (x>=5&&x<=10&&y>=3&&y<=5) { sp(px_,y,...MTL); }
    if (x>=3&&x<=12&&y>=6&&y<=14) {
      if (x===3||x===12||y===14) sp(px_,y,...FD);
      else sp(px_,y,...FC);
      if (x===4&&y>=7&&y<=12) sp(px_,y,...FM);
    }
  });

  // ── GID 12 | frame 11 — Component item sprite (copper fitting) ───────────
  tile(11, (x, y, px_) => {
    tr(px_, y);
    const CD=[66,44,24], CM=[94,66,38], CL=[116,86,52];
    if (x>=3&&x<=12&&y>=6&&y<=8) {
      if (y===6||y===8) sp(px_,y,...CD); else sp(px_,y,...CM);
    }
    if (x>=6&&x<=8&&y>=3&&y<=10) {
      if (x===6||x===8) sp(px_,y,...CD); else sp(px_,y,...CM);
    }
    if (x===7&&y===7) { tr(px_,y); }
    if (x===4&&y===7) sp(px_,y,...CL);
    if (x===7&&y===4) sp(px_,y,...CL);
  });

  // ── GID 13 | frame 12 — Street lamp (off) ────────────────────────────────
  tile(12, (x, y, px_) => {
    tr(px_, y);
    if (x>=7&&x<=8&&y>=4&&y<=15) sp(px_,y,...MTL);
    if (x===7&&y>=4&&y<=15) sp(px_,y,...MTL2);
    if (x>=5&&x<=10&&y>=1&&y<=4) {
      if (y===4||x===5||x===10) sp(px_,y,...MTL);
      else sp(px_,y,6,6,8);
    }
    if (y===4&&x>=8&&x<=11) sp(px_,y,...MTL);
  });

  // ── GID 14 | frame 13 — Dead screen / monitor ────────────────────────────
  tile(13, (x, y, px_) => {
    tr(px_, y);
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(px_,y,...MTL);
      else {
        sp(px_,y,5,5,8);
        if (x===3&&y>=4&&y<=7) sp(px_,y,16,16,20); // faint reflection
      }
    }
    if (x>=6&&x<=9&&y===14) sp(px_,y,...MTL);
    if (x>=4&&x<=11&&y===15) sp(px_,y,...MTL);
  });

  // ── GID 15 | frame 14 — Security camera ──────────────────────────────────
  tile(14, (x, y, px_) => {
    tr(px_, y);
    if (x>=6&&x<=9&&y>=1&&y<=4) sp(px_,y,...MTL2);
    if (x>=2&&x<=13&&y>=4&&y<=10) {
      if (x===2||x===13||y===4||y===10) sp(px_,y,...MTL);
      else sp(px_,y,...MTL2);
    }
    const d = Math.abs(x-7.5)+Math.abs(y-7);
    if (d<2.5) sp(px_,y,6,6,10);
    else if (d<4.5) sp(px_,y,...MTL);
  });

  // ── GID 16 | frame 15 — Bench ────────────────────────────────────────────
  tile(15, (x, y, px_) => {
    tr(px_, y);
    if (x>=1&&x<=14&&y>=5&&y<=8) {
      if (x===1||x===14) sp(px_,y,...WOD); else sp(px_,y,...WOD2);
    }
    if (x>=1&&x<=14&&y>=2&&y<=4) {
      if (y===2) sp(px_,y,...WOD); else sp(px_,y,...WOD2);
    }
    for (const lx of [2,3,12,13]) {
      if (x===lx&&y>=9&&y<=13) sp(px_,y,...MTL);
    }
  });

  // ── GID 17 | frame 16 — Trash pile ───────────────────────────────────────
  tile(16, (x, y, px_) => {
    let [r,g,b] = PAV;
    const d = Math.abs(x-8)*0.5 + Math.abs(y-10)*0.8;
    if (d<5) {
      const h=(x*5+y*3)%7;
      if (h<1)       [r,g,b]=MTL;
      else if (h<3)  [r,g,b]=WOD;
      else           [r,g,b]=RUB2;
    } else if (d<7) { [r,g,b]=RUB; }
    sp(px_, y, r, g, b);
  });

  // ── GID 18 | frame 17 — Crate / storage box ──────────────────────────────
  tile(17, (x, y, px_) => {
    tr(px_, y);
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(px_,y,...WOD);
      else {
        sp(px_,y,...WOD2);
        if (x===7||x===8||y===7||y===8) sp(px_,y,...WOD);
        if ((x<=3||x>=12)&&(y<=4||y>=11)) sp(px_,y,...MTL);
      }
    }
  });

  // ── GID 19 | frame 18 — Interior wall (warmer brick, apartment walls) ─────
  tile(18, (x, y, px_) => {
    const IW=[40,34,28], IW2=[54,46,38], IW3=[68,58,48];
    const row=Math.floor(y/4), lx=(x+(row%2)*8)%8, ly=y%4;
    if (lx===0||ly===0) sp(px_,y,...IW);
    else {
      let [r,g,b]=IW2;
      if (lx===1&&ly===1) [r,g,b]=IW3;
      sp(px_,y,r,g,b);
    }
  });

  // ── GID 20 | frame 19 — Counter / desk surface (top-down) ────────────────
  tile(19, (x, y, px_) => {
    tr(px_, y);
    if (x>=1&&x<=14&&y>=3&&y<=12) {
      if (x===1||x===14||y===3||y===12) sp(px_,y,...MTL);
      else {
        sp(px_,y,...MTL2);
        if (x===2&&y>=4&&y<=11) sp(px_,y,...MTL3);
      }
    }
  });

  // ── GID 21 | frame 20 — Shelving unit ────────────────────────────────────
  tile(20, (x, y, px_) => {
    tr(px_, y);
    if ((x===1||x===14)&&y>=1&&y<=14) sp(px_,y,...WOD);
    for (const sy of [3,7,11]) {
      if (y===sy&&x>=1&&x<=14) sp(px_,y,...WOD2);
    }
    if (y>=1&&y<=2&&x>=3&&x<=5)   sp(px_,y,...MTL);
    if (y>=4&&y<=6&&x>=8&&x<=10)  sp(px_,y,...RUB);
    if (y>=8&&y<=10&&x>=3&&x<=4)  sp(px_,y,...WOD);
  });

  // ── GID 22 | frame 21 — Table (top-down) ──────────────────────────────────
  tile(21, (x, y, px_) => {
    tr(px_, y);
    if (x>=2&&x<=13&&y>=3&&y<=12) {
      if (x===2||x===13||y===3||y===12) sp(px_,y,...WOD);
      else {
        sp(px_,y,...WOD2);
        if ((x+y)%6===0) sp(px_,y,...WOD);
      }
    }
  });

  // ── GID 23 | frame 22 — Bed / cot ────────────────────────────────────────
  tile(22, (x, y, px_) => {
    tr(px_, y);
    const MAT=[50,42,54], MATL=[66,56,72];
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(px_,y,...MTL);
      else {
        sp(px_,y,...MAT);
        if (x>=3&&x<=6&&y>=3&&y<=6) sp(px_,y,...MATL); // pillow
      }
    }
  });

  // ── GID 24 | frame 23 — Locked gate / metal bars ─────────────────────────
  tile(23, (x, y, px_) => {
    let [r,g,b]=WAL;
    if (x%4===1||x%4===2) { [r,g,b]=MTL2; }
    if (y===7||y===8) { [r,g,b]=MTL; }
    sp(px_,y,r,g,b);
    if (x>=6&&x<=9&&y>=6&&y<=9) {
      sp(px_,y,...MTL);
      if ((x===7||x===8)&&(y===7||y===8)) sp(px_,y,6,6,10);
    }
  });

  // ── GID 25 | frame 24 — Manhole cover ────────────────────────────────────
  tile(24, (x, y, px_) => {
    let [r,g,b]=PAV;
    const dx=x-7.5, dy=y-7.5, d=Math.sqrt(dx*dx+dy*dy);
    if (d<7) {
      if (d>6) { [r,g,b]=MTL; }
      else {
        [r,g,b]=MTL2;
        if (Math.abs(dx)<0.7||Math.abs(dy)<0.7) [r,g,b]=MTL;
        if (Math.abs(dx+dy)<0.9||Math.abs(dx-dy)<0.9) [r,g,b]=MTL;
      }
    }
    sp(px_,y,r,g,b);
  });

  // ── GID 26 | frame 25 — Generator block ──────────────────────────────────
  tile(25, (x, y, px_) => {
    tr(px_, y);
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(px_,y,...MTL);
      else {
        sp(px_,y,...MTL2);
        for (const vy of [4,6,8,10]) {
          if (y===vy&&x>=3&&x<=12) sp(px_,y,...MTL);
        }
        if (x>=6&&x<=8&&y>=11&&y<=12) sp(px_,y,38,10,8); // off indicator
      }
    }
  });

  // ── GID 27 | frame 26 — Electrical panel ─────────────────────────────────
  tile(26, (x, y, px_) => {
    tr(px_, y);
    if (x>=2&&x<=13&&y>=1&&y<=14) {
      if (x===2||x===13||y===1||y===14) sp(px_,y,...MTL);
      else {
        sp(px_,y,...CON);
        if (y>=2&&y<=3) sp(px_,y,...MTL);
        for (const sy of [5,8,11]) for (const sx of [4,7,10]) {
          if (x===sx&&y===sy) sp(px_,y,...MTL2);
          if (x===sx+1&&y===sy) sp(px_,y,...MTL);
        }
      }
    }
  });

  // ── GID 28 | frame 27 — Dark window (unlit) in wall ──────────────────────
  tile(27, (x, y, px_) => {
    let [r,g,b]=WAL2;
    if (x>=2&&x<=13&&y>=2&&y<=13) {
      if (x===2||x===13||y===2||y===13||x===7||x===8||y===7||y===8) [r,g,b]=MTL;
      else {
        [r,g,b]=[10,12,18];
        if (x>=3&&x<=5&&y>=3&&y<=5) [r,g,b]=[20,22,30];
      }
    }
    sp(px_,y,r,g,b);
  });

  // ── GID 29 | frame 28 — Door frame / threshold ───────────────────────────
  tile(28, (x, y, px_) => {
    let [r,g,b]=FLR;
    if (x===0||x===15||y===0) { [r,g,b]=MTL; }
    if (x>=2&&x<=13&&y>=1&&y<=13) { r+=10; g+=8; b+=6; }
    if (y===14||y===15) { [r,g,b]=MTL; }
    sp(px_,y,r,g,b);
  });

  // ── GID 30 | frame 29 — Reinforced wall (sealed city boundary) ───────────
  tile(29, (x, y, px_) => {
    const RW=[16,14,20], RW2=[26,22,32];
    const row=Math.floor(y/8), lx=(x+(row%2)*8)%16, ly=y%8;
    if (lx===0||ly===0) sp(px_,y,...RW); else sp(px_,y,...RW2);
  });

  // ── GID 31 | frame 30 — Memorial / civic marker ───────────────────────────
  tile(30, (x, y, px_) => {
    tr(px_, y);
    const ST=[42,34,34], STL=[58,46,46];
    if (x>=3&&x<=12&&y>=10&&y<=14) {
      if (x===3||x===12||y===14) sp(px_,y,...ST); else sp(px_,y,...STL);
    }
    if (x>=6&&x<=9&&y>=5&&y<=10) sp(px_,y,...ST);
    const d=Math.sqrt((x-7.5)**2+(y-3.5)**2);
    if (d<3) sp(px_,y,...(d<2?STL:ST));
  });

  // ── GID 32 | frame 31 — Worn carpet (interior floor variation) ───────────
  tile(31, (x, y, px_) => {
    let [r,g,b]=CRP;
    if (x===0||x===15||y===0||y===15) { [r,g,b]=CRP2; }
    else if (x%4===0&&y%4===0) { [r,g,b]=CRP3; }
    else if ((x+y)%8<2) { r-=4; g-=4; b-=3; }
    sp(px_,y,r,g,b);
  });

  // ── GID 33 | frame 32 — Cracked pavement (street variation) ──────────────
  tile(32, (x, y, px_) => {
    let [r,g,b]=PAV;
    if (x===0||x===8||y===0||y===8) { [r,g,b]=PAV2; }
    if ((x*7+y*13+x*y)%19===0) { r+=8; g+=8; b+=10; }
    // Diagonal crack from (3,1) to (11,14)
    const cr=Math.abs(13*(x-3)-8*(y-1))/Math.sqrt(169+64);
    if (cr<0.9&&x>=3&&x<=11&&y>=1&&y<=14) {
      [r,g,b]=PAV3;
      if (cr<0.35) { r+=8; g+=8; b+=10; }
    }
    sp(px_,y,r,g,b);
  });

  // ── GID 34 | frame 33 — Trap door ────────────────────────────────────────
  tile(33, (x, y, px_) => {
    tr(px_, y);
    const WD=[42, 28, 16], WD2=[58, 42, 26];
    if (x>=1&&x<=14&&y>=1&&y<=14) {
      if (x===1||x===14||y===1||y===14) sp(px_,y,...WD);
      else {
        sp(px_,y,...WD2);
        if (x>=6&&x<=9&&y>=6&&y<=9) sp(px_,y,...WD); // handle
      }
    }
  });

  // ── GID 35 | frame 34 — Metal pipe (Horizontal) ──────────────────────────
  tile(34, (x, y, px_) => {
    tr(px_, y);
    if (y>=5&&y<=10) {
      let c = MTL2;
      if (y===5||y===10) c = MTL;
      if (y===7) c = MTL3;
      sp(px_,y,...c);
    }
  });

  // ── GID 36 | frame 35 — Metal pipe (Vertical) ────────────────────────────
  tile(35, (x, y, px_) => {
    tr(px_, y);
    if (x>=5&&x<=10) {
      let c = MTL2;
      if (x===5||x===10) c = MTL;
      if (x===7) c = MTL3;
      sp(px_,y,...c);
    }
  });

  // ── GID 37 | frame 36 — Drainage Grating ─────────────────────────────────
  tile(36, (x, y, px_) => {
    let [r,g,b] = PAV;
    if (x>=2&&x<=13&&y>=2&&y<=13) {
      if (x%3===0) [r,g,b] = [10,10,15];
      else [r,g,b] = MTL;
    }
    sp(px_,y,r,g,b);
  });

  // ── GID 40 | frame 39 — Flashlight Charger ─────────────────────────────────
  tile(39, (x, y, px_) => {
    let [r,g,b] = MTL;
    if (x>=2&&x<=13&&y>=2&&y<=13) {
       [r,g,b] = MTL2;
       if (x===2||x===13||y===2||y===13) [r,g,b] = MTL;
       // Lightning bolt / Indicator
       const isBolt = (x===8 && y>=4 && y<=11) || (x===7 && y===7) || (x===9 && y===7);
       if (isBolt) {
         [r,g,b] = [255, 255, 0]; // Bright Yellow
       }
    }
    sp(px_,y,r,g,b);
  });

  return encodePNG(W, H, px);
}

// ── Player spritesheet (64×64, 4 cols × 4 rows of 16×16) ───────────────────

function generatePlayer() {
  const W = 64, H = 64;
  const px = new Uint8Array(W * H * 4);

  const SKIN = [228, 190, 150];
  const BODY = [45, 75, 155];
  const BODY_HI = [60, 95, 180];
  const HAIR = [70, 45, 25];
  const EYE = [15, 15, 25];
  const SHOE = [35, 30, 25];

  function drawCharacter(col, row, facing, walkPhase) {
    const ox = col * 16;
    const oy = row * 16;
    const legOffset = walkPhase === 1 ? -1 : walkPhase === 3 ? 1 : 0;
    const bobY = walkPhase === 1 || walkPhase === 3 ? -1 : 0;

    fillRect(px, W, ox + 4, oy + 14, ox + 11, oy + 15, 0, 0, 0, 40);
    fillRect(px, W, ox + 5, oy + 1 + bobY, ox + 10, oy + 3 + bobY, ...HAIR);
    fillRect(px, W, ox + 5, oy + 3 + bobY, ox + 10, oy + 6 + bobY, ...SKIN);
    setPixel(px, W, ox + 4, oy + 4 + bobY, ...SKIN);
    setPixel(px, W, ox + 11, oy + 4 + bobY, ...SKIN);
    fillRect(px, W, ox + 5, oy + 7 + bobY, ox + 10, oy + 10 + bobY, ...BODY);
    fillRect(px, W, ox + 6, oy + 7 + bobY, ox + 7, oy + 8 + bobY, ...BODY_HI);

    const armSwing = walkPhase === 1 ? 1 : walkPhase === 3 ? -1 : 0;
    setPixel(px, W, ox + 4, oy + 8 + bobY + armSwing, ...SKIN);
    setPixel(px, W, ox + 11, oy + 8 + bobY - armSwing, ...SKIN);

    fillRect(px, W, ox + 5 + legOffset, oy + 11, ox + 7 + legOffset, oy + 13, ...BODY);
    fillRect(px, W, ox + 8 - legOffset, oy + 11, ox + 10 - legOffset, oy + 13, ...BODY);
    fillRect(px, W, ox + 5 + legOffset, oy + 13, ox + 7 + legOffset, oy + 14, ...SHOE);
    fillRect(px, W, ox + 8 - legOffset, oy + 13, ox + 10 - legOffset, oy + 14, ...SHOE);

    if (facing === 'down') {
      setPixel(px, W, ox + 6, oy + 5 + bobY, ...EYE);
      setPixel(px, W, ox + 9, oy + 5 + bobY, ...EYE);
      setPixel(px, W, ox + 7, oy + 6 + bobY, 200, 160, 130);
      setPixel(px, W, ox + 8, oy + 6 + bobY, 200, 160, 130);
    } else if (facing === 'up') {
      fillRect(px, W, ox + 5, oy + 3 + bobY, ox + 10, oy + 4 + bobY, ...HAIR);
    } else if (facing === 'left') {
      setPixel(px, W, ox + 5, oy + 5 + bobY, ...EYE);
      setPixel(px, W, ox + 10, oy + 3 + bobY, ...HAIR);
    } else if (facing === 'right') {
      setPixel(px, W, ox + 10, oy + 5 + bobY, ...EYE);
      setPixel(px, W, ox + 5, oy + 3 + bobY, ...HAIR);
    }
  }

  for (let row = 0; row < 4; row++) {
    const facing = ['down', 'left', 'right', 'up'][row];
    for (let col = 0; col < 4; col++) {
      drawCharacter(col, row, facing, col);
    }
  }

  return encodePNG(W, H, px);
}

// ── Tilemap generator ───────────────────────────────────────────────────────

const TILESET_META = {
  firstgid: 1,
  name: 'tileset',
  tilewidth: 16,
  tileheight: 16,
  tilecount: 40,
  columns: 40,
  image: 'tileset.png',
  imagewidth: 640,
  imageheight: 16,
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
      ground.push(gTile);

      // Collision: border walls + interior walls + sign blocking
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
      let isDoorGap = false;
      for (const gap of doorGaps) {
        if (x >= gap.x1 && x <= gap.x2 && y >= gap.y1 && y <= gap.y2) {
          isDoorGap = true;
          break;
        }
      }

      if (isSign) {
        collision.push(5);
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
    tilewidth: 16,
    tileheight: 16,
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

// Tileset PNG (40 tiles)
fs.writeFileSync(path.join(tilemapDir, 'tileset.png'), generateTileset());
console.log('  tileset.png  (640x16, 40 tiles)');

// Player spritesheet PNG
fs.writeFileSync(path.join(spriteDir, 'player.png'), generatePlayer());
console.log('  player.png   (64x64, 4x4 frames)');

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
