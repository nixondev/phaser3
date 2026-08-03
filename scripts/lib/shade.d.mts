/** Types for shade.mjs — see that file for what each option actually does. */

export interface ShadeOptions {
  /** How far shading may push a pixel. Higher = more contrast. */
  strength: number;
  /** Dome radius in px (~sigma). Low = tight rim, high = body-wide wash. */
  blur: number;
  /** Frame cell size in px. */
  frame: number;
  /** Light direction in screen space, +y is UP. Normalised internally. */
  dir: [number, number, number] | number[];
  /** Weight of the whole-silhouette dome (body as one connected volume). */
  volume: number;
  /** Weight of the per-region domes (silhouette split at #000000 — by convention, edge). */
  parts: number;
  /** Blend of high-passed luminance into the dome for a textured ramp. 0 = off. */
  detail: number;
  /** Hue shift: shadows drift cool, highlights warm. 0 = plain multiply. */
  hue: number;
  /** Snap shaded pixels to the nearest colour of the original sheet. */
  palette: boolean;
  /** Minimum shade multiplier; stops shadows crushing to black. 0 disables. */
  floor: number;
  /** Maximum shade multiplier; stops highlights blowing out to white. */
  ceiling: number;
  /** Taper steepness. >1 = wider spread of tones, <1 = flatter. 1 = linear. */
  falloff: number;
  /** Quantise shading into bands of this size. 0 = smooth. */
  steps: number;
  /** Ordered dithering across band boundaries. Needs `steps`. 0 = off. */
  dither: number;
  /** EMBOSS MODE: rim width in px, 0 = off. Bypasses the dome model entirely. */
  bevel: number;
  /** Emboss rim intensity: ±(150 × this) per channel on rim pixels. */
  bevelDepth: number;
}

export declare const DEFAULTS: ShadeOptions;

/** Filename suffix for shaded output. */
export declare const SHADED_SUFFIX: string;

/** True for sheets that are themselves generated (`-shaded`, `_n`). */
export declare function isDerivedSheet(name: string): boolean;

/**
 * Shade an RGBA buffer in place, one frame cell at a time.
 * Accepts anything indexable: `ImageData.data` in the browser, a decoded PNG
 * buffer in Node.
 *
 * @returns the number of frame cells shaded
 * @throws if the buffer isn't a whole number of frames
 */
export declare function shadeSheet(
  pixels: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  options?: Partial<ShadeOptions>,
): number;
