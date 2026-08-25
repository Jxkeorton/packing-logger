import type { APIRoute } from 'astro';
import { readCsvFile } from '../../lib/packing';
import { csvDownloadResponse } from '../../lib/api-response';

// Lets you download the full log as a .csv, regardless of whether it's
// backed by the local data/ folder or Vercel Blob in production.
export const GET: APIRoute = async () => {
  const csv = await readCsvFile();
  return csvDownloadResponse(csv, 'packing-log.csv');
};
