import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

// Categories of pack job, in display order.
export const CATEGORIES = ['tandem', 'instructor', 'student', 'sport'] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  tandem: 'Tandem',
  instructor: 'Instructor',
  student: 'Student',
  sport: 'Sport',
};

// What each pack job type pays.
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

const DATA_DIR = path.join(process.cwd(), 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const CSV_FILE = path.join(DATA_DIR, 'packing-log.csv');

const CSV_HEADER = 'date,tandem,instructor,student,sport,total_packs,total_earnings';

function zeroCounts(): Counts {
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

export function totalEarnings(counts: Counts): number {
  return CATEGORIES.reduce((sum, c) => sum + counts[c] * RATES[c], 0);
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

async function readState(): Promise<DayState | null> {
  try {
    const raw = await readFile(STATE_FILE, 'utf-8');
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
  await ensureDataDir();
  await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
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
  if (!existsSync(CSV_FILE)) return rows;
  const raw = await readFile(CSV_FILE, 'utf-8');
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
  await ensureDataDir();
  const rows = await readCsvRows();
  const packs = totalPacks(state.counts);
  const earnings = totalEarnings(state.counts);
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
  await writeFile(CSV_FILE, `${CSV_HEADER}\n${body}\n`, 'utf-8');
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

export interface HistoryRow {
  date: string;
  counts: Counts;
  totalPacks: number;
  totalEarnings: number;
}

/** Most recent history rows (excluding today), newest first. */
export async function readHistory(limit = 14): Promise<HistoryRow[]> {
  const rows = await readCsvRows();
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
      totalEarnings: totalEarnings(counts),
    };
  });
}
