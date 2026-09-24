// The universal (client-safe) half of the ground-school ledger — same
// split as $lib/tandem.ts, and for the same reason: these types are
// imported from Svelte components as well as server code.
//
// Ground school doesn't fit the tandem Jump model: there's no fixed rate
// to look up (RATES.aff), because a ground school session's price varies
// session to session — the instructor keyed in what they actually earned
// each time rather than picking a category rate. So this is its own small
// ledger, not another Category. New sessions are no longer added (the
// panel was retired in favour of Miscellaneous); existing ones are kept
// so History and past invoices stay complete.

export interface GroundSchoolEntry {
  date: string; // YYYY-MM-DD, local time
  amount: number; // what the instructor earned for this session, in pounds
  at: string; // ISO timestamp — also this entry's id, for deletion
}

/** Today's ground school sessions — the shape the Tandems tab renders. */
export interface GroundSchoolDayState {
  date: string;
  entries: GroundSchoolEntry[];
}

export function totalGroundSchoolEarnings(entries: GroundSchoolEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
