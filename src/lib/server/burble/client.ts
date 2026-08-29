// HTTP half of the Burble manifest sync: get a session cookie, then ask
// for the loads. See NOTES.md for how this endpoint was found and why it
// behaves the way it does.
import type { BurbleLoadsResponse } from '../../burble';

const HOST = 'https://eu-displays.burblesoft.com';
const LOADS_URL = `${HOST}/ajax_dzm2_frontend_jumpermanifestpublic`;

// The display is a wall screen; nothing here identifies us beyond looking
// like an ordinary browser, which is what the endpoint expects.
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

const TIMEOUT_MS = 10_000;

export class BurbleError extends Error {}

function withTimeout(): AbortSignal {
  return AbortSignal.timeout(TIMEOUT_MS);
}

/**
 * Get a `burblesoft` session cookie that remembers this dz_id.
 *
 * `/jmp?dz_id=N` answers 307 to `/jmp` *without* the query string, having
 * stashed the dropzone in the session — so the cookie on that one redirect
 * response is the whole bootstrap. `redirect: 'manual'` because following
 * it would discard the Set-Cookie we came for.
 */
async function fetchSessionCookie(dzId: string): Promise<string> {
  const response = await fetch(`${HOST}/jmp?dz_id=${encodeURIComponent(dzId)}`, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'User-Agent': USER_AGENT },
    signal: withTimeout(),
  });

  const cookies = response.headers.getSetCookie();
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    if (pair?.startsWith('burblesoft=')) return pair;
  }
  throw new BurbleError('Burble did not issue a session cookie — the dropzone id may be wrong.');
}

/**
 * Fetch the current board.
 *
 * Called without a valid session the endpoint doesn't error — it answers
 * 200 with a decoy `{"success": false, ...}` payload advertising the
 * BurbleMe app. So "no `loads` key" is the real failure signal, and the
 * fix is always the same: get a fresh cookie and ask once more.
 */
export async function fetchLoads(dzId: string, existingCookie?: string): Promise<{ response: BurbleLoadsResponse; cookie: string }> {
  let cookie = existingCookie ?? (await fetchSessionCookie(dzId));
  let response = await requestWithCookie(dzId, cookie);

  if (!Array.isArray(response.loads)) {
    cookie = await fetchSessionCookie(dzId);
    response = await requestWithCookie(dzId, cookie);
  }

  if (!Array.isArray(response.loads)) {
    throw new BurbleError('Burble rejected the session — check the dropzone id.');
  }

  return { response, cookie };
}

async function requestWithCookie(dzId: string, cookie: string): Promise<BurbleLoadsResponse> {
  const response = await fetch(LOADS_URL, {
    method: 'POST',
    headers: {
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie,
    },
    body: new URLSearchParams({ action: 'getLoads', dz_id: dzId }).toString(),
    signal: withTimeout(),
  });
  if (!response.ok) throw new BurbleError(`Burble returned HTTP ${response.status}.`);
  return (await response.json()) as BurbleLoadsResponse;
}
