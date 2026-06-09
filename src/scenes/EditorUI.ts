import { RoomManager } from '@systems/RoomManager';
import type { EditorScene } from './EditorScene';
import type { EditorPreviewState } from '@systems/RoomEditorManager';
import { DARKNESS_CONFIG } from '@utils/Constants';

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
  private propsLabel!: HTMLElement;
  private propsTextarea!: HTMLTextAreaElement;
  private previewCanvas!: HTMLCanvasElement;
  private previewLabel!: HTMLElement;
  private lastPreviewKey = '';
  private lastTool = '';

  private currentRoomId = '';
  private currentWeather: string[] = [];
  private currentDark = false;
  private currentDarkLevel: number = DARKNESS_CONFIG.DEFAULT_LEVEL;
  private currentOnGroundAlpha: number = 0.2;
  private currentOnCollisionAlpha: number = 1.0;
  private currentOnAboveAlpha: number = 1.0;

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
    this.propsLabel = this.root.querySelector('#editor-props-label') as HTMLElement;
    this.propsTextarea = this.root.querySelector('#editor-props-json') as HTMLTextAreaElement;
    this.previewCanvas = this.root.querySelector('#editor-preview-canvas') as HTMLCanvasElement;
    this.previewLabel = this.root.querySelector('#editor-preview-label') as HTMLElement;

    this.root.querySelector<HTMLButtonElement>('#editor-props-copy')?.addEventListener('click', () => {
      navigator.clipboard.writeText(this.propsTextarea.value).then(
        () => this.setStatus('Copied to clipboard.'),
        () => this.setStatus('Clipboard unavailable — copy manually.'),
      );
    });

    this.populateRoomList();
    this.wireButtons();

    // Ensure the Phaser canvas can receive keyboard focus so WASD pan
    // works after clicking DOM buttons/room list items.
    const canvas = this.scene.game.canvas;
    if (!canvas.hasAttribute('tabindex')) canvas.setAttribute('tabindex', '0');
    canvas.focus();

    // Prevent WASD from scrolling the DOM panels when they have focus.
    this.root.addEventListener('click', () => this.scene.game.canvas.focus(), true);
    this.root.addEventListener('keydown', (e: KeyboardEvent) => {
      const reserved = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
      if (reserved.includes(e.code)) e.preventDefault();
    });

    // Phaser's Scale.FIT watches the parent. When the grid resizes the
    // center cell, refresh the scale manager so the canvas updates.
    this.resizeObserver = new ResizeObserver(() => {
      this.scene.scale.refresh();
    });
    this.resizeObserver.observe(center);
    // Initial refresh after layout settles.
    requestAnimationFrame(() => this.scene.scale.refresh());
  }

  // â”€â”€ Public API â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  public onRoomChanged(roomId: string): void {
    if (this.currentRoomEl) this.currentRoomEl.textContent = roomId;
    this.highlightActiveRoom(roomId);
    this.setStatus(`Loaded ${roomId}`);
    this.clearProperties();
    this.updateWeatherSelector(roomId);
    this.updateDarknessSelector(roomId);
    this.updateAlphaSelectors(roomId);
  }

  public setStatus(text: string): void {
    if (this.statusEl) this.statusEl.textContent = text;
  }

  /** Reflect the active tool on its button (currently just the Select toggle). */
  public setActiveTool(tool: 'paint' | 'rect' | 'fill' | 'select'): void {
    if (tool === this.lastTool) return;
    this.lastTool = tool;
    this.root.querySelector('#editor-select')?.classList.toggle('active', tool === 'select');
  }

  /** Render the current tile/color selection into the docked preview box. */
  public setPreview(state: EditorPreviewState): void {
    // Skip redundant redraws — only re-render when the selection actually changes.
    const key = state.kind === 'tile'
      ? `t:${state.textureKey}:${state.frame}:${state.gid}`
      : state.kind === 'color'
        ? `c:${state.rgb}`
        : 'none';
    if (key === this.lastPreviewKey) return;
    this.lastPreviewKey = key;

    const canvas = this.previewCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (state.kind === 'none') {
      this.previewLabel.textContent = '—';
      canvas.style.opacity = '0.35';
      return;
    }
    canvas.style.opacity = '1';

    if (state.kind === 'color') {
      const hex = state.rgb.toString(16).padStart(6, '0');
      ctx.fillStyle = `#${hex}`;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      this.previewLabel.textContent = `color #${hex.toUpperCase()}`;
      return;
    }

    // Tile: blit the frame straight from the loaded spritesheet texture.
    this.previewLabel.textContent = `tile ${state.gid}`;
    try {
      const tex = this.scene.textures.get(state.textureKey);
      const frame = tex.get(state.frame);
      const src = tex.getSourceImage() as CanvasImageSource;
      ctx.drawImage(
        src,
        frame.cutX, frame.cutY, frame.cutWidth, frame.cutHeight,
        0, 0, canvas.width, canvas.height,
      );
    } catch {
      /* texture/frame not ready — label still shows the gid */
    }
  }

  public showProperties(label: string, json: string): void {
    if (this.propsLabel) this.propsLabel.textContent = label;
    if (this.propsTextarea) {
      this.propsTextarea.value = json;
      this.propsTextarea.closest<HTMLElement>('#editor-props-panel')!.style.display = 'block';
    }
  }

  public clearProperties(): void {
    const panel = this.root.querySelector<HTMLElement>('#editor-props-panel');
    if (panel) panel.style.display = 'none';
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

  // â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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

  private updateWeatherSelector(roomId: string): void {
    this.currentRoomId = roomId;
    const rooms = RoomManager.getRoomsData().rooms;
    const room = rooms[roomId] as any;
    const w = room?.weather;
    this.currentWeather = w ? (Array.isArray(w) ? [...w] : [w]) : [];
    this.syncWeatherButtons();
  }

  private syncWeatherButtons(): void {
    this.root.querySelectorAll<HTMLButtonElement>('.weather-btn').forEach(btn => {
      btn.classList.toggle('active', this.currentWeather.includes(btn.dataset.weather ?? ''));
    });
  }

  private saveWeather(): void {
    if (!this.currentRoomId) return;
    fetch('/__editor/save-weather', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId: this.currentRoomId, weather: this.currentWeather }),
    })
      .then(r => r.json())
      .then(() => this.setStatus(`Weather: [${this.currentWeather.join(', ') || 'none'}]`))
      .catch(e => this.setStatus(`Weather save failed: ${e}`));
  }

  private updateDarknessSelector(roomId: string): void {
    this.currentRoomId = roomId;
    const rooms = RoomManager.getRoomsData().rooms;
    const room = rooms[roomId] as any;
    this.currentDark = room?.dark === true;
    this.currentDarkLevel = typeof room?.darkLevel === 'number' ? room.darkLevel : DARKNESS_CONFIG.DEFAULT_LEVEL;
    this.syncDarknessControls();
  }

  private syncDarknessControls(): void {
    const toggle = this.root.querySelector<HTMLButtonElement>('#editor-dark-toggle');
    const slider = this.root.querySelector<HTMLInputElement>('#editor-dark-level');
    const valEl  = this.root.querySelector<HTMLSpanElement>('#editor-dark-level-val');
    if (toggle) {
      toggle.classList.toggle('active', this.currentDark);
      toggle.textContent = `dark: ${this.currentDark ? 'on' : 'off'}`;
    }
    if (slider) slider.value = String(this.currentDarkLevel);
    if (valEl)  valEl.textContent = this.currentDarkLevel.toFixed(2);
  }

  private saveDark(): void {
    if (!this.currentRoomId) return;
    fetch('/__editor/save-dark', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: this.currentRoomId,
        dark: this.currentDark,
        darkLevel: this.currentDarkLevel,
      }),
    })
      .then(r => r.json())
      .then(() => this.setStatus(`Dark: ${this.currentDark ? `on (level ${this.currentDarkLevel.toFixed(2)})` : 'off'}`))
      .catch(e => this.setStatus(`Dark save failed: ${e}`));
  }

  private updateAlphaSelectors(roomId: string): void {
    this.currentRoomId = roomId;
    const rooms = RoomManager.getRoomsData().rooms;
    const room = rooms[roomId] as any;
    this.currentOnGroundAlpha = typeof room?.onGroundAlpha === 'number' ? room.onGroundAlpha : 0.2;
    this.currentOnCollisionAlpha = typeof room?.onCollisionAlpha === 'number' ? room.onCollisionAlpha : 1.0;
    this.currentOnAboveAlpha = typeof room?.onAboveAlpha === 'number' ? room.onAboveAlpha : 1.0;
    this.syncAlphaControls();
  }

  private syncAlphaControls(): void {
    const sync = (id: string, val: number) => {
      const slider = this.root.querySelector<HTMLInputElement>(`#editor-${id}-alpha`);
      const valEl  = this.root.querySelector<HTMLSpanElement>(`#editor-${id}-alpha-val`);
      if (slider) slider.value = String(val);
      if (valEl)  valEl.textContent = val.toFixed(2);
    };
    sync('onGround', this.currentOnGroundAlpha);
    sync('onCollision', this.currentOnCollisionAlpha);
    sync('onAbove', this.currentOnAboveAlpha);
  }

  private saveAlphas(): void {
    if (!this.currentRoomId) return;
    fetch('/__editor/save-room-alpha', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        roomId: this.currentRoomId,
        onGroundAlpha: this.currentOnGroundAlpha,
        onCollisionAlpha: this.currentOnCollisionAlpha,
        onAboveAlpha: this.currentOnAboveAlpha,
      }),
    })
      .then(r => r.json())
      .then(() => this.setStatus(`Alphas saved: Gnd=${this.currentOnGroundAlpha.toFixed(2)} Coll=${this.currentOnCollisionAlpha.toFixed(2)} Abv=${this.currentOnAboveAlpha.toFixed(2)}`))
      .catch(e => this.setStatus(`Alpha save failed: ${e}`));
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
    const select = this.root.querySelector<HTMLButtonElement>('#editor-select');
    select?.addEventListener('click', () => synthesizeKey(77, 'KeyM'));

    const placeInt = this.root.querySelector<HTMLButtonElement>('#editor-place-interactable');
    placeInt?.addEventListener('click', () => synthesizeKey(73, 'KeyI'));

    const placeNpc = this.root.querySelector<HTMLButtonElement>('#editor-place-npc');
    placeNpc?.addEventListener('click', () => synthesizeKey(78, 'KeyN'));

    const pairDoor = this.root.querySelector<HTMLButtonElement>('#editor-pair-door');
    pairDoor?.addEventListener('click', () => synthesizeKey(79, 'KeyO'));

    const palette = this.root.querySelector<HTMLButtonElement>('#editor-palette');
    palette?.addEventListener('click', () => synthesizeKey(80, 'KeyP'));

    const colorMode = this.root.querySelector<HTMLButtonElement>('#editor-color-mode');
    colorMode?.addEventListener('click', () => synthesizeKey(75, 'KeyK'));

    const colorPicker = this.root.querySelector<HTMLInputElement>('#editor-color-picker');
    colorPicker?.addEventListener('input', () => {
      const hex = colorPicker.value; // e.g. "#ff4444"
      const rgb = parseInt(hex.slice(1), 16);
      this.scene.getEditorManager().setCurrentColor(rgb);
      this.scene.game.canvas.focus();
    });

    const fill = this.root.querySelector<HTMLButtonElement>('#editor-fill');
    fill?.addEventListener('click', () => synthesizeKey(70, 'KeyF'));

    const actualView = this.root.querySelector<HTMLButtonElement>('#editor-actual-view');
    if (actualView) {
      const press = () => {
        this.scene.getEditorManager().setActualViewHeld(true);
        actualView.classList.add('active');
      };
      const release = () => {
        this.scene.getEditorManager().setActualViewHeld(false);
        actualView.classList.remove('active');
      };
      // Hold to preview: releasing the mouse or moving off the button ends it.
      actualView.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
      actualView.addEventListener('pointerup', release);
      actualView.addEventListener('pointerleave', release);
    }

    const hud = this.root.querySelector<HTMLButtonElement>('#editor-hud');
    hud?.addEventListener('click', () => synthesizeKey(72, 'KeyH'));

    const visuals = this.root.querySelector<HTMLButtonElement>('#editor-visuals');
    visuals?.addEventListener('click', () => synthesizeKey(86, 'KeyV'));

    this.root.querySelectorAll<HTMLButtonElement>('.weather-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.dataset.weather ?? '';
        if (!type) return;
        const idx = this.currentWeather.indexOf(type);
        if (idx >= 0) {
          this.currentWeather.splice(idx, 1);
        } else {
          this.currentWeather.push(type);
        }
        this.syncWeatherButtons();
        this.saveWeather();
        this.scene.game.canvas.focus();
      });
    });

    const darkToggle = this.root.querySelector<HTMLButtonElement>('#editor-dark-toggle');
    darkToggle?.addEventListener('click', () => {
      this.currentDark = !this.currentDark;
      this.syncDarknessControls();
      this.saveDark();
      this.scene.game.canvas.focus();
    });

    const darkSlider = this.root.querySelector<HTMLInputElement>('#editor-dark-level');
    darkSlider?.addEventListener('input', () => {
      this.currentDarkLevel = parseFloat(darkSlider.value);
      const valEl = this.root.querySelector<HTMLSpanElement>('#editor-dark-level-val');
      if (valEl) valEl.textContent = this.currentDarkLevel.toFixed(2);
    });
    darkSlider?.addEventListener('change', () => {
      this.saveDark();
      this.scene.game.canvas.focus();
    });

    const wireAlpha = (id: string, prop: 'currentOnGroundAlpha' | 'currentOnCollisionAlpha' | 'currentOnAboveAlpha', layer: string) => {
      const slider = this.root.querySelector<HTMLInputElement>(`#editor-${id}-alpha`);
      slider?.addEventListener('input', () => {
        const val = parseFloat(slider.value);
        (this as any)[prop] = val;
        const valEl = this.root.querySelector<HTMLSpanElement>(`#editor-${id}-alpha-val`);
        if (valEl) valEl.textContent = val.toFixed(2);
        
        // Live preview
        const rm = (this.scene as any).roomManager as RoomManager;
        if (rm) {
          const l = (rm as any).currentLayers?.[layer] as Phaser.Tilemaps.TilemapLayer;
          if (l) l.setAlpha(val);
          // Also update color overlay alpha
          rm.renderColorTiles();
        }
      });
      slider?.addEventListener('change', () => {
        this.saveAlphas();
        this.scene.game.canvas.focus();
      });
    };

    wireAlpha('onGround', 'currentOnGroundAlpha', 'onGround');
    wireAlpha('onCollision', 'currentOnCollisionAlpha', 'onCollision');
    wireAlpha('onAbove', 'currentOnAboveAlpha', 'onAbove');
  }

  // â”€â”€ HTML / CSS â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
        <div id="editor-props-panel" style="display:none">
          <h3>Properties — <span id="editor-props-label" style="color:#d4c87a;text-transform:none;letter-spacing:0"></span></h3>
          <textarea id="editor-props-json" spellcheck="false" autocomplete="off"></textarea>
          <button class="btn" id="editor-props-copy" style="margin:4px 6px 6px;width:calc(100% - 12px)">Copy JSON</button>
          <div style="border-top:1px dashed #333;margin:0 0 4px"></div>
        </div>
        <h3>Selected</h3>
        <div id="editor-preview">
          <canvas id="editor-preview-canvas" width="64" height="64"></canvas>
          <span id="editor-preview-label">—</span>
        </div>
        <h3>Layer</h3>
        <div class="row">
          <button class="btn layer-btn" data-layer-key="1">1 Ground</button>
          <button class="btn layer-btn" data-layer-key="2">2 OnGnd</button>
          <button class="btn layer-btn" data-layer-key="3">3 Coll.</button>
          <button class="btn layer-btn" data-layer-key="4">4 OnColl.</button>
          <button class="btn layer-btn" data-layer-key="5">5 Above</button>
          <button class="btn layer-btn" data-layer-key="6">6 OnAbv</button>
          <button class="btn layer-btn" data-layer-key="7">7 Spec</button>
        </div>
        <h3>Tools</h3>
        <div class="row col">
          <button class="btn" id="editor-select" title="Select doors/objects without painting (M)">M · Select (no paint)</button>
          <button class="btn" id="editor-palette">P · Tile palette</button>
          <button class="btn" id="editor-color-mode">K · Color mode</button>
          <div class="color-picker-row">
            <span class="color-picker-label">Color:</span>
            <input type="color" id="editor-color-picker" value="#ff4444" title="Overlay color (click to pick)">
          </div>
          <button class="btn" id="editor-fill">F · Flood fill</button>
          <button class="btn" id="editor-stamp">T · Stamp default room</button>
          <button class="btn" id="editor-place-interactable">I · Place interactable</button>
          <button class="btn" id="editor-place-npc">N · Place NPC</button>
          <button class="btn" id="editor-pair-door">O · Pair doors</button>
        </div>
        <h3>Views</h3>
        <div class="row col">
          <button class="btn" id="editor-actual-view">G · Actual view (hold)</button>
          <button class="btn" id="editor-hud">H · HUD overlay</button>
          <button class="btn" id="editor-visuals">V · Visual debug</button>
        </div>
        <h3>Weather</h3>
        <div id="editor-weather-btns" class="row col">
          <button class="btn weather-btn" data-weather="rain-mild">rain-mild</button>
          <button class="btn weather-btn" data-weather="rain-hard">rain-hard</button>
          <button class="btn weather-btn" data-weather="dripping">dripping</button>
          <button class="btn weather-btn" data-weather="clouds">clouds</button>
        </div>
        <h3>Darkness</h3>
        <div class="row col" style="gap:6px">
          <button class="btn" id="editor-dark-toggle">dark: off</button>
          <div class="dark-slider-row">
            <span class="dark-slider-label">Level: <span id="editor-dark-level-val">${DARKNESS_CONFIG.DEFAULT_LEVEL}</span></span>
            <input type="range" id="editor-dark-level" min="0" max="1" step="0.05" value="${DARKNESS_CONFIG.DEFAULT_LEVEL}">
          </div>
        </div>
        <h3>Layer Alpha</h3>
        <div class="row col" style="gap:6px">
          <div class="dark-slider-row">
            <span class="dark-slider-label">OnGnd: <span id="editor-onGround-alpha-val">0.20</span></span>
            <input type="range" id="editor-onGround-alpha" min="0" max="1" step="0.05" value="0.2">
          </div>
          <div class="dark-slider-row">
            <span class="dark-slider-label">OnColl: <span id="editor-onCollision-alpha-val">1.00</span></span>
            <input type="range" id="editor-onCollision-alpha" min="0" max="1" step="0.05" value="1.0">
          </div>
          <div class="dark-slider-row">
            <span class="dark-slider-label">OnAbv: <span id="editor-onAbove-alpha-val">1.00</span></span>
            <input type="range" id="editor-onAbove-alpha" min="0" max="1" step="0.05" value="1.0">
          </div>
        </div>
        <h3>Cheatsheet</h3>
        <div class="cheats">
          <div><kbd>K</kbd> color mode &nbsp; picker = color</div>
          <div><kbd>Q</kbd>/<kbd>E</kbd> cycle tile (back to tiles)</div>
          <div><kbd>M</kbd> select mode (no paint)</div>
          <div><kbd>L-clk</kbd> paint &nbsp; <kbd>R-clk</kbd> erase</div>
          <div><kbd>F</kbd> flood fill (toggle)</div>
          <div><kbd>M-clk</kbd>/<kbd>Alt+L</kbd> eyedropper</div>
          <div><kbd>Sh+Arrow</kbd> expand edge</div>
          <div><kbd>Ctrl+Sh+Arrow</kbd> shrink edge</div>
          <div><kbd>Mid-drag</kbd> pan camera</div>
          <div><kbd>Ctrl+Wheel</kbd> zoom</div>
          <div><kbd>WASD</kbd> pan</div>
          <div><kbd>G</kbd> hold for actual view</div>
          <div><kbd>7</kbd> spectra layer focus</div>
          <div><kbd>H</kbd> HUD &nbsp; <kbd>V</kbd> visuals</div>
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
      #editor-props-json {
        display: block; width: calc(100% - 12px); height: 130px;
        margin: 0 6px; resize: vertical;
        background: #111; color: #ccddcc; border: 1px solid #333;
        font-family: ui-monospace, monospace; font-size: 10px;
        line-height: 1.4; padding: 4px; box-sizing: border-box;
      }
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
      #editor-overlay .weather-btn.active { background: #2d3a2d; border-color: #4f6d4f; color: #d4f1d4; }
      #editor-overlay #editor-dark-toggle.active { background: #1a1a2e; border-color: #4a4a8f; color: #aaaaff; }
      #editor-overlay #editor-actual-view.active { background: #2d3a2d; border-color: #4f6d4f; color: #d4f1d4; }
      #editor-overlay #editor-select.active { background: #20402c; border-color: #44ff88; color: #9affc4; }
      #editor-overlay #editor-preview {
        display: flex; align-items: center; gap: 10px; padding: 4px 6px 8px;
      }
      #editor-overlay #editor-preview-canvas {
        width: 56px; height: 56px; flex: 0 0 auto;
        image-rendering: pixelated; image-rendering: crisp-edges;
        border: 1px solid #555; background:
          repeating-conic-gradient(#2a2a2a 0% 25%, #1c1c1c 0% 50%) 0 0 / 16px 16px;
      }
      #editor-overlay #editor-preview-label {
        color: #d4c87a; font-size: 11px; word-break: break-all;
      }
      #editor-overlay .dark-slider-row {
        display: flex; align-items: center; gap: 6px; padding: 0 2px;
      }
      #editor-overlay .dark-slider-label { color: #aaa; white-space: nowrap; min-width: 70px; }
      #editor-overlay #editor-dark-level { flex: 1; cursor: pointer; accent-color: #6666cc; }
      #editor-overlay .color-picker-row {
        display: flex; align-items: center; gap: 6px; padding: 2px 2px;
      }
      #editor-overlay .color-picker-label { color: #aaa; white-space: nowrap; }
      #editor-overlay #editor-color-picker {
        flex: 1; height: 26px; padding: 1px 2px; border: 1px solid #555;
        cursor: pointer; background: #111; border-radius: 3px;
      }

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


