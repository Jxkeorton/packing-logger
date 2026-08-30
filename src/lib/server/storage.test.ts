// The R2 branch of storage.ts, against a stubbed fetch — the point isn't
// to re-test aws4fetch's signing but to pin the things that would quietly
// corrupt a ledger: which URL a key lands on, and the difference between
// "this file doesn't exist yet" and "the store is broken".
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ENV = {
  R2_ACCOUNT_ID: 'acct123',
  R2_BUCKET: 'packing-logger',
  R2_ACCESS_KEY_ID: 'key',
  R2_SECRET_ACCESS_KEY: 'secret',
};

const calls: Request[] = [];
let respond: (request: Request) => Response;

async function loadStorage() {
  for (const [key, value] of Object.entries(ENV)) vi.stubEnv(key, value);
  vi.resetModules();
  return import('./storage');
}

beforeEach(() => {
  calls.length = 0;
  respond = () => new Response('', { status: 200 });
  vi.stubGlobal('fetch', async (input: Request | string, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    calls.push(request);
    return respond(request);
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('the R2 backend', () => {
  it('is chosen over Vercel Blob once its env vars are set', async () => {
    const { storageBackend } = await loadStorage();
    expect(storageBackend()).toBe('r2');
  });

  it('reads a key from the app prefix inside the bucket, signed', async () => {
    const { readText } = await loadStorage();
    respond = () => new Response('date,category\n', { status: 200 });

    expect(await readText('tandem-jumps.csv')).toBe('date,category\n');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://acct123.r2.cloudflarestorage.com/packing-logger/packing-logger/tandem-jumps.csv');
    expect(calls[0].method).toBe('GET');
    expect(calls[0].headers.get('authorization')).toMatch(/^AWS4-HMAC-SHA256 /);
  });

  it('treats a 404 as "not written yet", the same as a missing local file', async () => {
    const { readText } = await loadStorage();
    respond = () => new Response('', { status: 404 });
    expect(await readText('logbook.csv')).toBeNull();
  });

  it('throws rather than reporting an empty ledger when the store errors', async () => {
    // The dangerous case: every caller reads, edits, then writes the whole
    // file back. A null here would have it write a fresh empty logbook
    // over a real one.
    const { readText } = await loadStorage();
    respond = () => new Response('', { status: 500, statusText: 'Internal Server Error' });
    await expect(readText('logbook.csv')).rejects.toThrow(/R2 read of logbook.csv failed: 500/);
  });

  it('gives up on a 5xx quickly instead of aws4fetch\'s ten backed-off retries', async () => {
    // Left at the library default this takes ~a minute, which in a
    // serverless function means the request is killed with nothing shown.
    const { readText } = await loadStorage();
    respond = () => new Response('', { status: 503, statusText: 'Service Unavailable' });

    const startedAt = Date.now();
    await expect(readText('logbook.csv')).rejects.toThrow();
    expect(calls.length).toBeLessThanOrEqual(3);
    expect(Date.now() - startedAt).toBeLessThan(2000);
  });

  it('writes with the content type the file extension implies', async () => {
    const { writeText } = await loadStorage();
    await writeText('logbook-settings.json', '{}');
    await writeText('logbook.csv', 'date\n');

    expect(calls.map((c) => c.method)).toEqual(['PUT', 'PUT']);
    expect(calls[0].headers.get('content-type')).toBe('application/json');
    expect(calls[1].headers.get('content-type')).toBe('text/csv');
    expect(await calls[1].text()).toBe('date\n');
  });

  it('surfaces a failed write instead of losing it silently', async () => {
    const { writeText } = await loadStorage();
    respond = () => new Response('', { status: 403, statusText: 'Forbidden' });
    await expect(writeText('logbook.csv', 'date\n')).rejects.toThrow(/R2 write of logbook.csv failed: 403/);
  });
});
