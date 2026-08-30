// Small key/value-ish text storage, backed by:
//   - Cloudflare R2, in production. Vercel Blob was the previous home and
//     is gone: its Hobby allowance is 2,000 writes and 10,000 reads a
//     *month*, which a day of manifest polling can spend, against R2's
//     1M/10M. Same shape of store — named text objects — so only this
//     file ever knew the difference.
//   - the local `data/` folder otherwise, so `npm run dev` needs no cloud setup.
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { AwsClient } from 'aws4fetch';

const DATA_DIR = path.join(process.cwd(), 'data');
const KEY_PREFIX = 'packing-logger';

/**
 * Which user's ledgers the current request is reading and writing, for a
 * multi-user deployment (see $lib/server/users.ts). One deployment, one
 * bucket, many people — so `logbook.csv` alone would collide between
 * them; keyed by user id it becomes `users/<id>/logbook.csv`.
 *
 * A single-tenant deployment (Aimee's, Mila's — one bucket, one person,
 * no login) never calls `runAsUser`, so this is always empty there and
 * every key is exactly what it always was. Nothing about that setup
 * changes or needs migrating.
 *
 * AsyncLocalStorage rather than a module-level variable: a serverless
 * runtime can share a warm instance across requests, and a plain variable
 * would let one request's user id leak into another's concurrently
 * in-flight read. ALS keeps the value scoped to the async chain hooks.ts
 * started it on.
 */
const userScope = new AsyncLocalStorage<{ userId: string }>();

/** Run `fn` with every readText/writeText call inside it scoped to `userId`'s own ledgers. */
export function runAsUser<T>(userId: string, fn: () => T): T {
  return userScope.run({ userId }, fn);
}

function scopedKey(name: string): string {
  const scope = userScope.getStore();
  return scope ? `${KEY_PREFIX}/users/${scope.userId}/${name}` : `${KEY_PREFIX}/${name}`;
}

const r2 = readR2Config();

function readR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_BUCKET;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !bucket || !accessKeyId || !secretAccessKey) return null;
  return {
    // Region is always "auto" on R2; it's part of the SigV4 signature, not a location.
    //
    // `retries` is pinned because aws4fetch defaults to *10*, backing off
    // exponentially on any 5xx — about a minute of silent waiting inside a
    // serverless function that will be killed before it finishes. Two
    // quick goes absorbs a blip; anything worse should surface as an error
    // the page can show.
    client: new AwsClient({
      accessKeyId,
      secretAccessKey,
      region: 'auto',
      service: 's3',
      retries: 2,
      initRetryMs: 100,
    }),
    // R2_ENDPOINT overrides the derived host. Unset in production; it's
    // there so the R2 path can be exercised against a local S3 stub (or
    // MinIO) without a bucket.
    baseUrl: process.env.R2_ENDPOINT
      ? `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${bucket}`
      : `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  };
}

/**
 * Falling back to `data/` on a deployed instance would be silent data
 * loss: the filesystem there is ephemeral and per-invocation, so every
 * ledger would read empty and every jump logged would vanish with the
 * function. A missing env var should stop the app, not quietly empty it.
 */
function assertBackend(): void {
  if (!r2 && process.env.VERCEL) {
    throw new Error(
      'No R2 credentials on a deployed instance — set R2_ACCOUNT_ID, R2_BUCKET, ' +
        'R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY. Refusing to fall back to the ' +
        'ephemeral local filesystem, which would read as an empty logbook.',
    );
  }
}

function r2Url(name: string): string {
  return `${r2!.baseUrl}/${scopedKey(name)}`;
}

/** `data/<name>` normally, `data/users/<id>/<name>` inside runAsUser — same shape as the R2 key. */
function localPath(name: string): string {
  const scope = userScope.getStore();
  return scope ? path.join(DATA_DIR, 'users', scope.userId, name) : path.join(DATA_DIR, name);
}

async function ensureParentDir(filePath: string) {
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
}

function contentTypeFor(name: string): string {
  return name.endsWith('.json') ? 'application/json' : 'text/csv';
}

/** Read a stored text file, or null if it doesn't exist yet. */
export async function readText(name: string): Promise<string | null> {
  assertBackend();

  if (r2) {
    // no-store because every caller here is reading a ledger it may be
    // about to rewrite — a cached copy would mean writing back stale rows.
    const response = await r2.client.fetch(r2Url(name), { method: 'GET', cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) {
      // Deliberately not `return null`: "missing" and "the store is having
      // a bad day" must not look alike here. A caller told a ledger is
      // empty will happily write a fresh one over the top of it.
      throw new Error(`R2 read of ${name} failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  const filePath = localPath(name);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf-8');
}

/** Write (or overwrite) a stored text file. */
export async function writeText(name: string, content: string): Promise<void> {
  assertBackend();

  if (r2) {
    const response = await r2.client.fetch(r2Url(name), {
      method: 'PUT',
      body: content,
      headers: { 'content-type': contentTypeFor(name) },
    });
    if (!response.ok) {
      throw new Error(`R2 write of ${name} failed: ${response.status} ${response.statusText}`);
    }
    return;
  }

  const filePath = localPath(name);
  await ensureParentDir(filePath);
  await writeFile(filePath, content, 'utf-8');
}

/** Which backend is live — for the migration script and a settings-screen readout. */
export function storageBackend(): 'r2' | 'local' {
  return r2 ? 'r2' : 'local';
}
