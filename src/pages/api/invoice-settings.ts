import type { APIRoute } from 'astro';
import { readInvoiceSettings, writeInvoiceSettings, type InvoiceSettings } from '../../lib/invoice-settings';

function linesFrom(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export const GET: APIRoute = async () => {
  const settings = await readInvoiceSettings();
  return new Response(JSON.stringify(settings), { headers: { 'Content-Type': 'application/json' } });
};

// Updates the invoice letterhead details (your name/address, the client's
// billing address) and/or the next invoice number. Textareas arrive as
// newline-separated text and are split into address lines here.
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

  const {
    fromName,
    fromAddress,
    vatNote,
    billTo,
    nextInvoiceRef,
  } = (body ?? {}) as {
    fromName?: string;
    fromAddress?: string;
    vatNote?: string;
    billTo?: string;
    nextInvoiceRef?: number;
  };

  if (typeof nextInvoiceRef !== 'number' || !Number.isInteger(nextInvoiceRef) || nextInvoiceRef <= 0) {
    return new Response(JSON.stringify({ error: 'nextInvoiceRef must be a positive whole number' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const current = await readInvoiceSettings();
  const settings: InvoiceSettings = {
    fromName: typeof fromName === 'string' && fromName.trim() ? fromName.trim() : current.fromName,
    fromAddress: linesFrom(fromAddress).length > 0 ? linesFrom(fromAddress) : current.fromAddress,
    vatNote: typeof vatNote === 'string' ? vatNote.trim() : current.vatNote,
    billTo: linesFrom(billTo).length > 0 ? linesFrom(billTo) : current.billTo,
    nextInvoiceRef,
  };

  await writeInvoiceSettings(settings);

  return new Response(JSON.stringify(settings), { headers: { 'Content-Type': 'application/json' } });
};
