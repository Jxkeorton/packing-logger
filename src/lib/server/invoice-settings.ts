// Editable letterhead details for the tandem invoice PDF — who it's from,
// who it's billed to, and the next invoice number to use. Kept separate
// from the jump ledger since this rarely changes (unlike the jumps
// themselves) and isn't derived from anything else in the app.
import { readText, writeText } from './storage';

export interface InvoiceSettings {
  fromName: string;
  fromAddress: string[];
  vatNote: string;
  billTo: string[];
  nextInvoiceRef: number;
}

const SETTINGS_KEY = 'invoice-settings.json';

const DEFAULTS: InvoiceSettings = {
  fromName: 'Your Name',
  fromAddress: ['Add your address in Invoice Settings'],
  vatNote: 'Not registered for VAT',
  billTo: ['Add the client’s billing address in Invoice Settings'],
  nextInvoiceRef: 1,
};

function stringArray(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback;
  const lines = value.filter((l): l is string => typeof l === 'string');
  return lines.length > 0 ? lines : fallback;
}

export async function readInvoiceSettings(): Promise<InvoiceSettings> {
  const raw = await readText(SETTINGS_KEY);
  if (!raw) return DEFAULTS;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return DEFAULTS;
    return {
      fromName: typeof parsed.fromName === 'string' && parsed.fromName.trim() ? parsed.fromName : DEFAULTS.fromName,
      fromAddress: stringArray(parsed.fromAddress, DEFAULTS.fromAddress),
      vatNote: typeof parsed.vatNote === 'string' ? parsed.vatNote : DEFAULTS.vatNote,
      billTo: stringArray(parsed.billTo, DEFAULTS.billTo),
      nextInvoiceRef:
        typeof parsed.nextInvoiceRef === 'number' && Number.isInteger(parsed.nextInvoiceRef) && parsed.nextInvoiceRef > 0
          ? parsed.nextInvoiceRef
          : DEFAULTS.nextInvoiceRef,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function writeInvoiceSettings(settings: InvoiceSettings): Promise<void> {
  await writeText(SETTINGS_KEY, JSON.stringify(settings, null, 2));
}

/** Claim the next invoice number and persist the incremented counter for next time. */
export async function claimInvoiceRef(): Promise<number> {
  const settings = await readInvoiceSettings();
  await writeInvoiceSettings({ ...settings, nextInvoiceRef: settings.nextInvoiceRef + 1 });
  return settings.nextInvoiceRef;
}
