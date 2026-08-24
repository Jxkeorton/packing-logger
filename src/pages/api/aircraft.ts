import type { APIRoute } from 'astro';
import { addAircraft, removeAircraft } from '../../lib/logbook-settings';

const MAX_LENGTH = 20;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new aircraft registration for the add-jump form's dropdown to
// pick from.
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

  const plate = oneLine((body as any)?.plate);
  if (!plate) {
    return new Response(JSON.stringify({ error: 'plate is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await addAircraft({ plate });
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};

// Removes a saved aircraft. Jumps already logged against it keep their own
// snapshotted aircraft text, so deleting it never rewrites history — it
// just drops it from future jumps' dropdown.
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

  const settings = await removeAircraft(id);
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};
