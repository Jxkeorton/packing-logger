// Small helpers shared by every action module under lib/server/actions/ —
// the FormData equivalent of the main app's lib/api-response.ts, which
// existed to dedupe the same "trim, collapse newlines, cap length" logic
// that was copy-pasted across pages/api/{places,equipment,aircraft,
// jump-types,tandem-adjust}.ts. Same idea here, just built in from the
// start instead of extracted after the fact.

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
