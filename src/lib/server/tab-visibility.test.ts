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

const { readTabVisibility, setTabVisibility } = await import('./tab-visibility');

beforeEach(() => {
  store.clear();
});

describe('readTabVisibility', () => {
  it('defaults both tabs to visible when nothing has been saved yet', async () => {
    expect(await readTabVisibility()).toEqual({ packing: true, tandems: true });
  });

  it('falls back to the defaults for corrupt saved JSON', async () => {
    store.set('tab-visibility.json', 'not json');
    expect(await readTabVisibility()).toEqual({ packing: true, tandems: true });
  });

  it('falls back to the defaults for a saved value that is not an object', async () => {
    store.set('tab-visibility.json', '"nope"');
    expect(await readTabVisibility()).toEqual({ packing: true, tandems: true });
  });

  it('fills in a missing or non-boolean tab from the defaults, keeping the rest', async () => {
    store.set('tab-visibility.json', JSON.stringify({ packing: false, tandems: 'nope' }));
    expect(await readTabVisibility()).toEqual({ packing: false, tandems: true });
  });
});

describe('setTabVisibility', () => {
  it('turns one tab off without touching the other', async () => {
    const result = await setTabVisibility('packing', false);
    expect(result).toEqual({ packing: false, tandems: true });
    expect(await readTabVisibility()).toEqual({ packing: false, tandems: true });
  });

  it('can turn a previously hidden tab back on', async () => {
    await setTabVisibility('tandems', false);
    const result = await setTabVisibility('tandems', true);
    expect(result).toEqual({ packing: true, tandems: true });
  });

  it('persists both tabs hidden at once, one call at a time', async () => {
    await setTabVisibility('packing', false);
    const result = await setTabVisibility('tandems', false);
    expect(result).toEqual({ packing: false, tandems: false });
  });
});
