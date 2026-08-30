// Manage accounts on a shared, multi-user deployment (see
// src/lib/server/users.ts). There's no signup page on purpose — this is
// how an account gets created, run by whoever owns the deployment.
//
//   node --env-file=.env.friends scripts/add-user.mjs --add jane
//   node --env-file=.env.friends scripts/add-user.mjs --list
//
// --add prompts for a password on the terminal rather than taking it as
// an argument, so it never ends up sitting in shell history.
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
}

async function listUsers() {
  const users = await readUsers();
  console.log(`Bucket: ${bucket}\n`);
  if (users.length === 0) {
    console.log('  (no accounts yet)');
    return;
  }
  for (const u of users) {
    console.log(`  ${(u.username ?? '?').padEnd(20)} ${u.createdAt ?? ''}`);
  }
}

async function main() {
  if (args.includes('--list')) return listUsers();

  const addIndex = args.indexOf('--add');
  if (addIndex !== -1) return addUser(args[addIndex + 1]);

  console.error('Usage:\n  --add <username>\n  --list');
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
