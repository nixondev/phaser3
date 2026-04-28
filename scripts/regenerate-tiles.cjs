const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// PNG encoder helper
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

const S = 4;
const BASE = 16;
const TILE = BASE * S;
const srcDir = path.join(__dirname, '..', 'assets_src', 'tiles');

if (!fs.existsSync(srcDir)) fs.mkdirSync(srcDir, { recursive: true });

const PAV = [30, 30, 40], PAV2 = [42, 42, 54], PAV3 = [56, 56, 70];
const WAL = [24, 20, 28], WAL2 = [36, 30, 42], WAL3 = [50, 42, 58];
const FLR = [46, 38, 30], FLR2 = [58, 48, 38], FLR3 = [72, 60, 48];
const CON = [36, 36, 38], CON2 = [48, 48, 50];
const GRN = [20, 35, 14], GRN2 = [30, 50, 20], GRN3 = [44, 68, 30];
const RUB = [38, 34, 28], RUB2 = [52, 46, 38];
const MTL = [26, 26, 34], MTL2 = [40, 40, 52], MTL3 = [60, 60, 76];
const WOD = [42, 28, 16], WOD2 = [58, 42, 26];
const CRP = [40, 30, 46], CRP2 = [54, 42, 62], CRP3 = [68, 54, 78];
const PAP = [182, 164, 126], PAP2 = [140, 124, 90], PAP3 = [112, 98, 70];

