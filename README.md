# Packing Log

A mobile-first work counter for a skydive rigger, tandem instructor and
tandem videographer. Tap `+`/`−` to log each job as you finish it, see
today's total earnings at a glance, and every tap is saved straight away —
no "end of day" step required.

Built with [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5, runes
mode), deployed on [Vercel](https://vercel.com) via
[`@sveltejs/adapter-vercel`](https://svelte.dev/docs/kit/adapter-vercel).
One root route (`/`) with client-side tab switching between Packing /
Tandems / Logbook, rather than separate routes per tab — every mutation
(a tap, a saved jump, a settings change) is a SvelteKit form action, so
the UI is fully reactive without a hand-rolled fetch/JSON layer.

## The three tabs

- **Packing** — pack jobs, with a Pack/Timer sub-tab for a stopwatch and a
  fastest-5 board.
- **Tandems** — tandem jumps done as an instructor or as a videographer.
  Adding a jump asks for the customer's name, since that's what goes on
  the invoice — see [`src/lib/tandem.ts`](src/lib/tandem.ts).
- **Logbook** — a personal jump ledger (date, place, aircraft, equipment,
  jump type, description), numbered from a configurable starting offset.
  Logging a tandem jump from the Tandems tab automatically adds a linked
  entry here too.

Both Packing's and Tandems' History panels group their log by day, by
Monday–Sunday week, or by invoice month — invoice months run cutoff to
cutoff (the Sunday before the last Tuesday of each calendar month), not
calendar month to calendar month. See
[`src/lib/server/periods.ts`](src/lib/server/periods.ts).

## Categories & rates

**Packing**

| Category   | Rate   |
| ---------- | ------ |
| Tandem     | £11.00 |
| Instructor | £6.50  |
| Student    | £6.50  |
| Sport      | £6.50  |

**Tandems**

| Category     | Rate   |
| ------------ | ------ |
| Instructor   | £42.00 |
| Videographer | £42.00 |

Both tandem roles pay the same flat rate per jump — they're tracked as
separate categories only so the log shows how many of each you did.

## Tandem jumps & invoicing

Every tandem jump is logged against a customer name, entered in the
prompt that pops up when you tap "+ Add instructor jump" / "+ Add
videographer jump". Today's jumps are listed under each card with a `×`
to remove one. Unlike packing, the tandem log is kept as one row per jump
rather than a daily tally, so the name is never lost.

"Download full tandem log (.csv)" exports that ledger directly — one row
per jump with `date,category,name,amount,at` — ready to filter to an
invoice month and hand to a customer or accountant.

### PDF invoices

Each row in the Tandems tab's History → Month table has an "Export PDF"
link, which generates a formal invoice for that invoice month: your
letterhead, a "Bill To" address, and every jump that period listed with
its date and customer name, split into Instructor and Videographer
sections with subtotals and a total (packing jobs are never included).

The letterhead — your name/address, the VAT note, the client's billing
address, and the next invoice number — is set in the "Invoice details"
panel underneath the Tandems tab's History section. It's saved once and
reused on every export; the invoice number auto-increments each time you
export a PDF. See
[`src/lib/server/invoice-pdf.ts`](src/lib/server/invoice-pdf.ts) and
[`src/lib/server/invoice-settings.ts`](src/lib/server/invoice-settings.ts).

> **Known issue:** the tandem invoice PDF export is currently broken in
> production — tracked, not yet fixed.

## Running it locally

```bash
npm install
npm run dev
```

This starts a server on your machine and prints two URLs: a `localhost`
one for the same computer, and a `Network` one (something like
`http://192.168.x.x:5173`). Open the **Network** URL on your phone (same
wifi) to use it from the packing floor.

Locally, data is stored in the `data/` folder next to the project — no
account or setup needed:

- `data/state.json` — today's running pack-job counts.
- `data/packing-log.csv` — one row per day, kept up to date on every tap.
- `data/tandem-jumps.csv` — one row per tandem jump (date, role, customer
  name), the source both the Tandems tab and its CSV export read from.
- `data/logbook.csv` / `data/logbook-settings.json` — the personal
  logbook ledger and its saved reference lists.
- `data/invoice-settings.json` — the PDF invoice letterhead (see above).

All are excluded from git (see `.gitignore`), since they're personal work
records, not source code.

Other useful commands:

```bash
npm run check   # svelte-check, type errors across .svelte + .ts files
npm run test    # vitest — characterization tests for the date/CSV/invoice
                # math in src/lib/server/*.test.ts
npm run build   # production build (adapter-vercel)
```

## Deploying to Vercel

Because Vercel's functions don't have a persistent local disk, the same
read/write calls that hit `data/` locally are backed by a
[Cloudflare R2](https://developers.cloudflare.com/r2/) bucket in production
instead — see [`src/lib/server/storage.ts`](src/lib/server/storage.ts). No
code changes are needed to switch between the two; it's picked automatically
based on whether `R2_ACCOUNT_ID` / `R2_BUCKET` / `R2_ACCESS_KEY_ID` /
`R2_SECRET_ACCESS_KEY` are all set. A deployed instance with none of them set
refuses to run, rather than silently treating its own ephemeral,
per-invocation filesystem as if it were real storage.

To deploy:

1. Push this repo to GitHub and import it in Vercel, or run `vercel link`
   from this folder.
2. Create an R2 bucket in the Cloudflare dashboard, and an API token
   (Object Read & Write) scoped to it. Add its four `R2_*` values above to
   the Vercel project's **Settings → Environment Variables** — see
   `.env.example`.
3. Deploy with `vercel --prod`, or just push to the connected GitHub
   repo's production branch.

You can always download the full CSV log from the app itself via the
"Download full log (.csv)" link at the bottom of each tab — this works
the same way whether the log lives in `data/` or in R2.

This project previously ran on Vercel Blob; it was dropped once its Hobby
plan's op limits (2,000 writes/month) turned out to be easy to exhaust —
see git history if you need the old backend's shape back.

## Locking it down with a password

By default the app is open to anyone with the URL. To require a
password:

1. In the Vercel project's **Settings → Environment Variables**, add
   `APP_PASSWORD` (Production, and Preview if you want) set to whatever
   password you want to use.
2. Redeploy. Every page and API route now redirects to a login screen
   until the right password is entered; a "Log out" link appears at the
   bottom of the page once it's on.

Leaving `APP_PASSWORD` unset — the default — disables the gate entirely,
so local dev (`npm run dev`) never needs it set. See `.env.example`.

## Architecture notes

This app started as an [Astro](https://astro.build) app and was migrated
to SvelteKit; the Astro version has been removed from this repo (see git
history before this migration if you need to refer back to it). A few
structural decisions from that migration are worth knowing if you're
reading the source:

- **`$lib/packing.ts` / `$lib/tandem.ts` vs `$lib/server/packing.ts` /
  `$lib/server/tandem.ts`.** SvelteKit blocks client-reachable code from
  importing `$lib/server/*`, even for plain constants — so each of these
  domains is split into a universal half (types, rate constants, pure
  functions like `totalEarnings`) and a server half (the storage-backed
  I/O). `logbook.ts`/`logbook-settings.ts` didn't need this split; they
  have no client-needed runtime constants.
- **One shared `AggregateTable.svelte`** for both tabs' week/month
  history tables, taking a normalized row shape plus an optional
  `exportHref` callback for the tandem-only "Export PDF" column.
- **Form actions, not hand-written fetch/JSON handlers.** Every mutation
  is a `+page.server.ts` action, submitted with `use:enhance`. A few
  triggers that aren't a plain form click — the pack timer's stop
  button, the tandem "who's the customer?" modal — call the action
  directly via `fetch('?/actionName', ...)` + `invalidateAll()` instead.
- **Dropdown defaults resolve server-side.** `resolveEntryInput()` in
  `src/lib/server/actions/logbook.ts` turns a submitted place/equipment/
  aircraft/jump-type *id* into its saved text on the server, so the form
  degrades correctly even with JS disabled.
