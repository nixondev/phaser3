import Phaser from 'phaser';
import { SCENES, GAME_CONFIG, INVENTORY_CONFIG } from '@utils/Constants';
import { ItemDef, CharacterState } from '@/types';

const COLS = INVENTORY_CONFIG.COLS;
const ROWS = INVENTORY_CONFIG.ROWS;
const SS = INVENTORY_CONFIG.SLOT_SIZE;

const GRID_X = GAME_CONFIG.WIDTH - COLS * SS - 4;
const GRID_Y = 4;

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

  constructor() {
    super(SCENES.UI);
  }

  create(): void {
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    // Room name
    this.roomNameText = this.add
      .text(w / 2, 20, '', { fontSize: '10px', color: '#ffffff', fontFamily: 'monospace' })
      .setOrigin(0.5).setAlpha(0);

    // Interact prompt
    this.interactPrompt = this.add
      .text(w / 2, h - 80, '[ E ]', {
        fontSize: '8px', color: '#ffdd44', fontFamily: 'monospace',
        backgroundColor: '#00000088', padding: { x: 6, y: 3 },
      })
      .setOrigin(0.5).setVisible(false);
    this.tweens.add({ targets: this.interactPrompt, alpha: { from: 1, to: 0.5 }, duration: 600, yoyo: true, repeat: -1 });

    // Dialog box
    const boxH = 60;
    const boxY = h - boxH / 2 - 8;
    const bg = this.add.rectangle(w / 2, boxY, w - 16, boxH, 0x111133, 0.92).setStrokeStyle(2, 0x4488cc);
    this.dialogText = this.add.text(16, boxY - boxH / 2 + 8, '', {
      fontSize: '9px', color: '#ffffff', fontFamily: 'monospace', lineSpacing: 4, wordWrap: { width: w - 40 },
    });
    const hint = this.add.text(w - 16, boxY + boxH / 2 - 6, '[E / ESC]', {
      fontSize: '7px', color: '#8888aa', fontFamily: 'monospace',
    }).setOrigin(1, 1);
    this.dialogBox = this.add.container(0, 0, [bg, this.dialogText, hint]).setVisible(false);

    // ── Battery Bar ───────────────────────────────────────────────────────
    this.batteryLabel = this.add.text(4, 4, 'PWR', { fontSize: '6px', color: '#8888aa', fontFamily: 'monospace' }).setVisible(false);
    this.batteryBar = this.add.graphics().setVisible(false);
    this.drawBattery(100);

    // ── Inventory grid ────────────────────────────────────────────────────
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
      .setStrokeStyle(2, 0xffdd44).setFillStyle(0xffdd44, 0.12).setVisible(false);

    // Item name + hints
    this.itemNameText = this.add.text(GRID_X, GRID_Y + ROWS * SS + 2, '', {
      fontSize: '7px', color: '#aaaacc', fontFamily: 'monospace',
    });
    this.invModeText = this.add.text(GRID_X + (COLS * SS) / 2, GRID_Y + ROWS * SS + 10, '', {
      fontSize: '6px', color: '#666688', fontFamily: 'monospace',
    }).setOrigin(0.5, 0);
    this.updateInvHint();

    // ── Avatar bar ────────────────────────────────────────────────────────
    this.avatarContainer = this.add.container(0, 0);
    this.avatarHighlight = this.add.rectangle(0, 0, 16, 16)
      .setStrokeStyle(1, 0xffdd44).setFillStyle(0, 0).setVisible(false);
    this.avatarContainer.add(this.avatarHighlight);

    // ── Events ────────────────────────────────────────────────────────────
    const gs = this.scene.get(SCENES.GAME);
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

  // ── Inventory rendering ─────────────────────────────────────────────────

  private refreshInventoryIcons(): void {
    for (let i = 0; i < COLS * ROWS; i++) {
      if (this.slotIcons[i]) { this.slotIcons[i]!.destroy(); this.slotIcons[i] = null; }
      const item = this.currentInventory[i];
      if (item) {
        const bg = this.slotBgs[i];
        this.slotIcons[i] = item.spriteKey
          ? this.add.sprite(bg.x, bg.y, item.spriteKey).setDisplaySize(SS - 4, SS - 4)
          : this.add.sprite(bg.x, bg.y, 'tileset-sprites', item.tileFrame).setDisplaySize(SS - 4, SS - 4);
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

  // ── Event handlers ──────────────────────────────────────────────────────

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

    const AVATAR_SIZE = 14;
    const AVATAR_GAP = 2;
    const AVATAR_X = 4;
    const AVATAR_Y = 218;

    roster.forEach((char, i) => {
      const x = AVATAR_X + i * (AVATAR_SIZE + AVATAR_GAP) + AVATAR_SIZE / 2;
      const y = AVATAR_Y + AVATAR_SIZE / 2;
      const sprite = this.add.sprite(x, y, char.textureKey, 0)
        .setDisplaySize(AVATAR_SIZE, AVATAR_SIZE)
        .setInteractive({ useHandCursor: true });
      sprite.on('pointerdown', () => {
        this.scene.get(SCENES.GAME).events.emit('character-switch-request', char.id);
      });
      this.avatarSprites.push(sprite);
      this.avatarContainer.add(sprite);
    });

    // Move highlight to active character
    this.updateAvatarHighlight();
  }

  private onCharacterSwitched(id: string): void {
    this.updateAvatarHighlight(id);
    
    // Character switch also changes inventory, update battery visibility
    this.drawBattery(this.lastBatteryPercent);
  }

  private updateAvatarHighlight(activeId?: string): void {
    if (this.rosterData.length === 0) {
      this.avatarHighlight.setVisible(false);
      return;
    }

    const AVATAR_SIZE = 14;
    const AVATAR_GAP = 2;
    const AVATAR_X = 4;
    const AVATAR_Y = 218;

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
    const w = 40;
    const h = 4;
    const x = 20;
    const y = 6;

    // Background
    this.batteryBar.fillStyle(0x333333, 0.8);
    this.batteryBar.fillRect(x, y, w, h);

    // Fill
    const color = percent > 20 ? 0x44ff44 : 0xff4444;
    this.batteryBar.fillStyle(color, 1);
    const fillWidth = (w * Math.max(0, percent)) / 100;
    this.batteryBar.fillRect(x, y, fillWidth, h);

    // Border
    this.batteryBar.lineStyle(1, 0x666666);
    this.batteryBar.strokeRect(x, y, w, h);
  }
}
