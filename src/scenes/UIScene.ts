import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, INVENTORY_CONFIG } from '@utils/Constants';
import { ItemDef, CharacterState } from '@/types';
import { resolveTileSprite } from '@utils/TilesetResolver';
import { GameScene } from './GameScene';

const COLS = INVENTORY_CONFIG.COLS;
const ROWS = INVENTORY_CONFIG.ROWS;
const SS = INVENTORY_CONFIG.SLOT_SIZE;

const GRID_X = GAME_CONFIG.WIDTH - COLS * SS - 16;
const GRID_Y = 16;

export class UIScene extends Phaser.Scene {
  private roomNameText!: Phaser.GameObjects.Text;
  private roomNameTween?: Phaser.Tweens.Tween;
  private interactPrompt!: Phaser.GameObjects.Text;
  private dialogBox!: Phaser.GameObjects.Container;
  private dialogText!: Phaser.GameObjects.Text;
  private batteryBar!: Phaser.GameObjects.Graphics;
  private batteryLabel!: Phaser.GameObjects.Text;
  private lastBatteryPercent = 100;

  // Inventory grid
  private slotBgs: Phaser.GameObjects.Rectangle[] = [];
  private slotIcons: (Phaser.GameObjects.Sprite | null)[] = [];
  private cursorRect!: Phaser.GameObjects.Rectangle;
  private itemNameText!: Phaser.GameObjects.Text;
  private invModeText!: Phaser.GameObjects.Text;
  private currentInventory: (ItemDef | null)[] = new Array(COLS * ROWS).fill(null);
  private isInvMode = false;

  // Avatar bar
  private avatarContainer!: Phaser.GameObjects.Container;
  private avatarSprites: Phaser.GameObjects.Sprite[] = [];
  private avatarHighlight!: Phaser.GameObjects.Rectangle;
  private rosterData: CharacterState[] = [];
  private activeCharacterId = '';

  constructor() {
    super(SCENES.UI);
  }

