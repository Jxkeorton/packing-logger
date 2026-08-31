<script lang="ts">
  // The row chrome (icon, label, chevron, expand/collapse) lives in
  // SettingsRow.svelte, which wraps this in +page.svelte — this
  // component only ever renders its own content.
  import { enhance } from '$app/forms';
  import type { InvoiceSettings } from '$lib/server/invoice-settings';
  import {
    FIELD_LABEL,
    FIELD_LABEL_NARROW,
    FIELD_INPUT,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    FORM_STATUS,
    PANEL_HINT,
  } from '$lib/ui-classes';
  import Spinner from '../Spinner.svelte';

  let { invoiceSettings }: { invoiceSettings: InvoiceSettings } = $props();

  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });
  let submitting = $state(false);
</script>

<div>
      <p class={PANEL_HINT}>
        Used on the "Export PDF" invoices below — your details, who it's billed to, and the next invoice number.
      </p>
      <form
        method="POST"
        action="?/saveInvoiceSettings"
        use:enhance={() => {
          submitting = true;
          status = { text: 'Saving…' };
          return async ({ result, update }) => {
            status =
              result.type === 'success'
                ? { text: 'Saved', kind: 'ok' }
                : { text: (result as { data?: { error?: string } }).data?.error ?? 'Failed to save', kind: 'error' };
            // reset:false — these fields aren't bind:value-controlled, but
            // the default native form.reset() would still wipe whatever
            // the user just typed back to the *original* prop values
            // (its only source of a defaultValue), not just leave them —
            // same root cause as LogForm.svelte's, different field kind.
            await update({ reset: false });
            submitting = false;
          };
        }}
      >
        <label class={FIELD_LABEL}>
          <span>Your name</span>
          <input type="text" name="fromName" class={FIELD_INPUT} value={invoiceSettings.fromName} required />
        </label>
        <label class={FIELD_LABEL}>
          <span>Your address (one line each)</span>
          <textarea name="fromAddress" class={FIELD_INPUT} rows="4">{invoiceSettings.fromAddress.join('\n')}</textarea>
        </label>
        <label class={FIELD_LABEL}>
          <span>VAT note</span>
          <input type="text" name="vatNote" class={FIELD_INPUT} value={invoiceSettings.vatNote} />
        </label>
        <label class={FIELD_LABEL}>
          <span>Bill to (one line each)</span>
          <textarea name="billTo" class={FIELD_INPUT} rows="4">{invoiceSettings.billTo.join('\n')}</textarea>
        </label>
        <label class={FIELD_LABEL_NARROW}>
          <span>Next invoice ref</span>
          <input
            type="number"
            name="nextInvoiceRef"
            class={FIELD_INPUT}
            min="1"
            step="1"
            value={invoiceSettings.nextInvoiceRef}
            required
          />
        </label>
        <div class={FORM_ACTIONS}>
          <button type="submit" class="{FORM_SAVE_BUTTON} flex items-center justify-center gap-2" disabled={submitting}>
            {#if submitting}<Spinner size={14} />{/if}Save details
          </button>
          <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
        </div>
      </form>
</div>
