// The shared machinery behind the small "one CSV row per entry, keyed by
// its `at` timestamp" ledgers (ground-school.ts, misc-entries.ts). Each of
// those only differs in its storage key, its columns and how a row maps to
// an entry — the today/history/range views and the add/remove plumbing were
// line-for-line copies of each other, so a fix to one could quietly miss
// the other.
import { readText, writeText } from './storage';
import { todayKey } from '../packing';
import { parseCsvRows } from './csv';

/** Chronological order by `at` — an ISO timestamp, so string order is time order. */
export function byAt(a: { at: string }, b: { at: string }): number {
  return a.at < b.at ? -1 : a.at > b.at ? 1 : 0;
}

export interface LedgerConfig<E> {
  /** Storage key, e.g. 'ground-school.csv'. */
  key: string;
  /** The exact header line — skipped on read, written first on every write. */
  header: string;
  /** One parsed CSV row to an entry, or null to drop a malformed row. */
  parseRow: (row: string[]) => E | null;
  /** One entry to its CSV fields (already escaped), in header order. */
  formatRow: (entry: E) => string[];
}

export function createLedger<E extends { date: string; at: string }>(config: LedgerConfig<E>) {
  async function read(): Promise<E[]> {
    const raw = await readText(config.key);
    if (!raw) return [];
    const entries: E[] = [];
    for (const row of parseCsvRows(raw)) {
      if (row.join(',') === config.header) continue;
      const entry = config.parseRow(row);
      if (entry) entries.push(entry);
    }
    return entries;
  }

  async function write(entries: E[]): Promise<void> {
    const body = [...entries]
      .sort(byAt)
      .map((e) => config.formatRow(e).join(','))
      .join('\n');
    await writeText(config.key, `${config.header}\n${body}\n`);
  }

  function todayOf(entries: E[]): E[] {
    const today = todayKey();
    return entries.filter((e) => e.date === today).sort(byAt);
  }

  return {
    read,
    write,
    /** The subset of `entries` logged today, oldest first — what every mutation hands back. */
    todayOf,

    async today(): Promise<E[]> {
      return todayOf(await read());
    },

    async add(entry: E): Promise<E[]> {
      const entries = await read();
      entries.push(entry);
      await write(entries);
      return todayOf(entries);
    },

    /** A no-op (no write) if `at` doesn't match anything. */
    async remove(at: string): Promise<E[]> {
      const entries = await read();
      const remaining = entries.filter((e) => e.at !== at);
      if (remaining.length !== entries.length) {
        await write(remaining);
      }
      return todayOf(remaining);
    },

    /** Everything except today, oldest first. */
    async history(): Promise<E[]> {
      const today = todayKey();
      return (await read()).filter((e) => e.date !== today).sort(byAt);
    },

    /** `startDate`..`endDate` (both YYYY-MM-DD, inclusive), oldest first. */
    async inRange(startDate: string, endDate: string): Promise<E[]> {
      return (await read()).filter((e) => e.date >= startDate && e.date <= endDate).sort(byAt);
    },
  };
}
