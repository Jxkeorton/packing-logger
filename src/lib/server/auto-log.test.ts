// Regression coverage for auto-log.ts's rig handling — this exact spot
// has had two bugs in a row (a hardcoded "Tandem Rig" canopy, then the
// starred default rig applied to instructor jumps too, silently accruing
// wear onto gear an instructor never actually jumped). `./storage` is
// mocked with an in-memory Map, the same pattern as logbook.test.ts.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock('./storage', () => ({
  readText: async (key: string) => store.get(key) ?? null,
  writeText: async (key: string, content: string) => {
    store.set(key, content);
  },
}));

const { autoLogJump } = await import('./auto-log');
const { readLogbook } = await import('./logbook');
const { addCanopy, addLineset, addPilotChute, addContainer, addRig, setDefault } = await import('./logbook-settings');

beforeEach(() => {
  store.clear();
});

/** A saved rig whose components would (bug permitting) start accruing wear from someone else's jumps. */
async function givenAPersonalDefaultRig(rigName = 'My Personal Rig') {
  const canopies = await addCanopy({ name: 'My Sabre 190', baseJumps: 0 });
  const linesets = await addLineset({ name: 'My Lineset', baseJumps: 0 });
  const pilotChutes = await addPilotChute({ name: 'My PC', baseJumps: 0 });
  const containers = await addContainer({ name: 'My Container', baseJumps: 0 });
  const rigs = await addRig({
    name: rigName,
    canopyId: canopies.canopies.at(-1)!.id,
    linesetId: linesets.linesets.at(-1)!.id,
    pilotChuteId: pilotChutes.pilotChutes.at(-1)!.id,
    containerId: containers.containers.at(-1)!.id,
  });
  await setDefault('rig', rigs.rigs.at(-1)!.id);
}

describe('auto-logging a Tandem Instructor jump', () => {
  it('gets a fixed "Tandem Rig" label, not the starred personal default', async () => {
    await givenAPersonalDefaultRig();
    await autoLogJump({ jumpTypeName: 'Tandem Instructor', date: '2026-08-01', at: 'a1', description: 'test' });

    const [entry] = await readLogbook(0);
    expect(entry.rig).toBe('Tandem Rig');
  });

  it("leaves every component field blank, so it never accrues wear onto the instructor's own gear", async () => {
    await givenAPersonalDefaultRig();
    await autoLogJump({ jumpTypeName: 'Tandem Instructor', date: '2026-08-01', at: 'a1', description: 'test' });

    const [entry] = await readLogbook(0);
    expect(entry.canopy).toBe('');
    expect(entry.lineset).toBe('');
    expect(entry.pilotChute).toBe('');
    expect(entry.container).toBe('');
  });

  it('works with no saved rigs at all — the label is fixed, never looked up', async () => {
    // No settings written at all: fresh install, DEFAULTS applies.
    await autoLogJump({ jumpTypeName: 'Tandem Instructor', date: '2026-08-01', at: 'a1', description: 'test' });

    const [entry] = await readLogbook(0);
    expect(entry.rig).toBe('Tandem Rig');
  });

  it('is unaffected by a saved rig that happens to be named "Tandem Rig"', async () => {
    // The fix is a fixed label, not a lookup — a real Rig object with that
    // name (and its own components) must not sneak into canopy/lineset/etc.
    await givenAPersonalDefaultRig('Tandem Rig');
    await autoLogJump({ jumpTypeName: 'Tandem Instructor', date: '2026-08-01', at: 'a1', description: 'test' });

    const [entry] = await readLogbook(0);
    expect(entry.rig).toBe('Tandem Rig');
    expect(entry.canopy).toBe('');
  });
});

describe('auto-logging other jump types', () => {
  it('still uses the starred default rig for a Tandem Camera jump', async () => {
    await givenAPersonalDefaultRig();
    await autoLogJump({ jumpTypeName: 'Tandem Camera', date: '2026-08-01', at: 'a1', description: 'test' });

    const [entry] = await readLogbook(0);
    expect(entry.rig).toBe('My Personal Rig');
    expect(entry.canopy).toBe('My Sabre 190');
  });

  it('still uses the starred default rig for a solo jump synced from the manifest', async () => {
    await givenAPersonalDefaultRig();
    await autoLogJump({ jumpTypeName: 'Sport', date: '2026-08-01', at: 'a1', description: 'test' });

    const [entry] = await readLogbook(0);
    expect(entry.rig).toBe('My Personal Rig');
  });
});
