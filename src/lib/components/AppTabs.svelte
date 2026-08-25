<script lang="ts">
  // Port of AppTabs.astro — the top-level Packing / Tandems / Logbook
  // switcher. There, this owned only the buttons and wired them up to
  // sibling [data-app-view] sections via a shared dom.ts helper; here the
  // active tab is just $state owned by +page.svelte and passed down
  // $bindable, and the views it controls are `{#if}`s in the same file.
  let {
    activeTab = $bindable(),
  }: { activeTab: 'packing' | 'tandems' | 'logbook' } = $props();

  const tabClass =
    'flex-1 appearance-none border border-line bg-panel text-ink-soft font-sans font-bold text-sm p-2.5 rounded-[10px] cursor-pointer aria-selected:bg-ink aria-selected:border-ink aria-selected:text-canvas';
</script>

<div class="flex gap-2" role="tablist" aria-label="Section">
  <button
    type="button"
    class={tabClass}
    role="tab"
    aria-selected={activeTab === 'packing'}
    onclick={() => (activeTab = 'packing')}
  >
    Packing
  </button>
  <button
    type="button"
    class={tabClass}
    role="tab"
    aria-selected={activeTab === 'tandems'}
    onclick={() => (activeTab = 'tandems')}
  >
    Tandems
  </button>
  <button
    type="button"
    class={tabClass}
    role="tab"
    aria-selected={activeTab === 'logbook'}
    onclick={() => (activeTab = 'logbook')}
  >
    Logbook
  </button>
</div>
