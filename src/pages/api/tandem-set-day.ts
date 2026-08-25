import type { APIRoute } from 'astro';
import { CATEGORIES, setDayEntries, totalEarnings, totalJumps, type Category } from '../../lib/tandem';
import { isValidCalendarDate } from '../../lib/periods';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

const MAX_NAME_LENGTH = 80;

// Backfills or corrects a whole day's tandem jumps at once — a list of
// customer names per category, replacing whatever was recorded for that
// date — rather than adding/removing one jump at a time. Used for entering
// a day that was logged on paper, or fixing a mistake on a past day.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { date, entries } = (parsed.data ?? {}) as { date?: string; entries?: Partial<Record<Category, string[]>> };

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
