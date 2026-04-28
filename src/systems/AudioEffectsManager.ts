export class AudioEffectsManager {
  private audioContext: AudioContext;
  private convolver: ConvolverNode;
  private wetGain: GainNode;
  private dryGain: GainNode;
  private currentIrUrl: string | null = null;

  public input: GainNode;
  public output: AudioNode;

  constructor(audioContext: AudioContext, output: AudioNode) {
    this.audioContext = audioContext;
    this.output = output;

    this.input = this.audioContext.createGain();
    this.convolver = this.audioContext.createConvolver();
    this.wetGain = this.audioContext.createGain();
    this.dryGain = this.audioContext.createGain();

    // Dry path
    this.input.connect(this.dryGain);
    this.dryGain.connect(this.output);

    // Wet path (reverb)
    this.input.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.output);

    // Default: mostly dry
    this.dryGain.gain.value = 1.0;
    this.wetGain.gain.value = 0.0;
  }

  getCurrentIrUrl(): string | null { return this.currentIrUrl; }

  async setReverb(url: string | null): Promise<void> {
    if (!url) {
      this.wetGain.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.1);
      return;
    }

    if (this.currentIrUrl === url) {
      this.wetGain.gain.setTargetAtTime(0.3, this.audioContext.currentTime, 0.1);
      return;
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch reverb IR from ${url}: ${response.status} ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      this.convolver.buffer = audioBuffer;
      this.currentIrUrl = url;
      this.wetGain.gain.setTargetAtTime(0.3, this.audioContext.currentTime, 0.1);
    } catch (e) {
      console.error('Failed to load reverb IR:', e);
    }
  }

  setMix(wet: number): void {
    const now = this.audioContext.currentTime;
    this.wetGain.gain.setTargetAtTime(wet, now, 0.1);
    this.dryGain.gain.setTargetAtTime(1.0 - wet, now, 0.1);
  }
}

