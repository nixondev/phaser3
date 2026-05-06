import { RoomManager } from '@systems/RoomManager';
import type { EditorScene } from './EditorScene';

/**
 * DOM panel controller for the editor scene.
 *
 * Builds a fullscreen `#editor-overlay` grid (topbar / left panel / center
 * canvas / right panel / status bar) and moves Phaser's `#game-container`
 * into the center cell while the editor is active. Restores everything on
 * destroy so MenuScene/GameScene render normally afterward.
 *
 * Buttons synthesize keyboard events to drive the existing key handlers in
 * RoomEditorManager and DebugManager — this keeps those managers untouched.
 */
export class EditorUI {
  private root: HTMLDivElement;
  private styleEl: HTMLStyleElement;
  private gameContainer: HTMLElement;
  private originalParent: Node | null;
  private originalNextSibling: Node | null;

  private roomListEl!: HTMLDivElement;
  private statusEl!: HTMLDivElement;
  private currentRoomEl!: HTMLSpanElement;
  private resizeObserver?: ResizeObserver;

  constructor(private scene: EditorScene) {
    this.gameContainer = document.getElementById('game-container')!;
    this.originalParent = this.gameContainer.parentNode;
    this.originalNextSibling = this.gameContainer.nextSibling;

    // Inject scoped styles
    this.styleEl = document.createElement('style');
    this.styleEl.id = 'editor-overlay-styles';
    this.styleEl.textContent = EditorUI.css();
    document.head.appendChild(this.styleEl);

    // Build the overlay
    this.root = document.createElement('div');
    this.root.id = 'editor-overlay';
    this.root.innerHTML = EditorUI.html();
    document.body.appendChild(this.root);

    // Move #game-container into the center cell
    const center = this.root.querySelector('#editor-center')!;
    center.appendChild(this.gameContainer);

    // Cache references
    this.roomListEl = this.root.querySelector('#editor-room-list') as HTMLDivElement;
    this.statusEl = this.root.querySelector('#editor-status') as HTMLDivElement;
    this.currentRoomEl = this.root.querySelector('#editor-current-room') as HTMLSpanElement;

    this.populateRoomList();
    this.wireButtons();

    // Phaser's Scale.FIT watches the parent. When the grid resizes the
    // center cell, refresh the scale manager so the canvas updates.
    this.resizeObserver = new ResizeObserver(() => {
      this.scene.scale.refresh();
    });
    this.resizeObserver.observe(center);
    // Initial refresh after layout settles.
    requestAnimationFrame(() => this.scene.scale.refresh());
  }

  // ── Public API ──────────────────────────────────────────────────────────

  public onRoomChanged(roomId: string): void {
    if (this.currentRoomEl) this.currentRoomEl.textContent = roomId;
    this.highlightActiveRoom(roomId);
    this.setStatus(`Loaded ${roomId}`);
  }

  public setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  public destroy(): void {
    this.resizeObserver?.disconnect();
    // Restore #game-container to its original parent
    if (this.originalParent) {
      if (this.originalNextSibling) {
        this.originalParent.insertBefore(this.gameContainer, this.originalNextSibling);
      } else {
        this.originalParent.appendChild(this.gameContainer);
      }
    }
    this.root.remove();
    this.styleEl.remove();
    // Force a scale refresh after restoration so MenuScene/GameScene render properly.
    requestAnimationFrame(() => this.scene.scale.refresh());
  }

  // ── Internals ──────────────────────────────────────────────────────────

