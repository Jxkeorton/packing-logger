// Small helpers for API routes under src/pages/api/. Nearly every route
// there used to re-implement the same "try to parse the JSON body, 400 if
// it isn't" block and the same `new Response(JSON.stringify(x), {
// headers: {...} })` wrapping — factored out here so each route's own
// logic (the actual validation and the call into lib/) is what's left to
// read.

/** A JSON 200 (or other 2xx/error) response, with the right Content-Type. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Shorthand for the common case: `return jsonOk({ settings })`. */
export function jsonOk(data: unknown): Response {
  return jsonResponse(data, 200);
}

/** A JSON `{ error: message }` response — 400 by default, since that covers every current caller. */
export function jsonError(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

/**
 * Parses a request's JSON body. Returns `{ data }` on success, or
 * `{ error }` — a ready-to-return 400 Response — on failure, so a route can
 * just do:
 *
 *   const parsed = await parseJsonBody(request);
 *   if ('error' in parsed) return parsed.error;
 *   const { category, delta } = parsed.data as { category?: string; delta?: number };
 */
export async function parseJsonBody(request: Request): Promise<{ data: unknown } | { error: Response }> {
  try {
    return { data: await request.json() };
  } catch {
    return { error: jsonError('Invalid JSON body') };
  }
}

/** The download response every "export as .csv" route returns. */
export function csvDownloadResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      // An explicit length avoids iOS Safari saving a 0-byte file for a
      // `download`-attribute link — see tandem-invoice.pdf.ts.
      'Content-Length': String(Buffer.byteLength(csv)),
    },
  });
}
