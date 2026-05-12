import Phaser from 'phaser';
import { RoomManager } from '@systems/RoomManager';
import { RainEffect } from '@systems/RainEffect';
import { DrippingEffect } from '@systems/DrippingEffect';

export interface WeatherEffect {
  update(delta: number): void;
  show(): void;
  hide(): void;
  destroy(): void;
}

export class WeatherManager {
  private scene: Phaser.Scene;
  private current: WeatherEffect | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  updateForRoom(roomId: string): void {
    this.current?.destroy();
    this.current = null;

    const allRooms = RoomManager.getRoomsData().rooms;
    const roomDef = allRooms[roomId];
    if (!roomDef?.weather) return;

    switch (roomDef.weather) {
      case 'rain-mild':
        this.current = new RainEffect(this.scene, 'mild');
        break;
      case 'rain-hard':
        this.current = new RainEffect(this.scene, 'hard');
        break;
      case 'dripping':
        this.current = new DrippingEffect(this.scene, roomDef.drips ?? []);
        break;
    }

    this.current?.show();
  }

  update(delta: number): void {
    this.current?.update(delta);
  }

  destroy(): void {
    this.current?.destroy();
    this.current = null;
  }
}
