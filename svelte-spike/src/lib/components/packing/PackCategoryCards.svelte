<script lang="ts">
  // Compare with the main app's PackCategoryCards.astro + the counter
  // half of lib/client/packing-tab.ts: no data-count/data-subtotal
  // selectors, no manual applyState()/applyAggregate() DOM patching, no
  // separate `bump()` class-toggle helper — {#key} remounting the count
  // span replays the CSS animation, and every other number on the page
  // that depends on `state.counts` (the masthead totals, the history
  // panel's current week/month row) updates from the same `use:enhance`
  // round trip via the page's `load` re-running, not a bespoke patch.
  import { enhance } from '$app/forms';
  import { CATEGORIES, CATEGORY_LABELS, RATES, type Category, type Counts } from '$lib/packing';
  import { CARD, CARD_TOP, CARD_LABEL, CARD_RATE, CARD_SUBTOTAL, CATEGORIES_LIST } from '$lib/ui-classes';

  let { counts }: { counts: Counts } = $props();

  let pending = $state<Partial<Record<Category, boolean>>>({});
  let bumpVersion = $state<Record<Category, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>,
  );

  function adjust(category: Category) {
    return () => {
      pending[category] = true;
      return async ({ update }: { update: () => Promise<void> }) => {
        pending[category] = false;
        bumpVersion[category] = (bumpVersion[category] ?? 0) + 1;
        await update();
      };
    };
  }
</script>

<main class={CATEGORIES_LIST}>
  {#each CATEGORIES as category (category)}
    <section class={CARD} data-category={category} style={`--accent: var(--${category})`}>
      <div class={CARD_TOP}>
        <h2 class={CARD_LABEL}>{CATEGORY_LABELS[category]}</h2>
        <span class={CARD_RATE}>£{RATES[category].toFixed(2)} / pack</span>
      </div>
      <div class="grid grid-cols-[64px_1fr_64px] items-center gap-3 mt-2.5">
        <form method="POST" action="?/adjust" use:enhance={adjust(category)}>
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="delta" value="-1" />
          <button
            class="counter-btn counter-btn-minus"
            style={`--accent: var(--${category})`}
            type="submit"
            disabled={pending[category]}
            aria-label={`Remove one ${CATEGORY_LABELS[category]} pack job`}
          >
            &minus;
          </button>
        </form>
        {#key bumpVersion[category]}
          <span
            class="text-center font-display font-bold text-[40px] [font-variant-numeric:tabular-nums] {bumpVersion[
              category
            ]
              ? 'bump'
              : ''}"
          >
            {counts[category]}
          </span>
        {/key}
        <form method="POST" action="?/adjust" use:enhance={adjust(category)}>
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="delta" value="1" />
          <button
            class="counter-btn counter-btn-plus"
            style={`--accent: var(--${category})`}
            type="submit"
            disabled={pending[category]}
            aria-label={`Add one ${CATEGORY_LABELS[category]} pack job`}
          >
            &plus;
          </button>
        </form>
      </div>
      <div class={CARD_SUBTOTAL} data-subtotal={category}>
        £{(counts[category] * RATES[category]).toFixed(2)}
      </div>
    </section>
  {/each}
</main>

<style>
  .counter-btn {
    appearance: none;
    border-radius: 0.75rem;
    width: 100%;
    height: 3.5rem;
    font-size: 28px;
    line-height: 1;
    font-family: var(--font-display);
    font-weight: 700;
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 80ms ease,
      filter 80ms ease;
  }

  .counter-btn:active {
    transform: scale(0.93);
    filter: brightness(0.95);
  }

  .counter-btn:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }

  .counter-btn-minus {
    border: 2px solid var(--accent);
    background: transparent;
    color: var(--accent);
  }

  .counter-btn-plus {
    border: 0;
    background: var(--accent);
    color: white;
  }

  /* Replays on every {#key} remount — see the script comment. */
  .bump {
    animation: bump 180ms ease;
  }

  @keyframes bump {
    0% {
      transform: scale(1);
    }
    40% {
      transform: scale(1.18);
    }
    100% {
      transform: scale(1);
    }
  }
</style>
