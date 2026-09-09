// The heartbeat behind the background manifest sync.
//
// This Worker does no work of its own. On every cron tick it POSTs to the
// app's /api/cron/burble-sync, which fetches each dropzone's board once
// and advances every user's sync state (see
// src/lib/server/burble/cron.ts). Ticks outside the app's operating
// window (08:45–20:00 Europe/London) return immediately without touching
// Burble, so the loose UTC cron bracket in wrangler.toml is fine.
//
// Config it needs (wrangler.toml + `wrangler secret put`):
//   APP_URL       - the deployment origin, e.g. https://skydive-helper.vercel.app
//   CRON_SECRET   - must match the same env var on the Vercel deployment

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(triggerSync(env));
  },

  // Also reachable over HTTP, gated by the same secret — a one-liner
  // "run it now" while setting things up or debugging:
  //   curl -H "authorization: Bearer $CRON_SECRET" https://<worker-url>/
  async fetch(request, env) {
    if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
      return new Response('unauthorized\n', { status: 401 });
    }
    const { status, body } = await triggerSync(env);
    return new Response(body + '\n', { status, headers: { 'content-type': 'application/json' } });
  },
};

async function triggerSync(env) {
  const url = `${env.APP_URL.replace(/\/$/, '')}/api/cron/burble-sync`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { authorization: `Bearer ${env.CRON_SECRET}` },
    });
    const body = await res.text();
    if (!res.ok) console.error(`[burble-cron] ${res.status} from ${url}: ${body}`);
    return { status: res.status, body };
  } catch (err) {
    console.error(`[burble-cron] request to ${url} failed`, err);
    return { status: 502, body: JSON.stringify({ error: String(err) }) };
  }
}
