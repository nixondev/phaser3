import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import zlib from 'zlib';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

// ── PNG helpers for individual tile extraction ────────────────────────────

function pngCrc32(buf: Buffer): number {
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

function encodeTilePNG(pixels: Uint8Array, size: number): Buffer {
  const rowBytes = 1 + size * 4;
  const raw = Buffer.alloc(size * rowBytes);
  for (let y = 0; y < size; y++) {
    raw[y * rowBytes] = 0;
    for (let x = 0; x < size; x++) {
      const si = (y * size + x) * 4;
      const di = y * rowBytes + 1 + x * 4;
      raw[di] = pixels[si]; raw[di+1] = pixels[si+1];
      raw[di+2] = pixels[si+2]; raw[di+3] = pixels[si+3];
    }
  }
  const compressed = zlib.deflateSync(raw);
  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const c  = Buffer.allocUnsafe(4); c.writeUInt32BE(pngCrc32(td));
    return Buffer.concat([len, td, c]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', compressed), chunk('IEND', Buffer.alloc(0)),
  ]);
}

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function extractTileFromPNG(buf: Buffer, frame: number, tileSize: number, cols: number): Uint8Array | null {
  try {
    if (buf.readUInt32BE(0) !== 0x89504E47) return null;
    let pos = 8;
    let width = 0, height = 0, colorType = 0;
    const idatChunks: Buffer[] = [];
    let palette: Buffer | null = null, trns: Buffer | null = null;
    while (pos < buf.length) {
      const length = buf.readUInt32BE(pos);
      const type   = buf.toString('ascii', pos + 4, pos + 8);
      if (type === 'IHDR') {
        width = buf.readUInt32BE(pos + 8); height = buf.readUInt32BE(pos + 12);
        colorType = buf[pos + 17];
      } else if (type === 'PLTE') { palette = buf.slice(pos + 8, pos + 8 + length);
      } else if (type === 'tRNS') { trns    = buf.slice(pos + 8, pos + 8 + length);
      } else if (type === 'IDAT') { idatChunks.push(buf.slice(pos + 8, pos + 8 + length)); }
      pos += 12 + length;
    }
    const decompressed = zlib.inflateSync(Buffer.concat(idatChunks));
    const bpp    = colorType === 6 ? 4 : colorType === 4 ? 2 : colorType === 2 ? 3 : 1;
    const stride = width * bpp;
    const raw    = new Uint8Array(height * stride);
    for (let y = 0; y < height; y++) {
      const ft  = decompressed[y * (stride + 1)];
      const src = y * (stride + 1) + 1;
      const dst = y * stride;
      const prv = (y - 1) * stride;
      for (let x = 0; x < stride; x++) {
        const f = decompressed[src + x];
        const a = x >= bpp          ? raw[dst + x - bpp]  : 0;
        const b = y >  0            ? raw[prv + x]        : 0;
        const c = y >  0 && x >= bpp ? raw[prv + x - bpp] : 0;
        switch (ft) {
          case 0: raw[dst+x] =  f;                                       break;
          case 1: raw[dst+x] = (f + a)                        & 0xff;   break;
          case 2: raw[dst+x] = (f + b)                        & 0xff;   break;
          case 3: raw[dst+x] = (f + Math.floor((a + b) / 2)) & 0xff;   break;
          case 4: raw[dst+x] = (f + paethPredictor(a, b, c)) & 0xff;   break;
        }
      }
    }
    const col = frame % cols, row = Math.floor(frame / cols);
    const ox = col * tileSize, oy = row * tileSize;
    if (ox + tileSize > width || oy + tileSize > height) return null;
    const tile = new Uint8Array(tileSize * tileSize * 4);
    for (let ty = 0; ty < tileSize; ty++) {
      for (let tx = 0; tx < tileSize; tx++) {
        const si = (oy + ty) * stride + (ox + tx) * bpp;
        const di = (ty * tileSize + tx) * 4;
        if (colorType === 6) {
          tile[di] = raw[si]; tile[di+1] = raw[si+1]; tile[di+2] = raw[si+2]; tile[di+3] = raw[si+3];
        } else if (colorType === 2) {
          tile[di] = raw[si]; tile[di+1] = raw[si+1]; tile[di+2] = raw[si+2]; tile[di+3] = 255;
        } else if (colorType === 3 && palette) {
          const idx = raw[si];
          tile[di] = palette[idx*3]; tile[di+1] = palette[idx*3+1]; tile[di+2] = palette[idx*3+2];
          tile[di+3] = trns && idx < trns.length ? trns[idx] : 255;
        } else {
          tile[di] = tile[di+1] = tile[di+2] = raw[si]; tile[di+3] = 255;
        }
      }
    }
    return tile;
  } catch {
    return null;
  }
}

