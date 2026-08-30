// Settings for the logbook feature: the jump count to carry forward from
// before this app existed, the saved place/component/rig/aircraft/jump-type
// profiles the add-jump form's dropdowns pick from, and which one (if any)
// of each is the default pre-selected on a fresh jump. Kept as one small
// JSON document — same shape of concern as invoice-settings.ts — rather
// than a growing ledger, since none of this changes anywhere near as often
// as the jumps do.
import { randomUUID } from 'node:crypto';
import { readText, writeText } from './storage';
import { DEFAULT_BURBLE_CODE_MAP, type BurbleCodeMapping, type BurbleRole } from '../burble';

export interface Place {
  id: string;
  name: string; // e.g. "Langar" — what shows in the dropdown
}

// A single physical part — a specific canopy, lineset, pilot chute or
// container — tracked so its lifetime jump count can be shown against it
// (see logbook.ts: a jump's entry stores the component *names* that were
// on the rig it was logged against, and the count is just how many
// entries mention this one). Canopy/lineset/pilot chute/container are all
// this exact same shape, so one type and one set of list-handling
// functions below covers all four rather than four near-identical copies.
export interface Component {
  id: string;
  name: string; // e.g. "Sabre2 190", "PD reserve pilot chute"
  // Jumps this part already had on it before it was added here — a canopy
  // bought second-hand, or one that was in service before this app existed.
  // Its displayed total is baseJumps plus the jumps logged against it, so
  // the number reflects the part's real life, not just what we witnessed.
  baseJumps: number;
}

// A rig is a named combination of components, built once and then picked
// as a single dropdown when logging a jump — not four separate part
// dropdowns per jump. Rigs are add/remove only, never edited in place: if
// a part gets swapped (a reline, a new canopy...), the intended workflow
// is to build a *new* rig with the changed part plus the components that
// carry over, rather than editing this one. That's what keeps each
// component's jump count meaning "jumps on this physical part" — editing
// a rig after jumps had already been logged against it would silently
// rewrite which component those historical jumps count against.
export interface Rig {
  id: string;
  name: string; // e.g. "Main rig", "Backup"
  canopyId: string | null;
  linesetId: string | null;
  pilotChuteId: string | null;
  containerId: string | null;
}

export interface Aircraft {
  id: string;
  plate: string; // registration / call sign, e.g. "G-SDSK" — what shows in the dropdown
}

export interface JumpType {
  id: string;
  name: string; // e.g. "Sport", "Tandem Instructor" — what shows in the dropdown
}

/**
 * Burble manifest sync — see $lib/server/burble/NOTES.md. Kept in this
 * document rather than a file of its own because it's the same shape of
 * concern as everything else here: small, rarely-changing configuration
 * for the Logbook tab. The *running* state of a sync (which loads we've
 * seen, what's waiting to be logged) is a separate ledger, in
 * $lib/server/burble/sync.ts.
 */
export interface BurbleSettings {
  enabled: boolean;
  dzId: string; // Burble's dropzone id — 531 is Skydive Langar
  /**
   * Names to look for on the board. A list, because the display can show a
   * display name or a real name depending on DZ config — if sync silently
   * stops matching, adding the other spelling here is the first fix.
   */
  myNames: string[];
  /** Poll automatically while the Logbook tab is open. Off by default — it only works with the screen awake. */
  autoPoll: boolean;
  /** Seconds between automatic polls. Kept well inside the ~2m20s departed window. */
  pollSeconds: number;
  codeMap: BurbleCodeMapping[];
}

export type DefaultCategory = 'place' | 'canopy' | 'lineset' | 'pilotChute' | 'container' | 'rig' | 'aircraft' | 'jumpType';

export interface LogbookSettings {
  baseJumps: number; // jumps already logged on paper before this app started counting
  places: Place[];
  canopies: Component[];
  linesets: Component[];
  pilotChutes: Component[];
  containers: Component[];
  rigs: Rig[];
  aircraft: Aircraft[];
  jumpTypes: JumpType[];
  burble: BurbleSettings;
  defaultPlaceId: string | null;
  defaultRigId: string | null;
  defaultAircraftId: string | null;
  defaultJumpTypeId: string | null;
}

