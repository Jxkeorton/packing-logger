// The universal (client-safe) half of the main app's src/lib/tandem.ts —
// see $lib/packing.ts for why this split exists.
export const CATEGORIES = ['instructor', 'videographer', 'aff'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  instructor: 'Instructor',
  videographer: 'Videographer',
  aff: 'AFF Instructor',
};

/**
 * How each category reads inside the card's "+ Add … jump" button, where
 * the label is used mid-sentence. Lowercasing CATEGORY_LABELS was fine
 * while both were ordinary words, but "add aff instructor jump" is not —
 * AFF is an initialism and has to stay shouting.
 */
export const CATEGORY_ACTION_LABELS: Record<Category, string> = {
  instructor: 'instructor',
  videographer: 'videographer',
  aff: 'AFF',
};

/**
 * The student levels offered when an AFF jump is added by hand.
 *
 * A fixed list rather than free text, because these are the only things
 * anyone taps in — but *not* a closed set as far as storage is concerned:
 * a level synced from the manifest is stored verbatim as the board words
 * it (see burble.ts's affStudent), so a DZ writing something this list
 * has never heard of still round-trips intact rather than being coerced
 * or dropped. `Level N` matches Langar's own board wording exactly, which
 * is what keeps a hand-typed jump and a synced one reading alike.
 */
export const AFF_LEVELS = [
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Level 5',
  'Level 6',
  'Level 7',
  'Level 8',
  'Consol',
] as const;

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
  aff: 'AFF Instructor',
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
  aff: 'Second instructor',
};

export const RATES: Record<Category, number> = {
  instructor: 42,
  videographer: 42,
  aff: 42,
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

/**
 * What a tandem instructor earns on top of RATES.instructor for shooting
 * "handy cam" footage themselves — a customer who's bought the Ultimate
 * package but has no dedicated videographer booked. A flat bonus rather
 * than its own category: it's still an instructor jump in every other
 * respect (same rig, same rate), just with one add-on line on the
 * invoice (see invoice-pdf.ts).
 */
export const HANDY_CAM_BONUS_RATE = 20;

export type Counts = Record<Category, number>;

export interface Jump {
  date: string; // YYYY-MM-DD, local time
  category: Category;
  name: string; // customer's (or, on an AFF jump, the student's) name, for the invoice
  /**
   * The AFF student's level — '' on every other category, and on an AFF
   * jump the manifest showed no student slot for. Free text rather than
   * a union of AFF_LEVELS on purpose: the board is the source of truth
   * for a synced jump and its wording is the DZ's, not ours.
   */
  level: string;
  /**
   * True when this jump earns the handy-cam bonus — only ever on an
   * 'instructor' jump; every other category is dropped to false the same
   * way `level` is dropped outside 'aff' (see addJump/setJumpHandyCam in
   * server/tandem.ts).
   */
  handyCam: boolean;
  /**
   * ISO timestamp of the last time `handyCam` was set true, '' otherwise.
   * A customer can upgrade to Ultimate after the jump, once home — so
   * this, not `date`, is what decides which invoice period the bonus
   * bills into (see handyCamJumpsInRange): flagged at logging time, it
   * lands in the same period as the jump; flagged later, once a period
   * has already closed, it rolls into whichever period the update
   * actually happened in.
   */
  handyCamAt: string;
  /**
   * Whether this bonus is billed as "purchased after the jump" rather
   * than "the Ultimate package, bought upfront" — the employer wants the
   * two kept apart on the invoice (see invoice-pdf.ts's two Handy Cam
   * Footage sections). Meaningless when `handyCam` is false, and always
   * false there.
   *
   * A jump synced from the manifest as Ultimate, or flagged from the
   * manual "+ Add instructor jump" checkbox, is always the package —
   * both are known upfront, so addJump never sets this true. It's only
   * ever true when set from the History tab, which defaults it true on
   * the assumption that back-flagging a past jump *is* the "customer
   * upgraded once home" case — but stays an editable checkbox there, for
   * the times that assumption is wrong (see setJumpHandyCam).
   */
  handyCamAfterJump: boolean;
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
  return { instructor: 0, videographer: 0, aff: 0 };
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
