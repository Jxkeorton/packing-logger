# Packing Log — SvelteKit migration

A full port of the main app (Packing / Tandems / Logbook, plus auth, CSV
exports, and PDF invoice generation) from Astro to SvelteKit. Started as
a Logbook-only spike to answer "would this actually be less/simpler
code, or does it just look that way on paper" (see below); after that
came back positive, it grew into a complete parallel build, kept in this
directory so the original Astro app at the repo root stays untouched and
deployable throughout. Not yet the app that's deployed — this is the
candidate being evaluated against it.

## Running it

```sh
cd svelte-spike
npm install
npm run dev
```

Uses its own `data/` folder (or `BLOB_READ_WRITE_TOKEN` for Vercel Blob,
same as the main app), kept deliberately separate from the real app's so
the two can run side by side without clobbering each other's state. Auth
is the same HMAC-cookie scheme as the main app — set `AUTH_PASSWORD` (and
`AUTH_SECRET`) to exercise the login/logout flow; unset, the app runs
open, same as the main app's own default.

## What's here

One root route (`/`), with client-side tab switching between Packing /
Tandems / Logbook — deliberately not three separate SvelteKit routes,
so this is a faithful migration of the existing UX rather than a
redesign (splitting into routes is a plausible *future* improvement, not
done here). Each tab keeps its own sub-tabs (Pack/Timer, Log/Settings)
the same way the original app does.

Structural decisions worth knowing about if you're reading the source:

- **`$lib/packing.ts` / `$lib/tandem.ts` vs `$lib/server/packing.ts` /
  `$lib/server/tandem.ts`.** SvelteKit blocks client-reachable code from
  importing `$lib/server/*`, even for plain constants — so each of these
  domains is split into a universal half (types, rate constants, pure
  functions like `totalEarnings`) and a server half (the storage-backed
  I/O). `logbook.ts`/`logbook-settings.ts` didn't need this split; they
  have no client-needed runtime constants.
- **One shared `AggregateTable.svelte`**, not two near-duplicates like
  the main app's `AggregateTable.astro`/`TandemAggregateTable.astro` —
  takes a normalized row shape plus an optional `exportHref` callback
  for the tandem-only "Export PDF" column. A cleanup the earlier
  codebase audit had flagged as low-risk/high-value, done as part of
  building this properly rather than porting the duplication forward.
- **Form actions over hand-written fetch/JSON handlers.** Every mutation
  (adjust a count, log a jump, save a reference-list entry) is a
  `+page.server.ts` action, submitted with `use:enhance`. A few
  triggers that aren't a plain form click — the pack timer's stop
  button, the tandem "who's the customer?" modal — call the action
  directly via `fetch('?/actionName', ...)` + `invalidateAll()` instead.
- **Dropdown defaults resolve server-side now.** `resolveEntryInput()` in
  `lib/server/actions/logbook.ts` turns a submitted place/equipment/
  aircraft/jump-type *id* into its saved text on the server, so the
  form degrades correctly even with JS disabled — the vanilla app's
  client-side dropdown wiring had no such fallback.

Verified end-to-end in-browser: Packing counters + timer/fastest-board,
Tandems add/delete jump (incl. the linked auto-logged Logbook entry),
invoice-settings save, tandem CSV + PDF invoice export, Logbook add/
edit/delete + reference-list settings + the auto-added "Tandem
Instructor"/"Tandem Camera" jump types, and `npm run check` (0 errors).

## What this confirmed (from the original Logbook-only spike)

**Business logic ports unchanged.** `src/lib/server/{csv,logbook,logbook-settings}.ts`
and `src/lib/ui-classes.ts` started as byte-for-byte copies of the main
app's — diffed with `diff`, not just eyeballed. None of it has an Astro
dependency; the framework only touches the presentation layer.

**The reference-list live-sync problem is gone, not patched.** Star a
new default Place in Settings, switch to the Log tab (client-side, no
reload) — the dropdown shows it as selected immediately. This was the
motivating problem for the whole spike: the main app went through a
React-island detour and a "Refresh profiles" button to work around
exactly this, because that form was an isolated island seeded once from
props. Here it isn't an island; it's the same page's reactive state, so
there's nothing to go stale.

**~38% less code for equivalent behavior**, measured on the
Logbook-only slice (presentation + API layer — forms, entry list,
reference lists, mutation routes — excluding shared infra like
`csv.ts`/`storage.ts` that ports unchanged either way):

| | Main app (Astro) | Spike (SvelteKit) |
|---|---:|---:|
| Markup + client JS + API routes | 1821 lines | 1127 lines |

**Client JS is small.** `npm run build`'s production bundle was ~42KB
gzipped total across every chunk for that one tab's whole interactive
surface — the "ship less JS" instinct behind reaching for Astro in the
first place isn't actually lost by using a framework whose whole app is
reactive rather than mostly-static islands.

## What this surfaced that the "SvelteKit will just be simpler" story glossed over

**Reactivity doesn't delete the product requirement, just shrinks the
code for it.** The vanilla app's `data-user-touched` dance — don't let
a live reference-list refresh clobber a dropdown the user already
interacted with — still needed *something* here: `LogForm.svelte`
tracks a small `touched` object and one `$effect` to decide whether a
new default should override the current selection. Smaller (four
booleans instead of DOM attributes + an imperative `<select>`-patching
function), but not zero.

**`use:enhance`'s default behavior resets the actual DOM form**, which
fights any field that's `bind:value`-controlled by component state
(rather than left to the browser). `LogForm.svelte`,
`SettingsPanel.svelte`, and `InvoiceSettingsPanel.svelte` all hit this —
a successful submit blanked fields, because SvelteKit's default
`update()` calls the native `form.reset()` *after* the component's own
state-driven reset had already set the right values, and native reset
wins. Fix is one flag, `update({ reset: false })`, but it's an easy
first-timer trap and one this migration hit repeatedly, not just once.

**Svelte 5's `$state(someProp)` only captures the prop's value at
mount** — it does not stay in sync if the prop changes later. Hit this
several times (`SettingsPanel`'s `baseJumps` field, `LogForm`'s
default-id tracking) — budget real attention for "local editable state
seeded from a server-loaded prop" as a recurring pattern across a
migration this size, not a one-off.

None of these are arguments against migrating — they're the concrete,
previously-invisible costs an analysis-on-paper can't surface. Now
they're known, and were planned for rather than rediscovered.

## Not yet done

- Decide whether this replaces the main app, and if so, cut over
  (rename this directory, retire the Astro version) — not done yet,
  by design: the Astro app at the repo root is left untouched and
  deployable throughout this work.
- Production-environment testing (Vercel Blob, real `AUTH_PASSWORD`)
  hasn't been exercised here yet — only local filesystem storage and
  the no-auth-configured path have been verified in-browser so far.
