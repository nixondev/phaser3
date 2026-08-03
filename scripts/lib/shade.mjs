// Baked key-light shading for character spritesheets.
//
// SINGLE implementation, deliberately plain ESM JavaScript with no imports, so
// the exact same code runs in all three places that shade sprites:
//   - the `$` editor's live preview and SHADE button (bundled by Vite)
//   - the dev server's /__editor/shade-sprite endpoint (Node ESM)
//   - the `npm run bake-depth` CLI (Node ESM)
// It operates on a raw RGBA byte buffer, which is equally an ImageData.data in
// the browser and a decoded PNG buffer in Node. Types live in shade.d.mts.
//
// DEFAULTS below ARE the project's house shading style (locked 2026-08-01,
// user-picked from rendered candidates): a subtle volume-led directional wash
// that respects the art's existing hand shading. Bare `npm run bake-depth`
// and the $ editor's RESET both produce exactly this look.
//
// ── The model ────────────────────────────────────────────────────────────────
// One composite HEIGHT FIELD per frame cell, shaded once with a directional
// light:
//
//   H = ( volume × dome(whole silhouette)
//       + parts  × dome(silhouette split at #000000 outline pixels)
//       ) / (volume + parts)
//       + detail × high-passed luminance
//
// Why a composite rather than independent per-region domes: shading each
// outlined region on its own makes every part a separate "pillow" — where two
// regions touch (head on collar, arm on torso) each gets a full rim at the
// shared edge, a highlight facing a shadow, and the parts visibly pop apart.
// Summing a whole-body dome with the per-part domes turns touching parts into
// bumps on one shared hill: the shared edge becomes a fold in a continuous
// surface instead of a crack between two stickers.
//
// The same blend is also the guard against automated "pillow shading" (the
// classic pixel-art anti-pattern — shading concentric to the outline reads as
// flat): the light is directional, and the volume term keeps one dominant
// body-wide gradient that the part domes only modulate.

