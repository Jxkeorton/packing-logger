<script lang="ts">
  // A much smaller sibling of TandemNameModal — a ground school session
  // has no name, no level, no staff to record, just what the instructor
  // earned, since the price varies session to session. `type="number"
  // inputmode="decimal"` is what actually gets a numeric keyboard on a
  // phone; there's nothing fancier ("a numeric keypad") to build here.
  import Spinner from '../Spinner.svelte';

  let {
    open,
    submitting = false,
    onSubmit,
    onClose,
  }: {
    open: boolean;
    /**
     * True while the caller's own onSubmit is still in flight — same
     * reason TandemNameModal takes this: the request lives in
     * TandemCategoryCards, not here, so this component can't derive it
     * itself the way a `use:enhance` callback would.
     */
    submitting?: boolean;
    onSubmit: (amount: number) => void;
    onClose: () => void;
  } = $props();

  let amount = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      amount = '';
      inputEl?.focus();
    }
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return; // belt-and-braces alongside the disabled button below
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return; // matches the input's own min="0.01"-shaped intent
    onSubmit(value);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) onClose();
  }

  const FIELD =
    'w-full h-12 pl-7 pr-3.5 rounded-[var(--radius-control)] border border-line-strong bg-canvas text-ink font-sans text-base focus-visible:outline-3 focus-visible:outline-gold focus-visible:outline-offset-1';
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
    <div class="w-full max-w-100 bg-panel rounded-card shadow-card p-5" role="dialog" aria-modal="true" aria-labelledby="groundSchoolModalTitle">
      <h2 class="m-0 mb-0.5 text-[17px] font-bold" id="groundSchoolModalTitle">Ground school</h2>
      <p class="mt-0 mb-3.5 text-[13px] text-ink-soft">How much did you earn for this session?</p>
      <form onsubmit={handleSubmit}>
        <label class="block mb-1 text-[13px] font-bold" for="groundSchoolAmount">Amount earned</label>
        <div class="relative">
          <span class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft">£</span>
          <input
            bind:this={inputEl}
            id="groundSchoolAmount"
            type="number"
            inputmode="decimal"
            step="0.01"
            min="0.01"
            class={FIELD}
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
            Add
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