  private populateRoomList(): void {
    const rooms = RoomManager.getRoomsData().rooms;
    const ids = Object.keys(rooms).sort();
    const html: string[] = [];
    for (const id of ids) {
      html.push(`<button class="room-item" data-room-id="${id}">${id}</button>`);
    }
    this.roomListEl.innerHTML = html.join('');
    this.roomListEl.querySelectorAll<HTMLButtonElement>('.room-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.roomId;
        if (id) this.scene.warpToRoom(id);
      });
    });
  }

  private highlightActiveRoom(roomId: string): void {
    this.roomListEl.querySelectorAll<HTMLButtonElement>('.room-item').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.roomId === roomId);
    });
  }

  private wireButtons(): void {
    const exit = this.root.querySelector<HTMLButtonElement>('#editor-exit');
    exit?.addEventListener('click', () => this.scene.exitToMenu());

    const save = this.root.querySelector<HTMLButtonElement>('#editor-save');
    save?.addEventListener('click', () => synthesizeKey(88, 'KeyX')); // X

    const audit = this.root.querySelector<HTMLButtonElement>('#editor-audit');
    audit?.addEventListener('click', () => synthesizeKey(116, 'F5'));

    const reload = this.root.querySelector<HTMLButtonElement>('#editor-reload');
    reload?.addEventListener('click', () => synthesizeKey(76, 'KeyL'));

    const stamp = this.root.querySelector<HTMLButtonElement>('#editor-stamp');
    stamp?.addEventListener('click', () => synthesizeKey(84, 'KeyT'));

    // Layer buttons — data-layer-key holds the digit ("1"/"2"/"3"); map to keyCode 49/50/51.
    this.root.querySelectorAll<HTMLButtonElement>('.layer-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const digit = btn.dataset.layerKey || '';
        const keyCode = digit.charCodeAt(0); // '1'=49, '2'=50, '3'=51
        if (keyCode >= 49 && keyCode <= 57) synthesizeKey(keyCode, `Digit${digit}`);
      });
    });

    // Tool buttons
    const placeInt = this.root.querySelector<HTMLButtonElement>('#editor-place-interactable');
    placeInt?.addEventListener('click', () => synthesizeKey(73, 'KeyI'));

    const placeNpc = this.root.querySelector<HTMLButtonElement>('#editor-place-npc');
    placeNpc?.addEventListener('click', () => synthesizeKey(78, 'KeyN'));

    const pairDoor = this.root.querySelector<HTMLButtonElement>('#editor-pair-door');
    pairDoor?.addEventListener('click', () => synthesizeKey(79, 'KeyO'));

    const palette = this.root.querySelector<HTMLButtonElement>('#editor-palette');
    palette?.addEventListener('click', () => synthesizeKey(80, 'KeyP'));

    const warp = this.root.querySelector<HTMLButtonElement>('#editor-warp');
    warp?.addEventListener('click', () => synthesizeKey(115, 'F4'));
  }

  // ── HTML / CSS ─────────────────────────────────────────────────────────

  private static html(): string {
    return `
      <header id="editor-topbar">
        <span class="brand">WARDEN editor</span>
        <span class="sep">|</span>
        <span class="label">Room:</span>
        <span id="editor-current-room" class="value">—</span>
        <span class="spacer"></span>
        <button id="editor-save" class="btn" title="Export tilemap to clipboard (X)">Save</button>
        <button id="editor-audit" class="btn" title="Audit room graph">Audit</button>
        <button id="editor-reload" class="btn" title="Reload current room from disk (L)">Reload</button>
        <button id="editor-exit" class="btn btn-warn" title="Return to title screen">Exit</button>
      </header>

      <aside id="editor-leftpanel">
        <h3>Rooms</h3>
        <div id="editor-room-list" class="room-list"></div>
        <div class="hint">Add: <code>npm run new-room &lt;id&gt;</code></div>
      </aside>

      <main id="editor-center"></main>

      <aside id="editor-rightpanel">
        <h3>Layer</h3>
        <div class="row">
          <button class="btn layer-btn" data-layer-key="1">1 Ground</button>
          <button class="btn layer-btn" data-layer-key="2">2 Coll.</button>
          <button class="btn layer-btn" data-layer-key="3">3 Above</button>
        </div>
        <h3>Tools</h3>
        <div class="row col">
          <button class="btn" id="editor-palette">P · Tile palette</button>
          <button class="btn" id="editor-stamp">T · Stamp default room</button>
          <button class="btn" id="editor-place-interactable">I · Place interactable</button>
          <button class="btn" id="editor-place-npc">N · Place NPC</button>
          <button class="btn" id="editor-pair-door">O · Pair doors</button>
          <button class="btn" id="editor-warp">Warp picker</button>
        </div>
        <h3>Cheatsheet</h3>
        <div class="cheats">
          <div><kbd>Q</kbd>/<kbd>E</kbd> tile cycle</div>
          <div><kbd>L-clk</kbd> paint &nbsp; <kbd>R-clk</kbd> erase</div>
          <div><kbd>M-clk</kbd>/<kbd>Alt+L</kbd> eyedropper</div>
          <div><kbd>Sh+Arrow</kbd> expand edge</div>
          <div><kbd>Ctrl+Sh+Arrow</kbd> shrink edge</div>
          <div><kbd>Mid-drag</kbd> pan camera</div>
          <div><kbd>Ctrl+Wheel</kbd> zoom</div>
          <div><kbd>WASD</kbd> pan</div>
          <div><kbd>R</kbd> cycle reverb</div>
          <div><kbd>[</kbd>/<kbd>]</kbd> reverb mix</div>
          <div><kbd>-</kbd>/<kbd>+</kbd> volume</div>
          <div><kbd>Esc</kbd> cancel / exit</div>
        </div>
      </aside>

      <footer id="editor-status">Ready</footer>
    `;
  }

  private static css(): string {
    return `
      #editor-overlay {
        position: fixed; inset: 0;
        display: grid;
        grid-template-rows: 36px 1fr 28px;
        grid-template-columns: 200px 1fr 240px;
        grid-template-areas:
          "top top top"
          "left center right"
          "status status status";
        background: #1a1a1a;
        color: #cfcfcf;
        font-family: ui-monospace, monospace;
        font-size: 11px;
        z-index: 1000;
      }
      #editor-overlay button { font-family: inherit; font-size: inherit; }
      #editor-overlay h3 {
        margin: 8px 6px 4px; font-size: 10px; letter-spacing: 0.05em;
        text-transform: uppercase; color: #8b8;
      }
      #editor-overlay code, #editor-overlay kbd {
        font-family: inherit; background: #2a2a2a; color: #ddd;
        padding: 1px 4px; border-radius: 3px; border: 1px solid #3a3a3a;
      }
      #editor-overlay .btn {
        display: inline-block; background: #2a2a2a; color: #ddd;
        border: 1px solid #3a3a3a; padding: 4px 8px; cursor: pointer;
        border-radius: 3px;
      }
      #editor-overlay .btn:hover { background: #353535; border-color: #555; }
      #editor-overlay .btn-warn { background: #4a2a2a; border-color: #6a3a3a; }
      #editor-overlay .btn-warn:hover { background: #5a3030; }

      #editor-topbar {
        grid-area: top;
        display: flex; align-items: center; gap: 8px;
        padding: 0 10px;
        background: #181818;
        border-bottom: 1px solid #2a2a2a;
      }
      #editor-topbar .brand { color: #d4c87a; font-weight: bold; }
      #editor-topbar .sep { color: #444; }
      #editor-topbar .label { color: #888; }
      #editor-topbar .value { color: #fff; }
      #editor-topbar .spacer { flex: 1; }

      #editor-leftpanel {
        grid-area: left;
        background: #1d1d1d; border-right: 1px solid #2a2a2a;
        padding: 6px; overflow-y: auto;
      }
      #editor-leftpanel .room-list {
        display: flex; flex-direction: column; gap: 2px; margin-bottom: 8px;
      }
      #editor-leftpanel .room-item {
        text-align: left; background: transparent; color: #c8c8c8;
        border: 1px solid transparent; padding: 3px 6px; cursor: pointer;
        border-radius: 3px;
      }
      #editor-leftpanel .room-item:hover {
        background: #2a2a2a; border-color: #3a3a3a;
      }
      #editor-leftpanel .room-item.active {
        background: #2d3a2d; border-color: #4f6d4f; color: #d4f1d4;
      }
      #editor-leftpanel .hint {
        font-size: 10px; color: #888; padding: 4px 6px;
        border-top: 1px dashed #333;
      }

      #editor-center {
        grid-area: center;
        display: flex; align-items: center; justify-content: center;
        background: #0a0a0a;
        overflow: hidden;
        min-width: 0; min-height: 0;
      }

      #editor-rightpanel {
        grid-area: right;
        background: #1d1d1d; border-left: 1px solid #2a2a2a;
        padding: 6px; overflow-y: auto;
      }
      #editor-rightpanel .row {
        display: flex; gap: 4px; padding: 0 6px; flex-wrap: wrap;
      }
      #editor-rightpanel .row.col { flex-direction: column; }
      #editor-rightpanel .row .btn { flex: 1; }
      #editor-rightpanel .cheats {
        padding: 4px 6px; line-height: 1.7; color: #b5b5b5;
      }

      #editor-status {
        grid-area: status;
        display: flex; align-items: center; padding: 0 10px;
        background: #181818;
        border-top: 1px solid #2a2a2a;
        color: #aaa; font-size: 10px;
      }
    `;
  }
}

