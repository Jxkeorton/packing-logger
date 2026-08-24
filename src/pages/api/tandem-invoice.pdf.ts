import type { APIRoute } from 'astro';
import { jumpsInRange } from '../../lib/tandem';
import { invoiceMonthDateRange } from '../../lib/tandem-invoice';
import { formatDateKey, rangeLabel } from '../../lib/periods';
import { claimInvoiceRef, readInvoiceSettings } from '../../lib/invoice-settings';
import { buildTandemInvoicePdf } from '../../lib/invoice-pdf';

const MONTH_KEY_RE = /^\d{4}-\d{2}$/;

function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

function todayFormatted(): string {
  const now = new Date();
  const d = String(now.getDate()).padStart(2, '0');
  const m = String(now.getMonth() + 1).padStart(2, '0');
  return `${d}/${m}/${now.getFullYear()}`;
}

// Generates the tandem invoice PDF for one invoice month, claiming (and
// persisting) the next invoice number in the process. Packing jobs never
// appear here — this is the tandem-only ledger.
export const GET: APIRoute = async ({ url }) => {
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_KEY_RE.test(month)) {
    return new Response('month must be in YYYY-MM form', { status: 400 });
  }

  const { start, end } = invoiceMonthDateRange(month);
  const startKey = formatDateKey(start);
  const endKey = formatDateKey(end);

  const [jumpsByCategory, settings, ref] = await Promise.all([
    jumpsInRange(startKey, endKey),
    readInvoiceSettings(),
    claimInvoiceRef(),
  ]);

  const pdf = await buildTandemInvoicePdf({
    ref,
    issuedDate: todayFormatted(),
    periodLabel: `${rangeLabel(start, end)} (${monthLabel(month)})`,
    settings,
    jumpsByCategory,
  });

  const filenameSafeName = settings.fromName.trim().replace(/\s+/g, '_') || 'Tandem';
  const filename = `${filenameSafeName}_Invoice_${monthLabel(month).replace(/\s+/g, '_')}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
};
