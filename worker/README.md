# skydive-helper-burble-cron

A tiny Cloudflare Worker whose only job is to call the app's
`/api/cron/burble-sync` endpoint every couple of minutes, so the Burble
manifest sync runs without anyone opening the app.

Why a Worker and not Vercel Cron: Vercel's Hobby plan only allows a
once-a-day cron, which is useless for catching loads inside their
~2-minute post-departure window. Cloudflare Workers cron triggers are on
the free plan with 1-minute granularity, and this account already exists
for R2.

All the actual sync logic lives in the app
(`src/lib/server/burble/cron.ts`). This Worker is ~40 lines and holds no
logic worth testing — it's a scheduled `fetch()`.

## One-time setup

From this directory:

```bash
npm install                          # gets wrangler locally
npx wrangler login                   # authorise against your Cloudflare account (done already if `wrangler whoami` works)
npx wrangler deploy                  # creates the Worker + its cron trigger from wrangler.toml
npx wrangler secret put CRON_SECRET  # paste the value; must match CRON_SECRET on Vercel
```

The same `CRON_SECRET` also has to be set on the Vercel project
(Settings → Environment Variables, Production) and the app redeployed —
without it the endpoint returns `503` and the sync never runs.

`APP_URL` is in `wrangler.toml`; change it there and re-`deploy` if the
deployment origin ever moves.

### Dashboard alternative

If you'd rather not use the CLI: Workers & Pages → Create → paste
`burble-cron.js`, then Settings → Triggers → add the cron `*/2 7-20 * * *`,
and Settings → Variables → add `APP_URL` (plaintext) and `CRON_SECRET`
(encrypted).

## Checking it

`workers_dev = false` in `wrangler.toml` means there's no public URL —
the Worker only ever runs on its cron. To watch it:

```bash
npx wrangler tail                    # live logs; inside the window you should see a scheduled invocation every 2 min
```

To force a run without waiting for the cron, use the local runner:

```bash
npx wrangler dev --test-scheduled    # then, in another shell:
curl "http://localhost:8787/cdn-cgi/handler/scheduled"
```

You can also hit the app endpoint directly (it's what the Worker calls):

```bash
curl -X POST -H "authorization: Bearer $CRON_SECRET" \
  https://skydive-helper.vercel.app/api/cron/burble-sync
```

A healthy response looks like:

```json
{ "ran": true, "mode": "multi", "scopes": { "jake": { "status": "skipped-unchanged", "boardLoads": 6 } } }
```

Outside 08:45–20:00 Europe/London it's `{ "ran": false, "reason": "outside poll window" }` — expected.

The app also tags any failure in its own logs with `[cron/burble-sync]`
/ `[burble-cron]` (Vercel → Logs).

## Cost

One request per tick regardless of user count (the endpoint fans out
server-side and fetches each dropzone's board once). ~390 ticks/day
inside the window against a 100,000/day free limit.
