// Tandems tab actions — direct port of the main app's
// pages/api/{tandem-adjust,invoice-settings}.ts logic, minus the
// hand-shaped JSON responses (a plain `use:enhance` re-runs the page's
// `load` after success, so state/history/week/month refresh together).
import { fail, type Action } from '@sveltejs/kit';
import { CATEGORIES, type Category } from '$lib/tandem';
import { addJump, removeJump } from '$lib/server/tandem';
import { addEntry as addLogbookEntry, removeEntry as removeLogbookEntry } from '$lib/server/logbook';
import { ensureJumpType, readLogbookSettings } from '$lib/server/logbook-settings';
import { readInvoiceSettings, writeInvoiceSettings, type InvoiceSettings } from '$lib/server/invoice-settings';
import { oneLine, multiLine } from '$lib/server/form-utils';

const MAX_NAME_LENGTH = 80;

// A tandem instructor/camera jump is also a jump in its own right, so
// logging one here auto-adds a matching entry to the personal logbook —
// sharing the same `at` id so undoing the tandem jump cleanly removes its
// logbook entry too, without a separate link table. Best-effort: the
// tandem jump itself is the record that matters for invoicing, so a
// logbook-side failure is logged, not surfaced as an error.
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
        canopy: category === 'instructor' ? 'Tandem Rig' : (defaultEquipment?.canopy ?? ''),
        container: category === 'instructor' ? '' : (defaultEquipment?.container ?? ''),
        aad: category === 'instructor' ? '' : (defaultEquipment?.aad ?? ''),
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

    const at = new Date().toISOString();
    const state = await addJump(category as Category, cleanName, at);
    await autoLogTandemJump(category as Category, cleanName, state.date, at);
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
