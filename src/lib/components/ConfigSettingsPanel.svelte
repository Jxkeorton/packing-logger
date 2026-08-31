<script lang="ts">
  // The row chrome (icon, label, chevron, expand/collapse) lives in
  // SettingsRow.svelte, which wraps this in +page.svelte — this
  // component only ever renders its own content.
  //
  // Same auto-submit-per-checkbox pattern as WorkJumpsSettingsPanel —
  // see its own comment for why that's a form each rather than one
  // form with a Save button.
  import { enhance } from '$app/forms';
  import type { AppTab } from '$lib/server/tab-visibility';
  import { PANEL_HINT } from '$lib/ui-classes';
  import Spinner from './Spinner.svelte';

  let { visibility }: { visibility: Record<AppTab, boolean> } = $props();

  const TABS: { id: AppTab; label: string }[] = [
    { id: 'packing', label: 'Packing' },
    { id: 'tandems', label: 'Work jumps' },
  ];

  let pendingTab = $state<AppTab | null>(null);
</script>

<p class={PANEL_HINT}>
  Logbook always shows. Hiding Packing or Work jumps only removes its tab — nothing it tracks is affected, and it's
  back the moment you turn it on again.
</p>

{#each TABS as tab (tab.id)}
  <form
    method="POST"
    action="?/saveTabVisibility"
    use:enhance={() => {
      pendingTab = tab.id;
      return async ({ update }) => {
        await update({ reset: false });
        pendingTab = null;
      };
    }}
  >
    <input type="hidden" name="tab" value={tab.id} />
    <label class="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft last:mb-0">
      <input
        type="checkbox"
        name="visible"
        checked={visibility[tab.id]}
        disabled={pendingTab === tab.id}
        class="size-4"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <span>Show {tab.label}</span>
      {#if pendingTab === tab.id}<Spinner size={12} />{/if}
    </label>
  </form>
{/each}
