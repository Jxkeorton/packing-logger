// Whether each Work-jumps card shows on that tab — a pure display
// preference, not a data toggle: hiding Videographer (or AFF, or
// Miscellaneous) here doesn't touch anything already logged under it, and
// it still appears on invoices and in history/totals exactly as before.
// Kept as its own small settings file for the same reason
// invoice-settings.ts is separate — this doesn't derive from or belong to
// the jump ledger itself.
//
// Miscellaneous rides along in this same file/store rather than getting
// one of its own: it's the same kind of toggle (Settings > Work jumps,
// same ToggleRowsForm, same "just a display preference" semantics), just
// keyed by 'misc' instead of a Category — it isn't a tandem jump category
// and never was, so it's deliberately its own key rather than piggybacking
// on 'aff' the way the old Ground School panel used to visually live
// under the AFF card without a visibility flag of its own (see
// TandemCategoryCards.svelte's history). Hiding AFF must never hide
// Miscellaneous, or vice versa.
import { CATEGORIES, type Category } from '../tandem';
import { boolMap, readJson, writeJson } from './json-store';

export type VisibilityKey = Category | 'misc';

export type TandemVisibility = Record<VisibilityKey, boolean>;

const SETTINGS_KEY = 'tandem-visibility.json';

const VISIBILITY_KEYS: readonly VisibilityKey[] = [...CATEGORIES, 'misc'];

const DEFAULTS: TandemVisibility = { instructor: true, videographer: true, aff: true, misc: true };

export async function readTandemVisibility(): Promise<TandemVisibility> {
  return readJson(SETTINGS_KEY, boolMap(VISIBILITY_KEYS, DEFAULTS), DEFAULTS);
}

export async function setTandemVisibility(key: VisibilityKey, visible: boolean): Promise<TandemVisibility> {
  const current = await readTandemVisibility();
  const next: TandemVisibility = { ...current, [key]: visible };
  await writeJson(SETTINGS_KEY, next);
  return next;
}
