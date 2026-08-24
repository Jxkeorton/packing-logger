import type { APIRoute } from 'astro';
import { addJumpType, removeJumpType } from '../../lib/logbook-settings';

const MAX_LENGTH = 40;

function oneLine(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, MAX_LENGTH);
}

// Saves a new jump type for the add-jump form's dropdown to pick from.
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

  const settings = await addJumpType({ name });
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};

// Removes a saved jump type. Jumps already logged against it keep their own
// snapshotted jump-type text, so deleting it never rewrites history — it
// just drops it from future jumps' dropdown (and clears it as the default,
// if it was one).
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

  const settings = await removeJumpType(id);
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};
