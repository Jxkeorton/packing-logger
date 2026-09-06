// The read-parse-guard-fallback ceremony every *-settings and visibility
// store repeats around a single JSON document. Split out from storage.ts
// (rather than living in it) so it keeps working through the in-memory
// `./storage` mock every server-module test uses: this module imports the
// mocked readText/writeText like any other caller, so a test seeds raw
// strings into the Map and readJson parses them for real.
import { readText, writeText } from './storage';

/**
 * Read a JSON object stored under `name` and hand it to `coerce`, which
 * validates it and fills in whatever's missing or wrong. Falls back to
 * `fallback` on every failure mode these stores have: the object not
 * existing yet, unparseable JSON, a payload that isn't a plain object, or
 * `coerce` itself throwing.
 */
export async function readJson<T>(
  name: string,
  coerce: (parsed: Record<string, unknown>) => T,
  fallback: T,
): Promise<T> {
  const raw = await readText(name);
  if (raw == null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return coerce(parsed as Record<string, unknown>);
  } catch {
    return fallback;
  }
}

/** Persist `value` as pretty-printed JSON under `name` — the counterpart to readJson. */
export async function writeJson(name: string, value: unknown): Promise<void> {
  await writeText(name, JSON.stringify(value, null, 2));
}

/**
 * A ready-made `coerce` for readJson: a record of booleans keyed by a
 * fixed set, each key falling back to `defaults` when the stored value
 * isn't a boolean. Both the tab- and category-visibility stores are
 * exactly this and nothing else.
 */
export function boolMap<K extends string>(keys: readonly K[], defaults: Record<K, boolean>) {
  return (parsed: Record<string, unknown>): Record<K, boolean> => {
    const out = {} as Record<K, boolean>;
    for (const key of keys) {
      out[key] = typeof parsed[key] === 'boolean' ? (parsed[key] as boolean) : defaults[key];
    }
    return out;
  };
}
