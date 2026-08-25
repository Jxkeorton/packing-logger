<script lang="ts">
  import { downloadFile } from '$lib/client/download';
  import { FOOT_DOWNLOAD } from '$lib/ui-classes';

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

<button type="button" class={FOOT_DOWNLOAD} disabled={busy} onclick={handleClick}>
  {failed ? 'Export failed' : label}
</button>
