// The storage-backed half of the main app's src/lib/tandem.ts — see
// $lib/tandem.ts for the categories/rates/pure-total half this imports
// (and re-exports toHistoryRow from, unchanged, since callers importing
// "the tandem module" shouldn't need to know which half a given export
// lives in).
import { readText, writeText } from './storage';
import { todayKey } from '../packing';
import { csvEscape, parseCsvRows } from './csv';
import { readRateSettings } from './rate-settings';
import {
  CATEGORIES,
  totalEarnings,
  totalJumps,
  zeroCounts,
  type Category,
  type Counts,
  type DayState,
  type HistoryRow,
  type Jump,
} from '../tandem';

export type { Category, Counts, DayState, HistoryRow, Jump };

/** One backfilled jump for setDayEntries — a name, plus a level on AFF. */
export interface DayEntryInput {
  name: string;
  level?: string;
}
export { toHistoryRow } from '../tandem';

const JUMPS_KEY = 'tandem-jumps.csv';
const JUMPS_HEADER = 'date,category,name,level,handyCam,handyCamAt,handyCamAfterJump,at';
/** The pre-package/after-jump-split header, still sitting at the top of every existing file — see readJumps. */
const LEGACY_JUMPS_HEADER_V3 = 'date,category,name,level,handyCam,handyCamAt,at';
/** The pre-handy-cam header, older still. */
const LEGACY_JUMPS_HEADER_V2 = 'date,category,name,level,at';
/** The pre-AFF header, older still. */
const LEGACY_JUMPS_HEADER_V1 = 'date,category,name,at';

/** An empty per-category bucket, built from CATEGORIES so a new one can't be forgotten here. */
function emptyEntries(): Record<Category, Jump[]> {
  return Object.fromEntries(CATEGORIES.map((c) => [c, [] as Jump[]])) as Record<Category, Jump[]>;
}

async function readJumps(): Promise<Jump[]> {
  const raw = await readText(JUMPS_KEY);
  if (!raw) return [];
  // Customer names are cleaned with oneLine() so they shouldn't contain a
  // line break today, but parse whole rows anyway — the alternative silently
  // drops a record if one ever does (see parseCsvRows, and the logbook bug
  // that motivated it) rather than failing loudly.
  const jumps: Jump[] = [];
  for (const row of parseCsvRows(raw)) {
    const joined = row.join(',');
    if (
      joined === JUMPS_HEADER ||
      joined === LEGACY_JUMPS_HEADER_V3 ||
      joined === LEGACY_JUMPS_HEADER_V2 ||
      joined === LEGACY_JUMPS_HEADER_V1
    ) {
      continue;
    }
    // `level` was added with the AFF category, `handyCam`/`handyCamAt` with
    // the handy-cam bonus, `handyCamAfterJump` with the package/after-jump
    // split — so a row written before any of these has fewer columns. Read
    // by *width* rather than by which header the file happens to start
    // with: a file is rewritten whole on the next write, but until then one
    // that was migrated mid-session could legitimately hold more than one
    // shape at once, and getting this wrong would shift a later column into
    // an earlier one (a timestamp into the level, say).
    const [date, category] = row;
    let name = '';
    let level = '';
    let handyCam = false;
    let handyCamAt = '';
    let handyCamAfterJump = false;
    let at = '';
    if (row.length >= 8) {
      name = row[2];
      level = row[3];
      handyCam = row[4] === '1';
      handyCamAt = row[5] ?? '';
      handyCamAfterJump = row[6] === '1';
      at = row[7];
    } else if (row.length >= 7) {
      name = row[2];
      level = row[3];
      handyCam = row[4] === '1';
      handyCamAt = row[5] ?? '';
      at = row[6];
    } else if (row.length >= 5) {
      [name, level, at] = [row[2], row[3], row[4]];
    } else {
      [name, at] = [row[2], row[3]];
    }
    if (!date || !at || !CATEGORIES.includes(category as Category)) continue;
    jumps.push({
      date,
      category: category as Category,
      name: name ?? '',
      level: level ?? '',
      handyCam,
      handyCamAt,
      handyCamAfterJump,
      at,
    });
  }
  return jumps;
}

