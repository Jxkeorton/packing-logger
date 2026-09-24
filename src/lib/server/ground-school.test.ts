// `./storage` is mocked with an in-memory Map — see logbook.test.ts's
// header comment for why every server-module suite in this repo has to
// do that. `../packing`'s todayKey() is real time, so tests that care
// about "today" pin the clock with vi.useFakeTimers() the same way
// tandem.test.ts does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { entriesInRange, loadTodayEntries, removeEntry } = await import('./ground-school');

const ENTRIES_KEY = 'ground-school.csv';

/** Nothing in the app adds a ground school session any more, so tests seed the CSV directly. */
function seed(...rows: string[]): void {
  store.set(ENTRIES_KEY, `date,amount,at\n${rows.join('\n')}\n`);
}

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('loadTodayEntries', () => {
  it("returns today's sessions, oldest first", async () => {
    seed('2026-09-06,50.00,2026-09-06T09:00:00.000Z', '2026-09-06,30.00,2026-09-06T08:00:00.000Z');
    expect(await loadTodayEntries()).toEqual([
      { date: '2026-09-06', amount: 30, at: '2026-09-06T08:00:00.000Z' },
      { date: '2026-09-06', amount: 50, at: '2026-09-06T09:00:00.000Z' },
    ]);
  });

  it('does not surface a session logged on a different day', async () => {
    seed('2026-09-05,40.00,2026-09-05T09:00:00.000Z');
    expect(await loadTodayEntries()).toEqual([]);
  });

  it('reads a decimal amount without drift', async () => {
    seed('2026-09-06,37.50,2026-09-06T09:00:00.000Z');
    expect((await loadTodayEntries())[0].amount).toBe(37.5);
  });
});

describe('removeEntry', () => {
  it('removes one session by its at id, leaving the rest', async () => {
    seed('2026-09-06,50.00,2026-09-06T09:00:00.000Z', '2026-09-06,30.00,2026-09-06T10:00:00.000Z');
    const remaining = await removeEntry('2026-09-06T09:00:00.000Z');
    expect(remaining).toEqual([{ date: '2026-09-06', amount: 30, at: '2026-09-06T10:00:00.000Z' }]);
    expect(await loadTodayEntries()).toEqual(remaining);
  });

  it('is a no-op for an id that does not exist', async () => {
    seed('2026-09-06,50.00,2026-09-06T09:00:00.000Z');
    const before = store.get(ENTRIES_KEY);
    await removeEntry('does-not-exist');
    expect(store.get(ENTRIES_KEY)).toBe(before);
  });
});

describe('entriesInRange', () => {
  it('returns only sessions within the inclusive date range, sorted chronologically', async () => {
    // entriesInRange filters on `date`, not `at`.
    store.set(
      ENTRIES_KEY,
      'date,amount,at\n' +
        '2026-08-31,20.00,2026-08-31T09:00:00.000Z\n' +
        '2026-09-10,50.00,2026-09-10T09:00:00.000Z\n' +
        '2026-09-05,30.00,2026-09-05T09:00:00.000Z\n' +
        '2026-10-01,10.00,2026-10-01T09:00:00.000Z\n',
    );

    const inRange = await entriesInRange('2026-09-01', '2026-09-30');
    expect(inRange.map((e) => e.amount)).toEqual([30, 50]);
  });

  it('returns an empty list when nothing has ever been logged', async () => {
    expect(await entriesInRange('2026-09-01', '2026-09-30')).toEqual([]);
  });
});

describe('reading a corrupt or empty file', () => {
  it('reads nothing from an empty store', async () => {
    expect(await loadTodayEntries()).toEqual([]);
  });

  it('skips a row with a non-numeric amount rather than throwing', async () => {
    store.set(ENTRIES_KEY, 'date,amount,at\n2026-09-06,not-a-number,2026-09-06T09:00:00.000Z\n');
    expect(await loadTodayEntries()).toEqual([]);
  });
});
