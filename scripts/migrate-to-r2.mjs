// Load a bucket with this app's ledgers, and check what's in one.
//
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs --list
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs --cat=logbook.csv
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs --user=<id>
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs --force
//
// --list prints what the bucket holds, with sizes, and flags any ledger
// that's missing. --cat prints one ledger's contents. Run both per bucket
// before deleting anything upstream: "the migration said OK", "the data
// is in the bucket" and "it's the *right* data" are three different
// claims, and only the last one is worth anything.
//
// Without --list it copies ./data/*.{csv,json} into the bucket. That was
// the Vercel Blob migration route (download from the Blob dashboard into
// data/, copy up) and is now the way to restore a backup into a fresh
// bucket, or to seed a friend's folder on a shared multi-user deployment
// — add --user=<id> and every key lands under users/<id>/ instead of the
// bucket root. The direct Blob reader was dropped with the @vercel/blob
// dependency once the migration was done — `git log -- scripts/` has it
// if it's ever needed again.
//
// Env it needs:
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//
// Existing objects are never overwritten without --force, and every object
// written is read back and compared before the script calls itself done.
// This moves the only copy of a jump logbook; it should be boring.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

const PREFIX = 'packing-logger';

function key(name) {
  return userId ? `${PREFIX}/users/${userId}/${name}` : `${PREFIX}/${name}`;
}
const DATA_DIR = path.join(process.cwd(), 'data');

const args = process.argv.slice(2);
const force = args.includes('--force');
const listOnly = args.includes('--list');
const catKey = (args.find((a) => a.startsWith('--cat=')) ?? '').slice('--cat='.length);
// Nests every key under users/<id>/ instead of the bucket root — the same
// shape src/lib/server/storage.ts uses for a signed-in user on a shared,
// multi-user deployment. Get the id from add-user.mjs's --add or --list.
const userId = (args.find((a) => a.startsWith('--user=')) ?? '').slice('--user='.length);

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
});
// R2_ENDPOINT overrides the derived host, so the whole copy can be
// rehearsed against a local S3 stub (or MinIO) before it's pointed at the
// real bucket holding the only copy of a logbook.
const baseUrl = process.env.R2_ENDPOINT
  ? `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${bucket}`
  : `https://${accountId}.r2.cloudflarestorage.com/${bucket}`;

const contentTypeFor = (name) => (name.endsWith('.json') ? 'application/json' : 'text/csv');

/** Every ledger the app writes — what a fully-migrated bucket should hold. */
const KNOWN_KEYS = [
  'state.json',
  'packing-log.csv',
  'pack-times.json',
  'tandem-jumps.csv',
  'invoice-settings.json',
  'logbook.csv',
  'logbook-settings.json',
  'burble-sync.json',
];

async function readFromData() {
  if (!existsSync(DATA_DIR)) {
    console.error(`No data/ folder at ${DATA_DIR}.`);
    process.exit(1);
  }
  const out = new Map();
  for (const entry of await readdir(DATA_DIR)) {
    if (!entry.endsWith('.csv') && !entry.endsWith('.json')) continue;
    out.set(entry, await readFile(path.join(DATA_DIR, entry), 'utf-8'));
  }
  return out;
}

async function r2Get(name) {
  const response = await r2.fetch(`${baseUrl}/${key(name)}`, { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 GET ${name}: ${response.status} ${response.statusText}`);
  return response.text();
}

/** One page of the bucket's contents is plenty: this app stores eight files. */
async function r2List() {
  const prefix = userId ? `${PREFIX}/users/${userId}/` : `${PREFIX}/`;
  const url = `${baseUrl}?list-type=2&prefix=${encodeURIComponent(prefix)}`;
  const response = await r2.fetch(url, { method: 'GET' });
  if (!response.ok) throw new Error(`R2 LIST: ${response.status} ${response.statusText}`);
  const xml = await response.text();
  // Parsing S3's XML with a regex is fine for a listing of eight keys and
  // avoids an XML dependency for one call.
  return [...xml.matchAll(/<Contents>[\s\S]*?<\/Contents>/g)].map((match) => ({
    key: (match[0].match(/<Key>([^<]*)<\/Key>/) ?? [, ''])[1].slice(prefix.length),
    size: Number((match[0].match(/<Size>(\d+)<\/Size>/) ?? [, '0'])[1]),
  }));
}

async function r2Put(name, body) {
  const response = await r2.fetch(`${baseUrl}/${key(name)}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': contentTypeFor(name) },
  });
  if (!response.ok) throw new Error(`R2 PUT ${name}: ${response.status} ${response.statusText}`);
}

async function listBucket() {
  console.log(`Bucket: ${bucket}/${userId ? `${PREFIX}/users/${userId}/` : `${PREFIX}/`} on account ${accountId}\n`);
  const objects = await r2List();
  if (objects.length === 0) {
    console.log('  (empty)');
  }
  for (const { key, size } of objects.sort((a, b) => a.key.localeCompare(b.key))) {
    console.log(`  ${key.padEnd(24)} ${String(size).padStart(8)} bytes`);
  }

  // burble-sync.json only exists once the manifest sync has run, so a
  // missing one is normal rather than a failed copy — say so instead of
  // sounding an alarm that sends someone hunting for lost data.
  const present = new Set(objects.map((o) => o.key));
  const missing = KNOWN_KEYS.filter((k) => !present.has(k));
  if (missing.length > 0) {
    console.log(`\nNot in this bucket: ${missing.join(', ')}`);
    console.log('Expected only if that ledger was never written on this instance.');
  } else {
    console.log('\nEvery ledger this app writes is present.');
  }
}

async function main() {
  if (catKey) {
    const body = await r2Get(catKey);
    if (body === null) {
      console.error(`${catKey} is not in ${bucket}.`);
      process.exit(1);
    }
    process.stdout.write(body);
    return;
  }
  if (listOnly) return listBucket();

  console.log(`Source: ${DATA_DIR}`);
  console.log(`Target: ${bucket}/${userId ? `${PREFIX}/users/${userId}/` : `${PREFIX}/`} on account ${accountId}\n`);

  const source = await readFromData();
  if (source.size === 0) {
    console.error('Nothing found to copy — stopping rather than reporting an empty success.');
    process.exit(1);
  }

  let copied = 0;
  let skipped = 0;
  for (const [name, content] of source) {
    const existing = await r2Get(name);
    if (existing !== null && !force) {
      // Overwriting here would destroy whatever the live app has already
      // written to R2, which is worse than stopping and being asked twice.
      console.log(`  ${name}: already in R2 (${Buffer.byteLength(existing)} bytes) — left alone, pass --force to replace`);
      skipped += 1;
      continue;
    }

    await r2Put(name, content);
    const readBack = await r2Get(name);
    if (readBack !== content) {
      console.error(
        `  ${name}: FAILED verification — wrote ${Buffer.byteLength(content)} bytes, ` +
          `read back ${readBack === null ? 'nothing' : `${Buffer.byteLength(readBack)} bytes`}`,
      );
      process.exit(1);
    }
    // Byte length, not string length — these ledgers are full of em dashes
    // and accented names, and a size that disagrees with what --list
    // reports sends someone looking for a corruption that isn't there.
    console.log(`  ${name}: copied and verified (${Buffer.byteLength(content)} bytes)`);
    copied += 1;
  }

  console.log(`\nDone — ${copied} copied, ${skipped} left alone.`);
  console.log('Run again with --list to see what the bucket now holds.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
