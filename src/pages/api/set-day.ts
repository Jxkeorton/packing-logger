import type { APIRoute } from 'astro';
import { CATEGORIES, setDayCounts, totalEarnings, totalPacks, type Category, type Counts } from '../../lib/packing';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

// Backfills or corrects a single day's counts directly, rather than
// tapping +/- from zero — used for entering data that was logged on paper,
// or fixing a mistake on a past day.
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

  const { date, counts } = (body ?? {}) as { date?: string; counts?: Partial<Record<Category, number>> };

  if (typeof date !== 'string' || !isValidCalendarDate(date)) {
    return new Response(JSON.stringify({ error: 'date must be a real calendar date in YYYY-MM-DD form' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!counts || typeof counts !== 'object') {
    return new Response(JSON.stringify({ error: 'counts is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const resolved = {} as Counts;
  for (const category of CATEGORIES) {
    const value = counts[category];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return new Response(
        JSON.stringify({ error: `counts.${category} must be a non-negative integer` }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }
    resolved[category] = value;
  }

  const state = await setDayCounts(date, resolved);

  return new Response(
    JSON.stringify({
      state,
      totalPacks: totalPacks(state.counts),
      totalEarnings: totalEarnings(state.counts),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
