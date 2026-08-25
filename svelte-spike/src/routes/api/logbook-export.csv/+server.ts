import type { RequestHandler } from './$types';
import { readCsvFile } from '$lib/server/logbook';
import { readLogbookSettings } from '$lib/server/logbook-settings';
import { csvDownloadResponse } from '$lib/server/api-response';

export const GET: RequestHandler = async () => {
  const settings = await readLogbookSettings();
  const csv = await readCsvFile(settings.baseJumps);
  return csvDownloadResponse(csv, 'logbook.csv');
};
