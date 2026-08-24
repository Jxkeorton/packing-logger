import type { APIRoute } from 'astro';
import { CATEGORIES, setDayEntries, totalEarnings, totalJumps, type Category } from '../../lib/tandem';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAME_LENGTH = 80;

function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Rejects both malformed strings and dates that don't actually exist
// (e.g. 2026-02-30, which Date would otherwise silently roll into March).
function isValidCalendarDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const d = new Date(`${date}T00:00:00`);
  return !Number.isNaN(d.getTime()) && formatDateKey(d) === date;
}

// Backfills or corrects a whole day's tandem jumps at once — a list of
// customer names per category, replacing whatever was recorded for that
// date — rather than adding/removing one jump at a time. Used for entering
// a day that was logged on paper, or fixing a mistake on a past day.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { date, entries } = (body ?? {}) as { date?: string; entries?: Partial<Record<Category, string[]>> };

  if (typeof date !== 'string' || !isValidCalendarDate(date)) {
    return new Response(JSON.stringify({ error: 'date must be a real calendar date in YYYY-MM-DD form' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!entries || typeof entries !== 'object') {
    return new Response(JSON.stringify({ error: 'entries is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resolved = {} as Record<Category, string[]>;
  for (const category of CATEGORIES) {
    const names = entries[category] ?? [];
    if (!Array.isArray(names)) {
      return new Response(JSON.stringify({ error: `entries.${category} must be an array of names` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const cleaned: string[] = [];
    for (const raw of names) {
      const cleanName = typeof raw === 'string' ? raw.trim().replace(/[\r\n]+/g, ' ') : '';
      if (!cleanName) {
        return new Response(JSON.stringify({ error: `entries.${category} contains an empty name` }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (cleanName.length > MAX_NAME_LENGTH) {
        return new Response(
          JSON.stringify({ error: `entries.${category} contains a name longer than ${MAX_NAME_LENGTH} characters` }),
          { status: 400, headers: { 'Content-Type': 'application/json' } },
        );
      }
      cleaned.push(cleanName);
    }
    resolved[category] = cleaned;
  }

  const state = await setDayEntries(date, resolved);

  return new Response(
    JSON.stringify({
      state,
      totalJumps: totalJumps(state.counts),
      totalEarnings: totalEarnings(state.counts),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
