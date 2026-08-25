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

/** "23 Aug, 14:05" for a recorded time's timestamp. */
export function formatWhen(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${date}, ${time}`;
}
