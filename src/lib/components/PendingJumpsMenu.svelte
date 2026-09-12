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
  import { dayLabel } from '$lib/format';
  import Spinner from './Spinner.svelte';

  interface PendingJump {
    slotId: string;
    loadName: string;
    plate: string;
    loadNumber: string;
    code: string;
    role: BurbleRole;
    customerName: string;
    /**
     * The AFF student's level as the board words it; '' on every other
     * role, and `undefined` on a sighting captured before this field
     * existed and still sitting in burble-sync.json.
     */
    studentLevel?: string;
    /**
     * True on an instructor jump the board showed self-filmed (my name
     * against both the TI slot and a camera code) — merged from what
     * would otherwise be two separate entries for one jump, see
     * $lib/burble.ts's mergeSelfFilmed. `undefined` on a sighting
     * captured before this field existed.
     */
    handyCam?: boolean;
    hint: string;
    leftBoard: boolean;
    /** When this slot was first seen on the board — what the day headers below group on. */
    firstSeen: string;
  }

  let { pending }: { pending: PendingJump[] } = $props();

  let open = $state(false);
  let committing = $state(false);
  // Which slot's "Remove …" button was tapped — that form has one submit
  // button per pending jump, so unlike committing there's no single
  // whole-form flag; `submitter` (the actual button clicked) tells them
  // apart.
  let dismissingSlotId = $state<string | null>(null);

  const loadLabel = (jump: PendingJump) =>
    jump.loadNumber ? `${jump.plate} load ${jump.loadNumber}` : jump.loadName;

  /**
   * `pending` grouped into day headers, without disturbing the order it
   * arrives in — leftBoard-confidence first, most recent within that (see
   * sync.ts's pendingJumps). Nothing here ever purges an old entry, so
   * this list can span months; the headers are what keep a growing
   * backlog scannable instead of one undifferentiated pile. A run breaks
   * into a fresh group whenever a jump's day differs from the one before
   * it — same day can in principle recur in two separate runs (a jump
   * still on the board today, listed below an already-landed one from
   * earlier today), which just means two "Today" headers rather than one.
   */
  let groups = $derived.by(() => {
    const result: { label: string; jumps: PendingJump[] }[] = [];
    for (const jump of pending) {
      const label = dayLabel(jump.firstSeen);
      const current = result.at(-1);
      if (current?.label === label) current.jumps.push(jump);
      else result.push({ label, jumps: [jump] });
    }
    return result;
  });
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
          use:enhance={() => {
            committing = true;
            return async ({ update }) => {
              await update({ reset: false });
              committing = false;
            };
          }}
        >
          <ul class="m-0 mb-3 list-none p-0">
            {#each groups as group (group.jumps[0].slotId)}
              <li class="pt-3 pb-1 text-[11px] font-bold uppercase tracking-wide text-ink-soft first:pt-0">
                {group.label}
              </li>
              {#each group.jumps as jump (jump.slotId)}
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
                    {#if jump.handyCam}<span class="text-ink-soft"> · handy cam</span>{/if}
                    <!-- The level is what tells two AFF slots on the same
                         board apart, so it sits right on the row being
                         ticked rather than only in the logbook entry it
                         becomes. -->
                    {#if jump.studentLevel}<span class="text-ink-soft"> · {jump.studentLevel}</span>{/if}
                    <span class="block font-mono text-[11.5px] text-ink-soft">
                      {loadLabel(jump)} · {jump.code} · {jump.hint}
                    </span>
                  </span>
                </li>
              {/each}
            {/each}
          </ul>
          <button
            type="submit"
            class="appearance-none border-0 rounded-[var(--radius-control)] h-10.5 px-5 font-display font-bold text-sm text-white bg-gold cursor-pointer touch-manipulation disabled:opacity-60 disabled:cursor-default inline-flex items-center gap-2"
            disabled={committing}
            >{#if committing}<Spinner size={14} />{/if}Log selected</button
          >
        </form>

        <form
          method="POST"
          action="?/dismissManifestJump"
          class="mt-3"
          use:enhance={({ submitter }) => {
            dismissingSlotId = submitter instanceof HTMLButtonElement ? submitter.value : null;
            return async ({ update }) => {
              await update({ reset: false });
              dismissingSlotId = null;
            };
          }}
        >
          <p class="mt-0 mb-1.5 text-[12.5px] text-ink-soft">Didn't jump one of these?</p>
          {#each pending as jump (jump.slotId)}
            <button
              type="submit"
              name="slotId"
              value={jump.slotId}
              disabled={dismissingSlotId === jump.slotId}
              class="mr-2 mb-1 appearance-none rounded-full border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-ink-soft disabled:opacity-50 disabled:cursor-default inline-flex items-center gap-1.5"
            >
              {#if dismissingSlotId === jump.slotId}<Spinner size={11} />{/if}
              Remove {loadLabel(jump)}
            </button>
          {/each}
        </form>
      </div>
    {/if}
  </section>
{/if}
