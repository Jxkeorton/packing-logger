// The storage-backed half of the main app's src/lib/tandem.ts — see
// $lib/tandem.ts for the categories/rates/pure-total half this imports
// (and re-exports toHistoryRow from, unchanged, since callers importing
// "the tandem module" shouldn't need to know which half a given export
// lives in).
import { readText, writeText } from './storage';
import { todayKey } from '../packing';
import { csvEscape, parseCsvRows } from './csv';
import { readRateSettings } from './rate-settings';
import {
  CATEGORIES,
  totalEarnings,
  totalJumps,
  zeroCounts,
  type Category,
  type Counts,
  type DayState,
  type HistoryRow,
  type Jump,
} from '../tandem';

export type { Category, Counts, DayState, HistoryRow, Jump };
export { toHistoryRow } from '../tandem';

const JUMPS_KEY = 'tandem-jumps.csv';
const JUMPS_HEADER = 'date,category,name,at';

async function readJumps(): Promise<Jump[]> {
  const raw = await readText(JUMPS_KEY);
  if (!raw) return [];
  // Customer names are cleaned with oneLine() so they shouldn't contain a
  // line break today, but parse whole rows anyway — the alternative silently
  // drops a record if one ever does (see parseCsvRows, and the logbook bug
  // that motivated it) rather than failing loudly.
  const jumps: Jump[] = [];
  for (const row of parseCsvRows(raw)) {
    if (row.join(',') === JUMPS_HEADER) continue;
    const [date, category, name, at] = row;
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

/**
 * Record one jump for today under `category`, crediting `name`. `at`
 * defaults to now, but can be passed explicitly so a caller (the
 * tandem-jump route action) can share the same id with a linked record
 * in another ledger — the personal logbook's auto-logged tandem entries.
 */
export async function addJump(category: Category, name: string, at: string = new Date().toISOString()): Promise<DayState> {
  const jumps = await readJumps();
  const today = todayKey();
  jumps.push({ date: today, category, name, at });
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

/**
 * The raw jump ledger as a CSV, for download/export — this is the
 * invoice source. `amount` is each jump's category rate as it stands
 * right now, not whatever it was on the day the jump happened — the
 * same "always current, no historical snapshot" rate model this app
 * already used before rates were editable (see rate-settings.ts).
 */
export async function readCsvFile(): Promise<string> {
  const jumps = await readJumps();
  const rates = await readRateSettings();
  const sorted = [...jumps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const header = 'date,category,name,amount,at';
  const body = sorted
    .map((j) => [j.date, j.category, csvEscape(j.name), rates.tandem[j.category].toFixed(2), j.at].join(','))
    .join('\n');
  return `${header}\n${body}\n`;
}

/** Shared by readHistory() and loadTodayStateAndHistory() — both derive this from the same jump list, just from different reads of it. */
function historyFromJumps(jumps: Jump[], rates: Record<Category, number>, limit: number): HistoryRow[] {
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
      totalEarnings: totalEarnings(counts, rates),
    };
  });
}

/** Most recent history rows (excluding today), newest first, one per day. */
export async function readHistory(limit = 14): Promise<HistoryRow[]> {
  const [jumps, rates] = await Promise.all([readJumps(), readRateSettings()]);
  return historyFromJumps(jumps, rates.tandem, limit);
}

/**
 * loadTodayState() + readHistory() in one read of tandem-jumps.csv
 * instead of two — both were independently calling readJumps() on
 * every page load (the whole file, re-parsed twice, for what's the
 * same jump list either way). Used by +page.server.ts, which needs
 * both; loadTodayState()/readHistory() stay as their own functions for
 * the callers (actions, mostly) that only ever need one of them.
 */
export async function loadTodayStateAndHistory(limit = 14): Promise<{ state: DayState; history: HistoryRow[] }> {
  const [jumps, rates] = await Promise.all([readJumps(), readRateSettings()]);
  return {
    state: stateFor(jumps, todayKey()),
    history: historyFromJumps(jumps, rates.tandem, limit),
  };
}

/**
 * Every jump within `startDate`..`endDate` (both YYYY-MM-DD, inclusive),
 * grouped by category and sorted chronologically — the invoice PDF's data
 * source.
 */
export async function jumpsInRange(startDate: string, endDate: string): Promise<Record<Category, Jump[]>> {
  const jumps = await readJumps();
  const out: Record<Category, Jump[]> = { instructor: [], videographer: [] };
  for (const j of jumps) {
    if (j.date >= startDate && j.date <= endDate) out[j.category].push(j);
  }
  for (const category of CATEGORIES) {
    out[category].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }
  return out;
}
