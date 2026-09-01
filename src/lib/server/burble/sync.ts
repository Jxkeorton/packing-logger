// The Burble manifest sync state machine.
//
// Burble keeps no history: a load that has landed simply vanishes from the
// feed (see NOTES.md §3). So a jump only exists if the app was looking
// while the load was still on the board, and this module's whole job is to
// remember every sighting and never lose one.
//
// The rule is deliberately simple: **if your name is on the board when we
// look, that becomes a pending jump awaiting your confirmation.**
//
// An earlier version tried to *prove* you'd flown — watch the slot, wait
// for status "Departed", then wait for the load to leave the board. That
// does not survive contact with this dropzone: the manifesters generally
// never press Departed, leaving a load "On Call" with `time_left` counting
// into the negatives until it vanishes. Under the old rule almost every
// jump would have been discarded as a cancelled load.
//
// And proof was never needed. Nothing is written without the jumper
// confirming it after they land, and they know perfectly well whether they
// jumped. So the machine's job is to *capture candidates and not lose
// them* — status and time_left are recorded as hints to jog the memory,
// never as gates.
//
// Nothing here writes a jump on its own. syncOnce() only records sightings;
// committing is a separate, explicit step (see commitMatches).
import { readText, writeText } from '../storage';
import { todayKey } from '../../packing';
import { addJump, loadTodayState } from '../tandem';
import { OTHER_STAFF_LABELS } from '../../tandem';
import { autoLogJump } from '../auto-log';
import { readLogbookSettings, setBurbleSettings, type BurbleSettings } from '../logbook-settings';
import { fetchLoads, BurbleError } from './client';
import {
  FLOWN_STATUSES,
  matchSlots,
  normaliseCode,
  realLoads,
  describeMatch,
  type BurbleMatch,
  type BurbleRole,
} from '../../burble';

const STATE_KEY = 'burble-sync.json';

/**
 * A slot of mine seen on the board, held until the jumper confirms or
 * discards it. Once captured it is never removed automatically — losing a
 * real jump is far worse than carrying a candidate that gets discarded
 * with one tap.
 */
export interface PendingJump extends BurbleMatch {
  firstSeen: string; // ISO
  lastSeen: string; // ISO — when the board last showed this slot
  /** Seen with an explicit flown status. A bonus when it happens; not required. */
  sawFlownStatus: boolean;
  /** The load is no longer on the board — the strongest hint available that it went. */
  leftBoard: boolean;
}

export interface SyncState {
  sessionId: number | null;
  /** Absent on a cache miss, so `null` means "unknown" and forces a full pass. */
  lastVersion: number | null;
  /**
   * Fingerprint of whatever settings the last *real* (non-skipped) pass
   * matched against — myNames and codeMap, the two that decide whether a
   * slot matches at all. `null` (never set, or an older saved state from
   * before this existed) means "unknown", same treatment as lastVersion:
   * forces a full pass rather than risking a wrong skip.
   *
   * Needed because the version short-circuit below is otherwise blind to
   * a settings change: the board can be genuinely unchanged (same
   * version) while the reason a slot didn't match last time — a jump
   * code with no mapping yet — has just been fixed in Settings. Without
   * this, mapping a code that's already on the board does nothing until
   * the board itself changes, which "manifest sync ignored it
   * completely" is exactly what that looks like.
   */
  lastMatchSettingsKey: string | null;
  pending: Record<string, PendingJump>;
  /** slot id → the logbook `at` it was committed as. The dedupe ledger. */
  committed: Record<string, string>;
  /** Jump codes seen against my name that no mapping covers. */
  unmappedCodes: string[];
  lastSyncAt: string | null;
  /** Last time my name actually appeared on the board — a silent match failure is the likeliest way this breaks. */
  lastMatchAt: string | null;
}

const EMPTY_STATE: SyncState = {
  sessionId: null,
  lastVersion: null,
  lastMatchSettingsKey: null,
  pending: {},
  committed: {},
  unmappedCodes: [],
  lastSyncAt: null,
  lastMatchAt: null,
};

/** What a match outcome actually depends on — a change here should force a re-match even if the board hasn't moved. */
function matchSettingsKey(burble: BurbleSettings): string {
  return JSON.stringify({ myNames: burble.myNames, codeMap: burble.codeMap });
}

