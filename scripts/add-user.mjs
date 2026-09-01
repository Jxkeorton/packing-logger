// Manage accounts on a shared, multi-user deployment (see
// src/lib/server/users.ts). There's no signup page on purpose — this is
// how an account gets created, run by whoever owns the deployment.
//
//   node --env-file=.env.friends scripts/add-user.mjs --add jane
//   node --env-file=.env.friends scripts/add-user.mjs --reset jane
//   node --env-file=.env.friends scripts/add-user.mjs --check jane
//   node --env-file=.env.friends scripts/add-user.mjs --list
//
// --add, --reset, and --check all prompt for a password on the terminal
// rather than taking it as an argument, so it never ends up sitting in
// shell history. --reset is for "I forgot it" / "it's not working" — it
// keeps the account's id (and so its existing ledgers) and only replaces
// the password. --check is read-only: it hashes what you type against
// the stored salt and says whether it matches, without changing
// anything — use it to tell "the password really doesn't match what's
// stored" apart from "something else is wrong" before reaching for
// --reset.
//
// Env it needs: R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
// — the shared deployment's bucket, not any one person's. AUTH_SECRET
// isn't needed here: it signs sessions at request time, and has nothing
// to do with writing users.json.
import { createInterface } from 'node:readline/promises';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { AwsClient } from 'aws4fetch';

const KEY_PREFIX = 'packing-logger';
const USERS_KEY = 'users.json';
// Must match src/lib/server/users.ts exactly — this script and the app
// hash passwords the same way, so a password set here verifies there.
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LENGTH = 64;

const args = process.argv.slice(2);

function required(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. See the header of this script for what it needs.`);
    process.exit(1);
  }
  return value;
}

const accountId = required('R2_ACCOUNT_ID');
const bucket = required('R2_BUCKET');
const r2 = new AwsClient({
  accessKeyId: required('R2_ACCESS_KEY_ID'),
  secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
  region: 'auto',
  service: 's3',
  retries: 2,
  initRetryMs: 100,
});
const baseUrl = process.env.R2_ENDPOINT
  ? `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${bucket}`
  : `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;
const usersUrl = `${baseUrl}/${KEY_PREFIX}/${USERS_KEY}`;

async function readUsers() {
  const response = await r2.fetch(usersUrl, { method: 'GET' });
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`R2 GET users.json: ${response.status} ${response.statusText}`);
  const parsed = JSON.parse(await response.text());
  return Array.isArray(parsed) ? parsed : [];
}

async function writeUsers(users) {
  const response = await r2.fetch(usersUrl, {
    method: 'PUT',
    body: JSON.stringify(users, null, 2),
    headers: { 'content-type': 'application/json' },
  });
  if (!response.ok) throw new Error(`R2 PUT users.json: ${response.status} ${response.statusText}`);
}

function hashPassword(password, salt) {
  return scryptSync(password, salt, KEY_LENGTH, SCRYPT_PARAMS).toString('hex');
}

async function promptPassword(question) {
  // No echo suppression here — this project has no TTY-raw-mode
  // dependency, and running it over `node --env-file=...` in a normal
  // terminal is a one-off, local, trusted action. Good enough for a
  // handful of friends' accounts; don't paste it somewhere it'll be logged.
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer;
}

async function addUser(username) {
  if (!username) {
    console.error('Usage: --add <username>');
    process.exit(1);
  }

  const users = await readUsers();
  const clean = username.trim().toLowerCase();
  if (users.some((u) => u.username?.trim().toLowerCase() === clean)) {
    console.error(`"${username}" already has an account. Bucket: ${bucket}.`);
    process.exit(1);
  }

  const password = await promptPassword(`Password for ${username} (min 8 characters): `);
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirm = await promptPassword('Confirm password: ');
  if (confirm !== password) {
    console.error('Passwords did not match — nothing saved.');
    process.exit(1);
  }

  const salt = randomBytes(16).toString('hex');
  const record = {
    id: randomUUID(),
    username: username.trim(),
    salt,
    hash: hashPassword(password, salt),
    createdAt: new Date().toISOString(),
  };

  await writeUsers([...users, record]);
  console.log(`Added ${username} to ${bucket}. They can sign in now.`);
  console.log(`id: ${record.id}`);
  console.log(`(their ledgers will live at packing-logger/users/${record.id}/... in this bucket)`);
}

async function checkPassword(username) {
  if (!username) {
    console.error('Usage: --check <username>');
    process.exit(1);
  }

  const users = await readUsers();
  const clean = username.trim().toLowerCase();
  const match = users.find((u) => u.username?.trim().toLowerCase() === clean);
  if (!match) {
    console.error(`No account for "${username}". Bucket: ${bucket}.`);
    process.exit(1);
  }

  const password = await promptPassword(`Password to check for ${match.username}: `);
  const candidateHash = hashPassword(password, match.salt);
  console.log(candidateHash === match.hash ? '✓ Matches what is stored.' : '✗ Does NOT match what is stored.');
}

async function resetPassword(username) {
  if (!username) {
    console.error('Usage: --reset <username>');
    process.exit(1);
  }

  const users = await readUsers();
  const clean = username.trim().toLowerCase();
  const index = users.findIndex((u) => u.username?.trim().toLowerCase() === clean);
  if (index === -1) {
    console.error(`No account for "${username}". Bucket: ${bucket}.`);
    process.exit(1);
  }

  const password = await promptPassword(`New password for ${users[index].username} (min 8 characters): `);
  if (password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }
  const confirm = await promptPassword('Confirm password: ');
  if (confirm !== password) {
    console.error('Passwords did not match — nothing saved.');
    process.exit(1);
  }

  // Same id, username, and createdAt — only the salt/hash change, so the
  // account keeps the same storage key and doesn't lose its ledgers the
  // way deleting and re-adding it would.
  const salt = randomBytes(16).toString('hex');
  const next = [...users];
  next[index] = { ...users[index], salt, hash: hashPassword(password, salt) };

  await writeUsers(next);
  console.log(`Reset ${users[index].username}'s password. They can sign in with it now.`);
}

async function listUsers() {
  const users = await readUsers();
  console.log(`Bucket: ${bucket}\n`);
  if (users.length === 0) {
    console.log('  (no accounts yet)');
    return;
  }
  for (const u of users) {
    // The id is what actually matters here: it's the storage.ts key
    // segment (users/<id>/logbook.csv, ...), so it's what you copy data
    // into and what a support question about "whose bucket folder is
    // this" gets answered with — not the username, which is just display.
    console.log(`  ${(u.username ?? '?').padEnd(20)} ${(u.id ?? '?').padEnd(38)} ${u.createdAt ?? ''}`);
  }
}

async function main() {
  if (args.includes('--list')) return listUsers();

  const addIndex = args.indexOf('--add');
  if (addIndex !== -1) return addUser(args[addIndex + 1]);

  const resetIndex = args.indexOf('--reset');
  if (resetIndex !== -1) return resetPassword(args[resetIndex + 1]);

  const checkIndex = args.indexOf('--check');
  if (checkIndex !== -1) return checkPassword(args[checkIndex + 1]);

  console.error('Usage:\n  --add <username>\n  --reset <username>\n  --check <username>\n  --list');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
