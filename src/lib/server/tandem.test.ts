// Characterization tests for the Work-jumps ledger, written when the AFF
// category arrived and brought a new `level` column with it. `./storage`
// is mocked with an in-memory Map — see logbook.test.ts's header for why
// every server-module suite in this repo has to do that.
//
// The migration is the part worth pinning down: every existing
// tandem-jumps.csv was written with four columns and no level, and a
// parser that guesses wrong there doesn't fail loudly — it shifts every
// name one column left and quietly relabels a day's work.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { addJump, jumpsInRange, loadTodayState, readCsvFile, setDayEntries } = await import('./tandem');
const { todayKey } = await import('../packing');

beforeEach(() => {
  store.clear();
});

const JUMPS_KEY = 'tandem-jumps.csv';

describe('reading a file written before AFF existed', () => {
  it('reads four-column rows without shifting the timestamp into the level', async () => {
    store.set(
      JUMPS_KEY,
      'date,category,name,at\n' +
        '2026-08-01,instructor,Jane Smith,2026-08-01T10:00:00.000Z\n' +
        '2026-08-01,videographer,Sam Patel,2026-08-01T11:00:00.000Z\n',
    );

    const jumps = await jumpsInRange('2026-08-01', '2026-08-01');
    expect(jumps.instructor).toEqual([
      { date: '2026-08-01', category: 'instructor', name: 'Jane Smith', level: '', at: '2026-08-01T10:00:00.000Z' },
    ]);
    expect(jumps.videographer[0].at).toBe('2026-08-01T11:00:00.000Z');
    expect(jumps.aff).toEqual([]);
  });

  it('reads a file holding both widths at once', async () => {
    // Not hypothetical: the file is only rewritten whole on the next
    // write, so a five-column row lands underneath four-column ones the
    // moment the first AFF jump is logged.
    store.set(
      JUMPS_KEY,
      'date,category,name,at\n' +
        '2026-08-01,instructor,Jane Smith,2026-08-01T10:00:00.000Z\n' +
        '2026-08-01,aff,Alex Marsh,Level 6,2026-08-01T12:00:00.000Z\n',
    );

    const jumps = await jumpsInRange('2026-08-01', '2026-08-01');
    expect(jumps.instructor[0]).toMatchObject({ name: 'Jane Smith', level: '', at: '2026-08-01T10:00:00.000Z' });
    expect(jumps.aff[0]).toMatchObject({ name: 'Alex Marsh', level: 'Level 6', at: '2026-08-01T12:00:00.000Z' });
  });

  it('skips whichever header the file happens to start with', async () => {
    store.set(JUMPS_KEY, 'date,category,name,level,at\n');
    expect(await jumpsInRange('2000-01-01', '2100-01-01')).toEqual({ instructor: [], videographer: [], aff: [] });
  });
});

describe('addJump', () => {
  it('keeps an AFF student\'s level', async () => {
    await addJump('aff', 'Alex Marsh', '2026-08-01T12:00:00.000Z', 'Level 6');
    const state = await loadTodayState();
    expect(state.counts.aff).toBe(1);
    expect(state.entries.aff[0]).toMatchObject({ name: 'Alex Marsh', level: 'Level 6' });
  });

  it('drops a level posted against a category that has none', async () => {
    // A level means nothing on a tandem, and one stored there would be
    // rendered on the card as if it did.
    await addJump('instructor', 'Jane Smith', '2026-08-01T10:00:00.000Z', 'Level 6');
    expect((await loadTodayState()).entries.instructor[0].level).toBe('');
  });

  it('round-trips a level containing a comma through the CSV', async () => {
    await addJump('aff', 'Alex Marsh', '2026-08-01T12:00:00.000Z', 'Level 6, re-jump');
    expect(store.get(JUMPS_KEY)).toContain('"Level 6, re-jump"');
    expect((await loadTodayState()).entries.aff[0].level).toBe('Level 6, re-jump');
  });
});

describe('setDayEntries', () => {
  it('backfills AFF jumps with their levels, and leaves the others levelless', async () => {
    const state = await setDayEntries('2026-08-01', {
      instructor: [{ name: 'Jane Smith' }],
      videographer: [],
      aff: [{ name: 'Alex Marsh', level: 'Level 6' }, { name: 'Jo Whitaker', level: 'Consol' }],
    });

    expect(state.counts).toEqual({ instructor: 1, videographer: 0, aff: 2 });
    expect(state.entries.aff.map((j) => j.level)).toEqual(['Level 6', 'Consol']);
    expect(state.entries.instructor[0].level).toBe('');
  });
});

describe('readCsvFile', () => {
  it('exports the level alongside the name and the current rate', async () => {
    await setDayEntries('2026-08-01', {
      instructor: [],
      videographer: [],
      aff: [{ name: 'Alex Marsh', level: 'Level 6' }],
    });

    const csv = await readCsvFile();
    expect(csv.split('\n')[0]).toBe('date,category,name,level,amount,at');
    expect(csv).toContain('2026-08-01,aff,Alex Marsh,Level 6,42.00,');
  });
});

describe('a day with no jumps', () => {
  it('starts every category at zero, including one added later', async () => {
    const state = await loadTodayState();
    expect(state.date).toBe(todayKey());
    expect(state.counts).toEqual({ instructor: 0, videographer: 0, aff: 0 });
    expect(state.entries.aff).toEqual([]);
  });
});
