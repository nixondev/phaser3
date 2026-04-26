/**
 * Browser-native port of feross/timidity.
 *
 * The npm package's index.js was designed for Browserify + brfs (which inlines
 * fs.readFileSync at bundle time). Vite doesn't apply brfs, so __dirname and fs
 * explode at runtime. This file replaces it entirely:
 *   - No Node.js EventEmitter (plain Map of listeners instead)
 *   - No fs / __dirname — freepats.cfg is fetched over HTTP
 *   - libtimidity.js is loaded via a dynamic <script> tag (exposes window.LibTimidity)
 */

const SAMPLE_RATE       = 44100;
const AUDIO_FORMAT      = 0x8010; // s16
const NUM_CHANNELS      = 2;
const BYTES_PER_SAMPLE  = 2 * NUM_CHANNELS;
const BUFFER_SIZE       = 16384;

type Listener = (...args: unknown[]) => void;

class SimpleEmitter {
  private _map: Map<string, Listener[]> = new Map();

  on(event: string, fn: Listener): this {
    if (!this._map.has(event)) this._map.set(event, []);
    this._map.get(event)!.push(fn);
    return this;
  }

  once(event: string, fn: Listener): this {
    const wrapper: Listener = (...args) => { this.off(event, wrapper); fn(...args); };
    return this.on(event, wrapper);
  }

  off(event: string, fn: Listener): this {
    const list = this._map.get(event);
    if (list) { const i = list.indexOf(fn); if (i >= 0) list.splice(i, 1); }
    return this;
  }

  emit(event: string, ...args: unknown[]): void {
    const list = this._map.get(event);
    if (list) [...list].forEach(fn => fn(...args));
  }
}

// Dynamically inject libtimidity.js once; resolves window.LibTimidity
function loadLibTimidityScript(baseUrl: string): Promise<(opts: object) => Promise<unknown>> {
  return new Promise((resolve, reject) => {
    const w = window as unknown as Record<string, unknown>;
    if (typeof w['LibTimidity'] === 'function') {
      resolve(w['LibTimidity'] as (opts: object) => Promise<unknown>);
      return;
    }
    const script = document.createElement('script');
    script.src = baseUrl + 'libtimidity.js';
    script.onload  = () => resolve(w['LibTimidity'] as (opts: object) => Promise<unknown>);
    script.onerror = () => reject(new Error('Failed to load libtimidity.js from ' + script.src));
    document.head.appendChild(script);
  });
}

export class Timidity extends SimpleEmitter {
  destroyed = false;

  private _baseUrl: string;
  private _ready      = false;
  private _playing    = false;
  private _lib: Record<string, (...a: unknown[]) => unknown> | null = null;
  private _songPtr    = 0;
  private _bufferPtr  = 0;
  private _array      = new Int16Array(BUFFER_SIZE * 2);
  private _currentUrlOrBuf: string | Uint8Array | null = null;
  private _pendingFetches: Record<string, Promise<Uint8Array> | undefined> = {};
  private _interval:  ReturnType<typeof setInterval> | null = null;

  private _audioContext: AudioContext;
  private _node: ScriptProcessorNode;
  private _audioHandler: (e: AudioProcessingEvent) => void;

  constructor(baseUrl = '/') {
    super();
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    this._baseUrl = new URL(baseUrl, window.location.origin).href;

    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this._audioContext = new AudioCtx();
    this._node = this._audioContext.createScriptProcessor(BUFFER_SIZE, 0, NUM_CHANNELS);
    this._audioHandler = this._onAudioProcess.bind(this);
    this._node.addEventListener('audioprocess', this._audioHandler as EventListener);
    this._node.connect(this._audioContext.destination);

    this._init();
  }

  private async _init(): Promise<void> {
    try {
      const [LibTimidity, cfgText] = await Promise.all([
        loadLibTimidityScript(this._baseUrl),
        fetch(this._baseUrl + 'freepats.cfg').then(r => {
          if (!r.ok) throw new Error('Could not fetch freepats.cfg');
          return r.text();
        }),
      ]);

      const lib = await LibTimidity({
        locateFile: (file: string) => new URL(file, this._baseUrl).href,
      }) as Record<string, (...a: unknown[]) => unknown>;

      this._lib = lib;
      (lib.FS as unknown as { writeFile(path: string, data: string): void })
        .writeFile('/timidity.cfg', cfgText);

      const result = lib._mid_init('/timidity.cfg') as number;
      if (result !== 0) { this._destroy(new Error('Failed to init libtimidity')); return; }

      this._bufferPtr = lib._malloc(BUFFER_SIZE * BYTES_PER_SAMPLE) as number;
      this._ready = true;
      this.emit('_ready');
    } catch (err) {
      this._destroy(err instanceof Error ? err : new Error(String(err)));
    }
  }

