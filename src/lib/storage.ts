// Small key/value-ish text storage, backed by:
//   - Vercel Blob, when deployed there (BLOB_READ_WRITE_TOKEN is set automatically
//     once a Blob store is connected to the project)
//   - the local `data/` folder otherwise, so `npm run dev` needs no cloud setup.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { get, put } from '@vercel/blob';

const DATA_DIR = path.join(process.cwd(), 'data');
const BLOB_PREFIX = 'packing-logger';

const useBlob = Boolean(process.env.BLOB_READ_WRITE_TOKEN);

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
