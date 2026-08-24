// Tandem jump log — separate from the pack-job log (./packing). Unlike
// packing (which only ever needed a daily tally), each tandem jump has a
// customer whose name has to appear on the invoice, so this log is kept as
// a ledger of individual jumps rather than a running count: one row per
// jump, with the customer's name on it. Daily/weekly/monthly totals are
// derived from that ledger rather than stored separately, so there's only
// ever one source of truth.
import { readText, writeText } from './storage';
import { todayKey } from './packing';

// Both roles are paid the same flat rate per jump; they're kept as separate
// categories purely so the log shows how many of each were flown.
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

const JUMPS_KEY = 'tandem-jumps.csv';
const JUMPS_HEADER = 'date,category,name,at';

function zeroCounts(): Counts {
  return { instructor: 0, videographer: 0 };
}

export function totalJumps(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c], 0);
}

export function totalEarnings(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c] * RATES[c], 0);
}

// Customer names are the one field in this app's CSVs that's free text, so
// this is the one file that needs real CSV quoting (commas/quotes/newlines
// in a name shouldn't corrupt the row layout).
function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

async function readJumps(): Promise<Jump[]> {
  const raw = await readText(JUMPS_KEY);
  if (!raw) return [];
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const jumps: Jump[] = [];
  for (const line of lines) {
    if (line.trim() === JUMPS_HEADER) continue;
    const [date, category, name, at] = parseCsvLine(line);
    if (!date || !at || !CATEGORIES.includes(category as Category)) continue;
    jumps.push({ date, category: category as Category, name: name ?? '', at });
  }
  return jumps;
}

async function writeJumps(jumps: Jump[]): Promise<void> {
  const sorted = [...jumps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const body = sorted.map((j) => [j.date, j.category, csvEscape(j.name), j.at].join(',')).join('\n');
  await writeText(JUMPS_KEY, `${JUMPS_HEADER}\n${body}\n`);
}

export interface DayState {
  date: string;
  counts: Counts;
  entries: Record<Category, Jump[]>;
}

function entriesFor(jumps: Jump[], date: string): Record<Category, Jump[]> {
  const out: Record<Category, Jump[]> = { instructor: [], videographer: [] };
  for (const j of jumps) {
    if (j.date === date) out[j.category].push(j);
  }
  return out;
}

function countsFromEntries(entries: Record<Category, Jump[]>): Counts {
  return { instructor: entries.instructor.length, videographer: entries.videographer.length };
}

function stateFor(jumps: Jump[], date: string): DayState {
  const entries = entriesFor(jumps, date);
  return { date, counts: countsFromEntries(entries), entries };
}

/** Today's jumps, grouped by category — the live view the Tandems tab renders. */
export async function loadTodayState(): Promise<DayState> {
  const jumps = await readJumps();
  return stateFor(jumps, todayKey());
}

/** Record one jump for today under `category`, crediting `name`. */
export async function addJump(category: Category, name: string): Promise<DayState> {
  const jumps = await readJumps();
  const today = todayKey();
  jumps.push({ date: today, category, name, at: new Date().toISOString() });
  await writeJumps(jumps);
  return stateFor(jumps, today);
}

/**
 * Remove a single jump by its `at` timestamp (its id) — used to undo a
 * mis-tap or fix a typo'd name by re-adding it. Returns today's state
 * whether or not the removed jump was actually from today, since that's
 * what the Tandems tab has on screen.
 */
export async function removeJump(at: string): Promise<DayState> {
  const jumps = await readJumps();
  const remaining = jumps.filter((j) => j.at !== at);
  if (remaining.length !== jumps.length) {
    await writeJumps(remaining);
  }
  return stateFor(remaining, todayKey());
}

/**
 * Replace all of a past day's jumps with a fresh list of customer names —
 * for backfilling a day logged on paper, or correcting a mistake, rather
 * than adding/removing one at a time.
 */
export async function setDayEntries(date: string, names: Record<Category, string[]>): Promise<DayState> {
  const jumps = await readJumps();
  const remaining = jumps.filter((j) => j.date !== date);

  // Synthetic, strictly-increasing timestamps so entries from the same
  // backfill sort in the order they were given rather than colliding.
  const base = new Date(`${date}T12:00:00.000Z`).getTime();
  let offset = 0;
  for (const category of CATEGORIES) {
    for (const name of names[category] ?? []) {
      remaining.push({ date, category, name, at: new Date(base + offset).toISOString() });
      offset += 1;
    }
  }

  await writeJumps(remaining);
  return stateFor(remaining, date);
}

/** The raw jump ledger as a CSV, for download/export — this is the invoice source. */
export async function readCsvFile(): Promise<string> {
  const jumps = await readJumps();
  const sorted = [...jumps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const header = 'date,category,name,amount,at';
  const body = sorted
    .map((j) => [j.date, j.category, csvEscape(j.name), RATES[j.category].toFixed(2), j.at].join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

export interface HistoryRow {
  date: string;
  counts: Counts;
  totalJumps: number;
  totalEarnings: number;
}

export function toHistoryRow(state: DayState): HistoryRow {
  return {
    date: state.date,
    counts: state.counts,
    totalJumps: totalJumps(state.counts),
    totalEarnings: totalEarnings(state.counts),
  };
}

/** Most recent history rows (excluding today), newest first, one per day. */
export async function readHistory(limit = 14): Promise<HistoryRow[]> {
  const jumps = await readJumps();
  const today = todayKey();

  const byDate = new Map<string, Counts>();
  for (const j of jumps) {
    if (j.date === today) continue;
    const counts = byDate.get(j.date) ?? zeroCounts();
    counts[j.category] += 1;
    byDate.set(j.date, counts);
  }

  const dates = [...byDate.keys()].sort().reverse().slice(0, limit);
  return dates.map((date) => {
    const counts = byDate.get(date)!;
    return {
      date,
      counts,
      totalJumps: totalJumps(counts),
      totalEarnings: totalEarnings(counts),
    };
  });
}
