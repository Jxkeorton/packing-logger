// Renders a tandem invoice (letterhead + itemised jumps, split by role) as
// a PDF, in the same rough layout as the spreadsheet-style invoices this
// replaces: a coloured header bar, a From/Bill To block, then a
// description table and a total.
//
// Fonts: pdfkit's built-in standard fonts (Helvetica etc.) load via a
// dynamic module-resolution trick that Vercel's serverless bundler doesn't
// trace correctly — the function fails at runtime with "Cannot find module
// '.../pdfkit/js/standard-fonts/Helvetica.cjs'" even though it works fine
// locally. The fix used everywhere pdfkit meets a serverless bundler is to
// skip the built-in fonts entirely and embed a real font file instead
// (`font: false` below), which is what src/assets/fonts/ is for.
//
// Path resolution: `astro.config.mjs`'s `includeFiles` copies these into
// the deployed function preserving their original repo-relative path
// (`src/assets/fonts/…` under the function root) — it does NOT follow them
// into wherever Vite happens to place the compiled chunk that imports them.
// So the path has to be built from `process.cwd()` (the function root, and
// the project root in local dev too), not from this file's own location.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import PDFDocument from 'pdfkit';
import { CATEGORIES, CATEGORY_LABELS, RATES, type Category, type Jump } from '../tandem';
import type { InvoiceSettings } from './invoice-settings';

export interface InvoicePdfOptions {
  ref: number;
  issuedDate: string; // formatted DD/MM/YYYY
  periodLabel: string;
  settings: InvoiceSettings;
  jumpsByCategory: Record<Category, Jump[]>;
}

const MARGIN = 50;
const NAVY = '#14202b';
const BAR_BLUE = '#3e7cb1';
const TOTAL_BG = '#d9d3ea';
const MUTED = '#5c6b78';

const FONT_DIR = path.join(process.cwd(), 'src/assets/fonts');
const FONT_REGULAR = readFileSync(path.join(FONT_DIR, 'Roboto-Regular.ttf'));
const FONT_BOLD = readFileSync(path.join(FONT_DIR, 'Roboto-Medium.ttf'));

function formatJumpDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function money(n: number): string {
  return `£${n.toFixed(2)}`;
}

