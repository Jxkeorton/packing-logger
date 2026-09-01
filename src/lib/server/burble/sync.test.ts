// The test that makes this feature trustworthy: feed a real sequence of
// captured manifest responses through the state machine and assert that
// exactly one jump comes out, with the right role and customer.
//
// Storage is mocked with an in-memory Map — sync.ts, logbook.ts and
// tandem.ts otherwise read/write real files under data/ (or R2, in production),
// and this suite must never touch that, since it's the user's actual saved
// data during local dev.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BurbleLoadsResponse } from '../../burble';
import { DEFAULT_BURBLE_CODE_MAP } from '../../burble';
import type { BurbleSettings } from '../logbook-settings';

const { store, queue } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  queue: [] as unknown[],
}));

vi.mock('../storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

// The HTTP client is replaced by a scripted queue of captured responses,
// so the state machine is exercised against real payload shapes without
// touching the network.
vi.mock('./client', () => ({
  BurbleError: class BurbleError extends Error {},
  fetchLoads: async () => {
    if (queue.length === 0) throw new Error('no scripted response left');
    return { response: queue.shift(), cookie: 'burblesoft=test' };
  },
}));

const { syncOnce, readSyncState, pendingJumps, flightHint, commitMatches, dismissMatch, forgetCommitted } = await import('./sync');
const { readLogbook, removeEntry } = await import('../logbook');
const { loadTodayState, removeJump } = await import('../tandem');

function fixture(name: string): BurbleLoadsResponse {
  return JSON.parse(readFileSync(path.join(process.cwd(), 'src/lib/server/burble/fixtures', name), 'utf-8'));
}

const ON_CALL = fixture('get-loads-on-call.json');
const DEPARTED = fixture('get-loads-departed.json');
const EMPTY_BOARD = fixture('get-loads-empty-board.json');
const LANGAR_BUILDING = fixture('get-loads-langar-building.json');

/** A fixture with the manifest version pinned, so version short-circuiting is testable. */
function at(response: BurbleLoadsResponse, version: number | undefined): BurbleLoadsResponse {
  const copy: BurbleLoadsResponse = { ...response, version, session_id: 9682 };
  if (version === undefined) delete copy.version;
  return copy;
}

/** A fixture with every load's time_left overridden — this DZ's only departure signal. */
function withTimeLeft(response: BurbleLoadsResponse, timeLeft: number): BurbleLoadsResponse {
  const loads = (response.loads as unknown[]).map((l) =>
    l && !Array.isArray(l) && typeof l === 'object' ? { ...l, time_left: timeLeft } : l,
  );
  return { ...response, loads };
}

function script(...responses: BurbleLoadsResponse[]) {
  queue.length = 0;
  queue.push(...responses);
}

function settingsFor(...myNames: string[]): BurbleSettings {
  return {
    enabled: true,
    dzId: '8494',
    myNames,
    autoPoll: false,
    pollSeconds: 30,
    codeMap: DEFAULT_BURBLE_CODE_MAP,
  };
}

// Dylan Whitehair is the TI on the first tandem group; Miranda Walfield is
// his customer. Bethan-Rose Dickinson is a solo (EXP) on the same load.
const TI = settingsFor('Dylan Whitehair');
const SOLO = settingsFor('Bethan-Rose Dickinson');

beforeEach(() => {
  store.clear();
  queue.length = 0;
});


describe('capturing a sighting', () => {
  it('holds a jump for confirmation as soon as my name is on the board', async () => {
    // No waiting for a departure: the jumper confirms later, so the only
    // job here is to not lose the sighting.
    script(at(ON_CALL, 1));
    await syncOnce(TI);

    const pending = pendingJumps(await readSyncState());
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({
      role: 'instructor',
      jumpTypeName: 'Tandem Instructor',
      customerName: 'Miranda Walfield',
      plate: 'G-UKPS',
      loadNumber: '6',
      leftBoard: false,
    });
  });

  it('flags the load as off the board once it stops being displayed', async () => {
    script(at(ON_CALL, 1), at(EMPTY_BOARD, 2));
    await syncOnce(TI);
    await syncOnce(TI);

    const [jump] = pendingJumps(await readSyncState());
    expect(jump.leftBoard).toBe(true);
  });
});

describe('a dropzone that never sets "Departed"', () => {
  it('still offers the jump when the load only ever went overdue then vanished', async () => {
    // Beccles leaves loads "On Call" and lets time_left run negative; the
    // plane going is only visible as the load disappearing. An earlier
    // version required a "Departed" sighting and discarded this as a
    // cancelled load, which would have lost nearly every jump.
    const overdue = withTimeLeft(ON_CALL, -2);
    script(at(overdue, 1), at(EMPTY_BOARD, 2));
    await syncOnce(TI);
    await syncOnce(TI);

    const pending = pendingJumps(await readSyncState());
    expect(pending).toHaveLength(1);
    expect(pending[0].sawFlownStatus).toBe(false);
    expect(pending[0].leftBoard).toBe(true);
  });

  it('reads a negative time_left as overdue, not as proof it flew', async () => {
    script(at(withTimeLeft(ON_CALL, -2), 1));
    await syncOnce(TI);
    const [jump] = pendingJumps(await readSyncState());
    expect(jump.timeLeft).toBe(-2);
    expect(jump.sawFlownStatus).toBe(false);
    expect(flightHint(jump)).toBe('Overdue by 2 min');
  });

  it('describes each sighting so the jumper can tell them apart', async () => {
    script(at(ON_CALL, 1), at(DEPARTED, 2), at(EMPTY_BOARD, 3));

    await syncOnce(TI);
    expect(flightHint(pendingJumps(await readSyncState())[0])).toBe('13 min to go');

    await syncOnce(TI); // this capture does carry a Departed status
    expect(flightHint(pendingJumps(await readSyncState())[0])).toBe('Departed');

    await syncOnce(TI);
    expect(pendingJumps(await readSyncState())[0].leftBoard).toBe(true);
  });
});

describe('version short-circuiting', () => {
  it('skips the pass when the manifest version has not moved', async () => {
    script(at(ON_CALL, 7), at(ON_CALL, 7));
    await syncOnce(TI);
    expect((await syncOnce(TI)).skipped).toBe(true);
  });

  it('does a full pass when the version is missing, as on a cache miss', async () => {
    // A cache-miss response omits `version` entirely; treating that as
    // "unchanged" would skip a poll, quite possibly the only one taken
    // while the load was still on the board.
    script(at(ON_CALL, 7), at(EMPTY_BOARD, undefined));
    await syncOnce(TI);
    expect((await syncOnce(TI)).skipped).toBeFalsy();
    expect(pendingJumps(await readSyncState())[0].leftBoard).toBe(true);
  });

  it('does a full pass — not skipped — when only the code map changed, not the board', async () => {
    // Reported bug: map a code that's already on the board, sync again
    // with nothing else different, and it was silently ignored — the
    // short-circuit above only ever looked at the board's own version,
    // not at whether *matching itself* had anything new to work with.
    const withoutTI: BurbleSettings = { ...TI, codeMap: DEFAULT_BURBLE_CODE_MAP.filter((m) => m.code !== 'TI') };
    script(at(ON_CALL, 7));
    await syncOnce(withoutTI);
    expect(pendingJumps(await readSyncState())).toHaveLength(0);
    expect((await readSyncState()).unmappedCodes).toContain('TI');

    // Same board version as before (7), only the settings passed in changed.
    script(at(ON_CALL, 7));
    const outcome = await syncOnce(TI);

    expect(outcome.skipped).toBeFalsy();
    const pending = pendingJumps(await readSyncState());
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ role: 'instructor', customerName: 'Miranda Walfield' });
  });

  it('drops a code from unmappedCodes once it has a mapping, even without it appearing on the board again', async () => {
    const withoutTI: BurbleSettings = { ...TI, codeMap: DEFAULT_BURBLE_CODE_MAP.filter((m) => m.code !== 'TI') };
    script(at(ON_CALL, 7));
    await syncOnce(withoutTI);
    expect((await readSyncState()).unmappedCodes).toContain('TI');

    // The board's moved on (empty now) — TI won't be re-seen as unmapped
    // or otherwise this pass, only the settings say it's covered now.
    script(at(EMPTY_BOARD, 8));
    await syncOnce(TI);

    expect((await readSyncState()).unmappedCodes).not.toContain('TI');
  });
});

