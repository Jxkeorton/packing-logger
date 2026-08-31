// `./storage` is mocked with an in-memory Map — see logbook.test.ts's
// header comment for why this is necessary for every server-module test
// in this repo.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { readRateSettings, writeRateSettings } = await import('./rate-settings');

const DEFAULTS = {
  packing: { tandem: 11, instructor: 6.5, student: 6.5, sport: 6.5 },
  tandem: { instructor: 42, videographer: 42 },
  videographerPackageRate: 92,
};

beforeEach(() => {
  store.clear();
});

describe('readRateSettings', () => {
  it('defaults to the current hardcoded rates when nothing has been saved yet', async () => {
    expect(await readRateSettings()).toEqual(DEFAULTS);
  });

  it('falls back to the defaults for corrupt saved JSON', async () => {
    store.set('rate-settings.json', 'not json');
    expect(await readRateSettings()).toEqual(DEFAULTS);
  });

  it('falls back to the defaults for a saved value that is not an object', async () => {
    store.set('rate-settings.json', '"nope"');
    expect(await readRateSettings()).toEqual(DEFAULTS);
  });

  it('fills in a missing, non-numeric, or negative rate from the defaults, keeping the rest', async () => {
    store.set(
      'rate-settings.json',
      JSON.stringify({
        packing: { tandem: 15, instructor: 'nope', student: -1 },
        tandem: { instructor: 50 },
        videographerPackageRate: -5,
      }),
    );
    expect(await readRateSettings()).toEqual({
      packing: { tandem: 15, instructor: 6.5, student: 6.5, sport: 6.5 },
      tandem: { instructor: 50, videographer: 42 },
      videographerPackageRate: 92,
    });
  });

  it('accepts zero as a valid rate rather than falling back', async () => {
    store.set('rate-settings.json', JSON.stringify({ packing: { tandem: 0 } }));
    const result = await readRateSettings();
    expect(result.packing.tandem).toBe(0);
  });
});

describe('writeRateSettings', () => {
  it('round-trips a full settings object', async () => {
    const custom = {
      packing: { tandem: 12, instructor: 7, student: 7, sport: 7 },
      tandem: { instructor: 45, videographer: 45 },
      videographerPackageRate: 95,
    };
    await writeRateSettings(custom);
    expect(await readRateSettings()).toEqual(custom);
  });
});
