import Phaser from 'phaser';

/**
 * Keeping full-screen overlays screen-sized under camera zoom.
 *
 * `setScrollFactor(0)` pins an object against camera SCROLL, but not against
 * camera ZOOM: Phaser scales about the camera midpoint, so at zoom z a 1280×960
 * overlay placed at (0,0) renders 1280z×960z px starting at a negative offset.
 * Rain, drips, clouds, the darkness RT and the transition fade are all authored
 * in screen pixels and must stay 1:1 no matter how close the camera is.
 *
 * Phaser renders a scrollFactor-0 object at
 *     screen = (pos − o)·z + o        where o = camera size × camera origin
 * so to land it at a chosen screen point we invert that and divide out z:
 *     pos = (screen − o)/z + o,  scale = 1/z
 * A pinned object's local (0,0)…(w,h) then maps to screen pixels exactly, which
 * is what the effects already assume — so nothing inside them has to change.
 */
export type PinnableObject = Phaser.GameObjects.GameObject
  & Phaser.GameObjects.Components.Transform
  & Phaser.GameObjects.Components.ScrollFactor;

export interface ScreenSpacePin {
  obj: PinnableObject;
  /** Screen position this object's ORIGIN should sit at (0,0 for top-left art). */
  screenX: number;
  screenY: number;
  /** Scale the object would use at zoom 1. */
  baseScale: number;
}

/**
 * Implemented by scenes that own a zoomable world camera. Screen-space effects
 * call it optionally (`host.pinScreenSpace?.(…)`) so they stay scene-agnostic
 * and are unaffected in scenes that never zoom.
 */
export interface ScreenSpaceHost {
  pinScreenSpace?(obj: PinnableObject, screenX: number, screenY: number, baseScale?: number): void;
}

export function applyPin(pin: ScreenSpacePin, cam: Phaser.Cameras.Scene2D.Camera): void {
  const z = cam.zoom || 1;
  const ox = cam.width * cam.originX;
  const oy = cam.height * cam.originY;
  pin.obj.setScrollFactor(0);
  pin.obj.setPosition((pin.screenX - ox) / z + ox, (pin.screenY - oy) / z + oy);
  pin.obj.setScale(pin.baseScale / z);
}

/** Drop pins whose object has been destroyed, then re-apply the rest. */
export function repin(pins: ScreenSpacePin[], cam: Phaser.Cameras.Scene2D.Camera): ScreenSpacePin[] {
  const live = pins.filter(p => (p.obj as unknown as { scene?: Phaser.Scene }).scene);
  for (const p of live) applyPin(p, cam);
  return live;
}
