import type { APIRoute } from 'astro';
import { readCsvFile } from '../../lib/tandem';

// Lets you download the full tandem log as a .csv, regardless of whether
// it's backed by the local data/ folder or Vercel Blob in production.
export const GET: APIRoute = async () => {
  const csv = await readCsvFile();

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="tandem-log.csv"',
      // See tandem-invoice.pdf.ts — an explicit length avoids iOS Safari
      // saving a 0-byte file for `download`-attribute links.
      'Content-Length': String(Buffer.byteLength(csv)),
    },
  });
};
