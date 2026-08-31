<script lang="ts">
  // Manifest sync configuration, on the shared Settings view. The
  // running state (what's been seen, what's waiting) lives on the
  // Logbook tab in BurbleSyncPanel — this is just the setup you do once.
  import { enhance } from '$app/forms';
  import { BURBLE_ROLE_LABELS } from '$lib/burble';
  import type { BurbleCodeMapping } from '$lib/burble';
  import {
    TOGGLE_SECTION,
    TOGGLE_BUTTON,
    TOGGLE_ICON,
    TOGGLE_PANEL,
    TOGGLE_PANEL_PADDED,
    PANEL_HINT,
    FIELD_LABEL,
    FIELD_LABEL_NARROW,
    FIELD_INPUT,
    FIELD_SELECT,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    FORM_STATUS,
  } from '$lib/ui-classes';

  let {
    enabled,
    dzId,
    myNames,
    pollSeconds,
    codeMap,
    unmappedCodes,
  }: {
    enabled: boolean;
    dzId: string;
    myNames: string[];
    pollSeconds: number;
    codeMap: BurbleCodeMapping[];
    unmappedCodes: string[];
  } = $props();

  let open = $state(false);
  let status = $state<{ text: string; kind?: 'ok' | 'error' }>({ text: '' });

  const roles = Object.entries(BURBLE_ROLE_LABELS) as [keyof typeof BURBLE_ROLE_LABELS, string][];
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>Manifest sync</span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class="{TOGGLE_PANEL} {TOGGLE_PANEL_PADDED}">
      <p class={PANEL_HINT}>
        Reads the dropzone's public manifest board and offers your jumps for logging once the load has flown. It can
        only see loads that are on the board at the time it looks — Burble keeps no history — so a jump missed while the
        app was closed has to go in by hand.
      </p>

      <form
        method="POST"
        action="?/saveBurbleSettings"
        use:enhance={() => {
          status = { text: 'Saving…' };
          return async ({ result, update }) => {
            status =
              result.type === 'success'
                ? { text: 'Saved', kind: 'ok' }
                : { text: (result as { data?: { error?: string } }).data?.error ?? 'Failed to save', kind: 'error' };
            await update({ reset: false });
          };
        }}
      >
        <label class="mb-3 flex items-center gap-2 text-[12.5px] font-semibold text-ink-soft">
          <input type="checkbox" name="enabled" checked={enabled} class="size-4" />
          <span>Read the manifest board</span>
        </label>

        <label class={FIELD_LABEL_NARROW}>
          <span>Dropzone id</span>
          <input
            type="text"
            name="dzId"
            class={FIELD_INPUT}
            value={dzId}
            inputmode="numeric"
            placeholder="e.g. 531"
            autocomplete="off"
            maxlength="20"
          />
        </label>

        <label class={FIELD_LABEL}>
          <span>Your name on the board — one per line</span>
          <textarea
            name="myNames"
            class={FIELD_INPUT}
            rows="2"
            placeholder="the name shown on the board"
            autocomplete="off"
            maxlength="400">{myNames.join('\n')}</textarea
          >
        </label>
        <p class="{PANEL_HINT} -mt-1.5">
          Type it exactly as the board shows it. Langar lists staff under their Burble <em>display name</em> rather
          than their real name, so if you have a nickname set that's the one to use — add both spellings if you're not
          sure which it'll be.
        </p>

        <label class={FIELD_LABEL_NARROW}>
          <span>Seconds between checks</span>
          <input type="number" name="pollSeconds" class={FIELD_INPUT} value={pollSeconds} min="15" max="300" step="5" />
        </label>
        <p class="{PANEL_HINT} -mt-1.5">
          Only used when automatic checking is switched on. A load can drop off the board a couple of minutes after it
          goes, so leave this well under that — 30s is a sensible default.
        </p>

        <div class={FORM_ACTIONS}>
          <button type="submit" class={FORM_SAVE_BUTTON}>Save</button>
          <span class={FORM_STATUS} data-state={status.kind} role="status">{status.text}</span>
        </div>
      </form>

      <h3 class="mt-5 mb-1.5 text-[15px] font-bold tracking-[-0.01em]">Jump codes</h3>
      <p class={PANEL_HINT}>
        What the board's shorthand means. Codes are the dropzone's own free text and new ones turn up from time to
        time — anything unrecognised is listed for you rather than guessed at.
      </p>

      {#if unmappedCodes.length > 0}
        <p class="mb-3 rounded-[var(--radius-control)] border border-line-strong px-3 py-2.5 text-[12.5px] text-ink-soft">
          Seen against your name but not mapped: <strong class="text-ink">{unmappedCodes.join(', ')}</strong>
        </p>
      {/if}

      {#if codeMap.length > 0}
        <ul class="m-0 mb-3 list-none p-0">
          {#each codeMap as mapping (mapping.code)}
            <li class="flex items-center gap-2 border-b border-line py-2 last:border-b-0">
              <span class="flex-1 text-[13.5px]">
                <span class="font-mono font-semibold">{mapping.code}</span>
                <span class="text-ink-soft"> → {BURBLE_ROLE_LABELS[mapping.role]} · {mapping.jumpTypeName}</span>
              </span>
              <form method="POST" action="?/removeBurbleCode" use:enhance={() => async ({ update }) => await update({ reset: false })}>
                <input type="hidden" name="code" value={mapping.code} />
                <button
                  type="submit"
                  class="appearance-none rounded-full border border-line bg-transparent px-2.5 py-1 text-[11.5px] text-ink-soft"
                  aria-label={`Remove ${mapping.code}`}>Remove</button
                >
              </form>
            </li>
          {/each}
        </ul>
      {/if}

      <form
        method="POST"
        action="?/mapBurbleCode"
        use:enhance={() => async ({ update }) => await update({ reset: true })}
      >
        <label class="{FIELD_LABEL} mb-2">
          <span>Code on the board</span>
          <input type="text" name="code" class={FIELD_INPUT} placeholder="e.g. AFF" autocomplete="off" maxlength="40" required />
        </label>
        <label class="{FIELD_LABEL} mb-2">
          <span>Counts as</span>
          <select name="role" class={FIELD_SELECT} required>
            {#each roles as [value, label] (value)}
              <option {value}>{label}</option>
            {/each}
          </select>
        </label>
        <label class="{FIELD_LABEL} mb-2">
          <span>Logbook jump type</span>
          <input
            type="text"
            name="jumpTypeName"
            class={FIELD_INPUT}
            placeholder="e.g. Sport"
            autocomplete="off"
            maxlength="40"
            required
          />
        </label>
        <div class={FORM_ACTIONS}>
          <button type="submit" class={FORM_SAVE_BUTTON}>Save code</button>
        </div>
      </form>
    </div>
  {/if}
</section>
