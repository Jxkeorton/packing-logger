// One-off: copy this app's stored ledgers from Vercel Blob (or from a
// local data/ folder) into a Cloudflare R2 bucket.
//
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs --from=data
//   node --env-file=.env.migrate scripts/migrate-to-r2.mjs --force
//
// Env it needs:
//   R2_ACCOUNT_ID, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
//   BLOB_READ_WRITE_TOKEN   (only for --from=blob; the OIDC path the
//                            deployed app uses works *inside* a Vercel
//                            function, not from your laptop, so take a
//                            read-write token from the store's dashboard)
//
// --from=data reads ./data instead, which is the way through if the Blob
// API is still rate-blocked: download the files from the Blob dashboard
// into data/ and copy from there.
//
// Existing objects are never overwritten without --force, and every object
// written is read back and compared before the script calls itself done.
// This moves the only copy of a jump logbook; it should be boring.
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

const PREFIX = 'packing-logger';
const DATA_DIR = path.join(process.cwd(), 'data');

const args = process.argv.slice(2);
const force = args.includes('--force');
const from = (args.find((a) => a.startsWith('--from=')) ?? '--from=blob').slice('--from='.length);

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

/** Every ledger the app writes, as a fallback when listing isn't available. */
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

async function readFromBlob() {
  const { list, get } = await import('@vercel/blob');
  const token = required('BLOB_READ_WRITE_TOKEN');

  // One list call covers anything KNOWN_KEYS doesn't know about — a file
  // added since this script was written shouldn't be left behind.
  const { blobs } = await list({ prefix: `${PREFIX}/`, token });
  const names = blobs.map((b) => b.pathname.slice(`${PREFIX}/`.length)).filter(Boolean);
  const wanted = names.length > 0 ? names : KNOWN_KEYS;
  if (names.length === 0) console.warn('Blob list came back empty — falling back to the known key list.');

  const out = new Map();
  for (const name of wanted) {
    const result = await get(`${PREFIX}/${name}`, { access: 'private', useCache: false, token });
    if (!result || result.statusCode !== 200) {
      console.warn(`  skipped ${name} — not in the Blob store`);
      continue;
    }
    out.set(name, await new Response(result.stream).text());
  }
  return out;
}

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
  const response = await r2.fetch(`${baseUrl}/${PREFIX}/${name}`, { method: 'GET' });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`R2 GET ${name}: ${response.status} ${response.statusText}`);
  return response.text();
}

async function r2Put(name, body) {
  const response = await r2.fetch(`${baseUrl}/${PREFIX}/${name}`, {
    method: 'PUT',
    body,
    headers: { 'content-type': contentTypeFor(name) },
  });
  if (!response.ok) throw new Error(`R2 PUT ${name}: ${response.status} ${response.statusText}`);
}

async function main() {
  console.log(`Source: ${from === 'data' ? DATA_DIR : 'Vercel Blob'}`);
  console.log(`Target: ${bucket}/${PREFIX}/ on account ${accountId}\n`);

  const source = from === 'data' ? await readFromData() : await readFromBlob();
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
      console.log(`  ${name}: already in R2 (${existing.length} bytes) — left alone, pass --force to replace`);
      skipped += 1;
      continue;
    }

    await r2Put(name, content);
    const readBack = await r2Get(name);
    if (readBack !== content) {
      console.error(`  ${name}: FAILED verification — wrote ${content.length} bytes, read back ${readBack?.length ?? 0}`);
      process.exit(1);
    }
    console.log(`  ${name}: copied and verified (${content.length} bytes)`);
    copied += 1;
  }

  console.log(`\nDone — ${copied} copied, ${skipped} left alone.`);
  if (copied > 0) {
    console.log('Set R2_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY in Vercel to switch the app over.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
