import type { APIRoute } from 'astro';
import { deleteTime, recordTime } from '../../lib/times';
import { parseJsonBody, jsonOk, jsonError } from '../../lib/api-response';

export const POST: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { ms } = (parsed.data ?? {}) as { ms?: number };
  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return jsonError('ms must be a finite number');
  }

  const { time, top5 } = await recordTime(ms);
  return jsonOk({ time, top5 });
};

export const DELETE: APIRoute = async ({ request }) => {
  const parsed = await parseJsonBody(request);
  if ('error' in parsed) return parsed.error;

  const { at } = (parsed.data ?? {}) as { at?: string };
  if (typeof at !== 'string' || !at) {
    return jsonError('at is required');
  }

  const top5 = await deleteTime(at);
  return jsonOk({ top5 });
};
