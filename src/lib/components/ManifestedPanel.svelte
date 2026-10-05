<script lang="ts">
  // The next load the board has you on that hasn't been called yet. Sits
  // at the top of the totals card on the Work jumps and Logbook tabs, as a
  // header row. Purely informational: nothing here is a jump until its load reaches a short
  // call, at which point the sync moves it into "Jumps to confirm" and it
  // leaves this panel. If the manifesters move you off a load, the row just
  // disappears — nothing was logged or kept.
  //
  // The board is only polled every couple of minutes, so the minutes shown
  // are the last-synced value counted down against the clock; `lastSeen`
  // is when that value was true.
  import { BURBLE_ROLE_LABELS } from '$lib/burble';
  import type { BurbleRole, BurbleStudent } from '$lib/burble';

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
    /** Absent on a sighting captured before this was recorded. */
    loadStudents?: BurbleStudent[];
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

  const next = $derived(sorted[0]);

  // The students on that load, for the tannoy call-out — an instructor has
  // to read every name out, and picking them from the whole plane's
  // manifest on the board is the hard part.
  let studentsOpen = $state(false);
  // Tandem students only, and only on a tandem instructor jump — AFF and
  // camera jumps don't make the call-out.
  const students = $derived(
    next?.role === 'instructor' ? (next.loadStudents ?? []).filter((s) => s.kind === 'tandem') : [],
  );

  // Closing on its own when the load leaves the manifest, rather than
  // leaving a modal about a load that's no longer shown.
  $effect(() => {
    if (!next) studentsOpen = false;
  });

  /** Green until 6 minutes out, amber from 6, red from 3. */
  function countdownColor(left: number): string {
    if (left <= 3) return '#f2402b';
    if (left <= 6) return '#f59e0b';
    return '#17c964';
  }
</script>

{#if next}
  {@const left = minutesLeft(next)}
  <div class="basis-full flex items-center gap-3 border-b border-line pb-2.5" aria-label="Next on the manifest">
    <span class="flex-1 text-[13.5px] leading-snug">
      <span class="block text-xs uppercase tracking-[0.08em] text-ink-soft">Next on manifest</span>
      <span class="font-semibold">{BURBLE_ROLE_LABELS[next.role]}</span>
      {#if next.customerName}<span> with {next.customerName}</span>{/if}
      {#if next.handyCam}<span class="text-ink-soft"> · handy cam</span>{/if}
      {#if next.studentLevel}<span class="text-ink-soft"> · {next.studentLevel}</span>{/if}
      <span class="block font-mono text-[11.5px] text-ink-soft">{loadLabel(next)} · {next.code}</span>
    </span>
    <span class="flex shrink-0 items-center gap-0.5">
      {#if students.length > 0}
        <button
          type="button"
          class="inline-flex size-9 appearance-none items-center justify-center rounded-full border border-line-strong bg-transparent p-0 text-ink cursor-pointer touch-manipulation"
          aria-label="Students list"
          title="Students list"
          onclick={() => (studentsOpen = true)}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
        </button>
      {/if}
      {#if left !== null}
        <span
          class="w-9 shrink-0 text-center font-mono text-[24px] font-bold leading-none"
          style:color={countdownColor(left)}
          aria-label={`${Math.max(0, left)} minutes to take-off`}>{Math.max(0, left)}</span
        >
      {:else}
        <span class="w-9 shrink-0 text-center text-[12px] font-semibold text-ink-soft">{next.status}</span>
      {/if}
    </span>
  </div>
{/if}

<svelte:window onkeydown={(e) => e.key === 'Escape' && studentsOpen && (studentsOpen = false)} />

{#if next && studentsOpen}
  <div
    class="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(11,22,32,0.5)] p-4"
    onclick={(e) => {
      if (e.target === e.currentTarget) studentsOpen = false;
    }}
    role="presentation"
  >
    <div
      class="flex max-h-[85vh] w-full max-w-100 flex-col rounded-card bg-panel p-5 shadow-card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="studentsListTitle"
    >
      <h2 class="m-0 mb-0.5 text-[17px] font-bold" id="studentsListTitle">Students list</h2>
      <p class="mt-0 mb-3 text-[13px] text-ink-soft">
        {loadLabel(next)} · {students.length} {students.length === 1 ? 'student' : 'students'}
      </p>
      <ul class="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {#each students as student, i (i)}
          <li class="flex items-center justify-between gap-3 border-b border-line py-3 last:border-b-0">
            <span class="text-[19px] font-semibold leading-tight">{student.name}</span>
            {#if student.mine}
              <span class="shrink-0 rounded-full bg-ink px-2.5 py-0.5 text-[11px] font-bold text-canvas">Yours</span>
            {/if}
          </li>
        {/each}
      </ul>
      <button
        type="button"
        class="mt-4 h-11 appearance-none rounded-[var(--radius-control)] border-0 bg-ink font-display text-sm font-bold text-canvas cursor-pointer touch-manipulation"
        onclick={() => (studentsOpen = false)}>Close</button
      >
    </div>
  </div>
{/if}
