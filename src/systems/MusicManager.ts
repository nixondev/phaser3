import { Timidity } from '@/lib/Timidity';

const BASE = import.meta.env.BASE_URL; // '/' in dev, '/phaser3/' on GitHub Pages

export class MusicManager {
  private static instance: MusicManager;
  private player: Timidity;
  private currentTrack: string | null = null;
  private currentUrl: string | null = null;

  private constructor() {
    this.player = new Timidity(`${BASE}timidity/`);
    // Looping is handled gaplessly inside Timidity._onAudioProcess:
    // when the song ends, _mid_song_start restarts and immediately re-reads into
    // the same audio buffer — no silent frame needed between loops.
  }

  static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  play(trackName: string): void {
    if (this.currentTrack === trackName) return;
    this.currentTrack = trackName;
    this.currentUrl = `${BASE}music/${trackName}.mid`;
    this.player.load(this.currentUrl);
    this.player.play();
  }

  pause(): void {
    this.player.pause();
  }

  stop(): void {
    this.player.stop();
    this.currentTrack = null;
    this.currentUrl = null;
  }

  destroy(): void {
    this.player.destroy();
    this.currentTrack = null;
    this.currentUrl = null;
  }
}
