import type { APIRoute } from 'astro';
import { addPlace, removePlace } from '../../lib/logbook-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

const MAX_LENGTH = 80;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new place for the add-jump form's dropdown to pick from.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const name = oneLine((parsed.data as any)?.name);
  if (!name) return jsonError('name is required');

  const settings = await addPlace({ name });
  return jsonOk({ settings });
};

// Removes a saved place. Jumps already logged against it keep their own
// snapshotted place text, so deleting it never rewrites history — it just
// drops it from future jumps' dropdown (and clears it as the default, if
// it was one).
export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const id = typeof (parsed.data as any)?.id === 'string' ? (parsed.data as any).id : '';
  if (!id) return jsonError('id is required');

  const settings = await removePlace(id);
  return jsonOk({ settings });
};
