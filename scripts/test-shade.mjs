// Regression suite for scripts/lib/shade.mjs — `npm run test-shade`.
// Synthetic sprites where ground truth is known, plus the real sheets.
import fs from 'fs';
import { createRequire } from 'module';
const req = createRequire(import.meta.url);
const { decodePNG } = req('./lib/png.cjs');
const { shadeSheet, isDerivedSheet, DEFAULTS } = await import('./lib/shade.mjs');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? '   ' + detail : ''}`); }
  else      { fail++; console.log(`  FAIL  ${name}${detail ? '   ' + detail : ''}`); }
};
const head = t => console.log(`\n=== ${t}`);

// ── helpers ────────────────────────────────────────────────────────────────
const GREY = 128;
// Multipliers are recovered from 8-bit pixels, so a value can land half a
// level either side of the true float. The clamp itself is exact.
const TOL = 0.5 / GREY;
// Neutralise the colour features for tests that recover the raw multiplier
// from the red channel — hue bends R by m^(1+hue) and detail perturbs the
// dome with luminance, either of which would fail exact grid/bound checks.
const N0 = { hue: 0, detail: 0 };
const blank = (w, h) => new Uint8Array(w * h * 4);
const put = (px, w, x, y, r, g, b, a = 255) => {
  const i = (y * w + x) * 4; px[i] = r; px[i+1] = g; px[i+2] = b; px[i+3] = a;
};
const rect = (px, w, x0, y0, rw, rh, c = GREY) => {
  for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) put(px, w, x, y, c, c, c);
};
const mult = (px, w, x, y, src = GREY) => px[(y * w + x) * 4] / src;
function mults(before, after, w, h, src = GREY) {
  const out = [];
  for (let i = 0; i < w * h; i++) {
    if (before[i*4+3] < 128) continue;
    if (before[i*4] !== src) continue;
    out.push(after[i*4] / src);
  }
  return out;
}
const sd = a => { const m = a.reduce((x,y)=>x+y,0)/a.length;
                  return Math.sqrt(a.reduce((x,y)=>x+(y-m)**2,0)/a.length); };
const shade = (px, w, h, o) => { const c = px.slice(); shadeSheet(c, w, h, o); return c; };

// A 64×64 cell with a 40×40 grey square centred. No black outlines, so the
// parts dome equals the volume dome and the composite behaves like one dome.
function square() { const p = blank(64,64); rect(p, 64, 12, 12, 40, 40); return p; }

// ── 1. flat interior is untouched (at FULL defaults — hue+detail on) ───────
head('flat interior invariance');
{
  const base = square();
  const out = shade(base, 64, 64, {});
  ok('centre pixel exactly 1.0×', mult(out, 64, 32, 32) === 1,
     `got ${mult(out,64,32,32).toFixed(4)}`);
  // Three box passes at the default radius 6 reach exactly 3r = 18px in from
  // the silhouette (verified empirically), and the Sobel samples ±1px beyond
  // that. In a 40px square only the centre 2×2 (depth 20) has every
  // neighbour clear of the dome.
  let identical = true;
  for (let y = 31; y < 33; y++) for (let x = 31; x < 33; x++)
    for (let c = 0; c < 3; c++) if (out[(y*64+x)*4+c] !== base[(y*64+x)*4+c]) identical = false;
  ok('centre 2×2 is bit-identical', identical);
}

// ── 2. alpha never changes ─────────────────────────────────────────────────
head('alpha preservation');
for (const sheet of ['old-man-2', 'player-2']) {
  const img = decodePNG(fs.readFileSync(new URL(`../public/assets/sprites/${sheet}.png`, import.meta.url)));
  const out = shade(img.pixels, img.width, img.height, { steps: 0.3, palette: true });
  let diff = 0;
  for (let i = 3; i < img.pixels.length; i += 4) if (img.pixels[i] !== out[i]) diff++;
  ok(`${sheet}: alpha bytes changed = 0`, diff === 0, `got ${diff}`);
}

// ── 3. strength scales the deviation ───────────────────────────────────────
head('STRENGTH');
{
  const base = square();
  ok('strength 0 leaves the sprite untouched',
     shade(base,64,64,{...N0,strength:0}).every((v,i)=>v===base[i]));
  const sds = [0.5,1,2,3].map(s => sd(mults(base, shade(base,64,64,{...N0,strength:s,floor:0,ceiling:9}), 64,64)));
  ok('spread of tones rises with strength',
     sds.every((v,i)=>i===0||v>sds[i-1]), sds.map(v=>v.toFixed(3)).join(' < '));
}

// ── 4. SPREAD widens the affected band ─────────────────────────────────────
head('SPREAD (blur)');
{
  const base = square();
  const counts = [1,2,3,5].map(blur => {
    const out = shade(base,64,64,{...N0,blur});
    let n = 0;
    for (let i = 0; i < 64*64; i++)
      if (base[i*4+3] > 127 && Math.abs(out[i*4] - base[i*4]) > 1) n++;
    return n;
  });
  ok('more pixels affected as spread grows',
     counts.every((v,i)=>i===0||v>counts[i-1]), counts.join(' < '));
}

// ── 5. TAPER raises variance; extent never falls ───────────────────────────
head('TAPER (falloff)');
{
  const base = square();
  const rows = [0.4,1,2,3].map(falloff => {
    const out = shade(base,64,64,{...N0,falloff,floor:0,ceiling:9});
    let n = 0;
    for (let i = 0; i < 64*64; i++)
      if (base[i*4+3] > 127 && Math.abs(out[i*4] - base[i*4]) > 4) n++;
    return { sd: sd(mults(base,out,64,64)), n };
  });
  ok('variance rises with taper', rows.every((r,i)=>i===0||r.sd>rows[i-1].sd),
     rows.map(r=>r.sd.toFixed(3)).join(' < '));
  ok('visible extent never falls as taper rises', rows.every((r,i)=>i===0||r.n>=rows[i-1].n),
     rows.map(r=>r.n).join(' <= '));
}

// ── 6. FLOOR / CEILING are hard bounds, each on its own side ───────────────
head('FLOOR / CEILING');
{
  const base = square();
  for (const floor of [0.2, 0.45, 0.8]) {
    const m = mults(base, shade(base,64,64,{...N0,floor,strength:3}), 64,64);
    ok(`floor ${floor}: nothing below it`, Math.min(...m) >= floor - TOL,
       `min ${Math.min(...m).toFixed(3)}`);
  }
  for (const ceiling of [1.1, 1.6, 2.5]) {
    const m = mults(base, shade(base,64,64,{...N0,ceiling,strength:3}), 64,64);
    ok(`ceiling ${ceiling}: nothing above it`, Math.max(...m) <= ceiling + TOL,
       `max ${Math.max(...m).toFixed(3)}`);
  }
  const hiA = mults(base, shade(base,64,64,{...N0,floor:0.1,strength:3}), 64,64).filter(v=>v>1);
  const hiB = mults(base, shade(base,64,64,{...N0,floor:0.9,strength:3}), 64,64).filter(v=>v>1);
  ok('floor does not touch highlights',
     hiA.length===hiB.length && hiA.every((v,i)=>Math.abs(v-hiB[i])<1e-9));
  const loA = mults(base, shade(base,64,64,{...N0,ceiling:1.1,strength:3}), 64,64).filter(v=>v<1);
  const loB = mults(base, shade(base,64,64,{...N0,ceiling:2.5,strength:3}), 64,64).filter(v=>v<1);
  ok('ceiling does not touch shadows',
     loA.length===loB.length && loA.every((v,i)=>Math.abs(v-loB[i])<1e-9));
}

// ── 7. BANDS quantises onto a grid ─────────────────────────────────────────
head('BANDS (steps)');
{
  const base = square();
  const counts = [0, 0.2, 0.35, 0.6].map(steps =>
    new Set(mults(base, shade(base,64,64,{...N0,steps,floor:0,ceiling:9}), 64,64)
      .map(v=>v.toFixed(3))).size);
  ok('tone count falls as band size grows',
     counts.every((v,i)=>i===0||v<=counts[i-1]), counts.join(' >= '));
  const steps = 0.25;
  const offGrid = mults(base, shade(base,64,64,{...N0,steps,floor:0,ceiling:9}), 64,64)
    .filter(v => Math.abs(Math.round((v-1)/steps)*steps + 1 - v) > 1e-6);
  ok('every tone lands on the band grid', offGrid.length === 0, `${offGrid.length} off-grid`);
}

// ── 8. light direction ─────────────────────────────────────────────────────
head('ANGLE / HEIGHT (direction)');
{
  const base = square();
  const halves = (deg) => {
    const r = deg*Math.PI/180;
    const out = shade(base,64,64,{...N0,dir:[Math.cos(r),Math.sin(r),0.6]});
    let l=0,ln=0,rr=0,rn=0,t=0,tn=0,b=0,bn=0;
    for (let y=0;y<64;y++) for (let x=0;x<64;x++) {
      if (base[(y*64+x)*4+3]<128) continue;
      const m = mult(out,64,x,y);
      if (x<32){l+=m;ln++;} else {rr+=m;rn++;}
      if (y<32){t+=m;tn++;} else {b+=m;bn++;}
    }
    return { left:l/ln, right:rr/rn, top:t/tn, bottom:b/bn };
  };
  const L = halves(180), R = halves(0), T = halves(90), B = halves(270);
  ok('light from the left  -> left brighter',  L.left > L.right,  `${L.left.toFixed(3)} > ${L.right.toFixed(3)}`);
  ok('light from the right -> right brighter', R.right > R.left,  `${R.right.toFixed(3)} > ${R.left.toFixed(3)}`);
  ok('light from above     -> top brighter',   T.top > T.bottom,  `${T.top.toFixed(3)} > ${T.bottom.toFixed(3)}`);
  ok('light from below     -> bottom brighter',B.bottom > B.top,  `${B.bottom.toFixed(3)} > ${B.top.toFixed(3)}`);
}

// ── 9. PARTS: every #000000 pixel is an edge, by convention ────────────────
head('PARTS (black = edge, by convention)');
{
  const p = blank(64,64);
  rect(p, 64, 14, 10, 36, 44);                                  // body
  for (let x=14;x<50;x++){ put(p,64,x,10,0,0,0); put(p,64,x,53,0,0,0); }
  for (let y=10;y<54;y++){ put(p,64,14,y,0,0,0); put(p,64,49,y,0,0,0); }   // ring
  for (let y=20;y<22;y++) for (let x=24;x<26;x++) put(p,64,x,y,1,1,1);     // pupil, #000001
  for (let y=20;y<22;y++) for (let x=38;x<40;x++) put(p,64,x,y,0,0,0);     // pupil, #000000
  const P1 = {...N0, volume: 0, parts: 1, blur: 4};
  const out = shade(p,64,64,P1);
  ok('outline ring acts as a wall', mult(out,64,16,32) !== 1, `mult ${mult(out,64,16,32).toFixed(3)}`);

  // A pixel group is a wall iff DELETING it changes the shading elsewhere.
  const without = (cells) => {
    const q = p.slice();
    for (const [x,y] of cells) put(q,64,x,y,GREY,GREY,GREY);
    return shade(q,64,64,P1);
  };
  const near  = []; for(let y=20;y<22;y++) for(let x=24;x<26;x++) near.push([x,y]);
  const black = []; for(let y=20;y<22;y++) for(let x=38;x<40;x++) black.push([x,y]);
  const elsewhereDiffers = (other, cells) => {
    const skip = new Set(cells.map(([x,y])=>y*64+x));
    for (let i=0;i<64*64;i++) if (!skip.has(i) && out[i*4] !== other[i*4]) return true;
    return false;
  };
  ok('#000001 pupil is NOT a wall (deleting it changes nothing else)',
     !elsewhereDiffers(without(near), near));
  ok('#000000 pupil IS a wall (deleting it changes its surroundings)',
     elsewhereDiffers(without(black), black));
  ok('parts differs from volume-only',
     !shade(p,64,64,{...N0,volume:1,parts:0,blur:4}).every((v,i)=>v===out[i]));
  let blackMoved = 0;
  for (let i=0;i<64*64;i++) {
    if (p[i*4+3]<128 || p[i*4]||p[i*4+1]||p[i*4+2]) continue;
    for (let c=0;c<3;c++) if (out[i*4+c] !== 0) blackMoved++;
  }
  ok('#000000 pixels never change value', blackMoved === 0, `${blackMoved} moved`);
}

// ── 10. adjacent regions: the composite softens the shared-edge double rim ─
head('adjacent regions (composite vs parts-only)');
{
  // Two sealed grey boxes side by side sharing one outline column — the
  // "head resting on the collar" case. Parts-only shades each as its own
  // pillow: a shadow facing a highlight across the shared edge.
  const p = blank(64,64);
  rect(p, 64, 12, 20, 40, 24);
  for (let x=12;x<52;x++){ put(p,64,x,20,0,0,0); put(p,64,x,43,0,0,0); }
  for (let y=20;y<44;y++){ put(p,64,12,y,0,0,0); put(p,64,51,y,0,0,0); put(p,64,31,y,0,0,0); } // shared wall at x=31

  const contrast = (out) => {
    // mean |Δ| across the shared edge, sampled just either side of x=31
    let s=0,n=0;
    for (let y=22;y<42;y++) {
      s += Math.abs(out[(y*64+29)*4] - out[(y*64+33)*4]); n++;
    }
    return s/n;
  };
  const partsOnly = contrast(shade(p,64,64,{...N0, volume:0,   parts:1,   blur:4}));
  const blended   = contrast(shade(p,64,64,{...N0, volume:0.5, parts:0.5, blur:4}));
  ok('blend reduces the shared-edge contrast', blended < partsOnly,
     `${blended.toFixed(1)} < ${partsOnly.toFixed(1)}`);
}

// ── 11. HUE: cool shadows, warm highlights ─────────────────────────────────
head('HUE');
{
  const base = square();
  const out = shade(base,64,64,{hue:0.4, detail:0});
  let shadowOK = true, lightOK = true, sn=0, ln=0;
  for (let i=0;i<64*64;i++) {
    if (base[i*4+3]<128) continue;
    const r=out[i*4], g=out[i*4+1], b=out[i*4+2];
    if (g < GREY - 4) { sn++; if (!(b > r)) shadowOK = false; }   // shadow: blue survives
    if (g > GREY + 4) { ln++; if (!(r > b)) lightOK = false; }    // highlight: red leads
  }
  ok(`shadows are cool (blue > red) in all ${sn} shadow px`, shadowOK && sn > 0);
  ok(`highlights are warm (red > blue) in all ${ln} highlight px`, lightOK && ln > 0);
  const plain = shade(base,64,64,{hue:0, detail:0});
  let neutral = true;
  for (let i=0;i<64*64;i++) {
    if (base[i*4+3]<128) continue;
    if (plain[i*4] !== plain[i*4+1] || plain[i*4+1] !== plain[i*4+2]) neutral = false;
  }
  ok('hue 0 keeps grey exactly grey on all channels', neutral);
}

// ── 12. PALETTE: output colours all come from the source sheet ─────────────
head('PALETTE snap');
{
  const img = decodePNG(fs.readFileSync(new URL('../public/assets/sprites/old-man-2.png', import.meta.url)));
  const srcCols = new Set();
  for (let i=0;i<img.pixels.length;i+=4) {
    if (img.pixels[i+3] < 128) continue;
    srcCols.add((img.pixels[i]<<16)|(img.pixels[i+1]<<8)|img.pixels[i+2]);
  }
  const out = shade(img.pixels, img.width, img.height, { palette: true });
  let foreign = 0;
  for (let i=0;i<img.pixels.length;i+=4) {
    if (img.pixels[i+3] < 128) continue;
    if (!srcCols.has((out[i]<<16)|(out[i+1]<<8)|out[i+2])) foreign++;
  }
  ok('every shaded pixel is a colour from the original sheet', foreign === 0,
     `${foreign} foreign colours (source palette ${srcCols.size})`);
}

// ── 13. frame cells are independent ────────────────────────────────────────
head('frame-cell isolation');
{
  const p = blank(128,64);
  for (const ox of [0,64]) for (let y=20;y<44;y++) for (let x=ox+20;x<ox+44;x++)
    put(p,128,x,y,GREY,GREY,GREY);
  const out = shade(p,128,64,{});
  let same = true;
  for (let y=0;y<64;y++) for (let x=0;x<64;x++)
    if (out[(y*128+x)*4] !== out[(y*128+x+64)*4]) same = false;
  ok('identical frames shade identically', same);

  const q = p.slice();
  for (let y=0;y<64;y++) for (let x=0;x<64;x++) put(q,128,x,y,255,255,255);
  const outQ = shade(q,128,64,{});
  let bLeaked = false;
  for (let y=0;y<64;y++) for (let x=64;x<128;x++)
    if (outQ[(y*128+x)*4] !== out[(y*128+x)*4]) bLeaked = true;
  ok('filling cell A leaves cell B byte-identical', !bLeaked);
}

// ── 14. emboss mode (bevel > 0) ────────────────────────────────────────────
head('EMBOSS (bevel)');
{
  const B = { bevel: 2, bevelDepth: 0.4 };          // delta = 60
  const base = square();                            // grey 40×40 at 12,12
  const out = shade(base, 64, 64, B);
  // Default light bearing is DEFAULTS.dir's xy, normalised: the push scales
  // CONTINUOUSLY with how squarely the edge faces the light (no thresholds).
  const bl = Math.hypot(DEFAULTS.dir[0], DEFAULTS.dir[1]);
  const lx = DEFAULTS.dir[0] / bl, ly = DEFAULTS.dir[1] / bl;   // -0.447, 0.894
  const push = (s, t = 1) => Math.round(60 * t * s);
  ok('top edge lit ∝ facing',   out[(12*64+32)*4] === GREY + push(ly), `got ${out[(12*64+32)*4]}`);
  ok('left edge lit ∝ facing',  out[(32*64+12)*4] === GREY + push(-lx), `got ${out[(32*64+12)*4]}`);
  ok('bottom edge dark ∝ facing', out[(51*64+32)*4] === GREY - push(ly), `got ${out[(51*64+32)*4]}`);
  ok('right edge dark ∝ facing',  out[(32*64+51)*4] === GREY - push(-lx), `got ${out[(32*64+51)*4]}`);
  // Chamfer taper: row 2 of a 2px rim is at half intensity.
  ok('rim fades across its width', out[(13*64+32)*4] === GREY + push(ly, 0.5), `got ${out[(13*64+32)*4]}`);
  let interiorSame = true;
  for (let y = 14; y < 50; y++) for (let x = 14; x < 50; x++)
    for (let c = 0; c < 4; c++)
      if (out[(y*64+x)*4+c] !== base[(y*64+x)*4+c]) interiorSame = false;
  ok('interior beyond the rim is bit-identical', interiorSame);
  let alphaSame = true;
  for (let i = 3; i < base.length; i += 4) if (out[i] !== base[i]) alphaSame = false;
  ok('alpha untouched', alphaSame);

  // #000000 outline pixels are immune — the rim forms on the colours inside.
  const ol = square();
  for (let x = 12; x < 52; x++) { put(ol,64,x,12,0,0,0); put(ol,64,x,51,0,0,0); }
  const outOl = shade(ol, 64, 64, B);
  ok('black outline stays black', outOl[(12*64+32)*4] === 0 && outOl[(51*64+32)*4] === 0);

  // Translation invariance: art nudged against the cell boundary (walk-bob
  // head on row 0) must emboss EXACTLY like art floating mid-cell — outside
  // the cell counts as empty, same rule as the dome blur. The user caught the
  // opposite rule losing the head's top highlight after a NUDGE up.
  const top = blank(64,64); rect(top, 64, 12, 0, 40, 40);
  const outTop = shade(top, 64, 64, B);
  let shifted = true;
  for (let y = 0; y < 40 && shifted; y++) for (let x = 0; x < 40; x++)
    for (let c = 0; c < 4; c++)
      if (outTop[((y)*64+(12+x))*4+c] !== out[((12+y)*64+(12+x))*4+c]) { shifted = false; }
  ok('boundary-touching art embosses identically to mid-cell', shifted);
}

// ── 15. guards ─────────────────────────────────────────────────────────────
head('guards');
{
  ok('isDerivedSheet("x-shaded")', isDerivedSheet('x-shaded') === true);
  ok('isDerivedSheet("x_n")',      isDerivedSheet('x_n') === true);
  ok('isDerivedSheet("x")',        isDerivedSheet('x') === false);
  let threw = false;
  try { shadeSheet(blank(70,70), 70, 70, {}); } catch { threw = true; }
  ok('non-multiple-of-frame throws', threw);
  ok('defaults are the locked house style (candidate E, 2026-08-01)',
     DEFAULTS.strength===0.8 && DEFAULTS.blur===6 && DEFAULTS.volume===0.8 &&
     DEFAULTS.parts===0.2 && DEFAULTS.detail===0 && DEFAULTS.hue===0.35 &&
     DEFAULTS.palette===false && DEFAULTS.floor===0.65 && DEFAULTS.ceiling===1.3 &&
     DEFAULTS.falloff===1.2 && DEFAULTS.steps===0 && DEFAULTS.dither===0 &&
     DEFAULTS.bevel===0,
     JSON.stringify({s:DEFAULTS.strength,b:DEFAULTS.blur,v:DEFAULTS.volume,p:DEFAULTS.parts,
                     d:DEFAULTS.detail,h:DEFAULTS.hue}));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
