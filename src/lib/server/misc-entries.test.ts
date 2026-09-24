// `./storage` is mocked with an in-memory Map — see logbook.test.ts's
// header comment for why every server-module suite in this repo has to
// do that. `../packing`'s todayKey() is real time, so tests that care
// about "today" pin the clock with vi.useFakeTimers() the same way
// tandem.test.ts does. Mirrors ground-school.test.ts, plus coverage for
// the one thing this ledger adds over that one: a free-text label.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { addEntry, entriesInRange, loadTodayEntries, removeEntry, updateEntry } = await import('./misc-entries');

const ENTRIES_KEY = 'misc-entries.csv';

beforeEach(() => {
  store.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('addEntry / loadTodayEntries', () => {
  it('records an entry for today and reads it back', async () => {
    await addEntry('B licence evening', 75);
    expect(await loadTodayEntries()).toEqual([
      { date: '2026-09-06', label: 'B licence evening', amount: 75, at: '2026-09-06T12:00:00.000Z' },
    ]);
  });

  it('keeps several entries from the same day, oldest first', async () => {
    await addEntry('B licence evening', 50, '2026-09-06T09:00:00.000Z');
    await addEntry('Kit sale', 30, '2026-09-06T08:00:00.000Z');
    expect(await loadTodayEntries()).toEqual([
      { date: '2026-09-06', label: 'Kit sale', amount: 30, at: '2026-09-06T08:00:00.000Z' },
      { date: '2026-09-06', label: 'B licence evening', amount: 50, at: '2026-09-06T09:00:00.000Z' },
    ]);
  });

  it('does not surface an entry logged on a different day', async () => {
    vi.setSystemTime(new Date('2026-09-05T09:00:00.000Z'));
    await addEntry('B licence evening', 40);
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
    expect(await loadTodayEntries()).toEqual([]);
  });

  it('round-trips a decimal amount through the CSV without drift', async () => {
    await addEntry('B licence evening', 37.5);
    expect(store.get(ENTRIES_KEY)).toContain('37.50');
    expect((await loadTodayEntries())[0].amount).toBe(37.5);
  });

  it('round-trips a label containing a comma through the CSV', async () => {
    await addEntry('B licence evening, group 2', 40);
    expect((await loadTodayEntries())[0].label).toBe('B licence evening, group 2');
  });
});

describe('removeEntry', () => {
  it('removes one entry by its at id, leaving the rest', async () => {
    await addEntry('B licence evening', 50, '2026-09-06T09:00:00.000Z');
    await addEntry('Kit sale', 30, '2026-09-06T10:00:00.000Z');
    const remaining = await removeEntry('2026-09-06T09:00:00.000Z');
    expect(remaining).toEqual([{ date: '2026-09-06', label: 'Kit sale', amount: 30, at: '2026-09-06T10:00:00.000Z' }]);
    expect(await loadTodayEntries()).toEqual(remaining);
  });

  it('is a no-op for an id that does not exist', async () => {
    await addEntry('B licence evening', 50, '2026-09-06T09:00:00.000Z');
    const before = store.get(ENTRIES_KEY);
    await removeEntry('does-not-exist');
    expect(store.get(ENTRIES_KEY)).toBe(before);
  });
});

describe('updateEntry', () => {
  it('corrects a label and amount, leaving date and id untouched', async () => {
    await addEntry('B licence evenign', 30, '2026-09-06T09:00:00.000Z');
    await updateEntry('2026-09-06T09:00:00.000Z', 'B licence evening', 40);
    expect(await loadTodayEntries()).toEqual([
      { date: '2026-09-06', label: 'B licence evening', amount: 40, at: '2026-09-06T09:00:00.000Z' },
    ]);
  });

  it('can correct an entry from a past day, not just today', async () => {
    store.set(ENTRIES_KEY, 'date,label,amount,at\n2026-09-01,Kit sael,20.00,2026-09-01T09:00:00.000Z\n');
    await updateEntry('2026-09-01T09:00:00.000Z', 'Kit sale', 25);
    const inRange = await entriesInRange('2026-09-01', '2026-09-01');
    expect(inRange).toEqual([{ date: '2026-09-01', label: 'Kit sale', amount: 25, at: '2026-09-01T09:00:00.000Z' }]);
  });

  it('is a no-op for an id that does not exist', async () => {
    await addEntry('B licence evening', 30, '2026-09-06T09:00:00.000Z');
    const before = store.get(ENTRIES_KEY);
    await updateEntry('does-not-exist', 'Something else', 99);
    expect(store.get(ENTRIES_KEY)).toBe(before);
  });
});

describe('entriesInRange', () => {
  it('returns only entries within the inclusive date range, sorted chronologically', async () => {
    store.set(
      ENTRIES_KEY,
      'date,label,amount,at\n' +
        '2026-08-31,B licence evening,20.00,2026-08-31T09:00:00.000Z\n' +
        '2026-09-10,B licence evening,50.00,2026-09-10T09:00:00.000Z\n' +
        '2026-09-05,B licence evening,30.00,2026-09-05T09:00:00.000Z\n' +
        '2026-10-01,B licence evening,10.00,2026-10-01T09:00:00.000Z\n',
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
    store.set(ENTRIES_KEY, 'date,label,amount,at\n2026-09-06,B licence evening,not-a-number,2026-09-06T09:00:00.000Z\n');
    expect(await loadTodayEntries()).toEqual([]);
  });

  it('skips a row with an empty label rather than throwing', async () => {
    store.set(ENTRIES_KEY, 'date,label,amount,at\n2026-09-06,,40.00,2026-09-06T09:00:00.000Z\n');
    expect(await loadTodayEntries()).toEqual([]);
  });
});
