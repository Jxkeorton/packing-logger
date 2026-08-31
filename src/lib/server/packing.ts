// The storage-backed half of the main app's src/lib/packing.ts — see
// $lib/packing.ts for the categories/rates/pure-total half this imports.
import { readText, writeText } from './storage';
import { CATEGORIES, todayKey, totalEarnings, totalPacks, zeroCounts, type Category, type Counts, type DayState, type HistoryRow } from '../packing';
import { readRateSettings } from './rate-settings';

export type { Category, Counts, DayState, HistoryRow };

const STATE_KEY = 'state.json';
const CSV_KEY = 'packing-log.csv';

const CSV_HEADER = 'date,tandem,instructor,student,sport,total_packs,total_earnings';

async function readState(): Promise<DayState | null> {
  const raw = await readText(STATE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed.date === 'string' &&
      parsed.counts &&
      CATEGORIES.every((c) => typeof parsed.counts[c] === 'number')
    ) {
      return parsed as DayState;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeState(state: DayState): Promise<void> {
  await writeText(STATE_KEY, JSON.stringify(state, null, 2));
}

function formatMoney(n: number): string {
  return n.toFixed(2);
}

function csvEscapeDate(date: string): string {
  // Dates are always YYYY-MM-DD, no escaping needed, but keep this in case
  // the format ever changes.
  return date;
}

/** Read all rows currently in the CSV log, keyed by date. */
async function readCsvRows(): Promise<Map<string, string>> {
  const rows = new Map<string, string>();
  const raw = await readText(CSV_KEY);
  if (!raw) return rows;
  const lines = raw.split('\n').filter((l: string) => l.trim().length > 0);
  for (const line of lines) {
    if (line.trim() === CSV_HEADER) continue;
    const date = line.split(',')[0];
    if (date) rows.set(date, line);
  }
  return rows;
}

/** Insert or update the CSV row for a given day's totals, keeping dates in order. */
async function upsertCsvRow(state: DayState): Promise<void> {
  const rows = await readCsvRows();
  const rates = await readRateSettings();
  const packs = totalPacks(state.counts);
  const earnings = totalEarnings(state.counts, rates.packing);
  const line = [
    csvEscapeDate(state.date),
    state.counts.tandem,
    state.counts.instructor,
    state.counts.student,
    state.counts.sport,
    packs,
    formatMoney(earnings),
  ].join(',');
  rows.set(state.date, line);

  const sortedDates = [...rows.keys()].sort();
  const body = sortedDates.map((d) => rows.get(d)).join('\n');
  await writeText(CSV_KEY, `${CSV_HEADER}\n${body}\n`);
}

/**
 * Load today's state, rolling over from a previous day if needed.
 * The outgoing day's totals are guaranteed to already be in the CSV
 * (every mutation upserts its row), so rollover just resets counts to zero.
 */
export async function loadTodayState(): Promise<DayState> {
  const today = todayKey();
  const existing = await readState();

  if (existing && existing.date === today) {
    return existing;
  }

  // New day (or first run ever). Make sure the previous day's totals are
  // flushed to the CSV before starting a fresh count at zero.
  if (existing) {
    await upsertCsvRow(existing);
  }

  const fresh: DayState = { date: today, counts: zeroCounts() };
  await writeState(fresh);
  await upsertCsvRow(fresh);
  return fresh;
}

/** Adjust today's count for a category by `delta` (can be negative), floored at 0. */
export async function adjustCount(category: Category, delta: number): Promise<DayState> {
  const state = await loadTodayState();
  const next: DayState = {
    date: state.date,
    counts: { ...state.counts, [category]: Math.max(0, state.counts[category] + delta) },
  };
  await writeState(next);
  await upsertCsvRow(next);
  return next;
}

/**
 * Set (overwrite) a day's counts directly — for backfilling a day you
 * forgot to log, or correcting a mistake, rather than tapping through
 * +/- from zero. If `date` is today, today's live counts are updated too
 * so the on-screen totals stay in sync; otherwise only the CSV row for
 * that date is touched.
 */
export async function setDayCounts(date: string, counts: Counts): Promise<DayState> {
  const dayState: DayState = { date, counts };
  await upsertCsvRow(dayState);
  if (date === todayKey()) {
    await writeState(dayState);
  }
  return dayState;
}

/** The raw CSV log, for download/export. */
export async function readCsvFile(): Promise<string> {
  return (await readText(CSV_KEY)) ?? `${CSV_HEADER}\n`;
}

/** Most recent history rows (excluding today), newest first. */
export async function readHistory(limit = 14): Promise<HistoryRow[]> {
  const rows = await readCsvRows();
  const rates = await readRateSettings();
  const today = todayKey();
  const dates = [...rows.keys()]
    .filter((d) => d !== today)
    .sort()
    .reverse()
    .slice(0, limit);

  return dates.map((date) => {
    const line = rows.get(date)!;
    const [, tandem, instructor, student, sport] = line.split(',');
    const counts: Counts = {
      tandem: Number(tandem),
      instructor: Number(instructor),
      student: Number(student),
      sport: Number(sport),
    };
    return {
      date,
      counts,
      totalPacks: totalPacks(counts),
      totalEarnings: totalEarnings(counts, rates.packing),
    };
  });
}