  async load(urlOrBuf: string | Uint8Array): Promise<void> {
    if (this.destroyed) throw new Error('load() after destroy()');
    this._audioContext.resume();
    if (this._songPtr) this._destroySong();
    this.emit('unstarted');
    this._stopInterval();

    if (!this._ready) {
      return new Promise<void>(resolve => this.once('_ready', () => resolve(this.load(urlOrBuf))));
    }

    this.emit('buffering');
    this._currentUrlOrBuf = urlOrBuf;

    let midiBuf: Uint8Array;
    if (typeof urlOrBuf === 'string') {
      midiBuf = await this._fetch(new URL(urlOrBuf, this._baseUrl));
      if (this._currentUrlOrBuf !== urlOrBuf) return;
    } else {
      midiBuf = urlOrBuf;
    }

    let songPtr = this._loadSong(midiBuf);
    const lib = this._lib!;

    let missing = lib._mid_get_load_request_count(songPtr) as number;
    if (missing > 0) {
      const instruments = this._getMissing(songPtr, missing);
      await Promise.all(instruments.map(i => this._fetchInstrument(i)));
      if (this._currentUrlOrBuf !== urlOrBuf) return;
      (lib._mid_song_free as (p: number) => void)(songPtr);
      songPtr = this._loadSong(midiBuf);
      missing = lib._mid_get_load_request_count(songPtr) as number;
    }

    this._songPtr = songPtr;
    (lib._mid_song_start as (p: number) => void)(this._songPtr);
  }

  private _getMissing(songPtr: number, count: number): string[] {
    const lib = this._lib!;
    const out: string[] = [];
    for (let i = 0; i < count; i++) {
      const ptr = (lib._mid_get_load_request as (s: number, i: number) => number)(songPtr, i);
      out.push((lib.UTF8ToString as (p: number) => string)(ptr));
    }
    return out;
  }

  private _loadSong(midiBuf: Uint8Array): number {
    const lib = this._lib!;
    const optsPtr    = (lib._mid_alloc_options as (sr: number, fmt: number, ch: number, buf: number) => number)(SAMPLE_RATE, AUDIO_FORMAT, NUM_CHANNELS, BUFFER_SIZE);
    const midiBufPtr = (lib._malloc as (n: number) => number)(midiBuf.byteLength);
    (lib.HEAPU8 as unknown as Uint8Array).set(midiBuf, midiBufPtr);
    const iStream    = (lib._mid_istream_open_mem as (p: number, n: number) => number)(midiBufPtr, midiBuf.byteLength);
    const songPtr    = (lib._mid_song_load as (s: number, o: number) => number)(iStream, optsPtr);
    (lib._mid_istream_close as (s: number) => void)(iStream);
    (lib._free as (p: number) => void)(optsPtr);
    (lib._free as (p: number) => void)(midiBufPtr);
    if (songPtr === 0) { this._destroy(new Error('Failed to load MIDI file')); return 0; }
    return songPtr;
  }

  private async _fetchInstrument(instrument: string): Promise<Uint8Array> {
    if (this._pendingFetches[instrument]) return this._pendingFetches[instrument];
    const p = this._fetch(new URL(instrument, this._baseUrl));
    this._pendingFetches[instrument] = p;
    const buf = await p;
    this._writeInstrumentFile(instrument, buf);
    delete this._pendingFetches[instrument];
    return buf;
  }

  private _writeInstrumentFile(instrument: string, buf: Uint8Array): void {
    const lib = this._lib!;
    const parts = instrument.split('/').slice(0, -1);
    let dir = '/';
    for (const part of parts) {
      try { (lib.FS as unknown as { mkdir(p: string): void }).mkdir(`${dir}${part}`); } catch { /* already exists */ }
      dir += `${part}/`;
    }
    (lib.FS as unknown as { writeFile(p: string, d: Uint8Array, opts: object): void })
      .writeFile(instrument, buf, { encoding: 'binary' });
  }

