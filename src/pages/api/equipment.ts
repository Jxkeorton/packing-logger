import type { APIRoute } from 'astro';
import { addEquipment, removeEquipment } from '../../lib/logbook-settings';

const MAX_LENGTH = 80;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new equipment profile (Canopy/Container/AAD) for the add-jump
// form's dropdown to pick from.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const name = oneLine((body as any)?.name);
  if (!name) {
    return new Response(JSON.stringify({ error: 'name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await addEquipment({
    name,
    canopy: oneLine((body as any)?.canopy),
    container: oneLine((body as any)?.container),
    aad: oneLine((body as any)?.aad),
  });

  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};

// Removes a saved equipment profile. Jumps already logged against it keep
// their own snapshotted canopy/container/AAD text, so deleting a profile
// never rewrites history — it just drops it from future jumps' dropdown.
export const DELETE: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = typeof (body as any)?.id === 'string' ? (body as any).id : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await removeEquipment(id);
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};
