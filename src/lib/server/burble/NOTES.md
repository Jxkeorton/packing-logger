# Polling the Burble manifest

**The dropzone this app is used at is Skydive Langar, `dz_id=531`.** Most of
the reverse-engineering below was done against Beccles (`dz_id=8494`) before
that was known — the *feed* is identical, but several per-DZ config values are
not, and those differences matter. See §7.

Research notes from 2026-08-29, kept alongside the working integration —
`PLAN.md` describes the design, this file describes the feed. The `fixtures/`
here are real captures, so the whole thing can be tested without a live
jumping day in front of us.

---

## 1. The public display is an ExtJS app over one JSON endpoint

The link that gets shared around (`https://dzm.burblesoft.com/jmp?dz_id=8494`)
is not the page that holds the data. Following it:

1. `dzm.burblesoft.com/jmp?dz_id=8494` → **302** → `eu-displays.burblesoft.com/jmp?dz_id=8494`
2. that → **307** → `eu-displays.burblesoft.com/jmp` (query string dropped), setting
   a `burblesoft` session cookie that now *remembers* `dz_id=8494`
3. the HTML that lands is an empty ExtJS shell. All jumper data arrives later
   over AJAX.

Everything worth having comes from one endpoint, discovered in
`js/jumper-manifest-public.js` → `js/controller/JumperManifestPublic.js`:

```
POST https://eu-displays.burblesoft.com/ajax_dzm2_frontend_jumpermanifestpublic
Content-Type: application/x-www-form-urlencoded

action=getLoads&dz_id=8494
```

