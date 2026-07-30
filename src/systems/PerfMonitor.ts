import Phaser from 'phaser';

/**
 * Dev-only frame profiler for chasing intermittent slowdowns.
 *
 * The key measurement is the CPU/GPU split. Every frame we take two stamps:
 *
 *   phaserMs = POST_RENDER - PRE_STEP        our JS: update loops + GL commands
 *   frameMs  = POST_RENDER - last POST_RENDER  the whole wall-clock frame
 *
 * Reading them together tells you which half is at fault, which no single
 * "FPS" number can:
 *
 *   frameMs high, phaserMs high  -> CPU bound. Our JS is too slow.
 *   frameMs high, phaserMs LOW   -> GPU/compositor bound. We issue the draws
 *                                   fast, the GPU can't retire them (fill
 *                                   rate — e.g. heavy postFX on a huge RT).
 *   both low but it FEELS slow   -> not the render loop. Look at input lag
 *                                   or a one-frame-behind sync bug.
 *
 * Renders as a DOM overlay rather than Phaser objects so it costs nothing on
 * the very render pass it is measuring, and so it survives every scene
 * (Menu, Game, all three editors) without plumbing.
 *
 * Toggle from the console -- deliberately NOT bound to a key, since in-game
 * keys are reserved for real gameplay verbs.
 *
 *   __warden.perf.report()   dump the stall log as a table
 *   __warden.perf.textures() biggest textures in VRAM
 *   __warden.perf.toggle()   show/hide the overlay
 *   __warden.perf.reset()    clear counters
 */

/** A single frame that blew the budget, with the context needed to explain it. */
export interface Stall {
  /** Seconds since monitor start. */
  t: number;
  /** Whole-frame wall clock, ms. */
  frameMs: number;
  /** Our JS portion of that frame, ms. */
  phaserMs: number;
  /** frameMs - phaserMs: time outside our code (GPU wait, compositor, GC). */
  otherMs: number;
  room: string;
  /** Total display-list entries across active scenes. */
  objects: number;
  heapMB: number;
  verdict: 'cpu' | 'gpu/other';
}

const STALL_MS = 1000 / 30;   // anything slower than 30fps is worth recording
const STALL_LOG_MAX = 120;
const SAMPLE_WINDOW = 60;     // frames in the rolling display window

export class PerfMonitor {
  private game: Phaser.Game;
  private el: HTMLDivElement;
  private visible = true;

  private preStepAt = 0;
  private lastRenderAt = 0;
  private started = performance.now();

  // Rolling window
  private frameSamples: number[] = [];
  private phaserSamples: number[] = [];

  private worstFrame = 0;
  private worstPhaser = 0;
  private frames = 0;
  private stalls: Stall[] = [];

  // Recomputed at 2Hz — too expensive for every frame.
  private slowInfo = '';
  private lastInfoAt = 0;
  private textureMB = 0;

  private contextLost = 0;

  constructor(game: Phaser.Game) {
    this.game = game;

    this.el = document.createElement('div');
    this.el.style.cssText = [
      'position:fixed', 'top:6px', 'right:6px', 'z-index:99999',
      'font:11px/1.35 ui-monospace,Consolas,monospace',
      'color:#9f9', 'background:rgba(0,0,0,.72)',
      'padding:6px 8px', 'border-radius:4px', 'white-space:pre',
      'pointer-events:none', 'text-shadow:0 1px 0 #000',
    ].join(';');
    document.body.appendChild(this.el);

    game.events.on(Phaser.Core.Events.PRE_STEP, this.onPreStep, this);
    game.events.on(Phaser.Core.Events.POST_RENDER, this.onPostRender, this);

    // A lost/restored GL context is a prime suspect for "fast yesterday,
    // slow today" — Chrome can silently drop to a software rasterizer.
    // Listened for on the canvas rather than via Phaser's Core events, which
    // only expose CONTEXT_LOST (no matching restore event) as of 3.90.
    game.canvas?.addEventListener('webglcontextlost', () => {
      this.contextLost++;
      console.warn('[perf] WebGL CONTEXT LOST — expect a hard slowdown until restored');
    });
    game.canvas?.addEventListener('webglcontextrestored', () => {
      console.warn('[perf] WebGL context restored');
    });
  }

  private onPreStep(): void {
    this.preStepAt = performance.now();
  }

  private onPostRender(): void {
    const now = performance.now();
    const phaserMs = now - this.preStepAt;
    const frameMs = this.lastRenderAt ? now - this.lastRenderAt : phaserMs;
    this.lastRenderAt = now;
    this.frames++;

    this.frameSamples.push(frameMs);
    this.phaserSamples.push(phaserMs);
    if (this.frameSamples.length > SAMPLE_WINDOW) {
      this.frameSamples.shift();
      this.phaserSamples.shift();
    }

    // Ignore the first few frames — scene boot always spikes and would
    // permanently poison the all-time worst numbers.
    if (this.frames > 10) {
      if (frameMs > this.worstFrame) this.worstFrame = frameMs;
      if (phaserMs > this.worstPhaser) this.worstPhaser = phaserMs;

      if (frameMs > STALL_MS) this.recordStall(now, frameMs, phaserMs);
    }

    if (now - this.lastInfoAt > 500) {
      this.lastInfoAt = now;
      this.refreshSlowInfo();
    }
    if (this.visible) this.draw();
  }