export const DEFAULTS = {
  /** How far shading may push a pixel. Higher = more contrast. */
  strength: 0.8,
  /**
   * Dome radius in PIXELS (~sigma of the blur). Small hugs the silhouette,
   * large washes across the whole body.
   */
  blur: 6,
  frame: 64,
  dir: [-0.5, 1, 0.9], // screen coords, +y is UP — overhead, from the top left
  /**
   * Weight of the WHOLE-SILHOUETTE dome: the body as one connected volume.
   * This is what keeps touching parts from reading as separate pillows.
   */
  volume: 0.8,
  /**
   * Weight of the PER-REGION domes: the silhouette split at every opaque
   * #000000 pixel. Pure black is BY CONVENTION the outline colour, nothing is
   * inferred — a black-looking pixel that is not an edge (a pupil) should be
   * painted #000001, which is visually identical. This split is what lets
   * light fall down a chin instead of dying where head merges into shirt. On
   * a sheet with no pure-black pixels it equals the volume dome.
   */
  parts: 0.2,
  /**
   * Blend of high-passed luminance into the dome, 0 = off. Only the art's fine
   * grain survives the high-pass, so this roughens the ramp — the "lightly
   * texturised" quality of GIMP's Lighting Effects — without large dark areas
   * reading as deep geometry and blowing out, which is why the raw-luminance
   * route was abandoned.
   */
  detail: 0,
  /**
   * Hue shift, the pixel-art colour rule baked in: shadows drift COOL,
   * highlights drift WARM, instead of just darkening toward mud.
   *
   * Implemented as per-channel exponents on the shade multiplier m:
   *   R × m^(1+hue), G × m, B × m^(1-hue)
   * For m < 1 red falls fastest and blue survives — cool shadows. For m > 1
   * red rises fastest — warm highlights. m = 1 is a fixed point on every
   * channel, so flat interiors remain bit-identical, and black stays black.
   */
  hue: 0.35,
  /**
   * Snap every shaded pixel to the nearest colour that existed in the ORIGINAL
   * sheet. Enforces pixel-art palette discipline: shading can only move a
   * pixel along ramps the artist already painted. Harsh on very low-colour
   * sheets (few ramp steps to land on), best combined with steps/dither.
   */
  palette: false,
  /**
   * Floor on the shade multiplier. The response is linear in
   * (lambert − neutral) with neutral = L.z ≈ 0.63, so the shadow side has
   * ~1.7× the range of the lit side and at high strength reaches 0 — pure
   * black, detail gone. Only bites below 1, so highlights are unaffected.
   */
  floor: 0.65,
  /**
   * Ceiling on the shade multiplier — the highlight counterpart to `floor`.
   * 1.3 matches the natural maximum at the default strength (1 + 0.8×0.37),
   * so it is a no-op until strength is raised. Only bites above 1.
   */
  ceiling: 1.3,
  /**
   * Steepness of the taper. 1 = linear. Higher = MORE tonal variance: the ramp
   * plateaus so pixels commit to light or dark. Lower eases mid-tones back
   * toward neutral. Ends stay pinned. Also affects how much of the dome's
   * reach survives into visibly changed pixels.
   */
  falloff: 1.2,
  /**
   * Quantise the shading into discrete bands of this size, 0 = off. Hand-shaded
   * pixel art uses a few flat tones, not a continuous ramp; this is the main
   * thing separating "shaded" from "filtered".
   */
  steps: 0,
  /**
   * Ordered (Bayer 4×4) dithering across band boundaries, 0 = off. Only
   * meaningful with `steps`. Band edges become checkerboards that read as a
   * continuous gradient. Needs ~8-10px of band width to read as gradient
   * rather than noise.
   */
  dither: 0,
  /**
   * EMBOSS MODE — rim width in pixels, 0 = off. When set, the dome model above
   * is bypassed entirely: the sprite is treated as a flat sticker raised off
   * the surface. Only pixels within `bevel` px of transparency get touched —
   * lifted where the silhouette edge faces the light, dropped on the opposite
   * edge — and the interior stays bit-identical. Pure silhouette geometry:
   * interior #000000 lines are NOT split on, and outline pixels themselves
   * stay black (the outline convention). Off the cell edge counts as EMPTY —
   * the same rule as the dome blur, for the same reason: art nudged against
   * the frame boundary (the walk-bob head on row 0) must emboss exactly like
   * art floating mid-cell, or the rim changes with position and the cycle
   * flickers.
   */
  bevel: 0,
  /**
   * Emboss rim intensity: ±(150 × this) per channel at the silhouette edge,
   * fading linearly to zero across the `bevel` width (a chamfer, not a slab).
   */
  bevelDepth: 0.4,
};

/** Suffix for shaded output, and the marker that a sheet is already derived. */
export const SHADED_SUFFIX = '-shaded';

/** 4x4 Bayer matrix, normalised to -0.5..0.5. */
const BAYER4 = [
   0,  8,  2, 10,
  12,  4, 14,  6,
   3, 11,  1,  9,
  15,  7, 13,  5,
].map(v => v / 16 - 0.5);

/** Derived sheets are never valid inputs — shading one would stack a 2nd pass. */
export function isDerivedSheet(name) {
  return name.endsWith(SHADED_SUFFIX) || name.endsWith('_n');
}

/**
 * Blur into a dome: three separable prefix-sum box passes ~= Gaussian with
 * sigma ~ `radius` px, cost independent of radius.
 *
 * Outside the cell counts as EMPTY (missing samples contribute zero), never a
 * copy of the edge pixel — otherwise art flush against a frame boundary (the
 * walk frame where the bob puts the head on row 0) loses its gradient and that
 * frame flickers dark against the rest of the cycle.
 */
