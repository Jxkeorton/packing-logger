import type { APIRoute } from 'astro';
import { CATEGORIES, adjustCount, totalEarnings, totalPacks, type Category } from '../../lib/packing';

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

  const { category, delta } = (body ?? {}) as { category?: string; delta?: number };

  if (!category || !CATEGORIES.includes(category as Category)) {
    return new Response(JSON.stringify({ error: 'Unknown category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (delta !== 1 && delta !== -1) {
    return new Response(JSON.stringify({ error: 'delta must be 1 or -1' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await adjustCount(category as Category, delta);

  return new Response(
    JSON.stringify({
      state,
      totalPacks: totalPacks(state.counts),
      totalEarnings: totalEarnings(state.counts),
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
