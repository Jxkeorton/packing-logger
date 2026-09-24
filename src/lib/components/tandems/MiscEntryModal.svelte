<script lang="ts">
  // A sibling of GroundSchoolModal — same reasoning (no rate to look up, so
  // the instructor keys in what they actually earned), plus one extra
  // field: what it was for, since unlike ground school this ledger covers
  // anything that doesn't fit a category. "B licence evening" is the first
  // real use of it, but the label is free text on purpose — a new kind of
  // work shouldn't need a new panel coded for it.
  import Spinner from '../Spinner.svelte';

  let {
    open,
    mode = 'add',
    initialLabel = '',
    initialAmount = '',
    submitting = false,
    onSubmit,
    onClose,
  }: {
    open: boolean;
    /** 'edit' swaps the heading/button copy and pre-fills the fields from initialLabel/initialAmount instead of starting blank. */
    mode?: 'add' | 'edit';
    initialLabel?: string;
    initialAmount?: string;
    /**
     * True while the caller's own onSubmit is still in flight — same
     * reason GroundSchoolModal takes this: the request lives in
     * TandemCategoryCards, not here, so this component can't derive it
     * itself the way a `use:enhance` callback would.
     */
    submitting?: boolean;
    onSubmit: (label: string, amount: number) => void;
    onClose: () => void;
  } = $props();

  let label = $state('');
  let amount = $state('');
  let labelEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      label = mode === 'edit' ? initialLabel : '';
      amount = mode === 'edit' ? initialAmount : '';
      labelEl?.focus();
    }
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return; // belt-and-braces alongside the disabled button below
    const trimmedLabel = label.trim();
    const value = Number(amount);
    if (!trimmedLabel || !Number.isFinite(value) || value <= 0) return; // matches the fields' own required/min="0.01"-shaped intent
    onSubmit(trimmedLabel, value);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) onClose();
  }

  const FIELD =
    'w-full h-12 pl-3.5 pr-3.5 rounded-[var(--radius-control)] border border-line-strong bg-canvas text-ink font-sans text-base focus-visible:outline-3 focus-visible:outline-gold focus-visible:outline-offset-1';
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
  <div
    class="fixed inset-0 bg-[rgba(11,22,32,0.5)] flex items-center justify-center p-4 z-20"
    onclick={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
    role="presentation"
  >
    <div class="w-full max-w-100 bg-panel rounded-card shadow-card p-5" role="dialog" aria-modal="true" aria-labelledby="miscEntryModalTitle">
      <h2 class="m-0 mb-0.5 text-[17px] font-bold" id="miscEntryModalTitle">
        {mode === 'edit' ? 'Edit entry' : 'Miscellaneous'}
      </h2>
      <p class="mt-0 mb-3.5 text-[13px] text-ink-soft">What was this for, and how much did you earn?</p>
      <form onsubmit={handleSubmit}>
        <label class="block mb-1 text-[13px] font-bold" for="miscEntryLabel">What's this for</label>
        <input
          bind:this={labelEl}
          id="miscEntryLabel"
          type="text"
          class="{FIELD} mb-3"
          placeholder="e.g. B licence evening"
          maxlength="80"
          required
          bind:value={label}
        />
        <label class="block mb-1 text-[13px] font-bold" for="miscEntryAmount">Amount earned</label>
        <div class="relative">
          <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft">£</span>
          <input
            id="miscEntryAmount"
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0.01"
            class="{FIELD} pl-7"
            placeholder="0.00"
            required
            bind:value={amount}
          />
        </div>
        <div class="flex gap-2.5 mt-3.5">
          <button
            type="button"
            class="flex-1 appearance-none border border-line-strong rounded-[var(--radius-control)] h-11.5 font-display font-bold text-[15px] cursor-pointer touch-manipulation bg-transparent text-ink-soft disabled:opacity-60 disabled:cursor-default"
            disabled={submitting}
            onclick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 appearance-none border-0 rounded-[var(--radius-control)] h-11.5 font-display font-bold text-[15px] cursor-pointer touch-manipulation bg-gold text-white disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2"
            disabled={submitting}
          >
            {#if submitting}<Spinner size={15} />{/if}
            {mode === 'edit' ? 'Save' : 'Add'}
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
