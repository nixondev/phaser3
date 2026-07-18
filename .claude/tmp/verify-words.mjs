// Runtime verification of the words/twee prose system.
const { default: puppeteer } = await import('puppeteer-core');

const PORT = process.argv[2] ?? '8080';
const BASE = `http://localhost:${PORT}/phaser3/`;
const SHOT_DIR = '.claude/tmp';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: 'new',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader', '--mute-audio',
         '--autoplay-policy=no-user-gesture-required'],
  defaultViewport: { width: 1280, height: 960 },
});
const page = await browser.newPage();
const warnings = [];
page.on('console', m => {
  const t = m.text();
  if (t.includes('[words]')) warnings.push(t);
});

try {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(6000);

  // 1. Module-level: registry parsed correctly in the live app.
  const moduleCheck = await page.evaluate(async () => {
    const w = await import('/phaser3/src/systems/Words.ts');
    return {
      thought: w.getText('thoughts/protag-house-first'),
      docRef: w.resolveText('words:documents/your-notes'),
      literal: w.resolveText('plain text passes through'),
      missing: w.getText('no/such/key'),
      exampleLinks: w.getPassage('dialog/example/gate-warden')?.links,
      exampleText: w.getPassage('dialog/example/gate-warden')?.text,
      kaiPage2: w.getText('dialog/kai/backstory-2'),
    };
  });
  console.log('MODULE CHECK', JSON.stringify(moduleCheck, null, 2));

  // 2. Start game, introspect (T) — thought dialog should show real prose.
  await page.keyboard.press('Space');
  await sleep(3000);
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('introspect');
  });
  await sleep(700);
  await page.screenshot({ path: `${SHOT_DIR}/words-1-thought.png` });
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('action'); // dismiss
  });
  await sleep(500);

  // 3. Walk to the desk note at (224,224) from spawn (768,736).
  const drive = async (key, ms) => {
    await page.evaluate(async (k) => {
      const im = await import('/phaser3/src/systems/InputManager.ts');
      im.InputManager.injectInput(k, true);
    }, key);
    await sleep(ms);
    await page.evaluate(async (k) => {
      const im = await import('/phaser3/src/systems/InputManager.ts');
      im.InputManager.injectInput(k, false);
    }, key);
    await sleep(150);
  };
  await drive('up', 1500);
  await drive('left', 1700);
  await drive('up', 1000);
  const pos = await page.evaluate(async () => {
    const rsm = (await import('/phaser3/src/systems/RoomStateManager.ts')).RoomStateManager.getInstance();
    const roster = rsm.getRoster?.();
    return { roster: roster?.length };
  });
  await page.screenshot({ path: `${SHOT_DIR}/words-2-walked.png` });

  // Player position via the scene? Use screenshot to judge; try pickup:
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('action');
  });
  await sleep(700);
  await page.screenshot({ path: `${SHOT_DIR}/words-3-pickup.png` });
  // dismiss pickup dialog
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('action');
  });
  await sleep(500);

  // 4. Open inventory, use the document → DocumentReaderScene.
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('inventory');
  });
  await sleep(500);
  await page.screenshot({ path: `${SHOT_DIR}/words-4-inventory.png` });
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('action');
  });
  await sleep(800);
  await page.screenshot({ path: `${SHOT_DIR}/words-5-reader.png` });

  const inv = await page.evaluate(async () => {
    const rsm = (await import('/phaser3/src/systems/RoomStateManager.ts')).RoomStateManager.getInstance();
    return rsm.getInventory().filter(Boolean).map(i => ({ name: i.name, content: i.content }));
  });
  console.log('INVENTORY', JSON.stringify(inv));
  console.log('WORDS CONSOLE LINES', JSON.stringify(warnings));
} finally {
  await browser.close();
}
