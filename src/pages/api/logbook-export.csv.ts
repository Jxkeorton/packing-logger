import type { APIRoute } from 'astro';
import { readCsvFile } from '../../lib/logbook';
import { readLogbookSettings } from '../../lib/logbook-settings';
import { csvDownloadResponse } from '../../lib/api-response';

// Downloads the full logbook as a .csv, oldest jump first with its jump
// number — the same order and shape as a physical logbook.
export const GET: APIRoute = async () => {
  const settings = await readLogbookSettings();
  const csv = await readCsvFile(settings.baseJumps);
  return csvDownloadResponse(csv, 'logbook.csv');
};
