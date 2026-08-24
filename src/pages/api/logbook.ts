import type { APIRoute } from 'astro';
import { addEntry, nextJumpNumber, readLogbook, removeEntry, updateEntry, type EntryInput, type NumberedEntry } from '../../lib/logbook';
import { readLogbookSettings } from '../../lib/logbook-settings';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_LINE_LENGTH = 120;
const MAX_DESCRIPTION_LENGTH = 4000;

function oneLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/[\r\n]+/g, ' ').slice(0, maxLength);
}

function multiLine(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maxLength);
}

async function respond(entries: NumberedEntry[]): Promise<Response> {
  const settings = await readLogbookSettings();
  return new Response(
    JSON.stringify({ entries, nextNumber: await nextJumpNumber(settings.baseJumps) }),
    { headers: { 'Content-Type': 'application/json' } },
  );
}

// The client resolves the picked equipment profile to plain canopy/
// container/AAD text itself (from the dropdown option's data attributes)
// and sends that text directly — the ledger stores what was actually
// jumped, not a reference, so it stays accurate even if the profile is
// later edited or deleted, and editing an entry without touching the
// equipment field can't accidentally blank out its snapshot.
function parseEntryInput(body: any): { input: EntryInput } | { error: string } {
  const date = typeof body?.date === 'string' ? body.date.trim() : '';
  if (!DATE_RE.test(date)) {
    return { error: 'date is required and must be YYYY-MM-DD' };
  }

  const input: EntryInput = {
    date,
    place: oneLine(body?.place, MAX_LINE_LENGTH),
    exitAltitude: oneLine(body?.exitAltitude, MAX_LINE_LENGTH),
    canopy: oneLine(body?.canopy, MAX_LINE_LENGTH),
    container: oneLine(body?.container, MAX_LINE_LENGTH),
    aad: oneLine(body?.aad, MAX_LINE_LENGTH),
    aircraft: oneLine(body?.aircraft, MAX_LINE_LENGTH),
    jumpType: oneLine(body?.jumpType, MAX_LINE_LENGTH),
    description: multiLine(body?.description, MAX_DESCRIPTION_LENGTH),
  };
  return { input };
}

// Current entries + next jump number — used to refresh the list after the
// starting-jump-number setting changes, without a full page reload.
export const GET: APIRoute = async () => {
  const settings = await readLogbookSettings();
  const entries = await readLogbook(settings.baseJumps);
  return respond(entries);
};

// Logs a new jump.
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

  const parsed = parseEntryInput(body);
  if ('error' in parsed) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await readLogbookSettings();
  const entries = await addEntry(parsed.input, settings.baseJumps);
  return respond(entries);
};

// Edits an existing jump's details, identified by the `at` it was logged
// with. Numbers aren't touched directly — they're recomputed from the
// (possibly now-different) date, so editing a jump's date can shift its
// number and every number after it, same as it would in a paper logbook.
export const PUT: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const at = typeof (body as any)?.at === 'string' ? (body as any).at : '';
  if (!at) {
    return new Response(JSON.stringify({ error: 'at is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const parsed = parseEntryInput(body);
  if ('error' in parsed) {
    return new Response(JSON.stringify({ error: parsed.error }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await readLogbookSettings();
  const entries = await updateEntry(at, parsed.input, settings.baseJumps);
  if (!entries) {
    return new Response(JSON.stringify({ error: 'No jump found with that id' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return respond(entries);
};

// Deletes a jump by id — used to undo a mis-entry rather than leaving a gap.
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

  const at = typeof (body as any)?.at === 'string' ? (body as any).at : '';
  if (!at) {
    return new Response(JSON.stringify({ error: 'at is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const settings = await readLogbookSettings();
  const entries = await removeEntry(at, settings.baseJumps);
  return respond(entries);
};
