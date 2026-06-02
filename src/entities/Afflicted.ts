import Phaser from 'phaser';
import { Entity } from './Entity';
import { DEPTH, GAME_CONFIG } from '@utils/Constants';
import { AfflictedDef, AfflictedStatus, BehaviorLoop, ItemDef, ProduceEffect, Position } from '@/types';
import { MusicManager } from '@systems/MusicManager';
import { Direction } from './Direction';

const WANDER_SPEED      = 80;
const WANDER_PAUSE_MIN  = 1500;
const WANDER_PAUSE_MAX  = 4000;
const WANDER_RANGE      = 128;

const AGITATE_RANGE     = 240;  // px — player must be closer than this to trigger chase
const AGITATE_SPEED     = 300;  // px/s — chase speed (player is 320, can escape but must work for it)
const CALM_RANGE        = 480;  // px — agitated gives up chasing beyond this

const FRIGHTEN_SPEED    = 400;  // px/s — flee speed when panicked by flashlight
const FRIGHTEN_CALM     = 600;  // px — frightened calms down once this far from player

const SOUND_RADIUS      = 800;  // px — distance at which sound starts being audible

export class Afflicted extends Entity {
  private afflictedId: string;
  private residentName: string;
  private role: string;
  private status: AfflictedStatus;
  private behaviorLoop: BehaviorLoop;
  private wanderRadius: number;
  private speedMult: number;
  private variant: string;
  private origin: Position;
  private wanderTarget: Position | null = null;
  private wanderTimer?: Phaser.Time.TimerEvent;
  // pace
  private paceEndpointB: Position | null = null;
  private pacingToB: boolean = true;
  // circle
  private circleAngle: number = 0;
  private circleAngularSpeed: number = 0; // rad/s
  private baseScale: number;
  private currentDir: Direction = Direction.DOWN;
  private playerVariant: string | null;
  private associatedRoom: string | null;
  private curedClue: string | null;
  private backstory: string[];
  private recoveredItems: ItemDef[];
  private holds: ItemDef[];
  private conversationRequires: string | null;
  private conversationDialog: string[];
  private conversationProduces: ProduceEffect[];

  constructor(scene: Phaser.Scene, def: AfflictedDef, initialStatus: AfflictedStatus) {
    const variant = def.variant || 'walker';
    const texture = `afflicted-${variant}`;
    super(scene, def.x, def.y, texture, 0);
    
    this.baseScale = 1.0;
    this.setScale(this.baseScale);

    this.afflictedId    = def.id;
    this.residentName   = def.name;
    this.role           = def.role;
    this.behaviorLoop   = def.behaviorLoop;
    this.wanderRadius   = def.wanderRadius ?? WANDER_RANGE;
    this.speedMult      = def.speedMult ?? 1.0;
    this.status         = initialStatus;
    this.variant        = variant;
    this.playerVariant  = def.playerVariant || null;
    this.associatedRoom = def.associatedRoom || null;
    this.curedClue      = def.curedClue || null;
    this.backstory           = def.backstory || [];
    this.recoveredItems      = def.recoveredItems || [];
    this.holds               = def.holds || [];
    this.conversationRequires = def.conversationRequires || null;
    this.conversationDialog  = def.conversationDialog || [];
    this.conversationProduces = def.conversationProduces || [];
    this.origin         = { x: def.x, y: def.y };

    if (def.behaviorLoop === 'pace') {
      const angleRad = ((def.paceAngle ?? 0) * Math.PI) / 180;
      const length   = def.paceLength ?? 128;
      this.paceEndpointB = {
        x: this.origin.x + Math.cos(angleRad) * length,
        y: this.origin.y + Math.sin(angleRad) * length,
      };
    }

    if (def.behaviorLoop === 'circle') {
      this.circleAngle        = ((def.circleStartAngle ?? 0) * Math.PI) / 180;
      this.circleAngularSpeed = ((def.circleSpeed ?? 45) * Math.PI) / 180;
    }

    this.setDepth(DEPTH.ENTITIES);
    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(28, 24);
    body.setOffset(18, 38);
    body.setCollideWorldBounds(true);

    this.createAnimations();
    this.setupVisuals();

    // When spawning already-cured/recovered (room re-entry), apply the player texture
    // immediately. setStatus() handles this on live transitions but is never called here.
    if ((initialStatus === 'cured' || initialStatus === 'recovered') && this.playerVariant) {
      this.createCuredAnimations();
      this.setTexture(`player-${this.playerVariant}`, 0);
      this.play(`player-${this.playerVariant}-idle-${this.currentDir}`, true);
    }

    if (this.status === 'wandering') {
      this.startWandering();
    } else if (this.status === 'cured' || this.status === 'recovered') {
      this.stopMovement();
    }

    MusicManager.getInstance().playProximity(this.afflictedId, 'goblins', def.soundRoom ?? 'city-street');
  }

