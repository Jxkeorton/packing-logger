// The Logbook tab's "Log a jump" form and its entry list (render/expand/
// edit/delete). `applyLogbookState` is exported so
// logbook-jump-number-settings.ts's "jumps logged before this app" form
// can refresh this same list after shifting the numbering base — that's
// the only other piece of the tab that touches entries. The four
// Places/Equipment/Aircraft/Jump-type reference lists this form's
// dropdowns pick from are their own module, logbook-reference-lists.ts,
// since they don't touch entries at all.
import { escapeHtml, markTouched, selectedOptionText, selectOptionByText } from './dom';

interface LogbookEntryData {
  date: string;
  place: string;
  exitAltitude: string;
  canopy: string;
  container: string;
  aad: string;
  aircraft: string;
  jumpType: string;
  description: string;
  at: string;
  number: number;
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function dash(value: string): string {
  return value ? escapeHtml(value) : '—';
}

function logbookRowHtml(e: LogbookEntryData): string {
  const description = e.description
    ? `<p class="logbook-details-description">${escapeHtml(e.description)}</p>`
    : '';
  return `
    <li class="logbook-entry" data-at="${e.at}" data-date="${e.date}" data-place="${escapeHtml(e.place)}" data-altitude="${escapeHtml(e.exitAltitude)}" data-aircraft="${escapeHtml(e.aircraft)}" data-canopy="${escapeHtml(e.canopy)}" data-container="${escapeHtml(e.container)}" data-aad="${escapeHtml(e.aad)}" data-jump-type="${escapeHtml(e.jumpType)}" data-description="${escapeHtml(e.description)}">
      <button type="button" class="logbook-row" data-toggle="${e.at}" aria-expanded="false">
        <span class="logbook-row-number">#${e.number}</span>
        <span class="logbook-row-date">${formatShortDate(e.date)}</span>
        <span class="logbook-row-place">${dash(e.place)}</span>
        <span class="logbook-row-chevron">&rsaquo;</span>
      </button>
      <div class="logbook-details" id="logbookDetails-${e.at}" hidden>
        <dl class="logbook-details-grid">
          <div><dt>Jump type</dt><dd>${dash(e.jumpType)}</dd></div>
          <div><dt>Exit altitude</dt><dd>${dash(e.exitAltitude)}</dd></div>
          <div><dt>Aircraft</dt><dd>${dash(e.aircraft)}</dd></div>
          <div><dt>Canopy</dt><dd>${dash(e.canopy)}</dd></div>
          <div><dt>Container</dt><dd>${dash(e.container)}</dd></div>
          <div><dt>AAD</dt><dd>${dash(e.aad)}</dd></div>
        </dl>
        ${description}
        <div class="logbook-details-actions">
          <button type="button" class="logbook-edit" data-edit="${e.at}">Edit</button>
          <button type="button" class="logbook-delete" data-delete="${e.at}">Delete</button>
        </div>
      </div>
    </li>`;
}

function renderLogbookList(entries: LogbookEntryData[]) {
  const list = document.getElementById('logbookList');
  if (!list) return;
  list.innerHTML =
    entries.length === 0
      ? '<li class="logbook-empty">No jumps logged yet.</li>'
      : entries.map(logbookRowHtml).join('');
}

/**
 * Re-renders the entry list and the running/next-number totals from a
 * fresh `{entries, nextNumber}` payload. Exported so
 * logbook-jump-number-settings.ts's "jumps logged before this app" form
 * can refresh this same list after shifting the numbering base.
 */
export function applyLogbookState(entries: LogbookEntryData[], nextNumber: number) {
  renderLogbookList(entries);
  const totalEl = document.getElementById('logbookTotalJumps');
  if (totalEl) totalEl.textContent = String(nextNumber - 1);
  const nextEl = document.getElementById('logbookNextNumber');
  const editing = (document.getElementById('logbookForm') as HTMLFormElement | null)?.dataset.editing === 'true';
  if (nextEl && !editing) nextEl.textContent = `#${nextNumber}`;
}

export function initLogbookJumpForm() {
  const logbookForm = document.getElementById('logbookForm') as HTMLFormElement | null;
  const logbookList = document.getElementById('logbookList');
  const logbookFormTitle = document.getElementById('logbookFormTitle');
  const logbookNextNumberEl = document.getElementById('logbookNextNumber');
  const logbookEditingAt = document.getElementById('logbookEditingAt') as HTMLInputElement | null;
  const logbookDate = document.getElementById('logbookDate') as HTMLInputElement | null;
  const logbookPlace = document.getElementById('logbookPlace') as HTMLSelectElement | null;
  const logbookAltitude = document.getElementById('logbookAltitude') as HTMLInputElement | null;
  const logbookEquipment = document.getElementById('logbookEquipment') as HTMLSelectElement | null;
  const logbookAircraft = document.getElementById('logbookAircraft') as HTMLSelectElement | null;
  const logbookJumpType = document.getElementById('logbookJumpType') as HTMLSelectElement | null;
  const logbookDescription = document.getElementById('logbookDescription') as HTMLTextAreaElement | null;
  const logbookSubmit = document.getElementById('logbookSubmit') as HTMLButtonElement | null;
  const logbookCancelEdit = document.getElementById('logbookCancelEdit') as HTMLButtonElement | null;
  const logbookFormStatus = document.getElementById('logbookFormStatus');
  const todayDateValue = logbookDate?.value ?? '';

  // Place/Equipment/Aircraft/Jump-type dropdowns get rebuilt (via
  // innerHTML) whenever their saved-profile list or default changes — e.g.
  // from starring a different default while this form is sitting open. A
  // rebuild should snap back to the live default *unless* something
  // already deliberately chose a value in the meantime (typing through the
  // dropdown, or entering edit mode) — see markTouched in lib/client/dom.ts.
  logbookPlace?.addEventListener('change', () => markTouched(logbookPlace));
  logbookEquipment?.addEventListener('change', () => markTouched(logbookEquipment));
  logbookAircraft?.addEventListener('change', () => markTouched(logbookAircraft));
  logbookJumpType?.addEventListener('change', () => markTouched(logbookJumpType));

  function selectedEquipment(): { canopy: string; container: string; aad: string } {
    const option = logbookEquipment?.selectedOptions[0];
    return {
      canopy: option?.dataset.canopy ?? '',
      container: option?.dataset.container ?? '',
      aad: option?.dataset.aad ?? '',
    };
  }

  // Picks the dropdown option whose saved values match a jump's snapshot
  // exactly, so re-opening a jump for editing shows the right equipment
  // pre-selected when it still matches a saved profile. If the profile was
  // since edited or deleted, this just leaves "No equipment selected"
  // chosen — the entry's own canopy/container/AAD text stays untouched
  // unless the field is changed.
  function selectEquipmentMatching(canopy: string, container: string, aad: string) {
    if (!logbookEquipment) return;
    markTouched(logbookEquipment);
    for (const option of Array.from(logbookEquipment.options)) {
      if ((option.dataset.canopy ?? '') === canopy && (option.dataset.container ?? '') === container && (option.dataset.aad ?? '') === aad) {
        logbookEquipment.value = option.value;
        return;
      }
    }
    logbookEquipment.value = '';
  }

  function enterAddMode() {
    if (!logbookForm) return;
    logbookForm.dataset.editing = 'false';
    if (logbookEditingAt) logbookEditingAt.value = '';
    if (logbookFormTitle) logbookFormTitle.textContent = 'Log a jump';
    if (logbookSubmit) logbookSubmit.textContent = 'Log jump';
    if (logbookCancelEdit) logbookCancelEdit.hidden = true;
    logbookForm.reset();
    if (logbookDate) logbookDate.value = todayDateValue;
    logbookPlace?.removeAttribute('data-user-touched');
    logbookEquipment?.removeAttribute('data-user-touched');
    logbookAircraft?.removeAttribute('data-user-touched');
    logbookJumpType?.removeAttribute('data-user-touched');
    const totalEl = document.getElementById('logbookTotalJumps');
    if (logbookNextNumberEl && totalEl) {
      logbookNextNumberEl.textContent = `#${Number(totalEl.textContent) + 1}`;
    }
  }

  function enterEditMode(entry: HTMLElement) {
    if (!logbookForm) return;
    const { at, date, place, altitude, aircraft, canopy, container, aad, jumpType, description } = entry.dataset;
    logbookForm.dataset.editing = 'true';
    if (logbookEditingAt) logbookEditingAt.value = at ?? '';
    if (logbookDate) logbookDate.value = date ?? '';
    if (logbookAltitude) logbookAltitude.value = altitude ?? '';
    if (logbookDescription) logbookDescription.value = description ?? '';
    selectOptionByText(logbookPlace, place ?? '');
    selectEquipmentMatching(canopy ?? '', container ?? '', aad ?? '');
    selectOptionByText(logbookAircraft, aircraft ?? '');
    selectOptionByText(logbookJumpType, jumpType ?? '');
    if (logbookFormTitle) logbookFormTitle.textContent = 'Edit jump';
    if (logbookSubmit) logbookSubmit.textContent = 'Save changes';
    if (logbookCancelEdit) logbookCancelEdit.hidden = false;
    if (logbookNextNumberEl) {
      const row = document.querySelector(`.logbook-row[data-toggle="${at}"] .logbook-row-number`);
      logbookNextNumberEl.textContent = row?.textContent ?? '';
    }
    logbookForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  logbookCancelEdit?.addEventListener('click', enterAddMode);

  logbookForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const equipment = selectedEquipment();
    const editingAt = logbookEditingAt?.value || '';
    const payload = {
      at: editingAt || undefined,
      date: logbookDate?.value ?? '',
      place: selectedOptionText(logbookPlace),
      exitAltitude: logbookAltitude?.value ?? '',
      aircraft: selectedOptionText(logbookAircraft),
      jumpType: selectedOptionText(logbookJumpType),
      description: logbookDescription?.value ?? '',
      ...equipment,
    };

    if (logbookSubmit) logbookSubmit.disabled = true;
    if (logbookFormStatus) {
      logbookFormStatus.textContent = 'Saving…';
      logbookFormStatus.removeAttribute('data-state');
    }

    try {
      const res = await fetch('/api/logbook', {
        method: editingAt ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? 'Failed to save');
      }
      const data = await res.json();
      applyLogbookState(data.entries, data.nextNumber);
      if (logbookFormStatus) {
        logbookFormStatus.textContent = editingAt ? 'Saved' : 'Logged';
        logbookFormStatus.dataset.state = 'ok';
      }
      enterAddMode();
      window.setTimeout(() => {
        if (logbookFormStatus) logbookFormStatus.textContent = '';
      }, 2000);
    } catch (err) {
      console.error('Failed to save jump', err);
      if (logbookFormStatus) {
        logbookFormStatus.textContent = err instanceof Error ? err.message : 'Failed to save';
        logbookFormStatus.dataset.state = 'error';
      }
    } finally {
      if (logbookSubmit) logbookSubmit.disabled = false;
    }
  });

