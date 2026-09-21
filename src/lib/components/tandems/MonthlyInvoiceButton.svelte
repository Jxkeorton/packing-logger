<script lang="ts">
  // The invoice-PDF export, pulled out of the History panel's month
  // table (where it was one easily-missed "Export PDF" link per row) and
  // promoted to a standalone action, since the current invoice month is
  // the one anyone actually exports most of the time. Same fetch-the-bytes
  // download + failed-state pattern as DownloadButton.svelte.
  import { downloadFile } from '$lib/client/download';
  import { FORM_SAVE_BUTTON } from '$lib/ui-classes';
  import Spinner from '../Spinner.svelte';

  // `months` is tandemMonthRows straight from the page load — newest
  // first, index 0 always the invoice period containing today (still
  // filling up). `index` counts backwards from there: incrementing it
  // steps to an older, already-closed period, so 0 is as far forward
  // ("into the future") as the arrows ever allow.
  let { months }: { months: { key: string; rangeLabel: string }[] } = $props();

  let index = $state(0);

  // Guards against `months` shrinking out from under a selection (e.g.
  // a background refresh after the page's been open a while) rather
  // than pointing at a now-missing row.
  $effect(() => {
    if (index > months.length - 1) index = Math.max(0, months.length - 1);
  });

  const month = $derived(months[index]);
  const canGoOlder = $derived(index < months.length - 1);
  const canGoNewer = $derived(index > 0);

  let busy = $state(false);
  let failed = $state(false);

  function older() {
    if (!canGoOlder || busy) return;
    index += 1;
    failed = false;
  }

  function newer() {
    if (!canGoNewer || busy) return;
    index -= 1;
    failed = false;
  }

  async function handleClick() {
    busy = true;
    failed = false;
    const { ok } = await downloadFile(
      `/api/tandem-invoice.pdf?month=${encodeURIComponent(month.key)}`,
      'invoice.pdf',
    );
    failed = !ok;
    busy = false;
    if (!ok) setTimeout(() => (failed = false), 2000);
  }
</script>

<div class="flex flex-col items-center gap-1.5">
  <button
    type="button"
    class="{FORM_SAVE_BUTTON} w-full flex items-center justify-center gap-2"
    class:bg-danger={failed}
    disabled={busy}
    onclick={handleClick}
  >
    {#if busy}<Spinner size={14} />{/if}{failed ? 'Export failed' : 'Export monthly invoice'}
  </button>

  <div class="flex items-center gap-2">
    <button
      type="button"
      class="month-nav-btn"
      disabled={!canGoOlder || busy}
      aria-label="Previous invoice month"
      onclick={older}
    >
      &lsaquo;
    </button>
    <span class="m-0 text-[12.5px] text-ink-soft">{month.rangeLabel}</span>
    <button
      type="button"
      class="month-nav-btn"
      disabled={!canGoNewer || busy}
      aria-label="Next invoice month"
      onclick={newer}
    >
      &rsaquo;
    </button>
  </div>
</div>

<style>
  .month-nav-btn {
    appearance: none;
    border: 0;
    background: transparent;
    color: var(--ink-soft);
    font-size: 18px;
    line-height: 1;
    width: 22px;
    height: 22px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .month-nav-btn:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .month-nav-btn:not(:disabled):hover,
  .month-nav-btn:not(:disabled):focus-visible {
    background: var(--line);
    outline: none;
  }
</style>
