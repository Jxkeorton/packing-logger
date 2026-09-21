<script lang="ts">
  import { CATEGORIES, CATEGORY_LABELS, type HistoryRow } from '$lib/packing';
  import type { AggregateRow } from '$lib/server/invoice';
  import { CATEGORY_TEXT_CLASS } from '$lib/category-colors';
  import { formatMoney as money } from '$lib/format';
  import {
    PANEL_TITLE,
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

<section>
  <h2 class={PANEL_TITLE}>History</h2>

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
              {#each dayRows as row, i (row.date)}
                <tr class="{HISTORY_TBODY_ROW} {i % 2 === 1 ? 'bg-ink/5' : ''}">
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
</section>
