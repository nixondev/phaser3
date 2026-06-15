import { CAST_NAMESPACE, CastControllerMessage, CastInputButton } from '@cast/types';

const LOG = (...args: unknown[]) => console.log('[cast:sender]', ...args);
const ERR = (...args: unknown[]) => console.error('[cast:sender]', ...args);

const DEFAULT_RECEIVER_APP_ID = '4EBEABD4';

export class CastSenderController {
  private root: HTMLElement;
  private statusEl!: HTMLElement;
  private connectScreen!: HTMLElement;
  private controllerScreen!: HTMLElement;
  private session: any = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  init(): void {
    this.render();
    this.loadSdk();
  }

  private render(): void {
    this.root.style.cssText = 'height:100%;background:#0e0e0e;font-family:Silkscreen,monospace;color:#ccc;overflow:hidden;';

    this.root.innerHTML = `
      <style>
        .cb {
          touch-action: none; user-select: none; -webkit-tap-highlight-color: transparent;
          font-family: Silkscreen, monospace; cursor: pointer;
          background: #1a1a1a; color: #ccc; border: 1px solid #333; border-radius: 10px;
          display: flex; align-items: center; justify-content: center;
        }
        .cb:active { background: #2a2a2a; border-color: #555; }
        .cb-action { background: #0d2640; border-color: #2a5a9a; color: #7ab0e8; }
        .cb-action:active { background: #1a3a5a; }
        .cb-start { background: #1a0d2a; border-color: #5a3a8a; color: #a87ad8; }
        .cb-start:active { background: #2a1a3a; }
        .cb-menu  { background: #1a1a0d; border-color: #5a5a2a; color: #c8c870; }
        .cb-menu:active { background: #2a2a1a; }
      </style>

      <!-- Connect screen -->
      <div id="connect-screen" style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:20px;padding:32px;box-sizing:border-box;">
        <div style="font-size:26px;letter-spacing:6px;color:#fff;">WARDEN</div>
        <div style="font-size:10px;letter-spacing:3px;color:#444;">TV CONTROLLER</div>
        <button id="cast-connect" class="cb" style="padding:16px 32px;font-size:13px;margin-top:12px;border-color:#555;color:#fff;">
          Connect to Chromecast
        </button>
        <div id="cast-status" style="font-size:10px;color:#444;text-align:center;max-width:240px;line-height:1.6;">
          Waiting for Cast SDK...
        </div>
      </div>

      <!-- Controller screen (hidden until connected) -->
      <div id="controller-screen" style="display:none;height:100%;flex-direction:column;padding:14px 16px;box-sizing:border-box;gap:0;">

        <!-- Header -->
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
          <span style="font-size:11px;letter-spacing:3px;color:#555;">WARDEN</span>
          <span style="font-size:10px;color:#3a8a3a;">&#x25CF; Connected</span>
          <button id="cast-disconnect" class="cb" style="font-size:9px;padding:4px 10px;border-radius:6px;color:#666;">DISC</button>
        </div>

        <!-- Top row: START + MENU -->
        <div style="display:flex;justify-content:center;gap:14px;margin-bottom:18px;">
          <button data-btn="action" class="cb cb-start" style="width:110px;height:44px;font-size:12px;letter-spacing:1px;">START</button>
          <button data-btn="menu"   class="cb cb-menu"  style="width:110px;height:44px;font-size:12px;letter-spacing:1px;">MENU</button>
        </div>

        <!-- Main area: D-pad left, E button right -->
        <div style="display:flex;align-items:center;justify-content:space-around;flex:1;min-height:0;">

          <!-- D-pad -->
          <div style="display:grid;grid-template-columns:72px 72px 72px;grid-template-rows:72px 72px 72px;gap:6px;">
            <button data-btn="up"    class="cb" style="grid-column:2;grid-row:1;font-size:22px;">&#x25B2;</button>
            <button data-btn="left"  class="cb" style="grid-column:1;grid-row:2;font-size:22px;">&#x25C4;</button>
            <button data-btn="right" class="cb" style="grid-column:3;grid-row:2;font-size:22px;">&#x25BA;</button>
            <button data-btn="down"  class="cb" style="grid-column:2;grid-row:3;font-size:22px;">&#x25BC;</button>
          </div>

          <!-- E / action -->
          <button data-btn="action" class="cb cb-action" style="width:108px;height:108px;font-size:26px;border-radius:50%;border-width:2px;">
            E
          </button>
        </div>

        <!-- Bottom row: utility -->
        <div style="display:flex;justify-content:center;gap:10px;margin-top:18px;">
          <button data-btn="inventory"  class="cb" style="flex:1;height:48px;font-size:10px;max-width:90px;">INV</button>
          <button data-btn="flashlight" class="cb" style="flex:1;height:48px;font-size:10px;max-width:90px;">LIGHT</button>
          <button data-btn="drop"       class="cb" style="flex:1;height:48px;font-size:10px;max-width:90px;">DROP</button>
        </div>

      </div>
    `;

    this.statusEl = this.root.querySelector('#cast-status') as HTMLElement;
    this.connectScreen = this.root.querySelector('#connect-screen') as HTMLElement;
    this.controllerScreen = this.root.querySelector('#controller-screen') as HTMLElement;

    this.root.querySelector('#cast-connect')!.addEventListener('click', () => this.requestSession());
    this.root.querySelector('#cast-disconnect')!.addEventListener('click', () => this.disconnect());

    this.root.querySelectorAll('button[data-btn]').forEach((btn) => {
      const key = (btn as HTMLButtonElement).dataset.btn as CastInputButton;
      btn.addEventListener('pointerdown',  (e) => { e.preventDefault(); this.sendInput(key, true); });
      btn.addEventListener('pointerup',    (e) => { e.preventDefault(); this.sendInput(key, false); });
      btn.addEventListener('pointercancel', () => this.sendInput(key, false));
      btn.addEventListener('pointerleave',  () => this.sendInput(key, false));
    });
  }

