import Phaser from 'phaser';
import { RoomManager } from '@systems/RoomManager';
import { RainEffect } from '@systems/RainEffect';
import { DrippingEffect } from '@systems/DrippingEffect';
import { CloudEffect } from '@systems/CloudEffect';
import type { WeatherType } from '@/types';

export interface WeatherEffect {
  update(delta: number): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export class WeatherManager {
  private scene: Phaser.Scene;
  private effects: WeatherEffect[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  updateForRoom(roomId: string): void {
    this.effects.forEach(e => e.destroy());
    this.effects = [];

    const allRooms = RoomManager.getRoomsData().rooms;
    const roomDef = allRooms[roomId];
    if (!roomDef?.weather) return;

    const types: WeatherType[] = Array.isArray(roomDef.weather)
      ? roomDef.weather
      : [roomDef.weather];

    for (const type of types) {
      let effect: WeatherEffect | null = null;
      switch (type) {
        case 'rain-mild': effect = new RainEffect(this.scene, 'mild'); break;
        case 'rain-hard': effect = new RainEffect(this.scene, 'hard'); break;
        case 'dripping':  effect = new DrippingEffect(this.scene, roomDef.drips ?? []); break;
        case 'clouds':    effect = new CloudEffect(this.scene); break;
      }
      if (effect) {
        effect.show();
        this.effects.push(effect);
      }
    }
  }

  update(delta: number): void {
    this.effects.forEach(e => e.update(delta));
  }

  destroy(): void {
    this.effects.forEach(e => e.destroy());
    this.effects = [];
  }
}
