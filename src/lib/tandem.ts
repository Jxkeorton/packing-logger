// The universal (client-safe) half of the main app's src/lib/tandem.ts —
// see $lib/packing.ts for why this split exists.
export const CATEGORIES = ['instructor', 'videographer'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  instructor: 'Instructor',
  videographer: 'Videographer',
};

/**
 * Logbook jump-type names given to jumps auto-logged from the Tandems tab.
 *
 * Shared rather than written inline where they're used: the server picks the
 * name when auto-logging (actions/tandem.ts) and the logbook list matches on
 * it to flag camera jumps (LogForm.svelte). Two copies of a bare string that
 * have to stay identical is exactly how one of them quietly drifts.
 */
export const TANDEM_JUMP_TYPES: Record<Category, string> = {
  instructor: 'Tandem Instructor',
  videographer: 'Tandem Camera',
};

/**
 * What the *other* person on the jump is called, for the category you're
 * logging: an instructor jump's other staff member is the camera flyer, a
 * camera jump's is the instructor. Shared for the same reason as
 * TANDEM_JUMP_TYPES above — the modal labels its input with it and the
 * server writes it into the auto-logged jump's description.
 */
export const OTHER_STAFF_LABELS: Record<Category, string> = {
  instructor: 'Camera flyer',
  videographer: 'Instructor',
};

export const RATES: Record<Category, number> = {
  instructor: 42,
  videographer: 42,
};

/**
 * What a customer is actually billed for a videographer jump's video &
 * photos package — higher than RATES.videographer because the invoice
 * itemises it as a gross package charge with a separate "flight ticket"
 * deduction beneath it (see invoice-pdf.ts), rather than a single net
 * line. The deduction isn't its own constant: it's derived as
 * VIDEOGRAPHER_PACKAGE_RATE - RATES.videographer, so the two invoice
 * lines always net out to the same per-jump figure this app pays out
 * and totals everywhere else, even if either rate above changes later.
 */
export const VIDEOGRAPHER_PACKAGE_RATE = 92;

export type Counts = Record<Category, number>;

export interface Jump {
  date: string; // YYYY-MM-DD, local time
  category: Category;
  name: string; // customer's name, for the invoice
  at: string; // ISO timestamp — also this jump's id, for deletion
}

export interface DayState {
  date: string;
  counts: Counts;
  entries: Record<Category, Jump[]>;
}

export interface HistoryRow {
  date: string;
  counts: Counts;
  totalJumps: number;
  totalEarnings: number;
}

export function zeroCounts(): Counts {
  return { instructor: 0, videographer: 0 };
}

export function totalJumps(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}

// `rates` defaults to the hardcoded RATES above — see $lib/packing.ts's
// identical totalEarnings for why: real callers always pass the actual
// settings-backed rates explicitly (rate-settings.ts), this default is
// for callers deliberately exercising the hardcoded values (this file's
// own tests, tandem-invoice.test.ts).
export function totalEarnings(counts: Counts, rates: Record<Category, number> = RATES): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c] * rates[c], 0);
}

export function toHistoryRow(state: DayState, rates: Record<Category, number> = RATES): HistoryRow {
  return {
    date: state.date,
    counts: state.counts,
    totalJumps: totalJumps(state.counts),
    totalEarnings: totalEarnings(state.counts, rates),
  };
}
