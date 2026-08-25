<script lang="ts">
  import { enhance } from '$app/forms';
  import type { InvoiceSettings } from '$lib/server/invoice-settings';
  import {
    TOGGLE_SECTION,
    TOGGLE_BUTTON,
    TOGGLE_ICON,
    TOGGLE_PANEL,
    TOGGLE_PANEL_PADDED,
    FIELD_LABEL,
    FIELD_LABEL_NARROW,
    FIELD_INPUT,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    FORM_STATUS,
    PANEL_HINT,
  } from '$lib/ui-classes';

  let { invoiceSettings }: { invoiceSettings: InvoiceSettings } = $props();

  let open = $state(false);
  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>Invoice details</span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class="{TOGGLE_PANEL} {TOGGLE_PANEL_PADDED}">
      <p class={PANEL_HINT}>
        Used on the "Export PDF" invoices below — your details, who it's billed to, and the next invoice number.
      </p>
      <form
        method="POST"
        action="?/saveInvoiceSettings"
        use:enhance={() => {
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
          <button type="submit" class={FORM_SAVE_BUTTON}>Save details</button>
          <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
        </div>
      </form>
    </div>
  {/if}
</section>
