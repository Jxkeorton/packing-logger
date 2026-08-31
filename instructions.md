# Working in this repo

A mobile-first work log for a skydive rigger / tandem instructor: three tabs
(Packing, Tandems, Logbook) on one SvelteKit route, deployed to Vercel with
Cloudflare R2 for storage. See `README.md` for what the app *does* — this
file is about how code in it is expected to be written.

These conventions were arrived at deliberately (several of them the hard way,
after a bug). Follow them, and when you deviate, say why in a comment.

---

## 1. Finish means verified, not written

Before calling any change done, run all three:

```bash
npm run check   # svelte-check — must be 0 errors
npm run test    # vitest — must be all passing
npm run build   # must complete cleanly
```

`npm run check` has **two known, accepted warnings** (`SettingsPanel.svelte`'s
`state_referenced_locally`, and `login/+page.svelte`'s `a11y_autofocus`). Both
are false positives that have been evaluated and kept. Any *third* warning, or
any error, is yours to fix.

**If the change is visible in the browser, verify it in the browser** — start
the dev server, exercise the actual flow, check for console and server errors.
Do not report a UI change as working on the strength of the code alone. Several
bugs in this repo's history looked correct in the diff and were broken in the
running app.

**Clean up test data afterwards.** `data/` holds the user's real work records
during local dev. If you add a jump, a rig, or a pack count while testing,
delete it before you finish.

---

## 2. The `$lib/server` boundary shapes the file layout

SvelteKit refuses to let client-reachable code import `$lib/server/*` — even
for a plain constant. Domain modules that have both client-needed values and
server-only I/O are therefore **split in two**:

- `src/lib/packing.ts`, `src/lib/tandem.ts` — universal half: types, rate
  constants, pure functions (`totalEarnings`, `zeroCounts`).
- `src/lib/server/packing.ts`, `src/lib/server/tandem.ts` — server half:
  everything that touches storage.

`logbook.ts` / `logbook-settings.ts` live only under `server/` because nothing
client-side needs a runtime value from them (type-only imports are fine —
they're erased at compile time).

If you add a domain module, decide which half each export belongs in *before*
writing it. Retrofitting the split is painful.

---

## 3. Mutations are form actions

Every write goes through a `+page.server.ts` action, submitted with
`use:enhance`. Actions are grouped by tab in `src/lib/server/actions/` and
composed in `src/routes/+page.server.ts`. They are typed
`Record<string, Action>` (the generic `Action` from `@sveltejs/kit`) — the
route-specific `Actions` type from `./$types` only resolves inside the route
file itself.

After a successful action SvelteKit re-runs `load()`, so every derived number
on the page refreshes together. **Do not hand-patch the DOM** to keep a total
in sync; let the reload do it. The data here is small and local.

**The two documented exceptions** are triggers that aren't a form submit —
the pack timer's stop button (`PackTimerView.svelte`) and the tandem
customer-name modal (`TandemCategoryCards.svelte`). Those call the action
directly and refresh explicitly:

```ts
await fetch('?/actionName', { method: 'POST', body: formData });
await invalidateAll();
```

This is deliberate: routing a JS-computed value through a hidden `bind:value`
input and `requestSubmit()` risks submitting before Svelte has flushed the
value to the DOM. If you need a third exception, follow this pattern and
comment why a plain form wouldn't do.

**Resolve ids to text on the server.** The log form submits dropdown *ids*;
`resolveEntryInput()` turns them into saved text server-side. This keeps the
form working with JS disabled — don't move that resolution back to the client.

---

## 4. Comments explain *why*, never *what*

This is the most distinctive convention in the codebase and the easiest to
erode. The code says what it does. Comments exist to stop the next person
"simplifying" something load-bearing.

Comment when: a line looks redundant but isn't; a simpler approach was tried
and failed; behaviour is driven by a browser/platform quirk; or a structural
choice has a reason that isn't local.

Real examples to match the register of:

- `min-w-0` on `FIELD_LABEL` — explains grid items' `min-width: auto` default.
- `appearance-none` on the date input — explains that Safari's native date
  chrome ignores the computed width, and that this is the *actual* fix while
  `min-w-0` / `max-w-full` are belt-and-braces.
- `update({ reset: false })` — explains that enhance's default calls native
  `form.reset()`, which fights `bind:value` fields.
- `Rig` in `logbook-settings.ts` — explains why rigs are add/remove only and
  must never become editable (it would retroactively rewrite which component
  historical jumps count against).
- `invoice-pdf.ts`'s header — explains why fonts are base64-imported rather
  than read from disk, including what broke before.

Keep historical notes when they prevent a regression. Delete them when they
describe a file that no longer exists.

---

## 5. Styling

**Repeated class strings live in `src/lib/ui-classes.ts`** as named constants
(`FIELD_INPUT`, `TOGGLE_SECTION`, `CARD`, …). Change the look of "a
collapsible panel" once there, not per call site.

**Use Tailwind's numeric scale, not arbitrary values, wherever a scale
exists.** Tailwind v4's spacing utilities resolve via
`calc(var(--spacing) * N)` and accept decimals, so `gap-5.5` is 22px — write
that, not `gap-[22px]`. Border and outline widths take bare numbers
(`border-l-5`, `outline-3`).

Arbitrary bracket values remain **correct** for properties with no numeric
scale — font-size, letter-spacing, border-radius that misses a named step,
mixed-unit grid templates, colour literals, and custom breakpoint variants
(`max-[420px]:`). Don't "fix" those.

Before converting a value, verify the generated CSS actually matches the
original pixel value. Don't assume a utility exists.

---

## 6. Svelte 5 runes — two traps that have bitten repeatedly

**`$state(someProp)` captures the prop's value at mount only.** It does not
stay in sync when the prop changes later. If you seed editable local state
from a prop, add an `$effect` to resync — see `SettingsPanel.svelte`. This has
caused bugs more than once; assume it will again.

**`use:enhance`'s default `update()` calls native `form.reset()`**, which
reverts `bind:value`-controlled fields to their (usually absent) `value`
attribute — running *after* your own state reset. Pass
`update({ reset: false })` on any form whose fields are bound to component
state.

Where live data could clobber a choice the user is mid-way through making,
track a small `touched` object and only overwrite untouched fields (see
`LogForm.svelte`). Reactivity shrinks that problem; it doesn't delete it.

---

## 7. Persistence and data safety

`src/lib/server/storage.ts` abstracts Cloudflare R2 (production) and the
local `data/` folder (dev), selected by whether the four `R2_*` env vars are
set. Everything goes through `readText` / `writeText` — don't reach for `fs`
directly. (Previously Vercel Blob; dropped once its Hobby plan's 2,000
writes/month turned out to be easy to exhaust — see git history.)

A deployment can also be multi-user (`AUTH_SECRET` set instead of
`APP_PASSWORD` — see `src/lib/server/auth.ts` and `users.ts`). When it is,
every `readText`/`writeText` call is transparently rescoped to the signed-in
user's own `users/<id>/` prefix via an `AsyncLocalStorage` set in
`hooks.server.ts` (`storage.ts`'s `runAsUser`) — no other module needs to
know a user id exists.

**CSV schema changes must stay backward compatible.** New columns are
**appended at the end** of the row; older rows simply come up short and the
new fields default to `''`. Header rows are detected *by shape* (first field
isn't a date), not by string-matching the current header — that string has
changed and will change again. Add a legacy-row test whenever you extend a
row (see `logbook.test.ts`).

**Don't delete a data field just because the UI stopped collecting it.** The
`aad` field on logbook entries is retained and carried forward across edits so
historical rows aren't silently blanked.

---

## 8. Tests

Vitest, Node environment, `src/lib/server/**/*.test.ts`. They cover the
non-obvious pure logic — invoice period maths, CSV escaping/parsing, ledger
numbering — not UI.

- **Compute expected values independently.** These are characterization tests
  pinning *correct* behaviour, not whatever the code currently prints. Don't
  derive fixtures by running the code.
- **Mock `./storage`** with an in-memory `Map` via `vi.hoisted()`. Tests must
  never touch the real `data/` folder.
- **Pin the clock** with `vi.setSystemTime` for anything date-dependent.
- **Beware timezone traps in the fixtures themselves.** Use `formatDateKey`,
  not `.toISOString().slice(0,10)` — the latter shifts dates for locally
  constructed `Date`s.

---

## 9. Deployment constraints worth knowing

Adapter is `@sveltejs/adapter-vercel`. It has **no `includeFiles` equivalent**,
unlike the Astro adapter this app migrated from. Anything a server module
needs at runtime must be **bundled**, not read from the filesystem: import it
(e.g. base64 via `?raw`, as `invoice-pdf.ts` does for its fonts) so it lands
in the compiled output. A `process.cwd()` file read will work in dev and fail
in production — this exact bug shipped once and went unnoticed because local
testing passed.

Env vars are baked in at build time; changing one requires a redeploy.

Every single-tenant deployment gets its own R2 bucket — one person, one
bucket, keys unprefixed by user (`packing-logger/logbook.csv`, not
`packing-logger/users/<id>/logbook.csv`). There are several such projects on
this repo, each tracking `main` or `release` for a different person (Aimee,
Mila). To ship an update to one: `git checkout release && git merge main &&
git push && git checkout main` — but confirm which branch you're actually
on before committing (`git branch --show-current`); it's easy to drift onto
the wrong one mid-session and not notice until a push goes to the wrong
place.

A separate, additive deployment shape exists for several people sharing one
project: set `AUTH_SECRET` instead of `APP_PASSWORD`, and see
`scripts/add-user.mjs` for creating accounts. It's a different bucket
layout (`users/<id>/` prefix), not a migration path for an existing
single-tenant bucket's data — moving someone from their own bucket into a
shared one is a manual copy via the R2 dashboard (upload into
`packing-logger/users/<id>/`), not something the script does.

---

## 10. Refactoring and commits

**Prefer one shared component over near-duplicates.** `AggregateTable.svelte`
replaced two near-identical tables by taking a normalized row shape plus an
optional callback prop. When a shared component needs to appear both
standalone and nested, split the body out and keep the chrome in a thin
wrapper (`ReferenceListBody` / `ReferenceListPanel` / `RigBuilderPanel`).

**Use `git mv`** for moves so history survives.

**Commit messages state the root cause, not just the change.** For a bug fix:
what was actually wrong, why it wasn't caught earlier, what was verified, and
anything you could *not* verify. Being explicit about untested surfaces (real
Safari, production-only paths) is expected, not a weakness.
