<script lang="ts">
  // The row chrome (icon, label, chevron, expand/collapse) lives in
  // SettingsRow.svelte, which wraps this in +page.svelte — this
  // component only ever renders its own content.
  import { enhance } from '$app/forms';
  import { FIELD_LABEL_NARROW, FIELD_INPUT, FORM_ACTIONS, FORM_SAVE_BUTTON, FORM_STATUS, PANEL_HINT } from '$lib/ui-classes';

  let { baseJumps }: { baseJumps: number } = $props();

  let value = $state(baseJumps);
  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });

  // `value` is a local editable draft seeded from the prop, not tied to
  // it — but should still pick up a fresh baseJumps if the prop ever
  // changes for a reason other than this form's own submit (e.g. another
  // tab open on the same page). $state(baseJumps) above only captures the
  // value at mount; this keeps it in sync after that.
  $effect(() => {
    value = baseJumps;
  });
</script>

<div>
  <p class={PANEL_HINT}>
    Jumps you logged before using this app — added to the count above so numbering carries on correctly.
  </p>
  <form
    method="POST"
    action="?/setBaseJumps"
    use:enhance={() => {
      status = { text: 'Saving…' };
      return async ({ result, update }) => {
        status =
          result.type === 'success'
            ? { text: 'Saved', kind: 'ok' }
            : { text: (result as { data?: { error?: string } }).data?.error ?? 'Failed to save', kind: 'error' };
        await update({ reset: false }); // see LogForm.svelte's submit handler for why
      };
    }}
  >
    <label class={FIELD_LABEL_NARROW}>
      <span>Jumps logged before this app</span>
      <input type="number" name="baseJumps" class={FIELD_INPUT} min="0" step="1" bind:value required />
    </label>
    <div class={FORM_ACTIONS}>
      <button type="submit" class={FORM_SAVE_BUTTON}>Save</button>
      <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
    </div>
  </form>
</div>
