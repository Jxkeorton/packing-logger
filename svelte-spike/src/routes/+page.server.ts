// The whole "backend" of the Logbook spike: one load function feeding
// every component on the page (entries, next jump number, and the four
// reference lists + their defaults + baseJumps, all as one `settings`
// object), and one action per mutation. Compare this file's size to the
// *seven* separate pages/api/*.ts route files it replaces in the real
// app (logbook.ts, places.ts, equipment.ts, aircraft.ts, jump-types.ts,
// logbook-defaults.ts, logbook-settings.ts) — none of which needed their
// own hand-written JSON-parsing/response-shaping boilerplate here,
// because SvelteKit's form actions receive already-parsed FormData and
// don't need to shape a JSON response at all: returning (or throwing
// `fail`) is enough, and the client gets the fresh data via the page's
// `load` re-running automatically.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { addEntry, nextJumpNumber, readLogbook, removeEntry, updateEntry, type EntryInput } from '$lib/server/logbook';
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

function todayKey(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const load: PageServerLoad = async () => {
  const settings = await readLogbookSettings();
  const [entries, nextNumber] = await Promise.all([readLogbook(settings.baseJumps), nextJumpNumber(settings.baseJumps)]);
  const today = todayKey();
  const dateDisplay = new Date(`${today}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  return { entries, nextNumber, settings, today, dateDisplay };
};

function oneLine(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, maxLength);
}

function multiLine(value: FormDataEntryValue | null, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The form submits dropdown *ids* (placeId/equipmentId/...), same as the
// real app's <select> values — but here the id->text resolution the real
// app's client-side JS does (selectedOptionText, the equipment dataset
// reads) happens server-side instead, against the current saved settings.
// One consequence worth flagging in the write-up: this form now degrades
// gracefully with JS disabled, which the fetch-based version never did.
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

export const actions: Actions = {
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
