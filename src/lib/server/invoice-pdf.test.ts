// A smoke test for the invoice PDF, added when AFF instructing became a
// billable category: the generator is the one place a new category can
// fail silently — nothing typechecks the layout, and a broken invoice is
// only discovered at the point of sending it.
import { describe, expect, it } from 'vitest';
import { buildTandemInvoicePdf } from './invoice-pdf';
import type { Category, Jump } from '../tandem';

function jump(category: Category, name: string, level = ''): Jump {
  return { date: '2026-09-06', category, name, level, at: `2026-09-06T10:00:00.000Z` };
}

const SETTINGS = {
  fromName: 'Jake Orton',
  fromAddress: ['1 Somewhere Lane'],
  vatNote: 'Not VAT registered',
  billTo: ['Skydive Langar'],
  nextInvoiceRef: 1,
};

const RATES: Record<Category, number> = { instructor: 42, videographer: 42, aff: 42 };

async function build(jumpsByCategory: Record<Category, Jump[]>) {
  return buildTandemInvoicePdf({
    ref: 1,
    issuedDate: '06/09/2026',
    periodLabel: 'September 2026',
    settings: SETTINGS,
    jumpsByCategory,
    rates: RATES,
    videographerPackageRate: 92,
  });
}

describe('buildTandemInvoicePdf', () => {
  it('renders an invoice with AFF jumps on it', async () => {
    const pdf = await build({
      instructor: [jump('instructor', 'Jane Smith')],
      videographer: [],
      aff: [jump('aff', 'Alex Marsh', 'Level 6'), jump('aff', 'Jo Whitaker', 'Consol')],
    });

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('renders an AFF-only invoice — no tandem work at all that month', async () => {
    const pdf = await build({
      instructor: [],
      videographer: [],
      aff: [jump('aff', 'Alex Marsh', 'Level 6')],
    });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('still renders a month with nothing in it', async () => {
    const pdf = await build({ instructor: [], videographer: [], aff: [] });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
