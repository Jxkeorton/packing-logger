// Runs the manifest sync on a schedule, so a load that flew while every
// phone was locked still lands in "Jumps to confirm" instead of being
// lost (Burble keeps no history — see NOTES.md §3). Nothing here decides
// *when* to run: an external heartbeat (the Cloudflare Worker in
// ../../../../worker) POSTs to /api/cron/burble-sync every couple of
// minutes, and this module is what that route calls.
//
// Still poll-only. A scheduled pass records sightings exactly as the
// "Check the board" button does; committing to the logbook stays a
// deliberate, human step (commitMatches).
import { authMode } from '../auth';
import { readLogbookSettings } from '../logbook-settings';
import { runAsUser } from '../storage';
import { listUsers } from '../users';
import type { BurbleLoadsResponse } from '../../burble';
import { fetchLoads } from './client';
import { syncOnce } from './sync';

// Europe/London, not UTC — the operating window is a wall-clock thing and
// has to track BST. The Worker's cron brackets this loosely; this is the
// exact gate, and it's here (not in the route) so it's unit-testable.
const WINDOW_START_MIN = 8 * 60 + 45; // 08:45
const WINDOW_END_MIN = 20 * 60; //      20:00

function londonMinutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/London',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return hour * 60 + minute;
}

/** True during the dropzone's operating hours (08:45–20:00 Europe/London). */
export function withinPollWindow(now: Date): boolean {
  const minutes = londonMinutesOfDay(now);
  return minutes >= WINDOW_START_MIN && minutes < WINDOW_END_MIN;
}

export interface ScopeResult {
  status: 'synced' | 'skipped-unconfigured' | 'skipped-unchanged' | 'error';
  detail?: string;
  boardLoads?: number;
}

/**
 * Sync whichever ledger the current storage scope points at (set by
 * runAsUser for a multi-user deployment, unset for a single-tenant one).
 * `boardFor` hands back a per-dropzone board fetched once per tick and
 * shared across every user at that DZ — so ten instructors at one
 * dropzone cost one request to Burble's wall-display endpoint, not ten.
 */
async function syncCurrentScope(
  boardFor: (dzId: string) => Promise<BurbleLoadsResponse | null>,
): Promise<ScopeResult> {
  const { burble } = await readLogbookSettings();
  if (!burble.enabled || !burble.dzId || burble.myNames.length === 0) {
    return { status: 'skipped-unconfigured' };
  }

  const board = await boardFor(burble.dzId);
  if (!board) return { status: 'error', detail: 'could not reach the Burble manifest' };

  const outcome = await syncOnce(burble, board);
  if (!outcome.ok) return { status: 'error', detail: outcome.error };
  return {
    status: outcome.skipped ? 'skipped-unchanged' : 'synced',
    boardLoads: outcome.boardLoads,
  };
}

export interface ScheduledSyncReport {
  ran: boolean;
  reason?: string;
  mode?: ReturnType<typeof authMode>;
  scopes?: Record<string, ScopeResult>;
}

/**
 * One scheduled pass. Returns a per-scope breakdown for the response
 * body — handy in the Worker's logs, and never anything sensitive (a
 * username, a status word, a load count).
 */
export async function runScheduledSync(now: Date = new Date()): Promise<ScheduledSyncReport> {
  if (!withinPollWindow(now)) return { ran: false, reason: 'outside poll window' };

  const boards = new Map<string, Promise<BurbleLoadsResponse | null>>();
  const boardFor = (dzId: string): Promise<BurbleLoadsResponse | null> => {
    let inflight = boards.get(dzId);
    if (!inflight) {
      inflight = fetchLoads(dzId)
        .then((r) => r.response)
        .catch((err: unknown) => {
          console.error(`[burble-cron] board fetch failed for dz ${dzId}`, err);
          return null;
        });
      boards.set(dzId, inflight);
    }
    return inflight;
  };

  const mode = authMode();
  const scopes: Record<string, ScopeResult> = {};

  if (mode === 'multi') {
    // Sequential, not Promise.all: the board fetch is already shared, so
    // the rest is just a couple of R2 ops per user — not worth firing a
    // burst of concurrent writes at the same bucket for.
    for (const user of await listUsers()) {
      scopes[user.username] = await runAsUser(user.id, () => syncCurrentScope(boardFor));
    }
  } else {
    scopes['(single-tenant)'] = await syncCurrentScope(boardFor);
  }

  return { ran: true, mode, scopes };
}
