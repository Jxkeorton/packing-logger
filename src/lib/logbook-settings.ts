// Settings for the logbook feature: the jump count to carry forward from
// before this app existed, and the saved equipment/aircraft profiles the
// "Equipment" and "Aircraft" dropdowns on the add-jump form pick from. Kept
// as one small JSON document — same shape of concern as invoice-settings.ts
// — rather than a growing ledger, since none of this changes anywhere near
// as often as the jumps do.
import { randomUUID } from 'node:crypto';
import { readText, writeText } from './storage';

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

export interface LogbookSettings {
  baseJumps: number; // jumps already logged on paper before this app started counting
  equipment: Equipment[];
  aircraft: Aircraft[];
}

const SETTINGS_KEY = 'logbook-settings.json';

const DEFAULTS: LogbookSettings = { baseJumps: 0, equipment: [], aircraft: [] };

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

export async function readLogbookSettings(): Promise<LogbookSettings> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    return {
      baseJumps:
        typeof parsed.baseJumps === 'number' && Number.isInteger(parsed.baseJumps) && parsed.baseJumps >= 0
          ? parsed.baseJumps
          : DEFAULTS.baseJumps,
      equipment: asEquipmentList(parsed.equipment),
      aircraft: asAircraftList(parsed.aircraft),
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

export async function addEquipment(item: Omit<Equipment, 'id'>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, equipment: [...current.equipment, { ...item, id: randomUUID() }] };
  await writeLogbookSettings(next);
  return next;
}

export async function removeEquipment(id: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, equipment: current.equipment.filter((e) => e.id !== id) };
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
  const next: LogbookSettings = { ...current, aircraft: current.aircraft.filter((a) => a.id !== id) };
  await writeLogbookSettings(next);
  return next;
}
