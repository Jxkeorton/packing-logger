// A standalone JSON endpoint with no UI in the main app either — see
// /api/set-day and that app's session notes.
import type { RequestHandler } from './$types';
import { CATEGORIES, totalEarnings, totalJumps, type Category } from '$lib/tandem';
import { setDayEntries, type DayEntryInput } from '$lib/server/tandem';
import { isValidCalendarDate } from '$lib/server/periods';
import { jsonError, jsonOk } from '$lib/server/api-response';

const MAX_NAME_LENGTH = 80;
const MAX_LEVEL_LENGTH = 40;

/**
 * One posted entry. A bare string stays valid — that's every call made
 * before AFF existed, and it's still the whole story for the two tandem
 * categories — with the object form only needed to carry an AFF student's
 * level alongside their name.
 */
type PostedEntry = string | { name?: unknown; level?: unknown };

/** Collapse a posted field to one line, or say why it can't be used. */
function oneLineOrReason(value: unknown, max: number): { text: string } | { reason: 'type' | 'length' } {
  if (typeof value !== 'string') return { reason: 'type' };
  const cleaned = value.trim().replace(/[\r\n]+/g, ' ');
  return cleaned.length > max ? { reason: 'length' } : { text: cleaned };
}

export const POST: RequestHandler = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError('Invalid JSON body');
  }

  const { date, entries } = (body ?? {}) as { date?: string; entries?: Partial<Record<Category, PostedEntry[]>> };

  if (typeof date !== 'string' || !isValidCalendarDate(date)) {
    return jsonError('date must be a real calendar date in YYYY-MM-DD form');
  }
  if (!entries || typeof entries !== 'object') {
    return jsonError('entries is required');
  }

  const resolved = {} as Record<Category, DayEntryInput[]>;
  for (const category of CATEGORIES) {
    const posted = entries[category] ?? [];
    if (!Array.isArray(posted)) {
      return jsonError(`entries.${category} must be an array of names`);
    }
    const cleaned: DayEntryInput[] = [];
    for (const raw of posted) {
      const entry = typeof raw === 'string' ? { name: raw } : (raw ?? {});

      const name = oneLineOrReason(entry.name, MAX_NAME_LENGTH);
      if ('reason' in name) {
        return jsonError(
          name.reason === 'length'
            ? `entries.${category} contains a name longer than ${MAX_NAME_LENGTH} characters`
            : `entries.${category} contains an empty name`,
        );
      }
      if (!name.text) return jsonError(`entries.${category} contains an empty name`);

      // Only AFF carries one, and setDayEntries drops it elsewhere — but
      // reject an over-long or non-string one wherever it's posted rather
      // than silently discarding what someone meant to save.
      const level = oneLineOrReason(entry.level ?? '', MAX_LEVEL_LENGTH);
      if ('reason' in level) {
        return jsonError(
          level.reason === 'length'
            ? `entries.${category} contains a level longer than ${MAX_LEVEL_LENGTH} characters`
            : `entries.${category} contains a level that is not a string`,
        );
      }

      cleaned.push({ name: name.text, level: level.text });
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
