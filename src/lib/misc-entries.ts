// The universal (client-safe) half of the miscellaneous-earnings ledger —
// same split as $lib/ground-school.ts, and for the same reason: these
// types are imported from Svelte components as well as server code.
//
// Ground school got its own ledger because its price varies session to
// session rather than following a fixed per-jump rate. This ledger is the
// same idea, generalised: a "B licence evening", or anything else that
// doesn't fit a Category and isn't worth wiring up a whole new panel for,
// gets logged here as a label the instructor types plus what they earned,
// rather than turning into a one-off category and a one-off modal.

export interface MiscEntry {
  date: string; // YYYY-MM-DD, local time
  label: string; // what this was for, e.g. "B licence evening"
  amount: number; // what the instructor earned for it, in pounds
  at: string; // ISO timestamp — also this entry's id, for deletion
}

/** Today's miscellaneous entries — the shape the Tandems tab renders. */
export interface MiscDayState {
  date: string;
  entries: MiscEntry[];
}

export function totalMiscEarnings(entries: MiscEntry[]): number {
  return entries.reduce((sum, e) => sum + e.amount, 0);
}
