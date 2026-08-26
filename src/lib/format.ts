// Pure formatting helpers with no server-only dependencies, so they're safe
// to import from client-side scripts as well as Astro frontmatter.

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
