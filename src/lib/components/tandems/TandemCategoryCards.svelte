<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import {
    AFF_LEVELS,
    CATEGORIES,
    CATEGORY_ACTION_LABELS,
    CATEGORY_LABELS,
    OTHER_STAFF_LABELS,
    type Category,
    type DayState,
  } from '$lib/tandem';
  import { totalGroundSchoolEarnings, type GroundSchoolEntry } from '$lib/ground-school';
  import { CARD, CARD_TOP, CARD_LABEL, CARD_RATE, CARD_SUBTOTAL, CATEGORIES_LIST, FORM_SAVE_BUTTON_SECONDARY } from '$lib/ui-classes';
  import TandemNameModal from './TandemNameModal.svelte';
  import GroundSchoolModal from './GroundSchoolModal.svelte';
  import Spinner from '../Spinner.svelte';

  // `rates` comes from data.rateSettings.tandem (Settings > Work jumps >
  // Rates) rather than the RATES this module used to import directly —
  // see rate-settings.ts for why display now always needs the live value.
  let {
    tandemState,
    visibility,
    rates,
    handyCamBonusRate,
    groundSchoolEntries,
  }: {
    tandemState: DayState;
    visibility: Record<Category, boolean>;
    rates: Record<Category, number>;
    handyCamBonusRate: number;
    /** Today's ground school sessions — rendered beneath the AFF card only, see the `{#if category === 'aff'}` block below. */
    groundSchoolEntries: GroundSchoolEntry[];
  } = $props();

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

  // An AFF jump is for a *student*, not a customer, and it's the one
  // category with a level to record. Everything the modal needs to switch
  // between the two is derived here rather than branched inside it, so the
  // modal stays a dumb form.
  const isAff = $derived(pendingCategory === 'aff');
  const modalNameLabel = $derived(isAff ? 'Student name' : 'Customer name');
  const modalNamePlaceholder = $derived(isAff ? 'e.g. Alex Marsh' : 'e.g. Jane Smith');

  async function addJump(name: string, staff: string, level: string, handyCam: boolean) {
    const category = pendingCategory;
    if (!category || addingJump) return;
    addingJump = true;
    try {
      const formData = new FormData();
      formData.set('category', category);
      formData.set('name', name);
      formData.set('staff', staff);
      formData.set('level', level);
      if (handyCam) formData.set('handyCam', 'on');
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

  // Ground school isn't a tandem jump — no category, no rate to look up —
  // so it gets its own small pair of handlers here rather than reusing
  // addJump/deleteJump above, the same way its own ledger and actions are
  // kept apart from the jump ones server-side (see $lib/server/ground-school.ts).
  let addingGroundSchool = $state(false);
  let submittingGroundSchool = $state(false);
  let deletingGroundSchoolAt = $state<string | null>(null);

  async function addGroundSchool(amount: number) {
    if (submittingGroundSchool) return;
    submittingGroundSchool = true;
    try {
      const formData = new FormData();
      formData.set('amount', String(amount));
      await fetch('?/addGroundSchool', { method: 'POST', body: formData });
      addingGroundSchool = false;
      await invalidateAll();
    } finally {
      submittingGroundSchool = false;
    }
  }

  async function deleteGroundSchool(at: string) {
    deletingGroundSchoolAt = at;
    const formData = new FormData();
    formData.set('at', at);
    await fetch('?/deleteGroundSchool', { method: 'POST', body: formData });
    await invalidateAll();
    deletingGroundSchoolAt = null;
  }
</script>

<section class={CATEGORIES_LIST}>
  {#if visibleCategories.length === 0}
    <p class="visibility-empty">
      Every section is hidden — turn one back on under <strong>Settings &rarr; Work jumps</strong>.
    </p>
  {/if}
  {#each visibleCategories as category (category)}
    <section
      class={CARD}
      data-tandem-category={category}
      style={`--accent: var(--${category}); --accent-soft: var(--${category}-soft)`}
    >
      <div class={CARD_TOP}>
        <h2 class={CARD_LABEL}>{CATEGORY_LABELS[category]}</h2>
        <span class={CARD_RATE}>£{rates[category].toFixed(2)} / jump</span>
      </div>
      <button type="button" class="add-jump-btn" style={`--accent: var(--${category})`} onclick={() => (pendingCategory = category)}>
        &plus; Add {CATEGORY_ACTION_LABELS[category]} jump
      </button>
      <ul class="list-none mt-1 mb-0 p-0">
        {#if tandemState.entries[category].length === 0}
          <li class="tandem-jump-empty">No jumps logged yet today.</li>
        {:else}
          {#each tandemState.entries[category] as jump (jump.at)}
            <li class="tandem-jump-row">
              <span class="tandem-jump-name">{jump.name}</span>
              {#if jump.level}<span class="tandem-jump-level">{jump.level}</span>{/if}
              {#if jump.handyCam}<span class="tandem-jump-level" title="Handy cam footage">HC</span>{/if}
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

    {#if category === 'aff'}
      <!--
        Ground school isn't a jump — it has no rate, no name, no level —
        so it isn't a card of its own, just a smaller block tucked under
        the AFF card it belongs to. Living inside this `{#each}` branch
        means it only ever renders alongside a *visible* AFF card: hide
        AFF from Settings > Work jumps and 'aff' drops out of
        visibleCategories, taking this block with it, with no separate
        visibility flag to keep in sync (see tandem-visibility.ts).
      -->
      <section class="ground-school-block">
        <button type="button" class={FORM_SAVE_BUTTON_SECONDARY} onclick={() => (addingGroundSchool = true)}>
          &plus; Add ground school
        </button>
        {#if groundSchoolEntries.length > 0}
          <ul class="list-none mt-1.5 mb-0 p-0">
            {#each groundSchoolEntries as entry (entry.at)}
              <li class="tandem-jump-row">
                <span class="tandem-jump-name">Ground school</span>
                <span class="ground-school-amount">£{entry.amount.toFixed(2)}</span>
                <button
                  type="button"
                  class="tandem-jump-delete"
                  disabled={deletingGroundSchoolAt === entry.at}
                  aria-label="Remove ground school entry"
                  onclick={() => deleteGroundSchool(entry.at)}
                >
                  {#if deletingGroundSchoolAt === entry.at}<Spinner size={13} />{:else}&times;{/if}
                </button>
              </li>
            {/each}
          </ul>
          <div class={CARD_SUBTOTAL}>£{totalGroundSchoolEarnings(groundSchoolEntries).toFixed(2)}</div>
        {/if}
      </section>
    {/if}
  {/each}
</section>

<GroundSchoolModal
  open={addingGroundSchool}
  submitting={submittingGroundSchool}
  onSubmit={addGroundSchool}
  onClose={() => (addingGroundSchool = false)}
/>

<TandemNameModal
  open={pendingCategory !== null}
  subtitle={modalSubtitle}
  nameLabel={modalNameLabel}
  namePlaceholder={modalNamePlaceholder}
  staffLabel={pendingCategory ? OTHER_STAFF_LABELS[pendingCategory] : ''}
  levelOptions={isAff ? AFF_LEVELS : undefined}
  showHandyCam={pendingCategory === 'instructor'}
  {handyCamBonusRate}
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

  /* Tucked under the AFF card, not a card of its own — a few px of
     breathing room rather than the gap the category cards give each
     other via CATEGORIES_LIST's own gap, which would make this read as
     a sibling section instead of something belonging to AFF. */
  .ground-school-block {
    margin-top: 6px;
    padding-left: 2px;
  }

  .ground-school-amount {
    flex: none;
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-soft);
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
    /* Takes the slack and gives it back: a long student name ellipsises
       rather than pushing the level pill or the delete button off the
       row. `min-width: 0` is what actually lets a flex item shrink below
       its text width. */
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The AFF student's level, as a quiet pill after their name — it
     qualifies the name rather than standing on its own, and at this size
     a second line per row would cost more height than the whole card can
     spare (see the commit that fit these onto one screen). */
  .tandem-jump-level {
    flex: none;
    padding: 1px 6px;
    border-radius: 999px;
    background: var(--accent-soft);
    color: var(--accent);
    font-family: var(--font-mono);
    font-size: 10.5px;
    font-weight: 600;
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