  private recordStall(now: number, frameMs: number, phaserMs: number): void {
    const otherMs = frameMs - phaserMs;
    this.stalls.push({
      t: +((now - this.started) / 1000).toFixed(2),
      frameMs: +frameMs.toFixed(1),
      phaserMs: +phaserMs.toFixed(1),
      otherMs: +otherMs.toFixed(1),
      room: this.currentRoom(),
      objects: this.countObjects(),
      heapMB: this.heapMB(),
      // If our JS owns most of the frame it's a CPU problem; otherwise we
      // finished quickly and something downstream (GPU, compositor, GC) held
      // the frame open.
      verdict: phaserMs > frameMs * 0.6 ? 'cpu' : 'gpu/other',
    });
    if (this.stalls.length > STALL_LOG_MAX) this.stalls.shift();
  }

  private refreshSlowInfo(): void {
    this.textureMB = this.estimateTextureMB();
    const r = this.game.renderer;
    const rendererName = r.type === Phaser.WEBGL ? 'WebGL' : 'CANVAS(!!)';
    this.slowInfo =
      `renderer ${rendererName}${this.contextLost ? ` lost x${this.contextLost}` : ''}\n` +
      `textures ${this.textureMB.toFixed(0)}MB   objs ${this.countObjects()}\n` +
      `room     ${this.currentRoom()}\n` +
      `heap     ${this.heapMB()}MB`;
  }

  private draw(): void {
    const avg = (a: number[]): number =>
      a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

    const fMs = avg(this.frameSamples);
    const pMs = avg(this.phaserSamples);
    const fps = fMs > 0 ? 1000 / fMs : 0;
    const worstInWindow = this.frameSamples.length ? Math.max(...this.frameSamples) : 0;

    // Colour on the rolling average, not the instantaneous frame, so the
    // readout doesn't strobe.
    this.el.style.color = fps >= 55 ? '#9f9' : fps >= 30 ? '#fd6' : '#f88';

    const bound = pMs > fMs * 0.6 ? 'CPU' : 'gpu/other';

    this.el.textContent =
      `${fps.toFixed(0)} fps   ${fMs.toFixed(1)}ms/frame\n` +
      `  js   ${pMs.toFixed(1)}ms  (${bound}-bound)\n` +
      `  1s worst ${worstInWindow.toFixed(1)}ms\n` +
      `  alltime  ${this.worstFrame.toFixed(1)}ms / js ${this.worstPhaser.toFixed(1)}ms\n` +
      `  stalls   ${this.stalls.length}\n` +
      this.slowInfo;
  }

  private currentRoom(): string {
    for (const s of this.game.scene.getScenes(true)) {
      const rm = (s as any).roomManager;
      if (rm?.getCurrentRoomId) return String(rm.getCurrentRoomId());
    }
    return this.game.scene.getScenes(true).map(s => s.scene.key).join('+') || '-';
  }

  private countObjects(): number {
    let n = 0;
    for (const s of this.game.scene.getScenes(true)) n += s.children?.length ?? 0;
    return n;
  }

  private heapMB(): number {
    const mem = (performance as any).memory;
    return mem ? Math.round(mem.usedJSHeapSize / 1048576) : 0;
  }

  /** Rough VRAM estimate: every texture source at 4 bytes per pixel. */
  private estimateTextureMB(): number {
    let bytes = 0;
    for (const key of this.game.textures.getTextureKeys()) {
      const tex = this.game.textures.get(key);
      for (const src of tex.source) bytes += src.width * src.height * 4;
    }
    return bytes / 1048576;
  }

  // ---- console API -------------------------------------------------------

  /** Dump the stall log. This is the thing to call right after it feels slow. */
  report(): void {
    if (!this.stalls.length) {
      console.log(`[perf] no stalls over ${this.frames} frames (threshold ${STALL_MS.toFixed(1)}ms).`);
      return;
    }
    const cpu = this.stalls.filter(s => s.verdict === 'cpu').length;
    console.log(
      `[perf] ${this.stalls.length} stalls / ${this.frames} frames — ` +
      `${cpu} cpu-bound, ${this.stalls.length - cpu} gpu-or-other. ` +
      `Worst frame ${this.worstFrame.toFixed(1)}ms (js ${this.worstPhaser.toFixed(1)}ms).`,
    );
    console.table(this.stalls);
    const byRoom: Record<string, number> = {};
    for (const s of this.stalls) byRoom[s.room] = (byRoom[s.room] ?? 0) + 1;
    console.log('[perf] stalls by room:', byRoom);
  }

  /** Biggest textures in memory, largest first — finds oversized RenderTextures. */
  textures(limit = 15): void {
    const rows = this.game.textures.getTextureKeys().map((key) => {
      const tex = this.game.textures.get(key);
      let w = 0, h = 0, bytes = 0;
      for (const src of tex.source) {
        bytes += src.width * src.height * 4;
        if (src.width * src.height > w * h) { w = src.width; h = src.height; }
      }
      return { key, size: `${w}x${h}`, MB: +(bytes / 1048576).toFixed(1) };
    });
    rows.sort((a, b) => b.MB - a.MB);
    console.table(rows.slice(0, limit));
    console.log(`[perf] total ${this.estimateTextureMB().toFixed(0)}MB across ${rows.length} textures`);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.style.display = this.visible ? '' : 'none';
  }

  reset(): void {
    this.stalls = [];
    this.frames = 0;
    this.worstFrame = 0;
    this.worstPhaser = 0;
    this.frameSamples = [];
    this.phaserSamples = [];
    this.started = performance.now();
    console.log('[perf] reset');
  }
}
