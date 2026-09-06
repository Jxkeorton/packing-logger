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

/**
 * What I was doing on a jump, as far as this app cares.
 *
 * Every value except 'solo' is also a Work-jumps Category ($lib/tandem.ts),
 * deliberately: commitMatches files a match straight under `role` as its
 * category, so the two lists staying in step is what makes a synced jump
 * land on the right card without a translation table in between.
 */
export type BurbleRole = 'instructor' | 'videographer' | 'aff' | 'solo';

export const BURBLE_ROLE_LABELS: Record<BurbleRole, string> = {
  instructor: 'Tandem instructor',
  videographer: 'Tandem camera',
  aff: 'AFF instructor',
  solo: 'Solo',
};

/**
 * Every valid role, for validating a saved or posted code mapping.
 *
 * Derived from the labels above rather than written out again: the two
 * hand-maintained copies of this list (settings parsing and the
 * mapBurbleCode action) both silently *rejected* a role they hadn't been
 * told about, so a role added to the type and not to them would fail
 * closed and invisibly — a saved AFFI mapping dropped on read, and no way
 * to add one back through the form.
 */
export const BURBLE_ROLES = Object.keys(BURBLE_ROLE_LABELS) as BurbleRole[];

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
 * Transaction type of an AFF student — the person being taught, whose own
 * slot carries the level as its jump code (`"Level 6"`, `"Consol"`). Same
 * `type: "Student"` as the AFF instructor's slot, so as with the tandem
 * customer above, only the transaction type tells them apart.
 */
const AFF_STUDENT_TT = '12';

/**
 * The slots in a group that are being *taught or taken up*, never working.
 * Neither can be me, and neither counts as the other staff member on a
 * jump — see matchSlots and otherStaffName.
 */
const PAYING_TTS = new Set([TANDEM_CUSTOMER_TT, AFF_STUDENT_TT]);

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
/**
 * Bumped whenever a mapping is *added* to the seed list below, so an
 * install that saved its code map before that can be topped up with the
 * new one — see mergeSeededCodes.
 *
 * 1 — the original seed set.
 * 2 — adds AFFI (AFF instructing).
 */
export const BURBLE_CODE_SEED_VERSION = 2;

export const DEFAULT_BURBLE_CODE_MAP: BurbleCodeMapping[] = [
  // Skydive Langar (dz_id 531) — the DZ this app is used at. TAN/VID
  // confirmed by the jumper; EXP and STA seen on the live board. STA is
  // its own jump type rather than folded into EXP/EXP+KIT's "Sport" —
  // rostered staff duty (manifesting, currency, whatever else "Staff"
  // covers) isn't a sport jump, it just deserves the same solo
  // treatment: logbook only, no Work jumps tab entry.
  { code: 'TAN', role: 'instructor', jumpTypeName: 'Tandem Instructor' },
  { code: 'VID', role: 'videographer', jumpTypeName: 'Tandem Camera' },
  // AFF instructing. The student sharing the group is *not* mapped here —
  // their slot's code is their level, not a role, and it's read off the
  // group rather than matched (see affStudent). Levels deliberately never
  // reach the code map: mapping "Level 6" to anything would mean a
  // same-named student logging me a jump.
  { code: 'AFFI', role: 'aff', jumpTypeName: 'AFF Instructor' },
  { code: 'EXP', role: 'solo', jumpTypeName: 'Sport' },
  { code: 'EXP+KIT', role: 'solo', jumpTypeName: 'Sport' },
  { code: 'STA', role: 'solo', jumpTypeName: 'Staff' },
  // Beccles (8494) shorthand, kept so a visit or a boogie there still logs
  // rather than piling up unmapped codes. Harmless where unused.
  { code: 'TI', role: 'instructor', jumpTypeName: 'Tandem Instructor' },
  { code: 'CAM PHOTO', role: 'videographer', jumpTypeName: 'Tandem Camera' },
  { code: 'CAM VIDEO', role: 'videographer', jumpTypeName: 'Tandem Camera' },
];

/**
 * Top up a saved code map with any seeded mapping added since it was
 * written.
 *
 * The seed list is only ever a *default*: once anything is saved, that's
 * what matching uses, so adding AFFI to DEFAULT_BURBLE_CODE_MAP alone
 * would do nothing at all for an install that already had a map — the
 * board would keep reporting AFFI as an unmapped code forever.
 *
 * Guarded by `savedVersion` rather than merging unconditionally, because
 * removing a mapping is something the settings screen offers and a blind
 * merge would undo it on the next read. The version travels with the
 * settings, so the first write of any kind — including the removal
 * itself — persists the topped-up map and stops this running again.
 */
