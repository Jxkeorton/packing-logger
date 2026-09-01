<script lang="ts">
  // Each tap used to submit a real <form> through use:enhance and wait
  // for its default behaviour — apply the result, then re-run the whole
  // page's `load` — before the number on screen changed at all. That
  // `load` reads both jump ledgers, burble sync state, logbook and rate
  // settings and recomputes every week/month rollup, so a single ±1 tap
  // paid for all of it; a packer tapping quickly could genuinely see the
  // count lag behind their taps by a beat or more. It also caused a
  // visible glitch: the bump animation fired in that same enhance
  // callback, on the *old* number, then the real number changed later
  // and abruptly once `load` finally came back — a bounce that had
  // nothing to do with the actual increment landing.
  //
  // Now: tapping updates `counts` (a $bindable, shared with +page.svelte
  // so the masthead totals stay in step) and replays the bump animation
  // in the same instant, synchronously, before any network request even
  // starts. The POST to ?/adjust happens after, in the background, and
  // is only ever a correction if something actually went wrong — see
  // drain() below. Requests for a given category are strictly
  // serialized (never two in flight at once) so a fast burst of taps
  // can't race a read-modify-write against itself, but nothing here
  // waits on that queue to draw the next number.
  import { deserialize } from '$app/forms';
  import { CATEGORIES, CATEGORY_LABELS, type Category, type Counts } from '$lib/packing';
  import { CARD, CARD_TOP, CARD_LABEL, CARD_RATE, CARD_SUBTOTAL, CATEGORIES_LIST } from '$lib/ui-classes';
  import Spinner from '../Spinner.svelte';

  // `rates` comes from data.rateSettings.packing (Settings > Work jumps
  // > Rates), not the RATES this module used to import directly — see
  // rate-settings.ts for why display now always needs the live value.
  let {
    counts = $bindable(),
    rates,
    onAdjust,
  }: {
    counts: Counts;
    rates: Record<Category, number>;
    /**
     * Fired on every tap, and again every time a background save
     * resolves — +page.svelte uses this to (re)schedule a debounced
     * refresh of history/rollups once things actually go quiet. It has
     * to fire on save-resolve too, not just on tap: a burst of taps
     * finishes tapping well before its queued saves finish draining
     * (each one a couple of storage round trips), and a refresh landing
     * while any of them are still in flight would resync `counts` from
     * a server state that doesn't reflect them yet — a visible flash
     * back to a stale number, "corrected" a moment later when the
     * in-flight request finally lands. Firing this from drain() too
     * keeps pushing the schedule out until nothing's left outstanding.
     */
    onAdjust?: () => void;
  } = $props();

  let bumpVersion = $state<Record<Category, number>>(
    Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as Record<Category, number>,
  );

  // One pending-deltas queue per category. `drain` only ever has one
  // copy running per category (guarded by `draining`) even though it's
  // invoked again on every tap — the loop inside picks up whatever
  // arrived while the previous request was in flight.
  const queues = Object.fromEntries(CATEGORIES.map((c) => [c, [] as (1 | -1)[]])) as unknown as Record<
    Category,
    (1 | -1)[]
  >;
  let draining = $state<Partial<Record<Category, boolean>>>({});
  let showBusy = $state<Partial<Record<Category, boolean>>>({});
  let showError = $state<Partial<Record<Category, boolean>>>({});

  async function drain(category: Category) {
    if (draining[category]) return; // already someone's job to work through the queue
    draining[category] = true;

    // A confirmation that arrives fast (the common case) shouldn't
    // flash anything — only surface the spinner once a request has
    // genuinely been waiting a moment.
    const busyTimer = setTimeout(() => (showBusy[category] = true), 200);

    while (queues[category].length > 0) {
      const delta = queues[category].shift()!;
      try {
        const formData = new FormData();
        formData.set('category', category);
        formData.set('delta', String(delta));
        const response = await fetch('?/adjust', {
          method: 'POST',
          headers: { 'x-sveltekit-action': 'true' },
          body: formData,
        });
        const result = deserialize(await response.text());
        if (result.type === 'success' && result.data) {
          // The authoritative count for the whole day, not just this
          // category — cheap insurance against drift (another tab or
          // device touching today's counts) rather than something the
          // happy path leans on, since the optimistic value above was
          // already computed the same way the server just confirmed.
          counts = (result.data as { counts: Counts }).counts;
        } else {
          counts[category] = Math.max(0, counts[category] - delta);
          showError[category] = true;
          setTimeout(() => (showError[category] = false), 3000);
        }
      } catch {
        counts[category] = Math.max(0, counts[category] - delta);
        showError[category] = true;
        setTimeout(() => (showError[category] = false), 3000);
      }
      onAdjust?.(); // push the parent's refresh schedule out — see the prop's own comment for why
    }

    clearTimeout(busyTimer);
    showBusy[category] = false;
    draining[category] = false;
  }

  function adjust(category: Category, delta: 1 | -1) {
    if (delta === -1 && counts[category] <= 0) return; // nothing to remove — don't bother the server for a guaranteed no-op
    counts[category] = Math.max(0, counts[category] + delta);
    bumpVersion[category] = (bumpVersion[category] ?? 0) + 1;
    queues[category].push(delta);
    void drain(category);
    onAdjust?.();
  }
</script>

<main class={CATEGORIES_LIST}>
  {#each CATEGORIES as category (category)}
    <section class={CARD} data-category={category} style={`--accent: var(--${category})`}>
      <div class={CARD_TOP}>
        <h2 class={CARD_LABEL}>{CATEGORY_LABELS[category]}</h2>
        <span class="flex items-center gap-1.5">
          {#if showBusy[category]}<Spinner size={12} />{/if}
          <span class={CARD_RATE}>£{rates[category].toFixed(2)} / pack</span>
        </span>
      </div>
      <div class="grid grid-cols-[64px_1fr_64px] items-center gap-3 mt-2.5">
        <button
          class="counter-btn counter-btn-minus"
          style={`--accent: var(--${category})`}
          type="button"
          aria-label={`Remove one ${CATEGORY_LABELS[category]} pack job`}
          onclick={() => adjust(category, -1)}
        >
          &minus;
        </button>
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
        <button
          class="counter-btn counter-btn-plus"
          style={`--accent: var(--${category})`}
          type="button"
          aria-label={`Add one ${CATEGORY_LABELS[category]} pack job`}
          onclick={() => adjust(category, 1)}
        >
          &plus;
        </button>
      </div>
      <div class={CARD_SUBTOTAL} data-subtotal={category}>
        {#if showError[category]}
          <span class="error-note">Couldn't save — count corrected</span>
        {/if}
        £{(counts[category] * rates[category]).toFixed(2)}
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

  .error-note {
    display: block;
    color: var(--danger);
    font-size: 11.5px;
    font-weight: 600;
    margin-bottom: 2px;
  }
</style>