const tileDefs = [
  { name: "00_dark_pavement", fn: (x, y, sp) => {
    let [r,g,b] = PAV;
    const fx = Math.floor(x), fy = Math.floor(y);
    if (fx === 0 || fx === 8 || fy === 0 || fy === 8) { [r,g,b] = PAV2; }
    if ((fx*7 + fy*13 + fx*fy) % 19 === 0) { r += 8; g += 8; b += 10; }
    sp(r, g, b);
  }},
  { name: "01_exterior_wall", fn: (x, y, sp) => {
    const row = Math.floor(y / 4);
    const lx = (x + (row % 2) * 8) % 8, ly = y % 4;
    if (lx < 1 || ly < 1) sp(...WAL);
    else {
      let [r,g,b] = WAL2;
      if (lx < 2 && ly < 2) [r,g,b] = WAL3;
      sp(r, g, b);
    }
  }},
  { name: "02_interior_floor", fn: (x, y, sp) => {
    const lx = x % 8, ly = y % 8;
    if (lx < 1 || ly < 1) sp(...FLR);
    else {
      let [r,g,b] = FLR2;
      if ((Math.floor(x) + Math.floor(y) * 2) % 7 === 0) { r -= 6; g -= 5; b -= 4; }
      if (lx < 2 && ly < 2) [r,g,b] = FLR3;
      sp(r, g, b);
    }
  }},
  { name: "03_concrete_floor", fn: (x, y, sp) => {
    let [r,g,b] = CON;
    if (x < 1 || y < 1) [r,g,b] = CON2;
    if ((Math.floor(x) * 3 + Math.floor(y) * 5) % 11 === 0) { r += 5; g += 5; b += 5; }
    sp(r, g, b);
  }},
  { name: "04_barricade", fn: (x, y, sp) => {
    const board = Math.floor(y / 3);
    if (y % 3 < 1) sp(...WOD);
    else {
      let [r,g,b] = WOD2;
      if (x < 1 || x >= 15) [r,g,b] = WOD;
      if ((Math.floor(x) + board * 3) % 6 === 0) { r -= 8; g -= 6; b -= 4; }
      sp(r, g, b);
    }
  }},
  { name: "05_overgrown_ground", fn: (x, y, sp) => {
    let [r,g,b] = PAV;
    const h = 15 - y, d = (x * 7 + y * 11) % 13;
    if (h > 5 && d < 3) [r,g,b] = GRN;
    else if (h > 2 && d < 2) [r,g,b] = GRN2;
    else if (y < 5 && (x * 5 + y * 7) % 9 === 0) [r,g,b] = GRN3;
    sp(r, g, b);
  }},
  { name: "06_rubble_debris", fn: (x, y, sp) => {
    let [r,g,b] = PAV;
    const h = (x * 13 + y * 7 + x * y) % 17;
    if (h < 3) [r,g,b] = RUB2; else if (h < 6) [r,g,b] = RUB;
    if (x>=4&&x<=7&&y>=6&&y<=9) [r,g,b] = RUB2;
    if (x>=10&&x<=13&&y>=3&&y<=5) [r,g,b] = PAV2;
    sp(r, g, b);
  }},
  { name: "07_document_paper", fn: (x, y, sp, tr) => {
    tr();
    if (x>=3&&x<=13&&y>=2&&y<=14) {
      if (x===3||x===13||y===2||y===14) sp(...PAP2);
      else {
        sp(...PAP);
        if ((y===5||y===7||y===9||y===11) && x>=5&&x<=11) sp(...PAP3);
      }
    }
  }},
  { name: "08_skeleton_key", fn: (x, y, sp, tr) => {
    tr();
    const K=[210,180,40], KL=[255,240,100], KD=[140,110,20];
    const hx=x-7.5, hy=y-4, dist = Math.sqrt(hx*hx + hy*hy);
    if (dist < 4.5 && dist > 1.5) {
      const angle = Math.atan2(hy, hx), clover = Math.abs(Math.cos(angle * 2));
      if (clover > 0.2) {
        let c = K;
        if (hy < 0 && hx < 0) c = KL; if (hy > 0 && hx > 0) c = KD;
        sp(...c);
      }
    }
    if (x >= 7 && x < 9 && y >= 7 && y <= 15) {
      const isLeft = x < 8; sp(...(isLeft?KL:K));
    }
    if (Math.floor(y) === 13 && x >= 9 && x <= 11) sp(...K);
    if (Math.floor(y) === 15 && x >= 9 && x <= 12) sp(...K);
    if (Math.floor(x) === 12 && y >= 13 && y <= 15) sp(...KD);
  }},
  { name: "09_vial_cure", fn: (x, y, sp, tr) => {
    tr();
    const GL = [150, 200, 255, 180], G = [50, 100, 200, 220], GH = [200, 240, 255], CK = [80, 50, 30];
    if (x >= 7 && x <= 8 && y >= 1 && y <= 2) sp(...CK);
    if (x >= 7 && x <= 8 && y >= 3 && y <= 5) sp(...GL);
    const dx = x - 7.5, dy = y - 10, dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 4.5) {
      let c = G; if (dist < 4) c = (dx < -1 && dy < -1) ? GH : G;
      if (dist > 4) c = GL; sp(...c);
    }
  }},
  { name: "10_skeleton_remains", fn: (x, y, sp, tr) => {
    tr();
    const B = [220, 220, 200], BD = [160, 160, 140];
    if (x >= 6 && x <= 9 && y >= 1 && y <= 4) {
      sp(...B); if (y >= 2.5 && y <= 3.5 && (x >= 6.5 && x <= 7.5 || x >= 8 && x <= 9)) sp(20, 20, 20);
    }
    if (x >= 7 && x < 8 && y >= 5 && y <= 11) sp(...BD); if (x >= 8 && x < 9 && y >= 5 && y <= 11) sp(...B);
    if (Math.floor(y) === 6 || Math.floor(y) === 8 || Math.floor(y) === 10) if (x >= 5 && x <= 10) sp(...B);
    if (Math.floor(y) === 12 && x >= 6 && x <= 9) sp(...B);
    if (y >= 13 && x >= 4 && x <= 7) sp(...BD); if (y >= 13 && x >= 8 && x <= 11) sp(...B);
  }},
  { name: "11_component_gear", fn: (x, y, sp, tr) => {
    tr();
    const C1 = [160, 160, 170], C2 = [100, 100, 110], C3 = [220, 220, 230];
    const dx = x - 7.5, dy = y - 7.5, d = Math.sqrt(dx*dx + dy*dy);
    if (d < 6) {
      const angle = Math.atan2(dy, dx), teeth = Math.abs(Math.cos(angle * 4));
      if (d < 4 || (d < 6 && teeth > 0.5)) {
        let c = C2; if (d < 5 && dx < 0 && dy < 0) c = C3; else if (d < 5) c = C1;
        if (d < 2) tr(); else sp(...c);
      }
    }
  }},
  { name: "12_street_lamp", fn: (x, y, sp, tr) => {
    tr();
    if (x >= 7 && x < 9 && y >= 4 && y <= 15) sp(...MTL);
    if (x >= 7 && x < 8 && y >= 4 && y <= 15) sp(...MTL2);
    if (x >= 5 && x <= 10 && y >= 1 && y <= 4) {
      if (y >= 3.5 || x < 6 || x > 9.5) sp(...MTL); else sp(6, 6, 8);
    }
    if (y >= 4 && y < 5 && x >= 8 && x <= 11) sp(...MTL);
  }},
  { name: "13_monitor_screen", fn: (x, y, sp, tr) => {
    tr();
    if (x >= 1 && x <= 14 && y >= 2 && y <= 13) {
      if (x < 2 || x > 13 || y < 3 || y > 12) sp(...MTL);
      else { sp(5, 5, 8); if (x >= 3 && x < 4 && y >= 4 && y <= 7) sp(16, 16, 20); }
    }
    if (x >= 6 && x <= 9 && y >= 13 && y <= 15) sp(...MTL); if (x >= 4 && x <= 11 && y >= 14 && y <= 15) sp(...MTL);
  }},
  { name: "14_security_camera", fn: (x, y, sp, tr) => {
    tr();
    if (x >= 6 && x <= 9 && y >= 1 && y <= 4) sp(...MTL2);
    if (x >= 2 && x <= 13 && y >= 4 && y <= 10) {
      if (x < 3 || x > 12 || y < 5 || y > 9) sp(...MTL); else sp(...MTL2);
    }
    const d = Math.abs(x-7.5)+Math.abs(y-7); if (d<2.5) sp(6,6,10); else if (d<4.5) sp(...MTL);
  }},
  { name: "15_bench", fn: (x, y, sp, tr) => {
    tr();
    if (x >= 1 && x <= 14 && y >= 5 && y <= 8) { if (x < 2 || x > 13) sp(...WOD); else sp(...WOD2); }
    if (x >= 1 && x <= 14 && y >= 2 && y <= 4.5) { if (y < 3) sp(...WOD); else sp(...WOD2); }
    for (const lx of [2,3,12,13]) if (x >= lx && x < lx + 1 && y >= 9 && y <= 13) sp(...MTL);
  }},
  { name: "16_trash_pile", fn: (x, y, sp) => {
    let [r,g,b] = PAV;
    const d = Math.abs(x-8)*0.5 + Math.abs(y-10)*0.8;
    if (d<5) {
      const h=(x*5+y*3)%7; if (h<1) [r,g,b]=MTL; else if (h<3) [r,g,b]=WOD; else [r,g,b]=RUB2;
    } else if (d<7) [r,g,b]=RUB;
    sp(r, g, b);
  }},
  { name: "17_crate_box", fn: (x, y, sp, tr) => {
    tr();
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(...WOD);
      else { sp(...WOD2); if (x===7||x===8||y===7||y===8) sp(...WOD); if ((x<=3||x>=12)&&(y<=4||y>=11)) sp(...MTL); }
    }
  }},
  { name: "18_interior_wall", fn: (x, y, sp) => {
    const IW=[40,34,28], IW2=[54,46,38], IW3=[68,58,48];
    const row=Math.floor(y/4), lx=(x+(row%2)*8)%8, ly=y%4;
    if (lx===0||ly===0) sp(...IW);
    else { let [r,g,b]=IW2; if (lx===1&&ly===1) [r,g,b]=IW3; sp(r,g,b); }
  }},
  { name: "19_counter_desk", fn: (x, y, sp, tr) => {
    tr();
    if (x>=1&&x<=14&&y>=3&&y<=12) {
      if (x===1||x===14||y===3||y===12) sp(...MTL); else { sp(...MTL2); if (x===2&&y>=4&&y<=11) sp(...MTL3); }
    }
  }},
  { name: "20_shelving", fn: (x, y, sp, tr) => {
    tr();
    if ((x===1||x===14)&&y>=1&&y<=14) sp(...WOD);
    for (const sy of [3,7,11]) if (y===sy&&x>=1&&x<=14) sp(...WOD2);
    if (y>=1&&y<=2&&x>=3&&x<=5) sp(...MTL); if (y>=4&&y<=6&&x>=8&&x<=10) sp(...RUB); if (y>=8&&y<=10&&x>=3&&x<=4) sp(...WOD);
  }},
  { name: "21_table", fn: (x, y, sp, tr) => {
    tr();
    if (x>=2&&x<=13&&y>=3&&y<=12) {
      if (x===2||x===13||y===3||y===12) sp(...WOD); else { sp(...WOD2); if ((x+y)%6===0) sp(...WOD); }
    }
  }},
  { name: "22_bed_cot", fn: (x, y, sp, tr) => {
    tr();
    const MAT=[50,42,54], MATL=[66,56,72];
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x===1||x===14||y===2||y===13) sp(...MTL); else { sp(...MAT); if (x>=3&&x<=6&&y>=3&&y<=6) sp(...MATL); }
    }
  }},
  { name: "23_locked_gate", fn: (x, y, sp) => {
    let [r,g,b]=WAL;
    if (Math.floor(x)%4 === 1 || Math.floor(x)%4 === 2) [r,g,b]=MTL2;
    if (y >= 7 && y < 9) [r,g,b]=MTL; sp(r,g,b);
    if (x>=6&&x<=9&&y>=6&&y<=9) { sp(...MTL); if (x >= 7 && x < 9 && y >= 7 && y < 9) sp(6,6,10); }
  }},
  { name: "24_manhole_cover", fn: (x, y, sp) => {
    let [r,g,b]=PAV;
    const dx=x-7.5, dy=y-7.5, d=Math.sqrt(dx*dx+dy*dy);
    if (d < 7) {
      if (d > 5.5) [r,g,b] = MTL;
      else { [r,g,b] = MTL2; if (Math.abs(dx) < 1.1 || Math.abs(dy) < 1.1) [r,g,b] = MTL; if (Math.abs(dx+dy) < 1.3 || Math.abs(dx-dy) < 1.3) [r,g,b] = MTL; }
    }
    sp(r,g,b);
  }},
  { name: "25_generator", fn: (x, y, sp, tr) => {
    tr();
    if (x>=1&&x<=14&&y>=2&&y<=13) {
      if (x < 2 || x > 13 || y < 3 || y > 12) sp(...MTL);
      else { sp(...MTL2); for (const vy of [4,6,8,10]) if (Math.floor(y) === vy && x >= 3 && x <= 12) sp(...MTL); if (x>=6&&x<=8&&y>=11&&y<=12) sp(38,10,8); }
    }
  }},
  { name: "26_electrical_panel", fn: (x, y, sp, tr) => {
    tr();
    if (x>=2&&x<=13&&y>=1&&y<=14) {
      if (x < 3 || x > 12 || y < 2 || y > 13) sp(...MTL);
      else { sp(...CON); if (y>=2&&y<=3) sp(...MTL); for (const sy of [5,8,11]) for (const sx of [4,7,10]) { if (Math.floor(x)===sx && Math.floor(y)===sy) sp(...MTL2); if (Math.floor(x)===sx+1 && Math.floor(y)===sy) sp(...MTL); } }
    }
  }},
  { name: "27_dark_window", fn: (x, y, sp) => {
    let [r,g,b]=WAL2;
    if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
      if (x < 3 || x > 12 || y < 3 || y > 12 || (x >= 7 && x < 9) || (y >= 7 && y < 9)) [r,g,b] = MTL;
      else { [r,g,b] = [10,12,18]; if (x >= 3.5 && x <= 5.5 && y >= 3.5 && y <= 5.5) [r,g,b] = [20,22,30]; }
    }
    sp(r,g,b);
  }},
  { name: "28_door_frame", fn: (x, y, sp) => {
    let [r,g,b]=FLR;
    if (x < 1 || x >= 15 || y < 1) [r,g,b] = MTL; if (x >= 2 && x <= 13 && y >= 1 && y <= 13) { r += 10; g += 8; b += 6; } if (y >= 14) [r,g,b] = MTL;
    sp(r,g,b);
  }},
  { name: "29_reinforced_wall", fn: (x, y, sp) => {
    const RW=[16,14,20], RW2=[26,22,32];
    const row=Math.floor(y/8), lx=(x+(row%2)*8)%16, ly=y%8;
    if (lx < 1 || ly < 1) sp(...RW); else sp(...RW2);
  }},
  { name: "30_memorial", fn: (x, y, sp, tr) => {
    tr();
    const ST=[42,34,34], STL=[58,46,46];
    if (x>=3&&x<=12&&y>=10&&y<=14) { if (x===3||x===12||y===14) sp(...ST); else sp(...STL); }
    if (x>=6&&x<=9&&y>=5&&y<=10) sp(...ST);
    const d=Math.sqrt((x-7.5)**2+(y-3.5)**2); if (d<3) sp(...(d<2?STL:ST));
  }},
  { name: "31_worn_carpet", fn: (x, y, sp) => {
    let [r,g,b]=CRP;
    if (x===0||x===15||y===0||y===15) [r,g,b]=CRP2;
    else if (x%4===0&&y%4===0) [r,g,b]=CRP3;
    else if ((x+y)%8<2) { r-=4; g-=4; b-=3; }
    sp(r,g,b);
  }},
  { name: "32_cracked_pavement", fn: (x, y, sp) => {
    let [r,g,b]=PAV;
    if (x===0||x===8||y===0||y===8) [r,g,b]=PAV2; if ((x*7+y*13+x*y)%19===0) { r+=8; g+=8; b+=10; }
    const cr = Math.abs(13*(x-3)-8*(y-1))/Math.sqrt(169+64);
    if (cr < 1.2 && x >= 3 && x <= 11 && y >= 1 && y <= 14) { [r,g,b] = PAV3; if (cr < 0.6) { r += 8; g += 8; b += 10; } }
    sp(r,g,b);
  }},
  { name: "33_trap_door", fn: (x, y, sp, tr) => {
    tr();
    const WD=[42, 28, 16], WD2=[58, 42, 26];
    if (x>=1&&x<=14&&y>=1&&y<=14) { if (x===1||x===14||y===1||y===14) sp(...WD); else { sp(...WD2); if (x>=6&&x<=9&&y>=6&&y<=9) sp(...WD); } }
  }},
  { name: "34_metal_pipe_h", fn: (x, y, sp, tr) => {
    tr();
    if (y >= 5 && y <= 10) {
      let c = MTL2; if (y < 6.5 || y > 8.5) c = MTL; if (y >= 7 && y < 8) c = MTL3; sp(...c);
    }
  }},
  { name: "35_metal_pipe_v", fn: (x, y, sp, tr) => {
    tr();
    if (x >= 5 && x <= 10) {
      let c = MTL2; if (x < 6.5 || x > 8.5) c = MTL; if (x >= 7 && x < 8) c = MTL3; sp(...c);
    }
  }},
  { name: "36_drainage_grating", fn: (x, y, sp) => {
    let [r,g,b] = PAV; if (x>=2&&x<=13&&y>=2&&y<=13) { if (Math.floor(x)%3===0) [r,g,b] = [10,10,15]; else [r,g,b] = MTL; }
    sp(r,g,b);
  }},
  { name: "37_small_bush", fn: (x, y, sp, tr) => {
    tr();
    const d = Math.sqrt(Math.pow(x-8,2) + Math.pow(y-10,2));
    if (d < 6) { let c = GRN; if (Math.floor(x+y)%4 === 0) c = GRN2; sp(...c); }
  }},
  { name: "38_small_dead_tree", fn: (x, y, sp, tr) => {
    tr();
    if (x>=7 && x<10 && y>=8) sp(...WOD); if ((Math.floor(x)===6||Math.floor(x)===10) && y>=10) sp(...WOD2);
    if (y < 10 && Math.abs(x-8) < (11-y)/2) sp(...WOD);
  }},
  { name: "39_flashlight_charger", fn: (x, y, sp) => {
    let [r,g,b] = MTL;
    if (x >= 2 && x <= 13 && y >= 2 && y <= 13) {
       [r,g,b] = MTL2; if (x < 3 || x > 12 || y < 3 || y > 12) [r,g,b] = MTL;
       const isBolt = (x >= 7.5 && x < 8.5 && y >= 4 && y <= 11) || (x >= 6.5 && x < 7.5 && y >= 7 && y < 8) || (x >= 8.5 && x < 9.5 && y >= 7 && y < 8);
       if (isBolt) [r,g,b] = [255, 255, 0];
    }
    sp(r,g,b);
  }},
  { name: "49_fuel_canister", fn: (x, y, sp, tr) => {
    tr();
    const FC=[180,40,30], FM=[220,60,50], FD=[120,20,20];
    if (x>=6&&x<=9&&y>=1&&y<=3) { if(y < 2 || x < 7 || x > 8) sp(...MTL); }
    if (x>=5&&x<=10&&y>=3&&y<=5) sp(...MTL);
    if (x>=3&&x<=12&&y>=6&&y<=14) { if (x < 4 || x > 11 || y > 13) sp(...FD); else sp(...FC); if (x >= 4 && x < 5 && y >= 7 && y <= 12) sp(...FM); }
  }},
];

