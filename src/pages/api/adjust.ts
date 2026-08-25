import type { APIRoute } from 'astro';
import { CATEGORIES, adjustCount, readHistory, toHistoryRow, totalEarnings, totalPacks, type Category } from '../../lib/packing';
import { groupByInvoiceMonth, groupByWeek } from '../../lib/invoice';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { category, delta } = (parsed.data ?? {}) as { category?: string; delta?: number };

  if (!category || !CATEGORIES.includes(category as Category)) {
    return jsonError('Unknown category');
  }
  if (delta !== 1 && delta !== -1) {
    return jsonError('delta must be 1 or -1');
  }

  const state = await adjustCount(category as Category, delta);

  // The daily history (used for the "Day" table) doesn't include today, but
  // the current week/month row is still filling up — recompute just that
  // one bucket for each so the live totals stay in sync as taps land.
  const history = await readHistory(400);
  const combined = [...history, toHistoryRow(state)];
  const currentWeek = groupByWeek(combined)[0] ?? null;
  const currentMonth = groupByInvoiceMonth(combined)[0] ?? null;

  return jsonOk({
    state,
    totalPacks: totalPacks(state.counts),
    totalEarnings: totalEarnings(state.counts),
    currentWeek,
    currentMonth,
  });
};
