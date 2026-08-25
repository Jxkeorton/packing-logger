<script lang="ts">
  import { enhance } from '$app/forms';
  import type { Snippet } from 'svelte';
  import {
    TOGGLE_SECTION,
    TOGGLE_BUTTON,
    TOGGLE_ICON,
    TOGGLE_PANEL,
    TOGGLE_PANEL_PADDED,
    FORM_ACTIONS,
    FORM_SAVE_BUTTON,
    PANEL_HINT,
  } from '$lib/ui-classes';

  interface Item {
    id: string;
    name: string;
    detail?: string;
  }

  let {
    label,
    hint,
    items,
    emptyText,
    category,
    categoryLabel,
    defaultId,
    addAction,
    removeAction,
    submitLabel,
    fields,
  }: {
    label: string;
    hint: string;
    items: Item[];
    emptyText: string;
    category: string;
    categoryLabel: string;
    defaultId: string | null;
    addAction: string;
    removeAction: string;
    submitLabel: string;
    fields: Snippet;
  } = $props();

  let open = $state(false);
  let addFormEl: HTMLFormElement | undefined = $state();
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>{label}</span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class="{TOGGLE_PANEL} {TOGGLE_PANEL_PADDED}">
      <p class={PANEL_HINT}>{hint}</p>

      <ul class="reference-list">
        {#each items as item (item.id)}
          <li class="reference-row">
            <div class="reference-row-text">
              <span class="reference-row-name">{item.name}</span>
              {#if item.detail}<span class="reference-row-detail">{item.detail}</span>{/if}
            </div>
            <form method="POST" action="?/setDefault" use:enhance>
              <input type="hidden" name="category" value={category} />
              <input type="hidden" name="id" value={item.id === defaultId ? '' : item.id} />
              <button
                type="submit"
                class="default-star"
                aria-pressed={item.id === defaultId}
                aria-label={`Set ${item.name} as the default ${categoryLabel}`}
              >
                &#9733;
              </button>
            </form>
            <form method="POST" action={removeAction} use:enhance>
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" class="reference-delete" aria-label={`Remove ${item.name}`}>&times;</button>
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
          return async ({ update }) => {
            await update();
            addFormEl?.reset();
          };
        }}
      >
        {@render fields()}
        <div class={FORM_ACTIONS}>
          <button type="submit" class={FORM_SAVE_BUTTON}>{submitLabel}</button>
        </div>
      </form>
    </div>
  {/if}
</section>

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
    border-radius: 8px;
    cursor: pointer;
    touch-action: manipulation;
  }

  .reference-delete:hover,
  .reference-delete:focus-visible {
    background: var(--danger-soft);
    color: var(--danger);
    outline: none;
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
    border-radius: 8px;
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
