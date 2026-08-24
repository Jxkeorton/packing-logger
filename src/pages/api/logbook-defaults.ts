import type { APIRoute } from 'astro';
import { setDefault, type DefaultCategory } from '../../lib/logbook-settings';

const CATEGORIES: DefaultCategory[] = ['place', 'equipment', 'aircraft'];

// Sets (or clears, with id: null) which saved place/equipment/aircraft the
// add-jump form pre-selects for a fresh jump.
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

  const { category, id } = (body ?? {}) as { category?: string; id?: string | null };

  if (!category || !CATEGORIES.includes(category as DefaultCategory)) {
    return new Response(JSON.stringify({ error: 'Unknown category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (id !== null && typeof id !== 'string') {
    return new Response(JSON.stringify({ error: 'id must be a string or null' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await setDefault(category as DefaultCategory, id);
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};
