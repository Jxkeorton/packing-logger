// Tests for the pure matching layer, driven by the real captures in
// server/burble/fixtures/ rather than hand-written JSON — several of the
// shapes asserted here (the column padding, the trailing space in
// `"Tandem "`, the curly quotes in a customer name) are things the feed
// actually does and a hand-rolled fixture would quietly get wrong.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BURBLE_CODE_SEED_VERSION,
  BURBLE_ROLES,
  DEFAULT_BURBLE_CODE_MAP,
  mergeSeededCodes,
  matchSlots,
  normaliseName,
  affStudent,
  otherStaffName,
  realLoads,
  splitLoadName,
  tandemCustomerName,
  type BurbleLoadsResponse,
} from './burble';

function fixture(name: string): BurbleLoadsResponse {
  const file = path.join(process.cwd(), 'src/lib/server/burble/fixtures', name);
  return JSON.parse(readFileSync(file, 'utf-8'));
}

const onCall = fixture('get-loads-on-call.json');
const departed = fixture('get-loads-departed.json');
const emptyBoard = fixture('get-loads-empty-board.json');
const cacheMiss = fixture('get-loads-cache-miss.json');
const noSession = fixture('get-loads-no-session.json');
// Skydive Langar, 2026-09-06: three AFF groups off the live board — a
// level 6 and a level 1 (student + one AFFI each), and a consolidation
// jump manifested with no instructor at all.
const langarAff = fixture('get-loads-langar-aff.json');

describe('realLoads', () => {
  it('reads the loads off a live board', () => {
    const loads = realLoads(onCall);
    expect(loads).toHaveLength(1);
    expect(loads[0].name).toBe('G-UKPS 6');
    expect(loads[0].status).toBe('On Call');
  });

  it('treats an empty board as no loads, not four', () => {
    // The feed pads `loads` out to the DZ's column count with empty
    // *arrays* — an empty board is [[], [], [], []].
    expect(emptyBoard.loads).toEqual([[], [], [], []]);
    expect(realLoads(emptyBoard)).toEqual([]);
  });

  it('survives the decoy payload returned without a session', () => {
    expect(noSession.success).toBe(false);
    expect(realLoads(noSession)).toEqual([]);
  });
});

describe('cache-miss responses', () => {
  it('omit version and session_id but still carry loads', () => {
    // Both keys vanish when the server misses cache. Anything treating a
    // missing version as "unchanged" would skip a poll here.
    expect(cacheMiss.version).toBeUndefined();
    expect(cacheMiss.session_id).toBeUndefined();
    expect(realLoads(cacheMiss)).toHaveLength(1);
  });
});

describe('splitLoadName', () => {
  it('splits a registration from its load number', () => {
    expect(splitLoadName('G-UKPS 6')).toEqual({ plate: 'G-UKPS', loadNumber: '6' });
  });

  it('keeps a multi-word aircraft name intact', () => {
    expect(splitLoadName('Super Otter 12')).toEqual({ plate: 'Super Otter', loadNumber: '12' });
  });

  it('treats a non-numeric tail as part of the name', () => {
    expect(splitLoadName('G-UKPS reserve')).toEqual({ plate: 'G-UKPS reserve', loadNumber: '' });
  });
});

describe('normaliseName', () => {
  it('folds case, spacing and the curly quotes the feed emits', () => {
    expect(normaliseName('  Jake   Orton ')).toBe('jake orton');
    expect(normaliseName('Agnieszka “Luna” Sidoruk')).toBe('agnieszka "luna" sidoruk');
  });
});

describe('tandemCustomerName', () => {
  it('picks the paying customer out of a tandem group', () => {
    const group = realLoads(onCall)[0].groups[0];
    expect(tandemCustomerName(group)).toBe('Miranda Walfield');
  });
});

describe('otherStaffName', () => {
  it('picks the camera flyer out of the instructor\'s group', () => {
    const group = realLoads(onCall)[0].groups[0];
    // Miranda Walfield (customer) + Dylan Whitehair (TI) + Barry Woollard (camera).
    expect(otherStaffName(group, '1864662')).toBe('Barry Woollard');
  });

  it('picks the instructor out of the camera flyer\'s group', () => {
    const group = realLoads(onCall)[0].groups[0];
    expect(otherStaffName(group, '1864672')).toBe('Dylan Whitehair');
  });

  it('never counts the AFF student as the other staff member', () => {
    // Alex Marsh is being taught, not working — so his instructor's
    // group has nobody else staffing it.
    const group = realLoads(langarAff)[0].groups[0];
    expect(otherStaffName(group, '7707612')).toBe('');
  });

  it('names the second instructor on an AFF level that has two', () => {
    // Langar manifested every AFF level observed with a single AFFI,
    // including a level 1 — but the low levels can carry a main and a
    // reserve-side instructor, so this is built by hand rather than
    // captured.
    const group = [
      { id: '1', name: 'A Student', jump: 'Level 1', type: 'Student', transaction_type_id: '12', option_name: '', sale_id: '9' },
      { id: '2', name: 'Jake Orton', jump: 'AFFI', type: 'Student', transaction_type_id: '3', option_name: '', sale_id: '9' },
      { id: '3', name: 'Robin Fielding', jump: 'AFFI', type: 'Student', transaction_type_id: '3', option_name: '', sale_id: '9' },
    ];
    expect(otherStaffName(group, '2')).toBe('Robin Fielding');
    expect(otherStaffName(group, '3')).toBe('Jake Orton');
  });

  it('comes back empty on a tandem manifested without a camera flyer', () => {
    // Aleksandra Rola + Liam Domin-Goddard, and nobody else.
    const group = realLoads(onCall)[0].groups[2];
    expect(otherStaffName(group, '1864702')).toBe('');
  });

  it('never returns the paying customer', () => {
    const group = realLoads(onCall)[0].groups[3];
    // Just the customer and me: whatever else is true, she isn't staff.
    expect(otherStaffName(group, '1864632')).toBe('');
  });
});

