// A standalone JSON endpoint with no UI in the main app either — see
// /api/set-day and that app's session notes.
import type { RequestHandler } from './$types';
import { CATEGORIES, totalEarnings, totalJumps, type Category } from '$lib/tandem';
import { setDayEntries } from '$lib/server/tandem';
import { isValidCalendarDate } from '$lib/server/periods';
import { jsonError, jsonOk } from '$lib/server/api-response';

const MAX_NAME_LENGTH = 80;

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const { date, entries } = (body ?? {}) as { date?: string; entries?: Partial<Record<Category, string[]>> };

  if (typeof date !== 'string' || !isValidCalendarDate(date)) {
    return jsonError('date must be a real calendar date in YYYY-MM-DD form');
  }
  if (!entries || typeof entries !== 'object') {
    return jsonError('entries is required');
  }

  const resolved = {} as Record<Category, string[]>;
  for (const category of CATEGORIES) {
    const names = entries[category] ?? [];
    if (!Array.isArray(names)) {
      return jsonError(`entries.${category} must be an array of names`);
    }
    const cleaned: string[] = [];
    for (const raw of names) {
      const cleanName = typeof raw === 'string' ? raw.trim().replace(/[\r\n]+/g, ' ') : '';
      if (!cleanName) {
        return jsonError(`entries.${category} contains an empty name`);
      }
      if (cleanName.length > MAX_NAME_LENGTH) {
        return jsonError(`entries.${category} contains a name longer than ${MAX_NAME_LENGTH} characters`);
      }
      cleaned.push(cleanName);
    }
    resolved[category] = cleaned;
  }

  const state = await setDayEntries(date, resolved);

  return jsonOk({
    state,
    totalJumps: totalJumps(state.counts),
    totalEarnings: totalEarnings(state.counts),
  });
};
