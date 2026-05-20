import Phaser from 'phaser';
import { SCENES, GAME_CONFIG } from '@utils/Constants';

interface DocumentReaderData {
  title: string;
  content: string;
}

export class DocumentReaderScene extends Phaser.Scene {
  private pages: string[] = [];
  private pageIndex = 0;
  private bodyText!: Phaser.GameObjects.Text;
  private hintText!: Phaser.GameObjects.Text;
  private pageCounter!: Phaser.GameObjects.Text;

  constructor() {
    super(SCENES.DOCUMENT_READER);
  }

  create(data: DocumentReaderData): void {
    const w = GAME_CONFIG.WIDTH;
    const h = GAME_CONFIG.HEIGHT;

    this.pages = this.splitPages(data.content ?? '');
    this.pageIndex = 0;

    // Dark overlay
    this.add.rectangle(w / 2, h / 2, w, h, 0x000000, 0.82);

    // Border frame
    const margin = 56;
    this.add.rectangle(w / 2, h / 2, w - margin * 2, h - margin * 2)
      .setStrokeStyle(4, 0x888844, 0.8)
      .setFillStyle(0x0a0a0a, 0.95);

    // Title
    this.add.text(w / 2, margin + 40, data.title ?? 'Document', {
      fontSize: '36px',
      color: '#d4c87a',
      fontFamily: 'monospace',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);

    // Divider
    const divG = this.add.graphics();
    divG.lineStyle(4, 0x444422, 1);
    divG.lineBetween(margin + 16, margin + 92, w - margin - 16, margin + 92);

    // Body text (updated per page)
    this.bodyText = this.add.text(margin + 24, margin + 120, '', {
      fontSize: '32px',
      color: '#ccccbb',
      fontFamily: 'monospace',
      wordWrap: { width: w - (margin + 24) * 2 },
      lineSpacing: 8,
    });

    // Page counter (top-right)
    this.pageCounter = this.add.text(w - margin - 24, margin + 40, '', {
      fontSize: '32px',
      color: '#666655',
      fontFamily: 'monospace',
    }).setOrigin(1, 0);

    // Hint (bottom-centre, blinks)
    this.hintText = this.add.text(w / 2, h - margin - 24, '', {
      fontSize: '32px',
      color: '#888866',
      fontFamily: 'monospace',
    }).setOrigin(0.5, 1);

    this.tweens.add({
      targets: this.hintText,
      alpha: 0.3,
      duration: 600,
      yoyo: true,
      repeat: -1,
    });

    this.showPage();

    this.input.keyboard!.on('keydown-E', () => this.advance());
    this.input.keyboard!.on('keydown-ENTER', () => this.advance());
    this.input.keyboard!.on('keydown-ESC', () => this.close());
  }

  private splitPages(content: string): string[] {
    // Explicit page breaks first
    const explicit = content.split('\n---\n').map(s => s.trim()).filter(Boolean);
    if (explicit.length > 1) return explicit;
    // Otherwise split at every 10 lines
    const lines = content.split('\n');
    const pages: string[] = [];
    for (let i = 0; i < lines.length; i += 10) {
      pages.push(lines.slice(i, i + 10).join('\n'));
    }
    return pages.length ? pages : [content];
  }

  private showPage(): void {
    this.bodyText.setText(this.pages[this.pageIndex] ?? '');
    const total = this.pages.length;
    if (total > 1) this.pageCounter.setText(`${this.pageIndex + 1} / ${total}`);
    else this.pageCounter.setText('');
    const isLast = this.pageIndex >= this.pages.length - 1;
    this.hintText.setText(isLast ? 'E / ESC — close' : 'E — next page');
  }

  private advance(): void {
    if (this.pageIndex < this.pages.length - 1) {
      this.pageIndex++;
      this.showPage();
    } else {
      this.close();
    }
  }

  private close(): void {
    this.scene.stop();
  }
}