describe('affStudent', () => {
  it('reads the student and their level off the instructor\'s group', () => {
    const group = realLoads(langarAff)[0].groups[0];
    expect(affStudent(group)).toEqual({ name: 'Alex Marsh', level: 'Level 6' });
  });

  it('takes a non-numeric level verbatim rather than trying to parse one', () => {
    // A consolidation jump is manifested as "Consol", not a level number
    // — which is the whole reason a level is a string here.
    const group = realLoads(langarAff)[1].groups[0];
    expect(affStudent(group).level).toBe('Consol');
  });

  it('comes back empty for a group with no student in it', () => {
    const tandemGroup = realLoads(onCall)[0].groups[0];
    expect(affStudent(tandemGroup)).toEqual({ name: '', level: '' });
  });
});

describe('matchSlots', () => {
  const map = DEFAULT_BURBLE_CODE_MAP;

  it('finds a tandem instructor and attaches the customer name', () => {
    const { matches } = matchSlots(realLoads(onCall), ['Dylan Whitehair'], map);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      role: 'instructor',
      jumpTypeName: 'Tandem Instructor',
      customerName: 'Miranda Walfield',
      otherStaffName: 'Barry Woollard',
      plate: 'G-UKPS',
      loadNumber: '6',
      code: 'TI',
      status: 'On Call',
    });
  });

  it('finds a camera flyer and attaches the customer from the same group', () => {
    const { matches } = matchSlots(realLoads(onCall), ['Nick Herridge'], map);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      role: 'videographer',
      jumpTypeName: 'Tandem Camera',
      customerName: 'Samantha Townshend',
      otherStaffName: 'Gareth Pepperell',
      code: 'CAM PHOTO',
    });
  });

  it('finds a solo jumper and leaves the customer blank', () => {
    const { matches } = matchSlots(realLoads(onCall), ['Bethan-Rose Dickinson'], map);
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ role: 'solo', jumpTypeName: 'Sport', customerName: '', otherStaffName: '' });
  });

  it('treats EXP+KIT (kit hire) as an ordinary solo', () => {
    const { matches } = matchSlots(realLoads(onCall), ['Jack Adams'], map);
    expect(matches[0]).toMatchObject({ role: 'solo', code: 'EXP+KIT' });
  });

  it('never matches the paying tandem customer, even by exact name', () => {
    // The guard that stops a same-named punter logging me a jump.
    const { matches } = matchSlots(realLoads(onCall), ['Miranda Walfield'], map);
    expect(matches).toEqual([]);
  });

  it('finds an AFF instructor and attaches the student and their level', () => {
    const { matches } = matchSlots(realLoads(langarAff), ['Robin Fielding'], map);
    // Two AFF slots on the board for her — a level 6 and a level 1.
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      role: 'aff',
      jumpTypeName: 'AFF Instructor',
      code: 'AFFI',
      customerName: 'Alex Marsh',
      studentLevel: 'Level 6',
      otherStaffName: '',
      plate: 'G-FLOH',
      loadNumber: '2',
    });
    expect(matches[1]).toMatchObject({ role: 'aff', customerName: 'Sam Okafor', studentLevel: 'Level 1' });
  });

  it('never matches the student, and never offers their level as a code to map', () => {
    // "Level 6" is a level, not a role. Treating it as an unmapped code
    // would invite mapping it, which is how a same-named student ends up
    // logging me a jump.
    const { matches, unmappedCodes } = matchSlots(realLoads(langarAff), ['Alex Marsh'], map);
    expect(matches).toEqual([]);
    expect(unmappedCodes).toEqual([]);
  });

  it('leaves studentLevel empty on a tandem', () => {
    const { matches } = matchSlots(realLoads(onCall), ['Dylan Whitehair'], map);
    expect(matches[0].studentLevel).toBe('');
  });

  it('surfaces an unmapped code instead of guessing or dropping it', () => {
    // "Staff" appeared on the board an hour into the first observation.
    const { matches, unmappedCodes } = matchSlots(realLoads(departed), ['Tim Trevis'], map);
    expect(matches).toEqual([]);
    expect(unmappedCodes).toContain('Staff');
  });

  it('matches regardless of case and stray spacing', () => {
    const { matches } = matchSlots(realLoads(onCall), ['  dylan   WHITEHAIR '], map);
    expect(matches).toHaveLength(1);
  });

  it('finds nothing when no name is configured', () => {
    expect(matchSlots(realLoads(onCall), [], map).matches).toEqual([]);
  });

  it('carries the load status through, so the caller can tell flown from building', () => {
    const { matches } = matchSlots(realLoads(departed), ['Dylan Whitehair'], map);
    expect(matches[0].status).toBe('Departed');
  });
});