// Large tree (3x3)
const treeParts = ['tl','tm','tr','ml','mm','mr','bl','bm','br'];
treeParts.forEach((part, index) => {
  const tx = index % 3, ty = Math.floor(index / 3);
  tileDefs.push({ name: `${40 + index}_tree_${part}`, fn: (x, y, sp, tr) => {
    tr();
    const gx = tx * 16 + x, gy = ty * 16 + y;
    const isTrunk = (gx >= 20 && gx <= 28 && gy >= 30) || (gx >= 22 && gx <= 26 && gy >= 16);
    const distToTop = Math.sqrt(Math.pow(gx-24, 2) + Math.pow(gy-12, 2));
    const distToLeft = Math.sqrt(Math.pow(gx-12, 2) + Math.pow(gy-20, 2));
    const distToRight = Math.sqrt(Math.pow(gx-36, 2) + Math.pow(gy-20, 2));
    let isFoliage = distToTop < 10 || distToLeft < 9 || distToRight < 9;
    const noise = (Math.sin(gx * 0.5) * Math.cos(gy * 0.5) * 5);
    if (isFoliage && (distToTop + noise > 9 && distToLeft + noise > 8 && distToRight + noise > 8)) { if ((gx + gy) % 3 === 0) isFoliage = false; }
    if (isTrunk) { let c = WOD; if (Math.floor(gx) % 4 === 0) c = WOD2; sp(...c); }
    else if (isFoliage) {
      let c = GRN; if (Math.floor(gx + gy) % 5 === 0) c = GRN2; if (Math.floor(gx - gy) % 7 === 0) c = GRN3; if (Math.floor(gx * 3 + gy) % 13 === 0) c = RUB;
      sp(...c);
    }
  }});
});

tileDefs.forEach(tile => {
  const pixels = new Uint8Array(TILE * TILE * 4);
  for (let py = 0; py < TILE; py++) {
    for (let px = 0; px < TILE; px++) {
      const i = (py * TILE + px) * 4;
      const sp = (r, g, b, a = 255) => { pixels[i] = r; pixels[i + 1] = g; pixels[i + 2] = b; pixels[i + 3] = a; };
      const tr = () => { pixels[i] = 0; pixels[i + 1] = 0; pixels[i + 2] = 0; pixels[i + 3] = 0; }; // Transparent
      tile.fn(px / S, py / S, sp, tr);
    }
  }
  fs.writeFileSync(path.join(srcDir, tile.name + ".png"), encodePNG(TILE, TILE, pixels));
  console.log(`Generated ${tile.name}.png`);
});
