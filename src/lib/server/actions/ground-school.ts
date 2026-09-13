// Ground school actions — a small sibling of actions/tandem.ts, kept in
// its own file the same way the ground-school ledger is kept in its own
// module: it lives on the Tandems tab, beneath the AFF instructor
// section, but it isn't a tandem jump and doesn't share that ledger's
// categories/rates/level machinery.
import { fail, type Action } from '@sveltejs/kit';
import { addEntry, removeEntry } from '$lib/server/ground-school';

/** A sanity ceiling, not a real-world price — catches a fat-fingered extra digit rather than billing it. */
const MAX_AMOUNT = 100000;

export const groundSchoolActions: Record<string, Action> = {
  addGroundSchool: async ({ request }) => {
    const formData = await request.formData();
    const amount = Number(formData.get('amount'));
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      return fail(400, { error: 'amount must be a positive number' });
    }

    // Round to the nearest penny — a numeric-keyboard input can carry more
    // precision than money has (e.g. typing "12.005"), and the invoice
    // should never show a fractional penny.
    const rounded = Math.round(amount * 100) / 100;
    await addEntry(rounded);
  },

  deleteGroundSchool: async ({ request }) => {
    const at = String((await request.formData()).get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });

    await removeEntry(at);
  },
};
