import type { APIRoute } from 'astro';
import { addJumpType, removeJumpType } from '../../lib/logbook-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

const MAX_LENGTH = 40;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new jump type for the add-jump form's dropdown to pick from.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const name = oneLine((parsed.data as any)?.name);
  if (!name) return jsonError('name is required');

  const settings = await addJumpType({ name });
  return jsonOk({ settings });
};

// Removes a saved jump type. Jumps already logged against it keep their own
// snapshotted jump-type text, so deleting it never rewrites history — it
// just drops it from future jumps' dropdown (and clears it as the default,
// if it was one).
export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const id = typeof (parsed.data as any)?.id === 'string' ? (parsed.data as any).id : '';
  if (!id) return jsonError('id is required');

  const settings = await removeJumpType(id);
  return jsonOk({ settings });
};