  logbookList?.addEventListener('click', async (event) => {
    const target = event.target as HTMLElement;

    const toggleButton = target.closest<HTMLButtonElement>('.logbook-row');
    if (toggleButton?.dataset.toggle) {
      const details = document.getElementById(`logbookDetails-${toggleButton.dataset.toggle}`);
      const expanded = toggleButton.getAttribute('aria-expanded') === 'true';
      toggleButton.setAttribute('aria-expanded', String(!expanded));
      if (details) details.hidden = expanded;
      return;
    }

    const editButton = target.closest<HTMLButtonElement>('.logbook-edit');
    if (editButton?.dataset.edit) {
      const entry = editButton.closest<HTMLElement>('.logbook-entry');
      if (entry) enterEditMode(entry);
      return;
    }

    const deleteButton = target.closest<HTMLButtonElement>('.logbook-delete');
    if (deleteButton?.dataset.delete) {
      const at = deleteButton.dataset.delete;
      deleteButton.disabled = true;
      try {
        const res = await fetch('/api/logbook', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ at }),
        });
        if (!res.ok) return;
        const data = await res.json();
        applyLogbookState(data.entries, data.nextNumber);
        // If the jump being deleted was the one open in the edit form,
        // drop back to add mode rather than leaving a stale edit target.
        if (logbookEditingAt?.value === at) enterAddMode();
      } catch (err) {
        console.error('Failed to delete jump', err);
      } finally {
        deleteButton.disabled = false;
      }
    }
  });
}