function boxBlur(src, size, radius, passes = 3) {
  const r = Math.max(1, Math.round(radius));
  const width = 2 * r + 1;
  const prefix = new Float32Array(size + 1);
  let cur = src;

  for (let p = 0; p < passes; p++) {
    const horiz = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      const row = y * size;
      prefix[0] = 0;
      for (let x = 0; x < size; x++) prefix[x + 1] = prefix[x] + cur[row + x];
      for (let x = 0; x < size; x++) {
        const lo = x - r > 0 ? x - r : 0;
        const hi = x + r < size - 1 ? x + r : size - 1;
        horiz[row + x] = (prefix[hi + 1] - prefix[lo]) / width;
      }
    }
    const vert = new Float32Array(size * size);
    for (let x = 0; x < size; x++) {
      prefix[0] = 0;
      for (let y = 0; y < size; y++) prefix[y + 1] = prefix[y] + horiz[y * size + x];
      for (let y = 0; y < size; y++) {
        const lo = y - r > 0 ? y - r : 0;
        const hi = y + r < size - 1 ? y + r : size - 1;
        vert[y * size + x] = (prefix[hi + 1] - prefix[lo]) / width;
      }
    }
    cur = vert;
  }
  return cur;
}

/** Shade one frame cell in place. See the model notes at the top of the file. */
function shadeCell(pixels, w, x0, y0, size, L, o, snap) {
  const n = size * size;

  // True alpha decides which pixels get written; the two dome sources are
  // variations of it. Outline pixels are written too — black is a fixed point
  // of both the multiply and the hue exponents, so they come out unchanged.
  const alpha = new Float32Array(n);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      alpha[y * size + x] = pixels[((y0 + y) * w + (x0 + x)) * 4 + 3] / 255;
    }
  }

  const wSum = o.volume + o.parts;
  let h;
  if (wSum > 1e-6) {
    const domeV = o.volume > 0 ? boxBlur(alpha, size, o.blur) : null;
    let domeP = null;
    if (o.parts > 0) {
      // BY CONVENTION every opaque #000000 pixel is an outline — no inference.
      // Art that wants black-looking non-edges (a pupil, a boot) uses #000001,
      // which is visually identical.
      const split = new Float32Array(n);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const i = y * size + x;
          const p = ((y0 + y) * w + (x0 + x)) * 4;
          const isEdge = pixels[p + 3] > 127 && !pixels[p] && !pixels[p + 1] && !pixels[p + 2];
          split[i] = isEdge ? 0 : alpha[i];
        }
      }
      domeP = boxBlur(split, size, o.blur);
    }
    h = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      h[i] = ((domeV ? o.volume * domeV[i] : 0) + (domeP ? o.parts * domeP[i] : 0)) / wSum;
    }
  } else {
    h = new Float32Array(n); // no dome at all — only detail can shade
  }

  if (o.detail > 0) {
    // High-passed luminance: only fine grain survives, so this roughens the
    // ramp without shifting where the light falls.
    const lum = new Float32Array(n);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const i = y * size + x;
        if (alpha[i] === 0) continue;
        const p = ((y0 + y) * w + (x0 + x)) * 4;
        lum[i] = (0.299 * pixels[p] + 0.587 * pixels[p + 1] + 0.114 * pixels[p + 2]) / 255;
      }
    }
    const smooth = boxBlur(lum, size, 2, 1);
    for (let i = 0; i < n; i++) {
      if (alpha[i] === 0) continue;
      h[i] += o.detail * (lum[i] - smooth[i]);
    }
  }

  // Off the cell edge is empty, height 0 — same rule as the blur.
  const at = (x, y) =>
    (x < 0 || x >= size || y < 0 || y >= size) ? 0 : h[y * size + x];
  const neutral = L[2];
  const hueUp = 1 + o.hue, hueDn = 1 - o.hue;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (alpha[y * size + x] === 0) continue;

      const gu = (
        -at(x-1,y-1) + at(x+1,y-1)
        - 2*at(x-1,y) + 2*at(x+1,y)
        - at(x-1,y+1) + at(x+1,y+1)
      ) / 8;
      const gv = (
        -at(x-1,y-1) - 2*at(x,y-1) - at(x+1,y-1)
        + at(x-1,y+1) + 2*at(x,y+1) + at(x+1,y+1)
      ) / 8;

      // Dome gradients shrink as 1/sigma as the dome widens; scaling the
      // normal tilt with the radius keeps `strength` meaning the same thing
      // across the whole SPREAD range.
      const k = 4 * o.blur;
      let nx = -gu * k, ny = gv * k, nz = 1;
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;

      let dev = o.strength * ((nx*L[0] + ny*L[1] + nz*L[2]) - neutral);
      if (o.falloff !== 1 && dev !== 0) {
        // Normalise per side before curving so the extremes stay pinned;
        // reciprocal exponent so a bigger slider = steeper ramp, more variance.
        const span = dev > 0 ? o.strength * (1 - neutral) : o.strength * neutral;
        if (span > 0) {
          const t = Math.min(1, Math.abs(dev) / span);
          dev = Math.sign(dev) * span * Math.pow(t, 1 / o.falloff);
        }
      }
      let shade = 1 + dev;
      // Band before clamping, so floor/ceiling stay exact bounds. Perturbing
      // the rounding THRESHOLD (not the value) is what turns a band edge into
      // a checkerboard between the two neighbouring tones.
      if (o.steps > 0) {
        const bias = o.dither > 0 ? BAYER4[(y & 3) * 4 + (x & 3)] * o.dither : 0;
        shade = Math.round((shade - 1) / o.steps + bias) * o.steps + 1;
      }
      shade = Math.min(o.ceiling, Math.max(o.floor, shade));

      const di = ((y0 + y) * w + (x0 + x)) * 4;
      if (o.hue > 0 && shade !== 1) {
        // Cool shadows, warm highlights — see DEFAULTS.hue.
        pixels[di]     = Math.max(0, Math.min(255, Math.round(pixels[di]     * Math.pow(shade, hueUp))));
        pixels[di + 1] = Math.max(0, Math.min(255, Math.round(pixels[di + 1] * shade)));
        pixels[di + 2] = Math.max(0, Math.min(255, Math.round(pixels[di + 2] * Math.pow(shade, hueDn))));
      } else {
        for (let c = 0; c < 3; c++) {
          pixels[di + c] = Math.max(0, Math.min(255, Math.round(pixels[di + c] * shade)));
        }
      }
      if (snap) snap(pixels, di);
    }
  }
}

