import type { APIRoute } from 'astro';
import { addEquipment, removeEquipment } from '../../lib/logbook-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

const MAX_LENGTH = 80;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new equipment profile (Canopy/Container/AAD) for the add-jump
// form's dropdown to pick from.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const body = parsed.data as any;
  const name = oneLine(body?.name);
  if (!name) return jsonError('name is required');

  const settings = await addEquipment({
    name,
    canopy: oneLine(body?.canopy),
    container: oneLine(body?.container),
    aad: oneLine(body?.aad),
  });
  return jsonOk({ settings });
};

// Removes a saved equipment profile. Jumps already logged against it keep
// their own snapshotted canopy/container/AAD text, so deleting a profile
// never rewrites history — it just drops it from future jumps' dropdown.
export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const id = typeof (parsed.data as any)?.id === 'string' ? (parsed.data as any).id : '';
  if (!id) return jsonError('id is required');

  const settings = await removeEquipment(id);
  return jsonOk({ settings });
};
