// A standalone JSON endpoint with no UI in the main app either — see
// that app's session notes. Ported for parity, same reasoning as
// /api/state.
import type { RequestHandler } from './$types';
import { CATEGORIES, totalEarnings, totalPacks, type Category, type Counts } from '$lib/packing';
import { setDayCounts } from '$lib/server/packing';
import { isValidCalendarDate } from '$lib/server/periods';
import { jsonError, jsonOk } from '$lib/server/api-response';

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const { date, counts } = (body ?? {}) as { date?: string; counts?: Partial<Record<Category, number>> };

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
