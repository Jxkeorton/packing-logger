# Auto-logging jumps from the Burble manifest

> **Revised 2026-08-29** after the jumper confirmed this DZ never sets
> `Departed`: the commit rule no longer tries to prove a load flew. Any
> sighting of your name becomes a pending jump, confirmed by hand after
> landing via the "Jumps to confirm" menu above the tabs. See §3.
>
> **Status: Phase 1 is built and verified**, along with the
> Phase 2 auto-poll toggle (off by default). What remains is Phase 3 — a
> scheduler that runs when the app isn't open. See §4.
>
> Code: `$lib/burble.ts` (matching), `client.ts` (HTTP), `sync.ts` (state
> machine), `$lib/server/auto-log.ts` (shared with the Tandems tab), and
> the two panels `BurbleSyncPanel` / `BurbleSettingsPanel`. 30 tests across
> `$lib/burble.test.ts` and `sync.test.ts`.

A design for turning "my name is on the board" into logbook entries, with the
right role (tandem instructor / camera / solo) picked automatically. Read
`NOTES.md` first — it covers the feed itself and the one constraint that
shapes everything below: **Burble keeps no history, so a jump only exists if
something was polling while the load flew.**

---

## 1. The shape of the group is what tells you your role

A tandem is manifested as one *group* — an inner array in `load.groups` — and
the roles are readable straight off it:

```
Miranda Walfield (jump="Tandem ", tt=11)   ← the paying customer
Dylan Whitehair  (jump="TI",      tt=3)    ← the instructor
Barry Woollard   (jump="CAM PHOTO", tt=3)  ← the camera flyer
```

A solo jumper is a group of one:

```
Bethan-Rose Dickinson (jump="EXP",     tt=1)
Jack Adams            (jump="EXP+KIT", tt=1)   ← +KIT = kit hire, still a solo
```

So classification is: **find my slot, read its `jump` code, and if it's a
tandem role, take the customer's name from the same group.** That last part is
the real prize — it hands you the customer name the Tandems tab needs for the
invoice, which is the bit you currently type by hand.

### The matching rules

```
normalise(s) = s.trim().replace(/\s+/g,' ').toLowerCase()   // also fold “smart quotes”

for each load:
  if Array.isArray(load) or not load.id: skip      // column padding, NOTES §2
  for each group, for each slot:
    if normalise(slot.name) not in myNames: skip
    if slot.transaction_type_id == '11':   skip    // guard, see below
    role = codeMap[normalise(slot.jump)]           // configurable
    if role is undefined: queue the code as "needs mapping"; skip
```

Seeded `codeMap`, from codes observed live on 2026-08-29:

| `jump` code | role | goes to |
| --- | --- | --- |
| `TI` | `instructor` | Tandems tab **and** logbook ("Tandem Instructor") |
| `CAM PHOTO` | `videographer` | Tandems tab **and** logbook ("Tandem Camera") |
| `EXP` | `solo` | logbook only |
| `EXP+KIT` | `solo` | logbook only |
| `Tandem` | *customer, never mine* | nothing |
| `Staff` | unmapped — ask | nothing until mapped |

`Staff` appeared partway through the observation window, on a `tt=1` slot.
That's exactly why the map has to be **configuration, not a hardcoded
`switch`**: this is one DZ's free-text shorthand, it grows, and a code you've
never seen must surface as "unmapped" rather than be guessed at or silently
dropped. Expect `CAM VIDEO`, `AFF`, `HOP`, and similar to turn up.

**The `tt == 11` guard matters.** Transaction type 11 is the paying tandem
customer. If a customer ever shares your name, that guard is what stops the
app logging you a jump you didn't make. Cheap insurance.

---

## 2. Where a synced jump lands: two writes, not one

This is the part worth getting right, because the app **already auto-logs
tandem jumps** — `actions/tandem.ts`'s `autoLogTandemJump()` writes a logbook
entry whenever you tap a button on the Tandems tab, sharing the same `at` id
so deleting the tandem jump removes the logbook entry too.

The sync should go through that same door, not around it:

