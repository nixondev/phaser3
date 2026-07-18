const { default: puppeteer } = await import('puppeteer-core');
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
try {
  await page.goto('http://localhost:8080/phaser3/', { waitUntil: 'networkidle2', timeout: 30000 });
  await sleep(12000);
  await page.keyboard.press('Space');
  await sleep(4000);
  await page.keyboard.press('Space'); // in case the first landed too early
  await sleep(4000);

  const s1 = await page.evaluate(async () => {
    const { RoomStateManager } = await import('/phaser3/src/systems/RoomStateManager.ts');
    const rsm = RoomStateManager.getInstance();
    return { roster: rsm.getRoster().map(c => c.id), active: rsm.getActiveCharacterId(), room: rsm.getCurrentRoom() };
  });
  console.log('S1 game state', JSON.stringify(s1));
  await page.screenshot({ path: '.claude/tmp/diag-1.png' });

  const s2 = await page.evaluate(async () => {
    const { RoomStateManager } = await import('/phaser3/src/systems/RoomStateManager.ts');
    const rsm = RoomStateManager.getInstance();
    rsm.cureResident('street-wanderer-1');
    rsm.recoverResident('street-wanderer-1');
    rsm.addToRoster({ id: 'street-wanderer-1', textureKey: 'player-ranger', roomId: 'protag-house', x: 900, y: 736, traits: [] });
    return rsm.getRoster().map(c => c.id);
  });
  console.log('S2 roster', JSON.stringify(s2));

  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('char2');
  });
  await sleep(1000);
  const s3 = await page.evaluate(async () => {
    const { RoomStateManager } = await import('/phaser3/src/systems/RoomStateManager.ts');
    return RoomStateManager.getInstance().getActiveCharacterId();
  });
  console.log('S3 active after char2:', s3);
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('char1');
  });
  await sleep(1000);
  const s4 = await page.evaluate(async () => {
    const { RoomStateManager } = await import('/phaser3/src/systems/RoomStateManager.ts');
    return RoomStateManager.getInstance().getActiveCharacterId();
  });
  console.log('S4 active after char1:', s4);
  await page.screenshot({ path: '.claude/tmp/diag-2.png' });
} finally { await browser.close(); }
