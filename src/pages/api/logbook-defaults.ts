import type { APIRoute } from 'astro';
import { setDefault, type DefaultCategory } from '../../lib/logbook-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

const CATEGORIES: DefaultCategory[] = ['place', 'equipment', 'aircraft', 'jumpType'];

// Sets (or clears, with id: null) which saved place/equipment/aircraft the
// add-jump form pre-selects for a fresh jump.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { category, id } = (parsed.data ?? {}) as { category?: string; id?: string | null };

  if (!category || !CATEGORIES.includes(category as DefaultCategory)) {
    return jsonError('Unknown category');
  }
  if (id !== null && typeof id !== 'string') {
    return jsonError('id must be a string or null');
  }

  const settings = await setDefault(category as DefaultCategory, id);
  return jsonOk({ settings });
};
