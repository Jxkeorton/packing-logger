<script lang="ts">
  // Direct port of TandemNameModal.astro's markup + the modal-handling
  // half of lib/client/tandems-jump-log.ts (openNameModal/closeNameModal,
  // the Escape-key and backdrop-click listeners) — as component state and
  // effects instead of manual getElementById + addEventListener wiring.
  import Spinner from '../Spinner.svelte';

  let {
    open,
    subtitle,
    nameLabel,
    namePlaceholder,
    staffLabel,
    levelOptions,
    showHandyCam = false,
    handyCamBonusRate,
    submitting = false,
    onSubmit,
    onClose,
  }: {
    open: boolean;
    subtitle: string;
    /** Who the jump was for: "Customer name" on a tandem, "Student name" on an AFF jump. */
    nameLabel: string;
    namePlaceholder: string;
    /** What the other staff member on this jump is called — see OTHER_STAFF_LABELS. */
    staffLabel: string;
    /**
     * The levels to offer, on a category that has them (AFF). Absent
     * everywhere else, which is what hides the field entirely — a level
     * means nothing on a tandem, and an always-present control that's
     * only sometimes meaningful is worse than one that comes and goes.
     */
    levelOptions?: readonly string[];
    /** Show the handy-cam checkbox — only ever true for an instructor jump, the one category the bonus applies to. */
    showHandyCam?: boolean;
    /** The live bonus rate, for the checkbox's own label — only read when showHandyCam is true. */
    handyCamBonusRate?: number;
    /**
     * True while the caller's own onSubmit is still in flight — this
     * component doesn't own that request (TandemCategoryCards does, via
     * a plain fetch rather than a form), so it can't derive this itself
     * the way a `use:enhance` callback would. Without it, tapping "Add
     * jump" twice before the first request's `invalidateAll()` came back
     * logged the same jump twice.
     */
    submitting?: boolean;
    onSubmit: (name: string, staff: string, level: string, handyCam: boolean) => void;
    onClose: () => void;
  } = $props();

  let name = $state('');
  let staff = $state('');
  let level = $state('');
  let handyCam = $state(false);
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      name = '';
      staff = '';
      // No level is pre-selected: an AFF instructor works through the
      // levels all day, and defaulting to "Level 1" is exactly the sort
      // of plausible-looking wrong value that gets tapped past. The
      // <select> is `required`, so the browser makes it a deliberate
      // choice instead.
      level = '';
      handyCam = false;
      inputEl?.focus();
    }
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (submitting) return; // belt-and-braces alongside the disabled button below
    const trimmed = name.trim();
    if (!trimmed) return;
    if (levelOptions && !level) return; // matches the select's own `required`
    // The other staff member stays optional — plenty of jumps go up without
    // a camera, and a solo instructor shouldn't be blocked on filling it in.
    onSubmit(trimmed, staff.trim(), levelOptions ? level : '', showHandyCam && handyCam);
  }

  // Both inputs are styled identically; named once so they stay that way.
  const FIELD =
    'w-full h-12 px-3.5 rounded-[var(--radius-control)] border border-line-strong bg-canvas text-ink font-sans text-base focus-visible:outline-3 focus-visible:outline-gold focus-visible:outline-offset-1';

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
        <label class="block mb-1 text-[13px] font-bold" for="tandemCustomerName">{nameLabel}</label>
        <input
          bind:this={inputEl}
          id="tandemCustomerName"
          type="text"
          class={FIELD}
          placeholder={namePlaceholder}
          autocomplete="off"
          maxlength="80"
          required
          bind:value={name}
        />
        {#if levelOptions}
          <label class="block mt-3.5 mb-1 text-[13px] font-bold" for="tandemStudentLevel">Level</label>
          <select id="tandemStudentLevel" class={FIELD} required bind:value={level}>
            <option value="" disabled>Choose a level</option>
            {#each levelOptions as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        {/if}
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
        {#if showHandyCam}
          <label class="flex items-center gap-2 mt-3.5 text-[13.5px] font-medium cursor-pointer">
            <input type="checkbox" class="w-[18px] h-[18px] accent-gold" bind:checked={handyCam} />
            Handy cam footage
            <span class="font-normal text-ink-soft">(Ultimate package, +£{(handyCamBonusRate ?? 0).toFixed(2)})</span>
          </label>
        {/if}
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
            Add jump
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
