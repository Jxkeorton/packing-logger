import type { APIRoute } from 'astro';
import {
  CATEGORIES,
  addJump,
  readHistory,
  removeJump,
  toHistoryRow,
  totalEarnings,
  totalJumps,
  type Category,
  type DayState,
} from '../../lib/tandem';
import { groupByInvoiceMonth, groupByWeek } from '../../lib/tandem-invoice';
import { addEntry as addLogbookEntry, removeEntry as removeLogbookEntry } from '../../lib/logbook';
import { ensureJumpType, readLogbookSettings } from '../../lib/logbook-settings';

const MAX_NAME_LENGTH = 80;

// A tandem instructor/camera jump is also a jump in its own right, so
// logging one here auto-adds a matching entry to the personal logbook —
// sharing the same `at` id so undoing the tandem jump (see DELETE below)
// cleanly removes its logbook entry too, without a separate link table.
// Best-effort: the tandem jump itself is the record that matters for
// invoicing, so a logbook-side failure is logged, not surfaced as an error.
async function autoLogTandemJump(category: Category, name: string, date: string, at: string): Promise<void> {
  try {
    const jumpTypeName = category === 'instructor' ? 'Tandem Instructor' : 'Tandem Camera';
    await ensureJumpType(jumpTypeName);
    const settings = await readLogbookSettings();
    // Camera jumps use whatever's currently starred as the default
    // Equipment profile (the videographer's own camera rig) — blank if
    // none is set. Instructor jumps use a generic placeholder instead: a
    // tandem instructor rig isn't one of the videographer's own saved
    // profiles, so there's nothing meaningful to default it to.
    const defaultEquipment = settings.equipment.find((eq) => eq.id === settings.defaultEquipmentId);
    await addLogbookEntry(
      {
        date,
        place: '',
        exitAltitude: '',
        canopy: category === 'instructor' ? 'Tandem Rig' : defaultEquipment?.canopy ?? '',
        container: category === 'instructor' ? '' : defaultEquipment?.container ?? '',
        aad: category === 'instructor' ? '' : defaultEquipment?.aad ?? '',
        aircraft: '',
        jumpType: jumpTypeName,
        description: `Auto-logged from the Tandems tab — ${category} jump for ${name}.`,
      },
      settings.baseJumps,
      at,
    );
  } catch (err) {
    console.error('Failed to auto-log tandem jump to the logbook', err);
  }
}

async function respond(state: DayState): Promise<Response> {
  // The daily history (used for the "Day" table) doesn't include today, but
  // the current week/month row is still filling up — recompute just that
  // one bucket for each so the live totals stay in sync as taps land.
  const history = await readHistory(400);
  const combined = [...history, toHistoryRow(state)];
  const currentWeek = groupByWeek(combined)[0] ?? null;
  const currentMonth = groupByInvoiceMonth(combined)[0] ?? null;

  return new Response(
    JSON.stringify({
      state,
      totalJumps: totalJumps(state.counts),
      totalEarnings: totalEarnings(state.counts),
      currentWeek,
      currentMonth,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// Records one tandem jump for today, crediting a customer name — every jump
// needs one, since that's what ends up on the invoice.
export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { category, name } = (body ?? {}) as { category?: string; name?: string };

  if (!category || !CATEGORIES.includes(category as Category)) {
    return new Response(JSON.stringify({ error: 'Unknown category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Collapse any embedded newlines rather than rejecting them outright —
  // a name is the one free-text field in this app, easy to fat-finger a
  // stray line break into on a phone keyboard.
  const cleanName = typeof name === 'string' ? name.trim().replace(/[\r\n]+/g, ' ') : '';
  if (!cleanName) {
    return new Response(JSON.stringify({ error: 'name is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (cleanName.length > MAX_NAME_LENGTH) {
    return new Response(JSON.stringify({ error: `name must be ${MAX_NAME_LENGTH} characters or fewer` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const at = new Date().toISOString();
  const state = await addJump(category as Category, cleanName, at);
  await autoLogTandemJump(category as Category, cleanName, state.date, at);
  return respond(state);
};

// Removes a single jump (by the `at` timestamp it was recorded with) — used
// to undo a mis-tap or a typo'd name.
export const DELETE: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { at } = (body ?? {}) as { at?: string };

  if (typeof at !== 'string' || !at) {
    return new Response(JSON.stringify({ error: 'at is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await removeJump(at);
  // Same id as the auto-logged logbook entry (if any) — removeEntry is a
  // harmless no-op when nothing matches, e.g. a jump logged before this
  // feature existed.
  try {
    const settings = await readLogbookSettings();
    await removeLogbookEntry(at, settings.baseJumps);
  } catch (err) {
    console.error('Failed to remove auto-logged logbook entry', err);
  }
  return respond(state);
};
