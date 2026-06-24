import { SpessaSynthPlayer } from '@/lib/SpessaSynthPlayer';
import { AudioEffectsManager } from '@/systems/AudioEffectsManager';
import { RoomManager } from '@/systems/RoomManager';
import { AudioManager } from '@/systems/AudioManager';
import { AUDIO_CONFIG } from '@utils/Constants';

const BASE = import.meta.env.BASE_URL; // '/' in dev, '/phaser3/' on GitHub Pages

export class MusicManager {
  private static instance: MusicManager;
  private audioContext: AudioContext;
  private effects: AudioEffectsManager;
  private player: SpessaSynthPlayer;
  private proximityPlayers: Map<string, SpessaSynthPlayer> = new Map();
  private currentRoom: string | null = null;
  private currentTrackName: string | null = null;
  private currentSf2Url: string | null = null;
  private currentReverbType: 'city' | 'indoor' | 'sewer' | 'hospital' | 'substation' | null = null;
  private sf2Cache: Map<string, ArrayBuffer> = new Map();
  private midiCache: Map<string, ArrayBuffer> = new Map();

  private constructor() {
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext;
    this.audioContext = new AudioCtx();
    this.effects = new AudioEffectsManager(this.audioContext, this.audioContext.destination);
    this.player = new SpessaSynthPlayer(this.audioContext, this.effects.input);
  }

  static getInstance(): MusicManager {
    if (!MusicManager.instance) {
      MusicManager.instance = new MusicManager();
    }
    return MusicManager.instance;
  }

