<script lang="ts">
  import type { Snippet } from 'svelte';
  import { TOGGLE_SECTION, TOGGLE_BUTTON, TOGGLE_ICON, TOGGLE_PANEL, TOGGLE_PANEL_PADDED } from '$lib/ui-classes';
  import ReferenceListBody from './ReferenceListBody.svelte';

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
    defaultId = null,
    allowDefault = true,
    addAction,
    removeAction,
    submitLabel,
    fields,
  }: {
    label: string;
    hint?: string;
    items: Item[];
    emptyText: string;
    category?: string;
    categoryLabel?: string;
    defaultId?: string | null;
    // Places/aircraft/jump types/rigs each have one "default" the add-jump
    // form pre-selects, so their rows get a star toggle. Canopies/linesets/
    // pilot chutes/containers are only ever picked *through* a rig, so
    // there's nothing for a star on one of them to do — set this false to
    // leave it off rather than show a control with no effect.
    allowDefault?: boolean;
    addAction: string;
    removeAction: string;
    submitLabel: string;
    fields: Snippet;
  } = $props();

  let open = $state(false);
</script>

<section class={TOGGLE_SECTION}>
  <button type="button" class={TOGGLE_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span>{label}</span>
    <span class={TOGGLE_ICON} class:rotate-90={open}>&rsaquo;</span>
  </button>

  {#if open}
    <div class="{TOGGLE_PANEL} {TOGGLE_PANEL_PADDED}">
      <ReferenceListBody
        {hint}
        {items}
        {emptyText}
        {category}
        {categoryLabel}
        {defaultId}
        {allowDefault}
        {addAction}
        {removeAction}
        {submitLabel}
        {fields}
      />
    </div>
  {/if}
</section>
