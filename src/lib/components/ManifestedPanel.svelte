<script module lang="ts">
  // Module-level so the Work jumps and Logbook copies of this panel stay
  // collapsed or open together, rather than each remembering its own.
  const view = $state({ open: true });
</script>

<script lang="ts">
  // The loads the board has you on that haven't been called yet. Purely
  // informational: nothing here is a jump until its load reaches a short
  // call, at which point the sync moves it into "Jumps to confirm" and it
  // leaves this panel. If the manifesters move you off a load, the row just
  // disappears — nothing was logged or kept.
  //
  // The board is only polled every couple of minutes, so the minutes shown
  // are the last-synced value counted down against the clock; `lastSeen`
  // is when that value was true.
  import { BURBLE_ROLE_LABELS } from '$lib/burble';
  import type { BurbleRole } from '$lib/burble';

  interface ManifestedJump {
    slotId: string;
    loadName: string;
    plate: string;
    loadNumber: string;
    status: string;
    timeLeft: number | null;
    code: string;
    role: BurbleRole;
    customerName: string;
    studentLevel?: string;
    handyCam?: boolean;
    lastSeen: string;
  }

  let { manifested }: { manifested: ManifestedJump[] } = $props();

  let now = $state(Date.now());
  $effect(() => {
    if (manifested.length === 0) return;
    const tick = setInterval(() => (now = Date.now()), 15_000);
    return () => clearInterval(tick);
  });

  const loadLabel = (jump: ManifestedJump) =>
    jump.loadNumber ? `${jump.plate} load ${jump.loadNumber}` : jump.loadName;

  /** Minutes to take-off as of now, or null when the board gave no countdown. */
  function minutesLeft(jump: ManifestedJump): number | null {
    if (jump.timeLeft === null) return null;
    const elapsed = (now - new Date(jump.lastSeen).getTime()) / 60_000;
    return Math.ceil(jump.timeLeft - Math.max(0, elapsed));
  }

  /** Most urgent first; loads with no countdown yet (still Building) go last, in load order. */
  const sorted = $derived(
    [...manifested].sort((a, b) => {
      const left = (j: ManifestedJump) => minutesLeft(j) ?? Infinity;
      const byTime = left(a) === left(b) ? 0 : left(a) < left(b) ? -1 : 1;
      return byTime || Number(a.loadNumber || Infinity) - Number(b.loadNumber || Infinity);
    }),
  );

  /** Green until 6 minutes out, amber from 6, red from 3. */
  function countdownColor(left: number): string {
    if (left <= 3) return '#f2402b';
    if (left <= 6) return '#f59e0b';
    return '#17c964';
  }
</script>

{#if manifested.length > 0}
  <section class="bg-panel border border-line rounded-card shadow-card overflow-hidden" aria-label="Manifest">
    <button
      type="button"
      class="w-full flex items-center justify-between bg-transparent border-0 px-4 py-3.5 font-sans font-semibold text-[15px] text-ink cursor-pointer"
      aria-expanded={view.open}
      onclick={() => (view.open = !view.open)}
    >
      <span class="flex items-center gap-2">
        <span
          class="inline-flex min-w-6 items-center justify-center rounded-full bg-ink px-2 py-0.5 text-[12px] font-bold text-canvas"
          >{manifested.length}</span
        >
        <span>Manifest</span>
      </span>
      <span class="transition-transform duration-150 ease text-xl text-ink-soft" class:rotate-90={view.open}
        >&rsaquo;</span
      >
    </button>
    {#if view.open}
      <ul class="m-0 list-none border-t border-line px-4 py-1.5">
        {#each sorted as jump (jump.slotId)}
          {@const left = minutesLeft(jump)}
          <li class="flex items-center gap-3 border-b border-line py-2.5 last:border-b-0">
            <span class="flex-1 text-[13.5px] leading-snug">
              <span class="font-semibold">{BURBLE_ROLE_LABELS[jump.role]}</span>
              {#if jump.customerName}<span> with {jump.customerName}</span>{/if}
              {#if jump.handyCam}<span class="text-ink-soft"> · handy cam</span>{/if}
              {#if jump.studentLevel}<span class="text-ink-soft"> · {jump.studentLevel}</span>{/if}
              <span class="block font-mono text-[11.5px] text-ink-soft">{loadLabel(jump)} · {jump.code}</span>
            </span>
            {#if left !== null}
              <span
                class="w-14 shrink-0 text-center font-mono text-[24px] font-bold leading-none"
                style:color={countdownColor(left)}
                aria-label={`${Math.max(0, left)} minutes to take-off`}>{Math.max(0, left)}</span
              >
            {:else}
              <span class="w-14 shrink-0 text-center text-[12px] font-semibold text-ink-soft">{jump.status}</span>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </section>
{/if}
