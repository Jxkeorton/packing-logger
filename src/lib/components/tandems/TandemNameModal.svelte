<script lang="ts">
  // Direct port of TandemNameModal.astro's markup + the modal-handling
  // half of lib/client/tandems-jump-log.ts (openNameModal/closeNameModal,
  // the Escape-key and backdrop-click listeners) — as component state and
  // effects instead of manual getElementById + addEventListener wiring.
  import Spinner from '../Spinner.svelte';

  let {
    open,
    subtitle,
    staffLabel,
    submitting = false,
    onSubmit,
    onClose,
  }: {
    open: boolean;
    subtitle: string;
    /** What the other staff member on this jump is called — see OTHER_STAFF_LABELS. */
    staffLabel: string;
    /**
     * True while the caller's own onSubmit is still in flight — this
     * component doesn't own that request (TandemCategoryCards does, via
     * a plain fetch rather than a form), so it can't derive this itself
     * the way a `use:enhance` callback would. Without it, tapping "Add
     * jump" twice before the first request's `invalidateAll()` came back
     * logged the same jump twice.
     */
    submitting?: boolean;
    onSubmit: (name: string, staff: string) => void;
    onClose: () => void;
  } = $props();

  let name = $state('');
  let staff = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      name = '';
      staff = '';
      inputEl?.focus();
    }
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return; // belt-and-braces alongside the disabled button below
    const trimmed = name.trim();
    if (!trimmed) return;
    // The other staff member stays optional — plenty of jumps go up without
    // a camera, and a solo instructor shouldn't be blocked on filling it in.
    onSubmit(trimmed, staff.trim());
  }

  // Both inputs are styled identically; named once so they stay that way.
  const FIELD =
    'w-full h-12 px-3.5 rounded-[10px] border border-line-strong bg-canvas text-ink font-sans text-base focus-visible:outline-3 focus-visible:outline-gold focus-visible:outline-offset-1';

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) onClose();
  }
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
    <div class="w-full max-w-100 bg-panel rounded-card shadow-card p-5" role="dialog" aria-modal="true" aria-labelledby="tandemNameModalTitle">
      <h2 class="m-0 mb-0.5 text-[17px] font-bold" id="tandemNameModalTitle">Jump details</h2>
      <p class="mt-0 mb-3.5 text-[13px] text-ink-soft">{subtitle}</p>
      <form onsubmit={handleSubmit}>
        <label class="block mb-1 text-[13px] font-bold" for="tandemCustomerName">Customer name</label>
        <input
          bind:this={inputEl}
          id="tandemCustomerName"
          type="text"
          class={FIELD}
          placeholder="e.g. Jane Smith"
          autocomplete="off"
          maxlength="80"
          required
          bind:value={name}
        />
        <label class="block mt-3.5 mb-1 text-[13px] font-bold" for="tandemStaffName">
          {staffLabel} <span class="font-normal text-ink-soft">(optional)</span>
        </label>
        <input
          id="tandemStaffName"
          type="text"
          class={FIELD}
          placeholder="e.g. Sam Patel"
          autocomplete="off"
          maxlength="80"
          bind:value={staff}
        />
        <div class="flex gap-2.5 mt-3.5">
          <button
            type="button"
            class="flex-1 appearance-none border border-line-strong rounded-[10px] h-11.5 font-display font-bold text-[15px] cursor-pointer touch-manipulation bg-transparent text-ink-soft disabled:opacity-60 disabled:cursor-default"
            disabled={submitting}
            onclick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 appearance-none border-0 rounded-[10px] h-11.5 font-display font-bold text-[15px] cursor-pointer touch-manipulation bg-gold text-white disabled:opacity-60 disabled:cursor-default flex items-center justify-center gap-2"
            disabled={submitting}
          >
            {#if submitting}<Spinner size={15} />{/if}
            Add jump
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
