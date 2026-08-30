<script lang="ts">
  // Manifest sync controls, on the Log tab: check the board, and set
  // whether to keep checking automatically.
  //
  // This panel deliberately does *not* list the jumps it found — those go
  // to PendingJumpsMenu at the top of the app, because you check the board
  // before boarding and confirm after landing, by which point you could be
  // on any tab. Nothing here writes a jump.
  import { enhance, deserialize } from '$app/forms';
  import { invalidateAll } from '$app/navigation';
  import {
    TOGGLE_SECTION,
    TOGGLE_BUTTON,
    TOGGLE_ICON,
    TOGGLE_PANEL,
    TOGGLE_PANEL_PADDED,
    PANEL_HINT,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    FORM_STATUS,
  } from '$lib/ui-classes';

  let {
    enabled,
    autoPoll,
    pollSeconds,
    pendingCount,
    unmappedCodes,
    lastSyncAt,
  }: {
    enabled: boolean;
    autoPoll: boolean;
    pollSeconds: number;
    pendingCount: number;
    unmappedCodes: string[];
    lastSyncAt: string | null;
  } = $props();

  let open = $state(true);
  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });
  let syncing = $state(false);

  const clockOf = (iso: string | null) =>
    iso ? new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '';

  /**
   * Post to the sync action directly rather than through a <form>.
   *
   * Everything else in this app submits with `use:enhance` (see
   * instructions.md §3), but the auto-poll timer has no user submit to
   * enhance — this is the documented way to invoke an action from script.
   */
  async function syncNow() {
    if (syncing) return;
    syncing = true;
    status = { text: 'Checking the board…' };
    try {
      const response = await fetch('?/syncManifest', {
        method: 'POST',
        headers: { 'x-sveltekit-action': 'true' },
        body: new FormData(),
      });
      const result = deserialize(await response.text());
      if (result.type === 'success') {
        await invalidateAll();
        status = { text: `Checked at ${clockOf(new Date().toISOString())}`, kind: 'ok' };
      } else {
        const message = (result as { data?: { error?: string } }).data?.error ?? 'Could not reach the manifest';
        status = { text: message, kind: 'error' };
      }
    } catch {
      status = { text: 'Could not reach the manifest', kind: 'error' };
    } finally {
      syncing = false;
    }
  }

  // Auto-poll. Deliberately paused while the tab is hidden: iOS suspends
  // timers the moment the tab backgrounds or the phone locks, so a timer
  // that "keeps running" is a lie — better to stop cleanly and catch up
  // with one immediate sync when the tab comes back.
  $effect(() => {
    if (!enabled || !autoPoll) return;

    let timer: ReturnType<typeof setInterval> | undefined;

    const start = () => {
      stop();
      void syncNow();
      timer = setInterval(() => void syncNow(), Math.max(15, pollSeconds) * 1000);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = undefined;
    };
    const onVisibility = () => (document.visibilityState === 'visible' ? start() : stop());

    start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  });
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>
      Manifest
    </span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class="{TOGGLE_PANEL} {TOGGLE_PANEL_PADDED}">
      {#if !enabled}
        <p class={PANEL_HINT}>
          Manifest sync is off. Turn it on under Settings &rarr; Manifest sync, with your dropzone id and the name that
          appears on the board.
        </p>
      {:else}
        <div class={FORM_ACTIONS}>
          <button type="button" class={FORM_SAVE_BUTTON} onclick={syncNow} disabled={syncing}>
            {syncing ? 'Checking…' : 'Check the board'}
          </button>
          <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
        </div>

        <form
          method="POST"
          action="?/setBurbleAutoPoll"
          class="mt-3.5"
          use:enhance={() => async ({ update }) => await update({ reset: false })}
        >
          <label class="flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
            <input
              type="checkbox"
              name="autoPoll"
              checked={autoPoll}
              onchange={(e) => e.currentTarget.form?.requestSubmit()}
              class="size-4"
            />
            <span>Keep checking every {pollSeconds}s while this screen is open</span>
          </label>
        </form>
        <p class="{PANEL_HINT} mt-1.5">
          Only runs with the app open and the screen awake — iOS stops it when the phone locks. Check the board by hand
          after a load if you've had it in your pocket.
        </p>

        {#if lastSyncAt}
          <p class="{PANEL_HINT} mb-0">Last checked {clockOf(lastSyncAt)}.</p>
        {/if}

        {#if unmappedCodes.length > 0}
          <p class="mt-3.5 mb-0 rounded-[10px] border border-line-strong px-3 py-2.5 text-[12.5px] text-ink-soft">
            Your name appeared with {unmappedCodes.length === 1 ? 'a jump code' : 'jump codes'} this app doesn't know:
            <strong class="text-ink">{unmappedCodes.join(', ')}</strong>. Add {unmappedCodes.length === 1
              ? 'it'
              : 'them'} under Settings &rarr; Manifest sync and they'll be logged next time.
          </p>
        {/if}

        {#if pendingCount > 0}
          <p class="{PANEL_HINT} mt-3.5 mb-0">
            {pendingCount === 1 ? '1 jump is' : `${pendingCount} jumps are`} waiting to be confirmed — see
            <strong class="text-ink">Jumps to confirm</strong> at the top of the screen.
          </p>
        {:else if lastSyncAt}
          <p class="{PANEL_HINT} mt-3.5 mb-0">Nothing with your name on it right now.</p>
        {/if}
      {/if}
    </div>
  {/if}
</section>
