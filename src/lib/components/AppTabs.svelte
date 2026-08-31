<script lang="ts">
  // Port of AppTabs.astro — the top-level Packing / Work jumps / Logbook
  // switcher ("Work jumps" is the display label; the tab's internal id
  // stays 'tandems', same as the module and route it renders — this is
  // a display-only rename). There, this owned only the buttons and wired
  // them up to
  // sibling [data-app-view] sections via a shared dom.ts helper; here the
  // active tab is just $state owned by +page.svelte and passed down
  // $bindable, and the views it controls are `{#if}`s in the same file.
  //
  // Packing and Work jumps can each be turned off from Settings > Config
  // (tab-visibility.ts) — Logbook can't, so it's never conditional here,
  // the one tab guaranteed to still be there if the other two are hidden.
  import type { AppTab } from '$lib/server/tab-visibility';

  let {
    activeTab = $bindable(),
    visibility,
    onSelect,
  }: {
    activeTab: 'packing' | 'tandems' | 'logbook';
    visibility: Record<AppTab, boolean>;
    /**
     * Fired on every tab click, even one that leaves activeTab unchanged
     * (re-tapping the tab already open). +page.svelte uses this to close
     * Settings — its own effect watching activeTab only fires on an
     * actual change, so without this, tapping the tab you're already on
     * while Settings is open did nothing.
     */
    onSelect?: () => void;
  } = $props();

  const tabClass =
    'flex-1 appearance-none border border-line bg-panel text-ink-soft font-sans font-bold text-sm p-2.5 rounded-[10px] cursor-pointer aria-selected:bg-ink aria-selected:border-ink aria-selected:text-canvas';
</script>

<div class="flex gap-2" role="tablist" aria-label="Section">
  {#if visibility.packing}
    <button
      type="button"
      class={tabClass}
      role="tab"
      aria-selected={activeTab === 'packing'}
      onclick={() => {
        activeTab = 'packing';
        onSelect?.();
      }}
    >
      Packing
    </button>
  {/if}
  {#if visibility.tandems}
    <button
      type="button"
      class={tabClass}
      role="tab"
      aria-selected={activeTab === 'tandems'}
      onclick={() => {
        activeTab = 'tandems';
        onSelect?.();
      }}
    >
      Work jumps
    </button>
  {/if}
  <button
    type="button"
    class={tabClass}
    role="tab"
    aria-selected={activeTab === 'logbook'}
    onclick={() => {
      activeTab = 'logbook';
      onSelect?.();
    }}
  >
    Logbook
  </button>
</div>
