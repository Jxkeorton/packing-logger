// Editable per-service rates — what packing a rig or doing a tandem
// jump actually pays, previously hardcoded as RATES in $lib/packing.ts
// and $lib/tandem.ts. Those two stay the *defaults* (seeded here, and
// still what every existing test exercises via totalEarnings'/
// toHistoryRow's own optional-rates fallback) — this is what's actually
// live once someone's edited a price in Settings > Work jumps.
//
// videographerPackageRate is the only one with no direct RATES
// equivalent: it's the gross "CASH CALL - Video & photos package" line
// on the invoice (invoice-pdf.ts), which nets down to tandem.videographer
// per jump via a separate deduction line, rather than being its own
// per-jump pay rate.
import { CATEGORIES as PACKING_CATEGORIES, RATES as DEFAULT_PACKING_RATES, type Category as PackingCategory } from '../packing';
import {
  CATEGORIES as TANDEM_CATEGORIES,
  RATES as DEFAULT_TANDEM_RATES,
  VIDEOGRAPHER_PACKAGE_RATE as DEFAULT_VIDEOGRAPHER_PACKAGE_RATE,
  type Category as TandemCategory,
} from '../tandem';
import { readText, writeText } from './storage';

export interface RateSettings {
  packing: Record<PackingCategory, number>;
  tandem: Record<TandemCategory, number>;
  videographerPackageRate: number;
}

const SETTINGS_KEY = 'rate-settings.json';

const DEFAULTS: RateSettings = {
  packing: { ...DEFAULT_PACKING_RATES },
  tandem: { ...DEFAULT_TANDEM_RATES },
  videographerPackageRate: DEFAULT_VIDEOGRAPHER_PACKAGE_RATE,
};

/** A rate is a non-negative, finite number of pounds — anything else falls back. */
function rate(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function readRateSettings(): Promise<RateSettings> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;

    const packing = {} as Record<PackingCategory, number>;
    for (const category of PACKING_CATEGORIES) {
      packing[category] = rate(parsed.packing?.[category], DEFAULTS.packing[category]);
    }
    const tandem = {} as Record<TandemCategory, number>;
    for (const category of TANDEM_CATEGORIES) {
      tandem[category] = rate(parsed.tandem?.[category], DEFAULTS.tandem[category]);
    }

    return {
      packing,
      tandem,
      videographerPackageRate: rate(parsed.videographerPackageRate, DEFAULTS.videographerPackageRate),
    };
  } catch {
    return DEFAULTS;
  }
}

export async function writeRateSettings(settings: RateSettings): Promise<void> {
  await writeText(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}
