// Packing tab actions. Notably smaller than the main app's
// pages/api/{adjust,pack-time}.ts: those returned the freshly-recomputed
// state/totals/currentWeek/currentMonth in the JSON response so the
// client could patch its own DOM without a round trip. Here, a plain
// `use:enhance` re-runs the page's `load` after any action succeeds, so
// state/history/week/month all refresh together from one source — no
// "recompute just the current bucket" special-casing needed.
import { fail, type Action } from '@sveltejs/kit';
import { CATEGORIES, type Category } from '$lib/packing';
import { adjustCount } from '$lib/server/packing';
import { deleteTime, recordTime } from '$lib/server/times';

export const packingActions: Record<string, Action> = {
  adjust: async ({ request }) => {
    const formData = await request.formData();
    const category = String(formData.get('category') ?? '');
    const delta = Number(formData.get('delta'));
    if (!CATEGORIES.includes(category as Category)) return fail(400, { error: 'Unknown category' });
    if (delta !== 1 && delta !== -1) return fail(400, { error: 'delta must be 1 or -1' });
    await adjustCount(category as Category, delta);
  },

  recordPackTime: async ({ request }) => {
    const ms = Number((await request.formData()).get('ms'));
    if (!Number.isFinite(ms)) return fail(400, { error: 'ms must be a finite number' });
    await recordTime(ms);
  },

  deletePackTime: async ({ request }) => {
    const at = String((await request.formData()).get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });
    await deleteTime(at);
  },
};
