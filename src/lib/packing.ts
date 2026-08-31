// The universal (client-safe) half of the main app's src/lib/packing.ts —
// categories/labels/rates and the pure total functions, split out from
// the storage-touching functions in $lib/server/packing.ts. This split
// didn't exist in the Astro app because it never needed one: an Astro
// component's frontmatter and its hand-written client <script> are two
// separate worlds by construction, so lib/client/packing-tab.ts just
// carried its own duplicate `const RATES = {...}` rather than share this
// module. SvelteKit's stricter server/client boundary ($lib/server/* is
// blocked from client-reachable code) forced the split — which then
// removes that duplication instead of requiring it.
export const CATEGORIES = ['tandem', 'instructor', 'student', 'sport'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tandem: 'Tandem',
  instructor: 'Instructor',
  student: 'Student',
  sport: 'Sport',
};

export const RATES: Record<Category, number> = {
  tandem: 11,
  instructor: 6.5,
  student: 6.5,
  sport: 6.5,
};

export type Counts = Record<Category, number>;

export interface DayState {
  date: string; // YYYY-MM-DD, local time
  counts: Counts;
}

export interface HistoryRow {
  date: string;
  counts: Counts;
  totalPacks: number;
  totalEarnings: number;
}

export function zeroCounts(): Counts {
  return { tandem: 0, instructor: 0, student: 0, sport: 0 };
}

/** Today's date as YYYY-MM-DD in local time. */
export function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function totalPacks(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}

// `rates` defaults to the hardcoded RATES above rather than requiring
// every caller to pass them — server code always passes the actual
// settings-backed rates explicitly (see rate-settings.ts), so this
// default only ever matters for a caller (chiefly this file's own
// tests, and invoice.test.ts/tandem-invoice.test.ts's tandem
// equivalent) that's deliberately exercising the hardcoded values.
export function totalEarnings(counts: Counts, rates: Record<Category, number> = RATES): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c] * rates[c], 0);
}

export function toHistoryRow(state: DayState, rates: Record<Category, number> = RATES): HistoryRow {
  return {
    date: state.date,
    counts: state.counts,
    totalPacks: totalPacks(state.counts),
    totalEarnings: totalEarnings(state.counts, rates),
  };
}