function readJsonBody(req: import('http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function send(res: import('http').ServerResponse, code: number, body: unknown): void {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

function editorSavePlugin(): Plugin {
  const projectRoot = __dirname;
  const tilemapsDir = path.join(projectRoot, 'public/assets/tilemaps');
  const roomsJsonPath = path.join(projectRoot, 'src/data/rooms.json');

  return {
    name: 'warden-editor-save',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__editor/save-tilemap', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const url = new URL(req.url ?? '', 'http://localhost');
          const roomId = url.searchParams.get('roomId') ?? '';
          if (!ROOM_ID_RE.test(roomId)) {
            send(res, 400, { error: 'invalid roomId' });
            return;
          }
          const body = await readJsonBody(req);
          const target = path.join(tilemapsDir, `${roomId}.json`);
          if (!target.startsWith(tilemapsDir + path.sep)) {
            send(res, 400, { error: 'path escapes tilemaps dir' });
            return;
          }
          const tmp = `${target}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(body, null, 2), 'utf8');
          await fsp.rename(tmp, target);
          send(res, 200, { ok: true, path: path.relative(projectRoot, target) });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/save-object', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const body = await readJsonBody(req) as {
            roomId?: string; kind?: string; id?: string; x?: number; y?: number;
            spawnX?: number; spawnY?: number;
            width?: number; height?: number;
            targetRoom?: string; targetDoor?: string; direction?: string;
            mode?: 'create' | 'update';
          };
          const { roomId, kind, id, x, y, spawnX, spawnY, width, height, targetRoom, targetDoor, direction, mode } = body;
          if (!roomId || !ROOM_ID_RE.test(roomId)) { send(res, 400, { error: 'invalid roomId' }); return; }
          if (kind !== 'afflicted' && kind !== 'interactable' && kind !== 'door') { send(res, 400, { error: 'invalid kind' }); return; }
          if (!id || typeof id !== 'string') { send(res, 400, { error: 'invalid id' }); return; }
          if (typeof x !== 'number' || typeof y !== 'number') { send(res, 400, { error: 'invalid x/y' }); return; }
          if (mode !== undefined && mode !== 'create' && mode !== 'update') { send(res, 400, { error: 'invalid mode' }); return; }

          const raw = await fsp.readFile(roomsJsonPath, 'utf8');
          const data = JSON.parse(raw);
          const room = data?.rooms?.[roomId];
          if (!room) { send(res, 404, { error: `room ${roomId} not found` }); return; }
          const list = kind === 'afflicted' ? room.afflicted : (kind === 'door' ? room.doors : room.interactables);
          if (!Array.isArray(list)) { send(res, 404, { error: `no ${kind} list on room` }); return; }
          const existing = list.find((e: any) => e?.id === id);
          if (mode === 'create') {
            if (kind !== 'interactable' && kind !== 'door') { send(res, 400, { error: 'create mode supports interactables and doors' }); return; }
            if (existing) { send(res, 409, { error: `${kind} ${id} already exists` }); return; }
            if (kind === 'interactable') {
              list.push({
                id,
                x: Math.round(x),
                y: Math.round(y),
                type: 'sign',
                tileFrame: 0,
                text: 'TODO: edit me',
                requires: []
              });
            } else {
              if (typeof width !== 'number' || typeof height !== 'number') { send(res, 400, { error: 'invalid width/height for door create' }); return; }
              if (!targetRoom || !ROOM_ID_RE.test(targetRoom)) { send(res, 400, { error: 'invalid targetRoom for door create' }); return; }
              if (!targetDoor || typeof targetDoor !== 'string') { send(res, 400, { error: 'invalid targetDoor for door create' }); return; }
              if (!direction || typeof direction !== 'string') { send(res, 400, { error: 'invalid direction for door create' }); return; }
              list.push({
                id,
                x: Math.round(x),
                y: Math.round(y),
                width: Math.round(width),
                height: Math.round(height),
                targetRoom,
                targetDoor,
                direction,
                spawnX: typeof spawnX === 'number' ? Math.round(spawnX) : Math.round(x),
                spawnY: typeof spawnY === 'number' ? Math.round(spawnY) : Math.round(y)
              });
            }
          }

          const entry = list.find((e: any) => e?.id === id);
          if (!entry) { send(res, 404, { error: `${kind} ${id} not found` }); return; }
          entry.x = Math.round(x);
          entry.y = Math.round(y);
          if (kind === 'door') {
            if (typeof spawnX === 'number') entry.spawnX = Math.round(spawnX);
            if (typeof spawnY === 'number') entry.spawnY = Math.round(spawnY);
          }
          const tmp = `${roomsJsonPath}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
          await fsp.rename(tmp, roomsJsonPath);
          send(res, 200, { ok: true, kind, id, x: entry.x, y: entry.y });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/save-room-size', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const body = await readJsonBody(req) as { roomId?: string; width?: number; height?: number };
          const { roomId, width, height } = body;
          if (!roomId || !ROOM_ID_RE.test(roomId)) { send(res, 400, { error: 'invalid roomId' }); return; }
          if (typeof width !== 'number' || typeof height !== 'number' || width < 1 || height < 1) {
            send(res, 400, { error: 'invalid width/height' }); return;
          }
          const raw = await fsp.readFile(roomsJsonPath, 'utf8');
          const data = JSON.parse(raw);
          const room = data?.rooms?.[roomId];
          if (!room) { send(res, 404, { error: `room ${roomId} not found` }); return; }
          room.width = width;
          room.height = height;
          const tmp = `${roomsJsonPath}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
          await fsp.rename(tmp, roomsJsonPath);
          send(res, 200, { ok: true, roomId, width, height });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/save-weather', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const body = await readJsonBody(req) as { roomId?: string; weather?: string[] };
          const { roomId, weather } = body;
          if (!roomId || !ROOM_ID_RE.test(roomId)) { send(res, 400, { error: 'invalid roomId' }); return; }
          if (!Array.isArray(weather)) { send(res, 400, { error: 'weather must be array' }); return; }
          const validTypes = new Set(['rain-mild', 'rain-hard', 'dripping', 'clouds']);
          for (const t of weather) {
            if (!validTypes.has(t)) { send(res, 400, { error: `invalid weather type: ${t}` }); return; }
          }
          const raw = await fsp.readFile(roomsJsonPath, 'utf8');
          const data = JSON.parse(raw);
          const room = data?.rooms?.[roomId];
          if (!room) { send(res, 404, { error: `room ${roomId} not found` }); return; }
          if (weather.length === 0) {
            delete room.weather;
          } else if (weather.length === 1) {
            room.weather = weather[0];
          } else {
            room.weather = weather;
          }
          const tmp = `${roomsJsonPath}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
          await fsp.rename(tmp, roomsJsonPath);
          send(res, 200, { ok: true, roomId, weather: room.weather });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/save-dark', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const body = await readJsonBody(req) as { roomId?: string; dark?: boolean; darkLevel?: number };
          const { roomId, dark, darkLevel } = body;
          if (!roomId || !ROOM_ID_RE.test(roomId)) { send(res, 400, { error: 'invalid roomId' }); return; }
          if (typeof dark !== 'boolean') { send(res, 400, { error: 'dark must be boolean' }); return; }
          if (darkLevel !== undefined && (typeof darkLevel !== 'number' || darkLevel < 0 || darkLevel > 1)) {
            send(res, 400, { error: 'darkLevel must be 0–1' }); return;
          }
          const raw = await fsp.readFile(roomsJsonPath, 'utf8');
          const data = JSON.parse(raw);
          const room = data?.rooms?.[roomId];
          if (!room) { send(res, 404, { error: `room ${roomId} not found` }); return; }
          if (dark) {
            room.dark = true;
            if (darkLevel !== undefined) room.darkLevel = darkLevel;
            else delete room.darkLevel;
          } else {
            delete room.dark;
            delete room.darkLevel;
          }
          const tmp = `${roomsJsonPath}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
          await fsp.rename(tmp, roomsJsonPath);
          send(res, 200, { ok: true, roomId, dark: room.dark, darkLevel: room.darkLevel });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/save-room-alpha', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const body = await readJsonBody(req) as {
            roomId?: string; onGroundAlpha?: number; onCollisionAlpha?: number; onAboveAlpha?: number;
          };
          const { roomId, onGroundAlpha, onCollisionAlpha, onAboveAlpha } = body;
          if (!roomId || !ROOM_ID_RE.test(roomId)) { send(res, 400, { error: 'invalid roomId' }); return; }

          const raw = await fsp.readFile(roomsJsonPath, 'utf8');
          const data = JSON.parse(raw);
          const room = data?.rooms?.[roomId];
          if (!room) { send(res, 404, { error: `room ${roomId} not found` }); return; }

          const updateAlpha = (key: string, val: number | undefined, def: number) => {
            if (val === undefined) return;
            if (Math.abs(val - def) < 0.001) delete room[key];
            else room[key] = parseFloat(val.toFixed(2));
          };

          updateAlpha('onGroundAlpha', onGroundAlpha, 0.2);
          updateAlpha('onCollisionAlpha', onCollisionAlpha, 1.0);
          updateAlpha('onAboveAlpha', onAboveAlpha, 1.0);

          const tmp = `${roomsJsonPath}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
          await fsp.rename(tmp, roomsJsonPath);
          send(res, 200, { ok: true, roomId, onGroundAlpha: room.onGroundAlpha, onCollisionAlpha: room.onCollisionAlpha, onAboveAlpha: room.onAboveAlpha });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      server.middlewares.use('/__editor/save-tile', async (req, res, next) => {
        if (req.method !== 'POST') { next(); return; }
        try {
          const url      = new URL(req.url ?? '', 'http://localhost');
          const frame    = parseInt(url.searchParams.get('frame') ?? '', 10);
          const tileset  = url.searchParams.get('tileset') ?? 'tileset';
          const chunks: Buffer[] = [];
          await new Promise<void>((resolve, reject) => {
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', resolve);
            req.on('error', reject);
          });
          const target = path.join(tilemapsDir, `${tileset}.png`);
          const buf = Buffer.concat(chunks);
          const tmp = `${target}.tmp`;
          await fsp.writeFile(tmp, buf);
          await fsp.rename(tmp, target);

          // Export the individual tile to its source dir.
          // Base tileset (first in baseTilesets) → assets_src/tiles/
          // All others → assets_src/tiles/<tileset>/
          let tileExported = false;
          if (!isNaN(frame) && frame >= 0) {
            const srcRoot   = path.join(projectRoot, 'assets_src', 'tiles');
            let roomsJson: any = {};
            try { roomsJson = JSON.parse(fs.readFileSync(roomsJsonPath, 'utf8')); } catch { /* ignore */ }
            const base0    = (roomsJson.baseTilesets ?? ['tileset'])[0] ?? 'tileset';
            const tilesDir = tileset === base0 ? srcRoot : path.join(srcRoot, tileset);
            if (!fs.existsSync(tilesDir)) fs.mkdirSync(tilesDir, { recursive: true });
            const tilePixels = extractTileFromPNG(buf, frame, 64, 8);
            if (tilePixels) {
              const tilePath = path.join(tilesDir, `tile_${frame}.png`);
              await fsp.writeFile(tilePath, encodeTilePNG(tilePixels, 64));
              tileExported = true;
            }
          }

          send(res, 200, { ok: true, bytes: buf.length, tileExported });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      // Surface a hint at startup so it's discoverable.
      if (fs.existsSync(tilemapsDir) && fs.existsSync(roomsJsonPath)) {
        server.config.logger.info('[warden-editor] save endpoints active: /__editor/save-tilemap, /__editor/save-object, /__editor/save-room-size, /__editor/save-tile, /__editor/save-weather, /__editor/save-dark');
      }
    }
  };
}

export default defineConfig({
  base: '/phaser3/',
  plugins: [
    editorSavePlugin(),
    viteStaticCopy({
      targets: [
        {
          src: 'node_modules/spessasynth_lib/dist/spessasynth_processor.min.js',
          dest: './'
        }
      ],
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@scenes': path.resolve(__dirname, 'src/scenes'),
      '@entities': path.resolve(__dirname, 'src/entities'),
      '@systems': path.resolve(__dirname, 'src/systems'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@cast': path.resolve(__dirname, 'src/cast'),
    },
  },
  server: {
    port: 8080,
    host: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok-free.dev', '.ngrok.io'],
    open: true,
    watch: {
      // Prevent rooms.json writes from the editor save endpoints triggering HMR reloads.
      ignored: ['**/src/data/rooms.json'],
    },
  },
});
