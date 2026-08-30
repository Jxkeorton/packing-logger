// Two independent gates, chosen by which env var is set on a deployment —
// never both at once:
//
//   APP_PASSWORD  single shared password, one person per deployment. The
//                 original design: everyone who deploys their own copy of
//                 this app (Aimee, Mila, ...) uses this, unchanged.
//
//   AUTH_SECRET   named accounts on one shared deployment (see
//                 $lib/server/users.ts) — for friends who'd rather sign
//                 into one app than each stand up their own Vercel
//                 project and R2 bucket. The session cookie carries which
//                 user is signed in, and hooks.server.ts uses that to
//                 scope every ledger read/write to their own ledgers
//                 (storage.ts's runAsUser).
//
// Neither var set: no gate at all, which is also the default for local
// dev — `npm run dev` needs no auth setup either way.
import { createHmac, timingSafeEqual } from 'node:crypto';

export const AUTH_COOKIE = 'packing_auth';

export type AuthMode = 'single' | 'multi' | 'none';

export function authMode(): AuthMode {
  if (process.env.AUTH_SECRET) return 'multi';
  if (process.env.APP_PASSWORD) return 'single';
  return 'none';
}

export function authEnabled(): boolean {
  return authMode() !== 'none';
}

// --- single shared password -------------------------------------------

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

// --- named accounts ------------------------------------------------------

/**
 * `<userId>.<hmac>` — a user id the client can't forge, without needing a
 * server-side session store. Whoever holds AUTH_SECRET can produce a
 * cookie for any user id; that secret never leaves the deployment's env
 * vars, same trust boundary as APP_PASSWORD.
 */
export function signUserSession(userId: string): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const signature = createHmac('sha256', secret).update(userId).digest('hex');
  return `${userId}.${signature}`;
}

/** The signed-in user's id, or null if the cookie is missing, malformed, or forged. */
export function verifyUserSession(cookieValue: string | undefined): string | null {
  const secret = process.env.AUTH_SECRET;
  if (!secret || !cookieValue) return null;

  const dot = cookieValue.lastIndexOf('.');
  if (dot === -1) return null;
  const userId = cookieValue.slice(0, dot);
  const signature = cookieValue.slice(dot + 1);
  if (!userId) return null;

  const expected = createHmac('sha256', secret).update(userId).digest('hex');
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  return valid ? userId : null;
}
