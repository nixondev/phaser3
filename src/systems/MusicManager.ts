import { Timidity } from '@/lib/Timidity';

const BASE = import.meta.env.BASE_URL; // '/' in dev, '/phaser3/' on GitHub Pages

export class MusicManager {
  private static instance: MusicManager;
  private player: Timidity;
  private proximityPlayers: Map<string, Timidity> = new Map();
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

  playProximity(id: string, trackName: string): void {
    if (this.proximityPlayers.has(id)) return;
    
    const p = new Timidity(`${BASE}timidity/`);
    const url = `${BASE}music/${trackName}.mid`;
    p.setVolume(0);
    p.load(url).then(() => {
      // Synchronize with main player if possible, 
      // but for "always playing" background layers we just start it.
      p.play();
    });
    this.proximityPlayers.set(id, p);
  }

  updateProximityVolume(id: string, volume: number): void {
    const p = this.proximityPlayers.get(id);
    if (p) {
      p.setVolume(volume);
    }
  }

  stopProximity(id: string): void {
    const p = this.proximityPlayers.get(id);
    if (p) {
      p.stop();
      p.destroy();
      this.proximityPlayers.delete(id);
    }
  }

  pause(): void {
    this.player.pause();
    for (const p of this.proximityPlayers.values()) {
      p.pause();
    }
  }

  stop(): void {
    this.player.stop();
    for (const p of this.proximityPlayers.values()) {
      p.stop();
      p.destroy();
    }
    this.proximityPlayers.clear();
    this.currentTrack = null;
    this.currentUrl = null;
  }

  destroy(): void {
    this.player.destroy();
    for (const p of this.proximityPlayers.values()) {
      p.destroy();
    }
    this.proximityPlayers.clear();
    this.currentTrack = null;
    this.currentUrl = null;
  }
}
