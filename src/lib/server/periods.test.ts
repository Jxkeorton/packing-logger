// Characterization tests for the invoice-period date math shared by
// invoice.ts and tandem-invoice.ts. Expected values here were computed
// independently (a fresh from-scratch implementation, not copy-pasted from
// periods.ts) — see the session notes — so this pins down *correct*
// behavior, not just whatever the code currently happens to output.
import { describe, expect, it } from 'vitest';
import {
  addDays,
  formatDateKey,
  invoiceCutoff,
  invoiceMonthOf,
  isValidCalendarDate,
  lastTuesdayOfMonth,
  mondayOf,
  parseDateKey,
  rangeLabel,
} from './periods';

describe('parseDateKey / formatDateKey', () => {
  it('round-trips a date key', () => {
    expect(formatDateKey(parseDateKey('2026-08-25'))).toBe('2026-08-25');
  });

  it('parses at local midnight, not UTC', () => {
    const d = parseDateKey('2026-01-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(5);
    expect(d.getHours()).toBe(0);
  });
});

describe('addDays', () => {
  it('adds positive and negative offsets', () => {
    expect(formatDateKey(addDays(parseDateKey('2026-08-25'), 6))).toBe('2026-08-31');
    expect(formatDateKey(addDays(parseDateKey('2026-08-25'), -6))).toBe('2026-08-19');
  });

  it('rolls over a month/year boundary', () => {
    expect(formatDateKey(addDays(parseDateKey('2026-12-30'), 3))).toBe('2027-01-02');
  });
});

describe('mondayOf', () => {
  it('finds Monday from a mid-week date', () => {
    expect(formatDateKey(mondayOf(parseDateKey('2026-08-25')))).toBe('2026-08-24'); // Tuesday
  });

  it('is idempotent on a Monday', () => {
    expect(formatDateKey(mondayOf(parseDateKey('2026-08-24')))).toBe('2026-08-24');
  });

  it('steps back to the previous week from a Sunday', () => {
    expect(formatDateKey(mondayOf(parseDateKey('2026-08-23')))).toBe('2026-08-17');
  });
});

describe('lastTuesdayOfMonth / invoiceCutoff', () => {
  const cases: Array<[number, number, string, string]> = [
    // [year, monthIndex0, lastTuesday, cutoff (lastTuesday - 2 days)]
    [2026, 3, '2026-04-28', '2026-04-26'], // April
    [2026, 2, '2026-03-31', '2026-03-29'], // March
    [2026, 0, '2026-01-27', '2026-01-25'], // January
    [2025, 11, '2025-12-30', '2025-12-28'], // December
  ];

  it.each(cases)('month %i-%i', (year, month, lastTuesday, cutoff) => {
    expect(formatDateKey(lastTuesdayOfMonth(year, month))).toBe(lastTuesday);
    expect(formatDateKey(invoiceCutoff(year, month))).toBe(cutoff);
  });

  it('the cutoff always falls on a Sunday', () => {
    for (let month = 0; month < 12; month++) {
      expect(invoiceCutoff(2026, month).getDay()).toBe(0);
    }
  });
});

describe('invoiceMonthOf', () => {
  it('a date exactly on the cutoff belongs to that month', () => {
    expect(invoiceMonthOf(parseDateKey('2026-03-29'))).toEqual({ year: 2026, month: 2 });
  });

  it('the day after the cutoff belongs to the next month', () => {
    expect(invoiceMonthOf(parseDateKey('2026-03-30'))).toEqual({ year: 2026, month: 3 });
  });

  it('rolls over into January of the next year after the December cutoff', () => {
    expect(invoiceMonthOf(parseDateKey('2025-12-28'))).toEqual({ year: 2025, month: 11 });
    expect(invoiceMonthOf(parseDateKey('2025-12-29'))).toEqual({ year: 2026, month: 0 });
  });
});

describe('rangeLabel', () => {
  it('formats a start–end range with an en dash', () => {
    expect(rangeLabel(parseDateKey('2026-08-24'), parseDateKey('2026-08-30'))).toBe('24 Aug – 30 Aug');
  });
});

describe('isValidCalendarDate', () => {
  it('accepts a real date', () => {
    expect(isValidCalendarDate('2026-08-25')).toBe(true);
  });

  it('accepts a leap-year Feb 29', () => {
    expect(isValidCalendarDate('2028-02-29')).toBe(true);
  });

  it('rejects a non-existent date instead of letting it roll over', () => {
    expect(isValidCalendarDate('2026-02-30')).toBe(false);
    expect(isValidCalendarDate('2026-13-01')).toBe(false);
    expect(isValidCalendarDate('2027-02-29')).toBe(false); // not a leap year
  });

  it('rejects malformed strings', () => {
    expect(isValidCalendarDate('2026-8-25')).toBe(false);
    expect(isValidCalendarDate('25-08-2026')).toBe(false);
    expect(isValidCalendarDate('not-a-date')).toBe(false);
    expect(isValidCalendarDate('')).toBe(false);
  });
});
