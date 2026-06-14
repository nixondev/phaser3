export type CastRuntimeMode = 'default' | 'receiver' | 'sender';

export function getCastRuntimeMode(): CastRuntimeMode {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('cast');
  if (mode === 'receiver' || mode === 'sender') return mode;
  return 'default';
}

export function isCastReceiverMode(): boolean {
  return getCastRuntimeMode() === 'receiver';
}

export function isCastSenderMode(): boolean {
  return getCastRuntimeMode() === 'sender';
}
