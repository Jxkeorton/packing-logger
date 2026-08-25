import type { APIRoute } from 'astro';
import { CATEGORIES, setDayCounts, totalEarnings, totalPacks, type Category, type Counts } from '../../lib/packing';
import { isValidCalendarDate } from '../../lib/periods';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

// Backfills or corrects a single day's counts directly, rather than
// tapping +/- from zero — used for entering data that was logged on paper,
// or fixing a mistake on a past day.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { date, counts } = (parsed.data ?? {}) as { date?: string; counts?: Partial<Record<Category, number>> };

  if (typeof date !== 'string' || !isValidCalendarDate(date)) {
    return jsonError('date must be a real calendar date in YYYY-MM-DD form');
  }
  if (!counts || typeof counts !== 'object') {
    return jsonError('counts is required');
  }

  const resolved = {} as Counts;
  for (const category of CATEGORIES) {
    const value = counts[category];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      return jsonError(`counts.${category} must be a non-negative integer`);
    }
    resolved[category] = value;
  }

  const state = await setDayCounts(date, resolved);

  return jsonOk({
    state,
    totalPacks: totalPacks(state.counts),
    totalEarnings: totalEarnings(state.counts),
  });
};
