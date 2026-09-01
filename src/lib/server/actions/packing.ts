// Packing tab actions. `adjust` used to be a plain `use:enhance` letting
// SvelteKit re-run the whole page's `load` after every tap — simple, but
// that `load` reads both jump ledgers, burble sync state, logbook and
// rate settings and recomputes every week/month rollup, so re-running
// all of it for a single ±1 tap made rapid packing counting feel
// noticeably laggy. PackCategoryCards.svelte now calls this directly
// (bypassing use:enhance's default full-page update) and applies the
// count optimistically the instant you tap, treating this action's
// response as a cheap background confirmation rather than something the
// UI waits on — so `adjust` returns just the day's counts, the smallest
// thing that lets the client correct any drift, not the fully
// recomputed page.
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
    const state = await adjustCount(category as Category, delta);
    return { counts: state.counts };
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
