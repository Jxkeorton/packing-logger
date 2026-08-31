// Tandems tab actions — direct port of the main app's
// pages/api/{tandem-adjust,invoice-settings}.ts logic, minus the
// hand-shaped JSON responses (a plain `use:enhance` re-runs the page's
// `load` after success, so state/history/week/month refresh together).
import { fail, type Action } from '@sveltejs/kit';
import { CATEGORIES, OTHER_STAFF_LABELS, TANDEM_JUMP_TYPES, type Category } from '$lib/tandem';
import { addJump, removeJump } from '$lib/server/tandem';
import { removeEntry as removeLogbookEntry } from '$lib/server/logbook';
import { readLogbookSettings } from '$lib/server/logbook-settings';
import { autoLogJump } from '$lib/server/auto-log';
import { readInvoiceSettings, writeInvoiceSettings, type InvoiceSettings } from '$lib/server/invoice-settings';
import { oneLine, multiLine } from '$lib/server/form-utils';

const MAX_NAME_LENGTH = 80;

// A tandem instructor/camera jump is also a jump in its own right, so
// logging one here auto-adds a matching entry to the personal logbook —
// sharing the same `at` id so undoing the tandem jump cleanly removes its
// logbook entry too, without a separate link table.
//
// The jump type has to stay the tandem one ("Tandem Instructor"/"Tandem
// Camera") rather than the starred default, since that's the whole point
// of auto-logging it from this tab. Everything else comes from the saved
// defaults — except an instructor jump's rig, which is a fixed "Tandem
// Rig" label rather than the starred one (an instructor jumps the
// dropzone's shared tandem rig, never their own gear) — see
// $lib/server/auto-log.ts, which the manifest sync shares.
async function autoLogTandemJump(
  category: Category,
  name: string,
  staff: string,
  date: string,
  at: string,
): Promise<void> {
  await autoLogJump({
    jumpTypeName: TANDEM_JUMP_TYPES[category],
    date,
    at,
    // The other staff member on the jump, when one was given — named by
    // their role ("Camera flyer: …" on an instructor jump, "Instructor: …"
    // on a camera one) so the description reads the same way round for
    // both, and stays plain enough to edit by hand afterwards.
    description:
      `Auto-logged from the Tandems tab — ${category} jump for ${name}.` +
      (staff ? ` ${OTHER_STAFF_LABELS[category]}: ${staff}.` : ''),
  });
}

function linesFrom(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export const tandemActions: Record<string, Action> = {
  addTandemJump: async ({ request }) => {
    const formData = await request.formData();
    const category = String(formData.get('category') ?? '');
    if (!CATEGORIES.includes(category as Category)) return fail(400, { error: 'Unknown category' });

    // Collapse any embedded newlines rather than rejecting them outright —
    // a name is the one free-text field here, easy to fat-finger a stray
    // line break into on a phone keyboard.
    const cleanName = oneLine(formData.get('name'), MAX_NAME_LENGTH);
    if (!cleanName) return fail(400, { error: 'name is required' });

    // Optional: only the customer's name is required to bill the jump.
    const cleanStaff = oneLine(formData.get('staff'), MAX_NAME_LENGTH);

    const at = new Date().toISOString();
    const state = await addJump(category as Category, cleanName, at);
    await autoLogTandemJump(category as Category, cleanName, cleanStaff, state.date, at);
  },

  deleteTandemJump: async ({ request }) => {
    const at = String((await request.formData()).get('at') ?? '');
    if (!at) return fail(400, { error: 'at is required' });

    await removeJump(at);
    // Same id as the auto-logged logbook entry (if any) — removeEntry is a
    // harmless no-op when nothing matches, e.g. a jump logged before this
    // feature existed.
    try {
      const settings = await readLogbookSettings();
      await removeLogbookEntry(at, settings.baseJumps);
    } catch (err) {
      console.error('Failed to remove auto-logged logbook entry', err);
    }
  },

  saveInvoiceSettings: async ({ request }) => {
    const formData = await request.formData();
    const nextInvoiceRef = Number(formData.get('nextInvoiceRef'));
    if (!Number.isInteger(nextInvoiceRef) || nextInvoiceRef <= 0) {
      return fail(400, { error: 'nextInvoiceRef must be a positive whole number' });
    }

    const current = await readInvoiceSettings();
    const fromName = oneLine(formData.get('fromName'), 200);
    const vatNote = oneLine(formData.get('vatNote'), 200);
    const settings: InvoiceSettings = {
      fromName: fromName || current.fromName,
      fromAddress: (() => {
        const lines = linesFrom(multiLine(formData.get('fromAddress'), 2000));
        return lines.length > 0 ? lines : current.fromAddress;
      })(),
      vatNote,
      billTo: (() => {
        const lines = linesFrom(multiLine(formData.get('billTo'), 2000));
        return lines.length > 0 ? lines : current.billTo;
      })(),
      nextInvoiceRef,
    };

    await writeInvoiceSettings(settings);
  },
};
