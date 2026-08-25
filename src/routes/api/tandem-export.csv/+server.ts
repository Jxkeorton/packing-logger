import type { RequestHandler } from './$types';
import { readCsvFile } from '$lib/server/tandem';
import { csvDownloadResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async () => {
  const csv = await readCsvFile();
  return csvDownloadResponse(csv, 'tandem-log.csv');
};
