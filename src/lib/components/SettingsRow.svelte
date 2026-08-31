<script lang="ts">
  // One row in an iOS Settings-style group: a colour-coded icon, a label,
  // and a chevron that rotates open — tapping the row expands its own
  // content in place, same accordion behaviour the old per-section
  // toggles had (ReferenceListPanel, RigBuilderPanel, ...), just with a
  // shared look instead of each one drawing its own button/chevron.
  //
  // Deliberately owns nothing about what it expands into — `children` is
  // whatever form/list the caller wants shown, so this stays reusable
  // across Starting jump count, Dropzones, Rig builder, and so on without
  // needing to know about any of them.
  import type { Snippet } from 'svelte';
  import { SETTINGS_ROW_BUTTON, SETTINGS_ROW_ICON, SETTINGS_ROW_CHEVRON, SETTINGS_ROW_PANEL } from '$lib/ui-classes';

  let {
    icon,
    iconColor,
    label,
    children,
  }: {
    icon: Snippet;
    iconColor: string;
    label: string;
    children: Snippet;
  } = $props();

  let open = $state(false);
</script>

<div class="settings-row">
  <button type="button" class={SETTINGS_ROW_BUTTON} aria-expanded={open} onclick={() => (open = !open)}>
    <span class={SETTINGS_ROW_ICON} style="background:{iconColor}" aria-hidden="true">{@render icon()}</span>
    <span class="flex-1">{label}</span>
    <span class={SETTINGS_ROW_CHEVRON} aria-hidden="true">&rsaquo;</span>
  </button>

  {#if open}
    <div class={SETTINGS_ROW_PANEL}>
      {@render children()}
    </div>
  {/if}
</div>

<style>
  /* Rows sit flush against each other inside their SETTINGS_GROUP wrapper
     — only the group itself has a border/radius, individual rows are
     separated by this hairline instead of their own card chrome. */
  .settings-row + .settings-row {
    border-top: 1px solid var(--line);
  }
</style>