export async function buildTandemInvoicePdf(opts: InvoicePdfOptions): Promise<Buffer> {
  // `font: false` stops the constructor from eagerly loading a built-in
  // standard font (the thing that crashes in production) — @types/pdfkit
  // hasn't caught up with this option yet, hence the cast.
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGIN,
    font: false,
  } as unknown as ConstructorParameters<typeof PDFDocument>[0]);
  doc.registerFont('Body', FONT_REGULAR);
  doc.registerFont('Body-Bold', FONT_BOLD);
  doc.font('Body');

  const chunks: Buffer[] = [];
  doc.on('data', (chunk) => chunks.push(chunk as Buffer));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });

  const pageWidth = doc.page.width - MARGIN * 2;
  const colA = pageWidth * 0.5;
  const colB = pageWidth * 0.25;
  const colC = pageWidth - colA - colB;

  let y = MARGIN;

  function bar(x: number, width: number, label: string) {
    doc.rect(x, y, width, 20).fill(BAR_BLUE);
    doc
      .fillColor('#ffffff')
      .font('Body-Bold')
      .fontSize(10)
      .text(label, x + 6, y + 5, { width: width - 12, lineBreak: false });
    doc.fillColor(NAVY).font('Body');
  }

  // ---- Header: title / invoice ref / date ----
  bar(MARGIN, colA, `${opts.settings.fromName.toUpperCase()} INVOICE`);
  bar(MARGIN + colA, colB, 'INVOICE REF');
  bar(MARGIN + colA + colB, colC, 'DATE');
  y += 20;

  doc.fontSize(10);
  doc.text(opts.settings.vatNote, MARGIN + 6, y + 5, { width: colA - 12, lineBreak: false });
  doc.text(String(opts.ref), MARGIN + colA + 6, y + 5, { width: colB - 12, lineBreak: false });
  doc.text(opts.issuedDate, MARGIN + colA + colB + 6, y + 5, { width: colC - 12, lineBreak: false });
  y += 30;

  // ---- From / Bill To ----
  bar(MARGIN + colA, colB + colC, 'BILL TO');
  y += 20;
  const fromLines = [opts.settings.fromName, ...opts.settings.fromAddress];
  const billLines = opts.settings.billTo;
  const lineCount = Math.max(fromLines.length, billLines.length);
  for (let i = 0; i < lineCount; i++) {
    if (fromLines[i]) doc.text(fromLines[i], MARGIN + 6, y, { width: colA - 12, lineBreak: false });
    if (billLines[i]) doc.text(billLines[i], MARGIN + colA + 6, y, { width: colB + colC - 12, lineBreak: false });
    y += 14;
  }
  y += 16;

  // ---- Description ----
  bar(MARGIN, pageWidth, 'DESCRIPTION');
  y += 24;

  doc.font('Body').fontSize(9).fillColor(MUTED);
  doc.text(`Invoice period: ${opts.periodLabel}`, MARGIN, y, { lineBreak: false });
  doc.fillColor(NAVY);
  y += 20;

  const dateColW = 75;
  const amountColW = 80;
  const nameColW = pageWidth - dateColW - amountColW;

  let total = 0;
  let anyJumps = false;

  for (const category of CATEGORIES) {
    const jumps = opts.jumpsByCategory[category] ?? [];
    if (jumps.length === 0) continue;
    anyJumps = true;

    if (y > doc.page.height - MARGIN - 100) {
      doc.addPage();
      y = MARGIN;
    }

    doc.font('Body-Bold').fontSize(10.5).fillColor(NAVY);
    doc.text(CATEGORY_LABELS[category], MARGIN, y, { lineBreak: false });
    y += 16;

    doc.font('Body').fontSize(9.5);
    for (const jump of jumps) {
      if (y > doc.page.height - MARGIN - 60) {
        doc.addPage();
        y = MARGIN;
      }
      doc.text(formatJumpDate(jump.date), MARGIN, y, { width: dateColW, lineBreak: false });
      doc.text(jump.name, MARGIN + dateColW, y, { width: nameColW - 8, lineBreak: false });
      doc.text(money(RATES[category]), MARGIN + dateColW + nameColW, y, { width: amountColW, align: 'right', lineBreak: false });
      y += 14;
    }

    const subtotal = jumps.length * RATES[category];
    total += subtotal;

    y += 2;
    doc.font('Body-Bold');
    doc.text(`${jumps.length} @ ${money(RATES[category])}`, MARGIN, y, {
      width: pageWidth - amountColW,
      align: 'right',
      lineBreak: false,
    });
    doc.text(money(subtotal), MARGIN + pageWidth - amountColW, y, { width: amountColW, align: 'right', lineBreak: false });
    doc.font('Body');
    y += 24;
  }

  if (!anyJumps) {
    doc.fillColor(MUTED).text('No tandem jumps recorded for this period.', MARGIN, y, { lineBreak: false });
    doc.fillColor(NAVY);
    y += 24;
  }

  // ---- Total ----
  doc.rect(MARGIN, y, pageWidth, 24).fill(TOTAL_BG);
  doc.fillColor(NAVY).font('Body-Bold').fontSize(11);
  doc.text('TOTAL:', MARGIN + 6, y + 7, { width: pageWidth - amountColW - 6, align: 'right', lineBreak: false });
  doc.text(money(total), MARGIN + pageWidth - amountColW, y + 7, { width: amountColW - 6, align: 'right', lineBreak: false });
  y += 36;

  const instructing = opts.jumpsByCategory.instructor?.length ?? 0;
  const videoing = opts.jumpsByCategory.videographer?.length ?? 0;
  doc
    .font('Body')
    .fontSize(8)
    .fillColor(MUTED)
    .text(`${instructing} tandem instructing jump(s) and ${videoing} videographer jump(s) this period.`, MARGIN, y, {
      lineBreak: false,
    });

  doc.end();
  return done;
}
