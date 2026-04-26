declare module 'timidity' {
  type TimidityEvent = 'playing' | 'paused' | 'stopped' | 'ended' | 'error';

  export default class Timidity {
    constructor(baseUrl?: string);
    load(url: string): void;
    play(): void;
    pause(): void;
    stop(): void;
    destroy(): void;
    on(event: TimidityEvent, listener: (...args: unknown[]) => void): void;
    off(event: TimidityEvent, listener: (...args: unknown[]) => void): void;
  }
}