  private async getBinaryData(url: string, cache: Map<string, ArrayBuffer>): Promise<ArrayBuffer> {
    if (cache.has(url)) {
      return cache.get(url)!.slice(0); // Return a copy to be safe with Worklets
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to fetch: ${url}`);
    const data = await response.arrayBuffer();
    cache.set(url, data);
    return data.slice(0);
  }

  getCurrentRoomId(): string | null { return this.currentRoom; }

  getCurrentSf2Url(): string | null { return this.currentSf2Url; }

  getEffects(): AudioEffectsManager { return this.effects; }

  setVolume(volume: number): void {
    this.player.setVolume(volume);
    for (const p of this.proximityPlayers.values()) {
      p.setVolume(volume * 0.6); // Keep proximity slightly quieter relative to master
    }
  }

  async playRoomMusic(roomId: string): Promise<void> {
    if (this.currentRoom === roomId) return;
    this.currentRoom = roomId;

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    const roomDef = RoomManager.getRoomsData().rooms[roomId];
    // music field names the track folder; falls back to roomId so rooms without
    // an explicit field automatically use their own music/<roomId>/track.mid.
    const trackName: string = (roomDef?.music as string | undefined) ?? roomId;

    console.log(`[MusicManager] Room ${roomId} → track "${trackName}" (prev: "${this.currentTrackName}")`);

    try {
      const checkExists = async (url: string) => {
        try {
          const r = await fetch(url, { method: 'HEAD' });
          if (!r.ok) return false;
          const ct = r.headers.get('Content-Type');
          if (ct && ct.includes('text/html')) return false;
          return true;
        } catch { return false; }
      };

      if (this.currentTrackName !== trackName) {
        const trackMidiUrl    = `${BASE}music/${trackName}/track.mid`;
        const trackSf2Url     = `${BASE}music/${trackName}/instruments.sf2`;
        const fallbackMidiUrl = `${BASE}music/bgm-main/track.mid`;
        const globalSf2Url    = `${BASE}music/global.sf2`;

        const hasMidi = trackName !== 'bgm-main' ? await checkExists(trackMidiUrl) : true;
        const hasSf2  = await checkExists(trackSf2Url);
        const finalMidi = hasMidi ? trackMidiUrl : fallbackMidiUrl;
        const finalSf2  = hasSf2  ? trackSf2Url  : globalSf2Url;

        console.log(`[MusicManager] Loading "${trackName}": midi=${finalMidi}, sf2=${finalSf2}`);

        const sf2Data  = await this.getBinaryData(finalSf2,  this.sf2Cache);
        const midiData = await this.getBinaryData(finalMidi, this.midiCache);

        if (this.currentSf2Url !== finalSf2) {
          await this.player.loadSoundFont(sf2Data);
          this.currentSf2Url = finalSf2;
        }
        await this.player.playMIDI(midiData);
        this.currentTrackName = trackName;

        const volume = AudioManager.getInstance().getVolume();
        this.player.setVolume(volume);
      } else {
        console.log(`[MusicManager] Same track "${trackName}" — continuing playback`);
      }

      // Always update reverb on room change.
      if (roomDef?.reverb) {
        await this.setReverb(roomDef.reverb as any);
        this.effects.setMix(roomDef.reverbMix ?? AUDIO_CONFIG.DEFAULT_REVERB_MIX);
      } else {
        await this.setReverb('city');
        this.effects.setMix(AUDIO_CONFIG.DEFAULT_REVERB_MIX);
      }
    } catch (e) {
      console.error(`Failed to load music for room ${roomId}:`, e);
    }
  }

  async setReverb(type: 'city' | 'indoor' | 'sewer' | 'hospital' | 'substation' | null): Promise<void> {
    this.currentReverbType = type;
    if (!type) {
      await this.effects.setReverb(null);
      return;
    }
    const irUrl = `${BASE}music/reverb/${type}.wav`;
    await this.effects.setReverb(irUrl);
  }

  getReverbTypes(): Array<'city' | 'indoor' | 'sewer' | 'hospital' | 'substation'> {
    return ['city', 'indoor', 'sewer', 'hospital', 'substation'];
  }

  getCurrentReverbType(): 'city' | 'indoor' | 'sewer' | 'hospital' | 'substation' | null {
    return this.currentReverbType;
  }

  /**
   * Step to the next reverb profile in `getReverbTypes()` order. Returns the
   * profile that is now active so callers can display it.
   */
  async cycleReverb(): Promise<'city' | 'indoor' | 'sewer' | 'hospital' | 'substation'> {
    const types = this.getReverbTypes();
    const i = this.currentReverbType ? types.indexOf(this.currentReverbType) : -1;
    const next = types[(i + 1) % types.length];
    await this.setReverb(next);
    return next;
  }

  playProximity(id: string, trackName: string, roomId: string = 'city-street'): void {
    if (this.proximityPlayers.has(id)) return;
    
    console.log(`Starting proximity player for ${id} with track ${trackName}`);
    const p = new SpessaSynthPlayer(this.audioContext, this.effects.input);
    const sf2Url = `${BASE}music/global.sf2`;
    const midiUrl = `${BASE}music/${trackName}.mid`; 
    
    p.setVolume(0);
    
    // Use cached data to speed up proximity player starts
    Promise.all([
      this.getBinaryData(sf2Url, this.sf2Cache),
      this.getBinaryData(midiUrl, this.midiCache)
    ]).then(async ([sf2Data, midiData]) => {
      console.log(`Data loaded for proximity player ${id}`);
      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume();
      }
      await p.loadSoundFont(sf2Data);
      await p.playMIDI(midiData);
      p.resume();
      console.log(`MIDI ${trackName} playing for proximity player ${id}`);
    }).catch(err => console.error(`Failed to start proximity player ${id}:`, err));
    
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
    if (this.audioContext.state === 'running') {
      this.audioContext.suspend();
    }
  }

  resume(): void {
    this.audioContext.resume();
    this.player.resume();
    for (const p of this.proximityPlayers.values()) {
      p.resume();
    }
  }

  stop(): void {
    this.player.stop();
    for (const p of this.proximityPlayers.values()) {
      p.stop();
      p.destroy();
    }
    this.proximityPlayers.clear();
    this.currentRoom = null;
    this.currentTrackName = null;
    this.currentSf2Url = null;
  }

  destroy(): void {
    this.player.destroy();
    for (const p of this.proximityPlayers.values()) {
      p.destroy();
    }
    this.proximityPlayers.clear();
    this.currentRoom = null;
    this.audioContext.close();
  }
}

