// Whether each Work-jumps category card shows on that tab — a pure
// display preference, not a data toggle: hiding Videographer here
// doesn't touch anything already logged under it, and it still appears
// on invoices and in history/totals exactly as before. Kept as its own
// small settings file for the same reason invoice-settings.ts is
// separate — this doesn't derive from or belong to the jump ledger
// itself.
import { CATEGORIES, type Category } from '../tandem';
import { readText, writeText } from './storage';

export type TandemVisibility = Record<Category, boolean>;

const SETTINGS_KEY = 'tandem-visibility.json';

const DEFAULTS: TandemVisibility = { instructor: true, videographer: true };

export async function readTandemVisibility(): Promise<TandemVisibility> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    const result = {} as TandemVisibility;
    for (const category of CATEGORIES) {
      result[category] = typeof parsed[category] === 'boolean' ? parsed[category] : DEFAULTS[category];
    }
    return result;
  } catch {
    return DEFAULTS;
  }
}

export async function setTandemVisibility(category: Category, visible: boolean): Promise<TandemVisibility> {
  const current = await readTandemVisibility();
  const next: TandemVisibility = { ...current, [category]: visible };
  await writeText(SETTINGS_KEY, JSON.stringify(next, null, 2));
  return next;
}
