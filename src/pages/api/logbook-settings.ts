import type { APIRoute } from 'astro';
import { nextJumpNumber } from '../../lib/logbook';
import { setBaseJumps } from '../../lib/logbook-settings';

// Updates the "jumps logged before this app" starting offset. Every jump
// number downstream is derived from this plus the ledger, so the response
// includes the recomputed next-jump-number for the form to show immediately.
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

  const { baseJumps } = (body ?? {}) as { baseJumps?: number };

  if (typeof baseJumps !== 'number' || !Number.isInteger(baseJumps) || baseJumps < 0) {
    return new Response(JSON.stringify({ error: 'baseJumps must be a whole number, 0 or more' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await setBaseJumps(baseJumps);
  return new Response(
    JSON.stringify({ settings, nextNumber: await nextJumpNumber(settings.baseJumps) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
