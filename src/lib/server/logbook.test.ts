// Characterization tests for the personal logbook ledger. `./storage` is
// mocked with an in-memory Map — logbook.ts otherwise reads/writes real
// files under data/ (or Vercel Blob), and this suite must never touch
// that, since it's the user's actual saved data during local dev.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntryInput } from './logbook';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { addEntry, nextJumpNumber, readCsvFile, readLogbook, removeEntry, updateEntry } = await import('./logbook');

beforeEach(() => {
  store.clear();
});

function entryInput(overrides: Partial<EntryInput> = {}): EntryInput {
  return {
    date: '2026-08-01',
    place: 'Langar',
    exitAltitude: '13,000 ft',
    rig: '',
    canopy: '',
    lineset: '',
    pilotChute: '',
    container: '',
    aad: '',
    aircraft: '',
    jumpType: 'Sport',
    description: '',
    ...overrides,
  };
}

describe('readLogbook / nextJumpNumber on an empty ledger', () => {
  it('is empty and starts numbering from baseJumps + 1', async () => {
    expect(await readLogbook(0)).toEqual([]);
    expect(await nextJumpNumber(0)).toBe(1);
    expect(await nextJumpNumber(250)).toBe(251);
  });
});

describe('addEntry', () => {
  it('numbers jumps by chronological date, not insertion order', async () => {
    // Logged out of date order: 5th, then 1st, then 3rd of the month.
    await addEntry(entryInput({ date: '2026-08-05' }), 0, 'at-2');
    await addEntry(entryInput({ date: '2026-08-01' }), 0, 'at-1');
    const result = await addEntry(entryInput({ date: '2026-08-03' }), 0, 'at-3');

    // readLogbook/addEntry both return newest-first.
    expect(result.map((e) => [e.number, e.date])).toEqual([
      [3, '2026-08-05'],
      [2, '2026-08-03'],
      [1, '2026-08-01'],
    ]);
  });

  it('breaks a same-date tie by `at`', async () => {
    await addEntry(entryInput({ date: '2026-08-01' }), 0, 'at-b');
    const result = await addEntry(entryInput({ date: '2026-08-01' }), 0, 'at-a');
    // 'at-a' < 'at-b' lexically, so it was logged first that day.
    const byAt = Object.fromEntries(result.map((e) => [e.at, e.number]));
    expect(byAt['at-a']).toBe(1);
    expect(byAt['at-b']).toBe(2);
  });

  it('offsets numbering by baseJumps', async () => {
    const result = await addEntry(entryInput(), 100, 'at-1');
    expect(result[0].number).toBe(101);
  });
});

describe('updateEntry', () => {
  it('renumbers every jump when an edit moves a date across others', async () => {
    await addEntry(entryInput({ date: '2026-08-01' }), 0, 'at-1');
    await addEntry(entryInput({ date: '2026-08-02' }), 0, 'at-2');
    await addEntry(entryInput({ date: '2026-08-03' }), 0, 'at-3');

    // Move jump #1 (at-1) to after jump #3's date — it should become #3,
    // and the other two should shift down to fill the gap.
    const result = await updateEntry('at-1', entryInput({ date: '2026-08-04' }), 0);

    expect(result).not.toBeNull();
    const byAt = Object.fromEntries(result!.map((e) => [e.at, e.number]));
    expect(byAt['at-2']).toBe(1);
    expect(byAt['at-3']).toBe(2);
    expect(byAt['at-1']).toBe(3);
  });

  it('keeps the same `at` (identity) after editing', async () => {
    await addEntry(entryInput(), 0, 'at-1');
    const result = await updateEntry('at-1', entryInput({ place: 'Sibson' }), 0);
    expect(result).toHaveLength(1);
    expect(result![0].at).toBe('at-1');
    expect(result![0].place).toBe('Sibson');
  });

  it('returns null for an id that does not exist', async () => {
    await addEntry(entryInput(), 0, 'at-1');
    expect(await updateEntry('nonexistent', entryInput(), 0)).toBeNull();
  });
});

describe('removeEntry', () => {
  it('deletes the matching jump and renumbers the rest', async () => {
    await addEntry(entryInput({ date: '2026-08-01' }), 0, 'at-1');
    await addEntry(entryInput({ date: '2026-08-02' }), 0, 'at-2');
    await addEntry(entryInput({ date: '2026-08-03' }), 0, 'at-3');

    const result = await removeEntry('at-2', 0);

    expect(result.map((e) => e.at)).toEqual(['at-3', 'at-1']); // newest first, at-2 gone
    expect(result.find((e) => e.at === 'at-3')!.number).toBe(2);
    expect(result.find((e) => e.at === 'at-1')!.number).toBe(1);
  });

  it('is a harmless no-op for an id that does not exist', async () => {
    await addEntry(entryInput(), 0, 'at-1');
    const result = await removeEntry('nonexistent', 0);
    expect(result).toHaveLength(1);
  });
});

