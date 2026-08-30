// Tests for the pure matching layer, driven by the real captures in
// server/burble/fixtures/ rather than hand-written JSON — several of the
// shapes asserted here (the column padding, the trailing space in
// `"Tandem "`, the curly quotes in a customer name) are things the feed
// actually does and a hand-rolled fixture would quietly get wrong.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BURBLE_CODE_MAP,
  matchSlots,
  normaliseName,
  otherTandemStaffName,
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

describe('otherTandemStaffName', () => {
  it('picks the camera flyer out of the instructor\'s group', () => {
    const group = realLoads(onCall)[0].groups[0];
    // Miranda Walfield (customer) + Dylan Whitehair (TI) + Barry Woollard (camera).
    expect(otherTandemStaffName(group, '1864662')).toBe('Barry Woollard');
  });

  it('picks the instructor out of the camera flyer\'s group', () => {
    const group = realLoads(onCall)[0].groups[0];
    expect(otherTandemStaffName(group, '1864672')).toBe('Dylan Whitehair');
  });

  it('comes back empty on a tandem manifested without a camera flyer', () => {
    // Aleksandra Rola + Liam Domin-Goddard, and nobody else.
    const group = realLoads(onCall)[0].groups[2];
    expect(otherTandemStaffName(group, '1864702')).toBe('');
  });

  it('never returns the paying customer', () => {
    const group = realLoads(onCall)[0].groups[3];
    // Just the customer and me: whatever else is true, she isn't staff.
    expect(otherTandemStaffName(group, '1864632')).toBe('');
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
