// Same shape of coverage as invoice.test.ts, for the tandem-jump log's
// own copy of the week/invoice-month bucketing (see periods.test.ts for
// where the expected dates/labels come from). The two files' bucketing
// logic is duplicated near-verbatim — keeping both test files in lockstep
// is exactly what makes a future dedup of that logic safe to do.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupByInvoiceMonth, groupByWeek, invoiceMonthDateRange } from './tandem-invoice';
import { formatDateKey } from './periods';
import type { HistoryRow } from './tandem';

function row(date: string, counts: Partial<HistoryRow['counts']>): HistoryRow {
  const full = { instructor: 0, videographer: 0, ...counts };
  return { date, counts: full, totalJumps: 0, totalEarnings: 0 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('groupByWeek', () => {
  it('buckets rows into Monday–Sunday weeks, summed and newest first', () => {
    const rows = [
      row('2026-08-24', { instructor: 1 }), // Mon, week of 24 Aug
      row('2026-08-25', { videographer: 2 }), // Tue, same week
      row('2026-08-17', { instructor: 1 }), // Mon, previous week
    ];

    const result = groupByWeek(rows);

    expect(result.map((r) => r.key)).toEqual(['2026-08-24', '2026-08-17']);

    expect(result[0].counts).toEqual({ instructor: 1, videographer: 2 });
    expect(result[0].totalJumps).toBe(3);
    expect(result[0].totalEarnings).toBeCloseTo(1 * 42 + 2 * 42); // 126
    expect(result[0].rangeLabel).toBe('24 Aug – 30 Aug');

    expect(result[1].counts).toEqual({ instructor: 1, videographer: 0 });
    expect(result[1].totalJumps).toBe(1);
    expect(result[1].totalEarnings).toBeCloseTo(42);
    expect(result[1].rangeLabel).toBe('17 Aug – 23 Aug');
  });

  it('marks only the week containing "today" as current', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T09:00:00'));

    const rows = [row('2026-08-24', { instructor: 1 }), row('2026-08-17', { videographer: 1 })];
    const result = groupByWeek(rows);

    expect(result.find((r) => r.key === '2026-08-24')?.isCurrent).toBe(true);
    expect(result.find((r) => r.key === '2026-08-17')?.isCurrent).toBe(false);
  });
});

describe('invoiceMonthDateRange', () => {
  it('returns the cutoff-to-cutoff window for a bucket key', () => {
    const march = invoiceMonthDateRange('2026-03');
    expect(formatDateKey(march.start)).toBe('2026-02-23');
    expect(formatDateKey(march.end)).toBe('2026-03-29');

    const april = invoiceMonthDateRange('2026-04');
    expect(formatDateKey(april.start)).toBe('2026-03-30');
    expect(formatDateKey(april.end)).toBe('2026-04-26');
  });

  it('crosses a year boundary for January', () => {
    const january = invoiceMonthDateRange('2026-01');
    // Same values as periods.test.ts's Dec-2025 cutoff case.
    expect(formatDateKey(january.start)).toBe('2025-12-29');
    expect(formatDateKey(january.end)).toBe('2026-01-25');
  });
});

describe('groupByInvoiceMonth', () => {
  it('splits a cutoff-adjacent pair of dates into two invoice months', () => {
    const rows = [
      row('2026-03-29', { instructor: 1 }), // on the March cutoff — still March
      row('2026-03-30', { videographer: 2 }), // day after — rolls into April
    ];

    const result = groupByInvoiceMonth(rows);

    expect(result.map((r) => r.key)).toEqual(['2026-04', '2026-03']); // newest first

    const april = result.find((r) => r.key === '2026-04')!;
    expect(april.counts).toEqual({ instructor: 0, videographer: 2 });
    expect(april.totalJumps).toBe(2);
    expect(april.totalEarnings).toBeCloseTo(84); // 2 * 42
    expect(april.rangeLabel).toBe('30 Mar – 26 Apr');

    const march = result.find((r) => r.key === '2026-03')!;
    expect(march.counts).toEqual({ instructor: 1, videographer: 0 });
    expect(march.totalJumps).toBe(1);
    expect(march.totalEarnings).toBeCloseTo(42);
    expect(march.rangeLabel).toBe('23 Feb – 29 Mar');
  });

  it('marks only the invoice month containing "today" as current', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T09:00:00'));

    const rows = [row('2026-03-29', { instructor: 1 }), row('2026-03-30', { videographer: 1 })];
    const result = groupByInvoiceMonth(rows);

    expect(result.find((r) => r.key === '2026-04')?.isCurrent).toBe(true);
    expect(result.find((r) => r.key === '2026-03')?.isCurrent).toBe(false);
  });
});