/**
 * Emboss one frame cell in place: raised-sticker rim, interior untouched.
 * See DEFAULTS.bevel for the contract.
 */
function embossCell(pixels, w, x0, y0, size, L, o, snap) {
  const b = Math.max(1, Math.round(o.bevel));
  const delta = Math.round(150 * o.bevelDepth);
  // 2D light bearing; +y is UP in dir space, screen y grows DOWN.
  const ll = Math.hypot(L[0], L[1]) || 1;
  const lx = L[0] / ll, ly = L[1] / ll;

  const solid = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      solid[y * size + x] = pixels[((y0 + y) * w + (x0 + x)) * 4 + 3] > 127 ? 1 : 0;
    }
  }
  // Outside the cell counts as EMPTY, same as the dome blur — art against
  // the frame boundary must emboss identically to art mid-cell.
  const solidAt = (x, y) =>
    (x < 0 || x >= size || y < 0 || y >= size) ? 0 : solid[y * size + x];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!solid[y * size + x]) continue;
      const di = ((y0 + y) * w + (x0 + x)) * 4;
      // Outline pixels are immune by convention — an emboss that greys the
      // black outline reads as a blurry halo, not a raised sprite.
      if (!pixels[di] && !pixels[di + 1] && !pixels[di + 2]) continue;

      // Which way is "outside" from here? Direction to nearby empty pixels,
      // weighted by inverse-square distance so the NEAREST edge dominates —
      // an unweighted sum answers "which side of the whole sprite am I on"
      // and a wide rim degenerates into a giant two-tone body split.
      let ox = 0, oy = 0, dmin = Infinity;
      for (let dy = -b; dy <= b; dy++) {
        for (let dx = -b; dx <= b; dx++) {
          if (solidAt(x + dx, y + dy)) continue;
          const w2 = 1 / (dx * dx + dy * dy);
          ox += dx * w2; oy += dy * w2;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          if (d < dmin) dmin = d;
        }
      }
      if (dmin === Infinity) continue;
      // Chamfer: full intensity at the silhouette, fading to nothing past
      // `bevel` px — width means WIDTH, not a flat slab.
      const t = 1 - (dmin - 1) / b;
      const ol = Math.hypot(ox, oy);
      if (ol < 1e-6) continue; // edges on opposing sides cancel — leave it
      // Outward normal vs light bearing (flip oy: screen→up-positive), applied
      // CONTINUOUSLY: full lift facing the light, zero side-on, full drop
      // opposite. No thresholds — that's what keeps the edge soft around
      // corners instead of snapping between three flat zones.
      const s = (ox / ol) * lx + (-oy / ol) * ly;
      const push = Math.round(delta * t * s);
      if (push === 0) continue;
      for (let c = 0; c < 3; c++) {
        pixels[di + c] = Math.max(0, Math.min(255, pixels[di + c] + push));
      }
      if (snap) snap(pixels, di);
    }
  }
}

