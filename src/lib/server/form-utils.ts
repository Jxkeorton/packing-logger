// Small helpers shared by every action module under lib/server/actions/,
// so the same "trim, collapse newlines, cap length" (and money) parsing
// isn't copy-pasted per action with slightly different rules each time.

/** Trims, collapses embedded line breaks to a space, and caps length — for a single-line field. */
export function oneLine(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, maxLength);
}

/** Trims and caps length, but keeps embedded line breaks — for a textarea field. */
export function multiLine(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

/** A required plain string field — '' if missing or not a string. */
export function requiredString(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value : '';
}

/** A sanity ceiling, not a real-world price — catches a fat-fingered extra digit rather than billing it. */
const MAX_AMOUNT = 100000;

/**
 * A positive money amount in pounds, rounded to the nearest penny — or null
 * if it's missing, non-numeric, zero/negative or over MAX_AMOUNT. Rounded
 * because a numeric-keyboard input can carry more precision than money has
 * (e.g. typing "12.005"), and the invoice should never show a fractional
 * penny.
 */
export function parseAmount(value: FormDataEntryValue | null): number | null {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) return null;
  return Math.round(amount * 100) / 100;
}
