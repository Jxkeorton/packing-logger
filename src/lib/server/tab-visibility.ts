// Which of Packing / Work jumps show up as tabs at all — Logbook isn't
// part of this and always shows, so there's always at least one usable
// tab even with both of these switched off (see TandemCategoryCards'
// own "both hidden" message for the equivalent problem one level down,
// inside the Work jumps tab).
//
// A display preference only, same as tandem-visibility.ts: hiding a
// tab doesn't touch anything it tracks, it just can't be reached until
// switched back on — its own settings row stays reachable regardless,
// since Settings isn't one of the tabs this hides.
import { readText, writeText } from './storage';

export type AppTab = 'packing' | 'tandems';

export type TabVisibility = Record<AppTab, boolean>;

const SETTINGS_KEY = 'tab-visibility.json';

const DEFAULTS: TabVisibility = { packing: true, tandems: true };

const TABS: AppTab[] = ['packing', 'tandems'];

export async function readTabVisibility(): Promise<TabVisibility> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    const result = {} as TabVisibility;
    for (const tab of TABS) {
      result[tab] = typeof parsed[tab] === 'boolean' ? parsed[tab] : DEFAULTS[tab];
    }
    return result;
  } catch {
    return DEFAULTS;
  }
}

export async function setTabVisibility(tab: AppTab, visible: boolean): Promise<TabVisibility> {
  const current = await readTabVisibility();
  const next: TabVisibility = { ...current, [tab]: visible };
  await writeText(SETTINGS_KEY, JSON.stringify(next, null, 2));
  return next;
}