const SETTINGS_KEY = 'logbook-settings.json';

const DEFAULTS: LogbookSettings = {
  baseJumps: 0,
  places: [],
  canopies: [],
  linesets: [],
  pilotChutes: [],
  containers: [],
  rigs: [],
  aircraft: [],
  jumpTypes: [],
  burble: {
    enabled: false,
    dzId: '531', // Skydive Langar — overridable, but it's where this app's user jumps

    myNames: [],
    autoPoll: false,
    pollSeconds: 30,
    codeMap: DEFAULT_BURBLE_CODE_MAP,
  },
  defaultPlaceId: null,
  defaultRigId: null,
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

// Jump types and components all have the exact same {id, name} shape as
// places, but are kept as distinct types so callers can't mix the lists
// up by accident.
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

function asComponentList(value: unknown): Component[] {
  if (!Array.isArray(value)) return [];
  const out: Component[] = [];
  for (const item of value) {
    if (item && typeof item === 'object' && typeof (item as any).id === 'string' && typeof (item as any).name === 'string') {
      // baseJumps predates nothing — components saved before this field
      // existed simply have none, so default to 0 rather than dropping them.
      const raw = (item as any).baseJumps;
      const baseJumps = typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : 0;
      out.push({ id: (item as any).id, name: (item as any).name, baseJumps });
    }
  }
  return out;
}

function asComponentId(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function asRigList(value: unknown): Rig[] {
  if (!Array.isArray(value)) return [];
  const out: Rig[] = [];
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
        canopyId: asComponentId((item as any).canopyId),
        linesetId: asComponentId((item as any).linesetId),
        pilotChuteId: asComponentId((item as any).pilotChuteId),
        containerId: asComponentId((item as any).containerId),
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

// A rig's component ids can dangle if that component was since deleted —
// resolved to '' the same way a deleted place/aircraft/jump-type already
// falls back to '' on a jump entry, rather than throwing or showing a raw
// id. Used both when resolving a fresh jump's rig (actions/logbook.ts)
// and when auto-logging a tandem jump against the default rig
// (actions/tandem.ts).
const BURBLE_ROLES: BurbleRole[] = ['instructor', 'videographer', 'solo'];

function asBurbleCodeMap(value: unknown): BurbleCodeMapping[] {
  if (!Array.isArray(value)) return DEFAULT_BURBLE_CODE_MAP;
  const out: BurbleCodeMapping[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const code = (item as any).code;
    const role = (item as any).role;
    const jumpTypeName = (item as any).jumpTypeName;
    if (typeof code !== 'string' || !code.trim()) continue;
    if (!BURBLE_ROLES.includes(role)) continue;
    if (typeof jumpTypeName !== 'string' || !jumpTypeName.trim()) continue;
    out.push({ code: code.trim(), role, jumpTypeName: jumpTypeName.trim() });
  }
  return out;
}

// A settings file written before this feature existed simply has no
// `burble` key, so every field falls back to the default — sync off, no
// names, the seeded code map. Same tolerance as everything else here:
// junk in one field never costs you the rest of the document.
function asBurbleSettings(value: unknown): BurbleSettings {
  const fallback = DEFAULTS.burble;
  if (!value || typeof value !== 'object') return fallback;
  const raw = value as Record<string, unknown>;
  const pollSeconds =
    typeof raw.pollSeconds === 'number' && Number.isFinite(raw.pollSeconds)
      ? Math.min(300, Math.max(15, Math.round(raw.pollSeconds)))
      : fallback.pollSeconds;
  return {
    enabled: raw.enabled === true,
    dzId: typeof raw.dzId === 'string' ? raw.dzId.trim() : fallback.dzId,
    myNames: Array.isArray(raw.myNames)
      ? raw.myNames.filter((n): n is string => typeof n === 'string' && n.trim().length > 0).map((n) => n.trim())
      : fallback.myNames,
    autoPoll: raw.autoPoll === true,
    pollSeconds,
    codeMap: asBurbleCodeMap(raw.codeMap),
  };
}

export function resolveRigComponents(
  settings: LogbookSettings,
  rigId: string | null | undefined,
): { rig: string; canopy: string; lineset: string; pilotChute: string; container: string } {
  const rig = settings.rigs.find((r) => r.id === rigId);
  if (!rig) return { rig: '', canopy: '', lineset: '', pilotChute: '', container: '' };
  const nameOf = (list: Component[], id: string | null) => list.find((c) => c.id === id)?.name ?? '';
  return {
    rig: rig.name,
    canopy: nameOf(settings.canopies, rig.canopyId),
    lineset: nameOf(settings.linesets, rig.linesetId),
    pilotChute: nameOf(settings.pilotChutes, rig.pilotChuteId),
    container: nameOf(settings.containers, rig.containerId),
  };
}

export async function readLogbookSettings(): Promise<LogbookSettings> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    const places = asPlaceList(parsed.places);
    const canopies = asComponentList(parsed.canopies);
    const linesets = asComponentList(parsed.linesets);
    const pilotChutes = asComponentList(parsed.pilotChutes);
    const containers = asComponentList(parsed.containers);
    const rigs = asRigList(parsed.rigs);
    const aircraft = asAircraftList(parsed.aircraft);
    const jumpTypes = asJumpTypeList(parsed.jumpTypes);
    const burble = asBurbleSettings(parsed.burble);
    const defaultPlaceId = asId(parsed.defaultPlaceId);
    const defaultRigId = asId(parsed.defaultRigId);
    const defaultAircraftId = asId(parsed.defaultAircraftId);
    const defaultJumpTypeId = asId(parsed.defaultJumpTypeId);
    return {
      baseJumps:
        typeof parsed.baseJumps === 'number' && Number.isInteger(parsed.baseJumps) && parsed.baseJumps >= 0
          ? parsed.baseJumps
          : DEFAULTS.baseJumps,
      places,
      canopies,
      linesets,
      pilotChutes,
      containers,
      rigs,
      aircraft,
      jumpTypes,
      burble,
      // Guard against a default pointing at an id that's since been deleted
      // (e.g. the settings file was edited by hand, or a delete raced a
      // default-set) — fall back to "no default" rather than dangle.
      defaultPlaceId: places.some((p) => p.id === defaultPlaceId) ? defaultPlaceId : null,
      defaultRigId: rigs.some((r) => r.id === defaultRigId) ? defaultRigId : null,
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

/**
 * Update the manifest-sync settings, merging over what's saved — so the
 * auto-poll toggle can be flipped on its own without the caller having to
 * resend the dropzone id, names and code map.
 */
export async function setBurbleSettings(patch: Partial<BurbleSettings>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const next: LogbookSettings = { ...current, burble: { ...current.burble, ...patch } };
  await writeLogbookSettings(next);
  return next;
}

/** Map a jump code seen on the board to a role + logbook jump type, replacing any existing mapping for that code. */
export async function setBurbleCodeMapping(mapping: BurbleCodeMapping): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const code = mapping.code.trim();
  const kept = current.burble.codeMap.filter((m) => m.code.trim().toUpperCase() !== code.toUpperCase());
  return setBurbleSettings({ codeMap: [...kept, { ...mapping, code }] });
}

export async function removeBurbleCodeMapping(code: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const kept = current.burble.codeMap.filter((m) => m.code.trim().toUpperCase() !== code.trim().toUpperCase());
  return setBurbleSettings({ codeMap: kept });
}

// Places/canopies/linesets/pilot chutes/containers/rigs/aircraft/jump
// types are eight instances of the same shape of thing — a named list
// plus one "default" id pointing into it — so add/remove and setDefault
// below go through this map instead of a hand-written function per
// category. Adding a category means one new field here plus two one-line
// exports, not a whole copy of a 10-line read-modify-write function.
type ListField = 'places' | 'canopies' | 'linesets' | 'pilotChutes' | 'containers' | 'rigs' | 'aircraft' | 'jumpTypes';
type DefaultField = 'defaultPlaceId' | 'defaultRigId' | 'defaultAircraftId' | 'defaultJumpTypeId';

// Only rig and (for the log form) place/aircraft/jumpType carry a
// meaningful "default" — see ReferenceListPanel's allowDefault prop.
// Canopy/lineset/pilot chute/container are only ever picked *through* a
// rig, so they're deliberately left out of this map; there's nothing in
// the app that would ever read a defaultCanopyId etc.
const CATEGORY_FIELDS: Partial<Record<DefaultCategory, { list: ListField; default: DefaultField }>> = {
  place: { list: 'places', default: 'defaultPlaceId' },
  rig: { list: 'rigs', default: 'defaultRigId' },
  aircraft: { list: 'aircraft', default: 'defaultAircraftId' },
  jumpType: { list: 'jumpTypes', default: 'defaultJumpTypeId' },
};

async function addItem<T extends { id: string }>(list: ListField, item: Omit<T, 'id'>): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const items = current[list] as unknown as T[];
  const next: LogbookSettings = { ...current, [list]: [...items, { ...item, id: randomUUID() } as T] };
  await writeLogbookSettings(next);
  return next;
}

async function removeItem(list: ListField, defaultField: DefaultField | null, id: string): Promise<LogbookSettings> {
  const current = await readLogbookSettings();
  const items = current[list] as unknown as { id: string }[];
  const next: LogbookSettings = {
    ...current,
    [list]: items.filter((item) => item.id !== id),
    ...(defaultField ? { [defaultField]: current[defaultField] === id ? null : current[defaultField] } : {}),
  };
  await writeLogbookSettings(next);
  return next;
}

export async function addPlace(item: Omit<Place, 'id'>): Promise<LogbookSettings> {
  return addItem<Place>('places', item);
}

export async function removePlace(id: string): Promise<LogbookSettings> {
  return removeItem('places', 'defaultPlaceId', id);
}

export async function addCanopy(item: Omit<Component, 'id'>): Promise<LogbookSettings> {
  return addItem<Component>('canopies', item);
}

export async function removeCanopy(id: string): Promise<LogbookSettings> {
  return removeItem('canopies', null, id);
}

export async function addLineset(item: Omit<Component, 'id'>): Promise<LogbookSettings> {
  return addItem<Component>('linesets', item);
}

export async function removeLineset(id: string): Promise<LogbookSettings> {
  return removeItem('linesets', null, id);
}

export async function addPilotChute(item: Omit<Component, 'id'>): Promise<LogbookSettings> {
  return addItem<Component>('pilotChutes', item);
}

export async function removePilotChute(id: string): Promise<LogbookSettings> {
  return removeItem('pilotChutes', null, id);
}

export async function addContainer(item: Omit<Component, 'id'>): Promise<LogbookSettings> {
  return addItem<Component>('containers', item);
}

export async function removeContainer(id: string): Promise<LogbookSettings> {
  return removeItem('containers', null, id);
}

export async function addRig(item: Omit<Rig, 'id'>): Promise<LogbookSettings> {
  return addItem<Rig>('rigs', item);
}

export async function removeRig(id: string): Promise<LogbookSettings> {
  return removeItem('rigs', 'defaultRigId', id);
}

export async function addAircraft(item: Omit<Aircraft, 'id'>): Promise<LogbookSettings> {
  return addItem<Aircraft>('aircraft', item);
}

export async function removeAircraft(id: string): Promise<LogbookSettings> {
  return removeItem('aircraft', 'defaultAircraftId', id);
}

export async function addJumpType(item: Omit<JumpType, 'id'>): Promise<LogbookSettings> {
  return addItem<JumpType>('jumpTypes', item);
}

export async function removeJumpType(id: string): Promise<LogbookSettings> {
  return removeItem('jumpTypes', 'defaultJumpTypeId', id);
}

/**
 * Make sure a jump type with this exact name is in the saved list, adding
 * it if not — used when auto-logging a tandem jump (see
 * actions/tandem.ts) so "Tandem Instructor"/"Tandem Camera" show up in
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
  const fields = CATEGORY_FIELDS[category];
  if (!fields) return current;
  const { list, default: defaultField } = fields;
  const items = current[list] as unknown as { id: string }[];
  const resolvedId = id && items.some((item) => item.id === id) ? id : null;
  const next: LogbookSettings = { ...current, [defaultField]: resolvedId };
  await writeLogbookSettings(next);
  return next;
}
