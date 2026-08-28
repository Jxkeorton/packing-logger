<script lang="ts">
  // Compare this whole file with the real app's equivalents: LogJumpForm.astro
  // + LogbookEntryList.astro (markup) + logbook-jump-form.ts (~280 lines of
  // imperative DOM wiring: manual getElementById calls, a hand-written
  // logbookRowHtml() template-literal function with manual escapeHtml calls,
  // the data-user-touched dance for keeping <select>s in sync). None of that
  // exists here — {#each} replaces the row-template function, $state/$derived
  // replace the DOM reads, and use:enhance replaces the fetch/JSON handlers.
  import { enhance } from '$app/forms';
  import { exitAltitudeDigits, formatExitAltitude } from '$lib/format';
  import { TANDEM_JUMP_TYPES } from '$lib/tandem';
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
    rigId: string;
    aircraftId: string;
    jumpTypeId: string;
    description: string;
  }

  function emptyForm(): FormFields {
    return {
      date: today,
      placeId: settings.defaultPlaceId ?? '',
      exitAltitude: '',
      rigId: settings.defaultRigId ?? '',
      aircraftId: settings.defaultAircraftId ?? '',
      jumpTypeId: settings.defaultJumpTypeId ?? '',
      description: '',
    };
  }

  // Entries store the rig's *name*, not its id (the ledger keeps what was
  // actually jumped, not a reference) — so re-opening one for editing
  // matches that name back to a saved rig to pre-select the right
  // dropdown option, same as the real app's formFromEntry.
  function formFromEntry(entry: NumberedEntry): FormFields {
    const rig = settings.rigs.find((r) => r.name === entry.rig);
    return {
      date: entry.date,
      placeId: settings.places.find((p) => p.name === entry.place)?.id ?? '',
      exitAltitude: exitAltitudeDigits(entry.exitAltitude),
      rigId: rig?.id ?? '',
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

  // Jumps auto-logged from the Tandems tab get a badge on their collapsed
  // row, so paid tandem work is distinguishable from sport jumps at a
  // glance. Anything else — a hand-logged jump of any type — gets none.
  function tandemBadge(jumpType: string): { label: string; kind: string } | null {
    if (jumpType === TANDEM_JUMP_TYPES.videographer) return { label: 'Camera', kind: 'camera' };
    if (jumpType === TANDEM_JUMP_TYPES.instructor) return { label: 'Instructor', kind: 'instructor' };
    return null;
  }

  let editingAt = $state<string | null>(null);
  let expanded = $state<Set<string>>(new Set());
  let form = $state<FormFields>(emptyForm());
  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });
  let saving = $state(false);
  let modalOpen = $state(false);
  let dialogEl: HTMLDivElement | undefined = $state();

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
  let touched = $state({ placeId: false, rigId: false, aircraftId: false, jumpTypeId: false });

  $effect(() => {
    if (editingAt !== null) return; // edit mode always starts fully "touched", set below
    if (!touched.placeId) form.placeId = settings.defaultPlaceId ?? '';
    if (!touched.rigId) form.rigId = settings.defaultRigId ?? '';
    if (!touched.aircraftId) form.aircraftId = settings.defaultAircraftId ?? '';
    if (!touched.jumpTypeId) form.jumpTypeId = settings.defaultJumpTypeId ?? '';
  });

  function enterAddMode() {
    editingAt = null;
    form = emptyForm();
    touched = { placeId: false, rigId: false, aircraftId: false, jumpTypeId: false };
  }

  function enterEditMode(entry: NumberedEntry) {
    editingAt = entry.at;
    form = formFromEntry(entry);
    touched = { placeId: true, rigId: true, aircraftId: true, jumpTypeId: true };
  }

  function openAdd() {
    enterAddMode();
    status = { text: '' };
    modalOpen = true;
  }

  function openEdit(entry: NumberedEntry) {
    enterEditMode(entry);
    status = { text: '' };
    modalOpen = true;
  }

  function closeModal() {
    modalOpen = false;
    // Reset back to a blank add-jump form, so reopening never resurrects a
    // half-finished edit of a jump the user backed out of.
    enterAddMode();
    status = { text: '' };
  }

  // Focus the dialog itself rather than the first field. Auto-focusing the
  // date input would spring the date picker open on iOS the moment the
  // modal appears, which is worse than a keystroke saved.
  $effect(() => {
    if (modalOpen) dialogEl?.focus();
  });

  // Stop the page behind the modal scrolling under it on touch devices.
  $effect(() => {
    if (!modalOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  });

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && modalOpen) closeModal();
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

