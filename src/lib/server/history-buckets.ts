// The week / invoice-month rollup shared by the pack-job log (./invoice)
// and the work-jumps log (./tandem-invoice). Both were near-verbatim
// copies of this — the same bucketing, the same "is today still inside
// this period" test, the same cutoff-to-cutoff month math — differing
// only in which category set and which unit ("packs" vs "jumps") the
// rows carry. Those two modules are now thin adapters that pass their
// domain in here; see ./periods for how the invoice cutoffs themselves
// work.
import { addDays, formatDateKey, invoiceCutoff, invoiceMonthOf, mondayOf, parseDateKey, rangeLabel } from './periods';

export interface Bucket<C extends string> {
  key: string;
  /** True when today falls inside this bucket (it's still filling up). */
  isCurrent: boolean;
  rangeLabel: string;
  counts: Record<C, number>;
  total: number;
  totalEarnings: number;
}

/** Just enough of a HistoryRow for bucketing — a date and its per-category counts. */
interface DatedCounts<C extends string> {
  date: string;
  counts: Record<C, number>;
}

/** One log's category set and how it totals a day — packing vs tandem differ only in this. */
export interface HistoryDomain<C extends string> {
  categories: readonly C[];
  zeroCounts: () => Record<C, number>;
  total: (counts: Record<C, number>) => number;
  earnings: (counts: Record<C, number>, rates: Record<C, number>) => number;
  /** Hardcoded fallback rates — used only when a caller doesn't pass the settings-backed ones. */
  defaultRates: Record<C, number>;
}

function toBuckets<C extends string>(
  rows: DatedCounts<C>[],
  domain: HistoryDomain<C>,
  ratesOverride: Record<C, number> | undefined,
  keyOf: (d: Date) => string,
  rangeOf: (key: string) => { start: Date; end: Date },
): Bucket<C>[] {
  const rates = ratesOverride ?? domain.defaultRates;

  const buckets = new Map<string, Record<C, number>>();
  for (const row of rows) {
    const key = keyOf(parseDateKey(row.date));
    const acc = buckets.get(key) ?? domain.zeroCounts();
    for (const c of domain.categories) acc[c] += row.counts[c];
    buckets.set(key, acc);
  }

  const today = parseDateKey(formatDateKey(new Date()));

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1)) // newest first
    .map(([key, counts]) => {
      const { start, end } = rangeOf(key);
      return {
        key,
        isCurrent: today.getTime() >= start.getTime() && today.getTime() <= end.getTime(),
        rangeLabel: rangeLabel(start, end),
        counts,
        total: domain.total(counts),
        totalEarnings: domain.earnings(counts, rates),
      };
    });
}

/** The cutoff-to-cutoff date range for an invoice-month bucket key (e.g. "2026-04"). */
export function invoiceMonthDateRange(key: string): { start: Date; end: Date } {
  const [yearStr, monthStr] = key.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;
  const end = invoiceCutoff(year, month);
  const prev = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 };
  const start = addDays(invoiceCutoff(prev.year, prev.month), 1);
  return { start, end };
}

/** Group daily rows into Monday–Sunday weeks, most recent first. */
export function groupByWeek<C extends string>(
  rows: DatedCounts<C>[],
  domain: HistoryDomain<C>,
  rates?: Record<C, number>,
): Bucket<C>[] {
  return toBuckets(rows, domain, rates, (d) => formatDateKey(mondayOf(d)), (key) => {
    const start = parseDateKey(key);
    return { start, end: addDays(start, 6) };
  });
}

/** Group daily rows into invoice months (cutoff-to-cutoff), most recent first. */
export function groupByInvoiceMonth<C extends string>(
  rows: DatedCounts<C>[],
  domain: HistoryDomain<C>,
  rates?: Record<C, number>,
): Bucket<C>[] {
  return toBuckets(
    rows,
    domain,
    rates,
    (d) => {
      const { year, month } = invoiceMonthOf(d);
      return `${year}-${String(month + 1).padStart(2, '0')}`;
    },
    invoiceMonthDateRange,
  );
}
