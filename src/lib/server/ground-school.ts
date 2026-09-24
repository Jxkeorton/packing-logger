// The storage-backed half of the ground-school ledger — see
// $lib/ground-school.ts for the plain-data half this imports (and
// re-exports the type from, unchanged, for callers that shouldn't need
// to know which half a given export lives in). Same shape as
// $lib/server/tandem.ts's jump ledger, minus everything that ledger
// needs and this one doesn't: no category, no name, no legacy header
// migrations to carry forward — this is a brand new file.
//
// Read/delete only: the "add ground school" panel was retired for good
// (Miscellaneous covers it — log it there as a "Ground school" entry), so
// nothing creates new sessions. What's already logged still shows in
// History and bills on the invoice, and can still be deleted.
import { createLedger } from './ledger';
import type { GroundSchoolEntry } from '../ground-school';

export type { GroundSchoolEntry };

const ledger = createLedger<GroundSchoolEntry>({
  key: 'ground-school.csv',
  header: 'date,amount,at',
  parseRow: ([date, amountStr, at]) => {
    const amount = Number(amountStr);
    if (!date || !at || !Number.isFinite(amount)) return null;
    return { date, amount, at };
  },
  formatRow: (e) => [e.date, e.amount.toFixed(2), e.at],
});

/** Today's ground school sessions — the live view the Tandems tab renders. */
export function loadTodayEntries(): Promise<GroundSchoolEntry[]> {
  return ledger.today();
}

/** Remove one session by its `at` timestamp (its id) — undoes a mis-tapped amount. */
export function removeEntry(at: string): Promise<GroundSchoolEntry[]> {
  return ledger.remove(at);
}

/**
 * Every past session — excludes today, which the Tandems tab already shows
 * live via loadTodayEntries — sorted chronologically. The work-jumps
 * History tab's data source, same "past only" split as tandem.ts's
 * readHistory/dayJumpsFromJumps.
 */
export function readHistory(): Promise<GroundSchoolEntry[]> {
  return ledger.history();
}

/**
 * Every session within `startDate`..`endDate` (both YYYY-MM-DD, inclusive),
 * sorted chronologically — the invoice PDF's data source, same shape as
 * tandem.ts's jumpsInRange.
 */
export function entriesInRange(startDate: string, endDate: string): Promise<GroundSchoolEntry[]> {
  return ledger.inRange(startDate, endDate);
}
