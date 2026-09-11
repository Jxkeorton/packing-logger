<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { CATEGORIES, CATEGORY_LABELS, type HistoryRow, type Jump } from '$lib/tandem';
  import type { AggregateRow } from '$lib/server/tandem-invoice';
  import { CATEGORY_TEXT_CLASS } from '$lib/category-colors';
  import { formatMoney as money } from '$lib/format';
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
  import Spinner from '../Spinner.svelte';

  let {
    dayRows,
    weekRows,
    monthRows,
    dayJumps,
  }: {
    dayRows: HistoryRow[];
    weekRows: AggregateRow[];
    monthRows: AggregateRow[];
    /** Each day row's individual jumps, keyed by date — the Day tab's own row plus this is what makes an already-logged jump findable to edit (see toggleHandyCam), rather than just its counts. */
    dayJumps: Record<string, Jump[]>;
  } = $props();

  let open = $state(false);
  let activeView = $state<'day' | 'week' | 'month'>('day');
  // Which date's row is expanded to show its individual jumps — one at a
  // time, so opening a new day doesn't leave the last one's list sitting
  // open further down the table.
  let expandedDate = $state<string | null>(null);
  let togglingAt = $state<string | null>(null);

  const weekView = $derived(
    weekRows.map((r) => ({ key: r.key, isCurrent: r.isCurrent, rangeLabel: r.rangeLabel, counts: r.counts, total: r.totalJumps, earnings: r.totalEarnings })),
  );
  const monthView = $derived(
    monthRows.map((r) => ({ key: r.key, isCurrent: r.isCurrent, rangeLabel: r.rangeLabel, counts: r.counts, total: r.totalJumps, earnings: r.totalEarnings })),
  );

  // Date, one column per category, Jumps, Earned.
  const DAY_COLSPAN = CATEGORIES.length + 3;

  // Shared by toggleHandyCam and setAfterJump below — both just post the
  // jump's desired end state and reload, the same fetch + invalidateAll()
  // pattern TandemCategoryCards' own addJump/deleteJump use, since this
  // list isn't a <form> either.
  async function postHandyCam(jump: Jump, handyCam: boolean, afterJump: boolean) {
    togglingAt = jump.at;
    try {
      const formData = new FormData();
      formData.set('at', jump.at);
      if (handyCam) formData.set('handyCam', 'on');
      if (afterJump) formData.set('afterJump', 'on');
      await fetch('?/setTandemJumpHandyCam', { method: 'POST', body: formData });
      await invalidateAll();
    } finally {
      togglingAt = null;
    }
  }

  // The "customer upgraded to Ultimate once they got home" flow — turning
  // it on defaults to "bought after the jump" (that's normally exactly why
  // this is being flagged from History rather than at logging time), with
  // its own checkbox below to correct that when it isn't. Turning it back
  // off clears both.
  function toggleHandyCam(jump: Jump) {
    return postHandyCam(jump, !jump.handyCam, true);
  }

  // Corrects the package/after-jump classification on a jump that's
  // already flagged — doesn't touch handyCam itself.
  function setAfterJump(jump: Jump, afterJump: boolean) {
    return postHandyCam(jump, true, afterJump);
  }
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>History</span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class={TOGGLE_PANEL}>
      <div class={HISTORY_TABS} role="tablist" aria-label="Group tandem history by">
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
                  <th scope="col" class={HISTORY_CELL_RIGHT}>Jumps</th>
                  <th scope="col" class={HISTORY_CELL_RIGHT}>Earned</th>
                </tr>
              </thead>
              <tbody>
                {#each dayRows as row (row.date)}
                  {@const isExpanded = expandedDate === row.date}
                  <tr class={HISTORY_TBODY_ROW}>
                    <td class={HISTORY_CELL_LEFT}>
                      <button
                        type="button"
                        class="flex items-center gap-0.5 appearance-none border-0 bg-transparent p-0 font-mono text-[inherit] text-left cursor-pointer touch-manipulation"
                        aria-expanded={isExpanded}
                        onclick={() => (expandedDate = isExpanded ? null : row.date)}
                      >
                        <span class="inline-block transition-transform duration-150 text-ink-soft" class:rotate-90={isExpanded}>&rsaquo;</span>
                        {row.date}
                      </button>
                    </td>
                    {#each CATEGORIES as c (c)}
                      <td class="{HISTORY_CELL_RIGHT} {CATEGORY_TEXT_CLASS[c]}">{row.counts[c]}</td>
                    {/each}
                    <td class={HISTORY_CELL_RIGHT}>{row.totalJumps}</td>
                    <td class={HISTORY_CELL_RIGHT}>{money(row.totalEarnings)}</td>
                  </tr>
                  {#if isExpanded}
                    <tr>
                      <td colspan={DAY_COLSPAN} class="p-0 border-b border-line">
                        <ul class="list-none m-0 py-1 px-2 bg-canvas">
                          {#each dayJumps[row.date] ?? [] as jump (jump.at)}
                            <li class="py-1.5 border-t border-line first:border-t-0 text-[12.5px] font-sans">
                              <div class="flex items-center gap-2">
                                <span class="shrink-0 font-mono text-[10px] font-bold uppercase {CATEGORY_TEXT_CLASS[jump.category]}">
                                  {CATEGORY_LABELS[jump.category].slice(0, 3)}
                                </span>
                                <span class="flex-1 min-w-0 truncate">{jump.name}</span>
                                {#if jump.level}
                                  <span class="shrink-0 px-1.5 py-0.5 rounded-full bg-line text-ink-soft font-mono text-[10px] font-semibold">{jump.level}</span>
                                {/if}
                                {#if jump.category === 'instructor'}
                                  <button
                                    type="button"
                                    class="shrink-0 appearance-none rounded-full border px-2 py-0.5 text-[10.5px] font-semibold cursor-pointer touch-manipulation disabled:opacity-60 disabled:cursor-default flex items-center gap-1 {jump.handyCam ? 'bg-gold text-white border-gold' : 'bg-transparent text-ink-soft border-line-strong'}"
                                    aria-pressed={jump.handyCam}
                                    disabled={togglingAt === jump.at}
                                    onclick={() => toggleHandyCam(jump)}
                                  >
                                    {#if togglingAt === jump.at}<Spinner size={11} />{:else}{jump.handyCam ? '✓ Handy cam' : '+ Handy cam'}{/if}
                                  </button>
                                {/if}
                              </div>
                              {#if jump.category === 'instructor' && jump.handyCam}
                                <label class="mt-1 ml-[26px] flex items-center gap-1.5 text-[11px] text-ink-soft cursor-pointer w-fit">
                                  <input
                                    type="checkbox"
                                    class="size-3.5 accent-gold"
                                    checked={jump.handyCamAfterJump}
                                    disabled={togglingAt === jump.at}
                                    onchange={(e) => setAfterJump(jump, e.currentTarget.checked)}
                                  />
                                  Bought after the jump
                                  <!-- Unticked = the Ultimate package, bought upfront — what the employer's
                                       invoice needs kept apart from a jump the customer upgraded on later. -->
                                </label>
                              {/if}
                            </li>
                          {:else}
                            <li class="py-1.5 text-ink-soft text-[12px]">No jumps recorded.</li>
                          {/each}
                        </ul>
                      </td>
                    </tr>
                  {/if}
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {:else if activeView === 'week'}
        <AggregateTable rows={weekView} currentLabel="This week" categories={CATEGORIES} categoryLabels={CATEGORY_LABELS} unitLabel="Jumps" />
      {:else}
        <AggregateTable
          rows={monthView}
          currentLabel="This invoice month"
          categories={CATEGORIES}
          categoryLabels={CATEGORY_LABELS}
          unitLabel="Jumps"
        />
      {/if}
    </div>
  {/if}
</section>
