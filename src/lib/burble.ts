// The universal (client-safe) half of the Burble manifest sync — see
// $lib/packing.ts for why this split exists. Everything here is pure:
// given a decoded `getLoads` response, work out which slots are mine and
// what role I'm jumping in. The storage/HTTP half lives under
// $lib/server/burble/.
//
// src/lib/server/burble/NOTES.md documents the feed itself and how these
// rules were arrived at; the short version is that this is a wall-display
// endpoint with no history, so everything below is defensive about shapes
// the DZ's own config can change without warning.

/** What I was doing on a jump, as far as this app cares. */
export type BurbleRole = 'instructor' | 'videographer' | 'solo';

export const BURBLE_ROLE_LABELS: Record<BurbleRole, string> = {
  instructor: 'Tandem instructor',
  videographer: 'Tandem camera',
  solo: 'Solo',
};

/** One manifested person on a load. Extra keys the feed sends are ignored. */
export interface BurbleSlot {
  id: string;
  name: string;
  jump: string;
  type: string;
  transaction_type_id: string;
  option_name: string;
  sale_id: string;
}

export interface BurbleLoad {
  id: string;
  name: string;
  status: string;
  /**
   * Minutes to take-off, and it goes *negative* once a load is running
   * late — which at some dropzones is the only sign the plane has gone,
   * because the manifesters never press "Departed". Never proof on its
   * own (a load can sit at -2 on the ground); useful as a hint to show
   * the jumper when they come to confirm.
   */
  timeLeft: number | null;
  groups: BurbleSlot[][];
}

export interface BurbleLoadsResponse {
  success?: boolean;
  loads?: unknown;
  // Both of these are absent when the server answers from a cache miss, so
  // they're optional on purpose — see NOTES.md. Treat a missing `version`
  // as "unknown", never as "unchanged".
  version?: number;
  session_id?: number;
}

/**
 * Transaction type of the paying tandem customer. Their slot carries the
 * same `type: "Tandem"` as mine does, so this is what stops a customer who
 * happens to share my name being logged as a jump I made.
 */
const TANDEM_CUSTOMER_TT = '11';

/**
 * Statuses that mean the load is definitely off the ground.
 *
 * Treated as a *hint*, never as a precondition for logging. Not every
 * dropzone uses them: at Beccles the manifesters generally leave a load
 * "On Call" and let `timeLeft` run negative, so waiting for `Departed`
 * would mean waiting forever. `Back at Gate` is rarer still — one observed
 * lifecycle went On Call → Departed → gone, skipping it entirely.
 */
export const FLOWN_STATUSES = ['Departed', 'Back at Gate'];

export interface BurbleCodeMapping {
  code: string; // the DZ's shorthand, e.g. "TI" — matched case-insensitively
  role: BurbleRole;
  jumpTypeName: string; // the logbook jump type to file it under
}

/**
 * Deliberately *seed* data, not a hardcoded switch: these are each DZ's own
 * free-text shorthand and they grow (`Staff` turned up an hour into the
 * first observation). Unrecognised codes surface in the UI to be mapped
 * rather than being guessed at.
 *
 * The tandem jump-type names match TANDEM_JUMP_TYPES in $lib/tandem.ts, so
 * a synced tandem files under the same type as one logged by hand from the
 * Tandems tab — and picks up the same teal pill in the logbook list.
 */
export const DEFAULT_BURBLE_CODE_MAP: BurbleCodeMapping[] = [
  // Skydive Langar (dz_id 531) — the DZ this app is used at. TAN/VID
  // confirmed by the jumper; EXP seen on the live board.
  { code: 'TAN', role: 'instructor', jumpTypeName: 'Tandem Instructor' },
  { code: 'VID', role: 'videographer', jumpTypeName: 'Tandem Camera' },
  { code: 'EXP', role: 'solo', jumpTypeName: 'Sport' },
  { code: 'EXP+KIT', role: 'solo', jumpTypeName: 'Sport' },
  // Beccles (8494) shorthand, kept so a visit or a boogie there still logs
  // rather than piling up unmapped codes. Harmless where unused.
  { code: 'TI', role: 'instructor', jumpTypeName: 'Tandem Instructor' },
  { code: 'CAM PHOTO', role: 'videographer', jumpTypeName: 'Tandem Camera' },
  { code: 'CAM VIDEO', role: 'videographer', jumpTypeName: 'Tandem Camera' },
];

/**
 * Fold a name to a comparison key: case, surrounding and doubled spaces,
 * and the curly quotes Burble emits in names like `Agnieszka “Luna”
 * Sidoruk` — which won't survive a round-trip through a phone keyboard if
 * you type your own name into settings.
 */
