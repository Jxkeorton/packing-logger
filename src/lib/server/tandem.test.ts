// Characterization tests for the Work-jumps ledger, written when the AFF
// category arrived and brought a new `level` column with it. `./storage`
// is mocked with an in-memory Map — see logbook.test.ts's header for why
// every server-module suite in this repo has to do that.
//
// The migration is the part worth pinning down: every existing
// tandem-jumps.csv was written with four columns and no level, and a
// parser that guesses wrong there doesn't fail loudly — it shifts every
// name one column left and quietly relabels a day's work.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { addJump, handyCamJumpsInRange, jumpsInRange, loadTodayState, readCsvFile, setDayEntries, setJumpHandyCam } =
  await import('./tandem');
const { todayKey } = await import('../packing');

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  vi.useRealTimers();
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
      {
        date: '2026-08-01',
        category: 'instructor',
        name: 'Jane Smith',
        level: '',
        handyCam: false,
        handyCamAt: '',
        handyCamAfterJump: false,
        at: '2026-08-01T10:00:00.000Z',
      },
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

  it('flags an instructor jump as handy cam, stamping handyCamAt with the same `at`', async () => {
    await addJump('instructor', 'Jane Smith', '2026-08-01T10:00:00.000Z', '', true);
    const jump = (await loadTodayState()).entries.instructor[0];
    expect(jump.handyCam).toBe(true);
    expect(jump.handyCamAt).toBe('2026-08-01T10:00:00.000Z');
  });

  it('drops a handy-cam flag posted against a category that has none', async () => {
    await addJump('videographer', 'Sam Patel', '2026-08-01T11:00:00.000Z', '', true);
    const jump = (await loadTodayState()).entries.videographer[0];
    expect(jump.handyCam).toBe(false);
    expect(jump.handyCamAt).toBe('');
  });
});

describe('setJumpHandyCam', () => {
  it('flags an existing instructor jump, stamping handyCamAt with now and defaulting to "after the jump"', async () => {
    // addJump always dates the jump to "today", so both the add and the
    // date-window query below need to agree on what that was — pin it
    // with fake time, then move the clock on for the toggle itself.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-01T10:00:00.000Z'));
    await addJump('instructor', 'Jane Smith');

    vi.setSystemTime(new Date('2026-08-05T09:00:00.000Z'));
    await setJumpHandyCam('2026-08-01T10:00:00.000Z', true);

    const [jump] = (await jumpsInRange('2026-08-01', '2026-08-01')).instructor;
    expect(jump.handyCam).toBe(true);
    expect(jump.handyCamAt).toBe('2026-08-05T09:00:00.000Z');
    // The employer's default assumption: back-flagging a past jump from
    // History normally *is* the "customer upgraded once home" case.
    expect(jump.handyCamAfterJump).toBe(true);
  });

  it('flags a jump as the package, not after-jump, when told so explicitly', async () => {
    const added = await addJump('instructor', 'Jane Smith');
    const at = added.entries.instructor[0].at;

    await setJumpHandyCam(at, true, false);
    const jump = (await loadTodayState()).entries.instructor[0];
    expect(jump.handyCam).toBe(true);
    expect(jump.handyCamAfterJump).toBe(false);
  });

  it('flips the package/after-jump classification without moving handyCamAt', async () => {
    // Correcting which kind of bonus this is, once it's already flagged,
    // must not silently move it into a different invoice period.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-05T09:00:00.000Z'));
    const added = await addJump('instructor', 'Jane Smith');
    const at = added.entries.instructor[0].at;
    await setJumpHandyCam(at, true, true);

    vi.setSystemTime(new Date('2026-08-09T09:00:00.000Z'));
    await setJumpHandyCam(at, true, false);

    // The clock's moved on since addJump ran, so loadTodayState() ("today"
    // now being the 9th) would miss the jump entirely — it's still dated
    // the 5th, which is exactly the point of this test.
    const [jump] = (await jumpsInRange('2026-08-05', '2026-08-05')).instructor;
    expect(jump.handyCamAfterJump).toBe(false);
    expect(jump.handyCamAt).toBe('2026-08-05T09:00:00.000Z');
  });

  it('clears the flag, the timestamp and the classification when toggled back off', async () => {
    const added = await addJump('instructor', 'Jane Smith', undefined, '', true);
    const at = added.entries.instructor[0].at;

    await setJumpHandyCam(at, false);
    const jump = (await loadTodayState()).entries.instructor[0];
    expect(jump.handyCam).toBe(false);
    expect(jump.handyCamAt).toBe('');
    expect(jump.handyCamAfterJump).toBe(false);
  });

  it('no-ops on a jump that is not an instructor jump', async () => {
    const added = await addJump('videographer', 'Sam Patel');
    const at = added.entries.videographer[0].at;

    await setJumpHandyCam(at, true);
    const jump = (await loadTodayState()).entries.videographer[0];
    expect(jump.handyCam).toBe(false);
  });

  it('no-ops on an unknown id', async () => {
    await expect(setJumpHandyCam('does-not-exist', true)).resolves.toBeDefined();
  });
});

describe('handyCamJumpsInRange', () => {
  it('buckets a bonus by handyCamAt, not by the jump\'s own date', async () => {
    // Logged (and flagged) on 30 Aug — an invoice-month cutoff day at
    // Langar — then upgraded on 2 Sep, after that period's invoice would
    // already have gone out. The bonus belongs in September, not August.
    await addJump('instructor', 'Jane Smith', '2026-08-30T10:00:00.000Z');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-02T18:00:00.000Z'));
    await setJumpHandyCam('2026-08-30T10:00:00.000Z', true);

    expect(await handyCamJumpsInRange('2026-08-01', '2026-08-30')).toEqual([]);
    const september = await handyCamJumpsInRange('2026-08-31', '2026-09-30');
    expect(september).toHaveLength(1);
    expect(september[0]).toMatchObject({ name: 'Jane Smith', handyCam: true });
  });

  it('excludes an unflagged jump, and a flagged one outside the range', async () => {
    await addJump('instructor', 'Sam Patel', '2026-08-01T10:00:00.000Z'); // never flagged
    await addJump('instructor', 'Jane Smith', '2026-08-01T11:00:00.000Z', '', true); // flagged, but outside the queried range

    expect(await handyCamJumpsInRange('2026-09-01', '2026-09-30')).toEqual([]);
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
    expect(csv.split('\n')[0]).toBe('date,category,name,level,amount,handyCam,handyCamType,handyCamBonus,at');
    expect(csv).toContain('2026-08-01,aff,Alex Marsh,Level 6,42.00,0,,0.00,');
  });

  it('exports the handy-cam bonus alongside a flagged instructor jump, labelled by which kind', async () => {
    await addJump('instructor', 'Jane Smith', '2026-08-01T10:00:00.000Z', '', true);
    const csv = await readCsvFile();
    // Flagged via addJump, so it's always the package — see
    // Jump.handyCamAfterJump's doc comment.
    expect(csv).toContain(`${todayKey()},instructor,Jane Smith,,42.00,1,package,20.00,2026-08-01T10:00:00.000Z`);
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
