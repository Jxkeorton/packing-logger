// Just the manifest-sync state the top-of-app "Jumps to confirm" menu
// needs, so an open app can pick up what the background cron
// (/api/cron/burble-sync) wrote without a full page reload — one storage
// read, no Burble call. +page.svelte polls this on return-to-foreground
// and on a slow beat while visible.
//
// Gated like every other route: the login hook scopes the read to the
// signed-in user's own ledger.
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pendingForClient, readSyncState } from '$lib/server/burble/sync';

export const GET: RequestHandler = async () => {
  const state = await readSyncState();
  return json({
    pending: pendingForClient(state),
    unmappedCodes: state.unmappedCodes,
    lastSyncAt: state.lastSyncAt,
  });
};