/**
 * Build a palette snapper from the sheet's pre-shading colours: a function
 * that rewrites the pixel at `di` to the nearest original colour. Distances
 * are cached per output colour, so cost is amortised across the sheet.
 */
function makePaletteSnapper(pixels) {
  const seen = new Set();
  const cols = [];
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] < 128) continue;
    const key = (pixels[i] << 16) | (pixels[i + 1] << 8) | pixels[i + 2];
    if (!seen.has(key)) { seen.add(key); cols.push([pixels[i], pixels[i + 1], pixels[i + 2]]); }
  }
  if (cols.length === 0) return null;
  const cache = new Map();
  return (px, di) => {
    const key = (px[di] << 16) | (px[di + 1] << 8) | px[di + 2];
    let best = cache.get(key);
    if (best === undefined) {
      let bd = Infinity;
      for (const c of cols) {
        const dr = px[di] - c[0], dg = px[di + 1] - c[1], db = px[di + 2] - c[2];
        // Perceptual-ish weights; plain RGB reads green-blind.
        const d = 2 * dr * dr + 4 * dg * dg + 3 * db * db;
        if (d < bd) { bd = d; best = c; }
      }
      cache.set(key, best);
    }
    px[di] = best[0]; px[di + 1] = best[1]; px[di + 2] = best[2];
  };
}

/**
 * Shade a whole sheet in place, cell by cell. Per-cell isolation makes the
 * light land identically on every frame of a walk cycle and stops any blur
 * reaching into the neighbouring frame.
 *
 * @param {Uint8Array} pixels RGBA, mutated in place
 * @throws if the sheet isn't a whole number of frames
 */
export function shadeSheet(pixels, width, height, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const F = o.frame;
  if (width % F !== 0 || height % F !== 0) {
    throw new Error(`${width}×${height} is not a whole number of ${F}px frames`);
  }
  const dl = Math.hypot(o.dir[0], o.dir[1], o.dir[2]) || 1;
  const L = [o.dir[0] / dl, o.dir[1] / dl, o.dir[2] / dl];

  // Palette must be captured before any cell is mutated.
  const snap = o.palette ? makePaletteSnapper(pixels) : null;

  const cell = o.bevel > 0 ? embossCell : shadeCell;
  for (let fy = 0; fy < height; fy += F) {
    for (let fx = 0; fx < width; fx += F) {
      cell(pixels, width, fx, fy, F, L, o, snap);
    }
  }
  return (width / F) * (height / F);
}
