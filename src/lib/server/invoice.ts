// Groups daily pack-job history into weeks and invoice months. The
// underlying invoice-period math lives in ./periods (shared with the
// tandem log's ./tandem-invoice) — see that file for how cutoffs work.
import {
  CATEGORIES,
  RATES as DEFAULT_RATES,
  totalEarnings,
  totalPacks,
  type Category,
  type Counts,
  type HistoryRow,
} from '../packing';
import {
  addDays,
  formatDateKey,
  invoiceCutoff,
  invoiceMonthOf,
  mondayOf,
  parseDateKey,
  rangeLabel,
} from './periods';

export interface AggregateRow {
  key: string;
  /** True when today falls inside this bucket (it's still filling up). */
  isCurrent: boolean;
  rangeLabel: string;
  counts: Counts;
  totalPacks: number;
  totalEarnings: number;
}

function emptyCounts(): Counts {
  return { tandem: 0, instructor: 0, student: 0, sport: 0 };
}

function addCounts(a: Counts, b: Counts): Counts {
  const out = { ...a };
  for (const c of CATEGORIES) out[c] += b[c];
  return out;
}

function toBuckets<K extends string>(
  rows: HistoryRow[],
  rates: Record<Category, number>,
  keyOf: (d: Date) => K,
  rangeOf: (key: K) => { start: Date; end: Date },
): AggregateRow[] {
  const buckets = new Map<K, Counts>();
  for (const row of rows) {
    const key = keyOf(parseDateKey(row.date));
    buckets.set(key, addCounts(buckets.get(key) ?? emptyCounts(), row.counts));
  }

  const todayKey = formatDateKey(new Date());
  const today = parseDateKey(todayKey);

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .map(([key, counts]) => {
      const { start, end } = rangeOf(key);
      return {
        key,
        isCurrent: today.getTime() >= start.getTime() && today.getTime() <= end.getTime(),
        rangeLabel: rangeLabel(start, end),
        counts,
        totalPacks: totalPacks(counts),
        totalEarnings: totalEarnings(counts, rates),
      };
    });
}

/**
 * Group daily rows into Monday–Sunday weeks, most recent first. `rates`
 * defaults to $lib/packing.ts's hardcoded RATES — real callers pass the
 * actual settings-backed rates (rate-settings.ts) explicitly; this
 * default is for this file's own tests, which exercise the hardcoded
 * values on purpose.
 */
export function groupByWeek(rows: HistoryRow[], rates?: Record<Category, number>): AggregateRow[] {
  return toBuckets(
    rows,
    rates ?? DEFAULT_RATES,
    (d) => formatDateKey(mondayOf(d)) as `${string}`,
    (key) => {
      const start = parseDateKey(key);
      return { start, end: addDays(start, 6) };
    },
  );
}

/** Group daily rows into invoice months (cutoff-to-cutoff), most recent first. Same `rates` default as groupByWeek. */
export function groupByInvoiceMonth(rows: HistoryRow[], rates?: Record<Category, number>): AggregateRow[] {
  return toBuckets(
    rows,
    rates ?? DEFAULT_RATES,
    (d) => {
      const { year, month } = invoiceMonthOf(d);
      return `${year}-${String(month + 1).padStart(2, '0')}` as `${string}`;
    },
    (key) => {
      const [yearStr, monthStr] = key.split('-');
      const year = Number(yearStr);
      const month = Number(monthStr) - 1;
      const end = invoiceCutoff(year, month);
      const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
      const start = addDays(invoiceCutoff(prev.year, prev.month), 1);
      return { start, end };
    },
  );
}