| role | call | effect |
| --- | --- | --- |
| `instructor` | `addJump('instructor', customerName, at)` then `autoLogTandemJump(...)` | invoice line **+** "Tandem Instructor" logbook entry |
| `videographer` | `addJump('videographer', customerName, at)` then `autoLogTandemJump(...)` | invoice line **+** "Tandem Camera" logbook entry |
| `solo` | `addLogbookEntry(...)` only | logbook entry, jump type from the code map |

So a synced TI jump earns its £42 on the Tandems tab *and* appears in the
logbook with the teal pill, with the customer's real name attached — all from
the board, with nothing typed.

### The duplicate hazard

If sync is running **and** you tap the Tandems tab buttons out of habit, you
get two invoice lines and two logbook entries for one jump. Guard before
writing: skip if a tandem jump already exists with the same `date` +
`category` + normalised customer `name`. Not bulletproof (two Daves on one
day is legitimately two jumps), so pair it with the review queue in §4 rather
than trusting it alone.

---

## 3. When to commit: you say so

The original design tried to *prove* a load had flown — watch it, wait for
`Departed`, then wait for it to leave the board. That does not survive
contact with this dropzone: the manifesters leave loads `On Call` with
`time_left` counting negative until the load vanishes, so `Departed` rarely
appears. Under that rule almost every jump would have been thrown away as a
cancelled load.

Proof was never needed anyway. **The jumper confirms every jump after
landing, and they know whether they jumped.** So the rule is now:

```
my name is on the board when we look   → capture it as pending
the load stops being displayed         → flag it "off the board"
the jumper taps confirm                → COMMIT
```

Nothing is ever discarded automatically. Losing a real jump is much worse
than carrying a candidate that gets removed with one tap.

Status and `time_left` are kept as *hints* on each pending jump, rendered
by `flightHint()` to jog the memory when confirming:

| what we saw | hint shown |
| --- | --- |
| status was `Departed`/`Back at Gate` | "Departed" |
| load no longer displayed | "Off the board" |
| `time_left` ≤ 0, still displayed | "Overdue by N min" |
| `time_left` > 0 | "N min to go" |

Anything "off the board" is pre-ticked in the confirm list; anything still
showing is not. State is keyed by Burble's slot `id`, unique per
person-per-load, so a re-check can't double-capture and a confirmed jump is
never re-offered.

## 4. Automatic, but with the brakes on

Given a missed poll means a missed jump — and a wrong poll means a wrong
entry — I'd build it in this order:

**Phase 1 — check by hand, confirm after landing.** A "Manifest" panel on
the Logbook tab holds the *controls* (check the board, auto-poll toggle);
the jumps themselves surface in a **"Jumps to confirm"** menu above the
tabs, so it's visible from any tab. The intended workflow, and the one the
app is built around:

1. Tap **Check the board** while you're manifested — before you board.
2. Jump. Phone in the packing area, app closed, nothing running.
3. Land, open the app, and the badge is waiting: confirm what you jumped.

Step 1 is the one that matters: the app can only capture loads that are on
the board at the moment it looks, so a check *before* boarding is what makes
the jump recoverable afterwards.

**Phase 2 — auto-poll while the app is open.** The panel polls its own
endpoint every 30s. That number comes from a measured departure, not from the
config: the `Departed` window was **2m21s** (`NOTES.md` §2), so 30s gives
about seven sightings of a departing load, 60s gives two, and a 2-minute
interval can miss a departure altogether and silently lose the jump. Don't
loosen it without re-measuring. With
`autoCommit` on, matched jumps are written the moment their load clears,
with the last few shown and an Undo — which is free, since `removeJump(at)`
already cascades to the logbook entry.

This is honestly the sweet spot for the way you use the app: phone in your
pocket at the DZ, tab open. It captures the day without you touching anything,
and it degrades to "tap sync between loads" if the phone sleeps.

**Phase 3 (not built) — a scheduler.** The only option that works with the
phone locked, because nothing client-side does:

> iOS suspends JS timers as soon as the tab is backgrounded or the screen
> locks. `setInterval` stops, and the page may be frozen or discarded
> outright. Web Workers are suspended with the page, and Safari does not
> support Background Sync or Periodic Background Sync — there is no web API
> that keeps a poll alive on a locked iPhone, PWA or not.

