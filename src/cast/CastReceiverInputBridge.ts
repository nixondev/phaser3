import { InputState } from '@/types';
import { InputManager } from '@systems/InputManager';
import { CAST_NAMESPACE, CastControllerMessage, isCastControllerMessage } from '@cast/types';

const LOG = (...args: unknown[]) => console.log('[cast:receiver]', ...args);
const ERR = (...args: unknown[]) => console.error('[cast:receiver]', ...args);

const TAP_KEYS: Array<keyof InputState> = [
  'action', 'menu', 'inventory', 'drop', 'flashlight', 'debug', 'visuals', 'char1', 'char2', 'char3', 'char4'
];

export class CastReceiverInputBridge {
  private inputManager: InputManager;
  private active = false;
  private context?: any;
  private boundHandler = (event: any) => this.onMessage(event.data);

  constructor(inputManager: InputManager) {
    this.inputManager = inputManager;
  }

  start(): void {
    LOG('start() called — attaching real message listener');
    const cast = window.cast;
    if (!cast?.framework) {
      ERR('window.cast.framework not found');
      return;
    }
    this.context = cast.framework.CastReceiverContext.getInstance();
    // context.start() was already called in main.ts immediately after SDK load
    // Just register the real listener now (replaces the placeholder added in main.ts)
    this.context.addCustomMessageListener(CAST_NAMESPACE, this.boundHandler);
    this.active = true;
    LOG('receiver bridge active');
  }

  isActive(): boolean {
    return this.active;
  }

  destroy(): void {
    LOG('destroy() called');
    if (this.context) {
      this.context.removeCustomMessageListener(CAST_NAMESPACE, this.boundHandler);
      this.context = undefined;
    }
    this.active = false;
  }

  private onMessage(data: unknown): void {
    LOG('raw message received:', data);
    if (!isCastControllerMessage(data)) {
      ERR('message failed type guard, ignoring:', data);
      return;
    }
    this.applyMessage(data);
  }

  private applyMessage(message: CastControllerMessage): void {
    if (message.type !== 'input') return;
    const key = message.button;
    LOG(`input: ${key} isDown=${message.isDown}`);
    if (TAP_KEYS.includes(key)) {
      if (message.isDown) this.inputManager.setVirtualTap(key);
      return;
    }
    this.inputManager.setVirtualInput(key, message.isDown);
  }
}
