---
name: verify
description: How to drive WARDEN end-to-end in headless Chrome for runtime verification (build, launch, drive, screenshot).
---

# Verifying WARDEN at runtime

## Launch

```bash
npm run dev   # Vite; if 8080 is taken it moves to 8081 — read the log. Base path is /phaser3/
```

Drive with puppeteer-core (ESM — use `await import('puppeteer-core')`) against system Chrome
(`C:\Program Files\Google\Chrome\Application\chrome.exe`), `headless: 'new'`, viewport
**1280×960** (native game resolution, Scale.FIT → 1:1 canvas), args:
`--use-gl=angle --enable-unsafe-swiftshader --mute-audio --autoplay-policy=no-user-gesture-required`.

## Gotchas

- **In-game keyboard does NOT work headless.** MenuScene's `keydown-SPACE` listener receives CDP
  key events (so `page.keyboard.press('Space')` starts the game), but GameScene's polled
  `addKey`/`JustDown` keys never see them. Do not debug this as a game bug.
- **Bypass via the app's own modules** — Vite serves TS sources, and dynamic import from page
  context returns the *same module instances* the game uses:
  ```js
  await page.evaluate(async () => {
    const im = await import('/phaser3/src/systems/InputManager.ts');
    im.InputManager.injectTap('action');          // any InputState key: action, introspect, …
    im.InputManager.injectInput('left', true);    // held movement
  });
  ```
  Same trick reads live state: `RoomStateManager.getInstance()` via
  `/phaser3/src/systems/RoomStateManager.ts`.
- **Mouse works normally** (`page.mouse.click`). Player spawns at protag-house world (768,736)
  → screen (640,480) at start. Camera follows the player and clamps at room edges — recompute
  the player's screen position after walking.
- Startup timing: ~6s to menu, Space, ~2.5s to GameScene. (The old auto-opening tutorial
  dialog was removed 2026-07 — no dialog to dismiss on spawn.)
- Two 404s in the console on load are pre-existing asset noise, not a regression.

## Flows worth driving

- Dialog open/page/close: `injectTap('action')` pages and dismisses.
- Introspection: click player sprite or `injectTap('introspect')`; `…` glyph floats above player (per-thought `glyph` override possible).
- Screenshot per step; the game world only animates when no dialog is open (dialog early-returns update()).
