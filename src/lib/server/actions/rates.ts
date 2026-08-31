// Rates actions — one form covering both the Packing and Work jumps
// rate lists (see RatesSettingsPanel), saved together like
// InvoiceSettingsPanel's form rather than the per-field auto-submit
// ConfigSettingsPanel/WorkJumpsSettingsPanel use: a number field firing
// a save on every keystroke would be far worse than a boolean firing
// one on every click. Not scoped under packing.ts/tandem.ts's own
// action files since it touches both.
import type { Action } from '@sveltejs/kit';
import { CATEGORIES as PACKING_CATEGORIES } from '$lib/packing';
import { CATEGORIES as TANDEM_CATEGORIES } from '$lib/tandem';
import { readRateSettings, writeRateSettings, type RateSettings } from '$lib/server/rate-settings';

/** A posted rate: any non-negative number, falling back to the current value for anything else (blank, negative, not a number). */
function parseRate(formData: FormData, field: string, fallback: number): number {
  const n = Number(formData.get(field));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export const ratesActions: Record<string, Action> = {
  saveRateSettings: async ({ request }) => {
    const formData = await request.formData();
    const current = await readRateSettings();

    const packing = { ...current.packing };
    for (const category of PACKING_CATEGORIES) {
      packing[category] = parseRate(formData, `packing_${category}`, current.packing[category]);
    }
    const tandem = { ...current.tandem };
    for (const category of TANDEM_CATEGORIES) {
      tandem[category] = parseRate(formData, `tandem_${category}`, current.tandem[category]);
    }
    const videographerPackageRate = parseRate(
      formData,
      'videographerPackageRate',
      current.videographerPackageRate,
    );

    const next: RateSettings = { packing, tandem, videographerPackageRate };
    await writeRateSettings(next);
  },
};
