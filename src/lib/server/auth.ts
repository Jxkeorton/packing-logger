// Single shared-password gate for the whole app. Disabled entirely when
// APP_PASSWORD isn't set, so local dev needs no extra setup — it only takes
// effect once you set the env var (e.g. in Vercel's dashboard).
import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE = 'packing_auth';

export function authEnabled(): boolean {
  return Boolean(process.env.APP_PASSWORD);
}

/**
 * Deterministic from the password itself, so changing APP_PASSWORD
 * instantly invalidates every previously-issued cookie — no session store
 * needed.
 */
function expectedToken(): string | null {
  const password = process.env.APP_PASSWORD;
  if (!password) return null;
  return createHmac('sha256', password).update('packing-logger-session').digest('hex');
}

export function checkPassword(candidate: string): boolean {
  const password = process.env.APP_PASSWORD;
  if (!password) return false;
  const a = Buffer.from(candidate);
  const b = Buffer.from(password);
  // Buffers must be equal length for timingSafeEqual; a length mismatch is
  // already a "no match" so it's fine to fall back to false there.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function sessionToken(): string | null {
  return expectedToken();
}

export function isValidSession(cookieValue: string | undefined): boolean {
  const expected = expectedToken();
  if (!expected || !cookieValue) return false;
  const a = Buffer.from(cookieValue);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
