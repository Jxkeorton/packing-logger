<script lang="ts">
  import { CATEGORIES, CATEGORY_LABELS, type Category } from '$lib/tandem';
  import ToggleRowsForm from '../ToggleRowsForm.svelte';

  let { visibility }: { visibility: Record<Category, boolean> } = $props();

  const items = CATEGORIES.map((category) => ({ id: category, label: CATEGORY_LABELS[category] }));
</script>

<ToggleRowsForm
  hint="All three appear on the Work jumps tab by default. Hiding one only affects that tab — jumps already logged under it, its history, and its invoice lines are all unaffected."
  action="?/saveTandemVisibility"
  field="category"
  {items}
  checked={(id) => visibility[id as Category]}
/>
