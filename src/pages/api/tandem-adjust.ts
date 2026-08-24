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

const MAX_NAME_LENGTH = 80;

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

  const state = await addJump(category as Category, cleanName);
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
  return respond(state);
};
