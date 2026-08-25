import type { APIRoute } from 'astro';
import { addAircraft, removeAircraft } from '../../lib/logbook-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

const MAX_LENGTH = 20;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new aircraft registration for the add-jump form's dropdown to
// pick from.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const plate = oneLine((parsed.data as any)?.plate);
  if (!plate) return jsonError('plate is required');

  const settings = await addAircraft({ plate });
  return jsonOk({ settings });
};

// Removes a saved aircraft. Jumps already logged against it keep their own
// snapshotted aircraft text, so deleting it never rewrites history — it
// just drops it from future jumps' dropdown.
export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const id = typeof (parsed.data as any)?.id === 'string' ? (parsed.data as any).id : '';
  if (!id) return jsonError('id is required');

  const settings = await removeAircraft(id);
  return jsonOk({ settings });
};
