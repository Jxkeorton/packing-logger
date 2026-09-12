// Pure formatting helpers with no server-only dependencies, so they're safe
// to import from client-side scripts as well as Astro frontmatter.

/** "£12.00" — a pound amount to two decimal places. The one way money is rendered app-wide. */
export function formatMoney(n: number): string {
  return `£${n.toFixed(2)}`;
}

/** "4:12.3" — minutes:seconds.tenths. Shared by the server render and the live timer. */
export function formatDuration(ms: number): string {
  const deciseconds = Math.round(ms / 100);
  const minutes = Math.floor(deciseconds / 600);
  const seconds = Math.floor((deciseconds % 600) / 10);
  const tenths = deciseconds % 10;
  return `${minutes}:${String(seconds).padStart(2, '0')}.${tenths}`;
}

/**
 * Pulls the digits out of a stored exit altitude.
 *
 * The field is numeric now (the form appends "ft" for you), but entries
 * logged before that change hold free text like "13,000 ft" or "4000ft".
 * Both shapes have to load back into the number input when a jump is
 * reopened for editing, so grab the digits and ignore everything else.
 * Returns '' when there's no number to find.
 */
export function exitAltitudeDigits(stored: string): string {
  const digits = (stored ?? '').replace(/[^\d]/g, '');
  return digits;
}

/** "13,000 ft" from a stored altitude; passes odd legacy text through as-is. */
export function formatExitAltitude(stored: string): string {
  const value = (stored ?? '').trim();
  if (!value) return '';
  // Anything that isn't purely a number is legacy free text the user typed
  // themselves — show it exactly as they wrote it rather than reformatting.
  if (!/^\d+$/.test(value)) return value;
  return `${Number(value).toLocaleString('en-GB')} ft`;
}

/** "23 Aug, 14:05" for a recorded time's timestamp. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}

/**
 * Which calendar day a timestamp falls on, in the viewer's own local
 * time — "Today" and "Yesterday" for the common case, otherwise a short
 * date ("Sat 29 Aug", or "Sat 20 Dec 2025" once it's crossed a year
 * boundary). Locale pinned to 'en-GB' rather than left to the runtime's
 * default so this reads the same in a test as it does in a browser —
 * Node's own ICU default is 'en-US' ("Sat, Aug 29"), which isn't what a UK
 * dropzone app should show regardless of who's viewing it.
 *
 * Built for the "Jumps to confirm" backlog: nothing purges a pending jump
 * (see burble/sync.ts), so the list can span months, and day headers are
 * what keep that from turning into one undifferentiated pile.
 *
 * `now` defaults to the current time and only exists as a parameter so
 * this is testable without mocking the clock.
 */
export function dayLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (dayKey(date) === dayKey(now)) return 'Today';
  if (dayKey(date) === dayKey(yesterday)) return 'Yesterday';

  return date.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() === now.getFullYear() ? undefined : 'numeric',
  });
}