export async function readSyncState(): Promise<SyncState> {
  const raw = await readText(STATE_KEY);
  if (!raw) return EMPTY_STATE;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return EMPTY_STATE;
    return {
      sessionId: typeof parsed.sessionId === 'number' ? parsed.sessionId : null,
      lastVersion: typeof parsed.lastVersion === 'number' ? parsed.lastVersion : null,
      lastMatchSettingsKey: typeof parsed.lastMatchSettingsKey === 'string' ? parsed.lastMatchSettingsKey : null,
      pending: isRecord(parsed.pending) ? (parsed.pending as Record<string, PendingJump>) : {},
      committed: isRecord(parsed.committed) ? (parsed.committed as Record<string, string>) : {},
      unmappedCodes: Array.isArray(parsed.unmappedCodes)
        ? parsed.unmappedCodes.filter((c: unknown): c is string => typeof c === 'string')
        : [],
      lastSyncAt: typeof parsed.lastSyncAt === 'string' ? parsed.lastSyncAt : null,
      lastMatchAt: typeof parsed.lastMatchAt === 'string' ? parsed.lastMatchAt : null,
    };
  } catch {
    return EMPTY_STATE;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

async function writeSyncState(state: SyncState): Promise<void> {
  await writeText(STATE_KEY, JSON.stringify(state, null, 2));
}

/**
 * Everything awaiting confirmation, most recently seen first. Loads that
 * have left the board come first within that — they're the ones most
 * likely to be jumps you've actually done.
 */
export function pendingJumps(state: SyncState): PendingJump[] {
  return Object.values(state.pending).sort((a, b) => {
    if (a.leftBoard !== b.leftBoard) return a.leftBoard ? -1 : 1;
    return a.lastSeen < b.lastSeen ? 1 : -1;
  });
}

/**
 * How confident we are that this one actually flew — shown next to each
 * pending jump so the jumper can tell "this definitely went" from "this
 * was still sitting on the board when I last looked".
 */
export function flightHint(jump: PendingJump): string {
  if (jump.sawFlownStatus) return 'Departed';
  if (jump.leftBoard) return 'Off the board';
  if (jump.timeLeft !== null && jump.timeLeft <= 0) return `Overdue by ${Math.abs(jump.timeLeft)} min`;
  if (jump.timeLeft !== null) return `${jump.timeLeft} min to go`;
  return jump.status;
}

export interface SyncOutcome {
  ok: boolean;
  error?: string;
  /** True when the poll was skipped because the manifest version hadn't moved. */
  skipped?: boolean;
  boardLoads: number;
  state: SyncState;
}

/**
 * Poll once and advance the state machine. Never writes a jump.
 *
 * A new Burble `session_id` means a new jumping day, which is the moment
 * to drop anything still being watched: those loads belong to a day that's
 * over, and if they'd flown we'd have committed them already.
 */
export async function syncOnce(settings?: BurbleSettings): Promise<SyncOutcome> {
  const burble = settings ?? (await readLogbookSettings()).burble;
  const state = await readSyncState();

  if (!burble.enabled) return { ok: false, error: 'Manifest sync is switched off.', boardLoads: 0, state };
  if (!burble.dzId) return { ok: false, error: 'No dropzone id set.', boardLoads: 0, state };
  if (burble.myNames.length === 0) {
    return { ok: false, error: 'No name set to look for on the board.', boardLoads: 0, state };
  }

  let response;
  try {
    ({ response } = await fetchLoads(burble.dzId));
  } catch (err) {
    const message = err instanceof BurbleError ? err.message : 'Could not reach the Burble manifest.';
    return { ok: false, error: message, boardLoads: 0, state };
  }

  const now = new Date().toISOString();
  const loads = realLoads(response);
  const version = typeof response.version === 'number' ? response.version : null;
  const sessionId = typeof response.session_id === 'number' ? response.session_id : null;

  const next: SyncState = { ...state, lastSyncAt: now };

  // A new jumping day — anything still being watched is from the old one.
  if (sessionId !== null && state.sessionId !== null && sessionId !== state.sessionId) {
    next.pending = {};
    next.committed = {};
  }
  if (sessionId !== null) next.sessionId = sessionId;

  // Cheap short-circuit, but only when we positively know *both* the
  // board and whatever settings matching depends on are unchanged since
  // the last real pass. A missing version (cache miss) means unknown, so
  // we fall through and do the full pass — skipping one during a
  // departure window is exactly how a jump gets lost. Checking the
  // settings key too, not just the version, is what lets mapping a code
  // that's already on the board take effect on the very next sync
  // instead of waiting for the board to change on its own.
  const settingsKey = matchSettingsKey(burble);
  if (
    version !== null &&
    state.lastVersion !== null &&
    version === state.lastVersion &&
    state.lastMatchSettingsKey === settingsKey
  ) {
    await writeSyncState(next);
    return { ok: true, skipped: true, boardLoads: loads.length, state: next };
  }
  next.lastVersion = version;
  next.lastMatchSettingsKey = settingsKey;

  const { matches, unmappedCodes } = matchSlots(loads, burble.myNames, burble.codeMap);
  const onBoardLoadIds = new Set(loads.map((l) => l.id));
  const pending = { ...next.pending };

  // Seeing my name is enough to capture it. Confirmation happens later,
  // by the only party who actually knows: me, once I'm on the ground.
  for (const match of matches) {
    if (next.committed[match.slotId]) continue; // already logged
    const existing = pending[match.slotId];
    pending[match.slotId] = {
      ...match,
      firstSeen: existing?.firstSeen ?? now,
      lastSeen: now,
      // Once seen flown, always flown — the status can flick back as the
      // board redraws, and a load doesn't un-depart.
      sawFlownStatus: existing?.sawFlownStatus === true || FLOWN_STATUSES.includes(match.status),
      leftBoard: false,
    };
  }

  // A load that's no longer displayed has almost certainly gone. Flag it
  // as the strongest hint we have — but keep it either way, because a
  // cancelled load and a flown one look identical from here and only the
  // jumper can tell them apart.
  for (const [slotId, jump] of Object.entries(pending)) {
    if (onBoardLoadIds.has(jump.loadId)) continue;
    pending[slotId] = { ...jump, leftBoard: true };
  }

  next.pending = pending;
  // Additive with the previous list, not a replacement — an unmapped
  // code seen once should keep surfacing even after the load that
  // revealed it leaves the board, so there's still something to map it
  // from. But a code that's *since been mapped* has to actually drop
  // off here, not just stop being reported by matchSlots this pass —
  // otherwise it sits in the list forever looking unmapped even though
  // Settings now has it covered.
  const mappedCodes = new Set(burble.codeMap.map((m) => normaliseCode(m.code)));
  next.unmappedCodes = [...new Set([...state.unmappedCodes, ...unmappedCodes])].filter(
    (code) => !mappedCodes.has(normaliseCode(code)),
  );
  if (matches.length > 0) next.lastMatchAt = now;

  await writeSyncState(next);
  return { ok: true, boardLoads: loads.length, state: next };
}

export interface CommitResult {
  logged: number;
  skippedDuplicates: number;
}

/**
 * Turn confirmed sightings into real records.
 *
 * A tandem role writes twice — an invoiceable jump on the Tandems tab
 * *and* the logbook entry that hangs off it — sharing one `at` id, exactly
 * as tapping the button on that tab does. A solo writes the logbook entry
 * only.
 */
export async function commitMatches(slotIds: string[]): Promise<CommitResult> {
  const state = await readSyncState();
  const wanted = new Set(slotIds);
  const toCommit = pendingJumps(state).filter((jump) => wanted.has(jump.slotId));

  const date = todayKey();
  const existingTandemNames = await todayTandemKeys();

  const committed = { ...state.committed };
  const pending = { ...state.pending };
  let logged = 0;
  let skippedDuplicates = 0;

  for (const [index, slot] of toCommit.entries()) {
    // `at` is the entry's id and its insertion-order tiebreak, so nudge
    // each one along a millisecond rather than risking a collision when a
    // whole load is confirmed in one tap.
    const at = new Date(Date.now() + index).toISOString();

    if (slot.role === 'solo') {
      await autoLogJump({
        jumpTypeName: slot.jumpTypeName,
        date,
        at,
        description: manifestDescription(slot),
        aircraftPlate: slot.plate,
      });
    } else {
      // Guard against logging the same tandem twice when it was already
      // tapped in by hand on the Tandems tab. Two jumps with the same
      // customer name on one day is legitimate, so this is a safety net
      // for the common case, not a proof.
      const key = tandemKey(slot.role, slot.customerName);
      if (existingTandemNames.has(key)) {
        skippedDuplicates += 1;
        delete pending[slot.slotId];
        continue;
      }
      existingTandemNames.add(key);
      await addJump(slot.role, slot.customerName, at);
      await autoLogJump({
        jumpTypeName: slot.jumpTypeName,
        date,
        at,
        description: manifestDescription(slot),
        aircraftPlate: slot.plate,
      });
    }

    committed[slot.slotId] = at;
    delete pending[slot.slotId];
    logged += 1;
  }

  await writeSyncState({ ...state, committed, pending });
  return { logged, skippedDuplicates };
}

/** Forget a pending jump without logging it — a load I was manifested on but didn't jump. */
export async function dismissMatch(slotId: string): Promise<void> {
  const state = await readSyncState();
  if (!state.pending[slotId]) return;
  const pending = { ...state.pending };
  delete pending[slotId];
  await writeSyncState({ ...state, pending });
}

/**
 * Called when a jump is deleted elsewhere — the Tandems tab, or the
 * logbook directly — so that if it was originally synced from the
 * manifest, the slot stops being "already logged" against an `at` that no
 * longer exists anywhere.
 *
 * Without this, `committed` is permanent: syncOnce skips any slot it
 * already covers (see the loop above), so a deleted jump would never be
 * offered again even though the load might still be sitting on the
 * board. Clearing it here is what lets the next sync treat the slot as
 * unconfirmed again, same as if it had never been committed.
 *
 * A no-op for most deletions, since most jumps are logged by hand and
 * were never in `committed` to begin with.
 */
export async function forgetCommitted(at: string): Promise<void> {
  const state = await readSyncState();
  const slotId = Object.entries(state.committed).find(([, committedAt]) => committedAt === at)?.[0];
  if (!slotId) return;
  const committed = { ...state.committed };
  delete committed[slotId];
  await writeSyncState({ ...state, committed });
}

/** Clear the "unmapped codes" list once they've been dealt with. */
export async function clearUnmappedCodes(): Promise<void> {
  const state = await readSyncState();
  await writeSyncState({ ...state, unmappedCodes: [] });
}

/** Convenience for the auto-poll toggle, which flips one field. */
export async function setAutoPoll(autoPoll: boolean): Promise<void> {
  await setBurbleSettings({ autoPoll });
}

function tandemKey(role: BurbleRole, customerName: string): string {
  return `${role}::${customerName.trim().toLowerCase()}`;
}

/**
 * Tandem jumps already recorded today, as `role::customer` keys. Commits
 * are always dated today (addJump stamps todayKey() itself), so today's
 * state is the whole comparison set.
 */
async function todayTandemKeys(): Promise<Set<string>> {
  const state = await loadTodayState();
  const keys = new Set<string>();
  for (const category of Object.keys(state.entries) as (keyof typeof state.entries)[]) {
    for (const jump of state.entries[category]) {
      keys.add(tandemKey(category as BurbleRole, jump.name));
    }
  }
  return keys;
}

function manifestDescription(slot: PendingJump): string {
  const load = slot.loadNumber ? `${slot.plate} load ${slot.loadNumber}` : slot.loadName;
  const who = slot.customerName ? ` with ${slot.customerName}` : '';
  // The other staff member, when the board showed one — worded exactly as
  // the Tandems tab words the name it asks for by hand, so the two ways of
  // logging the same jump read alike in the logbook. Truthiness, not just
  // the type: a sighting captured before this field existed is still
  // sitting in burble-sync.json without it.
  const alongside =
    slot.role !== 'solo' && slot.otherStaffName ? ` ${OTHER_STAFF_LABELS[slot.role]}: ${slot.otherStaffName}.` : '';
  return `Auto-logged from the manifest — ${load}, ${slot.code}${who}.${alongside}`;
}

export { describeMatch };
