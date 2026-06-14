import { InputState } from '@/types';

export const CAST_NAMESPACE = 'urn:x-cast:com.warden.game.input';

export type CastInputButton = keyof InputState;

export interface CastInputMessage {
  type: 'input';
  button: CastInputButton;
  isDown: boolean;
  timestamp: number;
}

export interface CastPingMessage {
  type: 'ping';
  timestamp: number;
}

export type CastControllerMessage = CastInputMessage | CastPingMessage;

export function isCastControllerMessage(value: unknown): value is CastControllerMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  return msg.type === 'input' || msg.type === 'ping';
}
