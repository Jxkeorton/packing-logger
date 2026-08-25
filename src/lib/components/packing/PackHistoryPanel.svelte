<script lang="ts">
  import { CATEGORIES, CATEGORY_LABELS, type HistoryRow } from '$lib/packing';
  import type { AggregateRow } from '$lib/server/invoice';
  import { CATEGORY_TEXT_CLASS } from '$lib/category-colors';
  import {
    TOGGLE_SECTION,
    TOGGLE_BUTTON,
    TOGGLE_ICON,
    TOGGLE_PANEL,
    HISTORY_TABS,
    HISTORY_TAB,
    HISTORY_EMPTY,
    HISTORY_SCROLL,
    HISTORY_TABLE,
    HISTORY_THEAD_ROW,
    HISTORY_TBODY_ROW,
    HISTORY_CELL_LEFT,
    HISTORY_CELL_RIGHT,
  } from '$lib/ui-classes';
  import AggregateTable from '$lib/components/AggregateTable.svelte';

  let { dayRows, weekRows, monthRows }: { dayRows: HistoryRow[]; weekRows: AggregateRow[]; monthRows: AggregateRow[] } =
    $props();

  const money = (n: number) => `£${n.toFixed(2)}`;

  let open = $state(false);
  let activeView = $state<'day' | 'week' | 'month'>('day');

  // AggregateTable is shared with the Tandems tab and doesn't know about
  // "packs" vs "jumps" — each caller normalizes its own AggregateRow
  // shape (totalPacks here, totalJumps for Tandems) into the same
  // { total, earnings } pair.
  const weekView = $derived(
    weekRows.map((r) => ({ key: r.key, isCurrent: r.isCurrent, rangeLabel: r.rangeLabel, counts: r.counts, total: r.totalPacks, earnings: r.totalEarnings })),
  );
  const monthView = $derived(
    monthRows.map((r) => ({ key: r.key, isCurrent: r.isCurrent, rangeLabel: r.rangeLabel, counts: r.counts, total: r.totalPacks, earnings: r.totalEarnings })),
  );
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>History</span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class={TOGGLE_PANEL}>
      <div class={HISTORY_TABS} role="tablist" aria-label="Group history by">
        <button type="button" role="tab" class={HISTORY_TAB} aria-selected={activeView === 'day'} onclick={() => (activeView = 'day')}>Day</button>
        <button type="button" role="tab" class={HISTORY_TAB} aria-selected={activeView === 'week'} onclick={() => (activeView = 'week')}>Week</button>
        <button type="button" role="tab" class={HISTORY_TAB} aria-selected={activeView === 'month'} onclick={() => (activeView = 'month')}>Month</button>
      </div>

      {#if activeView === 'day'}
        {#if dayRows.length === 0}
          <p class={HISTORY_EMPTY}>Nothing logged yet before today.</p>
        {:else}
          <div class={HISTORY_SCROLL}>
            <table class={HISTORY_TABLE}>
              <thead>
                <tr class={HISTORY_THEAD_ROW}>
                  <th scope="col" class={HISTORY_CELL_LEFT}>Date</th>
                  {#each CATEGORIES as c (c)}
                    <th scope="col" class="{HISTORY_CELL_RIGHT} {CATEGORY_TEXT_CLASS[c]}">{CATEGORY_LABELS[c].slice(0, 3)}</th>
                  {/each}
                  <th scope="col" class={HISTORY_CELL_RIGHT}>Packs</th>
                  <th scope="col" class={HISTORY_CELL_RIGHT}>Earned</th>
                </tr>
              </thead>
              <tbody>
                {#each dayRows as row (row.date)}
                  <tr class={HISTORY_TBODY_ROW}>
                    <td class={HISTORY_CELL_LEFT}>{row.date}</td>
                    {#each CATEGORIES as c (c)}
                      <td class="{HISTORY_CELL_RIGHT} {CATEGORY_TEXT_CLASS[c]}">{row.counts[c]}</td>
                    {/each}
                    <td class={HISTORY_CELL_RIGHT}>{row.totalPacks}</td>
                    <td class={HISTORY_CELL_RIGHT}>{money(row.totalEarnings)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {:else if activeView === 'week'}
        <AggregateTable rows={weekView} currentLabel="This week" categories={CATEGORIES} categoryLabels={CATEGORY_LABELS} unitLabel="Packs" />
      {:else}
        <AggregateTable rows={monthView} currentLabel="This invoice month" categories={CATEGORIES} categoryLabels={CATEGORY_LABELS} unitLabel="Packs" />
      {/if}
    </div>
  {/if}
</section>
