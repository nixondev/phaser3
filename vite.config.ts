import { defineConfig, type Plugin } from 'vite';
import path from 'path';
import fs from 'fs';
import fsp from 'fs/promises';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const ROOM_ID_RE = /^[a-z0-9][a-z0-9-]*$/;

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
          };
          const { roomId, kind, id, x, y } = body;
          if (!roomId || !ROOM_ID_RE.test(roomId)) { send(res, 400, { error: 'invalid roomId' }); return; }
          if (kind !== 'afflicted' && kind !== 'interactable') { send(res, 400, { error: 'invalid kind' }); return; }
          if (!id || typeof id !== 'string') { send(res, 400, { error: 'invalid id' }); return; }
          if (typeof x !== 'number' || typeof y !== 'number') { send(res, 400, { error: 'invalid x/y' }); return; }

          const raw = await fsp.readFile(roomsJsonPath, 'utf8');
          const data = JSON.parse(raw);
          const room = data?.rooms?.[roomId];
          if (!room) { send(res, 404, { error: `room ${roomId} not found` }); return; }
          const list = kind === 'afflicted' ? room.afflicted : room.interactables;
          if (!Array.isArray(list)) { send(res, 404, { error: `no ${kind} list on room` }); return; }
          const entry = list.find((e: any) => e?.id === id);
          if (!entry) { send(res, 404, { error: `${kind} ${id} not found` }); return; }
          entry.x = Math.round(x);
          entry.y = Math.round(y);
          const tmp = `${roomsJsonPath}.tmp`;
          await fsp.writeFile(tmp, JSON.stringify(data, null, 2) + '\n', 'utf8');
          await fsp.rename(tmp, roomsJsonPath);
          send(res, 200, { ok: true, kind, id, x: entry.x, y: entry.y });
        } catch (e: any) {
          send(res, 500, { error: String(e?.message ?? e) });
        }
      });

      // Surface a hint at startup so it's discoverable.
      if (fs.existsSync(tilemapsDir) && fs.existsSync(roomsJsonPath)) {
        server.config.logger.info('[warden-editor] save endpoints active: /__editor/save-tilemap, /__editor/save-object');
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
    },
  },
  server: {
    port: 8080,
    open: true,
  },
});
