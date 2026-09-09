// The endpoint the Cloudflare Worker (../../../../../worker) hits every
// couple of minutes. It's the only route exempt from the login gate
// (see hooks.server.ts) because the Worker has no user session — it
// carries a shared CRON_SECRET instead, checked here before anything runs.
//
// GET and POST both work: the Worker POSTs, and GET makes a browser/curl
// "run it now" check trivial while debugging.
import { json, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runScheduledSync } from '$lib/server/burble/cron';

const run: RequestHandler = async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    console.error('[cron/burble-sync] CRON_SECRET is not set — refusing to run');
    return text('CRON_SECRET is not configured on this deployment', { status: 503 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return text('unauthorized', { status: 401 });
  }

  const report = await runScheduledSync();
  return json(report);
};

export const GET = run;
export const POST = run;
