// The storage-backed half of the miscellaneous-earnings ledger — see
// $lib/misc-entries.ts for the plain-data half this imports (and
// re-exports the type from, unchanged, for callers that shouldn't need to
// know which half a given export lives in). Same shape as
// $lib/server/ground-school.ts's ledger, plus a `label` column — the one
// thing that makes this generic rather than fixed to "ground school".
import { readText, writeText } from './storage';
import { todayKey } from '../packing';
import { csvEscape, parseCsvRows } from './csv';
import type { MiscEntry } from '../misc-entries';

export type { MiscEntry };

const ENTRIES_KEY = 'misc-entries.csv';
const ENTRIES_HEADER = 'date,label,amount,at';

async function readEntries(): Promise<MiscEntry[]> {
  const raw = await readText(ENTRIES_KEY);
  if (!raw) return [];
  const entries: MiscEntry[] = [];
  for (const row of parseCsvRows(raw)) {
    if (row.join(',') === ENTRIES_HEADER) continue;
    const [date, label, amountStr, at] = row;
    const amount = Number(amountStr);
    if (!date || !label || !at || !Number.isFinite(amount)) continue;
    entries.push({ date, label, amount, at });
  }
  return entries;
}

async function writeEntries(entries: MiscEntry[]): Promise<void> {
  const sorted = [...entries].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const body = sorted.map((e) => [e.date, csvEscape(e.label), e.amount.toFixed(2), e.at].join(',')).join('\n');
  await writeText(ENTRIES_KEY, `${ENTRIES_HEADER}\n${body}\n`);
}

function entriesFor(entries: MiscEntry[], date: string): MiscEntry[] {
  return entries.filter((e) => e.date === date).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/** Today's miscellaneous entries — the live view the Tandems tab renders. */
export async function loadTodayEntries(): Promise<MiscEntry[]> {
  const entries = await readEntries();
  return entriesFor(entries, todayKey());
}

/** Record one miscellaneous entry for today, earning `amount` for `label`. */
export async function addEntry(label: string, amount: number, at: string = new Date().toISOString()): Promise<MiscEntry[]> {
  const entries = await readEntries();
  const today = todayKey();
  entries.push({ date: today, label, amount, at });
  await writeEntries(entries);
  return entriesFor(entries, today);
}

/** Remove one entry by its `at` timestamp (its id) — undoes a mis-tapped amount or label. */
export async function removeEntry(at: string): Promise<MiscEntry[]> {
  const entries = await readEntries();
  const remaining = entries.filter((e) => e.at !== at);
  if (remaining.length !== entries.length) {
    await writeEntries(remaining);
  }
  return entriesFor(remaining, todayKey());
}

/**
 * Correct the label and/or amount of an existing entry, found by its `at`
 * id — its date and id are never touched, so this can't move an entry to a
 * different day/week/month bucket or change what "undo" (removeEntry)
 * would target. A no-op if `at` doesn't match anything, same as
 * removeEntry above.
 */
export async function updateEntry(at: string, label: string, amount: number): Promise<MiscEntry[]> {
  const entries = await readEntries();
  const entry = entries.find((e) => e.at === at);
  if (entry) {
    entry.label = label;
    entry.amount = amount;
    await writeEntries(entries);
  }
  return entriesFor(entries, todayKey());
}

/**
 * Every past entry — excludes today, which the Tandems tab already shows
 * live via loadTodayEntries — sorted chronologically. The work-jumps
 * History tab's data source, same "past only" split as ground-school.ts's
 * own readHistory.
 */
export async function readHistory(): Promise<MiscEntry[]> {
  const entries = await readEntries();
  const today = todayKey();
  return entries.filter((e) => e.date !== today).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * Every entry within `startDate`..`endDate` (both YYYY-MM-DD, inclusive),
 * sorted chronologically — the invoice PDF's data source, same shape as
 * ground-school.ts's own entriesInRange.
 */
export async function entriesInRange(startDate: string, endDate: string): Promise<MiscEntry[]> {
  const entries = await readEntries();
  return entries
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}
