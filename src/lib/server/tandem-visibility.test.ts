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

const { readTandemVisibility, setTandemVisibility } = await import('./tandem-visibility');

beforeEach(() => {
  store.clear();
});

describe('readTandemVisibility', () => {
  it('defaults both categories to visible when nothing has been saved yet', async () => {
    expect(await readTandemVisibility()).toEqual({ instructor: true, videographer: true });
  });

  it('falls back to the defaults for corrupt saved JSON', async () => {
    store.set('tandem-visibility.json', 'not json');
    expect(await readTandemVisibility()).toEqual({ instructor: true, videographer: true });
  });

  it('falls back to the defaults for a saved value that is not an object', async () => {
    store.set('tandem-visibility.json', '"nope"');
    expect(await readTandemVisibility()).toEqual({ instructor: true, videographer: true });
  });

  it('fills in a missing or non-boolean category from the defaults, keeping the rest', async () => {
    store.set('tandem-visibility.json', JSON.stringify({ instructor: false, videographer: 'nope' }));
    expect(await readTandemVisibility()).toEqual({ instructor: false, videographer: true });
  });
});

describe('setTandemVisibility', () => {
  it('turns one category off without touching the other', async () => {
    const result = await setTandemVisibility('videographer', false);
    expect(result).toEqual({ instructor: true, videographer: false });
    expect(await readTandemVisibility()).toEqual({ instructor: true, videographer: false });
  });

  it('can turn a previously hidden category back on', async () => {
    await setTandemVisibility('instructor', false);
    const result = await setTandemVisibility('instructor', true);
    expect(result).toEqual({ instructor: true, videographer: true });
  });

  it('persists both categories hidden at once, one call at a time', async () => {
    await setTandemVisibility('instructor', false);
    const result = await setTandemVisibility('videographer', false);
    expect(result).toEqual({ instructor: false, videographer: false });
  });
});
