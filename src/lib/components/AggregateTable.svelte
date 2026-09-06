<script lang="ts">
  // One shared component for what were two near-duplicate files in the
  // main app (AggregateTable.astro + TandemAggregateTable.astro — same
  // week/month table, differing only in category set). Callers normalize
  // their own AggregateRow shape (packing's totalPacks vs tandem's
  // totalJumps) into the common `{ total, earnings }` pair below, so this
  // component doesn't need to know which log it's showing. The tandem
  // invoice-month PDF export used to be a per-row link here; it's now a
  // standalone button below the History panel (MonthlyInvoiceButton).
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
  }: {
    rows: RowView[];
    currentLabel: string;
    categories: readonly string[];
    categoryLabels: Record<string, string>;
    unitLabel: string;
  } = $props();

  const money = (n: number) => `£${n.toFixed(2)}`;
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