  create(): void {
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    // Room name
    this.roomNameText = this.add
      .text(w / 2, 80, '', { fontSize: '40px', color: '#ffffff', fontFamily: 'monospace' })
      .setOrigin(0.5).setAlpha(0);

    // Interact prompt
    this.interactPrompt = this.add
      .text(w / 2, h - 160, 'E', {
        fontSize: '32px', color: '#ffffff', fontFamily: 'monospace',
        backgroundColor: '#00000088', padding: { x: 24, y: 12 },
      })
      .setOrigin(0.5).setVisible(false);
    this.tweens.add({ targets: this.interactPrompt, alpha: { from: 1, to: 0.5 }, duration: 600, yoyo: true, repeat: -1 });

    // Dialog box
    const boxH = 240;
    const boxY = h - boxH / 2 - 32;
    const bg = this.add.rectangle(w / 2, boxY, w - 64, boxH, 0x111133, 0.85).setStrokeStyle(8, 0x4488cc);
    this.dialogText = this.add.text(64, boxY - boxH / 2 + 32, '', {
      fontSize: '36px', color: '#ffffff', fontFamily: 'monospace', lineSpacing: 16, wordWrap: { width: w - 160 },
    });
    const hint = this.add.text(w - 64, boxY + boxH / 2 - 24, '[E / ESC]', {
      fontSize: '28px', color: '#8888aa', fontFamily: 'monospace',
    }).setOrigin(1, 1);
    this.dialogBox = this.add.container(0, 0, [bg, this.dialogText, hint]).setVisible(false);

    // â”€â”€ Battery Bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.batteryLabel = this.add.text(16, 16, 'PWR', { fontSize: '24px', color: '#8888aa', fontFamily: 'monospace' }).setVisible(false);
    this.batteryBar = this.add.graphics().setVisible(false);
    this.drawBattery(100);

    // â”€â”€ Inventory grid â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = GRID_X + c * SS + SS / 2;
        const y = GRID_Y + r * SS + SS / 2;
        this.slotBgs.push(
          this.add.rectangle(x, y, SS - 1, SS - 1, 0x1a1a2e, 0.75).setStrokeStyle(1, 0x333355)
        );
        this.slotIcons.push(null);
      }
    }

    // Cursor
    this.cursorRect = this.add.rectangle(0, 0, SS - 1, SS - 1)
      .setStrokeStyle(8, 0xffdd44).setFillStyle(0xffdd44, 0.12).setVisible(false);

    // Item name + hints
    this.itemNameText = this.add.text(GRID_X, GRID_Y + ROWS * SS + 8, '', {
      fontSize: '28px', color: '#aaaacc', fontFamily: 'monospace',
    });
    this.invModeText = this.add.text(GRID_X + (COLS * SS) / 2, GRID_Y + ROWS * SS + 40, '', {
      fontSize: '24px', color: '#666688', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.updateInvHint();

    // â”€â”€ Avatar bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    this.avatarContainer = this.add.container(0, 0);
    this.avatarHighlight = this.add.rectangle(0, 0, 72, 72)
      .setStrokeStyle(4, 0xffdd44).setFillStyle(0, 0).setVisible(false);
    this.avatarContainer.add(this.avatarHighlight);

    // â”€â”€ Events â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const gs = this.scene.get(SCENES.GAME) as GameScene;

    // Mobile controls
    if (!this.sys.game.device.os.desktop) {
      const inputManager = gs.getInputManager();
      const padX = 160;
      const padY = h - 160;
      const btnSize = 120;
      const spacing = 16;

      // D-Pad
      const createDPadBtn = (x: number, y: number, key: string, label: string) => {
        const btn = this.add.rectangle(x, y, btnSize, btnSize, 0xffffff, 0.1)
          .setStrokeStyle(4, 0xffffff, 0.2)
          .setInteractive({ useHandCursor: true });
        this.add.text(x, y, label, { fontSize: '40px', color: '#ffffff' }).setOrigin(0.5).setAlpha(0.3);

        btn.on('pointerdown', () => inputManager.setVirtualInput(key as any, true));
        btn.on('pointerup', () => inputManager.setVirtualInput(key as any, false));
        btn.on('pointerout', () => inputManager.setVirtualInput(key as any, false));
        return btn;
      };

      createDPadBtn(padX, padY - btnSize - spacing, 'up', '↑');
      createDPadBtn(padX, padY + btnSize + spacing, 'down', '↓');
      createDPadBtn(padX - btnSize - spacing, padY, 'left', '←');
      createDPadBtn(padX + btnSize + spacing, padY, 'right', '→');

      // Action Buttons
      const createActionBtn = (x: number, y: number, key: string, label: string, color = 0xffffff) => {
        const btn = this.add.circle(x, y, btnSize / 1.6, color, 0.15)
          .setStrokeStyle(4, color, 0.3)
          .setInteractive({ useHandCursor: true });
        this.add.text(x, y, label, { fontSize: '28px', color: '#ffffff', fontFamily: 'monospace' }).setOrigin(0.5).setAlpha(0.6);

        btn.on('pointerdown', () => {
          inputManager.setVirtualInput(key as any, true);
          // Auto-release for tap-style actions
          this.time.delayedCall(50, () => inputManager.setVirtualInput(key as any, false));
        });
        return btn;
      };

      const actX = w - 160;
      const actY = h - 160;
      createActionBtn(actX, actY - 128, 'action', 'E', 0x4488cc);      // Interact
      createActionBtn(actX - 128, actY, 'flashlight', 'F', 0xffdd44);  // Flashlight
      createActionBtn(actX, actY, 'inventory', 'TAB', 0x8888aa);       // Inventory
      createActionBtn(actX + 128, actY, 'drop', 'Q', 0xcc4444);        // Drop
    }

    gs.events.on('room-changed', this.showRoomName, this);
    gs.events.on('show-interact-prompt', () => this.interactPrompt.setVisible(true), this);
    gs.events.on('hide-interact-prompt', () => this.interactPrompt.setVisible(false), this);
    gs.events.on('dialog-open', this.showDialog, this);
    gs.events.on('dialog-close', this.hideDialog, this);
    gs.events.on('inventory-changed', this.onInventoryChanged, this);
    gs.events.on('inventory-mode', this.onInventoryMode, this);
    gs.events.on('inventory-cursor', this.onInventoryCursor, this);
    gs.events.on('door-unlocked', this.onDoorUnlocked, this);
    gs.events.on('flashlight-battery', this.drawBattery, this);
    gs.events.on('roster-changed', this.onRosterChanged, this);
    gs.events.on('character-switched', this.onCharacterSwitched, this);
  }

  // â”€â”€ Inventory rendering â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private refreshInventoryIcons(): void {
    for (let i = 0; i < COLS * ROWS; i++) {
      if (this.slotIcons[i]) { this.slotIcons[i]!.destroy(); this.slotIcons[i] = null; }
      const item = this.currentInventory[i];
      if (item) {
        const bg = this.slotBgs[i];
        if (item.spriteKey) {
          this.slotIcons[i] = this.add.sprite(bg.x, bg.y, item.spriteKey).setDisplaySize(SS - 4, SS - 4);
        } else {
          const r = resolveTileSprite(item.tileFrame, item.tilesetKey);
          this.slotIcons[i] = this.add.sprite(bg.x, bg.y, r.key, r.frame).setDisplaySize(SS - 4, SS - 4);
        }
      }
    }
  }

  private getCursorPos(slot: number): { x: number; y: number; w: number } {
    const col = slot % COLS;
    const row = Math.floor(slot / COLS);
    return { x: GRID_X + col * SS + SS / 2, y: GRID_Y + row * SS + SS / 2, w: SS - 1 };
  }

  private updateInvHint(): void {
    if (this.isInvMode) {
      this.invModeText.setText('E:use Q:drop');
      this.invModeText.setColor('#ffdd88');
    } else {
      this.invModeText.setText('TAB:inventory');
      this.invModeText.setColor('#555566');
    }
  }

  // â”€â”€ Event handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private showRoomName(name: string): void {
    this.roomNameText.setText(name).setAlpha(1);
    if (this.roomNameTween) this.roomNameTween.destroy();
    this.roomNameTween = this.tweens.add({ targets: this.roomNameText, alpha: 0, delay: 2000, duration: 500 });
  }

  private showDialog(text: string): void {
    this.dialogText.setText(text);
    this.dialogBox.setVisible(true);
    this.interactPrompt.setVisible(false);
  }

  private hideDialog(): void {
    this.dialogBox.setVisible(false);
  }

  private onInventoryChanged(inventory: (ItemDef | null)[]): void {
    this.currentInventory = inventory;
    this.refreshInventoryIcons();
    // Update battery visibility
    this.drawBattery(this.lastBatteryPercent);
  }

  private onInventoryMode(active: boolean): void {
    this.isInvMode = active;
    this.cursorRect.setVisible(active);
    this.updateInvHint();
    if (!active) this.itemNameText.setText('');
  }

  private onInventoryCursor(slot: number): void {
    const pos = this.getCursorPos(slot);
    this.cursorRect.setPosition(pos.x, pos.y);
    this.cursorRect.setSize(pos.w, pos.w);

    const item = this.currentInventory[slot] ?? null;
    this.itemNameText.setText(item ? item.name : '');
  }

  private onDoorUnlocked(): void {
    this.roomNameText.setText('Door unlocked!').setAlpha(1);
    if (this.roomNameTween) this.roomNameTween.destroy();
    this.roomNameTween = this.tweens.add({ targets: this.roomNameText, alpha: 0, delay: 1200, duration: 400 });
  }

  private onRosterChanged(roster: CharacterState[]): void {
    this.rosterData = roster;
    // Destroy old avatar sprites
    this.avatarSprites.forEach(s => s.destroy());
    this.avatarSprites = [];

    const AVATAR_SIZE = 72;
    const AVATAR_GAP = 8;
    const AVATAR_X = 16;
    const AVATAR_Y = 864;

    roster.forEach((char, i) => {
      const x = AVATAR_X + i * (AVATAR_SIZE + AVATAR_GAP) + AVATAR_SIZE / 2;
      const y = AVATAR_Y + AVATAR_SIZE / 2;
      const sprite = this.add.sprite(x, y, char.textureKey, 0)
        .setScale(4.0)
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        const gs = this.scene.get(SCENES.GAME) as GameScene;
        gs.getInputManager().setVirtualInput(`char${i + 1}` as any, true);
        this.time.delayedCall(50, () => gs.getInputManager().setVirtualInput(`char${i + 1}` as any, false));
      });
      this.avatarSprites.push(sprite);
      this.avatarContainer.add(sprite);
    });

    // Move highlight to active character
    this.updateAvatarHighlight(this.activeCharacterId);
  }

  private onCharacterSwitched(id: string): void {
    this.activeCharacterId = id;
    this.updateAvatarHighlight(id);
    
    // Character switch also changes inventory, update battery visibility
    this.drawBattery(this.lastBatteryPercent);
  }

  private updateAvatarHighlight(activeId?: string): void {
    if (this.rosterData.length === 0) {
      this.avatarHighlight.setVisible(false);
      return;
    }

    const AVATAR_SIZE = 72;
    const AVATAR_GAP = 8;
    const AVATAR_X = 16;
    const AVATAR_Y = 864;

    const idx = activeId
      ? this.rosterData.findIndex(c => c.id === activeId)
      : 0;

    if (idx < 0) return;

    const x = AVATAR_X + idx * (AVATAR_SIZE + AVATAR_GAP) + AVATAR_SIZE / 2;
    const y = AVATAR_Y + AVATAR_SIZE / 2;
    this.avatarHighlight.setPosition(x, y).setVisible(true);
  }

  private drawBattery(percent: number): void {
    this.lastBatteryPercent = percent;
    const hasFlashlight = this.currentInventory.some(item => item?.keyId === 'flashlight');
    this.batteryBar.setVisible(hasFlashlight);
    this.batteryLabel.setVisible(hasFlashlight);

    if (!hasFlashlight) return;

    this.batteryBar.clear();
    const w = 160;
    const h = 16;
    const x = 80;
    const y = 24;

    // Background
    this.batteryBar.fillStyle(0x333333, 0.8);
    this.batteryBar.fillRect(x, y, w, h);

    // Fill
    const color = percent > 20 ? 0x44ff44 : 0xff4444;
    this.batteryBar.fillStyle(color, 1);
    const fillWidth = (w * Math.max(0, percent)) / 100;
    this.batteryBar.fillRect(x, y, fillWidth, h);

    // Border
    this.batteryBar.lineStyle(4, 0x666666);
    this.batteryBar.strokeRect(x, y, w, h);
  }
}




