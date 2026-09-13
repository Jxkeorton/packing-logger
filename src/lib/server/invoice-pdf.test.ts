// A smoke test for the invoice PDF, added when AFF instructing became a
// billable category: the generator is the one place a new category can
// fail silently — nothing typechecks the layout, and a broken invoice is
// only discovered at the point of sending it.
import { describe, expect, it } from 'vitest';
import { buildSummaryLine, buildTandemInvoicePdf } from './invoice-pdf';
import type { Category, Jump } from '../tandem';
import type { GroundSchoolEntry } from '../ground-school';

function groundSchool(amount: number): GroundSchoolEntry {
  return { date: '2026-09-06', amount, at: '2026-09-06T10:00:00.000Z' };
}

function jump(category: Category, name: string, level = ''): Jump {
  return {
    date: '2026-09-06',
    category,
    name,
    level,
    handyCam: false,
    handyCamAt: '',
    handyCamAfterJump: false,
    at: `2026-09-06T10:00:00.000Z`,
  };
}

const SETTINGS = {
  fromName: 'Jake Orton',
  fromAddress: ['1 Somewhere Lane'],
  vatNote: 'Not VAT registered',
  billTo: ['Skydive Langar'],
  nextInvoiceRef: 1,
};

const RATES: Record<Category, number> = { instructor: 42, videographer: 42, aff: 42 };

async function build(
  jumpsByCategory: Record<Category, Jump[]>,
  handyCamPackageJumps: Jump[] = [],
  handyCamAfterJumpJumps: Jump[] = [],
  groundSchoolEntries: GroundSchoolEntry[] = [],
) {
  return buildTandemInvoicePdf({
    ref: 1,
    issuedDate: '06/09/2026',
    periodLabel: 'September 2026',
    settings: SETTINGS,
    jumpsByCategory,
    rates: RATES,
    videographerPackageRate: 92,
    handyCamPackageJumps,
    handyCamAfterJumpJumps,
    handyCamBonusRate: 20,
    groundSchoolEntries,
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

  it('renders a handy cam footage section, and folds its bonus into the total', async () => {
    const withoutBonus = await build({
      instructor: [jump('instructor', 'Jane Smith')],
      videographer: [],
      aff: [],
    });
    const withBonus = await build(
      { instructor: [jump('instructor', 'Jane Smith')], videographer: [], aff: [] },
      [jump('instructor', 'Jane Smith')],
    );

    expect(withBonus.subarray(0, 5).toString()).toBe('%PDF-');
    // Not a byte-for-byte content check (that'd mean asserting against
    // pdfkit's binary stream) — but the section adds a real page of
    // content and a real £20 to the total, so the output can't be the
    // same size as the otherwise-identical invoice without it.
    expect(withBonus.length).toBeGreaterThan(withoutBonus.length);
  });

  it('renders package and after-jump bonuses as two separate sections, both folded into the total', async () => {
    const neither = await build({ instructor: [jump('instructor', 'Jane Smith')], videographer: [], aff: [] });
    const packageOnly = await build(
      { instructor: [jump('instructor', 'Jane Smith')], videographer: [], aff: [] },
      [jump('instructor', 'Jane Smith')],
    );
    const both = await build(
      { instructor: [jump('instructor', 'Jane Smith')], videographer: [], aff: [] },
      [jump('instructor', 'Jane Smith')],
      [jump('instructor', 'Alex Marsh')],
    );

    expect(both.subarray(0, 5).toString()).toBe('%PDF-');
    // Each section is real added content (and a real added £20 in the
    // total), so a PDF with both sections must be bigger than one with
    // only the package section, which in turn must be bigger than one
    // with neither.
    expect(packageOnly.length).toBeGreaterThan(neither.length);
    expect(both.length).toBeGreaterThan(packageOnly.length);
  });

  it('renders a ground school section, and folds its amount into the total', async () => {
    const without = await build({ instructor: [], videographer: [], aff: [jump('aff', 'Alex Marsh', 'Level 6')] });
    const withSessions = await build(
      { instructor: [], videographer: [], aff: [jump('aff', 'Alex Marsh', 'Level 6')] },
      [],
      [],
      [groundSchool(75), groundSchool(50)],
    );

    expect(withSessions.subarray(0, 5).toString()).toBe('%PDF-');
    // Same reasoning as the handy-cam-section test above: not a
    // byte-for-byte content check, but two extra rows and a real £125
    // added to the total can't produce an identically sized PDF.
    expect(withSessions.length).toBeGreaterThan(without.length);
  });
});

describe('buildSummaryLine', () => {
  const base = { instructing: 5, videoing: 2, affing: 0, handyCamPackage: 0, handyCamAfterJump: 0, groundSchool: 0 };

  it('mentions only instructor and videographer counts when there are no extras', () => {
    expect(buildSummaryLine(base)).toBe('5 tandem instructing jump(s) and 2 videographer jump(s) this period.');
  });

  it('adds a single extra clause with exactly one comma before "this period"', () => {
    expect(buildSummaryLine({ ...base, affing: 3 })).toBe(
      '5 tandem instructing jump(s) and 2 videographer jump(s), plus 3 AFF instructing jump(s), this period.',
    );
  });

  it('joins every extra with its own "plus", never a double comma between two of them', () => {
    // The exact regression this guards: each clause used to carry its own
    // trailing comma, so stacking the two handy-cam ones produced
    // "…(package),, plus…".
    const line = buildSummaryLine({ ...base, affing: 3, handyCamPackage: 1, handyCamAfterJump: 2, groundSchool: 4 });
    expect(line).toBe(
      '5 tandem instructing jump(s) and 2 videographer jump(s), plus 3 AFF instructing jump(s), ' +
        'plus 1 handy cam bonus(es) (package), plus 2 handy cam bonus(es) (after jump), ' +
        'plus 4 ground school session(s), this period.',
    );
    expect(line).not.toContain(',,');
  });
});
