// Personal skydive logbook — one row per jump, kept as a ledger (like the
// tandem jump log) rather than a daily tally, since every jump carries its
// own place/altitude/equipment/description.
//
// Jump numbers are never stored: they're computed from the ledger's
// chronological order plus a configurable starting offset (see
// ./logbook-settings). That way deleting an old jump, or correcting its
// date, keeps every number after it gap-free — same as a paper logbook,
// where you'd cross out and renumber rather than leave a hole.
import { readText, writeText } from './storage';
import { csvEscape, parseCsvLine } from './csv';

export interface LogbookEntry {
  date: string; // YYYY-MM-DD, local time
  place: string;
  exitAltitude: string; // free text ("13,000 ft") — not every jump has a clean round number
  canopy: string;
  container: string;
  aad: string;
  aircraft: string;
  jumpType: string; // e.g. "Sport", "Tandem Instructor" — see logbook-settings.ts's saved jump types
  description: string;
  at: string; // ISO timestamp this entry was logged — also its id, for edit/delete
}

export interface NumberedEntry extends LogbookEntry {
  number: number;
}

const ENTRIES_KEY = 'logbook.csv';
// jump_type is appended after `at` rather than inserted earlier in the row,
// so older rows written before this field existed still parse correctly —
// they simply come up one field short and jumpType defaults to ''.
const ENTRIES_HEADER = 'date,place,exit_altitude,canopy,container,aad,aircraft,description,at,jump_type';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function readEntries(): Promise<LogbookEntry[]> {
  const raw = await readText(ENTRIES_KEY);
  if (!raw) return [];
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  const entries: LogbookEntry[] = [];
  for (const line of lines) {
    const [date, place, exitAltitude, canopy, container, aad, aircraft, description, at, jumpType] = parseCsvLine(line);
    // Recognize a header row by shape (its first field isn't a real date),
    // not by an exact string match against the current ENTRIES_HEADER —
    // that string has changed as fields were added, and a file written
    // under an older header would otherwise have its header line
    // misparsed as one bogus data row (date="date", at="at", ...).
    if (!DATE_RE.test(date ?? '') || !at) continue;
    entries.push({
      date,
      place: place ?? '',
      exitAltitude: exitAltitude ?? '',
      canopy: canopy ?? '',
      container: container ?? '',
      aad: aad ?? '',
      aircraft: aircraft ?? '',
      description: description ?? '',
      at,
      jumpType: jumpType ?? '',
    });
  }
  return entries;
}

function sortAscending(entries: LogbookEntry[]): LogbookEntry[] {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
  });
}

async function writeEntries(entries: LogbookEntry[]): Promise<void> {
  const sorted = sortAscending(entries);
  const body = sorted
    .map((e) =>
      [
        e.date,
        csvEscape(e.place),
        csvEscape(e.exitAltitude),
        csvEscape(e.canopy),
        csvEscape(e.container),
        csvEscape(e.aad),
        csvEscape(e.aircraft),
        csvEscape(e.description),
        e.at,
        csvEscape(e.jumpType),
      ].join(','),
    )
    .join('\n');
  await writeText(ENTRIES_KEY, `${ENTRIES_HEADER}\n${body}\n`);
}

function withNumbers(entries: LogbookEntry[], baseJumps: number): NumberedEntry[] {
  return sortAscending(entries).map((e, i) => ({ ...e, number: baseJumps + i + 1 }));
}

/** Every jump, newest first, with jump numbers computed from `baseJumps`. */
export async function readLogbook(baseJumps: number): Promise<NumberedEntry[]> {
  const entries = await readEntries();
  return withNumbers(entries, baseJumps).reverse();
}

/** The number the next logged jump would get. */
export async function nextJumpNumber(baseJumps: number): Promise<number> {
  const entries = await readEntries();
  return baseJumps + entries.length + 1;
}

export type EntryInput = Omit<LogbookEntry, 'at'>;

/**
 * Record a new jump. `at` defaults to now, but can be passed explicitly so
 * a caller (see api/tandem-adjust.ts) can share the same id with a linked
 * record in another ledger — a tandem jump auto-logged here too. Returns
 * the newest-first, numbered list.
 */
export async function addEntry(input: EntryInput, baseJumps: number, at: string = new Date().toISOString()): Promise<NumberedEntry[]> {
  const entries = await readEntries();
  entries.push({ ...input, at });
  await writeEntries(entries);
  return withNumbers(entries, baseJumps).reverse();
}

/**
 * Overwrite an existing jump's details (its `at` — and so its identity and
 * insertion-order tiebreak — is kept). Returns null if no entry has that id.
 */
export async function updateEntry(at: string, input: EntryInput, baseJumps: number): Promise<NumberedEntry[] | null> {
  const entries = await readEntries();
  const idx = entries.findIndex((e) => e.at === at);
  if (idx === -1) return null;
  entries[idx] = { ...input, at };
  await writeEntries(entries);
  return withNumbers(entries, baseJumps).reverse();
}

/** Delete a jump by id. Returns the newest-first, numbered list either way. */
export async function removeEntry(at: string, baseJumps: number): Promise<NumberedEntry[]> {
  const entries = await readEntries();
  const remaining = entries.filter((e) => e.at !== at);
  if (remaining.length !== entries.length) {
    await writeEntries(remaining);
  }
  return withNumbers(remaining, baseJumps).reverse();
}

/**
 * The full log as a CSV, oldest jump first with its jump number — the order
 * and shape of a physical logbook — for download/export.
 */
export async function readCsvFile(baseJumps: number): Promise<string> {
  const entries = await readEntries();
  const numbered = withNumbers(entries, baseJumps);
  const header = 'jump_number,date,jump_type,place,exit_altitude,canopy,container,aad,aircraft,description';
  const body = numbered
    .map((e) =>
      [
        e.number,
        e.date,
        csvEscape(e.jumpType),
        csvEscape(e.place),
        csvEscape(e.exitAltitude),
        csvEscape(e.canopy),
        csvEscape(e.container),
        csvEscape(e.aad),
        csvEscape(e.aircraft),
        csvEscape(e.description),
      ].join(','),
    )
    .join('\n');
  return `${header}\n${body}\n`;
}
