<script lang="ts">
  // The row chrome (icon, label, chevron, expand/collapse) lives in
  // SettingsRow.svelte, which wraps this in +page.svelte — this
  // component only ever renders its own content.
  //
  // One form covering all seven rates, saved together with a single
  // Save button — see actions/rates.ts's own comment for why that's a
  // better fit here than the per-field auto-submit
  // ConfigSettingsPanel/WorkJumpsSettingsPanel use.
  import { enhance } from '$app/forms';
  import type { RateSettings } from '$lib/server/rate-settings';
  import {
    FIELD_LABEL_NARROW,
    FIELD_INPUT,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    FORM_STATUS,
    PANEL_HINT,
  } from '$lib/ui-classes';
  import Spinner from '../Spinner.svelte';

  let { rates }: { rates: RateSettings } = $props();

  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });
  let submitting = $state(false);
</script>

<p class={PANEL_HINT}>
  What each service actually pays. Packing rates show on the Packing tab; Work jumps rates show on the Work jumps
  tab and are what the invoice bills at — Videographer cash call is the gross "video & photos package" line, not a
  per-jump pay rate, so it's higher than Videographer on its own.
</p>

<form
  method="POST"
  action="?/saveRateSettings"
  use:enhance={() => {
    submitting = true;
    status = { text: 'Saving…' };
    return async ({ result, update }) => {
      status =
        result.type === 'success'
          ? { text: 'Saved', kind: 'ok' }
          : { text: (result as { data?: { error?: string } }).data?.error ?? 'Failed to save', kind: 'error' };
      await update({ reset: false });
      submitting = false;
    };
  }}
>
  <h3 class="mt-0 mb-1.5 text-[15px] font-bold tracking-[-0.01em]">Packing</h3>
  <div class="grid grid-cols-2 gap-x-2.5 gap-y-0 max-[420px]:grid-cols-1">
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Tandem rigs</span>
      <input type="number" name="packing_tandem" class={FIELD_INPUT} min="0" step="0.01" value={rates.packing.tandem} required />
    </label>
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Instructor rigs</span>
      <input
        type="number"
        name="packing_instructor"
        class={FIELD_INPUT}
        min="0"
        step="0.01"
        value={rates.packing.instructor}
        required
      />
    </label>
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Student rigs</span>
      <input
        type="number"
        name="packing_student"
        class={FIELD_INPUT}
        min="0"
        step="0.01"
        value={rates.packing.student}
        required
      />
    </label>
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Sport rigs</span>
      <input type="number" name="packing_sport" class={FIELD_INPUT} min="0" step="0.01" value={rates.packing.sport} required />
    </label>
  </div>

  <h3 class="mt-3.5 mb-1.5 text-[15px] font-bold tracking-[-0.01em]">Work Jumps</h3>
  <div class="grid grid-cols-2 gap-x-2.5 gap-y-0 max-[420px]:grid-cols-1">
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Tandem instructing</span>
      <input
        type="number"
        name="tandem_instructor"
        class={FIELD_INPUT}
        min="0"
        step="0.01"
        value={rates.tandem.instructor}
        required
      />
    </label>
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Videographer</span>
      <input
        type="number"
        name="tandem_videographer"
        class={FIELD_INPUT}
        min="0"
        step="0.01"
        value={rates.tandem.videographer}
        required
      />
    </label>
    <label class="{FIELD_LABEL_NARROW} mb-2.5">
      <span>Videographer cash call</span>
      <input
        type="number"
        name="videographerPackageRate"
        class={FIELD_INPUT}
        min="0"
        step="0.01"
        value={rates.videographerPackageRate}
        required
      />
    </label>
  </div>

  <div class={FORM_ACTIONS}>
    <button type="submit" class="{FORM_SAVE_BUTTON} flex items-center justify-center gap-2" disabled={submitting}>
      {#if submitting}<Spinner size={14} />{/if}Save rates
    </button>
    <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
  </div>
</form>
