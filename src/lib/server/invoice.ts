// Groups daily pack-job history into weeks and invoice months. The
// bucketing itself lives in ./history-buckets (shared with the work-jumps
// log's ./tandem-invoice); this file is just the pack-job adapter over
// it — its category set, its "packs" unit, its default rates.
import { CATEGORIES, RATES, totalEarnings, totalPacks, zeroCounts, type Category, type Counts, type HistoryRow } from '../packing';
import {
  groupByInvoiceMonth as bucketByInvoiceMonth,
  groupByWeek as bucketByWeek,
  type Bucket,
  type HistoryDomain,
} from './history-buckets';

/** A week/month rollup row. `totalPacks` is `Bucket.total` named for the pack-job call sites. */
export interface AggregateRow extends Bucket<Category> {
  counts: Counts;
  totalPacks: number;
}

const DOMAIN: HistoryDomain<Category> = {
  categories: CATEGORIES,
  zeroCounts,
  total: totalPacks,
  earnings: totalEarnings,
  defaultRates: RATES,
};

const named = (rows: Bucket<Category>[]): AggregateRow[] => rows.map((r) => ({ ...r, totalPacks: r.total }));

/**
 * `rates` defaults (inside history-buckets) to $lib/packing.ts's
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
