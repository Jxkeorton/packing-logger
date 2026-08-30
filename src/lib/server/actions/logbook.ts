// Logbook tab actions — extracted from the spike's +page.server.ts
// unchanged, so the root route's action list can compose this with
// packing.ts and tandem.ts's action groups instead of being one huge
// file. See that spike (svelte-spike git history) for how this behaves;
// nothing here changed for the full migration.
import { fail, type Action } from '@sveltejs/kit';
import { addEntry, readLogbook, removeEntry, updateEntry, type EntryInput } from '$lib/server/logbook';
import {
  addAircraft,
  addCanopy,
  addContainer,
  addJumpType,
  addLineset,
  addPilotChute,
  addPlace,
  addRig,
  readLogbookSettings,
  removeAircraft,
  removeCanopy,
  removeContainer,
  removeJumpType,
  removeLineset,
  removePilotChute,
  removePlace,
  removeRig,
  resolveRigComponents,
  setBaseJumps,
  setDefault,
  type DefaultCategory,
} from '$lib/server/logbook-settings';
import {
  removeBurbleCodeMapping,
  setBurbleCodeMapping,
  setBurbleSettings,
} from '$lib/server/logbook-settings';
import { clearUnmappedCodes, commitMatches, dismissMatch, syncOnce } from '$lib/server/burble/sync';
import { oneLine, multiLine } from '$lib/server/form-utils';
import type { BurbleRole } from '$lib/burble';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Jumps a component already carried before it was added here. Blank means
 * none — a brand-new part — so an empty or junk value is 0 rather than an
 * error, since this is an optional field on the add form.
 */
function componentBaseJumps(formData: FormData): number {
  const n = Number(formData.get('baseJumps'));
  return Number.isInteger(n) && n >= 0 ? n : 0;
}

// The form submits dropdown *ids* (placeId/rigId/...), same as the main
// app's <select> values — but here the id->text resolution the main
// app's client-side JS did (selectedOptionText, the equipment dataset
// reads) happens server-side instead, against the current saved settings.
// One consequence worth knowing: this form degrades gracefully with JS
// disabled, which the fetch-based version never did.
//
// aad isn't resolved from anything here — it's no longer collected by the
// form (see logbook-settings.ts's Rig) — so it's left out of EntryInput's
// concerns entirely; updateJump below is responsible for carrying an
// existing entry's aad forward across an edit instead of blanking it.
async function resolveEntryInput(formData: FormData): Promise<{ input: Omit<EntryInput, 'aad'> } | { error: string }> {
  const date = oneLine(formData.get('date'), 10);
  if (!DATE_RE.test(date)) return { error: 'date is required and must be YYYY-MM-DD' };

  const settings = await readLogbookSettings();
  const place = settings.places.find((p) => p.id === formData.get('placeId'));
  const rigComponents = resolveRigComponents(settings, String(formData.get('rigId') ?? ''));
  const aircraft = settings.aircraft.find((a) => a.id === formData.get('aircraftId'));
  const jumpType = settings.jumpTypes.find((j) => j.id === formData.get('jumpTypeId'));

  return {
    input: {
      date,
      place: place?.name ?? '',
      exitAltitude: oneLine(formData.get('exitAltitude'), 120),
      rig: rigComponents.rig,
      canopy: rigComponents.canopy,
      lineset: rigComponents.lineset,
      pilotChute: rigComponents.pilotChute,
      container: rigComponents.container,
      aircraft: aircraft?.plate ?? '',
      jumpType: jumpType?.name ?? '',
      description: multiLine(formData.get('description'), 4000),
    },
  };
}