The real display calls this **every 5 seconds** (`interval: 5000` in the
controller's `setupTimer`). It returns JSON directly — no HTML parsing, no
headless browser, no ExtJS. This is the thing to poll.

### The session cookie is mandatory

Calling the endpoint without a cookie returns a decoy response rather than an
error (see `fixtures/get-loads-no-session.json`):

```json
{"success":false,"user":{"id":""},"msg":"IOS: <a href=...burbleme...>"}
```

So each polling run must bootstrap first. One request is enough — it does not
have to go via `dzm.burblesoft.com`:

```bash
curl -sSL -c cookies.txt "https://eu-displays.burblesoft.com/jmp?dz_id=8494"   # sets cookie
curl -sS  -b cookies.txt -X POST \
  "https://eu-displays.burblesoft.com/ajax_dzm2_frontend_jumpermanifestpublic" \
  -d "action=getLoads&dz_id=8494"
```

The cookie is issued with `Max-Age=604800` (7 days), but treat it as
disposable: re-bootstrap whenever a response comes back with
`success: false` / no `loads` key, then retry once.

No login, no API key, no `Referer` or `X-Requested-With` header needed — it is
genuinely the public display feed.

### Other actions on the same endpoint

- `action=getSetting` — display preferences and the DZ's manifest config
  (`fixtures/get-setting.json`). Useful once, not worth polling.
- `action=getTime` → *"Action getTime not found!"*. Server time comes from a
  different endpoint (`ajax_common`, `action=getTime`) if it's ever needed to
  correct clock skew on `expected_take_off`.

---

## 2. Response shape

See `fixtures/get-loads-on-call.json` for a full real capture. Top level:

| field | meaning |
| --- | --- |
| `loads` | array of load objects, left-to-right as displayed. It is **always padded to `jm_max_columns` (4 here)** with empty *arrays*, not objects — an empty board is literally `[[], [], [], []]` (`fixtures/get-loads-empty-board.json`). So the guard is `Array.isArray(load) \|\| !load.id → skip`, and the TS type is `(BurbleLoad \| [])[]`. Getting this wrong is how you crash on a quiet afternoon |
| `version` | integer that increments whenever the manifest changes. Cheap change-detector — but **it is not always present**, see below |
| `session_id` | the DZ's *jumping day* id (9682 on 2026-08-29). Changes per operating day — a natural key for grouping a day's jumps. Also **not always present** |
| `cached`, `cache_index`, `queries`, `operation_time` | server-side diagnostics — `cache_index` is load-bearing for one gotcha, below |

### `version` and `session_id` vanish on a cache miss

Caught in the wild at 09:56:22 (`fixtures/get-loads-cache-miss.json`). When
the server answers from cache (`cached: 1`, `queries: 5`) the response carries
`version` and `session_id`. When it misses (`cached: 0`, `queries: 10`) **both
keys are absent entirely** — the payload is otherwise identical and perfectly
valid.

So the "skip work when `version` is unchanged" optimisation must treat a
missing `version` as *unknown → process it fully*, never as "unchanged" and
never as a fatal parse error. Both values are still recoverable from
`cache_index` if ever needed — it embeds them:

```
DZM2_JMP_9682_874_f45eaeb2…   →   session_id 9682, version 874
         ^^^^ ^^^
```

but treating them as optional is simpler than parsing that.

Per load:

| field | example | notes |
| --- | --- | --- |
| `id` | `"67832"` | stable load id — the key to track across polls |
| `name` | `"G-UKPS 6"` | aircraft registration + load number of the day |
| `status` | `"On Call"` | see status list below |
| `aircraft_id` | `"18271"` | `aircraft_name` was empty in the capture; the registration only appears inside `name` |
| `expected_take_off`, `caculate_expected_take_off` | `1787997345` | unix seconds (note the upstream typo in the second key). **A revised plan, not an actual.** Observed changing twice while On Call (09:55:45 → 09:54:02), and the load then actually left around 09:56:3x with the field never updated to match. Do not treat it as the take-off time |
| `time_left` | `13` | minutes to take-off, **and it goes negative** while the load is merely running late — observed at `-1` and `-2` with the status still `On Call`. So a negative value is *not proof* the plane went. But at this DZ it is often the only sign there is, because `Departed` is rarely set (see the caveat below), and neither signal is trustworthy enough to log on. Both are recorded as hints for the jumper to confirm against |
| `max_slots` / `public_slots` / `private_slots` | `14` / `12` / `0` | |
| `is_turning`, `is_fueling` | `"1"` / `"0"` | |
| `lm_id` | `13636434` | load master |
| `groups` | array of arrays | each inner array is one manifested *group* (a tandem pair + camera, a team, or a lone sport jumper) |

Per slot (inside a group):

| field | example values | notes |
| --- | --- | --- |
| `id` | `"1864662"` | slot id — unique per person-per-load, so it's the right dedupe key when logging |
| `name` | `"Dylan Whitehair"` | display name; the DZ has `dzm_jm_use_display_name_if_available: 1` and `dzm_jm_use_real_name_for_staff: 1`, so **staff appear under their real name** — good, that's what we match on |
| `jump` | `"TI"`, `"CAM PHOTO"`, `"Tandem "` (trailing space), `"EXP"`, `"EXP+KIT"` | the DZ's own jump-type codes; free text, needs a configurable mapping. **Trim it.** |
| `type` | `"Tandem"`, `"Sport Jumper"` | coarse category, also `"Student"` expected |
| `option_name` | `"PHOTO"`, `""` | add-ons sold with the jump |
| `transaction_type_id` | `11` (tandem customer), `3` (staff slot), `1` (sport jumper) | |
| `sale_id` | `"614062"` | shared by everyone in one tandem booking — this is what ties a customer to their TI and camera flyer |
| `group_number` | `"14-1"`, `""` | `max_slots`-`group index`; empty for sport jumpers |
| `handycam_jump`, `team_id`, `team_name`, `rig_id`, `rig_name`, `formation_type_*`, `tribe` | mostly empty here — this DZ has `dzm_jm_show_rig: 0` and `dzm_jm_show_formation: 0` |

### Load statuses

From `js/view/jumpermanifest/Load.js`, the values that matter:

- `Building` — still filling
- `On Call` — called, counting down (`time_left`)
- `Departed` — in the air
- `Back at Gate` — displayed as "Closed"

A full observed transition on 2026-08-29 (20s polling), which is what
`fixtures/get-loads-departed.json` captures the end of:

```
09:43:32  On Call   time_left  13    v841
09:52:59  On Call   time_left   2    v866   (a 13th slot added mid-countdown)
09:55:21  On Call   time_left  -1           ← late, still on the ground
09:56:42  Departed  time_left  -2    v878   ← happened here; usually doesn't
09:58:43  Departed  time_left  -4    v878   ← last sighting
09:59:03  (gone)                            ← the load simply vanishes
```

Note the load sat `On Call` past its own countdown for ~2 minutes. Any rule
keyed on `time_left <= 0` would have logged the jump before it happened —
which, combined with `Departed` usually being absent, is why the app logs
nothing without the jumper confirming it.

**Important caveat, from the jumper (2026-08-29):** Beccles' manifesters
generally *do not* press "Departed". They leave a load `On Call` and let
`time_left` run into the negatives until the load simply vanishes. The
transition captured below — where `Departed` did appear — is the exception,
not the rule. **Nothing may depend on seeing `Departed`.**

**Two things this run settled that the config had implied otherwise:**

- **The `Departed` window is ~2m20s, not 5 minutes.**
  `jm_display_departed_time_limit: 5` reads like five minutes of grace; the
  measured window between the first `Departed` sighting and the load vanishing
  was 2 minutes 21 seconds. Poll interval must be well inside that — 30s gives
  ~7 sightings, 60s gives ~2, and anything at 2 minutes or slower can miss a
  departure entirely and lose the jump.
- **`Back at Gate` never appeared.** The load went `On Call → Departed → gone`.
  So that status is not a guaranteed stage of the lifecycle; commit logic must
  not wait for it.

---

## 3. The one real limitation: no history

`getSetting` reports `dzm_jm_display_closed_loads: 0`, and the endpoint only
ever returns *currently displayed* loads. I tried passing
`display_closed_loads=1`, `dzm_jm_display_closed_loads=1`, and the settings
params the display itself sends (`display_tandem`, `display_sport`, `columns`,
…) — none of them surface a closed load. That's a server-side DZ config, not a
request parameter.

**Consequence:** a load that has departed and landed vanishes. There is no
"what did I jump today" query. The only way to capture the day is to poll
while it happens and record loads as they pass through, which is exactly what
the integration has to do.

---

## 4. Recommended approach

Poll `getLoads` on a timer, keep a small per-day state file, and turn observed
loads into logbook entries.

1. **Bootstrap** a cookie once per polling process; re-bootstrap on a
   `success: false` response.
2. **Poll every ~30–60s.** The display uses 5s, but that's a wall screen. A
   load is `On Call` for many minutes and `Departed` for at least the
   `jm_display_departed_time_limit: 5` minutes it stays on screen after
   take-off, so a 30s poll cannot miss one. Short-circuit on unchanged
   `version` to keep the work near zero.
3. **Track loads by `id`.** For each poll, for each load, find slots where
   `name` matches the configured "my manifest name". Record
   `{ load_id, slot_id, jump, type, load_name, session_id, first_seen, last_status }`.
4. **Commit a jump when the load has clearly gone.** Safest rule: a load
   counts as jumped once it has been observed with `status: "Departed"` (or
   `"Back at Gate"`) and then disappears from the feed. Committing on
   `Departed` alone is simpler and near enough — a load rarely un-departs — but
   waiting for it to disappear also catches the case where the poller starts
   mid-flight.
   *Do not* commit on a load merely disappearing while `Building`/`On Call` —
   that's a cancelled or emptied load, not a jump.
5. **Map `jump` → logbook jump type via config**, not hardcoded strings. Jump
   types in this app are already user-defined (`logbook-settings.ts`'s
   `jumpTypes`), so the natural shape is a saved list of
   `{ burbleCode: 'TI', jumpTypeId: … }` pairs, with unmapped codes surfaced
   for the user to map rather than silently dropped. Observed codes so far:
   `TI`, `CAM PHOTO`, `Tandem`, `EXP`, `EXP+KIT`.
6. **Aircraft** comes from splitting `name` — `"G-UKPS 6"` → registration
   `G-UKPS`, load 6. Match the registration against the saved `aircraft` list.
7. **Dedupe on `slot_id`**, which is unique per person-per-load, so a re-run
   or an overlapping poller can't double-log.

### Where the polling runs

This is the part that needs a decision. The app is on Vercel with Blob
storage, and a serverless function can't hold a 5-second timer all day:

- **Vercel Cron** (`vercel.json`) hitting an internal route — simplest fit for
  the existing architecture, but Hobby-plan cron is limited to once a day,
  which is useless here. Needs a paid plan for minute-level schedules.
- **Client-side polling** while the app is open in the browser — zero infra,
  fits "phone in my pocket at the DZ", but only captures loads while the tab
  is awake. On iOS a backgrounded tab stops.
- **A small always-on poller** elsewhere (a Pi at home, a cheap VPS, a GitHub
  Actions schedule at 5-minute granularity) writing into the same Blob store.
  Most reliable, most moving parts.
- **Manual "sync now" button** — poll on demand, plus a "loads I saw today"
  review screen. Least automatic, but honest about the constraint and it
  composes with any of the above.

My suggestion: build the parsing/matching layer first with these fixtures,
expose it behind a manual sync action, then choose a scheduler once the
mapping logic is proven.

---

## 5. Alternative sources considered

- **BurbleMe** (the jumper-facing app, `burbleme.burblesoft.com`) would give
  *your own* jump history directly rather than inferring it from a wall
  display — but it needs the user's account credentials, which is a different
  and much heavier integration. Worth revisiting only if the polling approach
  proves too lossy.
- **Scraping the `/jmp` HTML** is a dead end: the page ships no data, ExtJS
  builds the DOM from the same AJAX call we're already using.

---

## 6. Fixtures

| file | what it is |
| --- | --- |
| `fixtures/get-loads-on-call.json` | full `getLoads` response, one load `On Call`, 4 tandem groups (customer + TI + camera) and 2 sport jumpers |
| `fixtures/get-loads-departed.json` | the same load 13 minutes later, `status: "Departed"` — the other half of the commit trigger, and the one with a 13th slot (`jump: "Staff"`) added mid-countdown |
| `fixtures/get-setting.json` | `getSetting` response — DZ display config |
| `fixtures/get-loads-no-session.json` | what the endpoint returns without a session cookie |
| `fixtures/get-loads-langar-building.json` | **Skydive Langar (531)** — six-column board, four loads all `Building`, one solo jumper |

These are real captures and contain real jumper names as shown on the DZ's
public display. Pseudonymise them if this repo ever goes public.

---

## 7. Langar (531) vs Beccles (8494)

Both route through `dzm.burblesoft.com/jmp?dz_id=N` to the same
`eu-displays.burblesoft.com` host, and the endpoint, session bootstrap and
payload shape are identical. The DZ-level config is not:

| config | Beccles 8494 | **Langar 531** | why it matters |
| --- | --- | --- | --- |
| `jm_max_columns` | 4 | **6** | `loads` is padded to this many entries with `[]`. Nothing may assume 4 — `fixtures/get-loads-langar-building.json` is a real 6-column board with 4 loads and 2 pads |
| `dzm_jm_use_real_name_for_staff` | 1 | **0** | **The big one.** At Beccles staff show under their real name; at Langar they show under their Burble *display name*. So the name to put in settings is whatever nickname the board prints, not necessarily your legal name |
| `dzm_jm_show_rig` | 0 | **1** | Langar populates `rig_name` on a slot. Unused today, but it's the obvious way to auto-pick the rig on a logged jump later |
| `units_height` | metric | metric | altitude in metres, if exit altitude is ever auto-filled |
| `dzm_jm_display_closed_loads` | 0 | 0 | no history at either — §3 stands |

Plus one behavioural difference, reported by the jumper and not visible in
config: **Langar's manifesters generally don't press "Departed".** Loads sit
`On Call` (or `Building`) until they vanish. That is why nothing in the app
depends on that status — see `PLAN.md` §3.

### Codes at Langar

| code | role | source |
| --- | --- | --- |
| `TAN` | tandem instructor | confirmed by the jumper |
| `VID` | tandem camera | confirmed by the jumper |
| `EXP` | solo | seen on the live board |
| `EXP+KIT` | solo (kit hire) | Beccles; assumed the same here |

Langar's tandem codes are **not** the same as Beccles' `TI` / `CAM PHOTO` —
worth knowing, since the first version of this shipped with only the Beccles
pair and would have logged nothing for a tandem here. Both sets are in the
seeded map now, so either DZ works.

Anything unrecognised is still surfaced as "unmapped" for the jumper to map
rather than guessed at, which is what makes a new code a five-second fix
instead of a lost jump.