So auto-poll is honest about its limits: it pauses on `visibilitychange`
rather than pretending to run, and syncs immediately when the tab comes
back. A load that departed *and* left the board during a lock is simply
gone, and has to be logged by hand.

Options, all server-side: Vercel Cron (needs a paid plan for minute-level
schedules; Hobby is once a day, useless here), a GitHub Actions cron
(5-minute floor — marginal against the 2m21s departed window, so it would
miss some), or a small always-on poller (a Pi, a cheap VPS) writing to the
same Blob store, which is the only one that reliably fits the window.

A cheaper mitigation worth trying first: the Screen Wake Lock API
(`navigator.wakeLock`, supported in iOS Safari 16.4+) to hold the screen on
while auto-poll is enabled. It doesn't survive backgrounding the app, but
it does stop the phone auto-locking in your pocket mid-load.

---

## 5. Config to add

To `logbook-settings.ts` (it already owns exactly this kind of thing):

```ts
export interface BurbleSettings {
  enabled: boolean;
  dzId: string;            // '8494'
  myNames: string[];       // ['Jake Orton'] — a list, for display-name drift
  codeMap: { code: string; role: 'instructor' | 'videographer' | 'solo'; jumpTypeName: string }[];
  autoCommit: boolean;
  placeName: string;       // 'Beccles' — the DZ, for the logbook's place field
}
```

Everything else fills from the defaults `autoLogTandemJump()` already uses
(starred place / aircraft / rig), with two upgrades the feed makes possible:

- **Aircraft for free.** Load `name` is `"G-UKPS 6"` — registration plus load
  number. Split on the last space, match `G-UKPS` against the saved aircraft
  list by plate, fall back to the starred default. Better than the current
  behaviour, which always uses the default.
- **Load number in the description**, e.g. *"Auto-logged from the manifest —
  G-UKPS load 6, TI with Miranda Walfield."* Makes a synced entry auditable
  against the board.

Exit altitude has no default anywhere; if you want it filled, the natural
place is a per-jump-type default altitude in settings — a small separate
change, useful with or without this feature.

---

## 6. Files

New:
- `src/lib/burble.ts` — universal half: role types, the `normalise` helper,
  `classifySlot()`, `findCustomerInGroup()`. Pure, so it can be unit-tested
  hard against `fixtures/`.
- `src/lib/server/burble/client.ts` — cookie bootstrap, `getLoads()`, one
  retry on `success: false`.
- `src/lib/server/burble/sync.ts` — the state machine over `burble-sync.json`
  plus the commit path into `tandem.ts` / `logbook.ts`.
- `src/lib/server/burble/sync.test.ts` — feed a sequence of fixtures through
  `sync.ts` and assert exactly one jump comes out, with the right role and
  customer. This is the test that matters.
- `src/lib/components/BurbleSyncPanel.svelte`.

Changed:
- `logbook-settings.ts` — `BurbleSettings` + its reference-list CRUD.
- `actions/logbook.ts` — `syncManifest`, `commitSyncedJumps`, `mapBurbleCode`.
- `actions/tandem.ts` — export the guts of `autoLogTandemJump()` so sync can
  reuse it rather than growing a second copy.
- `+page.server.ts` / `+page.svelte` — surface the panel.

Per §2 of `instructions.md`, note the split: anything the panel needs at
runtime goes in `src/lib/burble.ts`, storage-touching code under
`src/lib/server/burble/`.

---

## 7. Risks worth naming up front

1. **Name matching is the weak link.** Staff show under real names at this DZ
   (`dzm_jm_use_real_name_for_staff: 1`), but that is a DZ config someone could
   flip. If sync silently stops logging, this is the first thing to check —
   worth a "last matched: 2 hours ago" line in the panel so it fails loudly.
2. **Nothing polls, nothing logs.** Phase 2 only covers you while the tab is
   awake. The review queue means a missed load can still be logged by hand;
   it just isn't automatic.
3. **Codes drift.** `Staff` showed up within an hour of watching. Unmapped
   codes must be visible in the UI, never dropped on the floor.
4. **`data/` holds real records.** Per `instructions.md` §1, test this against
   fixtures, and clear any jump you create while poking at it.
