<script lang="ts">
  // The timer toggle button both starts/stops the stopwatch *and* (on
  // stop) is what triggers saving a time — not a user-submitted <form>,
  // so this calls the named action directly via fetch('?/recordPackTime',
  // ...) instead of use:enhance, then invalidateAll() to refresh
  // `topTimes` from the page's `load`. Simpler than routing a
  // js-computed value through a bind:value'd hidden input and
  // requestSubmit(), which risks submitting before Svelte's batched
  // reactivity has actually written the value to the DOM.
  import { invalidateAll } from '$app/navigation';
  import { formatDuration, formatWhen } from '$lib/format';
  import type { PackTime } from '$lib/server/times';

  let { topTimes }: { topTimes: PackTime[] } = $props();

  let running = $state(false);
  let elapsedDisplay = $state('0:00.0');
  let startedAt = 0;
  let timerHandle: ReturnType<typeof setInterval> | undefined;
  let deletingAt = $state<string | null>(null);

  function tick() {
    elapsedDisplay = formatDuration(Date.now() - startedAt);
  }

  async function savePackTime(ms: number) {
    const formData = new FormData();
    formData.set('ms', String(ms));
    await fetch('?/recordPackTime', { method: 'POST', body: formData });
    await invalidateAll();
  }

  function toggle() {
    if (!running) {
      startedAt = Date.now();
      running = true;
      tick();
      timerHandle = setInterval(tick, 100);
    } else {
      clearInterval(timerHandle);
      const elapsed = Date.now() - startedAt;
      running = false;
      elapsedDisplay = '0:00.0';
      void savePackTime(Math.round(elapsed));
    }
  }

  async function deleteTime(at: string) {
    deletingAt = at;
    const formData = new FormData();
    formData.set('at', at);
    await fetch('?/deletePackTime', { method: 'POST', body: formData });
    await invalidateAll();
    deletingAt = null;
  }
</script>

<div class="bg-panel border border-line rounded-card shadow-card px-5 py-10 flex flex-col items-center gap-6">
  <div class="font-display font-bold text-[64px] tracking-[-0.02em] [font-variant-numeric:tabular-nums] text-ink">
    {elapsedDisplay}
  </div>
  <button
    type="button"
    class="timer-btn"
    class:running
    onclick={toggle}
  >
    {running ? 'Stop' : 'Start'}
  </button>
</div>

<section class="fastest">
  <h2 class="fastest-title">Fastest 5</h2>
  <div>
    {#if topTimes.length === 0}
      <p class="fastest-empty">Time a pack job to start the board.</p>
    {:else}
      <ol class="fastest-list">
        {#each topTimes as t, i (t.at)}
          <li class="fastest-row" class:is-first={i === 0}>
            <span class="fastest-rank">{i + 1}</span>
            <span class="fastest-duration">{formatDuration(t.ms)}</span>
            <span class="fastest-when">{formatWhen(t.at)}</span>
            <button
              type="button"
              class="fastest-delete"
              disabled={deletingAt === t.at}
              aria-label={`Delete the ${formatDuration(t.ms)} time`}
              onclick={() => deleteTime(t.at)}
            >
              &times;
            </button>
          </li>
        {/each}
      </ol>
    {/if}
  </div>
</section>

<style>
  .timer-btn {
    appearance: none;
    border: 0;
    width: 100%;
    max-width: 280px;
    height: 64px;
    border-radius: 999px;
    font-family: var(--font-display);
    font-weight: 700;
    font-size: 20px;
    color: white;
    background: var(--student);
    cursor: pointer;
    touch-action: manipulation;
    transition: transform 80ms ease;
  }

  .timer-btn.running {
    background: var(--danger);
  }

  .timer-btn:active {
    transform: scale(0.96);
  }

  .timer-btn:focus-visible {
    outline: 3px solid var(--gold);
    outline-offset: 2px;
  }

  .fastest {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    padding: 14px 16px 6px;
  }

  .fastest-title {
    margin: 0 0 10px;
    font-size: 15px;
    font-weight: 700;
  }

  .fastest-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .fastest-row {
    display: grid;
    grid-template-columns: 22px auto 1fr auto;
    align-items: center;
    gap: 10px;
    padding: 6px 0;
    border-top: 1px solid var(--line);
    font-family: var(--font-mono);
    font-size: 13px;
  }

  .fastest-row.is-first {
    color: var(--gold);
  }

  .fastest-rank {
    color: var(--ink-soft);
    font-size: 12px;
  }

  .fastest-row.is-first .fastest-rank {
    color: var(--gold);
  }

  .fastest-duration {
    font-weight: 600;
    font-size: 16px;
  }

  .fastest-when {
    text-align: right;
    color: var(--ink-soft);
    font-size: 12px;
  }

  .fastest-row.is-first .fastest-when {
    color: inherit;
    opacity: 0.8;
  }

  .fastest-delete {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    font-size: 20px;
    line-height: 1;
    width: 28px;
    height: 28px;
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .fastest-delete:hover,
  .fastest-delete:focus-visible {
    background: var(--danger-soft);
    color: var(--danger);
    outline: none;
  }

  .fastest-delete:active {
    transform: scale(0.9);
  }

  .fastest-empty {
    margin: 0;
    padding: 10px 0 14px;
    color: var(--ink-soft);
    font-size: 14px;
  }
</style>
