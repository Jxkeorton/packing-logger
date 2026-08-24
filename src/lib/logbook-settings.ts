// Settings for the logbook feature: the jump count to carry forward from
// before this app existed, the saved place/equipment/aircraft/jump-type
// profiles the add-jump form's dropdowns pick from, and which one (if any)
// of each is the default pre-selected on a fresh jump. Kept as one small
// JSON document — same shape of concern as invoice-settings.ts — rather
// than a growing ledger, since none of this changes anywhere near as often
// as the jumps do.
import { randomUUID } from 'node:crypto';
import { readText, writeText } from './storage';

export interface Place {
  id: string;
  name: string; // e.g. "Langar" — what shows in the dropdown
}

export interface Equipment {
  id: string;
  name: string; // e.g. "Main rig" — what shows in the dropdown
  canopy: string;
  container: string;
  aad: string;
}

export interface Aircraft {
  id: string;
  plate: string; // registration / call sign, e.g. "G-SDSK" — what shows in the dropdown
}

export interface JumpType {
  id: string;
  name: string; // e.g. "Sport", "Tandem Instructor" — what shows in the dropdown
}

export type DefaultCategory = 'place' | 'equipment' | 'aircraft' | 'jumpType';

export interface LogbookSettings {
  baseJumps: number; // jumps already logged on paper before this app started counting
  places: Place[];
  equipment: Equipment[];
  aircraft: Aircraft[];
  jumpTypes: JumpType[];
  defaultPlaceId: string | null;
  defaultEquipmentId: string | null;
  defaultAircraftId: string | null;
  defaultJumpTypeId: string | null;
}

const SETTINGS_KEY = 'logbook-settings.json';

const DEFAULTS: LogbookSettings = {
  baseJumps: 0,
  places: [],
  equipment: [],
  aircraft: [],
  jumpTypes: [],
  defaultPlaceId: null,
  defaultEquipmentId: null,
  defaultAircraftId: null,
  defaultJumpTypeId: null,
};

function asPlaceList(value: unknown): Place[] {
  if (!Array.isArray(value)) return [];
  const out: Place[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as any).id === 'string' && typeof (item as any).name === 'string') {
      out.push({ id: (item as any).id, name: (item as any).name });
    }
  }
  return out;
}

// Jump types have the exact same {id, name} shape as places, but are kept
// as a distinct type so callers can't mix the two lists up by accident.
function asJumpTypeList(value: unknown): JumpType[] {
  if (!Array.isArray(value)) return [];
  const out: JumpType[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as any).id === 'string' && typeof (item as any).name === 'string') {
      out.push({ id: (item as any).id, name: (item as any).name });
    }
  }
  return out;
}

function asEquipmentList(value: unknown): Equipment[] {
  if (!Array.isArray(value)) return [];
  const out: Equipment[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as any).id === 'string' &&
      typeof (item as any).name === 'string'
    ) {
      out.push({
        id: (item as any).id,
        name: (item as any).name,
        canopy: typeof (item as any).canopy === 'string' ? (item as any).canopy : '',
        container: typeof (item as any).container === 'string' ? (item as any).container : '',
        aad: typeof (item as any).aad === 'string' ? (item as any).aad : '',
      });
    }
  }
  return out;
}

function asAircraftList(value: unknown): Aircraft[] {
  if (!Array.isArray(value)) return [];
  const out: Aircraft[] = [];
  for (const item of value) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as any).id === 'string' &&
      typeof (item as any).plate === 'string'
    ) {
      out.push({ id: (item as any).id, plate: (item as any).plate });
    }
  }
  return out;
}

function asId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

export async function readLogbookSettings(): Promise<LogbookSettings> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    const places = asPlaceList(parsed.places);
    const equipment = asEquipmentList(parsed.equipment);
    const aircraft = asAircraftList(parsed.aircraft);
    const jumpTypes = asJumpTypeList(parsed.jumpTypes);
    const defaultPlaceId = asId(parsed.defaultPlaceId);
    const defaultEquipmentId = asId(parsed.defaultEquipmentId);
    const defaultAircraftId = asId(parsed.defaultAircraftId);
    const defaultJumpTypeId = asId(parsed.defaultJumpTypeId);
    return {
      baseJumps:
        typeof parsed.baseJumps === 'number' && Number.isInteger(parsed.baseJumps) && parsed.baseJumps >= 0
          ? parsed.baseJumps
          : DEFAULTS.baseJumps,
      places,
      equipment,
      aircraft,
      jumpTypes,
      // Guard against a default pointing at an id that's since been deleted
      // (e.g. the settings file was edited by hand, or a delete raced a
      // default-set) — fall back to "no default" rather than dangle.
      defaultPlaceId: places.some((p) => p.id === defaultPlaceId) ? defaultPlaceId : null,
      defaultEquipmentId: equipment.some((e) => e.id === defaultEquipmentId) ? defaultEquipmentId : null,
      defaultAircraftId: aircraft.some((a) => a.id === defaultAircraftId) ? defaultAircraftId : null,
      defaultJumpTypeId: jumpTypes.some((j) => j.id === defaultJumpTypeId) ? defaultJumpTypeId : null,
    };
  } catch {
    return DEFAULTS;
  }
}

