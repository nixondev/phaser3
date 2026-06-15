import { InputState } from '@/types';
import { InputManager } from '@systems/InputManager';
import { CAST_NAMESPACE, CastControllerMessage, isCastControllerMessage } from '@cast/types';

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
    const cast = window.cast;
    if (!cast?.framework) return;
    this.context = cast.framework.CastReceiverContext.getInstance();
    // Listener must be registered before context.start()
    this.context.addCustomMessageListener(CAST_NAMESPACE, this.boundHandler);
    const options = new cast.framework.CastReceiverOptions();
    options.disableIdleTimeout = true;
    this.context.start(options);
    this.active = true;
  }

  isActive(): boolean {
    return this.active;
  }

  destroy(): void {
    if (this.context) {
      this.context.removeCustomMessageListener(CAST_NAMESPACE, this.boundHandler);
      this.context = undefined;
    }
    this.active = false;
  }

  private onMessage(data: unknown): void {
    // CAF v3 automatically parses JSON namespaces — data is already an object
    if (!isCastControllerMessage(data)) return;
    this.applyMessage(data);
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
