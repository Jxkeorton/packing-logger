// Groups daily pack-job history into weeks and invoice months.
//
// Invoice months don't follow the calendar: each one runs from the day
// after the previous cutoff through this month's cutoff, where the cutoff
// is the Sunday before the last Tuesday of the month. Because every cutoff
// falls on a Sunday, these periods always start on a Monday and end on a
// Sunday — i.e. they're exactly a whole number of Monday–Sunday weeks.
import { CATEGORIES, totalEarnings, totalPacks, type Counts, type HistoryRow } from './packing';

export interface AggregateRow {
  key: string;
  /** True when today falls inside this bucket (it's still filling up). */
  isCurrent: boolean;
  rangeLabel: string;
  counts: Counts;
  totalPacks: number;
  totalEarnings: number;
}

function parseDateKey(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

function emptyCounts(): Counts {
  return { tandem: 0, instructor: 0, student: 0, sport: 0 };
}

function addCounts(a: Counts, b: Counts): Counts {
  const out = { ...a };
  for (const c of CATEGORIES) out[c] += b[c];
  return out;
}

function shortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function rangeLabel(start: Date, end: Date): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** The Monday (start of week) containing `d`. */
export function mondayOf(d: Date): Date {
  const daysSinceMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return addDays(d, -daysSinceMonday);
}

/** The last Tuesday of the given month (monthIndex0 is 0-based, like Date). */
export function lastTuesdayOfMonth(year: number, monthIndex0: number): Date {
  const lastDay = new Date(year, monthIndex0 + 1, 0); // day 0 of next month = last day of this one
  const offsetFromTuesday = (lastDay.getDay() - 2 + 7) % 7;
  return addDays(lastDay, -offsetFromTuesday);
}

/** The invoice cutoff for a month: the Sunday before its last Tuesday. */
export function invoiceCutoff(year: number, monthIndex0: number): Date {
  return addDays(lastTuesdayOfMonth(year, monthIndex0), -2);
}

/** Which invoice month (year + 0-based month) a date's pack jobs count towards. */
export function invoiceMonthOf(d: Date): { year: number; month: number } {
  const year = d.getFullYear();
  const month = d.getMonth();
  const cutoff = invoiceCutoff(year, month);
  if (d.getTime() <= cutoff.getTime()) return { year, month };
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}

function toBuckets<K extends string>(
  rows: HistoryRow[],
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
        totalEarnings: totalEarnings(counts),
      };
    });
}

/** Group daily rows into Monday–Sunday weeks, most recent first. */
export function groupByWeek(rows: HistoryRow[]): AggregateRow[] {
  return toBuckets(
    rows,
    (d) => formatDateKey(mondayOf(d)) as `${string}`,
    (key) => {
      const start = parseDateKey(key);
      return { start, end: addDays(start, 6) };
    },
  );
}

/** Group daily rows into invoice months (cutoff-to-cutoff), most recent first. */
export function groupByInvoiceMonth(rows: HistoryRow[]): AggregateRow[] {
  return toBuckets(
    rows,
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
