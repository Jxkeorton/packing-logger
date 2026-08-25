// Spike-simplified storage: local `data/` folder only (no Vercel Blob
// branch — this is a throwaway evaluation project, not a deploy target).
// Otherwise the same shape as the real app's src/lib/storage.ts, so
// logbook.ts / logbook-settings.ts port over unmodified.
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.join(process.cwd(), 'data');

async function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    await mkdir(DATA_DIR, { recursive: true });
  }
}

export async function readText(name: string): Promise<string | null> {
  const filePath = path.join(DATA_DIR, name);
  if (!existsSync(filePath)) return null;
  return readFile(filePath, 'utf-8');
}

export async function writeText(name: string, content: string): Promise<void> {
  await ensureDataDir();
  await writeFile(path.join(DATA_DIR, name), content, 'utf-8');
}
