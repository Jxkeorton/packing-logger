import type { APIRoute } from 'astro';
import { nextJumpNumber } from '../../lib/logbook';
import { setBaseJumps } from '../../lib/logbook-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

// Updates the "jumps logged before this app" starting offset. Every jump
// number downstream is derived from this plus the ledger, so the response
// includes the recomputed next-jump-number for the form to show immediately.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { baseJumps } = (parsed.data ?? {}) as { baseJumps?: number };

  if (typeof baseJumps !== 'number' || !Number.isInteger(baseJumps) || baseJumps < 0) {
    return jsonError('baseJumps must be a whole number, 0 or more');
  }

  const settings = await setBaseJumps(baseJumps);
  return jsonOk({ settings, nextNumber: await nextJumpNumber(settings.baseJumps) });
};
