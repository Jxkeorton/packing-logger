// The scheduled pass: the operating-hours gate, the multi-user fan-out,
// and the one thing that keeps it polite at scale — one board fetch per
// dropzone per tick, shared across every user at that DZ.
//
// Everything the module touches is mocked: no storage, no network, no
// real sync state machine (that has its own suite in sync.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BurbleSettings } from '../logbook-settings';

const { state } = vi.hoisted(() => ({
  state: {
    currentScope: null as string | null,
    mode: 'multi' as 'multi' | 'single' | 'none',
    users: [] as { id: string; username: string; createdAt: string }[],
    burbleByScope: new Map<string, BurbleSettings>(),
    fetchCalls: [] as string[],
    syncCalls: [] as { dzId: string }[],
    fetchThrows: false,
    syncSkips: false,
  },
}));

vi.mock('../auth', () => ({ authMode: () => state.mode }));

vi.mock('../users', () => ({ listUsers: async () => state.users }));

vi.mock('../storage', () => ({
  // Enough of runAsUser for the test: track whose ledger the current
  // call is "in", and keep it set for the whole async chain (the real
  // one uses AsyncLocalStorage for exactly this).
  runAsUser: async (userId: string, fn: () => unknown) => {
    const previous = state.currentScope;
    state.currentScope = userId;
    try {
      return await fn();
    } finally {
      state.currentScope = previous;
    }
  },
}));

vi.mock('../logbook-settings', () => ({
  readLogbookSettings: async () => {
    const key = state.currentScope ?? '(single-tenant)';
    const burble: BurbleSettings = state.burbleByScope.get(key) ?? {
      enabled: false,
      dzId: '',
      myNames: [],
      codeMap: [],
      codeSeedVersion: 1,
    };
    return { burble };
  },
}));

vi.mock('./client', () => ({
  BurbleError: class BurbleError extends Error {},
  fetchLoads: async (dzId: string) => {
    state.fetchCalls.push(dzId);
    if (state.fetchThrows) throw new Error('network down');
    return { response: { loads: [[], [], [], []], dzId }, cookie: 'burblesoft=test' };
  },
}));

vi.mock('./sync', () => ({
  syncOnce: async (burble: BurbleSettings) => {
    state.syncCalls.push({ dzId: burble.dzId });
    return { ok: true, skipped: state.syncSkips, boardLoads: 3, state: {} };
  },
}));

const { runScheduledSync, withinPollWindow } = await import('./cron');

const enabled = (dzId: string, names = ['Jake Orton']): BurbleSettings => ({
  enabled: true,
  dzId,
  myNames: names,
  codeMap: [],
  codeSeedVersion: 1,
});

// A fixed instant inside 08:45–20:00 Europe/London (13:00 BST).
const INSIDE = new Date('2026-09-09T12:00:00Z');

beforeEach(() => {
  state.currentScope = null;
  state.mode = 'multi';
  state.users = [];
  state.burbleByScope.clear();
  state.fetchCalls = [];
  state.syncCalls = [];
  state.fetchThrows = false;
  state.syncSkips = false;
});

describe('withinPollWindow (Europe/London, DST-aware)', () => {
  it('is open during operating hours in summer (BST) and winter (GMT)', () => {
    expect(withinPollWindow(new Date('2026-07-01T08:00:00Z'))).toBe(true); // 09:00 BST
    expect(withinPollWindow(new Date('2026-01-15T09:00:00Z'))).toBe(true); // 09:00 GMT
  });

  it('is closed before 08:45 and at/after 20:00 local', () => {
    expect(withinPollWindow(new Date('2026-07-01T07:30:00Z'))).toBe(false); // 08:30 BST
    expect(withinPollWindow(new Date('2026-07-01T19:15:00Z'))).toBe(false); // 20:15 BST
    expect(withinPollWindow(new Date('2026-01-15T20:00:00Z'))).toBe(false); // 20:00 GMT, exclusive
  });

  it('includes the 08:45 edge', () => {
    expect(withinPollWindow(new Date('2026-01-15T08:45:00Z'))).toBe(true); // 08:45 GMT
  });
});

describe('runScheduledSync', () => {
  it('does nothing outside the poll window', async () => {
    state.users = [{ id: 'u1', username: 'jake', createdAt: '' }];
    state.burbleByScope.set('u1', enabled('531'));

    const report = await runScheduledSync(new Date('2026-09-09T23:00:00Z'));

    expect(report).toEqual({ ran: false, reason: 'outside poll window' });
    expect(state.fetchCalls).toEqual([]);
    expect(state.syncCalls).toEqual([]);
  });

  it('fetches each dropzone board once and shares it across users at that DZ', async () => {
    state.users = [
      { id: 'u1', username: 'jake', createdAt: '' },
      { id: 'u2', username: 'mila', createdAt: '' },
      { id: 'u3', username: 'aimee', createdAt: '' },
    ];
    state.burbleByScope.set('u1', enabled('531'));
    state.burbleByScope.set('u2', enabled('531'));
    state.burbleByScope.set('u3', enabled('8494'));

    const report = await runScheduledSync(INSIDE);

    // Langar (531) fetched once despite two users; Beccles (8494) once.
    expect(state.fetchCalls.sort()).toEqual(['531', '8494']);
    // But every user still gets their own sync pass.
    expect(state.syncCalls.map((c) => c.dzId).sort()).toEqual(['531', '531', '8494']);
    expect(report.ran).toBe(true);
    expect(report.scopes).toMatchObject({
      jake: { status: 'synced', boardLoads: 3 },
      mila: { status: 'synced' },
      aimee: { status: 'synced' },
    });
  });

  it('skips users who have not configured manifest sync, without a board fetch on their behalf', async () => {
    state.users = [
      { id: 'u1', username: 'jake', createdAt: '' },
      { id: 'u2', username: 'newbie', createdAt: '' },
    ];
    state.burbleByScope.set('u1', enabled('531'));
    // u2: left at defaults (disabled)

    const report = await runScheduledSync(INSIDE);

    expect(report.scopes).toMatchObject({
      jake: { status: 'synced' },
      newbie: { status: 'skipped-unconfigured' },
    });
    expect(state.syncCalls).toHaveLength(1);
    expect(state.fetchCalls).toEqual(['531']);
  });

  it('reports a scope as errored when the board cannot be fetched', async () => {
    state.users = [{ id: 'u1', username: 'jake', createdAt: '' }];
    state.burbleByScope.set('u1', enabled('531'));
    state.fetchThrows = true;

    const report = await runScheduledSync(INSIDE);

    expect(report.scopes?.jake.status).toBe('error');
    expect(state.syncCalls).toEqual([]);
  });

  it('passes through the state machine’s "nothing changed" short-circuit', async () => {
    state.users = [{ id: 'u1', username: 'jake', createdAt: '' }];
    state.burbleByScope.set('u1', enabled('531'));
    state.syncSkips = true;

    const report = await runScheduledSync(INSIDE);

    expect(report.scopes?.jake.status).toBe('skipped-unchanged');
  });

  it('runs a single-tenant deployment as one unscoped ledger', async () => {
    state.mode = 'single';
    state.burbleByScope.set('(single-tenant)', enabled('531'));

    const report = await runScheduledSync(INSIDE);

    expect(report.mode).toBe('single');
    expect(report.scopes).toMatchObject({ '(single-tenant)': { status: 'synced' } });
    expect(state.fetchCalls).toEqual(['531']);
  });
});