/**
 * Dispatch a synthetic keydown event so Phaser's keyboard plugin (which
 * listens on window) treats it as a real key press. Used by EditorUI buttons
 * to drive the existing key handlers in RoomEditorManager / DebugManager.
 *
 * IMPORTANT: the keyup must be deferred to a later frame. Phaser's
 * KeyboardPlugin processes its event queue in a single batch on each Game
 * step. Inside that batch, `Key.onDown` sets `_justDown=true` and `Key.onUp`
 * sets it back to `false`. If both events are queued in the same frame, the
 * scene update reads `_justDown=false` and `JustDown(...)` returns false —
 * the action never fires. Spacing the keyup out two animation frames keeps
 * the button click visible to one full editor update tick.
 *
 * Each event also gets a strictly-increasing timestamp so Phaser's
 * "duplicate event bailout" (same keyCode + same timeStamp + same type)
 * doesn't drop rapid repeat clicks.
 */
let _synthClock = 0;
function nextStamp(): number {
  const now = performance.now();
  _synthClock = Math.max(now, _synthClock + 1);
  return _synthClock;
}
function synthesizeKey(keyCode: number, code: string): void {
  const down = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, code });
  Object.defineProperty(down, 'keyCode', { get: () => keyCode });
  Object.defineProperty(down, 'which', { get: () => keyCode });
  Object.defineProperty(down, 'timeStamp', { get: () => nextStamp() });
  window.dispatchEvent(down);
  // Defer keyup by two animation frames so Phaser processes the keydown
  // (setting _justDown=true) and runs at least one scene update before the
  // keyup clears _justDown.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const up = new KeyboardEvent('keyup', { bubbles: true, cancelable: true, code });
      Object.defineProperty(up, 'keyCode', { get: () => keyCode });
      Object.defineProperty(up, 'which', { get: () => keyCode });
      Object.defineProperty(up, 'timeStamp', { get: () => nextStamp() });
      window.dispatchEvent(up);
    });
  });
}
