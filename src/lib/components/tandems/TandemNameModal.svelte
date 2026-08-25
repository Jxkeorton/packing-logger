<script lang="ts">
  // Direct port of TandemNameModal.astro's markup + the modal-handling
  // half of lib/client/tandems-jump-log.ts (openNameModal/closeNameModal,
  // the Escape-key and backdrop-click listeners) — as component state and
  // effects instead of manual getElementById + addEventListener wiring.
  let {
    open,
    subtitle,
    onSubmit,
    onClose,
  }: {
    open: boolean;
    subtitle: string;
    onSubmit: (name: string) => void;
    onClose: () => void;
  } = $props();

  let name = $state('');
  let inputEl: HTMLInputElement | undefined = $state();

  $effect(() => {
    if (open) {
      name = '';
      inputEl?.focus();
    }
  });

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  }

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
      <h2 class="m-0 mb-0.5 text-[17px] font-bold" id="tandemNameModalTitle">Customer name</h2>
      <p class="mt-0 mb-3.5 text-[13px] text-ink-soft">{subtitle}</p>
      <form onsubmit={handleSubmit}>
        <input
          bind:this={inputEl}
          type="text"
          class="w-full h-12 px-3.5 rounded-[10px] border border-line-strong bg-canvas text-ink font-sans text-base focus-visible:outline-3 focus-visible:outline-gold focus-visible:outline-offset-1"
          placeholder="e.g. Jane Smith"
          autocomplete="off"
          maxlength="80"
          required
          bind:value={name}
        />
        <div class="flex gap-2.5 mt-3.5">
          <button
            type="button"
            class="flex-1 appearance-none border border-line-strong rounded-[10px] h-11.5 font-display font-bold text-[15px] cursor-pointer touch-manipulation bg-transparent text-ink-soft"
            onclick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 appearance-none border-0 rounded-[10px] h-11.5 font-display font-bold text-[15px] cursor-pointer touch-manipulation bg-gold text-white disabled:opacity-60 disabled:cursor-default"
          >
            Add jump
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
