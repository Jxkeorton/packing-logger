<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { CATEGORIES, CATEGORY_LABELS, OTHER_STAFF_LABELS, type Category, type DayState } from '$lib/tandem';
  import { CARD, CARD_TOP, CARD_LABEL, CARD_RATE, CARD_SUBTOTAL, CATEGORIES_LIST } from '$lib/ui-classes';
  import TandemNameModal from './TandemNameModal.svelte';
  import Spinner from '../Spinner.svelte';

  // `rates` comes from data.rateSettings.tandem (Settings > Work jumps >
  // Rates) rather than the RATES this module used to import directly —
  // see rate-settings.ts for why display now always needs the live value.
  let {
    tandemState,
    visibility,
    rates,
  }: { tandemState: DayState; visibility: Record<Category, boolean>; rates: Record<Category, number> } = $props();

  // Hiding a category is a display preference only (Settings > Work
  // jumps) — it never touches tandemState itself, so a jump logged
  // earlier today under a category since hidden still counts fully
  // toward the totals above this list; it just doesn't get its own card.
  const visibleCategories = $derived(CATEGORIES.filter((c) => visibility[c]));

  let pendingCategory = $state<Category | null>(null);
  let deletingAt = $state<string | null>(null);
  let addingJump = $state(false);

  const modalSubtitle = $derived(
    pendingCategory ? `${CATEGORY_LABELS[pendingCategory]} jump — £${rates[pendingCategory].toFixed(2)}` : '',
  );

  async function addJump(name: string, staff: string) {
    const category = pendingCategory;
    if (!category || addingJump) return;
    addingJump = true;
    try {
      const formData = new FormData();
      formData.set('category', category);
      formData.set('name', name);
      formData.set('staff', staff);
      await fetch('?/addTandemJump', { method: 'POST', body: formData });
      pendingCategory = null;
      await invalidateAll();
    } finally {
      addingJump = false;
    }
  }

  async function deleteJump(at: string) {
    deletingAt = at;
    const formData = new FormData();
    formData.set('at', at);
    await fetch('?/deleteTandemJump', { method: 'POST', body: formData });
    await invalidateAll();
    deletingAt = null;
  }
</script>

<section class={CATEGORIES_LIST}>
  {#if visibleCategories.length === 0}
    <p class="visibility-empty">
      Both sections are hidden — turn one back on under <strong>Settings &rarr; Work jumps</strong>.
    </p>
  {/if}
  {#each visibleCategories as category (category)}
    <section class={CARD} data-tandem-category={category} style={`--accent: var(--${category})`}>
      <div class={CARD_TOP}>
        <h2 class={CARD_LABEL}>{CATEGORY_LABELS[category]}</h2>
        <span class={CARD_RATE}>£{rates[category].toFixed(2)} / jump</span>
      </div>
      <button type="button" class="add-jump-btn" style={`--accent: var(--${category})`} onclick={() => (pendingCategory = category)}>
        &plus; Add {CATEGORY_LABELS[category].toLowerCase()} jump
      </button>
      <ul class="list-none mt-1 mb-0 p-0">
        {#if tandemState.entries[category].length === 0}
          <li class="tandem-jump-empty">No jumps logged yet today.</li>
        {:else}
          {#each tandemState.entries[category] as jump (jump.at)}
            <li class="tandem-jump-row">
              <span class="tandem-jump-name">{jump.name}</span>
              <button
                type="button"
                class="tandem-jump-delete"
                disabled={deletingAt === jump.at}
                aria-label={`Remove ${jump.name}`}
                onclick={() => deleteJump(jump.at)}
              >
                {#if deletingAt === jump.at}<Spinner size={13} />{:else}&times;{/if}
              </button>
            </li>
          {/each}
        {/if}
      </ul>
      <div class={CARD_SUBTOTAL}>£{(tandemState.counts[category] * rates[category]).toFixed(2)}</div>
    </section>
  {/each}
</section>

<TandemNameModal
  open={pendingCategory !== null}
  subtitle={modalSubtitle}
  staffLabel={pendingCategory ? OTHER_STAFF_LABELS[pendingCategory] : ''}
  submitting={addingJump}
  onSubmit={addJump}
  onClose={() => (pendingCategory = null)}
/>

<style>
  .visibility-empty {
    margin: 0;
    padding: 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    color: var(--ink-soft);
    font-size: 13.5px;
    text-align: center;
  }

  .add-jump-btn {
    appearance: none;
    border: 0;
    border-radius: 0.75rem;
    width: 100%;
    height: 46px;
    margin-top: 10px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 14.5px;
    color: white;
    background: var(--accent);
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 80ms ease,
      filter 80ms ease;
  }

  .add-jump-btn:active {
    transform: scale(0.97);
    filter: brightness(0.95);
  }

  .add-jump-btn:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }

  .tandem-jump-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 2px;
    border-top: 1px solid var(--line);
    font-size: 13.5px;
  }

  .tandem-jump-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tandem-jump-delete {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    font-size: 18px;
    line-height: 1;
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .tandem-jump-delete:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .tandem-jump-delete:hover,
  .tandem-jump-delete:focus-visible {
    background: var(--danger-soft);
    color: var(--danger);
    outline: none;
  }

  .tandem-jump-empty {
    margin: 0;
    padding: 9px 2px;
    border-top: 1px solid var(--line);
    color: var(--ink-soft);
    font-size: 13px;
  }
</style>
