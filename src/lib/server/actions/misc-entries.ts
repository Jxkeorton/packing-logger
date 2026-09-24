// Miscellaneous-earnings actions — a sibling of actions/ground-school.ts,
// kept in its own file the same way that ledger is: it lives on the
// Tandems tab, alongside the AFF and ground school sections, but it isn't
// a tandem jump and doesn't share that ledger's categories/rates/level
// machinery.
import { fail, type Action } from '@sveltejs/kit';
import { addEntry, removeEntry, updateEntry } from '$lib/server/misc-entries';

/** A sanity ceiling, not a real-world price — catches a fat-fingered extra digit rather than billing it. */
const MAX_AMOUNT = 100000;

/** Long enough for a real description, short enough that it can't wreck the invoice layout. */
const MAX_LABEL_LENGTH = 80;

/**
 * Shared by addMiscEntry and editMiscEntry below — same fields, same
 * limits, same rounding, so a fix applied to one can't quietly drift from
 * the other.
 */
function parseLabelAndAmount(formData: FormData): { label: string; amount: number } | { error: string } {
  const label = String(formData.get('label') ?? '').trim();
  const amount = Number(formData.get('amount'));

  if (!label || label.length > MAX_LABEL_LENGTH) {
    return { error: `label must be 1-${MAX_LABEL_LENGTH} characters` };
  }
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    return { error: 'amount must be a positive number' };
  }

  // Round to the nearest penny — a numeric-keyboard input can carry more
  // precision than money has (e.g. typing "12.005"), and the invoice
  // should never show a fractional penny.
  return { label, amount: Math.round(amount * 100) / 100 };
}

export const miscEntryActions: Record<string, Action> = {
  addMiscEntry: async ({ request }) => {
    const parsed = parseLabelAndAmount(await request.formData());
    if ('error' in parsed) return fail(400, { error: parsed.error });

    await addEntry(parsed.label, parsed.amount);
  },

  editMiscEntry: async ({ request }) => {
    const formData = await request.formData();
    const at = String(formData.get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });

    const parsed = parseLabelAndAmount(formData);
    if ('error' in parsed) return fail(400, { error: parsed.error });

    await updateEntry(at, parsed.label, parsed.amount);
  },

  deleteMiscEntry: async ({ request }) => {
    const at = String((await request.formData()).get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });

    await removeEntry(at);
  },
};
