// The Logbook tab's four "saved profile" lists — Places, Equipment,
// Aircraft, Jump types — each wired through the shared factory in
// reference-list.ts, plus the "make default" star that's shared across all
// four (one click updates all four panels at once, since only one item
// per category can be default). The Log sub-tab's dropdowns don't get a
// live update when these change — that form is a React island (see
// components/islands/LogbookForm.tsx) seeded once from the page's initial
// props — so a saved-profile edit here only reaches it once its own
// "Refresh profiles" button is clicked. No selectEl linkage to keep in
// sync as a result — simpler than it was when a plain `<select>` lived
// right there in the DOM.
import { escapeHtml, wireToggle } from './dom';
import { wireReferenceList, defaultStarHtml, type ReferenceItem } from './reference-list';

interface PlaceData extends ReferenceItem {
  name: string;
}
interface EquipmentData extends ReferenceItem {
  name: string;
  canopy: string;
  container: string;
  aad: string;
}
interface AircraftData extends ReferenceItem {
  plate: string;
}
interface JumpTypeData extends ReferenceItem {
  name: string;
}

export function initLogbookReferenceLists() {
  const placesList = wireReferenceList<PlaceData>({
    category: 'place',
    apiPath: '/api/places',
    listElId: 'placesList',
    formElId: 'placesForm',
    statusElId: 'placesStatus',
    selectEl: null,
    emptyListHtml: '<li class="equipment-empty">No places saved yet.</li>',
    optionsHtml: (places, defaultId) => {
      const saved = places
        .map((p) => `<option value="${p.id}"${p.id === defaultId ? ' selected' : ''}>${escapeHtml(p.name)}</option>`)
        .join('');
      return `<option value=""${!defaultId ? ' selected' : ''}>No place selected</option>${saved}`;
    },
    rowHtml: (p, isDefault) => `
      <li class="equipment-row" data-id="${p.id}">
        <div class="equipment-row-text">
          <span class="equipment-row-name">${escapeHtml(p.name)}</span>
        </div>
        ${defaultStarHtml('place', 'place', p.id, isDefault, p.name)}
        <button type="button" class="equipment-delete" data-ref-delete="${p.id}" aria-label="Remove ${escapeHtml(p.name)}">&times;</button>
      </li>`,
    readForm: () => ({ name: (document.getElementById('placeName') as HTMLInputElement | null)?.value ?? '' }),
    getItems: (settings) => settings.places,
    getDefaultId: (settings) => settings.defaultPlaceId,
    onStarClick: (star) => toggleDefault(star),
  });

  const equipmentList = wireReferenceList<EquipmentData>({
    category: 'equipment',
    apiPath: '/api/equipment',
    listElId: 'equipmentList',
    formElId: 'equipmentForm',
    statusElId: 'equipmentStatus',
    selectEl: null,
    emptyListHtml: '<li class="equipment-empty">No equipment saved yet.</li>',
    optionsHtml: (equipment, defaultId) => {
      const saved = equipment
        .map(
          (eq) =>
            `<option value="${eq.id}" data-canopy="${escapeHtml(eq.canopy)}" data-container="${escapeHtml(eq.container)}" data-aad="${escapeHtml(eq.aad)}"${eq.id === defaultId ? ' selected' : ''}>${escapeHtml(eq.name)}</option>`,
        )
        .join('');
      return `<option value="" data-canopy="" data-container="" data-aad=""${!defaultId ? ' selected' : ''}>No equipment selected</option>${saved}`;
    },
    rowHtml: (eq, isDefault) => {
      const detail = [eq.canopy, eq.container, eq.aad].filter(Boolean).map(escapeHtml).join(' · ') || 'No details saved';
      return `
        <li class="equipment-row" data-id="${eq.id}">
          <div class="equipment-row-text">
            <span class="equipment-row-name">${escapeHtml(eq.name)}</span>
            <span class="equipment-row-detail">${detail}</span>
          </div>
          ${defaultStarHtml('equipment', 'equipment', eq.id, isDefault, eq.name)}
          <button type="button" class="equipment-delete" data-ref-delete="${eq.id}" aria-label="Remove ${escapeHtml(eq.name)}">&times;</button>
        </li>`;
    },
    readForm: () => ({
      name: (document.getElementById('equipmentName') as HTMLInputElement | null)?.value ?? '',
      canopy: (document.getElementById('equipmentCanopy') as HTMLInputElement | null)?.value ?? '',
      container: (document.getElementById('equipmentContainer') as HTMLInputElement | null)?.value ?? '',
      aad: (document.getElementById('equipmentAad') as HTMLInputElement | null)?.value ?? '',
    }),
    getItems: (settings) => settings.equipment,
    getDefaultId: (settings) => settings.defaultEquipmentId,
    onStarClick: (star) => toggleDefault(star),
  });

  const aircraftList = wireReferenceList<AircraftData>({
    category: 'aircraft',
    apiPath: '/api/aircraft',
    listElId: 'aircraftList',
    formElId: 'aircraftForm',
    statusElId: 'aircraftStatus',
    selectEl: null,
    emptyListHtml: '<li class="equipment-empty">No aircraft saved yet.</li>',
    optionsHtml: (aircraft, defaultId) => {
      const saved = aircraft
        .map((ac) => `<option value="${ac.id}"${ac.id === defaultId ? ' selected' : ''}>${escapeHtml(ac.plate)}</option>`)
        .join('');
      return `<option value=""${!defaultId ? ' selected' : ''}>No aircraft selected</option>${saved}`;
    },
    rowHtml: (ac, isDefault) => `
      <li class="equipment-row" data-id="${ac.id}">
        <div class="equipment-row-text">
          <span class="equipment-row-name">${escapeHtml(ac.plate)}</span>
        </div>
        ${defaultStarHtml('aircraft', 'aircraft', ac.id, isDefault, ac.plate)}
        <button type="button" class="equipment-delete" data-ref-delete="${ac.id}" aria-label="Remove ${escapeHtml(ac.plate)}">&times;</button>
      </li>`,
    readForm: () => ({ plate: (document.getElementById('aircraftPlate') as HTMLInputElement | null)?.value ?? '' }),
    getItems: (settings) => settings.aircraft,
    getDefaultId: (settings) => settings.defaultAircraftId,
    onStarClick: (star) => toggleDefault(star),
  });

  const jumpTypesList = wireReferenceList<JumpTypeData>({
    category: 'jumpType',
    apiPath: '/api/jump-types',
    listElId: 'jumpTypesList',
    formElId: 'jumpTypesForm',
    statusElId: 'jumpTypesStatus',
    selectEl: null,
    emptyListHtml: '<li class="equipment-empty">No jump types saved yet.</li>',
    optionsHtml: (jumpTypes, defaultId) => {
      const saved = jumpTypes
        .map((jt) => `<option value="${jt.id}"${jt.id === defaultId ? ' selected' : ''}>${escapeHtml(jt.name)}</option>`)
        .join('');
      return `<option value=""${!defaultId ? ' selected' : ''}>No jump type selected</option>${saved}`;
    },
    rowHtml: (jt, isDefault) => `
      <li class="equipment-row" data-id="${jt.id}">
        <div class="equipment-row-text">
          <span class="equipment-row-name">${escapeHtml(jt.name)}</span>
        </div>
        ${defaultStarHtml('jumpType', 'jump type', jt.id, isDefault, jt.name)}
        <button type="button" class="equipment-delete" data-ref-delete="${jt.id}" aria-label="Remove ${escapeHtml(jt.name)}">&times;</button>
      </li>`,
    readForm: () => ({ name: (document.getElementById('jumpTypeName') as HTMLInputElement | null)?.value ?? '' }),
    getItems: (settings) => settings.jumpTypes,
    getDefaultId: (settings) => settings.defaultJumpTypeId,
    onStarClick: (star) => toggleDefault(star),
  });

  // Toggles one item as the default for its category (only one default per
  // category — starring another replaces it, starring the current one
  // clears it) and refreshes all four panels from the single settings
  // object the endpoint returns.
  async function toggleDefault(star: HTMLButtonElement) {
    const category = star.dataset.defaultCategory;
    const id = star.dataset.defaultId;
    if (!category || !id) return;
    const isActive = star.getAttribute('aria-pressed') === 'true';
    star.disabled = true;
    try {
      const res = await fetch('/api/logbook-defaults', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category, id: isActive ? null : id }),
      });
      if (!res.ok) return;
      const data = await res.json();
      placesList.apply(data.settings.places, data.settings.defaultPlaceId);
      equipmentList.apply(data.settings.equipment, data.settings.defaultEquipmentId);
      aircraftList.apply(data.settings.aircraft, data.settings.defaultAircraftId);
      jumpTypesList.apply(data.settings.jumpTypes, data.settings.defaultJumpTypeId);
    } catch (err) {
      console.error('Failed to set default', err);
    } finally {
      star.disabled = false;
    }
  }

  wireToggle('placesToggle', 'placesPanel');
  wireToggle('equipmentToggle', 'equipmentPanel');
  wireToggle('aircraftToggle', 'aircraftPanel');
  wireToggle('jumpTypesToggle', 'jumpTypesPanel');
}