  private async _fetch(url: URL): Promise<Uint8Array> {
    const res = await window.fetch(url.href, { mode: 'cors', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Could not load ${url.href}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  play(): void {
    if (this.destroyed) throw new Error('play() after destroy()');
    this._audioContext.resume();
    this._playing = true;
    if (this._ready && !this._currentUrlOrBuf) {
      this.emit('playing');
      this._startInterval();
    }
  }

  pause(): void {
    if (this.destroyed) throw new Error('pause() after destroy()');
    this._playing = false;
    this._stopInterval();
    this.emit('paused');
  }

  stop(): void {
    if (this.destroyed) return;
    if (this._songPtr) { this.seek(0); this.pause(); }
    this.emit('stopped');
  }

  seek(time: number): void {
    if (this.destroyed || !this._songPtr) return;
    (this._lib!._mid_song_seek as (p: number, ms: number) => void)(this._songPtr, Math.floor(time * 1000));
  }

  destroy(): void {
    this._destroy();
  }

  private _onAudioProcess(event: AudioProcessingEvent): void {
    const lib = this._lib;
    let sampleCount = 0;

    if (lib && this._songPtr && this._playing) {
      sampleCount = this._readWave();

      if (sampleCount === 0) {
        // Song finished. Restart immediately and read audio into this same buffer
        // so the loop is seamless rather than producing one full buffer of silence.
        (lib._mid_song_start as (p: number) => void)(this._songPtr);
        this.emit('ended');
        if (this._playing && this._songPtr) {
          sampleCount = this._readWave();
        }
      }
    }

    if (sampleCount > 0 && this._currentUrlOrBuf) {
      this._currentUrlOrBuf = null;
      this.emit('playing');
      this._startInterval();
    }

    const ch0 = event.outputBuffer.getChannelData(0);
    const ch1 = event.outputBuffer.getChannelData(1);
    for (let i = 0; i < sampleCount; i++) {
      ch0[i] = this._array[i * 2]     / 0x7FFF;
      ch1[i] = this._array[i * 2 + 1] / 0x7FFF;
    }
    for (let i = sampleCount; i < BUFFER_SIZE; i++) { ch0[i] = 0; ch1[i] = 0; }
  }

  private _readWave(): number {
    const lib = this._lib;
    if (!lib || !this._songPtr) return 0;
    const byteCount = (lib._mid_song_read_wave as (p: number, buf: number, n: number) => number)(
      this._songPtr, this._bufferPtr, BUFFER_SIZE * BYTES_PER_SAMPLE
    );
    const sampleCount = byteCount / BYTES_PER_SAMPLE;
    if (sampleCount > 0) {
      this._array.set(
        (lib.HEAP16 as unknown as Int16Array).subarray(
          this._bufferPtr / 2,
          (this._bufferPtr + byteCount) / 2
        )
      );
    }
    return sampleCount;
  }

  private _startInterval(): void {
    this._stopInterval(); // guard against duplicate intervals
    this._interval = setInterval(() => this.emit('timeupdate', this.currentTime), 1000);
  }

  private _stopInterval(): void {
    if (this._interval) { clearInterval(this._interval); this._interval = null; }
  }

  get currentTime(): number {
    if (this.destroyed || !this._songPtr || !this._lib) return 0;
    return (this._lib._mid_song_get_time as (p: number) => number)(this._songPtr) / 1000;
  }

  get duration(): number {
    if (this.destroyed || !this._songPtr || !this._lib) return 1;
    return (this._lib._mid_song_get_total_time as (p: number) => number)(this._songPtr) / 1000;
  }

  private _destroy(err?: Error): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this._stopInterval();
    if (this._songPtr) this._destroySong();
    if (this._bufferPtr && this._lib) {
      (this._lib._free as (p: number) => void)(this._bufferPtr);
      this._bufferPtr = 0;
    }
    this._node.disconnect();
    this._node.removeEventListener('audioprocess', this._audioHandler as EventListener);
    this._audioContext.close();
    if (err) this.emit('error', err);
  }

  private _destroySong(): void {
    (this._lib!._mid_song_free as (p: number) => void)(this._songPtr);
    this._songPtr = 0;
  }
}