describe('confirming a tandem jump', () => {
  it('writes both an invoiceable tandem jump and a logbook entry, sharing one id', async () => {
    script(at(ON_CALL, 1));
    await syncOnce(TI);

    const [jump] = pendingJumps(await readSyncState());
    expect(await commitMatches([jump.slotId])).toEqual({ logged: 1, skippedDuplicates: 0 });

    const tandemState = await loadTodayState();
    expect(tandemState.counts.instructor).toBe(1);
    expect(tandemState.entries.instructor[0].name).toBe('Miranda Walfield');

    const entries = await readLogbook(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].jumpType).toBe('Tandem Instructor');
    expect(entries[0].description).toContain('G-UKPS load 6');
    expect(entries[0].description).toContain('Miranda Walfield');
    // The camera flyer manifested on the same group, named the same way
    // the Tandems tab names the one it asks for by hand.
    expect(entries[0].description).toContain('Camera flyer: Barry Woollard');

    // Same `at` on both, so deleting the tandem jump removes the logbook
    // entry too — the link the Tandems tab already relies on.
    expect(entries[0].at).toBe(tandemState.entries.instructor[0].at);
  });

  it('leaves the camera flyer out when the manifest showed none', async () => {
    // Liam Domin-Goddard's group is a customer and him, nothing else — so
    // there is no other staff member to name, and the description says
    // nothing rather than trailing an empty label.
    const noCamera = settingsFor('Liam Domin-Goddard');
    script(at(ON_CALL, 1));
    await syncOnce(noCamera);

    const [jump] = pendingJumps(await readSyncState());
    await commitMatches([jump.slotId]);

    const [entry] = await readLogbook(0);
    expect(entry.description).toContain('Aleksandra Rola');
    expect(entry.description).not.toContain('Camera flyer');
  });

  it('does not log the same slot twice', async () => {
    script(at(ON_CALL, 1));
    await syncOnce(TI);
    const [jump] = pendingJumps(await readSyncState());

    await commitMatches([jump.slotId]);
    expect((await commitMatches([jump.slotId])).logged).toBe(0);
    expect(await readLogbook(0)).toHaveLength(1);
  });

  it('will not re-offer a slot that has already been logged', async () => {
    script(at(ON_CALL, 1), at(ON_CALL, 2));
    await syncOnce(TI);
    const [jump] = pendingJumps(await readSyncState());
    await commitMatches([jump.slotId]);

    // The same load still on the board must not resurrect a jump that's
    // already in the logbook.
    await syncOnce(TI);
    expect(pendingJumps(await readSyncState())).toHaveLength(0);
    expect(await readLogbook(0)).toHaveLength(1);
  });

  it('offers the slot again once its committed jump is deleted', async () => {
    // The exact scenario reported: sync finds a match, it's confirmed, and
    // then deleted again — all before the board itself has changed. A
    // second sync (once the board *does* change, per the version-caching
    // note above) should treat the slot as unconfirmed again, not as
    // permanently "already logged" against an `at` that no longer exists
    // anywhere.
    script(at(ON_CALL, 1), at(ON_CALL, 2));
    await syncOnce(TI);
    const [jump] = pendingJumps(await readSyncState());
    await commitMatches([jump.slotId]);

    const tandemState = await loadTodayState();
    const loggedAt = tandemState.entries.instructor[0].at;
    await removeJump(loggedAt);
    await removeEntry(loggedAt, 0);
    // These three calls are what deleteTandemJump does, in
    // actions/tandem.ts — exercised directly here since this suite tests
    // sync.ts's state machine, not the SvelteKit action layer around it.
    await forgetCommitted(loggedAt);

    await syncOnce(TI);
    const pendingAfterDelete = pendingJumps(await readSyncState());
    expect(pendingAfterDelete).toHaveLength(1);
    expect(pendingAfterDelete[0].slotId).toBe(jump.slotId);
  });

  it('forgetCommitted is a no-op for an `at` that was never synced from the manifest', async () => {
    // Most deleted jumps were logged by hand from the Tandems tab, not
    // synced — this must not throw or touch state that isn't there.
    await expect(forgetCommitted('2026-01-01T00:00:00.000Z')).resolves.toBeUndefined();
  });

  it('leaves unconfirmed jumps alone when only one is confirmed', async () => {
    script(at(ON_CALL, 1));
    await syncOnce(settingsFor('Dylan Whitehair', 'Bethan-Rose Dickinson'));

    const pending = pendingJumps(await readSyncState());
    expect(pending).toHaveLength(2);

    const ti = pending.find((j) => j.role === 'instructor')!;
    await commitMatches([ti.slotId]);

    const left = pendingJumps(await readSyncState());
    expect(left).toHaveLength(1);
    expect(left[0].role).toBe('solo');
    expect(await readLogbook(0)).toHaveLength(1);
  });
});

