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

  // Ghost segments on the glass bar +page.svelte wraps this in, not
  // bordered cards of their own — the bar supplies the background/border,
  // this just needs the selected pill. min-w-0 lets a flex-1 button
  // shrink below its content's natural width instead of forcing the row
  // to grow; whitespace-nowrap + text-ellipsis turn "not enough room" into
  // a clipped label as a last resort instead of a second line, which used
  // to make the whole bar (and its siblings) taller on narrower phones —
  // "Work jumps" was the label that first hit this.
  const tabClass =
    'flex-1 min-w-0 appearance-none border-0 bg-transparent text-ink-soft font-sans font-bold text-[12.5px] tracking-[-0.01em] whitespace-nowrap overflow-hidden text-ellipsis px-2.5 py-1.5 rounded-[var(--radius-control)] cursor-pointer aria-selected:bg-ink aria-selected:text-canvas';
</script>

<div class="flex-1 flex gap-1 min-w-0" role="tablist" aria-label="Section">
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
