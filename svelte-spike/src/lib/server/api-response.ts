// Direct port of the main app's lib/api-response.ts — still needed for
// the handful of routes that aren't form actions (the CSV/PDF export
// downloads, and the three standalone JSON endpoints — /api/state,
// /api/set-day, /api/tandem-set-day — that have no UI in the main app
// either; see that app's session notes for why they exist without one).
// Form actions don't need this at all: `fail(status, data)` and a plain
// return already cover every case those handlers have.

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function jsonOk(data: unknown): Response {
  return jsonResponse(data, 200);
}

export function jsonError(message: string, status = 400): Response {
  return jsonResponse({ error: message }, status);
}

export function csvDownloadResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(Buffer.byteLength(csv)),
    },
  });
}