describe('confirming a solo jump', () => {
  it('writes only a logbook entry — no invoice line', async () => {
    script(at(ON_CALL, 1));
    await syncOnce(SOLO);

    const [jump] = pendingJumps(await readSyncState());
    expect(jump.role).toBe('solo');
    await commitMatches([jump.slotId]);

    const entries = await readLogbook(0);
    expect(entries).toHaveLength(1);
    expect(entries[0].jumpType).toBe('Sport');

    const tandemState = await loadTodayState();
    expect(tandemState.counts.instructor).toBe(0);
    expect(tandemState.counts.videographer).toBe(0);
  });
});

describe('discarding', () => {
  it('drops a pending jump without logging anything', async () => {
    script(at(ON_CALL, 1));
    await syncOnce(TI);

    const [jump] = pendingJumps(await readSyncState());
    await dismissMatch(jump.slotId);

    expect(pendingJumps(await readSyncState())).toHaveLength(0);
    expect(await readLogbook(0)).toEqual([]);
  });
});

describe('guards', () => {
  it('only considers jumps when a configured name is on the board', async () => {
    script(at(ON_CALL, 1));
    await syncOnce(settingsFor('Someone Not On This Load'));
    expect(pendingJumps(await readSyncState())).toHaveLength(0);
  });

  it('refuses to sync when switched off, with no network call', async () => {
    const outcome = await syncOnce({ ...TI, enabled: false });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/switched off/i);
  });

  it('refuses to sync with no name configured', async () => {
    const outcome = await syncOnce({ ...TI, myNames: [] });
    expect(outcome.ok).toBe(false);
    expect(outcome.error).toMatch(/name/i);
  });

  it('records unmapped codes seen against my name', async () => {
    // Tim Trevis's `Staff` slot was added to the load mid-countdown, so
    // it's the departed capture that has him, not the earlier one.
    script(at(DEPARTED, 1));
    await syncOnce(settingsFor('Tim Trevis'));
    const state = await readSyncState();
    expect(state.unmappedCodes).toContain('Staff');
    // Surfaced, but never guessed at — nothing is queued to confirm.
    expect(pendingJumps(state)).toHaveLength(0);
  });
});

describe('Skydive Langar (dz_id 531)', () => {
  // The DZ this app is actually used at. Its board differs from the
  // Beccles captures above in ways worth pinning down: six columns rather
  // than four, and loads that sit in "Building" for a long time.
  it('reads a six-column board without tripping over the extra padding', async () => {
    script(at(LANGAR_BUILDING, 1));
    await syncOnce(settingsFor('Toby Townsend'));

    const pending = pendingJumps(await readSyncState());
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ role: 'solo', code: 'EXP', plate: 'G-FLOH', loadNumber: '3' });
  });

  it('captures a jump that is still only Building, without pretending it flew', async () => {
    script(at(LANGAR_BUILDING, 1));
    await syncOnce(settingsFor('Toby Townsend'));

    const [jump] = pendingJumps(await readSyncState());
    expect(jump.status).toBe('Building');
    expect(jump.sawFlownStatus).toBe(false);
    expect(jump.leftBoard).toBe(false);
  });
});
