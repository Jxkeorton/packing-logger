<script lang="ts">
  import type { AppTab } from '$lib/server/tab-visibility';
  import ToggleRowsForm from './ToggleRowsForm.svelte';

  let { visibility }: { visibility: Record<AppTab, boolean> } = $props();

  const TABS: { id: AppTab; label: string }[] = [
    { id: 'packing', label: 'Packing' },
    { id: 'tandems', label: 'Work jumps' },
  ];
</script>

<ToggleRowsForm
  hint="Logbook always shows. Hiding Packing or Work jumps only removes its tab — nothing it tracks is affected, and it's back the moment you turn it on again."
  action="?/saveTabVisibility"
  field="tab"
  items={TABS}
  checked={(id) => visibility[id as AppTab]}
/>
