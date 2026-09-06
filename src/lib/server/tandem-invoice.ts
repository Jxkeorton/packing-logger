// Groups daily work-jump history into weeks and invoice months — the
// pack-job adapter's twin (./invoice), over the same ./history-buckets
// engine. Differs only in the category set, the "jumps" unit, and its
// default rates.
import { CATEGORIES, RATES, totalEarnings, totalJumps, zeroCounts, type Category, type Counts, type HistoryRow } from '../tandem';
import {
  groupByInvoiceMonth as bucketByInvoiceMonth,
  groupByWeek as bucketByWeek,
  invoiceMonthDateRange,
  type Bucket,
  type HistoryDomain,
} from './history-buckets';

export { invoiceMonthDateRange };

/** A week/month rollup row. `totalJumps` is `Bucket.total` named for the work-jump call sites. */
export interface AggregateRow extends Bucket<Category> {
  counts: Counts;
  totalJumps: number;
}

const DOMAIN: HistoryDomain<Category> = {
  categories: CATEGORIES,
  zeroCounts,
  total: totalJumps,
  earnings: totalEarnings,
  defaultRates: RATES,
};

const named = (rows: Bucket<Category>[]): AggregateRow[] => rows.map((r) => ({ ...r, totalJumps: r.total }));

/**
 * `rates` defaults (inside history-buckets) to $lib/tandem.ts's
 * hardcoded RATES — real callers pass the settings-backed rates
 * (rate-settings.ts) explicitly; the default is for this file's own
 * tests, which exercise the hardcoded values on purpose.
 */
export function groupByWeek(rows: HistoryRow[], rates?: Record<Category, number>): AggregateRow[] {
  return named(bucketByWeek(rows, DOMAIN, rates));
}

/** Group daily rows into invoice months (cutoff-to-cutoff), most recent first. Same `rates` default as groupByWeek. */
export function groupByInvoiceMonth(rows: HistoryRow[], rates?: Record<Category, number>): AggregateRow[] {
  return named(bucketByInvoiceMonth(rows, DOMAIN, rates));
}
