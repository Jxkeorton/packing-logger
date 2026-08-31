<script lang="ts">
  // The list-plus-add-form guts of ReferenceListPanel, without its own
  // collapsible chrome — split out so RigBuilderPanel can nest several of
  // these under one outer toggle (Canopy/Lineset/Pilot Chute/Container/
  // Rig all live inside "Rig builder" instead of five separate top-level
  // toggles to open one at a time). ReferenceListPanel itself is now just
  // this plus a <button>/{#if open}.
  import { enhance } from '$app/forms';
  import type { Snippet } from 'svelte';
  import { FORM_ACTIONS, FORM_SAVE_BUTTON, PANEL_HINT } from '$lib/ui-classes';
  import Spinner from './Spinner.svelte';

  interface Item {
    id: string;
    name: string;
    detail?: string;
  }

  let {
    hint,
    items,
    emptyText,
    category,
    categoryLabel,
    defaultId = null,
    allowDefault = true,
    addAction,
    removeAction,
    submitLabel,
    fields,
  }: {
    hint?: string;
    items: Item[];
    emptyText: string;
    category?: string;
    categoryLabel?: string;
    defaultId?: string | null;
    allowDefault?: boolean;
    addAction: string;
    removeAction: string;
    submitLabel: string;
    fields: Snippet;
  } = $props();

  let addFormEl: HTMLFormElement | undefined = $state();

  // Which row's star/delete form is currently in flight, if any — a
  // plain `use:enhance` with no options (what these two forms had
  // before) doesn't disable its button, so a double-tap fired the same
  // setDefault/remove twice before the first response came back. Only
  // one row can plausibly be mid-submit at a time, so a single id per
  // form is enough rather than a whole pending-set.
  let settingDefaultId = $state<string | null>(null);
  let removingId = $state<string | null>(null);
  let adding = $state(false);
</script>

{#if hint}<p class={PANEL_HINT}>{hint}</p>{/if}

<ul class="reference-list">
  {#each items as item (item.id)}
    <li class="reference-row">
      <div class="reference-row-text">
        <span class="reference-row-name">{item.name}</span>
        {#if item.detail}<span class="reference-row-detail">{item.detail}</span>{/if}
      </div>
      {#if allowDefault}
        <form
          method="POST"
          action="?/setDefault"
          use:enhance={() => {
            settingDefaultId = item.id;
            return async ({ update }) => {
              // Reset after the refreshed list lands, not before — the
              // star would otherwise be clickable again for the instant
              // between the response arriving and `items` catching up.
              await update();
              settingDefaultId = null;
            };
          }}
        >
          <input type="hidden" name="category" value={category} />
          <input type="hidden" name="id" value={item.id === defaultId ? '' : item.id} />
          <button
            type="submit"
            class="default-star"
            disabled={settingDefaultId === item.id}
            aria-pressed={item.id === defaultId}
            aria-label={`Set ${item.name} as the default ${categoryLabel}`}
          >
            {#if settingDefaultId === item.id}<Spinner size={13} />{:else}&#9733;{/if}
          </button>
        </form>
      {/if}
      <form
        method="POST"
        action={removeAction}
        use:enhance={() => {
          removingId = item.id;
          return async ({ update }) => {
            await update();
            removingId = null;
          };
        }}
      >
        <input type="hidden" name="id" value={item.id} />
        <button type="submit" class="reference-delete" disabled={removingId === item.id} aria-label={`Remove ${item.name}`}>
          {#if removingId === item.id}<Spinner size={14} />{:else}&times;{/if}
        </button>
      </form>
    </li>
  {:else}
    <li class="reference-empty">{emptyText}</li>
  {/each}
</ul>

<form
  bind:this={addFormEl}
  method="POST"
  action={addAction}
  class="pt-1 border-t border-line"
  use:enhance={() => {
    adding = true;
    return async ({ update }) => {
      await update();
      addFormEl?.reset();
      adding = false;
    };
  }}
>
  {@render fields()}
  <div class={FORM_ACTIONS}>
    <button type="submit" class={FORM_SAVE_BUTTON} disabled={adding}>
      {#if adding}<Spinner size={14} />{:else}{submitLabel}{/if}
    </button>
  </div>
</form>

<style>
  /*
   * Compare with ReferenceListPanel.astro's <style> block in the main
   * app: same rules, but plain scoped Svelte styles — no :global(), no
   * comment explaining why they need to reach client-injected markup,
   * because there is no client-injected markup. The rows above are
   * regular Svelte-rendered elements like any other.
   */
  .reference-list {
    list-style: none;
    margin: 0 0 12px;
    padding: 0;
  }

  .reference-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 2px;
    border-top: 1px solid var(--line);
  }

  .reference-row:first-child {
    border-top: none;
  }

  .reference-row-text {
    display: flex;
    flex-direction: column;
    gap: 1px;
    overflow: hidden;
    flex: 1;
    min-width: 0;
  }

  .reference-row-name {
    font-size: 13.5px;
    font-weight: 600;
  }

  .reference-row-detail {
    font-size: 12px;
    color: var(--ink-soft);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .reference-delete {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--ink-soft);
    font-size: 18px;
    line-height: 1;
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-control);
    cursor: pointer;
    touch-action: manipulation;
  }

  .reference-delete:hover,
  .reference-delete:focus-visible {
    background: var(--danger-soft);
    color: var(--danger);
    outline: none;
  }

  .reference-delete:disabled,
  .default-star:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .default-star {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--line-strong);
    font-size: 16px;
    line-height: 1;
    width: 26px;
    height: 26px;
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: var(--radius-control);
    cursor: pointer;
    touch-action: manipulation;
  }

  .default-star:hover,
  .default-star:focus-visible {
    background: var(--panel);
    color: var(--gold);
    outline: none;
  }

  .default-star[aria-pressed='true'] {
    color: var(--gold);
  }

  .reference-empty {
    margin: 0 0 12px;
    padding: 9px 2px;
    color: var(--ink-soft);
    font-size: 13px;
  }
</style>
