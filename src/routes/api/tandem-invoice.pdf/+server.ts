import type { RequestHandler } from './$types';
import { handyCamJumpsInRange, jumpsInRange } from '$lib/server/tandem';
import { invoiceMonthDateRange } from '$lib/server/tandem-invoice';
import { formatDateKey, rangeLabel } from '$lib/server/periods';
import { claimInvoiceRef, readInvoiceSettings } from '$lib/server/invoice-settings';
import { readRateSettings } from '$lib/server/rate-settings';
import { entriesInRange as groundSchoolEntriesInRange } from '$lib/server/ground-school';
import { buildTandemInvoicePdf } from '$lib/server/invoice-pdf';

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
export const GET: RequestHandler = async ({ url }) => {
  const month = url.searchParams.get('month') ?? '';
  if (!MONTH_KEY_RE.test(month)) {
    return new Response('month must be in YYYY-MM form', { status: 400 });
  }

  const { start, end } = invoiceMonthDateRange(month);
  const startKey = formatDateKey(start);
  const endKey = formatDateKey(end);

  const [jumpsByCategory, handyCamJumps, settings, rateSettings, ref, groundSchoolEntries] = await Promise.all([
    jumpsInRange(startKey, endKey),
    handyCamJumpsInRange(startKey, endKey),
    readInvoiceSettings(),
    readRateSettings(),
    claimInvoiceRef(),
    groundSchoolEntriesInRange(startKey, endKey),
  ]);

  // The employer wants the Ultimate package, bought upfront, kept apart
  // from a bonus the customer bought once they were already home — see
  // Jump.handyCamAfterJump and invoice-pdf.ts's two Handy Cam Footage
  // sections.
  const handyCamPackageJumps = handyCamJumps.filter((j) => !j.handyCamAfterJump);
  const handyCamAfterJumpJumps = handyCamJumps.filter((j) => j.handyCamAfterJump);

  const pdf = await buildTandemInvoicePdf({
    ref,
    issuedDate: todayFormatted(),
    periodLabel: `${rangeLabel(start, end)} (${monthLabel(month)})`,
    settings,
    jumpsByCategory,
    rates: rateSettings.tandem,
    videographerPackageRate: rateSettings.videographerPackageRate,
    handyCamPackageJumps,
    handyCamAfterJumpJumps,
    handyCamBonusRate: rateSettings.handyCamBonusRate,
    groundSchoolEntries,
  });

  const filenameSafeName = settings.fromName.trim().replace(/\s+/g, '_') || 'Tandem';
  const filename = `${filenameSafeName}_Invoice_${monthLabel(month).replace(/\s+/g, '_')}.pdf`;

  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdf.length),
    },
  });
};
