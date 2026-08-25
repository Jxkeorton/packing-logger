<script lang="ts">
  // Compare this whole file with the real app's equivalents: LogJumpForm.astro
  // + LogbookEntryList.astro (markup) + logbook-jump-form.ts (~280 lines of
  // imperative DOM wiring: manual getElementById calls, a hand-written
  // logbookRowHtml() template-literal function with manual escapeHtml calls,
  // the data-user-touched dance for keeping <select>s in sync). None of that
  // exists here — {#each} replaces the row-template function, $state/$derived
  // replace the DOM reads, and use:enhance replaces the fetch/JSON handlers.
  import { enhance } from '$app/forms';
  import type { NumberedEntry } from '$lib/server/logbook';
  import type { LogbookSettings } from '$lib/server/logbook-settings';
  import {
    MASTHEAD,
    STAMP,
    STAMP_LABEL,
    STAMP_DATE,
    TOTALS,
    TOTALS_BLOCK_FLEX,
    TOTALS_VALUE_INK,
    TOTALS_LABEL,
    FIELD_LABEL,
    FIELD_INPUT,
    FIELD_SELECT,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    FORM_STATUS,
  } from '$lib/ui-classes';

  let {
    entries,
    nextNumber,
    settings,
    today,
    dateDisplay,
  }: {
    entries: NumberedEntry[];
    nextNumber: number;
    settings: LogbookSettings;
    today: string;
    dateDisplay: string;
  } = $props();

  interface FormFields {
    date: string;
    placeId: string;
    exitAltitude: string;
    equipmentId: string;
    aircraftId: string;
    jumpTypeId: string;
    description: string;
  }

  function emptyForm(): FormFields {
    return {
      date: today,
      placeId: settings.defaultPlaceId ?? '',
      exitAltitude: '',
      equipmentId: settings.defaultEquipmentId ?? '',
      aircraftId: settings.defaultAircraftId ?? '',
      jumpTypeId: settings.defaultJumpTypeId ?? '',
      description: '',
    };
  }

  // Entries store the profile's *text*, not its id (the ledger keeps what
  // was actually jumped, not a reference) — so re-opening one for editing
  // matches that text back to a saved profile to pre-select the right
  // dropdown option, same as the real app's formFromEntry.
  function formFromEntry(entry: NumberedEntry): FormFields {
    const equipment = settings.equipment.find(
      (eq) => eq.canopy === entry.canopy && eq.container === entry.container && eq.aad === entry.aad,
    );
    return {
      date: entry.date,
      placeId: settings.places.find((p) => p.name === entry.place)?.id ?? '',
      exitAltitude: entry.exitAltitude,
      equipmentId: equipment?.id ?? '',
      aircraftId: settings.aircraft.find((a) => a.plate === entry.aircraft)?.id ?? '',
      jumpTypeId: settings.jumpTypes.find((jt) => jt.name === entry.jumpType)?.id ?? '',
      description: entry.description,
    };
  }

  function formatShortDate(dateStr: string): string {
    return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }

  const dash = (value: string) => value || '—';

  let editingAt = $state<string | null>(null);
  let expanded = $state<Set<string>>(new Set());
  let form = $state<FormFields>(emptyForm());
  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });
  let saving = $state(false);
  let formEl: HTMLFormElement;

  const editingEntry = $derived(editingAt ? entries.find((e) => e.at === editingAt) : undefined);
  const displayNumber = $derived(editingEntry ? editingEntry.number : nextNumber);

  // A dropdown's *options* are just $derived-ly always current — no code
  // needed. Its *default selection* is a different problem, though: a
  // star toggled in Settings should still snap the add-jump form onto the
  // new default, but only for a dropdown the user hasn't already touched
  // (typing through it, or entering edit mode). This is the one place the
  // real app's markTouched/data-user-touched dance actually has a Svelte
  // equivalent — smaller (four booleans + one effect, no DOM attributes
  // or imperative <select> patching), but not literally zero code; "don't
  // clobber an in-progress choice when the live data refreshes" is a
  // product requirement, not an artifact of how the old version was built.
  let touched = $state({ placeId: false, equipmentId: false, aircraftId: false, jumpTypeId: false });

  $effect(() => {
    if (editingAt !== null) return; // edit mode always starts fully "touched", set below
    if (!touched.placeId) form.placeId = settings.defaultPlaceId ?? '';
    if (!touched.equipmentId) form.equipmentId = settings.defaultEquipmentId ?? '';
    if (!touched.aircraftId) form.aircraftId = settings.defaultAircraftId ?? '';
    if (!touched.jumpTypeId) form.jumpTypeId = settings.defaultJumpTypeId ?? '';
  });

  function enterAddMode() {
    editingAt = null;
    form = emptyForm();
    touched = { placeId: false, equipmentId: false, aircraftId: false, jumpTypeId: false };
  }

  function enterEditMode(entry: NumberedEntry) {
    editingAt = entry.at;
    form = formFromEntry(entry);
    touched = { placeId: true, equipmentId: true, aircraftId: true, jumpTypeId: true };
    formEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function toggleExpanded(at: string) {
    const next = new Set(expanded);
    if (next.has(at)) next.delete(at);
    else next.add(at);
    expanded = next;
  }
</script>

<header class={MASTHEAD}>
  <div class={STAMP} aria-hidden="false">
    <span class={STAMP_LABEL}>Logbook</span>
    <span class={STAMP_DATE}>{dateDisplay}</span>
  </div>
  <div class={TOTALS}>
    <div class={TOTALS_BLOCK_FLEX}>
      <span class={TOTALS_VALUE_INK}>{nextNumber - 1}</span>
      <span class={TOTALS_LABEL}>jumps logged</span>
    </div>
  </div>
</header>

<section class="bg-panel border border-line rounded-card shadow-card px-4 pt-3.5 pb-4">
  <div class="flex items-baseline justify-between gap-2 mb-2.5">
    <h2 class="m-0 text-[17px] font-bold tracking-[-0.01em]">{editingAt ? 'Edit jump' : 'Log a jump'}</h2>
    <span class="font-mono font-semibold text-sm text-gold">#{displayNumber}</span>
  </div>
  <form
    bind:this={formEl}
    method="POST"
    action={editingAt ? '?/updateJump' : '?/logJump'}
    use:enhance={() => {
      saving = true;
      status = { text: 'Saving…' };
      const wasEditing = editingAt;
      return async ({ result, update }) => {
        saving = false;
        if (result.type === 'success') {
          status = { text: wasEditing ? 'Saved' : 'Logged', kind: 'ok' };
          enterAddMode();
          setTimeout(() => (status = { text: '' }), 2000);
        } else if (result.type === 'failure') {
          status = { text: (result.data as { error?: string })?.error ?? 'Failed to save', kind: 'error' };
        }
        // { reset: false }: every field here is bind:value-controlled by
        // `form` (Svelte state), not left to the browser. update()'s
        // default behavior also calls the native form.reset() — without
        // this it fights enterAddMode() above, blanking fields that
        // emptyForm() had just set (e.g. the date), since reset() reverts
        // to the <input>'s original attribute value, not to bind:value's
        // current one.
        await update({ reset: false });
      };
    }}
  >
    {#if editingAt}<input type="hidden" name="at" value={editingAt} />{/if}
    <div class="grid grid-cols-2 gap-x-2.5 gap-y-0 max-[420px]:grid-cols-1">
      <label class={FIELD_LABEL}>
        <span>Date *</span>
        <input type="date" name="date" class="{FIELD_INPUT} min-w-0" required bind:value={form.date} />
      </label>
      <label class={FIELD_LABEL}>
        <span>Place</span>
        <select
          name="placeId"
          class={FIELD_SELECT}
          bind:value={form.placeId}
          onchange={() => (touched.placeId = true)}
        >
          <option value="">No place selected</option>
          {#each settings.places as p (p.id)}
            <option value={p.id}>{p.name}</option>
          {/each}
        </select>
      </label>
      <label class={FIELD_LABEL}>
        <span>Exit altitude</span>
        <input
          type="text"
          name="exitAltitude"
          class={FIELD_INPUT}
          placeholder="e.g. 13,000 ft"
          autocomplete="off"
          maxlength="120"
          bind:value={form.exitAltitude}
        />
      </label>
      <label class={FIELD_LABEL}>
        <span>Equipment</span>
        <select
          name="equipmentId"
          class={FIELD_SELECT}
          bind:value={form.equipmentId}
          onchange={() => (touched.equipmentId = true)}
        >
          <option value="">No equipment selected</option>
          {#each settings.equipment as eq (eq.id)}
            <option value={eq.id}>{eq.name}</option>
          {/each}
        </select>
      </label>
      <label class={FIELD_LABEL}>
        <span>Aircraft</span>
        <select
          name="aircraftId"
          class={FIELD_SELECT}
          bind:value={form.aircraftId}
          onchange={() => (touched.aircraftId = true)}
        >
          <option value="">No aircraft selected</option>
          {#each settings.aircraft as ac (ac.id)}
            <option value={ac.id}>{ac.plate}</option>
          {/each}
        </select>
      </label>
      <label class={FIELD_LABEL}>
        <span>Jump type</span>
        <select
          name="jumpTypeId"
          class={FIELD_SELECT}
          bind:value={form.jumpTypeId}
          onchange={() => (touched.jumpTypeId = true)}
        >
          <option value="">No jump type selected</option>
          {#each settings.jumpTypes as jt (jt.id)}
            <option value={jt.id}>{jt.name}</option>
          {/each}
        </select>
      </label>
    </div>
    <label class={FIELD_LABEL}>
      <span>Description</span>
      <textarea
        name="description"
        class={FIELD_INPUT}
        rows="3"
        placeholder="Freefall, exercises, canopy notes…"
        bind:value={form.description}
      ></textarea>
    </label>
    <div class={FORM_ACTIONS}>
      <button type="submit" class={FORM_SAVE_BUTTON} disabled={saving}>
        {editingAt ? 'Save changes' : 'Log jump'}
      </button>
      {#if editingAt}
        <button
          type="button"
          class="appearance-none border-0 bg-transparent text-ink-soft font-sans text-[13px] font-semibold cursor-pointer p-0 underline"
          onclick={enterAddMode}
        >
          Cancel edit
        </button>
      {/if}
      <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
    </div>
  </form>
</section>

<section class="bg-panel border border-line rounded-card shadow-card overflow-hidden">
  <ul class="list-none m-0 p-0">
    {#each entries as entry (entry.at)}
      {@const isExpanded = expanded.has(entry.at)}
      <li class="logbook-entry">
        <button type="button" class="logbook-row" aria-expanded={isExpanded} onclick={() => toggleExpanded(entry.at)}>
          <span class="logbook-row-number">#{entry.number}</span>
          <span class="logbook-row-date">{formatShortDate(entry.date)}</span>
          <span class="logbook-row-place">{entry.place || '—'}</span>
          <span class="logbook-row-chevron">&rsaquo;</span>
        </button>
        {#if isExpanded}
          <div class="logbook-details">
            <dl class="logbook-details-grid">
              <div><dt>Jump type</dt><dd>{dash(entry.jumpType)}</dd></div>
              <div><dt>Exit altitude</dt><dd>{dash(entry.exitAltitude)}</dd></div>
              <div><dt>Aircraft</dt><dd>{dash(entry.aircraft)}</dd></div>
              <div><dt>Canopy</dt><dd>{dash(entry.canopy)}</dd></div>
              <div><dt>Container</dt><dd>{dash(entry.container)}</dd></div>
              <div><dt>AAD</dt><dd>{dash(entry.aad)}</dd></div>
            </dl>
            {#if entry.description}<p class="logbook-details-description">{entry.description}</p>{/if}
            <div class="logbook-details-actions">
              <button type="button" class="logbook-edit" onclick={() => enterEditMode(entry)}>Edit</button>
              <form
                method="POST"
                action="?/deleteJump"
                use:enhance={() => {
                  const wasEditing = entry.at === editingAt;
                  return async ({ update }) => {
                    if (wasEditing) enterAddMode();
                    await update();
                  };
                }}
              >
                <input type="hidden" name="at" value={entry.at} />
                <button type="submit" class="logbook-delete">Delete</button>
              </form>
            </div>
          </div>
        {/if}
      </li>
    {:else}
      <li class="logbook-empty">No jumps logged yet.</li>
    {/each}
  </ul>
</section>

<style>
  /* Same rules as LogbookEntryList.astro's <style> block, plain scoped
     Svelte styles — see ReferenceListPanel.svelte for why :global() isn't
     needed here. */
  .logbook-empty {
    margin: 0;
    padding: 16px;
    color: var(--ink-soft);
    font-size: 14px;
  }

  .logbook-entry {
    border-top: 1px solid var(--line);
  }

  .logbook-entry:first-child {
    border-top: none;
  }

  .logbook-row {
    appearance: none;
    border: none;
    background: transparent;
    width: 100%;
    display: grid;
    grid-template-columns: 44px 84px 1fr 16px;
    align-items: center;
    gap: 10px;
    padding: 12px 14px;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  .logbook-row-number {
    font-family: var(--font-mono);
    font-weight: 600;
    font-size: 13px;
    color: var(--gold);
  }

  .logbook-row-date {
    font-size: 12.5px;
    color: var(--ink-soft);
    white-space: nowrap;
  }

  .logbook-row-place {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .logbook-row-chevron {
    font-size: 18px;
    color: var(--ink-soft);
    transition: transform 0.15s ease;
    justify-self: end;
  }

  .logbook-row[aria-expanded='true'] .logbook-row-chevron {
    transform: rotate(90deg);
  }

  .logbook-details {
    padding: 0 14px 14px;
  }

  .logbook-details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 14px;
    margin: 0;
  }

  .logbook-details-grid dt {
    margin: 0;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--ink-soft);
  }

  .logbook-details-grid dd {
    margin: 2px 0 0;
    font-size: 13.5px;
  }

  .logbook-details-description {
    margin: 12px 0 0;
    padding-top: 10px;
    border-top: 1px solid var(--line);
    font-size: 13.5px;
    white-space: pre-wrap;
  }

  .logbook-details-actions {
    display: flex;
    gap: 14px;
    margin-top: 12px;
  }

  .logbook-edit,
  .logbook-delete {
    appearance: none;
    border: none;
    background: transparent;
    font-weight: 600;
    font-size: 12.5px;
    padding: 4px 0;
    cursor: pointer;
    touch-action: manipulation;
  }

  .logbook-edit {
    color: var(--gold);
  }

  .logbook-delete {
    color: var(--ink-soft);
  }

  .logbook-delete:hover,
  .logbook-delete:focus-visible {
    color: var(--danger);
    outline: none;
  }
</style>
