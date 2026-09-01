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

function csvLineFor(state: DayState, rates: Record<Category, number>): string {
  return [
    csvEscapeDate(state.date),
    state.counts.tandem,
    state.counts.instructor,
    state.counts.student,
    state.counts.sport,
    totalPacks(state.counts),
    formatMoney(totalEarnings(state.counts, rates)),
  ].join(',');
}

/** Insert or update the CSV row for a given day's totals, keeping dates in order. */
async function upsertCsvRow(state: DayState): Promise<void> {
  const [rows, rates] = await Promise.all([readCsvRows(), readRateSettings()]);
  rows.set(state.date, csvLineFor(state, rates.packing));

  const sortedDates = [...rows.keys()].sort();
  const body = sortedDates.map((d) => rows.get(d)).join('\n');
  await writeText(CSV_KEY, `${CSV_HEADER}\n${body}\n`);
}

/**
 * Load today's state, rolling over from a previous day if needed.
 * The outgoing day's totals get flushed to the CSV here, at rollover —
 * *not* on every adjustCount() in between (see that function's own
 * comment for why) — so the CSV can be a beat behind the live count for
 * whatever's still today, made whole again by readCsvFile() merging the
 * live state in on demand rather than trusting the file alone.
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

/**
 * Adjust today's count for a category by `delta` (can be negative),
 * floored at 0. Deliberately just the two smallest possible storage
 * round trips — read state.json, write state.json — since this is the
 * hot path a rapid burst of +/- taps drives directly: it used to also
 * re-read and rewrite the *entire* packing-log.csv and re-read rate
 * settings on every single tap (upsertCsvRow, now confined to day
 * rollover and the explicit setDayCounts backfill, both far rarer and
 * fine to pay the extra round trips for). Every network hop here costs
 * a full request to wherever storage.ts is actually pointed — R2 in
 * production — so cutting 5 round trips down to 2 is the real fix for
 * "this should be very quick", not something a different framework
 * would do for free: nothing about Next.js changes how many times this
 * function talks to R2.
 */
export async function adjustCount(category: Category, delta: number): Promise<DayState> {
  const state = await loadTodayState();
  const next: DayState = {
    date: state.date,
    counts: { ...state.counts, [category]: Math.max(0, state.counts[category] + delta) },
  };
  await writeState(next);
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

/**
 * The raw CSV log, for download/export. Merges in today's live counts
 * on the fly rather than reading the file verbatim — adjustCount() no
 * longer keeps today's row in the file up to date tap-by-tap, so
 * without this an export taken mid-day would show today as 0 (or
 * whatever it was at the last rollover) instead of what's actually been
 * packed so far.
 */
export async function readCsvFile(): Promise<string> {
  const [rows, state, rates] = await Promise.all([readCsvRows(), readState(), readRateSettings()]);
  if (state) rows.set(state.date, csvLineFor(state, rates.packing));
  if (rows.size === 0) return `${CSV_HEADER}\n`;
  const sortedDates = [...rows.keys()].sort();
  const body = sortedDates.map((d) => rows.get(d)).join('\n');
  return `${CSV_HEADER}\n${body}\n`;
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
