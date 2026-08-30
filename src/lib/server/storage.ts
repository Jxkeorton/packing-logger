// Small key/value-ish text storage, backed by:
//   - Cloudflare R2, when R2_* env vars are set. The current home: Vercel
//     Blob's Hobby allowance is 2,000 writes and 10,000 reads a *month*,
//     which this app can burn through in a day of manifest polling, while
//     R2's free tier is 1M/10M. Same shape of store either way — named
//     text objects — so only this file knows the difference.
//   - Vercel Blob, when deployed there and a store is connected to the
//     project. The @vercel/blob SDK authenticates either via a static
//     BLOB_READ_WRITE_TOKEN, or (the current default when you "Connect"
//     a store in the dashboard) via BLOB_STORE_ID plus a short-lived OIDC
//     token Vercel injects into the function at request time — so BLOB_STORE_ID
//     is the reliable signal that a store is wired up, not the token itself.
//     Kept working so unsetting the R2 vars falls straight back to it.
//   - the local `data/` folder otherwise, so `npm run dev` needs no cloud setup.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';
import { AwsClient } from 'aws4fetch';

const DATA_DIR = path.join(process.cwd(), 'data');
const BLOB_PREFIX = 'packing-logger';

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN || process.env.BLOB_STORE_ID);

/**
 * R2 wins when it's configured, so the switch-over (and the way back) is
 * setting or clearing env vars rather than a deploy. All four are required:
 * a half-configured store should fall back to Blob loudly-by-behaviour
 * rather than fail every read at runtime.
 */
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
    // MinIO) without a bucket, which is how this was checked before it
    // ever pointed at the real one.
    baseUrl: process.env.R2_ENDPOINT
      ? `${process.env.R2_ENDPOINT.replace(/\/$/, '')}/${bucket}`
      : `https://${accountId}.r2.cloudflarestorage.com/${bucket}`,
  };
}

function r2Url(name: string): string {
  return `${r2!.baseUrl}/${BLOB_PREFIX}/${name}`;
}

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

function contentTypeFor(name: string): string {
  return name.endsWith('.json') ? 'application/json' : 'text/csv';
}

/** Read a stored text file, or null if it doesn't exist yet. */
export async function readText(name: string): Promise<string | null> {
  if (r2) {
    // no-store because every caller here is reading a ledger it may be
    // about to rewrite — a cached copy would mean writing back stale rows.
    const response = await r2!.client.fetch(r2Url(name), { method: 'GET', cache: 'no-store' });
    if (response.status === 404) return null;
    if (!response.ok) {
      // Deliberately not `return null`: "missing" and "the store is having
      // a bad day" must not look alike here. A caller told a ledger is
      // empty will happily write a fresh one over the top of it.
      throw new Error(`R2 read of ${name} failed: ${response.status} ${response.statusText}`);
    }
    return response.text();
  }

  if (useBlob) {
    const result = await get(`${BLOB_PREFIX}/${name}`, { access: 'private', useCache: false });
    if (!result || result.statusCode !== 200) return null;
    return new Response(result.stream).text();
  }

  const filePath = path.join(DATA_DIR, name);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf-8');
}

/** Write (or overwrite) a stored text file. */
export async function writeText(name: string, content: string): Promise<void> {
  if (r2) {
    const response = await r2!.client.fetch(r2Url(name), {
      method: 'PUT',
      body: content,
      headers: { 'content-type': contentTypeFor(name) },
    });
    if (!response.ok) {
      throw new Error(`R2 write of ${name} failed: ${response.status} ${response.statusText}`);
    }
    return;
  }

  if (useBlob) {
    await put(`${BLOB_PREFIX}/${name}`, content, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: contentTypeFor(name),
    });
    return;
  }

  await ensureDataDir();
  await writeFile(path.join(DATA_DIR, name), content, 'utf-8');
}

/** Which backend is live — for the migration script and a settings-screen readout. */
export function storageBackend(): 'r2' | 'blob' | 'local' {
  if (r2) return 'r2';
  if (useBlob) return 'blob';
  return 'local';
}
