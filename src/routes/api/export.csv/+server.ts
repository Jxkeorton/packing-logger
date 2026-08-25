import type { RequestHandler } from './$types';
import { readCsvFile } from '$lib/server/packing';
import { csvDownloadResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async () => {
  const csv = await readCsvFile();
  return csvDownloadResponse(csv, 'packing-log.csv');
};
