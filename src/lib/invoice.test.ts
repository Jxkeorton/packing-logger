// Characterization tests for the pack-job week/invoice-month bucketing.
// Expected dates/labels here were computed independently (see
// periods.test.ts) rather than by trusting whatever this file already
// outputs. isCurrent depends on "today", so those cases pin the system
// clock with vi.setSystemTime rather than leaving it to whenever the
// suite happens to run.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { groupByInvoiceMonth, groupByWeek } from './invoice';
import type { HistoryRow } from './packing';

function row(date: string, counts: Partial<HistoryRow['counts']>): HistoryRow {
  const full = { tandem: 0, instructor: 0, student: 0, sport: 0, ...counts };
  return { date, counts: full, totalPacks: 0, totalEarnings: 0 };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('groupByWeek', () => {
  it('buckets rows into Monday–Sunday weeks, summed and newest first', () => {
    const rows = [
      row('2026-08-24', { tandem: 1 }), // Mon, week of 24 Aug
      row('2026-08-25', { instructor: 2 }), // Tue, same week
      row('2026-08-17', { student: 1 }), // Mon, previous week
    ];

    const result = groupByWeek(rows);

    expect(result.map((r) => r.key)).toEqual(['2026-08-24', '2026-08-17']);

    expect(result[0].counts).toEqual({ tandem: 1, instructor: 2, student: 0, sport: 0 });
    expect(result[0].totalPacks).toBe(3);
    expect(result[0].totalEarnings).toBeCloseTo(1 * 11 + 2 * 6.5); // 24
    expect(result[0].rangeLabel).toBe('24 Aug – 30 Aug');

    expect(result[1].counts).toEqual({ tandem: 0, instructor: 0, student: 1, sport: 0 });
    expect(result[1].totalPacks).toBe(1);
    expect(result[1].totalEarnings).toBeCloseTo(6.5);
    expect(result[1].rangeLabel).toBe('17 Aug – 23 Aug');
  });

  it('marks only the week containing "today" as current', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T09:00:00'));

    const rows = [row('2026-08-24', { tandem: 1 }), row('2026-08-17', { student: 1 })];
    const result = groupByWeek(rows);

    expect(result.find((r) => r.key === '2026-08-24')?.isCurrent).toBe(true);
    expect(result.find((r) => r.key === '2026-08-17')?.isCurrent).toBe(false);
  });
});

describe('groupByInvoiceMonth', () => {
  it('splits a cutoff-adjacent pair of dates into two invoice months', () => {
    const rows = [
      row('2026-03-29', { tandem: 1 }), // on the March cutoff — still March
      row('2026-03-30', { instructor: 1, student: 1 }), // day after — rolls into April
    ];

    const result = groupByInvoiceMonth(rows);

    expect(result.map((r) => r.key)).toEqual(['2026-04', '2026-03']); // newest first

    const april = result.find((r) => r.key === '2026-04')!;
    expect(april.counts).toEqual({ tandem: 0, instructor: 1, student: 1, sport: 0 });
    expect(april.totalPacks).toBe(2);
    expect(april.totalEarnings).toBeCloseTo(13); // 6.5 + 6.5
    expect(april.rangeLabel).toBe('30 Mar – 26 Apr');

    const march = result.find((r) => r.key === '2026-03')!;
    expect(march.counts).toEqual({ tandem: 1, instructor: 0, student: 0, sport: 0 });
    expect(march.totalPacks).toBe(1);
    expect(march.totalEarnings).toBeCloseTo(11);
    expect(march.rangeLabel).toBe('23 Feb – 29 Mar');
  });

  it('marks only the invoice month containing "today" as current', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T09:00:00'));

    const rows = [row('2026-03-29', { tandem: 1 }), row('2026-03-30', { instructor: 1 })];
    const result = groupByInvoiceMonth(rows);

    expect(result.find((r) => r.key === '2026-04')?.isCurrent).toBe(true);
    expect(result.find((r) => r.key === '2026-03')?.isCurrent).toBe(false);
  });
});
