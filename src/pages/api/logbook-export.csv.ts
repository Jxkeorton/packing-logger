import type { APIRoute } from 'astro';
import { readCsvFile } from '../../lib/logbook';
import { readLogbookSettings } from '../../lib/logbook-settings';

// Downloads the full logbook as a .csv, oldest jump first with its jump
// number — the same order and shape as a physical logbook.
export const GET: APIRoute = async () => {
  const settings = await readLogbookSettings();
  const csv = await readCsvFile(settings.baseJumps);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="logbook.csv"',
      // See tandem-invoice.pdf.ts — an explicit length avoids iOS Safari
      // saving a 0-byte file for `download`-attribute links.
      'Content-Length': String(Buffer.byteLength(csv)),
    },
  });
};