async function writeLogbookSettings(settings: LogbookSettings): Promise<void> {
  await writeText(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}

export async function setBaseJumps(baseJumps: number): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, baseJumps };
  await writeLogbookSettings(next);
  return next;
}

export async function addPlace(item: Omit<Place, 'id'>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, places: [...current.places, { ...item, id: randomUUID() }] };
  await writeLogbookSettings(next);
  return next;
}

export async function removePlace(id: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = {
    ...current,
    places: current.places.filter((p) => p.id !== id),
    defaultPlaceId: current.defaultPlaceId === id ? null : current.defaultPlaceId,
  };
  await writeLogbookSettings(next);
  return next;
}

export async function addEquipment(item: Omit<Equipment, 'id'>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, equipment: [...current.equipment, { ...item, id: randomUUID() }] };
  await writeLogbookSettings(next);
  return next;
}

export async function removeEquipment(id: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = {
    ...current,
    equipment: current.equipment.filter((e) => e.id !== id),
    defaultEquipmentId: current.defaultEquipmentId === id ? null : current.defaultEquipmentId,
  };
  await writeLogbookSettings(next);
  return next;
}

export async function addAircraft(item: Omit<Aircraft, 'id'>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, aircraft: [...current.aircraft, { ...item, id: randomUUID() }] };
  await writeLogbookSettings(next);
  return next;
}

export async function removeAircraft(id: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = {
    ...current,
    aircraft: current.aircraft.filter((a) => a.id !== id),
    defaultAircraftId: current.defaultAircraftId === id ? null : current.defaultAircraftId,
  };
  await writeLogbookSettings(next);
  return next;
}

export async function addJumpType(item: Omit<JumpType, 'id'>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, jumpTypes: [...current.jumpTypes, { ...item, id: randomUUID() }] };
  await writeLogbookSettings(next);
  return next;
}

export async function removeJumpType(id: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = {
    ...current,
    jumpTypes: current.jumpTypes.filter((j) => j.id !== id),
    defaultJumpTypeId: current.defaultJumpTypeId === id ? null : current.defaultJumpTypeId,
  };
  await writeLogbookSettings(next);
  return next;
}

/**
 * Make sure a jump type with this exact name is in the saved list, adding
 * it if not — used when auto-logging a tandem jump (see
 * api/tandem-adjust.ts) so "Tandem Instructor"/"Tandem Camera" show up in
 * the dropdown the same as any manually-added type, without creating
 * duplicates on every tandem jump.
 */
export async function ensureJumpType(name: string): Promise<JumpType> {
  const current = await readLogbookSettings();
  const existing = current.jumpTypes.find((j) => j.name === name);
  if (existing) return existing;
  const created: JumpType = { id: randomUUID(), name };
  await writeLogbookSettings({ ...current, jumpTypes: [...current.jumpTypes, created] });
  return created;
}

/**
 * Set (or, passing `id: null`, clear) the default for one category — the
 * option the add-jump form pre-selects for a fresh jump. Only one default
 * per category, so this replaces whatever was set before.
 */
export async function setDefault(category: DefaultCategory, id: string | null): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const list =
    category === 'place' ? current.places : category === 'equipment' ? current.equipment : category === 'aircraft' ? current.aircraft : current.jumpTypes;
  const resolvedId = id && list.some((item) => item.id === id) ? id : null;
  const key =
    category === 'place'
      ? 'defaultPlaceId'
      : category === 'equipment'
        ? 'defaultEquipmentId'
        : category === 'aircraft'
          ? 'defaultAircraftId'
          : 'defaultJumpTypeId';
  const next: LogbookSettings = { ...current, [key]: resolvedId };
  await writeLogbookSettings(next);
  return next;
}
