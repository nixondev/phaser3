import { InputState } from '@/types';
import { InputManager } from '@systems/InputManager';
import { CAST_NAMESPACE, CastControllerMessage, isCastControllerMessage } from '@cast/types';

const TAP_KEYS: Array<keyof InputState> = [
  'action', 'menu', 'inventory', 'drop', 'flashlight', 'debug', 'visuals', 'char1', 'char2', 'char3', 'char4'
];

export class CastReceiverInputBridge {
  private inputManager: InputManager;
  private active = false;
  private messageBus?: any;

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager;
  }

  start(): void {
    const cast = window.cast;
    if (!cast?.framework) return;
    const context = cast.framework.CastReceiverContext.getInstance();
    const options = new cast.framework.CastReceiverOptions();
    options.disableIdleTimeout = true;
    context.start(options);
    const bus = context.getCastMessageBus(CAST_NAMESPACE);
    bus.onMessage = (event: any) => this.onMessage(event.data);
    this.messageBus = bus;
    this.active = true;
  }

  isActive(): boolean {
    return this.active;
  }

  destroy(): void {
    if (this.messageBus) {
      this.messageBus.onMessage = null;
      this.messageBus = undefined;
    }
    this.active = false;
  }

  private onMessage(raw: unknown): void {
    if (typeof raw !== 'string') return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }
    if (!isCastControllerMessage(parsed)) return;
    this.applyMessage(parsed);
  }

  private applyMessage(message: CastControllerMessage): void {
    if (message.type !== 'input') return;
    const key = message.button;
    if (TAP_KEYS.includes(key)) {
      if (message.isDown) this.inputManager.setVirtualTap(key);
      return;
    }
    this.inputManager.setVirtualInput(key, message.isDown);
  }
}
