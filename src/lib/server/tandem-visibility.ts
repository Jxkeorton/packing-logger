// Whether each Work-jumps category card shows on that tab — a pure
// display preference, not a data toggle: hiding Videographer (or AFF)
// here doesn't touch anything already logged under it, and it still
// appears on invoices and in history/totals exactly as before. Kept as its own
// small settings file for the same reason invoice-settings.ts is
// separate — this doesn't derive from or belong to the jump ledger
// itself.
import { CATEGORIES, type Category } from '../tandem';
import { boolMap, readJson, writeJson } from './json-store';

export type TandemVisibility = Record<Category, boolean>;

const SETTINGS_KEY = 'tandem-visibility.json';

const DEFAULTS: TandemVisibility = { instructor: true, videographer: true, aff: true };

export async function readTandemVisibility(): Promise<TandemVisibility> {
  return readJson(SETTINGS_KEY, boolMap(CATEGORIES, DEFAULTS), DEFAULTS);
}

export async function setTandemVisibility(category: Category, visible: boolean): Promise<TandemVisibility> {
  const current = await readTandemVisibility();
  const next: TandemVisibility = { ...current, [category]: visible };
  await writeJson(SETTINGS_KEY, next);
  return next;
}