export const logbookActions: Record<string, Action> = {
  logJump: async ({ request }) => {
    const parsed = await resolveEntryInput(await request.formData());
    if ('error' in parsed) return fail(400, { error: parsed.error });
    const settings = await readLogbookSettings();
    // aad is never set on a new entry — nothing in the form collects it
    // any more (see resolveEntryInput's comment) — but the field still
    // exists on every entry so older rows keep round-tripping.
    await addEntry({ ...parsed.input, aad: '' }, settings.baseJumps);
  },

  updateJump: async ({ request }) => {
    const formData = await request.formData();
    const at = String(formData.get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });
    const parsed = await resolveEntryInput(formData);
    if ('error' in parsed) return fail(400, { error: parsed.error });
    const settings = await readLogbookSettings();
    // Carry the existing entry's aad forward rather than blanking it —
    // editing, say, a typo in an old jump's description shouldn't erase
    // AAD text it was logged with back when the form still collected it.
    const existing = (await readLogbook(settings.baseJumps)).find((e) => e.at === at);
    if (!existing) return fail(404, { error: 'No jump found with that id' });
    const result = await updateEntry(at, { ...parsed.input, aad: existing.aad }, settings.baseJumps);
    if (!result) return fail(404, { error: 'No jump found with that id' });
  },

  deleteJump: async ({ request }) => {
    const at = String((await request.formData()).get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });
    const settings = await readLogbookSettings();
    await removeEntry(at, settings.baseJumps);
  },

  addPlace: async ({ request }) => {
    const name = oneLine((await request.formData()).get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    await addPlace({ name });
  },

  removePlace: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removePlace(id);
  },

  addCanopy: async ({ request }) => {
    const formData = await request.formData();
    const name = oneLine(formData.get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    await addCanopy({ name, baseJumps: componentBaseJumps(formData) });
  },

  removeCanopy: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeCanopy(id);
  },

  addLineset: async ({ request }) => {
    const formData = await request.formData();
    const name = oneLine(formData.get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    await addLineset({ name, baseJumps: componentBaseJumps(formData) });
  },

  removeLineset: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeLineset(id);
  },

  addPilotChute: async ({ request }) => {
    const formData = await request.formData();
    const name = oneLine(formData.get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    await addPilotChute({ name, baseJumps: componentBaseJumps(formData) });
  },

  removePilotChute: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removePilotChute(id);
  },

  addContainer: async ({ request }) => {
    const formData = await request.formData();
    const name = oneLine(formData.get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    await addContainer({ name, baseJumps: componentBaseJumps(formData) });
  },

  removeContainer: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeContainer(id);
  },

  addRig: async ({ request }) => {
    const formData = await request.formData();
    const name = oneLine(formData.get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    const idOrNull = (value: FormDataEntryValue | null) => (typeof value === 'string' && value ? value : null);
    await addRig({
      name,
      canopyId: idOrNull(formData.get('canopyId')),
      linesetId: idOrNull(formData.get('linesetId')),
      pilotChuteId: idOrNull(formData.get('pilotChuteId')),
      containerId: idOrNull(formData.get('containerId')),
    });
  },

  removeRig: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeRig(id);
  },

  addAircraft: async ({ request }) => {
    const plate = oneLine((await request.formData()).get('plate'), 20);
    if (!plate) return fail(400, { error: 'plate is required' });
    await addAircraft({ plate });
  },

  removeAircraft: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeAircraft(id);
  },

  addJumpType: async ({ request }) => {
    const name = oneLine((await request.formData()).get('name'), 40);
    if (!name) return fail(400, { error: 'name is required' });
    await addJumpType({ name });
  },

  removeJumpType: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeJumpType(id);
  },

  setDefault: async ({ request }) => {
    const formData = await request.formData();
    const category = String(formData.get('category') ?? '') as DefaultCategory;
    const rawId = formData.get('id');
    const id = typeof rawId === 'string' && rawId ? rawId : null;
    await setDefault(category, id);
  },

  setBaseJumps: async ({ request }) => {
    const baseJumps = Number((await request.formData()).get('baseJumps'));
    if (!Number.isInteger(baseJumps) || baseJumps < 0) {
      return fail(400, { error: 'baseJumps must be a whole number, 0 or more' });
    }
    await setBaseJumps(baseJumps);
  },
  // ---- Burble manifest sync (see $lib/server/burble/NOTES.md) ----

  saveBurbleSettings: async ({ request }) => {
    const formData = await request.formData();
    const dzId = oneLine(formData.get('dzId'), 20);
    if (dzId && !/^\d+$/.test(dzId)) return fail(400, { error: 'Dropzone id must be a number' });

    // One name per line, same shape as the invoice address field.
    const myNames = multiLine(formData.get('myNames'), 400)
      .split('\n')
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 10);

    const pollSeconds = Number(formData.get('pollSeconds'));
    await setBurbleSettings({
      enabled: formData.get('enabled') === 'on',
      dzId,
      myNames,
      pollSeconds: Number.isFinite(pollSeconds) ? Math.min(300, Math.max(15, Math.round(pollSeconds))) : 30,
    });
  },

  // Its own action rather than part of saveBurbleSettings: the toggle is
  // flipped from the Log tab mid-session, and shouldn't have to resend
  // (or risk clobbering) the dropzone id, names and code map.
  setBurbleAutoPoll: async ({ request }) => {
    const on = String((await request.formData()).get('autoPoll') ?? '') === 'on';
    await setBurbleSettings({ autoPoll: on });
  },

  syncManifest: async () => {
    const outcome = await syncOnce();
    if (!outcome.ok) return fail(400, { error: outcome.error ?? 'Sync failed' });
    return { synced: true, boardLoads: outcome.boardLoads, skipped: outcome.skipped === true };
  },

  commitManifestJumps: async ({ request }) => {
    const slotIds = (await request.formData()).getAll('slotId').map(String).filter(Boolean);
    if (slotIds.length === 0) return fail(400, { error: 'Nothing selected to log' });
    const result = await commitMatches(slotIds);
    return { logged: result.logged, skippedDuplicates: result.skippedDuplicates };
  },

  dismissManifestJump: async ({ request }) => {
    const slotId = String((await request.formData()).get('slotId') ?? '');
    if (!slotId) return fail(400, { error: 'slotId is required' });
    await dismissMatch(slotId);
  },

  mapBurbleCode: async ({ request }) => {
    const formData = await request.formData();
    const code = oneLine(formData.get('code'), 40);
    const role = String(formData.get('role') ?? '') as BurbleRole;
    const jumpTypeName = oneLine(formData.get('jumpTypeName'), 40);
    if (!code) return fail(400, { error: 'code is required' });
    if (!['instructor', 'videographer', 'solo'].includes(role)) return fail(400, { error: 'Unknown role' });
    if (!jumpTypeName) return fail(400, { error: 'jump type is required' });
    await setBurbleCodeMapping({ code, role, jumpTypeName });
    await clearUnmappedCodes();
  },

  removeBurbleCode: async ({ request }) => {
    const code = oneLine((await request.formData()).get('code'), 40);
    if (!code) return fail(400, { error: 'code is required' });
    await removeBurbleCodeMapping(code);
  },
};
