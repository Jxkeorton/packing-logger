# Packing Log

A mobile-first pack job counter for a skydive rigger. Tap `+`/`−` to log each
pack job as you finish it, see today's total earnings at a glance, and every
tap is saved straight away — no "end of day" step required.

The History panel groups your log by day, by Monday–Sunday week, or by
invoice month — invoice months run cutoff to cutoff (the Sunday before the
last Tuesday of each calendar month), not calendar month to calendar month.

## Categories & rates

| Category   | Rate      |
| ---------- | --------- |
| Tandem     | £11.00    |
| Instructor | £6.50     |
| Student    | £6.50     |
| Sport      | £6.50     |

## Running it locally

```bash
npm install
npm run dev
```

This starts a server on your machine and prints two URLs: a `localhost` one
for the same computer, and a `Network` one (something like
`http://192.168.x.x:4321`). Open the **Network** URL on your phone (same
wifi) to use it from the packing floor.

Locally, data is stored in the `data/` folder next to the project — no
account or setup needed:

- `data/state.json` — today's running counts.
- `data/packing-log.csv` — one row per day, kept up to date on every tap.

Both are excluded from git (see `.gitignore`), since they're your personal
work records, not source code.

## Deploying to Vercel

This project is set up to deploy on [Vercel](https://vercel.com) via
`@astrojs/vercel`. Because Vercel's functions don't have a persistent local
disk, the same read/write calls that hit `data/` locally are backed by
[Vercel Blob](https://vercel.com/docs/vercel-blob) in production instead —
see [`src/lib/storage.ts`](src/lib/storage.ts). No code changes are needed
to switch between the two; it's picked automatically based on whether
`BLOB_READ_WRITE_TOKEN` is set.

To deploy:

1. Push this repo to GitHub (already done) and import it in Vercel, or run
   `vercel link` from this folder.
2. In the project's **Storage** tab on vercel.com, create a Blob store and
   connect it to the project (this sets `BLOB_READ_WRITE_TOKEN`
   automatically for you).
3. Deploy with `vercel --prod`, or just push to the connected GitHub repo.

You can always download the full CSV log from the app itself via the
"Download full log (.csv)" link at the bottom of the page — this works the
same way whether the log lives in `data/` or in Blob storage.

## Tech

Built with [Astro](https://astro.build) in server mode, using
[`@astrojs/vercel`](https://docs.astro.build/en/guides/integrations-guide/vercel/)
so it deploys straight to Vercel, with local dev falling back to plain files
so no cloud account is needed to just run it on your own machine.
