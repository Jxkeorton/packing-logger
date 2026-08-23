import type { APIRoute } from 'astro';
import { CATEGORIES, adjustCount, readHistory, toHistoryRow, totalEarnings, totalPacks, type Category } from '../../lib/packing';
import { groupByInvoiceMonth, groupByWeek } from '../../lib/invoice';

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

  const { category, delta } = (body ?? {}) as { category?: string; delta?: number };

  if (!category || !CATEGORIES.includes(category as Category)) {
    return new Response(JSON.stringify({ error: 'Unknown category' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (delta !== 1 && delta !== -1) {
    return new Response(JSON.stringify({ error: 'delta must be 1 or -1' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const state = await adjustCount(category as Category, delta);

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
      totalPacks: totalPacks(state.counts),
      totalEarnings: totalEarnings(state.counts),
      currentWeek,
      currentMonth,
    }),
    { headers: { 'Content-Type': 'application/json' } },
  );
};
