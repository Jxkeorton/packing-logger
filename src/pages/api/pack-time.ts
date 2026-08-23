import type { APIRoute } from 'astro';
import { deleteTime, recordTime } from '../../lib/times';

export const POST: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { ms } = (body ?? {}) as { ms?: number };

  if (typeof ms !== 'number' || !Number.isFinite(ms)) {
    return new Response(JSON.stringify({ error: 'ms must be a finite number' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { time, top5 } = await recordTime(ms);

  return new Response(JSON.stringify({ time, top5 }), {
    headers: { 'Content-Type': 'application/json' },
  });
};

export const DELETE: APIRoute = async ({ request }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { at } = (body ?? {}) as { at?: string };

  if (typeof at !== 'string' || !at) {
    return new Response(JSON.stringify({ error: 'at is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const top5 = await deleteTime(at);

  return new Response(JSON.stringify({ top5 }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
