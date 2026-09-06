<script lang="ts">
  // The invoice-PDF export, pulled out of the History panel's month
  // table (where it was one easily-missed "Export PDF" link per row) and
  // promoted to a standalone action for the current invoice month, since
  // that's the one anyone actually exports. Same fetch-the-bytes download
  // + failed-state pattern as DownloadButton.svelte.
  import { downloadFile } from '$lib/client/download';
  import { FORM_SAVE_BUTTON_SECONDARY, PANEL_HINT } from '$lib/ui-classes';
  import Spinner from '../Spinner.svelte';

  let { monthKey, rangeLabel }: { monthKey: string; rangeLabel: string } = $props();

  let busy = $state(false);
  let failed = $state(false);

  async function handleClick() {
    busy = true;
    failed = false;
    const { ok } = await downloadFile(
      `/api/tandem-invoice.pdf?month=${encodeURIComponent(monthKey)}`,
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
    class="{FORM_SAVE_BUTTON_SECONDARY} w-full flex items-center justify-center gap-2"
    class:text-danger={failed}
    disabled={busy}
    onclick={handleClick}
  >
    {#if busy}<Spinner size={14} />{/if}{failed ? 'Export failed' : 'Export monthly invoice'}
  </button>
  <span class="{PANEL_HINT} mb-0">{rangeLabel}</span>
</div>
