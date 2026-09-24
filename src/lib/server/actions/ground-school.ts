// Ground school actions — kept in their own file the same way the
// ground-school ledger is kept in its own module, since it isn't a tandem
// jump and doesn't share that ledger's categories/rates/level machinery.
// Delete only: the "add ground school" panel is retired for good (see
// $lib/server/ground-school.ts), and History's delete control is the one
// thing that still posts here.
import { fail, type Action } from '@sveltejs/kit';
import { removeEntry } from '$lib/server/ground-school';

export const groundSchoolActions: Record<string, Action> = {
  deleteGroundSchool: async ({ request }) => {
    const at = String((await request.formData()).get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });

    await removeEntry(at);
  },
};