describe('readCsvFile', () => {
  it('is oldest-first with jump numbers, and quotes fields that need it', async () => {
    await addEntry(entryInput({ date: '2026-08-02', place: 'Sibson' }), 0, 'at-2');
    await addEntry(entryInput({ date: '2026-08-01', description: 'Freefall, then a hop-and-pop' }), 0, 'at-1');

    const csv = await readCsvFile(0);
    const lines = csv.trim().split('\n');

    expect(lines[0]).toBe(
      'jump_number,date,jump_type,place,exit_altitude,rig,canopy,lineset,pilot_chute,container,aad,aircraft,description',
    );
    // Oldest first — the reverse of readLogbook's newest-first order.
    expect(lines[1]).toContain('1,2026-08-01');
    expect(lines[1]).toContain('"Freefall, then a hop-and-pop"');
    expect(lines[2]).toContain('2,2026-08-02,Sport,Sibson');
  });
});

describe('backward compatibility with rows written before jump_type existed', () => {
  it('defaults jumpType to empty for a 9-field legacy row', async () => {
    // ENTRIES_HEADER has 10 fields; a legacy row only has the first 9
    // (no trailing jump_type column) and must still parse.
    // No commas in any field here — a raw .join(',') isn't CSV-quoted, so
    // an unescaped comma would silently shift every later column.
    const legacyRow = ['2026-08-01', 'Langar', '13000ft', '', '', '', '', '', 'legacy-at'].join(',');
    store.set('logbook.csv', `date,place,exit_altitude,canopy,container,aad,aircraft,description,at\n${legacyRow}\n`);

    const result = await readLogbook(0);
    expect(result).toHaveLength(1);
    expect(result[0].at).toBe('legacy-at');
    expect(result[0].jumpType).toBe('');
  });
});

describe('backward compatibility with rows written before rig/lineset/pilot chute existed', () => {
  it('defaults rig, lineset and pilotChute to empty for a 10-field legacy row', async () => {
    // ENTRIES_HEADER now has 13 fields; a legacy row written when it only
    // had 10 (through jump_type) must still parse, with the three new
    // trailing fields defaulting to ''.
    const legacyRow = ['2026-08-01', 'Langar', '13000ft', 'Sabre2 190', 'Wings X', '', '', '', 'legacy-at', 'Sport'].join(
      ',',
    );
    store.set(
      'logbook.csv',
      `date,place,exit_altitude,canopy,container,aad,aircraft,description,at,jump_type\n${legacyRow}\n`,
    );

    const result = await readLogbook(0);
    expect(result).toHaveLength(1);
    expect(result[0].at).toBe('legacy-at');
    expect(result[0].canopy).toBe('Sabre2 190');
    expect(result[0].container).toBe('Wings X');
    expect(result[0].rig).toBe('');
    expect(result[0].lineset).toBe('');
    expect(result[0].pilotChute).toBe('');
  });
});

describe('descriptions containing newlines', () => {
  it('round-trips a multi-line description without losing the entry', async () => {
    // Regression: writeEntries quotes the newline correctly, but readEntries
    // used to split the file on '\n' before parsing, tearing the record in
    // two and discarding both halves — the jump silently vanished.
    const description = 'line one\nline two\n\nline four';
    await addEntry(entryInput({ description }), 0, 'at-1');

    const result = await readLogbook(0);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe(description);
    expect(result[0].at).toBe('at-1');
  });

  it('keeps neighbouring entries intact around a multi-line one', async () => {
    await addEntry(entryInput({ date: '2026-08-01' }), 0, 'at-1');
    await addEntry(entryInput({ date: '2026-08-02', description: 'first\nsecond' }), 0, 'at-2');
    await addEntry(entryInput({ date: '2026-08-03' }), 0, 'at-3');

    const result = await readLogbook(0);
    expect(result.map((e) => e.at)).toEqual(['at-3', 'at-2', 'at-1']);
    expect(result.find((e) => e.at === 'at-2')!.description).toBe('first\nsecond');
  });

  it('survives an edit that adds a newline to an existing description', async () => {
    await addEntry(entryInput({ description: 'single line' }), 0, 'at-1');
    await updateEntry('at-1', entryInput({ description: 'now\nmulti line' }), 0);

    const result = await readLogbook(0);
    expect(result).toHaveLength(1);
    expect(result[0].description).toBe('now\nmulti line');
  });
});
