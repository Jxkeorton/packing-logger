<script lang="ts">
  import { CATEGORIES, CATEGORY_LABELS } from '$lib/tandem';
  import type { TandemVisibility, VisibilityKey } from '$lib/server/tandem-visibility';
  import ToggleRowsForm from '../ToggleRowsForm.svelte';

  let { visibility }: { visibility: TandemVisibility } = $props();

  // Miscellaneous gets its own row here, appended after the three real
  // categories rather than nested under AFF — it isn't a Category and
  // hiding it must never hide (or be tied to) AFF, unlike the old Ground
  // School panel, which had no visibility flag of its own and simply rode
  // along with whatever AFF's card did.
  const items = [
    ...CATEGORIES.map((category) => ({ id: category as VisibilityKey, label: CATEGORY_LABELS[category] })),
    { id: 'misc' as VisibilityKey, label: 'Miscellaneous' },
  ];
</script>

<ToggleRowsForm
  hint="All four appear on the Work jumps tab by default. Hiding one only affects that tab — anything already logged under it, its history, and its invoice lines are all unaffected."
  action="?/saveTandemVisibility"
  field="category"
  {items}
  checked={(id) => visibility[id as VisibilityKey]}
/>
