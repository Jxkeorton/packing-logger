// Logbook tab actions — extracted from the spike's +page.server.ts
// unchanged, so the root route's action list can compose this with
// packing.ts and tandem.ts's action groups instead of being one huge
// file. See that spike (svelte-spike git history) for how this behaves;
// nothing here changed for the full migration.
import { fail, type Action } from '@sveltejs/kit';
import { addEntry, removeEntry, updateEntry, type EntryInput } from '$lib/server/logbook';
import {
  addAircraft,
  addEquipment,
  addJumpType,
  addPlace,
  readLogbookSettings,
  removeAircraft,
  removeEquipment,
  removeJumpType,
  removePlace,
  setBaseJumps,
  setDefault,
  type DefaultCategory,
} from '$lib/server/logbook-settings';
import { oneLine, multiLine } from '$lib/server/form-utils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The form submits dropdown *ids* (placeId/equipmentId/...), same as the
// main app's <select> values — but here the id->text resolution the main
// app's client-side JS did (selectedOptionText, the equipment dataset
// reads) happens server-side instead, against the current saved settings.
// One consequence worth knowing: this form degrades gracefully with JS
// disabled, which the fetch-based version never did.
async function resolveEntryInput(formData: FormData): Promise<{ input: EntryInput } | { error: string }> {
  const date = oneLine(formData.get('date'), 10);
  if (!DATE_RE.test(date)) return { error: 'date is required and must be YYYY-MM-DD' };

  const settings = await readLogbookSettings();
  const place = settings.places.find((p) => p.id === formData.get('placeId'));
  const equipment = settings.equipment.find((e) => e.id === formData.get('equipmentId'));
  const aircraft = settings.aircraft.find((a) => a.id === formData.get('aircraftId'));
  const jumpType = settings.jumpTypes.find((j) => j.id === formData.get('jumpTypeId'));

  return {
    input: {
      date,
      place: place?.name ?? '',
      exitAltitude: oneLine(formData.get('exitAltitude'), 120),
      canopy: equipment?.canopy ?? '',
      container: equipment?.container ?? '',
      aad: equipment?.aad ?? '',
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
    await addEntry(parsed.input, settings.baseJumps);
  },

  updateJump: async ({ request }) => {
    const formData = await request.formData();
    const at = String(formData.get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });
    const parsed = await resolveEntryInput(formData);
    if ('error' in parsed) return fail(400, { error: parsed.error });
    const settings = await readLogbookSettings();
    const result = await updateEntry(at, parsed.input, settings.baseJumps);
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

  addEquipment: async ({ request }) => {
    const formData = await request.formData();
    const name = oneLine(formData.get('name'), 80);
    if (!name) return fail(400, { error: 'name is required' });
    await addEquipment({
      name,
      canopy: oneLine(formData.get('canopy'), 80),
      container: oneLine(formData.get('container'), 80),
      aad: oneLine(formData.get('aad'), 80),
    });
  },

  removeEquipment: async ({ request }) => {
    const id = String((await request.formData()).get('id') ?? '');
    if (!id) return fail(400, { error: 'id is required' });
    await removeEquipment(id);
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
};
