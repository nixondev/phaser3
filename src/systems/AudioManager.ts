import Phaser from 'phaser';
import { debug } from '@utils/Debug';

export class AudioManager {
  private static instance: AudioManager;
  private scene: Phaser.Scene | null = null;
  private currentMusicKey: string | null = null;
  private currentMusic: Phaser.Sound.BaseSound | null = null;
  private volume: number = 1.0;
  private readonly MAX_ACTUAL_VOLUME = 0.3;

  private constructor() {}

  static getInstance(): AudioManager {
    if (!AudioManager.instance) {
      AudioManager.instance = new AudioManager();
    }
    return AudioManager.instance;
  }

  setScene(scene: Phaser.Scene): void {
    this.scene = scene;
    // Apply initial volume to the sound manager (scaled by MAX_ACTUAL_VOLUME)
    this.scene.sound.volume = this.volume * this.MAX_ACTUAL_VOLUME;
  }

  setVolume(value: number): void {
    this.volume = Phaser.Math.Clamp(value, 0, 1);
    if (this.scene) {
      this.scene.sound.volume = this.volume * this.MAX_ACTUAL_VOLUME;
    }
    debug('User volume set to:', this.volume, 'Actual volume:', this.volume * this.MAX_ACTUAL_VOLUME);
  }

  getVolume(): number {
    return this.volume;
  }

  playMusic(key: string, loop: boolean = true): void {
    if (!this.scene) return;
    if (this.currentMusicKey === key) return;

    debug('Playing music:', key);

    // Stop current music
    this.stopMusic();

    try {
      if (this.scene.cache.audio.exists(key)) {
        // We use 1.0 here because the global volume is handled by this.scene.sound.volume
        this.currentMusic = this.scene.sound.add(key, { loop, volume: 1.0 });
        this.currentMusic.play();
        this.currentMusicKey = key;
      } else {
        debug('Music key not found in cache:', key);
      }
    } catch (e) {
      console.error('Error playing music:', e);
    }
  }

  stopMusic(): void {
    if (this.currentMusic) {
      this.currentMusic.stop();
      this.currentMusic.destroy();
      this.currentMusic = null;
    }
    this.currentMusicKey = null;
  }
}