<svelte:window onkeydown={handleKeydown} />

<button type="button" class="log-jump-trigger" onclick={openAdd}>&plus; Log a jump</button>

{#if modalOpen}
  <!--
    Backdrop scrolls rather than the panel: the form is tall enough to
    exceed a phone viewport, and an inner scroll area would strand the
    submit button. The min-h-full flex wrapper keeps it centred when it
    does fit. Closing on a backdrop click therefore tests containment
    rather than TandemNameModal's target===currentTarget — clicks can land
    on that wrapper as well as the backdrop itself.
  -->
  <div
    class="fixed inset-0 z-20 overflow-y-auto bg-[rgba(11,22,32,0.5)] p-4"
    onclick={(e) => {
      if (dialogEl && !dialogEl.contains(e.target as Node)) closeModal();
    }}
    role="presentation"
  >
    <div class="flex min-h-full items-center justify-center">
      <div
        bind:this={dialogEl}
        tabindex="-1"
        class="w-full max-w-[520px] bg-panel rounded-card shadow-card px-4 pt-3.5 pb-4 outline-none"
        role="dialog"
        aria-modal="true"
        aria-labelledby="logFormTitle"
      >
        <div class="flex items-baseline justify-between gap-2 mb-2.5">
          <h2 id="logFormTitle" class="m-0 text-[17px] font-bold tracking-[-0.01em]">
            {editingAt ? 'Edit jump' : 'Log a jump'}
          </h2>
          <span class="font-mono font-semibold text-sm text-gold">#{displayNumber}</span>
        </div>
        <form
          method="POST"
    action={editingAt ? '?/updateJump' : '?/logJump'}
    use:enhance={() => {
      saving = true;
      status = { text: 'Saving…' };
      const wasEditing = editingAt;
      return async ({ result, update }) => {
        saving = false;
        if (result.type === 'success') {
          // The saved jump appearing in the list behind is the confirmation,
          // so just close — a status message here would be dismissed with it.
          closeModal();
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
        <!--
          appearance-none is the actual fix here, not min-w-0/max-w-full
          (kept as harmless belt-and-braces): Safari renders
          input[type=date] with its own native control chrome, and that
          native rendering ignores the box's computed width outright —
          it was overflowing the card even at 100% width on a single-
          column (mobile) layout, nothing to do with the grid/flex sizing
          min-w-0 fixes elsewhere in this file. appearance-none drops
          Safari's native skin so the input lays out like any other
          text-like box and finally respects width:100% — same
          date-picker tap behavior, just without the small calendar
          glyph Safari drew as part of that native chrome.
        -->
        <input
          type="date"
          name="date"
          class="{FIELD_INPUT} min-w-0 max-w-full appearance-none"
          required
          bind:value={form.date}
        />
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
        <!--
          Numeric input with the unit rendered beside it rather than typed:
          "ft" is appended on display (see formatExitAltitude), so there's
          nothing to key in on a phone but the number itself. inputmode
          numeric gets the digit keypad on iOS.
        -->
        <div class="altitude-field">
          <input
            type="number"
            inputmode="numeric"
            name="exitAltitude"
            class="{FIELD_INPUT} min-w-0 altitude-input"
            placeholder="e.g. 13000"
            autocomplete="off"
            min="0"
            step="100"
            bind:value={form.exitAltitude}
          />
          <span class="altitude-unit" aria-hidden="true">ft</span>
        </div>
      </label>
      <label class={FIELD_LABEL}>
        <span>Rig</span>
        <select
          name="rigId"
          class={FIELD_SELECT}
          bind:value={form.rigId}
          onchange={() => (touched.rigId = true)}
        >
          <option value="">No rig selected</option>
          {#each settings.rigs as rig (rig.id)}
            <option value={rig.id}>{rig.name}</option>
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
            <button
              type="button"
              class="appearance-none border-0 bg-transparent text-ink-soft font-sans text-[13px] font-semibold cursor-pointer p-0 underline"
              onclick={closeModal}
            >
              Cancel
            </button>
            <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
          </div>
        </form>
      </div>
    </div>
  </div>
{/if}

<section class="bg-panel border border-line rounded-card shadow-card overflow-hidden">
  <ul class="list-none m-0 p-0">
    {#each entries as entry (entry.at)}
      {@const isExpanded = expanded.has(entry.at)}
      {@const badge = tandemBadge(entry.jumpType)}
      <li class="logbook-entry">
        <button type="button" class="logbook-row" aria-expanded={isExpanded} onclick={() => toggleExpanded(entry.at)}>
          <span class="logbook-row-number">#{entry.number}</span>
          <span class="logbook-row-date">{formatShortDate(entry.date)}</span>
          <span class="logbook-row-place">
            <span class="logbook-row-place-name">{entry.place || '—'}</span>
            {#if badge}
              <span class="logbook-row-pill" data-kind={badge.kind}>{badge.label}</span>
            {/if}
          </span>
          <span class="logbook-row-chevron">&rsaquo;</span>
        </button>
        {#if isExpanded}
          <div class="logbook-details">
            <dl class="logbook-details-grid">
              <div><dt>Jump type</dt><dd>{dash(entry.jumpType)}</dd></div>
              <div><dt>Exit altitude</dt><dd>{dash(formatExitAltitude(entry.exitAltitude))}</dd></div>
              <div><dt>Aircraft</dt><dd>{dash(entry.aircraft)}</dd></div>
              <div><dt>Rig</dt><dd>{dash(entry.rig)}</dd></div>
              <div><dt>Canopy</dt><dd>{dash(entry.canopy)}</dd></div>
              <div><dt>Lineset</dt><dd>{dash(entry.lineset)}</dd></div>
              <div><dt>Pilot chute</dt><dd>{dash(entry.pilotChute)}</dd></div>
              <div><dt>Container</dt><dd>{dash(entry.container)}</dd></div>
            </dl>
            {#if entry.description}<p class="logbook-details-description">{entry.description}</p>{/if}
            <div class="logbook-details-actions">
              <button type="button" class="logbook-edit" onclick={() => openEdit(entry)}>Edit</button>
              <form
                method="POST"
                action="?/deleteJump"
                use:enhance={() => {
                  const wasEditing = entry.at === editingAt;
                  return async ({ update }) => {
                    if (wasEditing) closeModal();
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
  .log-jump-trigger {
    appearance: none;
    border: 0;
    border-radius: 0.75rem;
    width: 100%;
    height: 46px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 15px;
    color: white;
    background: var(--gold);
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 80ms ease,
      filter 80ms ease;
  }

  .log-jump-trigger:active {
    transform: scale(0.99);
    filter: brightness(0.95);
  }

  .log-jump-trigger:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }

  .altitude-field {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .altitude-input {
    flex: 1;
  }

  .altitude-unit {
    flex: none;
    font-size: 13px;
    font-weight: 600;
    color: var(--ink-soft);
  }

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
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .logbook-row-place-name {
    font-size: 14px;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* flex:none so a long place name truncates before the badge does. */
  .logbook-row-pill {
    flex: none;
    font-family: var(--font-sans);
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    border-radius: 999px;
    padding: 2px 8px;
    line-height: 1.6;
  }

  .logbook-row-pill[data-kind='camera'] {
    color: var(--camera);
    background: var(--camera-soft);
  }

  /* Reuses the existing --instructor pair rather than adding a token: it's
     named for exactly this, and the teal reads clearly apart from the
     camera badge's orange. */
  .logbook-row-pill[data-kind='instructor'] {
    color: var(--instructor);
    background: var(--instructor-soft);
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