export function normaliseName(value: string): string {
  return value
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Jump codes compare case- and whitespace-insensitively; `"Tandem "` has a trailing space in the feed. */
export function normaliseCode(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

/**
 * Pull the real loads out of a response.
 *
 * `loads` is always padded out to the DZ's column count with empty
 * *arrays* — an empty board is literally `[[], [], [], []]`, not `[]` — so
 * this filters on "is an object with an id" rather than trusting length.
 */
export function realLoads(response: BurbleLoadsResponse): BurbleLoad[] {
  const raw = response.loads;
  if (!Array.isArray(raw)) return [];
  const loads: BurbleLoad[] = [];
  for (const entry of raw) {
    if (!entry || Array.isArray(entry) || typeof entry !== 'object') continue;
    const load = entry as Partial<BurbleLoad>;
    if (typeof load.id !== 'string' || !load.id) continue;
    loads.push({
      id: load.id,
      name: typeof load.name === 'string' ? load.name : '',
      status: typeof load.status === 'string' ? load.status : '',
      timeLeft: typeof load.timeLeft === 'number' ? load.timeLeft : asTimeLeft(entry),
      groups: Array.isArray(load.groups) ? (load.groups.filter(Array.isArray) as BurbleSlot[][]) : [],
    });
  }
  return loads;
}

function asTimeLeft(entry: object): number | null {
  const raw = (entry as Record<string, unknown>).time_left;
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string' && raw.trim() !== '' && Number.isFinite(Number(raw))) return Number(raw);
  return null;
}

/**
 * Split a load name into aircraft registration and load number —
 * `"G-UKPS 6"` → `{ plate: 'G-UKPS', loadNumber: '6' }`. Splits on the
 * *last* space so a multi-word aircraft name survives; if the tail isn't a
 * number, the whole thing is treated as the plate.
 */
export function splitLoadName(name: string): { plate: string; loadNumber: string } {
  const trimmed = name.trim();
  const at = trimmed.lastIndexOf(' ');
  if (at === -1) return { plate: trimmed, loadNumber: '' };
  const tail = trimmed.slice(at + 1);
  if (!/^\d+$/.test(tail)) return { plate: trimmed, loadNumber: '' };
  return { plate: trimmed.slice(0, at).trim(), loadNumber: tail };
}

/** The paying customer in a tandem group — the name the invoice needs. */
export function tandemCustomerName(group: BurbleSlot[]): string {
  const customer = group.find((slot) => slot.transaction_type_id === TANDEM_CUSTOMER_TT);
  return customer?.name?.trim() ?? '';
}

/**
 * The other staff member on a tandem — the camera flyer alongside the
 * instructor, or the instructor alongside the camera flyer.
 *
 * Found by elimination rather than by jump code: a group is one booking
 * (customer + TI + optional camera, see NOTES.md), so anyone in it who
 * isn't the paying customer and isn't me is the other half of the staff on
 * that jump. Going by code would mean a DZ shorthand nobody has mapped yet
 * silently dropping the name, and the name is the whole point here.
 *
 * Two of them — a photo *and* a video flyer, which Beccles' two camera
 * codes allow for — are joined rather than picked between. Better a label
 * that reads slightly oddly than a name quietly dropped.
 */
export function otherTandemStaffName(group: BurbleSlot[], mySlotId: string): string {
  return group
    .filter((slot) => slot && typeof slot.name === 'string')
    .filter((slot) => slot.transaction_type_id !== TANDEM_CUSTOMER_TT && String(slot.id) !== mySlotId)
    .map((slot) => slot.name.trim())
    .filter(Boolean)
    .join(' & ');
}

/** One slot on the board that turned out to be mine. */
export interface BurbleMatch {
  slotId: string;
  loadId: string;
  loadName: string;
  plate: string;
  loadNumber: string;
  status: string;
  /** Minutes to take-off at the moment this slot was seen; negative means overdue or gone. */
  timeLeft: number | null;
  code: string; // as printed on the board, e.g. "CAM PHOTO"
  role: BurbleRole;
  jumpTypeName: string;
  customerName: string; // '' for a solo
  /**
   * Whoever else was working the jump — '' for a solo, and for a tandem
   * the manifest showed no camera flyer on.
   */
  otherStaffName: string;
}

export interface MatchResult {
  matches: BurbleMatch[];
  /** Codes found against my name that no mapping covers — surfaced, never dropped. */
  unmappedCodes: string[];
}

/**
 * Find every slot on the board that is me, and classify it.
 *
 * `myNames` is a list rather than one string because the board can show a
 * display name or a real name depending on DZ config, and staff/customer
 * handling differs (see NOTES.md).
 */
export function matchSlots(loads: BurbleLoad[], myNames: string[], codeMap: BurbleCodeMapping[]): MatchResult {
  const wanted = new Set(myNames.map(normaliseName).filter(Boolean));
  const byCode = new Map(codeMap.map((m) => [normaliseCode(m.code), m]));
  const matches: BurbleMatch[] = [];
  const unmapped = new Set<string>();

  if (wanted.size === 0) return { matches, unmappedCodes: [] };

  for (const load of loads) {
    const { plate, loadNumber } = splitLoadName(load.name);
    for (const group of load.groups) {
      for (const slot of group) {
        if (!slot || typeof slot.name !== 'string') continue;
        if (!wanted.has(normaliseName(slot.name))) continue;
        // The paying customer is never me, whatever the name says.
        if (slot.transaction_type_id === TANDEM_CUSTOMER_TT) continue;

        const code = typeof slot.jump === 'string' ? slot.jump.trim() : '';
        const mapping = byCode.get(normaliseCode(code));
        if (!mapping) {
          if (code) unmapped.add(code);
          continue;
        }

        matches.push({
          slotId: String(slot.id),
          loadId: load.id,
          loadName: load.name,
          plate,
          loadNumber,
          status: load.status,
          timeLeft: load.timeLeft,
          code,
          role: mapping.role,
          jumpTypeName: mapping.jumpTypeName,
          customerName: mapping.role === 'solo' ? '' : tandemCustomerName(group),
          otherStaffName: mapping.role === 'solo' ? '' : otherTandemStaffName(group, String(slot.id)),
        });
      }
    }
  }

  return { matches, unmappedCodes: [...unmapped] };
}

/** A one-line summary of a matched jump, for the review queue and the logbook description. */
export function describeMatch(match: { role: BurbleRole; loadName: string; customerName: string }): string {
  const who = match.customerName ? ` with ${match.customerName}` : '';
  return `${BURBLE_ROLE_LABELS[match.role]}${who} — ${match.loadName}`;
}