  private createAnimations(): void {
    const texture = `afflicted-${this.variant}`;
    const dirs: { key: Direction; row: number }[] = [
      { key: Direction.DOWN, row: 0 },
      { key: Direction.LEFT, row: 1 },
      { key: Direction.RIGHT, row: 2 },
      { key: Direction.UP, row: 3 },
    ];

    for (const { key, row } of dirs) {
      const start = row * 4;
      const walkKey = `${texture}-walk-${key}`;
      const idleKey = `${texture}-idle-${key}`;

      if (!this.scene.anims.exists(walkKey)) {
        this.scene.anims.create({
          key: walkKey,
          frames: this.scene.anims.generateFrameNumbers(texture, {
            frames: [start, start + 1, start + 2, start + 3],
          }),
          frameRate: 8,
          repeat: -1,
        });
      }

      if (!this.scene.anims.exists(idleKey)) {
        this.scene.anims.create({
          key: idleKey,
          frames: [{ key: texture, frame: start }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }
  }

  private setupVisuals(): void {
    const bs = this.baseScale;
    switch (this.status) {
      case 'wandering':
        this.setTint(0xaaaaff);
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
        this.setTint(0xffaaaa);
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
        this.setTint(0xffeebb);
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
        this.setTint(0xccffcc);
        break;
      case 'recovered':
        this.clearTint();
        break;
    }
  }

  private createCuredAnimations(): void {
    if (!this.playerVariant) return;
    const texture = `player-${this.playerVariant}`;
    const dirs: { key: Direction; row: number }[] = [
      { key: Direction.DOWN,  row: 0 },
      { key: Direction.LEFT,  row: 1 },
      { key: Direction.RIGHT, row: 2 },
      { key: Direction.UP,    row: 3 },
    ];
    for (const { key, row } of dirs) {
      const start = row * 4;
      const walkKey = `${texture}-walk-${key}`;
      const idleKey = `${texture}-idle-${key}`;
      if (!this.scene.anims.exists(walkKey)) {
        this.scene.anims.create({
          key: walkKey,
          frames: this.scene.anims.generateFrameNumbers(texture, { frames: [start, start + 1, start + 2, start + 3] }),
          frameRate: 8,
          repeat: -1,
        });
      }
      if (!this.scene.anims.exists(idleKey)) {
        this.scene.anims.create({
          key: idleKey,
          frames: [{ key: texture, frame: start }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }
  }

  private updateAnimation(): void {
    const body = this.body as Phaser.Physics.Arcade.Body;
    const usePlayerSprite = (this.status === 'cured' || this.status === 'recovered') && this.playerVariant;
    const texture = usePlayerSprite ? `player-${this.playerVariant}` : `afflicted-${this.variant}`;

    if (body.velocity.x !== 0 || body.velocity.y !== 0) {
      if (Math.abs(body.velocity.y) >= Math.abs(body.velocity.x)) {
        this.currentDir = body.velocity.y < 0 ? Direction.UP : Direction.DOWN;
      } else {
        this.currentDir = body.velocity.x < 0 ? Direction.LEFT : Direction.RIGHT;
      }
      this.play(`${texture}-walk-${this.currentDir}`, true);
    } else {
      this.play(`${texture}-idle-${this.currentDir}`, true);
    }
  }

  private startWandering(): void {
    this.pickWanderTarget();
  }

  private pickWanderTarget(): void {
    // pace, sentinel, and circle manage their own movement — no random target needed
    if (this.behaviorLoop === 'pace' || this.behaviorLoop === 'sentinel' || this.behaviorLoop === 'circle') return;
    const angle  = Math.random() * Math.PI * 2;
    const radius = this.behaviorLoop === 'drift' ? this.wanderRadius * 3 : this.wanderRadius;
    const dist   = Math.random() * radius;
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
    if (this.status === 'cured' || this.status === 'recovered') {
      this.updateAnimation();
      return;
    }

    const dist = Phaser.Math.Distance.Between(this.x, this.y, playerX, playerY);
    const body = this.body as Phaser.Physics.Arcade.Body;

    // ── Proximity Sound ─────────────────────────────────────────────────────
    const vol = Math.max(0, 1 - dist / SOUND_RADIUS);
    if (vol > 0) {
      MusicManager.getInstance().updateProximityVolume(this.afflictedId, vol);
    } else {
      MusicManager.getInstance().updateProximityVolume(this.afflictedId, 0);
    }

    // ── State transitions ────────────────────────────────────────────────────
    // Drift afflicted never agitate — they ignore the player entirely
    if (this.status === 'wandering' && dist < AGITATE_RANGE && this.behaviorLoop !== 'drift') {
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
      body.setVelocity(Math.cos(angle) * AGITATE_SPEED * this.speedMult, Math.sin(angle) * AGITATE_SPEED * this.speedMult);
      this.updateAnimation();
      return;
    }

    if (this.status === 'frightened') {
      // Flee from the player
      const angle = Phaser.Math.Angle.Between(playerX, playerY, this.x, this.y);
      body.setVelocity(Math.cos(angle) * FRIGHTEN_SPEED * this.speedMult, Math.sin(angle) * FRIGHTEN_SPEED * this.speedMult);
      this.updateAnimation();
      return;
    }

    // ── Wandering ────────────────────────────────────────────────────────────
    if (this.behaviorLoop === 'sentinel') {
      body.setVelocity(0, 0);
      this.updateAnimation();
      return;
    }

    if (this.behaviorLoop === 'pace' && this.paceEndpointB) {
      const target = this.pacingToB ? this.paceEndpointB : this.origin;
      const d = Phaser.Math.Distance.Between(this.x, this.y, target.x, target.y);
      if (d < 6) {
        this.pacingToB = !this.pacingToB;
      } else {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, target.x, target.y);
        body.setVelocity(Math.cos(angle) * WANDER_SPEED * this.speedMult, Math.sin(angle) * WANDER_SPEED * this.speedMult);
      }
      this.updateAnimation();
      return;
    }

    if (this.behaviorLoop === 'circle') {
      const delta = this.scene.game.loop.delta / 1000;
      this.circleAngle += this.circleAngularSpeed * delta;
      const tx = this.origin.x + Math.cos(this.circleAngle) * this.wanderRadius;
      const ty = this.origin.y + Math.sin(this.circleAngle) * this.wanderRadius;
      const steerAngle = Phaser.Math.Angle.Between(this.x, this.y, tx, ty);
      const steerDist  = Phaser.Math.Distance.Between(this.x, this.y, tx, ty);
      // Arc speed + correction term to pull back onto the orbit after any collision
      const arcSpeed = this.wanderRadius * this.circleAngularSpeed * this.speedMult;
      body.setVelocity(Math.cos(steerAngle) * (arcSpeed + steerDist * 4), Math.sin(steerAngle) * (arcSpeed + steerDist * 4));
      this.updateAnimation();
      return;
    }

    if (this.wanderTarget) {
      const d = Phaser.Math.Distance.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
      if (d < 4) {
        body.setVelocity(0, 0);
        this.wanderTarget = null;
        if (this.behaviorLoop === 'drift') {
          // No pause — immediately pick the next target
          this.pickWanderTarget();
        } else {
          const pause = WANDER_PAUSE_MIN + Math.random() * (WANDER_PAUSE_MAX - WANDER_PAUSE_MIN);
          this.wanderTimer = this.scene.time.delayedCall(pause, () => {
            if (this.active && this.status === 'wandering') this.pickWanderTarget();
          });
        }
      } else {
        const angle = Phaser.Math.Angle.Between(this.x, this.y, this.wanderTarget.x, this.wanderTarget.y);
        body.setVelocity(Math.cos(angle) * WANDER_SPEED * this.speedMult, Math.sin(angle) * WANDER_SPEED * this.speedMult);
      }
    }
    this.updateAnimation();
  }

  setStatus(newStatus: AfflictedStatus): void {
    if (this.status === newStatus) return;
    // Sentinels are not frightened by light — they only react to proximity
    if (newStatus === 'frightened' && this.behaviorLoop === 'sentinel') return;
    this.status = newStatus;
    this.scene.tweens.killTweensOf(this);
    this.setScale(this.baseScale);
    this.stopMovement();

    if (newStatus === 'cured' || newStatus === 'recovered') {
      MusicManager.getInstance().stopProximity(this.afflictedId);
      if (this.playerVariant) {
        this.setTexture(`player-${this.playerVariant}`, 0);
        this.createCuredAnimations();
        this.play(`player-${this.playerVariant}-idle-${this.currentDir}`, true);
      }
    }

    this.setupVisuals();

    if (newStatus === 'wandering') {
      this.startWandering();
    }
  }

  destroy(fromScene?: boolean): void {
    MusicManager.getInstance().stopProximity(this.afflictedId);
    super.destroy(fromScene);
  }

  getStatus():         AfflictedStatus  { return this.status;         }
  getId():             string           { return this.afflictedId;    }
  getName():           string           { return this.residentName;   }
  getRole():           string           { return this.role;           }
  getPlayerVariant():  string | null    { return this.playerVariant;  }
  getAssociatedRoom(): string | null    { return this.associatedRoom; }
  getCuredClue():      string | null    { return this.curedClue;      }
  getBackstory():      string[]         { return this.backstory;      }
  getRecoveredItems():      ItemDef[]        { return this.recoveredItems;       }
  getHolds():               ItemDef[]        { return this.holds;                }
  getConversationRequires():string | null    { return this.conversationRequires; }
  getConversationDialog():  string[]         { return this.conversationDialog;   }
  getConversationProduces():ProduceEffect[]  { return this.conversationProduces; }
}
