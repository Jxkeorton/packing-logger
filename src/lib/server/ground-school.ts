// The storage-backed half of the ground-school ledger — see
// $lib/ground-school.ts for the plain-data half this imports (and
// re-exports the type from, unchanged, for callers that shouldn't need
// to know which half a given export lives in). Same shape as
// $lib/server/tandem.ts's jump ledger, minus everything that ledger
// needs and this one doesn't: no category, no name, no legacy header
// migrations to carry forward — this is a brand new file.
import { readText, writeText } from './storage';
import { todayKey } from '../packing';
import { parseCsvRows } from './csv';
import type { GroundSchoolEntry } from '../ground-school';

export type { GroundSchoolEntry };

const ENTRIES_KEY = 'ground-school.csv';
const ENTRIES_HEADER = 'date,amount,at';

async function readEntries(): Promise<GroundSchoolEntry[]> {
  const raw = await readText(ENTRIES_KEY);
  if (!raw) return [];
  const entries: GroundSchoolEntry[] = [];
  for (const row of parseCsvRows(raw)) {
    if (row.join(',') === ENTRIES_HEADER) continue;
    const [date, amountStr, at] = row;
    const amount = Number(amountStr);
    if (!date || !at || !Number.isFinite(amount)) continue;
    entries.push({ date, amount, at });
  }
  return entries;
}

async function writeEntries(entries: GroundSchoolEntry[]): Promise<void> {
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const body = sorted.map((e) => [e.date, e.amount.toFixed(2), e.at].join(',')).join('\n');
  await writeText(ENTRIES_KEY, `${ENTRIES_HEADER}\n${body}\n`);
}

function entriesFor(entries: GroundSchoolEntry[], date: string): GroundSchoolEntry[] {
  return entries.filter((e) => e.date === date).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Today's ground school sessions — the live view the Tandems tab renders. */
export async function loadTodayEntries(): Promise<GroundSchoolEntry[]> {
  const entries = await readEntries();
  return entriesFor(entries, todayKey());
}

/** Record one ground school session for today, earning `amount`. */
export async function addEntry(amount: number, at: string = new Date().toISOString()): Promise<GroundSchoolEntry[]> {
  const entries = await readEntries();
  const today = todayKey();
  entries.push({ date: today, amount, at });
  await writeEntries(entries);
  return entriesFor(entries, today);
}

/** Remove one session by its `at` timestamp (its id) — undoes a mis-tapped amount. */
export async function removeEntry(at: string): Promise<GroundSchoolEntry[]> {
  const entries = await readEntries();
  const remaining = entries.filter((e) => e.at !== at);
  if (remaining.length !== entries.length) {
    await writeEntries(remaining);
  }
  return entriesFor(remaining, todayKey());
}

/**
 * Every session within `startDate`..`endDate` (both YYYY-MM-DD, inclusive),
 * sorted chronologically — the invoice PDF's data source, same shape as
 * tandem.ts's jumpsInRange.
 */
export async function entriesInRange(startDate: string, endDate: string): Promise<GroundSchoolEntry[]> {
  const entries = await readEntries();
  return entries
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
