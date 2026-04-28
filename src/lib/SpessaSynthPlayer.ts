import { WorkletSynthesizer, Sequencer } from 'spessasynth_lib';
// @ts-ignore: spessasynth_core declaration might be missing in some environments
import { BasicMIDI } from 'spessasynth_core';

export class SpessaSynthPlayer {
  private static processorRegistered = false;
  private synth: WorkletSynthesizer | null = null;
  private sequencer: Sequencer | null = null;
  private audioContext: AudioContext;
  private mainGain: GainNode;
  private outputNode: AudioNode;
  private currentSf2Url: string | null = null;
  private isPaused: boolean = false;

  constructor(audioContext: AudioContext, outputNode: AudioNode) {
    this.audioContext = audioContext;
    this.outputNode = outputNode;
    this.mainGain = this.audioContext.createGain();
    this.mainGain.connect(this.outputNode);
  }

  async loadSoundFont(data: ArrayBuffer): Promise<void> {
    if (!this.synth) {
      // Ensure the AudioWorklet is registered before creating the synthesizer
      if (!SpessaSynthPlayer.processorRegistered) {
        try {
          const BASE = (import.meta as any).env.BASE_URL || '/';
          const processorUrl = `${BASE}spessasynth_processor.min.js`;
          console.log(`SpessaSynthPlayer: Registering AudioWorklet from ${processorUrl}`);
          await this.audioContext.audioWorklet.addModule(processorUrl);
          SpessaSynthPlayer.processorRegistered = true;
          console.log('SpessaSynthPlayer: AudioWorklet registered');
        } catch (e) {
          console.warn('SpessaSynth AudioWorklet module addition error:', e);
        }
      }
      console.log('SpessaSynthPlayer: Creating WorkletSynthesizer');
      this.synth = new WorkletSynthesizer(this.audioContext);
      this.synth.connect(this.mainGain);
      await this.synth.isReady;
      console.log('SpessaSynthPlayer: Synthesizer ready');
    }

    console.log('SpessaSynthPlayer: Adding soundbank...');
    await this.synth.soundBankManager.addSoundBank(data, 'main-sf2');
    console.log('SpessaSynthPlayer: Soundbank added');
  }

  async playMIDI(data: ArrayBuffer): Promise<void> {
    if (!this.synth) throw new Error('Synthesizer not loaded');
    
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    if (!this.sequencer) {
      this.sequencer = new Sequencer(this.synth);
    }

    this.sequencer.pause();
    this.sequencer.loadNewSongList([{ binary: data }]);
    this.sequencer.loopCount = Infinity; // Infinite loop
    this.sequencer.play();
    this.isPaused = false;
    
    console.log(`SpessaSynthPlayer: Playing MIDI, duration=${this.sequencer.duration}s, loopCount=${this.sequencer.loopCount}`);
  }

  setVolume(volume: number): void {
    this.mainGain.gain.setTargetAtTime(volume, this.audioContext.currentTime, 0.02);
  }

  pause(): void {
    if (this.sequencer) {
      this.sequencer.pause();
      this.isPaused = true;
    }
  }

  resume(): void {
    if (this.sequencer && this.isPaused) {
      this.sequencer.play();
      this.isPaused = false;
    }
  }

  stop(): void {
    if (this.sequencer) {
      this.sequencer.pause(); // No stop in lib
    }
    if (this.synth) {
      this.synth.stopAll();
    }
  }

  destroy(): void {
    this.stop();
    this.mainGain.disconnect();
    if (this.synth) {
      this.synth.destroy();
    }
    this.synth = null;
    this.sequencer = null;
  }
}



