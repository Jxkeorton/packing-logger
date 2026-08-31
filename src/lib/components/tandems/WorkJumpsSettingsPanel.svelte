<script lang="ts">
  // The row chrome (icon, label, chevron, expand/collapse) lives in
  // SettingsRow.svelte, which wraps this in +page.svelte — this
  // component only ever renders its own content.
  //
  // Each checkbox is its own auto-submitting form (same pattern as
  // BurbleSettingsPanel's "Read the manifest board" toggle) rather than
  // one form with a Save button — there's nothing else on this row to
  // batch a save with, and it means turning one category off can't
  // accidentally carry a half-typed change to the other along with it.
  import { enhance } from '$app/forms';
  import { CATEGORIES, CATEGORY_LABELS, type Category } from '$lib/tandem';
  import { PANEL_HINT } from '$lib/ui-classes';
  import Spinner from '../Spinner.svelte';

  let { visibility }: { visibility: Record<Category, boolean> } = $props();

  let pendingCategory = $state<Category | null>(null);
</script>

<p class={PANEL_HINT}>
  Both appear on the Work jumps tab by default. Hiding one only affects that tab — jumps already logged under it, its
  history, and its invoice lines are all unaffected.
</p>

{#each CATEGORIES as category (category)}
  <form
    method="POST"
    action="?/saveTandemVisibility"
    use:enhance={() => {
      pendingCategory = category;
      return async ({ update }) => {
        await update({ reset: false });
        pendingCategory = null;
      };
    }}
  >
    <input type="hidden" name="category" value={category} />
    <label class="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft last:mb-0">
      <input
        type="checkbox"
        name="visible"
        checked={visibility[category]}
        disabled={pendingCategory === category}
        class="size-4"
        onchange={(e) => e.currentTarget.form?.requestSubmit()}
      />
      <span>Show {CATEGORY_LABELS[category]}</span>
      {#if pendingCategory === category}<Spinner size={12} />{/if}
    </label>
  </form>
{/each}
