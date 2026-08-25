import type { APIRoute } from 'astro';
import { nextJumpNumber } from '../../lib/logbook';
import { readLogbookSettings, setBaseJumps } from '../../lib/logbook-settings';

// The full current settings — places/equipment/aircraft/jump types and
// their defaults, plus baseJumps. Used by LogbookForm.tsx's "Refresh
// profiles" button: that form is a React island seeded once from the
// page's initial props, so a saved-profile edit made in the Settings
// sub-tab (a different, plain-TS part of the page) needs this to show up
// there without a full page reload.
export const GET: APIRoute = async () => {
  const settings = await readLogbookSettings();
  return new Response(JSON.stringify({ settings }), { headers: { 'Content-Type': 'application/json' } });
};

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
