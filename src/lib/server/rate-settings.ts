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
import { readJson, writeJson } from './json-store';

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
  return readJson(
    SETTINGS_KEY,
    (parsed) => {
      const storedPacking = (parsed.packing ?? {}) as Record<string, unknown>;
      const storedTandem = (parsed.tandem ?? {}) as Record<string, unknown>;

      const packing = {} as Record<PackingCategory, number>;
      for (const category of PACKING_CATEGORIES) {
        packing[category] = rate(storedPacking[category], DEFAULTS.packing[category]);
      }
      const tandem = {} as Record<TandemCategory, number>;
      for (const category of TANDEM_CATEGORIES) {
        tandem[category] = rate(storedTandem[category], DEFAULTS.tandem[category]);
      }

      return {
        packing,
        tandem,
        videographerPackageRate: rate(parsed.videographerPackageRate, DEFAULTS.videographerPackageRate),
      };
    },
    DEFAULTS,
  );
}

export async function writeRateSettings(settings: RateSettings): Promise<void> {
  await writeJson(SETTINGS_KEY, settings);
}
