// Accounts for a shared, multi-user deployment — the "friends" case,
// where several people share one Vercel project and one R2 bucket instead
// of each getting their own (see storage.ts's runAsUser). A single-tenant
// deployment (one person, one bucket, the APP_PASSWORD gate) never touches
// this file.
//
// Deliberately not self-serve: there is no signup route. Accounts are
// created with scripts/add-user.mjs, by whoever owns the deployment,
// which is the same trust model the old shared-password gate had —
// one owner decides who gets in — just extended to several named people
// instead of one shared secret.
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { readText, writeText } from './storage';

const USERS_KEY = 'users.json';

// Explicit rather than Node's defaults: scrypt's cost parameters are part
// of what makes a hash reproducible, and add-user.mjs (a separate script,
// not this module) hashes new passwords with these same three numbers.
// Baking them in here means the two can never quietly drift apart.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;
const KEY_LENGTH = 64;

export interface UserRecord {
  id: string; // random, stable — this is the storage key segment, so it never changes even if username does
  username: string;
  salt: string; // hex
  hash: string; // hex, scrypt(password, salt)
  createdAt: string; // ISO
}

async function readUsers(): Promise<UserRecord[]> {
  const raw = await readText(USERS_KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (u): u is UserRecord =>
        u &&
        typeof u.id === 'string' &&
        typeof u.username === 'string' &&
        typeof u.salt === 'string' &&
        typeof u.hash === 'string',
    );
  } catch {
    return [];
  }
}

async function writeUsers(users: UserRecord[]): Promise<void> {
  await writeText(USERS_KEY, JSON.stringify(users, null, 2));
}

function normaliseUsername(username: string): string {
  return username.trim().toLowerCase();
}

export function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS).toString('hex');
}

/** For scripts/add-user.mjs — never called from a request. */
export async function createUser(username: string, password: string): Promise<UserRecord> {
  const clean = normaliseUsername(username);
  if (!clean) throw new Error('Username cannot be empty.');
  if (password.length < 8) throw new Error('Password must be at least 8 characters.');

  const users = await readUsers();
  if (users.some((u) => normaliseUsername(u.username) === clean)) {
    throw new Error(`"${username}" already has an account.`);
  }

  const salt = randomBytes(16).toString('hex');
  const record: UserRecord = {
    id: randomUUID(),
    username: username.trim(),
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };

  await writeUsers([...users, record]);
  return record;
}

/**
 * For scripts/add-user.mjs's --reset. Replaces the password only — id,
 * username, and createdAt are untouched, so the account keeps the same
 * storage key (users/<id>/...) and doesn't lose any existing ledgers the
 * way deleting and re-adding the account would.
 */
export async function resetPassword(username: string, newPassword: string): Promise<UserRecord> {
  if (newPassword.length < 8) throw new Error('Password must be at least 8 characters.');

  const users = await readUsers();
  const clean = normaliseUsername(username);
  const index = users.findIndex((u) => normaliseUsername(u.username) === clean);
  if (index === -1) throw new Error(`No account for "${username}".`);

  const salt = randomBytes(16).toString('hex');
  const updated: UserRecord = { ...users[index], salt, hash: hashPassword(newPassword, salt) };
  const next = [...users];
  next[index] = updated;
  await writeUsers(next);
  return updated;
}

/** For scripts/add-user.mjs's --list. */
export async function listUsers(): Promise<Pick<UserRecord, 'id' | 'username' | 'createdAt'>[]> {
  return (await readUsers()).map(({ id, username, createdAt }) => ({ id, username, createdAt }));
}

/**
 * Checked on every login attempt. Constant-time on the hash comparison;
 * a wrong username still runs a dummy scrypt so the response time doesn't
 * itself reveal which usernames exist.
 */
export async function verifyCredentials(username: string, password: string): Promise<UserRecord | null> {
  const users = await readUsers();
  const clean = normaliseUsername(username);
  const match = users.find((u) => normaliseUsername(u.username) === clean);

  const salt = match?.salt ?? randomBytes(16).toString('hex');
  const candidateHash = hashPassword(password, salt);
  if (!match) return null;

  const a = Buffer.from(candidateHash, 'hex');
  const b = Buffer.from(match.hash, 'hex');
  const equal = a.length === b.length && timingSafeEqual(a, b);
  return equal ? match : null;
}
