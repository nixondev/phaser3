import Phaser from 'phaser';
import { Entity } from './Entity';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';
import { AfflictedDef, AfflictedStatus, Position } from '@/types';
import { MusicManager } from '@systems/MusicManager';

const WANDER_SPEED      = 20;
const WANDER_PAUSE_MIN  = 1500;
const WANDER_PAUSE_MAX  = 4000;
const WANDER_RANGE      = 32;

const AGITATE_RANGE     = 60;   // px — player must be closer than this to trigger chase
const AGITATE_SPEED     = 75;   // px/s — chase speed (player is 80, can escape but must work for it)
const CALM_RANGE        = 120;  // px — agitated gives up chasing beyond this

const FRIGHTEN_SPEED    = 100;  // px/s — flee speed when panicked by flashlight
const FRIGHTEN_CALM     = 150;  // px — frightened calms down once this far from player

const SOUND_RADIUS      = 200;  // px — distance at which sound starts being audible

export class Afflicted extends Entity {
  private afflictedId: string;
  private residentName: string;
  private role: string;
  private status: AfflictedStatus;
  private behaviorLoop: string;
  private origin: Position;
  private wanderTarget: Position | null = null;
  private wanderTimer?: Phaser.Time.TimerEvent;
  private baseScale: number;

  constructor(scene: Phaser.Scene, def: AfflictedDef, initialStatus: AfflictedStatus) {
    super(scene, def.x, def.y, 'tileset-sprites', 10);
    
    this.baseScale = GAME_CONFIG.ENTITY_SCALE / GAME_CONFIG.ASSET_SCALE;

    this.afflictedId  = def.id;
    this.residentName = def.name;
    this.role         = def.role;
    this.behaviorLoop = def.behaviorLoop;
    this.status       = initialStatus;
    this.origin       = { x: def.x, y: def.y };

    this.setDepth(DEPTH.ENTITIES);
    const body = this.body as Phaser.Physics.Arcade.Body;
    const invScale = GAME_CONFIG.ASSET_SCALE / GAME_CONFIG.ENTITY_SCALE;
    body.setSize(12 * invScale, 12 * invScale);
    body.setOffset(2 * invScale, 2 * invScale);
    body.setCollideWorldBounds(true);

    this.setupVisuals();

    if (this.status === 'wandering') {
      this.startWandering();
    } else if (this.status === 'cured' || this.status === 'recovered') {
      this.stopMovement();
    }

    MusicManager.getInstance().playProximity(this.afflictedId, 'goblins');
  }

  private setupVisuals(): void {
    const bs = this.baseScale;
    switch (this.status) {
      case 'wandering':
        this.setTint(0x8888cc);
        this.scene.tweens.add({
          targets: this,
          scaleX: { from: bs, to: bs * 1.05 },
          scaleY: { from: bs, to: bs * 0.95 },
          duration: 600,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      case 'agitated':
        this.setTint(0xcc4444);
        this.scene.tweens.add({
          targets: this,
          scaleX: { from: bs, to: bs * 1.12 },
          scaleY: { from: bs, to: bs * 0.88 },
          duration: 200,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      case 'frightened':
        this.setTint(0xddaa22);
        this.scene.tweens.add({
          targets: this,
          scaleX: { from: bs * 0.9, to: bs * 1.1 },
          scaleY: { from: bs * 1.1, to: bs * 0.9 },
          duration: 120,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
        break;
      case 'cured':
        this.setTint(0xaaccaa);
        break;
      case 'recovered':
        this.clearTint();
        break;
    }
  }

  private startWandering(): void {
    this.pickWanderTarget();
  }

  private pickWanderTarget(): void {
    const angle = Math.random() * Math.PI * 2;
    const dist  = Math.random() * WANDER_RANGE;
    this.wanderTarget = {
      x: this.origin.x + Math.cos(angle) * dist,
      y: this.origin.y + Math.sin(angle) * dist,
    };
  }

  private stopMovement(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0, 0);
    this.wanderTarget = null;
    if (this.wanderTimer) {
      this.wanderTimer.destroy();
      this.wanderTimer = undefined;
    }
  }

  updateAI(playerX: number, playerY: number): void {
    if (this.status === 'cured' || this.status === 'recovered') return;

    const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const body = this.body as Phaser.Physics.Arcade.Body;

    // ── Proximity Sound ─────────────────────────────────────────────────────
    const vol = Math.max(0, 1 - dist / SOUND_RADIUS);
    MusicManager.getInstance().updateProximityVolume(this.afflictedId, vol);

    // ── State transitions ────────────────────────────────────────────────────
    if (this.status === 'wandering' && dist < AGITATE_RANGE) {
      this.setStatus('agitated');
      return;
    }

    if (this.status === 'agitated' && dist >= CALM_RANGE) {
      this.setStatus('wandering');
      return;
    }

    if (this.status === 'frightened' && dist >= FRIGHTEN_CALM) {
      this.setStatus('wandering');
      return;
    }

    // ── Behavior per state ───────────────────────────────────────────────────
    if (this.status === 'agitated') {
      // Chase the player
      const angle = Phaser.Math.Angle.Between(this.x, this.y, playerX, playerY);
      body.setVelocity(Math.cos(angle) * AGITATE_SPEED, Math.sin(angle) * AGITATE_SPEED);
      return;
    }

    if (this.status === 'frightened') {
      // Flee from the player
      const angle = Phaser.Math.Angle.Between(playerX, playerY, this.x, this.y);
      body.setVelocity(Math.cos(angle) * FRIGHTEN_SPEED, Math.sin(angle) * FRIGHTEN_SPEED);
      return;
    }

    // ── Wandering ────────────────────────────────────────────────────────────
    if (this.wanderTarget) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
      if (d < 4) {
        body.setVelocity(0, 0);
        this.wanderTarget = null;
        const pause = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN);
        this.wanderTimer = this.scene.time.delayedCall(pause, () => {
          if (this.active && this.status === 'wandering') this.pickWanderTarget();
        });
      } else {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        body.setVelocity(Math.cos(angle) * WANDER_SPEED, Math.sin(angle) * WANDER_SPEED);
      }
    }
  }

  setStatus(newStatus: AfflictedStatus): void {
    if (this.status === newStatus) return;
    this.status = newStatus;
    this.scene.tweens.killTweensOf(this);
    this.setScale(this.baseScale);
    this.stopMovement();
    this.setupVisuals();

    if (newStatus === 'wandering') {
      this.startWandering();
    }
  }

  destroy(fromScene?: boolean): void {
    MusicManager.getInstance().stopProximity(this.afflictedId);
    super.destroy(fromScene);
  }

  getStatus():  AfflictedStatus { return this.status;       }
  getId():      string          { return this.afflictedId;  }
  getName():    string          { return this.residentName; }
  getRole():    string          { return this.role;         }
}
