<script lang="ts">
  // Jumps the manifest board saw you on, held until you confirm them.
  //
  // Lives above the tabs rather than inside the Logbook, because the point
  // is that you check the board *before* you get on the plane and confirm
  // *after* you land — by which time you might be on any tab. A count
  // badge here means you never have to remember to go looking.
  import { enhance } from '$app/forms';
  import { BURBLE_ROLE_LABELS } from '$lib/burble';
  import type { BurbleRole } from '$lib/burble';

  interface PendingJump {
    slotId: string;
    loadName: string;
    plate: string;
    loadNumber: string;
    code: string;
    role: BurbleRole;
    customerName: string;
    hint: string;
    leftBoard: boolean;
  }

  let { pending }: { pending: PendingJump[] } = $props();

  let open = $state(false);

  const loadLabel = (jump: PendingJump) =>
    jump.loadNumber ? `${jump.plate} load ${jump.loadNumber}` : jump.loadName;
</script>

{#if pending.length > 0}
  <section class="bg-panel border border-line rounded-card shadow-card overflow-hidden">
    <button
      type="button"
      class="group w-full flex items-center justify-between bg-transparent border-0 px-4 py-3.5 font-sans font-semibold text-[15px] text-ink cursor-pointer"
      aria-expanded={open}
      onclick={() => (open = !open)}
    >
      <span class="flex items-center gap-2">
        <span
          class="inline-flex min-w-6 items-center justify-center rounded-full bg-gold px-2 py-0.5 text-[12px] font-bold text-white"
          >{pending.length}</span
        >
        <span>{pending.length === 1 ? 'Jump to confirm' : 'Jumps to confirm'}</span>
      </span>
      <span
        class="transition-transform duration-150 ease text-xl text-ink-soft"
        class:rotate-90={open}
      >&rsaquo;</span>
    </button>

    {#if open}
      <div class="border-t border-line px-4 pt-3.5 pb-4">
        <p class="mt-0 mb-3.5 text-[12.5px] text-ink-soft">
          Seen with your name on the board. Confirm the ones you actually jumped — nothing goes in the logbook until
          you do.
        </p>

        <form
          method="POST"
          action="?/commitManifestJumps"
          use:enhance={() => async ({ update }) => await update({ reset: false })}
        >
          <ul class="m-0 mb-3 list-none p-0">
            {#each pending as jump (jump.slotId)}
              <li class="flex items-start gap-2.5 border-b border-line py-2.5 last:border-b-0">
                <input
                  type="checkbox"
                  name="slotId"
                  value={jump.slotId}
                  checked={jump.leftBoard}
                  class="mt-0.5 size-4 shrink-0"
                  aria-label={`${BURBLE_ROLE_LABELS[jump.role]} on ${loadLabel(jump)}`}
                />
                <span class="flex-1 text-[13.5px] leading-snug">
                  <span class="font-semibold">{BURBLE_ROLE_LABELS[jump.role]}</span>
                  {#if jump.customerName}<span> with {jump.customerName}</span>{/if}
                  <span class="block font-mono text-[11.5px] text-ink-soft">
                    {loadLabel(jump)} · {jump.code} · {jump.hint}
                  </span>
                </span>
              </li>
            {/each}
          </ul>
          <button
            type="submit"
            class="appearance-none border-0 rounded-[10px] h-10.5 px-5 font-display font-bold text-sm text-white bg-gold cursor-pointer touch-manipulation"
            >Log selected</button
          >
        </form>

        <form
          method="POST"
          action="?/dismissManifestJump"
          class="mt-3"
          use:enhance={() => async ({ update }) => await update({ reset: false })}
        >
          <p class="mt-0 mb-1.5 text-[12.5px] text-ink-soft">Didn't jump one of these?</p>
          {#each pending as jump (jump.slotId)}
            <button
              type="submit"
              name="slotId"
              value={jump.slotId}
              class="mr-2 mb-1 appearance-none rounded-full border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-ink-soft"
            >
              Remove {loadLabel(jump)}
            </button>
          {/each}
        </form>
      </div>
    {/if}
  </section>
{/if}
