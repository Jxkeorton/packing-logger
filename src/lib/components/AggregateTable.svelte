<script lang="ts">
  // One shared component for what were two near-duplicate files in the
  // main app (AggregateTable.astro + TandemAggregateTable.astro — same
  // week/month table, differing only in category set and an optional
  // "Export PDF" column for tandem invoice months). Callers normalize
  // their own AggregateRow shape (packing's totalPacks vs tandem's
  // totalJumps) into the common `{ total, earnings }` pair below, so this
  // component doesn't need to know which log it's showing.
  import { downloadFile } from '$lib/client/download';
  import { CATEGORY_TEXT_CLASS } from '$lib/category-colors';
  import { HISTORY_SCROLL, HISTORY_TABLE, HISTORY_THEAD_ROW, HISTORY_TBODY_ROW, HISTORY_CELL_LEFT, HISTORY_CELL_RIGHT } from '$lib/ui-classes';

  interface RowView {
    key: string;
    isCurrent: boolean;
    rangeLabel: string;
    counts: Record<string, number>;
    total: number;
    earnings: number;
  }

  let {
    rows,
    currentLabel,
    categories,
    categoryLabels,
    unitLabel,
    exportHref,
  }: {
    rows: RowView[];
    currentLabel: string;
    categories: readonly string[];
    categoryLabels: Record<string, string>;
    unitLabel: string;
    /** Present only for the tandem invoice-month table: `(monthKey) => downloadUrl`. */
    exportHref?: (monthKey: string) => string;
  } = $props();

  const money = (n: number) => `£${n.toFixed(2)}`;

  let exportingKey = $state<string | null>(null);
  // A failed export used to just silently reset the button — same result
  // as tapping it and having nothing happen at all, with no way to tell
  // the two apart. Mirrors DownloadButton.svelte's failed/timeout pattern.
  let failedKey = $state<string | null>(null);

  async function exportMonth(key: string) {
    if (!exportHref) return;
    exportingKey = key;
    failedKey = null;
    const { ok } = await downloadFile(exportHref(key), 'invoice.pdf');
    exportingKey = null;
    if (!ok) {
      failedKey = key;
      setTimeout(() => {
        if (failedKey === key) failedKey = null;
      }, 2000);
    }
  }
</script>

<div class={HISTORY_SCROLL}>
  <table class={HISTORY_TABLE}>
    <thead>
      <tr class={HISTORY_THEAD_ROW}>
        <th scope="col" class={HISTORY_CELL_LEFT}>Range</th>
        {#each categories as c (c)}
          <th scope="col" class="{HISTORY_CELL_RIGHT} {CATEGORY_TEXT_CLASS[c]}">{categoryLabels[c].slice(0, 3)}</th>
        {/each}
        <th scope="col" class={HISTORY_CELL_RIGHT}>{unitLabel}</th>
        <th scope="col" class={HISTORY_CELL_RIGHT}>Earned</th>
        {#if exportHref}<th scope="col" class={HISTORY_CELL_RIGHT}>Invoice</th>{/if}
      </tr>
    </thead>
    <tbody>
      {#each rows as row (row.key)}
        <tr class={HISTORY_TBODY_ROW} class:current-row={row.isCurrent}>
          <td class={HISTORY_CELL_LEFT}>
            {#if row.isCurrent}
              <span class="block font-sans font-bold text-gold text-xs">{currentLabel}</span>
              <span class="block text-[11px] text-ink-soft">{row.rangeLabel}</span>
            {:else}
              {row.rangeLabel}
            {/if}
          </td>
          {#each categories as c (c)}
            <td class="{HISTORY_CELL_RIGHT} {CATEGORY_TEXT_CLASS[c]}">{row.counts[c]}</td>
          {/each}
          <td class={HISTORY_CELL_RIGHT}>{row.total}</td>
          <td class={HISTORY_CELL_RIGHT}>{money(row.earnings)}</td>
          {#if exportHref}
            <td class="p-2 text-right">
              <button
                type="button"
                class="appearance-none inline-block border-0 bg-transparent p-0 font-sans text-[11.5px] font-semibold no-underline border-b border-current whitespace-nowrap cursor-pointer disabled:opacity-60 disabled:cursor-default"
                class:text-gold={failedKey !== row.key}
                class:text-danger={failedKey === row.key}
                disabled={exportingKey === row.key}
                onclick={() => exportMonth(row.key)}
              >
                {failedKey === row.key ? 'Export failed' : 'Export PDF'}
              </button>
            </td>
          {/if}
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .current-row {
    background: rgba(184, 134, 46, 0.08);
  }
</style>
