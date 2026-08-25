// Pure data-shaping helpers for the Logbook tab's React island
// (components/islands/LogbookForm.tsx) — no DOM, no React, so they're
// plain and easy to reason about (or test) on their own.
import type { NumberedEntry } from '../logbook';
import type { LogbookSettings } from '../logbook-settings';

export interface FormFields {
  date: string;
  placeId: string;
  altitude: string;
  equipmentId: string;
  aircraftId: string;
  jumpTypeId: string;
  description: string;
}

export const dash = (value: string) => value || '—';

export function formatShortDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function emptyForm(today: string, settings: LogbookSettings): FormFields {
  return {
    date: today,
    placeId: settings.defaultPlaceId ?? '',
    altitude: '',
    equipmentId: settings.defaultEquipmentId ?? '',
    aircraftId: settings.defaultAircraftId ?? '',
    jumpTypeId: settings.defaultJumpTypeId ?? '',
    description: '',
  };
}

// Entries store the profile's *text*, not its id (see api/logbook.ts's
// comment on parseEntryInput) — so re-opening one for editing has to
// match that text back to a saved profile to pre-select the right
// dropdown option. If the profile was since renamed or deleted, this just
// leaves it unselected; the entry's own snapshot text is untouched unless
// the field is changed.
export function formFromEntry(entry: NumberedEntry, settings: LogbookSettings): FormFields {
  const equipment = settings.equipment.find(
    (eq) => eq.canopy === entry.canopy && eq.container === entry.container && eq.aad === entry.aad,
  );
  return {
    date: entry.date,
    placeId: settings.places.find((p) => p.name === entry.place)?.id ?? '',
    altitude: entry.exitAltitude,
    equipmentId: equipment?.id ?? '',
    aircraftId: settings.aircraft.find((a) => a.plate === entry.aircraft)?.id ?? '',
    jumpTypeId: settings.jumpTypes.find((jt) => jt.name === entry.jumpType)?.id ?? '',
    description: entry.description,
  };
}

export function buildPayload(form: FormFields, settings: LogbookSettings, editingAt: string | null) {
  const equipment = settings.equipment.find((eq) => eq.id === form.equipmentId);
  return {
    at: editingAt ?? undefined,
    date: form.date,
    place: settings.places.find((p) => p.id === form.placeId)?.name ?? '',
    exitAltitude: form.altitude,
    aircraft: settings.aircraft.find((a) => a.id === form.aircraftId)?.plate ?? '',
    jumpType: settings.jumpTypes.find((jt) => jt.id === form.jumpTypeId)?.name ?? '',
    description: form.description,
    canopy: equipment?.canopy ?? '',
    container: equipment?.container ?? '',
    aad: equipment?.aad ?? '',
  };
}
