import type { APIRoute } from 'astro';
import { readInvoiceSettings, writeInvoiceSettings, type InvoiceSettings } from '../../lib/invoice-settings';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

function linesFrom(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

export const GET: APIRoute = async () => {
  const settings = await readInvoiceSettings();
  return jsonOk(settings);
};

// Updates the invoice letterhead details (your name/address, the client's
// billing address) and/or the next invoice number. Textareas arrive as
// newline-separated text and are split into address lines here.
export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const {
    fromName,
    fromAddress,
    vatNote,
    billTo,
    nextInvoiceRef,
  } = (parsed.data ?? {}) as {
    fromName?: string;
    fromAddress?: string;
    vatNote?: string;
    billTo?: string;
    nextInvoiceRef?: number;
  };

  if (typeof nextInvoiceRef !== 'number' || !Number.isInteger(nextInvoiceRef) || nextInvoiceRef <= 0) {
    return jsonError('nextInvoiceRef must be a positive whole number');
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
  return jsonOk(settings);
};
