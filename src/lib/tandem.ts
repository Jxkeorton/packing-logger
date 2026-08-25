// The universal (client-safe) half of the main app's src/lib/tandem.ts —
// see $lib/packing.ts for why this split exists.
export const CATEGORIES = ['instructor', 'videographer'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  instructor: 'Instructor',
  videographer: 'Videographer',
};

export const RATES: Record<Category, number> = {
  instructor: 42,
  videographer: 42,
};

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

export function totalEarnings(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c] * RATES[c], 0);
}

export function toHistoryRow(state: DayState): HistoryRow {
  return {
    date: state.date,
    counts: state.counts,
    totalJumps: totalJumps(state.counts),
    totalEarnings: totalEarnings(state.counts),
  };
}