  private showController(): void {
    this.connectScreen.style.display = 'none';
    this.controllerScreen.style.display = 'flex';
  }

  private showConnect(): void {
    this.controllerScreen.style.display = 'none';
    this.connectScreen.style.display = 'flex';
  }

  private loadSdk(): void {
    LOG('loadSdk() — page origin:', window.location.origin);
    if (window.cast?.framework) {
      LOG('SDK already present, skipping script load');
      this.initializeCast();
      return;
    }
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      LOG('__onGCastApiAvailable fired, isAvailable:', isAvailable);
      if (isAvailable) this.initializeCast();
      else {
        ERR('Cast SDK unavailable — page must be served over HTTPS from Chrome on Android');
        this.setStatus('Cast SDK unavailable. Open this page in Chrome on Android over HTTPS.');
      }
    };
    LOG('injecting Cast sender SDK script');
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.onerror = () => ERR('failed to load Cast sender SDK script');
    document.head.appendChild(script);
  }

  private initializeCast(): void {
    LOG('initializeCast() — app ID:', DEFAULT_RECEIVER_APP_ID);
    const context = window.cast.framework.CastContext.getInstance();
    context.setOptions({
      receiverApplicationId: DEFAULT_RECEIVER_APP_ID,
      autoJoinPolicy: 'origin_scoped',
    });
    LOG('CastContextEventType:', window.cast.framework.CastContextEventType);
    LOG('SessionState:', window.cast.framework.SessionState);
    context.addEventListener('sessionstatechanged', (event: any) => {
      const state = event.sessionState;
      LOG('session state changed:', state);
      if (state === 'SESSION_STARTED' || state === 'SESSION_RESUMED') {
        this.session = context.getCurrentSession();
        LOG('session active:', this.session);
        this.showController();
      } else if (state === 'SESSION_ENDED') {
        LOG('session ended');
        this.session = null;
        this.showConnect();
        this.setStatus('Disconnected.');
      }
    });
    this.setStatus('Cast ready. Tap connect.');
  }

  private requestSession(): void {
    const context = window.cast?.framework?.CastContext?.getInstance();
    if (!context) {
      this.setStatus('Cast SDK not initialized.');
      return;
    }
    LOG('requestSession()');
    this.setStatus('Connecting...');
    context.requestSession()
      .then(() => LOG('requestSession() resolved'))
      .catch((err: unknown) => {
        // SDK sometimes rejects even on success; session state listener is authoritative
        LOG('requestSession() rejected (may still connect via state listener):', err);
        if (!this.session) this.setStatus(`Connection failed: ${String(err)}`);
      });
  }

  private disconnect(): void {
    const context = window.cast?.framework?.CastContext?.getInstance();
    context?.endCurrentSession(true);
    this.session = null;
    this.showConnect();
    this.setStatus('Disconnected.');
  }

  private sendInput(button: CastInputButton, isDown: boolean): void {
    if (!this.session) return;
    const message: CastControllerMessage = { type: 'input', button, isDown, timestamp: Date.now() };
    LOG(`sendInput: ${button} isDown=${isDown}`);
    this.session.sendMessage(CAST_NAMESPACE, JSON.stringify(message));
  }

  private setStatus(message: string): void {
    this.statusEl.textContent = message;
  }
}
