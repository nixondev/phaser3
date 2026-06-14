import { CAST_NAMESPACE, CastControllerMessage, CastInputButton } from '@cast/types';

const DEFAULT_RECEIVER_APP_ID = '4EBEABD4';

export class CastSenderController {
  private root: HTMLElement;
  private statusEl!: HTMLDivElement;
  private session: any = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  init(): void {
    this.render();
    this.loadSdk();
  }

  private render(): void {
    this.root.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:#ddd;font-family:Silkscreen,monospace;gap:12px;">
        <h1 style="font-size:22px;">WARDEN Controller</h1>
        <button id="cast-connect" style="padding:10px 16px;background:#2a2a2a;color:#fff;border:1px solid #555;border-radius:6px;">Connect to Chromecast</button>
        <div id="cast-status" style="font-size:12px;color:#9aa0aa;">Waiting for Cast SDK...</div>
        <div id="pad" style="display:grid;grid-template-columns:80px 80px 80px;grid-template-rows:80px 80px 80px;gap:8px;touch-action:none;user-select:none;">
          <button data-btn="up" style="grid-column:2;grid-row:1;">↑</button>
          <button data-btn="left" style="grid-column:1;grid-row:2;">←</button>
          <button data-btn="action" style="grid-column:2;grid-row:2;">E</button>
          <button data-btn="right" style="grid-column:3;grid-row:2;">→</button>
          <button data-btn="down" style="grid-column:2;grid-row:3;">↓</button>
        </div>
        <div style="display:flex;gap:8px;">
          <button data-btn="inventory">INV</button>
          <button data-btn="flashlight">LIGHT</button>
          <button data-btn="menu">MENU</button>
        </div>
      </div>
    `;
    this.statusEl = this.root.querySelector('#cast-status') as HTMLDivElement;
    const connectBtn = this.root.querySelector('#cast-connect') as HTMLButtonElement;
    connectBtn.addEventListener('click', () => this.requestSession());

    const controls = this.root.querySelectorAll('button[data-btn]');
    controls.forEach((btn) => {
      const key = (btn as HTMLButtonElement).dataset.btn as CastInputButton;
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        this.sendInput(key, true);
      });
      btn.addEventListener('pointerup', (e) => {
        e.preventDefault();
        this.sendInput(key, false);
      });
      btn.addEventListener('pointercancel', () => this.sendInput(key, false));
      btn.addEventListener('pointerleave', () => this.sendInput(key, false));
    });
  }

  private loadSdk(): void {
    if (window.cast?.framework) {
      this.initializeCast();
      return;
    }
    window.__onGCastApiAvailable = (isAvailable: boolean) => {
      if (isAvailable) this.initializeCast();
      else this.setStatus('Cast SDK unavailable.');
    };
    const script = document.createElement('script');
    script.src = 'https://www.gstatic.com/cv/js/sender/v1/cast_sender.js?loadCastFramework=1';
    script.async = true;
    document.head.appendChild(script);
  }

  private initializeCast(): void {
    const cast = window.cast;
    const options = new cast.framework.CastOptions();
    options.receiverApplicationId = DEFAULT_RECEIVER_APP_ID;
    options.autoJoinPolicy = window.chrome.cast.AutoJoinPolicy.ORIGIN_SCOPED;
    cast.framework.CastContext.getInstance().setOptions(options);
    this.setStatus('Cast ready. Tap connect.');
  }

  private requestSession(): void {
    const context = window.cast?.framework?.CastContext?.getInstance();
    if (!context) {
      this.setStatus('Cast SDK not initialized.');
      return;
    }
    context.requestSession()
      .then(() => {
        this.session = context.getCurrentSession();
        this.setStatus('Connected to Chromecast.');
      })
      .catch((err: unknown) => this.setStatus(`Connection failed: ${String(err)}`));
  }

  private sendInput(button: CastInputButton, isDown: boolean): void {
    if (!this.session) return;
    const message: CastControllerMessage = { type: 'input', button, isDown, timestamp: Date.now() };
    this.session.sendMessage(CAST_NAMESPACE, JSON.stringify(message));
  }

  private setStatus(message: string): void {
    this.statusEl.textContent = message;
  }
}
