<script lang="ts">
  // A list of "Show X" checkboxes, each its own auto-submitting form.
  // ConfigSettingsPanel (visible tabs) and WorkJumpsSettingsPanel
  // (visible category cards) were the same ~40 lines of this apart from
  // the item list, the hidden field name, and the action — so it lives
  // here once.
  //
  // A form each, rather than one form with a Save button: there's nothing
  // else on the row to batch a save with, and it means turning one row
  // off can't carry a half-typed change to another along with it. The
  // row's own chrome (icon, label, chevron) is SettingsRow.svelte, which
  // wraps this in +page.svelte.
  import { enhance } from '$app/forms';
  import { PANEL_HINT } from '$lib/ui-classes';
  import Spinner from './Spinner.svelte';

  let {
    hint,
    action,
    field,
    items,
    checked,
  }: {
    hint: string;
    /** The form action, e.g. "?/saveTabVisibility". */
    action: string;
    /** The hidden field carrying which row was toggled, e.g. "tab" or "category". */
    field: string;
    items: { id: string; label: string }[];
    checked: (id: string) => boolean;
  } = $props();

  let pendingId = $state<string | null>(null);
</script>

<p class={PANEL_HINT}>{hint}</p>

{#each items as item (item.id)}
  <form
    method="POST"
    {action}
    use:enhance={() => {
      pendingId = item.id;
      return async ({ update }) => {
        await update({ reset: false });
        pendingId = null;
      };
    }}
  >
    <input type="hidden" name={field} value={item.id} />
    <label class="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft last:mb-0">
      <input
        type="checkbox"
        name="visible"
        checked={checked(item.id)}
        disabled={pendingId === item.id}
        class="size-4"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <span>Show {item.label}</span>
      {#if pendingId === item.id}<Spinner size={12} />{/if}
    </label>
  </form>
{/each}
