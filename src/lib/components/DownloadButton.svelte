<script lang="ts">
  import { downloadFile } from '$lib/client/download';
  import { FOOT_DOWNLOAD } from '$lib/ui-classes';
  import Spinner from './Spinner.svelte';

  let { href, filename, label }: { href: string; filename: string; label: string } = $props();

  let busy = $state(false);
  let failed = $state(false);

  async function handleClick() {
    busy = true;
    failed = false;
    const { ok } = await downloadFile(href, filename);
    failed = !ok;
    busy = false;
    if (!ok) setTimeout(() => (failed = false), 2000);
  }
</script>

<button type="button" class="{FOOT_DOWNLOAD} inline-flex items-center gap-1.5" disabled={busy} onclick={handleClick}>
  {#if busy}<Spinner size={12} />{/if}{failed ? 'Export failed' : label}
</button>