export function mergeSeededCodes(saved: BurbleCodeMapping[], savedVersion: number): BurbleCodeMapping[] {
  if (savedVersion >= BURBLE_CODE_SEED_VERSION) return saved;
  const have = new Set(saved.map((m) => normaliseCode(m.code)));
  const missing = DEFAULT_BURBLE_CODE_MAP.filter((m) => !have.has(normaliseCode(m.code)));
  return missing.length > 0 ? [...saved, ...missing] : saved;
}

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
 * The AFF student sharing an instructor's group, and what level they're
 * jumping.
 *
 * The level is the student slot's own *jump code* — Langar manifests a
 * level 6 as `{ jump: "Level 6", transaction_type_id: "12" }` alongside
 * the instructor's `{ jump: "AFFI" }`, one booking, one sale_id. So the
 * level costs nothing to read here and is taken verbatim: it's the DZ's
 * own wording, printed on the board the jumper is looking at, and
 * normalising it into some canonical form would only make the app
 * disagree with the screen next to it. A consolidation jump comes across
 * as `"Consol"` rather than a number, which is exactly why this is a
 * string and not a level index.
 *
 * Both fields come back empty when the group has no student slot at all —
 * possible if a booking is manifested oddly, and not worth refusing to
 * log a jump over.
 */
export function affStudent(group: BurbleSlot[]): { name: string; level: string } {
  const student = group.find((slot) => slot && slot.transaction_type_id === AFF_STUDENT_TT);
  return {
    name: typeof student?.name === 'string' ? student.name.trim() : '',
    level: typeof student?.jump === 'string' ? student.jump.trim() : '',
  };
}

/**
 * The other staff member working the jump — the camera flyer alongside a
 * tandem instructor, the instructor alongside a camera flyer, or the
 * second AFF instructor alongside the first.
 *
 * Found by elimination rather than by jump code: a group is one booking
 * (customer + TI + optional camera, or student + one or two AFFIs — see
 * NOTES.md), so anyone in it who isn't being taught or taken up, and isn't
 * me, is the other half of the staff on that jump. Going by code would
 * mean a DZ shorthand nobody has mapped yet silently dropping the name,
 * and the name is the whole point here.
 *
 * Two of them — a photo *and* a video flyer, which Beccles' two camera
 * codes allow for, or the two instructors on an AFF level 1 — are joined
 * rather than picked between. Better a label that reads slightly oddly
 * than a name quietly dropped.
 */
export function otherStaffName(group: BurbleSlot[], mySlotId: string): string {
  return group
    .filter((slot) => slot && typeof slot.name === 'string')
    .filter((slot) => !PAYING_TTS.has(slot.transaction_type_id) && String(slot.id) !== mySlotId)
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
  /** Customer on a tandem, student on an AFF jump; '' for a solo. */
  customerName: string;
  /**
   * The AFF student's level as the board words it (`"Level 6"`,
   * `"Consol"`) — '' on every other role. Carried on the match rather
   * than looked up again at commit time because the board is the only
   * place it exists: once the load drops off, nothing can recover it.
   */
  studentLevel: string;
  /**
   * Whoever else was working the jump — '' for a solo, for a tandem the
   * manifest showed no camera flyer on, and for a single-instructor AFF
   * level.
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
        // The customer being taken up, or the student being taught, is
        // never me — whatever the name says. Guarding the student too
        // (not just the tandem customer) is also what keeps their level
        // out of the unmapped-codes list: "Level 6" is a level, not a
        // role, and offering it to be mapped would invite exactly the
        // mis-log this guard exists to prevent.
        if (PAYING_TTS.has(slot.transaction_type_id)) continue;

        const code = typeof slot.jump === 'string' ? slot.jump.trim() : '';
        const mapping = byCode.get(normaliseCode(code));
        if (!mapping) {
          if (code) unmapped.add(code);
          continue;
        }

        const student = mapping.role === 'aff' ? affStudent(group) : { name: '', level: '' };

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
          // Who the jump was *for*: the paying customer on a tandem, the
          // student on an AFF jump — different transaction types, same
          // question, and the answer goes in the same field so everything
          // downstream (the invoice line, the dedupe key, the logbook
          // description) works one way for both.
          customerName: mapping.role === 'aff' ? student.name : mapping.role === 'solo' ? '' : tandemCustomerName(group),
          studentLevel: mapping.role === 'aff' ? student.level : '',
          otherStaffName: mapping.role === 'solo' ? '' : otherStaffName(group, String(slot.id)),
        });
      }
    }
  }

  return { matches, unmappedCodes: [...unmapped] };
}

/** A one-line summary of a matched jump, for the review queue and the logbook description. */
export function describeMatch(match: {
  role: BurbleRole;
  loadName: string;
  customerName: string;
  studentLevel?: string;
}): string {
  // The level qualifies the student, so it rides with their name rather
  // than trailing the load: "AFF instructor with Alex Marsh (Level
  // 6)". Optional on the parameter type because a sighting captured
  // before this field existed is still sitting in burble-sync.json
  // without it.
  const level = match.studentLevel ? ` (${match.studentLevel})` : '';
  const who = match.customerName ? ` with ${match.customerName}${level}` : '';
  return `${BURBLE_ROLE_LABELS[match.role]}${who} — ${match.loadName}`;
}
