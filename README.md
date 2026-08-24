# Packing Log

A mobile-first work counter for a skydive rigger, tandem instructor and
tandem videographer. Tap `+`/`−` to log each job as you finish it, see
today's total earnings at a glance, and every tap is saved straight away —
no "end of day" step required.

The app has two top-level tabs, each with its own independent log:

- **Packing** — pack jobs (with a Pack/Timer sub-tab for a stopwatch and a
  fastest-5 board).
- **Tandems** — tandem jumps done as an instructor or as a videographer.
  Adding a jump asks for the customer's name, since that's what goes on the
  invoice — see [`src/lib/tandem.ts`](src/lib/tandem.ts).

Both tabs' History panels group their log by day, by Monday–Sunday week, or
by invoice month — invoice months run cutoff to cutoff (the Sunday before
the last Tuesday of each calendar month), not calendar month to calendar
month. Both invoice-month schedules line up, since they share the same
cutoff math (see [`src/lib/periods.ts`](src/lib/periods.ts)).

## Categories & rates

**Packing**

| Category   | Rate      |
| ---------- | --------- |
| Tandem     | £11.00    |
| Instructor | £6.50     |
| Student    | £6.50     |
| Sport      | £6.50     |

**Tandems**

| Category     | Rate   |
| ------------ | ------ |
| Instructor   | £42.00 |
| Videographer | £42.00 |

Both tandem roles pay the same flat rate per jump — they're tracked as
separate categories only so the log shows how many of each you did.

## Tandem jumps & invoicing

Every tandem jump is logged against a customer name, entered in the prompt
that pops up when you tap "+ Add instructor jump" / "+ Add videographer
jump". Today's jumps are listed under each card with a `×` to remove one
(fixes a mis-tap or a typo'd name). Unlike packing, the tandem log is kept
as one row per jump rather than a daily tally, so the name is never lost.

"Download full tandem log (.csv)" exports that ledger directly — one row
per jump with `date,category,name,amount,at` — ready to filter to an
invoice month and hand to a customer or accountant.

### PDF invoices

Each row in the Tandems tab's History → Month table has an "Export PDF"
link, which generates a formal invoice for that invoice month: your
letterhead, a "Bill To" address, and every jump that period listed with its
date and customer name, split into Instructor and Videographer sections
with subtotals and a total (packing jobs are never included).

The letterhead — your name/address, the VAT note, the client's billing
address, and the next invoice number — is set in the "Invoice details"
panel underneath the Tandems tab's History section. It's saved once and
reused on every export; the invoice number auto-increments each time you
export a PDF, so update it there if you ever need to skip or rewind it.
See [`src/lib/invoice-pdf.ts`](src/lib/invoice-pdf.ts) and
[`src/lib/invoice-settings.ts`](src/lib/invoice-settings.ts).

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

- `data/state.json` — today's running pack-job counts.
- `data/packing-log.csv` — one row per day, kept up to date on every tap.
- `data/tandem-jumps.csv` — one row per tandem jump (date, role, customer
  name), the source both the Tandems tab and its CSV export read from.
- `data/invoice-settings.json` — the PDF invoice letterhead (see below).

All are excluded from git (see `.gitignore`), since they're your personal
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
"Download full log (.csv)" link at the bottom of each tab — this works the
same way whether the log lives in `data/` or in Blob storage.

## Locking it down with a password

By default the app is open to anyone with the URL. To require a password:

1. In the Vercel project's **Settings → Environment Variables**, add
   `APP_PASSWORD` (Production, and Preview if you want) set to whatever
   password you want to use.
2. Redeploy. Every page and API route now redirects to a login screen until
   the right password is entered; a "Log out" link appears at the bottom of
   the page once it's on.

Leaving `APP_PASSWORD` unset — the default — disables the gate entirely, so
local dev (`npm run dev`) never needs it set. See `.env.example`.

## Tech

Built with [Astro](https://astro.build) in server mode, using
[`@astrojs/vercel`](https://docs.astro.build/en/guides/integrations-guide/vercel/)
so it deploys straight to Vercel, with local dev falling back to plain files
so no cloud account is needed to just run it on your own machine.
