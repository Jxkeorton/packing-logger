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
  import { totalMiscEarnings, type MiscEntry } from '$lib/misc-entries';
  import type { TandemVisibility } from '$lib/server/tandem-visibility';
  import { CARD, CARD_TOP, CARD_LABEL, CARD_RATE, CARD_SUBTOTAL, CATEGORIES_LIST } from '$lib/ui-classes';
  import TandemNameModal from './TandemNameModal.svelte';
  import MiscEntryModal from './MiscEntryModal.svelte';
  import Spinner from '../Spinner.svelte';

  // `rates` comes from data.rateSettings.tandem (Settings > Work jumps >
  // Rates) rather than the RATES this module used to import directly —
  // see rate-settings.ts for why display now always needs the live value.
  let {
    tandemState,
    visibility,
    rates,
    handyCamBonusRate,
    miscEntries,
    today,
  }: {
    tandemState: DayState;
    visibility: TandemVisibility;
    rates: Record<Category, number>;
    handyCamBonusRate: number;
    /** Today's miscellaneous entries — rendered as their own panel beneath every category card, see the block after the `{#each}` loop below. */
    miscEntries: MiscEntry[];
    /** Today's date (YYYY-MM-DD) — what the "+ Add jump" modal's date field defaults to. */
    today: string;
  } = $props();

  // Hiding a category (or Miscellaneous) is a display preference only
  // (Settings > Work jumps) — it never touches tandemState/the misc
  // ledger itself, so anything logged earlier today under it still counts
  // fully toward the totals above this list; it just doesn't get its own
  // card. Miscellaneous has its own `misc` flag rather than riding along
  // with `aff`'s — see tandem-visibility.ts's doc comment.
  const visibleCategories = $derived(CATEGORIES.filter((c) => visibility[c]));
  const everythingHidden = $derived(visibleCategories.length === 0 && !visibility.misc);

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

  async function addJump(name: string, staff: string, level: string, handyCam: boolean, date: string) {
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
      formData.set('date', date);
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

  // Ground school used to have its own card here, right about where this
  // comment sits — removed since staff only run one every month or so, and
  // Miscellaneous (below) covers it just as well: log it as a "Ground
  // school" entry there instead. The ledger, actions and invoice section
  // behind that old card are all still very much alive (see
  // $lib/server/ground-school.ts) — only the "add a new one" affordance is
  // gone, so every session logged before this change still shows up in
  // History and bills correctly. Nothing to migrate.

  // Miscellaneous is the generic escape hatch ground school (above) is a
  // special case of: anything that doesn't fit a Category and isn't worth
  // wiring up a whole new panel for — a label the instructor types, plus
  // what they earned.
  let addingMiscEntry = $state(false);
  let editingMiscEntry = $state<MiscEntry | null>(null);
  let submittingMiscEntry = $state(false);
  let deletingMiscEntryAt = $state<string | null>(null);

  // One modal instance covers both add and edit (see MiscEntryModal's
  // `mode` prop) — which of the two flows fired is remembered by whether
  // editingMiscEntry is set, not by a separate piece of state.
  const miscModalOpen = $derived(addingMiscEntry || editingMiscEntry !== null);

  async function addMiscEntry(label: string, amount: number) {
    if (submittingMiscEntry) return;
    submittingMiscEntry = true;
    try {
      const formData = new FormData();
      formData.set('label', label);
      formData.set('amount', String(amount));
      await fetch('?/addMiscEntry', { method: 'POST', body: formData });
      addingMiscEntry = false;
      await invalidateAll();
    } finally {
      submittingMiscEntry = false;
    }
  }

  async function editMiscEntry(at: string, label: string, amount: number) {
    if (submittingMiscEntry) return;
    submittingMiscEntry = true;
    try {
      const formData = new FormData();
      formData.set('at', at);
      formData.set('label', label);
      formData.set('amount', String(amount));
      await fetch('?/editMiscEntry', { method: 'POST', body: formData });
      editingMiscEntry = null;
      await invalidateAll();
    } finally {
      submittingMiscEntry = false;
    }
  }

  function submitMiscModal(label: string, amount: number) {
    if (editingMiscEntry) {
      editMiscEntry(editingMiscEntry.at, label, amount);
    } else {
      addMiscEntry(label, amount);
    }
  }

  function closeMiscModal() {
    addingMiscEntry = false;
    editingMiscEntry = null;
  }

  async function deleteMiscEntry(at: string) {
    deletingMiscEntryAt = at;
    const formData = new FormData();
    formData.set('at', at);
    await fetch('?/deleteMiscEntry', { method: 'POST', body: formData });
    await invalidateAll();
    deletingMiscEntryAt = null;
  }
</script>

<section class={CATEGORIES_LIST}>
  {#if everythingHidden}
    <p class="visibility-empty">
      Every section is hidden — turn one back on under <strong>Settings &rarr; Work jumps</strong>.
    </p>
  {/if}
  {#each visibleCategories as category (category)}
    <div
      class="{CARD} card-clickable"
      data-tandem-category={category}
      style={`--accent: var(--${category}); --accent-soft: var(--${category}-soft)`}
      role="button"
      tabindex="0"
      aria-label={`Add ${CATEGORY_ACTION_LABELS[category]} jump`}
      onclick={() => (pendingCategory = category)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          pendingCategory = category;
        }
      }}
    >
      <div class={CARD_TOP}>
        <div class="card-title-group">
          <h2 class={CARD_LABEL}>{CATEGORY_LABELS[category]}</h2>
          <span class="add-jump-icon-btn" style={`--accent: var(--${category})`} aria-hidden="true">&plus;</span>
        </div>
        <span class={CARD_RATE}>£{rates[category].toFixed(2)} / jump</span>
      </div>
      {#if tandemState.entries[category].length > 0}
        <ul class="list-none mt-1 mb-0 p-0">
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
                onclick={(e) => {
                  e.stopPropagation();
                  deleteJump(jump.at);
                }}
              >
                {#if deletingAt === jump.at}<Spinner size={13} />{:else}&times;{/if}
              </button>
            </li>
          {/each}
        </ul>
        <div class={CARD_SUBTOTAL}>£{(tandemState.counts[category] * rates[category]).toFixed(2)}</div>
      {/if}
    </div>
  {/each}

  {#if visibility.misc}
    <!--
      Miscellaneous isn't tied to any one category — unlike ground school
      it doesn't live under AFF specifically, and it has its own
      visibility flag (visibility.misc) rather than piggybacking on
      `aff`'s — so it renders once, after every visible category card,
      gated on its own flag, rather than inside the `{#each}` above.
    -->
    <div
      class="{CARD} card-clickable"
      role="button"
      tabindex="0"
      aria-label="Add miscellaneous entry"
      onclick={() => (addingMiscEntry = true)}
      onkeydown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          addingMiscEntry = true;
        }
      }}
    >
      <div class={CARD_TOP}>
        <div class="card-title-group">
          <h2 class={CARD_LABEL}>Miscellaneous</h2>
          <span class="add-jump-icon-btn" aria-hidden="true">&plus;</span>
        </div>
      </div>
      {#if miscEntries.length > 0}
        <ul class="list-none mt-1 mb-0 p-0">
          {#each miscEntries as entry (entry.at)}
            <li class="tandem-jump-row">
              <button
                type="button"
                class="entry-edit-trigger"
                aria-label={`Edit ${entry.label}`}
                onclick={(e) => {
                  e.stopPropagation();
                  editingMiscEntry = entry;
                }}
              >
                <span class="tandem-jump-name">{entry.label}</span>
                <span class="entry-amount">£{entry.amount.toFixed(2)}</span>
              </button>
              <button
                type="button"
                class="tandem-jump-delete"
                disabled={deletingMiscEntryAt === entry.at}
                aria-label={`Remove ${entry.label}`}
                onclick={(e) => {
                  e.stopPropagation();
                  deleteMiscEntry(entry.at);
                }}
              >
                {#if deletingMiscEntryAt === entry.at}<Spinner size={13} />{:else}&times;{/if}
              </button>
            </li>
          {/each}
        </ul>
        <div class={CARD_SUBTOTAL}>£{totalMiscEarnings(miscEntries).toFixed(2)}</div>
      {/if}
    </div>
  {/if}
</section>

<MiscEntryModal
  open={miscModalOpen}
  mode={editingMiscEntry ? 'edit' : 'add'}
  initialLabel={editingMiscEntry?.label ?? ''}
  initialAmount={editingMiscEntry ? String(editingMiscEntry.amount) : ''}
  submitting={submittingMiscEntry}
  onSubmit={submitMiscModal}
  onClose={closeMiscModal}
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
  {today}
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

  .entry-amount {
    flex: none;
    font-family: var(--font-mono);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--ink-soft);
  }

  .card-title-group {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .add-jump-icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    flex: none;
    font-size: 16px;
    line-height: 1;
    color: white;
    background: var(--accent, var(--ink-soft));
    border-radius: 999px;
  }

  /* The whole card is the tap target now (the plus icon is just a
     visual hint of what tapping does), so the affordance and focus
     ring live on the card itself rather than on the icon. */
  .card-clickable {
    cursor: pointer;
    touch-action: manipulation;
    transition:
      transform 80ms ease,
      filter 80ms ease;
  }

  .card-clickable:active {
    transform: scale(0.99);
    filter: brightness(0.98);
  }

  .card-clickable:focus-visible {
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

  /* Only the Miscellaneous panel's rows have this — a real <button>
     wrapping the label+amount (rather than the whole <li>, which can't
     take an interactive role) that reopens MiscEntryModal pre-filled, the
     same way tapping a category card opens it empty. The delete button
     stays a separate sibling, same as every other row. */
  .entry-edit-trigger {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    appearance: none;
    border: none;
    background: transparent;
    padding: 2px 4px;
    margin: -2px -4px;
    border-radius: 6px;
    font: inherit;
    color: inherit;
    text-align: left;
    cursor: pointer;
    touch-action: manipulation;
  }

  .entry-edit-trigger:hover,
  .entry-edit-trigger:focus-visible {
    background: var(--line);
    outline: none;
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

</style>