async function writeJumps(jumps: Jump[]): Promise<void> {
  const sorted = [...jumps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const body = sorted
    .map((j) =>
      [
        j.date,
        j.category,
        csvEscape(j.name),
        csvEscape(j.level),
        j.handyCam ? '1' : '0',
        j.handyCamAt,
        j.handyCamAfterJump ? '1' : '0',
        j.at,
      ].join(','),
    )
    .join('\n');
  await writeText(JUMPS_KEY, `${JUMPS_HEADER}\n${body}\n`);
}

function entriesFor(jumps: Jump[], date: string): Record<Category, Jump[]> {
  const out = emptyEntries();
  for (const j of jumps) {
    if (j.date === date) out[j.category].push(j);
  }
  return out;
}

function countsFromEntries(entries: Record<Category, Jump[]>): Counts {
  const counts = zeroCounts();
  for (const category of CATEGORIES) counts[category] = entries[category].length;
  return counts;
}

function stateFor(jumps: Jump[], date: string): DayState {
  const entries = entriesFor(jumps, date);
  return { date, counts: countsFromEntries(entries), entries };
}

/** Today's jumps, grouped by category — the live view the Tandems tab renders. */
export async function loadTodayState(): Promise<DayState> {
  const jumps = await readJumps();
  return stateFor(jumps, todayKey());
}

/**
 * Record one jump for today under `category`, crediting `name`. `at`
 * defaults to now, but can be passed explicitly so a caller (the
 * tandem-jump route action) can share the same id with a linked record
 * in another ledger — the personal logbook's auto-logged tandem entries.
 */
export async function addJump(
  category: Category,
  name: string,
  at: string = new Date().toISOString(),
  level = '',
  handyCam = false,
): Promise<DayState> {
  const jumps = await readJumps();
  const today = todayKey();
  // Only an AFF jump has a level, only an instructor jump can earn the
  // handy-cam bonus; anything arriving on another category is dropped
  // rather than stored, so a stray value can't turn up on the wrong kind
  // of row later and be rendered as if it meant something.
  const isHandyCam = category === 'instructor' && handyCam;
  jumps.push({
    date: today,
    category,
    name,
    level: category === 'aff' ? level : '',
    handyCam: isHandyCam,
    // Flagged at logging time, so the bonus starts out billing into the
    // same period as the jump itself — see the Jump.handyCamAt doc comment.
    handyCamAt: isHandyCam ? at : '',
    // Every caller of addJump (the manual "+ Add instructor jump" modal,
    // and a self-filmed match committed from the manifest) knows the
    // customer bought Ultimate *before* the jump — that's the whole
    // reason either one can flag it right now, at creation time. So this
    // is never the "bought after the jump" case; only setJumpHandyCam,
    // used later from the History tab, can set that true.
    handyCamAfterJump: false,
    at,
  });
  await writeJumps(jumps);
  return stateFor(jumps, today);
}

/**
 * Remove a single jump by its `at` timestamp (its id) — used to undo a
 * mis-tap or fix a typo'd name by re-adding it. Returns today's state
 * whether or not the removed jump was actually from today, since that's
 * what the Tandems tab has on screen.
 */
export async function removeJump(at: string): Promise<DayState> {
  const jumps = await readJumps();
  const remaining = jumps.filter((j) => j.at !== at);
  if (remaining.length !== jumps.length) {
    await writeJumps(remaining);
  }
  return stateFor(remaining, todayKey());
}

/**
 * Flip a single jump's handy-cam bonus on or off, and (while it's on) which
 * kind it is — the History tab's edit flow, for a past jump the customer
 * upgraded to Ultimate on, or a jump that needs its package/after-jump
 * classification corrected. No-ops on anything that isn't an 'instructor'
 * jump, the same guard addJump applies at creation time.
 *
 * `afterJump` defaults true (see the Jump.handyCamAfterJump doc comment):
 * the History tab is normally used for exactly the "customer upgraded once
 * home" case, so that's the assumption when turning the bonus on fresh —
 * the caller passes `false` when the instructor unticks the "bought after
 * the jump" checkbox, whether that's in the same action or a later one
 * correcting it.
 *
 * `handyCamAt` — which decides the bonus's invoice period, see its own doc
 * comment — is only re-stamped with *now* on the actual off→on transition.
 * Calling this again on a jump that's already flagged, only to flip
 * `afterJump`, must not silently move an already-billed bonus into a
 * different invoice period.
 */
export async function setJumpHandyCam(at: string, handyCam: boolean, afterJump = true): Promise<DayState> {
  const jumps = await readJumps();
  const index = jumps.findIndex((j) => j.at === at);
  if (index !== -1 && jumps[index].category === 'instructor') {
    const current = jumps[index];
    const turningOn = handyCam && !current.handyCam;
    jumps[index] = {
      ...current,
      handyCam,
      handyCamAt: handyCam ? (turningOn ? new Date().toISOString() : current.handyCamAt) : '',
      handyCamAfterJump: handyCam && afterJump,
    };
    await writeJumps(jumps);
  }
  return stateFor(jumps, todayKey());
}

/**
 * Replace all of a past day's jumps with a fresh list of customer names —
 * for backfilling a day logged on paper, or correcting a mistake, rather
 * than adding/removing one at a time.
 */
export async function setDayEntries(
  date: string,
  names: Record<Category, DayEntryInput[]>,
): Promise<DayState> {
  const jumps = await readJumps();
  const remaining = jumps.filter((j) => j.date !== date);

  // Synthetic, strictly-increasing timestamps so entries from the same
  // backfill sort in the order they were given rather than colliding.
  const base = new Date(`${date}T12:00:00.000Z`).getTime();
  let offset = 0;
  for (const category of CATEGORIES) {
    for (const entry of names[category] ?? []) {
      remaining.push({
        date,
        category,
        name: entry.name,
        level: category === 'aff' ? (entry.level ?? '') : '',
        // Backfilling a day from paper records has no handy-cam concept —
        // if one turns out to need it, it can be flagged afterwards from
        // the History tab like any other jump.
        handyCam: false,
        handyCamAt: '',
        handyCamAfterJump: false,
        at: new Date(base + offset).toISOString(),
      });
      offset += 1;
    }
  }

  await writeJumps(remaining);
  return stateFor(remaining, date);
}

/**
 * The raw jump ledger as a CSV, for download/export — this is the
 * invoice source. `amount` is each jump's category rate as it stands
 * right now, not whatever it was on the day the jump happened — the
 * same "always current, no historical snapshot" rate model this app
 * already used before rates were editable (see rate-settings.ts).
 */
export async function readCsvFile(): Promise<string> {
  const jumps = await readJumps();
  const rates = await readRateSettings();
  const sorted = [...jumps].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  const header = 'date,category,name,level,amount,handyCam,handyCamType,handyCamBonus,at';
  const body = sorted
    .map((j) =>
      [
        j.date,
        j.category,
        csvEscape(j.name),
        csvEscape(j.level),
        rates.tandem[j.category].toFixed(2),
        j.handyCam ? '1' : '0',
        // Human-readable rather than another 1/0 — this is the column the
        // employer's "package vs after-jump" split actually shows up in on
        // the raw export, so it's worth spelling out.
        j.handyCam ? (j.handyCamAfterJump ? 'after-jump' : 'package') : '',
        (j.handyCam ? rates.handyCamBonusRate : 0).toFixed(2),
        j.at,
      ].join(','),
    )
    .join('\n');
  return `${header}\n${body}\n`;
}

/** Shared by readHistory() and loadTodayStateAndHistory() — both derive this from the same jump list, just from different reads of it. */
function historyFromJumps(jumps: Jump[], rates: Record<Category, number>, limit: number): HistoryRow[] {
  const today = todayKey();
  const byDate = new Map<string, Counts>();
  for (const j of jumps) {
    if (j.date === today) continue;
    const counts = byDate.get(j.date) ?? zeroCounts();
    counts[j.category] += 1;
    byDate.set(j.date, counts);
  }

  const dates = [...byDate.keys()].sort().reverse().slice(0, limit);
  return dates.map((date) => {
    const counts = byDate.get(date)!;
    return {
      date,
      counts,
      totalJumps: totalJumps(counts),
      totalEarnings: totalEarnings(counts, rates),
    };
  });
}

/** Shared by loadTodayStateAndHistory() — the History tab's per-day jump lists, for finding and editing (e.g. a late handy-cam upgrade) an individual past jump rather than just seeing its day's totals. Same date window as historyFromJumps, keyed the same way, so the two line up. */
function dayJumpsFromJumps(jumps: Jump[], limit: number): Record<string, Jump[]> {
  const today = todayKey();
  const byDate = new Map<string, Jump[]>();
  for (const j of jumps) {
    if (j.date === today) continue;
    const list = byDate.get(j.date);
    if (list) list.push(j);
    else byDate.set(j.date, [j]);
  }

  const dates = [...byDate.keys()].sort().reverse().slice(0, limit);
  const out: Record<string, Jump[]> = {};
  for (const date of dates) {
    out[date] = byDate.get(date)!.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }
  return out;
}

/** Most recent history rows (excluding today), newest first, one per day. */
export async function readHistory(limit = 14): Promise<HistoryRow[]> {
  const [jumps, rates] = await Promise.all([readJumps(), readRateSettings()]);
  return historyFromJumps(jumps, rates.tandem, limit);
}

/**
 * loadTodayState() + readHistory() in one read of tandem-jumps.csv
 * instead of two — both were independently calling readJumps() on
 * every page load (the whole file, re-parsed twice, for what's the
 * same jump list either way). Used by +page.server.ts, which needs
 * both; loadTodayState()/readHistory() stay as their own functions for
 * the callers (actions, mostly) that only ever need one of them.
 *
 * `dayJumps` rides along on the same read, keyed by the same dates as
 * `history` — the individual jumps behind each day's counts, for the
 * History tab's per-jump list (see dayJumpsFromJumps).
 */
export async function loadTodayStateAndHistory(
  limit = 14,
): Promise<{ state: DayState; history: HistoryRow[]; dayJumps: Record<string, Jump[]> }> {
  const [jumps, rates] = await Promise.all([readJumps(), readRateSettings()]);
  return {
    state: stateFor(jumps, todayKey()),
    history: historyFromJumps(jumps, rates.tandem, limit),
    dayJumps: dayJumpsFromJumps(jumps, limit),
  };
}

/**
 * Every jump within `startDate`..`endDate` (both YYYY-MM-DD, inclusive),
 * grouped by category and sorted chronologically — the invoice PDF's data
 * source.
 */
export async function jumpsInRange(startDate: string, endDate: string): Promise<Record<Category, Jump[]>> {
  const jumps = await readJumps();
  const out = emptyEntries();
  for (const j of jumps) {
    if (j.date >= startDate && j.date <= endDate) out[j.category].push(j);
  }
  for (const category of CATEGORIES) {
    out[category].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  }
  return out;
}

/**
 * Every handy-cam-flagged jump whose *bonus* falls within `startDate`..
 * `endDate` (both YYYY-MM-DD, inclusive) — the invoice PDF's data source
 * for the handy-cam footage section. Bucketed on `handyCamAt`, not `date`:
 * a jump flagged at logging time bills in the same period as the jump
 * itself, but one upgraded later — after its own period's invoice has
 * already gone out — rolls into whichever period the upgrade actually
 * happened in (see the Jump.handyCamAt doc comment).
 */
export async function handyCamJumpsInRange(startDate: string, endDate: string): Promise<Jump[]> {
  const jumps = await readJumps();
  const out = jumps.filter((j) => {
    if (!j.handyCam || !j.handyCamAt) return false;
    const bonusDate = j.handyCamAt.slice(0, 10);
    return bonusDate >= startDate && bonusDate <= endDate;
  });
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return out;
}
