// Stopwatch times for individual pack jobs, kept separately from the daily
// counts — this is just a fastest-times board, not tied to a category.
import { readText, writeText } from './storage';

const TIMES_KEY = 'pack-times.json';

// Bounds to keep obviously-bogus entries (a double-tap, or a timer left
// running overnight) off the board.
const MIN_MS = 1000; // 1 second
const MAX_MS = 4 * 60 * 60 * 1000; // 4 hours

// Only the fastest handful are ever shown, but keep a bit more history
// around in storage in case that changes later.
const MAX_STORED = 50;

export interface PackTime {
  ms: number;
  at: string; // ISO timestamp
}

async function readTimes(): Promise<PackTime[]> {
  const raw = await readText(TIMES_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is PackTime => t && typeof t.ms === 'number' && typeof t.at === 'string',
    );
  } catch {
    return [];
  }
}

async function writeTimes(times: PackTime[]): Promise<void> {
  await writeText(TIMES_KEY, JSON.stringify(times, null, 2));
}

export function fastestFive(times: PackTime[]): PackTime[] {
  return [...times].sort((a, b) => a.ms - b.ms).slice(0, 5);
}

/** The current top 5 fastest pack times. */
export async function readFastestFive(): Promise<PackTime[]> {
  return fastestFive(await readTimes());
}

/** Record a finished pack job's time and return the (possibly updated) top 5. */
export async function recordTime(ms: number): Promise<{ time: PackTime | null; top5: PackTime[] }> {
  if (!Number.isFinite(ms) || ms < MIN_MS || ms > MAX_MS) {
    return { time: null, top5: await readFastestFive() };
  }

  const times = await readTimes();
  const entry: PackTime = { ms: Math.round(ms), at: new Date().toISOString() };
  times.push(entry);

  // Trim from the slow end so the file doesn't grow forever, but always
  // keep the fastest ones.
  const trimmed = [...times].sort((a, b) => a.ms - b.ms).slice(0, MAX_STORED);
  await writeTimes(trimmed);

  return { time: entry, top5: fastestFive(trimmed) };
}
