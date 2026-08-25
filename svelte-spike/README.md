# Logbook tab — SvelteKit spike

A throwaway port of the main app's Logbook tab (add/edit/delete jumps,
the four Places/Equipment/Aircraft/Jump-types reference lists, the
base-jumps setting) to SvelteKit, built to get a real answer to "would
this actually be less/simpler code, or does it just look that way on
paper" — see the parent repo's session notes for the analysis that led
here. **Not production code** — no auth, no Vercel Blob, no Packing/
Tandems tabs, and its own `data/` folder, kept deliberately separate
from the real app's.

## Running it

```sh
cd svelte-spike
npm install
npm run dev
```

## What this confirmed

**Business logic ports unchanged.** `src/lib/server/{csv,logbook,logbook-settings}.ts`
and `src/lib/ui-classes.ts` are byte-for-byte copies of the main app's —
diffed with `diff` before this file was written, not just eyeballed. None
of it has an Astro dependency; the framework only touches the
presentation layer.

**The reference-list live-sync problem is gone, not patched.** Star a
new default Place in Settings, switch to the Log tab (client-side, no
reload) — the dropdown shows it as selected immediately. This was the
motivating problem for this whole spike: the main app went through a
React-island detour and a "Refresh profiles" button to work around
exactly this, because that form was an isolated island seeded once from
props. Here it isn't an island; it's the same page's reactive state, so
there's nothing to go stale.

**~38% less code for equivalent behavior.** The presentation + API
layer (forms, entry list, reference lists, all the mutation routes) —
excluding shared infra like `csv.ts`/`storage.ts` that ports unchanged
either way:

| | Main app (Astro) | This spike (SvelteKit) |
|---|---:|---:|
| Markup + client JS + API routes | 1821 lines | 1127 lines |

**Client JS is small.** `npm run build`'s production bundle is ~42KB
gzipped total across every chunk, for the whole interactive surface
(forms, reactive lists, four reference-list CRUD panels, sub-tabs) — the
"ship less JS" instinct behind reaching for Astro in the first place
isn't actually lost by using a framework whose whole app is reactive
rather than mostly-static islands.

## What this surfaced that the "SvelteKit will just be simpler" story glossed over

**Reactivity doesn't delete the product requirement, just shrinks the
code for it.** The vanilla app's `data-user-touched` dance — don't let
a live reference-list refresh clobber a dropdown the user already
interacted with — still needed *something* here: `LogForm.svelte`
tracks a small `touched` object and one `$effect` to decide whether a
new default should override the current selection. Smaller (four
booleans instead of DOM attributes + an imperative `<select>`-patching
function), but not zero. Worth knowing going in, not discovering when
this exact bug reappeared (it did — see `git log` on this file).

**`use:enhance`'s default behavior resets the actual DOM form**, which
fights any field that's `bind:value`-controlled by component state
(rather than left to the browser). `LogForm.svelte` and
`SettingsPanel.svelte` both hit this — a successful submit blanked the
date field, because SvelteKit's default `update()` calls the native
`form.reset()` *after* the component's own state-driven reset had
already set the right values, and native reset wins since the `<input>`
has no static `value=` attribute to fall back to. Fix is one flag,
`update({ reset: false })`, but it's an easy first-timer trap, and
exactly the kind of thing that's cheap to hit in a spike and expensive
to hit for the first time mid-migration.

**Svelte 5's `$state(someProp)` only captures the prop's value at
mount** — it does not stay in sync if the prop changes later. Hit this
twice (`SettingsPanel`'s `baseJumps` field, `LogForm`'s default-id
tracking) in a page this small; a bigger migration should expect to
budget real attention for "local editable state seeded from a
server-loaded prop" as a recurring pattern, not a one-off.

None of these are arguments against migrating — they're the concrete,
previously-invisible costs an analysis-on-paper can't surface. Now
they're known, and cheap to plan for.
