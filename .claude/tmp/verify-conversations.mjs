// Runtime verification of the speaker×listener conversation layer.
// Uses window.__warden (dev handle) to reach the game's real module instances —
// page-context dynamic imports can land in a separate Vite module graph.
const { default: puppeteer } = await import('puppeteer-core');

const PORT = process.argv[2] ?? '8080';
const BASE = `http://localhost:${PORT}/phaser3/`;
const SHOT = '.claude/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--mute-audio',
         '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 960 },
});
const page = await browser.newPage();
page.on('pageerror', e => console.log('PAGEERROR', e.message));
const logLines = [];
page.on('console', m => {
  const t = m.text();
  if (t.includes('[words]') || t.includes('[flags]')) logLines.push(t);
});

// All game access goes through the scene the game actually runs.
const inGame = (fn, arg) => page.evaluate(fn, arg);
const sceneEval = (body, arg) => page.evaluate(new Function('arg', `
  const game = window.__warden?.game;
  const scene = game?.scene?.getScene('Game');
  if (!scene) return { __noScene: true };
  const rsm = scene.rsm;
  ${body}
`), arg);

const tap = key => sceneEval(`scene.inputManager.constructor.injectTap(arg); return {};`, key);
const hold = (key, down) => sceneEval(`scene.inputManager.constructor.injectInput(arg.k, arg.d); return {};`, { k: key, d: down });
const drive = async (key, ms) => { await hold(key, true); await sleep(ms); await hold(key, false); await sleep(120); };

try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(8000);
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('Space');
    await sleep(2500);
    const s = await sceneEval(`return { roster: rsm.getRoster().map(c => c.id) };`);
    if (!s.__noScene && s.roster.length > 0) break;
  }
  console.log('STARTED', JSON.stringify(await sceneEval(`return { roster: rsm.getRoster().map(c => c.id), active: rsm.getActiveCharacterId(), room: scene.roomManager.getCurrentRoomId() };`)));

  // Move away from the protag-house wanderer (touch = full run reset).
  await drive('down', 600);
  await drive('left', 600);

  // ── 1. Non-destructive selection checks against the real instances ──
  const selection = await sceneEval(`
    rsm.cureResident('street-wanderer-1');
    rsm.recoverResident('street-wanderer-1');
    const cm = window.__warden.cm;
    const asPlayer = cm.selectConversation(rsm, 'protag-house', 'street-wanderer-1')?.id ?? null;
    rsm.setActiveCharacter('street-wanderer-2');
    const asMaren = cm.selectConversation(rsm, 'protag-house', 'street-wanderer-1')?.id ?? null;
    rsm.setActiveCharacter('player');
    const notifiable = cm.selectNotifiableConversation(rsm, 'protag-house', 'street-wanderer-1', new Set())?.id ?? null;
    return { asPlayer, asMaren, notifiable };
  `);
  console.log('SELECTION', JSON.stringify(selection));

  // ── 2. UI flow: park Kai near the player, glyph, E to talk ──
  await sceneEval(`
    rsm.addToRoster({ id: 'street-wanderer-1', textureKey: 'player-ranger',
      roomId: 'protag-house', x: 700, y: 926, traits: [] });
    return {};
  `);
  await tap('char2');
  await sleep(800);
  await tap('char1');
  await sleep(800);
  console.log('MID', JSON.stringify(await sceneEval(`return { roster: rsm.getRoster().map(c => c.id), active: rsm.getActiveCharacterId(), player: { x: Math.round(scene.player.x), y: Math.round(scene.player.y) } };`)));
  await page.screenshot({ path: `${SHOT}/conv-1-glyph.png` });

  await drive('right', 330);
  await tap('action');
  await sleep(700);
  await page.screenshot({ path: `${SHOT}/conv-2-dialog-p1.png` });
  await tap('action'); await sleep(500);
  await page.screenshot({ path: `${SHOT}/conv-3-dialog-p2.png` });
  await tap('action'); await sleep(500);
  await tap('action'); await sleep(500);

  // ── 3. Post-state ──
  const post = await sceneEval(`
    const cm = window.__warden.cm;
    return {
      flagSet: rsm.hasFlag('kai/heard-your-voice'),
      firstRead: rsm.isConversationRead('kai/to-player-first'),
      next: cm.selectConversation(rsm, 'protag-house', 'street-wanderer-1')?.id ?? null,
    };
  `);
  console.log('POST', JSON.stringify(post));
  await page.screenshot({ path: `${SHOT}/conv-4-after.png` });
  console.log('LOGS', JSON.stringify(logLines));
} finally {
  await browser.close();
}