describe('mergeSeededCodes', () => {
  const savedBeforeAff = DEFAULT_BURBLE_CODE_MAP.filter((m) => m.code !== 'AFFI');

  it('tops up a map saved before AFFI was seeded', () => {
    // The whole point: adding a mapping to the seed list does nothing on
    // its own, because a saved map is what matching actually uses.
    const merged = mergeSeededCodes(savedBeforeAff, 1);
    expect(merged.map((m) => m.code)).toContain('AFFI');
    expect(merged.find((m) => m.code === 'AFFI')).toMatchObject({ role: 'aff', jumpTypeName: 'AFF Instructor' });
  });

  it('leaves a map alone once it is up to date with the seed', () => {
    // Which is what makes "Remove" stick: removing a code writes the
    // settings back at the current version, so nothing re-adds it.
    const withoutAff = savedBeforeAff;
    expect(mergeSeededCodes(withoutAff, BURBLE_CODE_SEED_VERSION)).toBe(withoutAff);
  });

  it('never duplicates a code the saved map already has, whatever its case', () => {
    const saved = [{ code: 'affi', role: 'solo' as const, jumpTypeName: 'Something Else' }];
    const merged = mergeSeededCodes(saved, 1);
    expect(merged.filter((m) => m.code.toUpperCase() === 'AFFI')).toHaveLength(1);
    // The saved mapping wins — a top-up must never overwrite a decision
    // the jumper has already made about a code.
    expect(merged[0]).toEqual(saved[0]);
  });

  it('keeps everything the saved map had', () => {
    const saved = [{ code: 'MYOWN', role: 'solo' as const, jumpTypeName: 'Sport' }];
    expect(mergeSeededCodes(saved, 1)).toContainEqual(saved[0]);
  });
});

describe('BURBLE_ROLES', () => {
  it('covers every role a mapping can be saved with', () => {
    // Two hand-maintained copies of this list used to reject an unknown
    // role silently — a saved AFFI mapping would have been dropped on
    // read with nothing to show for it.
    expect(BURBLE_ROLES).toContain('aff');
    expect(new Set(DEFAULT_BURBLE_CODE_MAP.map((m) => m.role)).difference(new Set(BURBLE_ROLES)).size).toBe(0);
  });
});

describe('Skydive Langar jump codes', () => {
  // TAN/VID are Langar's own shorthand, confirmed by the jumper. Beccles
  // uses TI/CAM PHOTO for the same two roles — both are in the seeded map,
  // so a visit to either DZ logs rather than piling up unmapped codes.
  function langarLoad(jump: string, name: string) {
    return realLoads({
      loads: [
        {
          id: '304762',
          name: 'G-FLOH 3',
          status: 'Building',
          time_left: 20,
          groups: [
            [
              { id: '1', name: 'A Customer', jump: 'Tandem ', type: 'Tandem', transaction_type_id: '11', option_name: '', sale_id: '9' },
              { id: '2', name, jump, type: 'Tandem', transaction_type_id: '3', option_name: '', sale_id: '9' },
            ],
          ],
        },
      ],
    } as never);
  }

  it('maps TAN to tandem instructor, with the customer attached', () => {
    const { matches } = matchSlots(langarLoad('TAN', 'Jake Orton'), ['Jake Orton'], DEFAULT_BURBLE_CODE_MAP);
    expect(matches[0]).toMatchObject({
      role: 'instructor',
      jumpTypeName: 'Tandem Instructor',
      customerName: 'A Customer',
      code: 'TAN',
    });
  });

  it('leaves the other staff member blank when the group has no camera flyer', () => {
    const { matches } = matchSlots(langarLoad('TAN', 'Jake Orton'), ['Jake Orton'], DEFAULT_BURBLE_CODE_MAP);
    expect(matches[0].otherStaffName).toBe('');
  });

  it('maps VID to tandem camera', () => {
    const { matches } = matchSlots(langarLoad('VID', 'Mila'), ['Mila'], DEFAULT_BURBLE_CODE_MAP);
    expect(matches[0]).toMatchObject({ role: 'videographer', jumpTypeName: 'Tandem Camera', code: 'VID' });
  });

  it('still understands the Beccles equivalents', () => {
    expect(matchSlots(langarLoad('TI', 'Jake Orton'), ['Jake Orton'], DEFAULT_BURBLE_CODE_MAP).matches[0].role).toBe(
      'instructor',
    );
    expect(
      matchSlots(langarLoad('CAM PHOTO', 'Jake Orton'), ['Jake Orton'], DEFAULT_BURBLE_CODE_MAP).matches[0].role,
    ).toBe('videographer');
  });
});
