// The storage-backed half of the miscellaneous-earnings ledger — see
// $lib/misc-entries.ts for the plain-data half this imports (and
// re-exports the type from, unchanged, for callers that shouldn't need to
// know which half a given export lives in). Same shape as
// $lib/server/ground-school.ts's ledger, plus a `label` column — the one
// thing that makes this generic rather than fixed to "ground school".
import { todayKey } from '../packing';
import { csvEscape } from './csv';
import { createLedger } from './ledger';
import type { MiscEntry } from '../misc-entries';

export type { MiscEntry };

const ledger = createLedger<MiscEntry>({
  key: 'misc-entries.csv',
  header: 'date,label,amount,at',
  parseRow: ([date, label, amountStr, at]) => {
    const amount = Number(amountStr);
    if (!date || !label || !at || !Number.isFinite(amount)) return null;
    return { date, label, amount, at };
  },
  formatRow: (e) => [e.date, csvEscape(e.label), e.amount.toFixed(2), e.at],
});

/** Today's miscellaneous entries — the live view the Tandems tab renders. */
export function loadTodayEntries(): Promise<MiscEntry[]> {
  return ledger.today();
}

/** Record one miscellaneous entry for today, earning `amount` for `label`. */
export function addEntry(label: string, amount: number, at: string = new Date().toISOString()): Promise<MiscEntry[]> {
  return ledger.add({ date: todayKey(), label, amount, at });
}

/** Remove one entry by its `at` timestamp (its id) — undoes a mis-tapped amount or label. */
export function removeEntry(at: string): Promise<MiscEntry[]> {
  return ledger.remove(at);
}

/**
 * Correct the label and/or amount of an existing entry, found by its `at`
 * id — its date and id are never touched, so this can't move an entry to a
 * different day/week/month bucket or change what "undo" (removeEntry)
 * would target. A no-op if `at` doesn't match anything, same as
 * removeEntry above.
 */
export async function updateEntry(at: string, label: string, amount: number): Promise<MiscEntry[]> {
  const entries = await ledger.read();
  const entry = entries.find((e) => e.at === at);
  if (entry) {
    entry.label = label;
    entry.amount = amount;
    await ledger.write(entries);
  }
  return ledger.todayOf(entries);
}

/**
 * Every past entry — excludes today, which the Tandems tab already shows
 * live via loadTodayEntries — sorted chronologically. The work-jumps
 * History tab's data source, same "past only" split as ground-school.ts's
 * own readHistory.
 */
export function readHistory(): Promise<MiscEntry[]> {
  return ledger.history();
}

/**
 * Every entry within `startDate`..`endDate` (both YYYY-MM-DD, inclusive),
 * sorted chronologically — the invoice PDF's data source, same shape as
 * ground-school.ts's own entriesInRange.
 */
export function entriesInRange(startDate: string, endDate: string): Promise<MiscEntry[]> {
  return ledger.inRange(startDate, endDate);
}
