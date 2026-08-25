<script lang="ts">
  import LogForm from '$lib/components/LogForm.svelte';
  import ReferenceListPanel from '$lib/components/ReferenceListPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import { FIELD_LABEL, FIELD_LABEL_NARROW, FIELD_INPUT } from '$lib/ui-classes';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let activeTab = $state<'log' | 'settings'>('log');

  // ReferenceListPanel wants each list pre-shaped to a generic
  // {id, name, detail?} row — same idea as the real app's
  // ReferenceListPanel.astro. These are $derived, not computed once, so
  // they stay current after any action re-runs `load` — no separate
  // "refresh" step anywhere.
  const places = $derived(data.settings.places.map((p) => ({ id: p.id, name: p.name })));
  const equipment = $derived(
    data.settings.equipment.map((eq) => ({
      id: eq.id,
      name: eq.name,
      detail: [eq.canopy, eq.container, eq.aad].filter(Boolean).join(' · ') || 'No details saved',
    })),
  );
  const aircraft = $derived(data.settings.aircraft.map((ac) => ({ id: ac.id, name: ac.plate })));
  const jumpTypes = $derived(data.settings.jumpTypes.map((jt) => ({ id: jt.id, name: jt.name })));
</script>

<svelte:head>
  <title>Logbook spike</title>
</svelte:head>

<div class="max-w-[560px] mx-auto px-4 pt-5 pb-10 flex flex-col gap-[22px]">
  <div class="flex gap-2" role="tablist" aria-label="Logbook view">
    <button
      type="button"
      role="tab"
      class="tab-button"
      aria-selected={activeTab === 'log'}
      onclick={() => (activeTab = 'log')}
    >
      Log
    </button>
    <button
      type="button"
      role="tab"
      class="tab-button"
      aria-selected={activeTab === 'settings'}
      onclick={() => (activeTab = 'settings')}
    >
      Settings
    </button>
  </div>

  <div class="flex flex-col gap-[22px]" class:hidden={activeTab !== 'log'}>
    <LogForm
      entries={data.entries}
      nextNumber={data.nextNumber}
      settings={data.settings}
      today={data.today}
      dateDisplay={data.dateDisplay}
    />
  </div>

  <div class="flex flex-col gap-[22px]" class:hidden={activeTab !== 'settings'}>
    <ReferenceListPanel
      label="Places"
      hint="The starred one is pre-selected whenever you start a new jump."
      items={places}
      emptyText="No places saved yet."
      category="place"
      categoryLabel="place"
      defaultId={data.settings.defaultPlaceId}
      addAction="?/addPlace"
      removeAction="?/removePlace"
      submitLabel="Save place"
    >
      {#snippet fields()}
        <label class="{FIELD_LABEL} mt-2.5 mb-0">
          <span>Name</span>
          <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Langar" autocomplete="off" maxlength="80" required />
        </label>
      {/snippet}
    </ReferenceListPanel>

    <ReferenceListPanel
      label="Equipment"
      hint="The starred one is pre-selected whenever you start a new jump."
      items={equipment}
      emptyText="No equipment saved yet."
      category="equipment"
      categoryLabel="equipment"
      defaultId={data.settings.defaultEquipmentId}
      addAction="?/addEquipment"
      removeAction="?/removeEquipment"
      submitLabel="Save equipment"
    >
      {#snippet fields()}
        <label class="{FIELD_LABEL} mt-2.5 mb-0">
          <span>Name</span>
          <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Main rig" autocomplete="off" maxlength="80" required />
        </label>
        <div class="grid grid-cols-2 gap-x-2.5 gap-y-0 max-[420px]:grid-cols-1">
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Canopy</span>
            <input type="text" name="canopy" class={FIELD_INPUT} placeholder="e.g. Sabre2 190" autocomplete="off" maxlength="80" />
          </label>
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Container</span>
            <input type="text" name="container" class={FIELD_INPUT} placeholder="e.g. Wings X 190" autocomplete="off" maxlength="80" />
          </label>
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>AAD</span>
            <input type="text" name="aad" class={FIELD_INPUT} placeholder="e.g. Cypres 2" autocomplete="off" maxlength="80" />
          </label>
        </div>
      {/snippet}
    </ReferenceListPanel>

    <ReferenceListPanel
      label="Aircraft"
      hint="The starred one is pre-selected whenever you start a new jump."
      items={aircraft}
      emptyText="No aircraft saved yet."
      category="aircraft"
      categoryLabel="aircraft"
      defaultId={data.settings.defaultAircraftId}
      addAction="?/addAircraft"
      removeAction="?/removeAircraft"
      submitLabel="Save aircraft"
    >
      {#snippet fields()}
        <label class="{FIELD_LABEL_NARROW} mt-2.5 mb-0">
          <span>Registration</span>
          <input type="text" name="plate" class={FIELD_INPUT} placeholder="e.g. G-SDSK" autocomplete="off" maxlength="20" required />
        </label>
      {/snippet}
    </ReferenceListPanel>

    <ReferenceListPanel
      label="Jump types"
      hint="The starred one is pre-selected whenever you start a new jump."
      items={jumpTypes}
      emptyText="No jump types saved yet."
      category="jumpType"
      categoryLabel="jump type"
      defaultId={data.settings.defaultJumpTypeId}
      addAction="?/addJumpType"
      removeAction="?/removeJumpType"
      submitLabel="Save jump type"
    >
      {#snippet fields()}
        <label class="{FIELD_LABEL} mt-2.5 mb-0">
          <span>Name</span>
          <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Sport" autocomplete="off" maxlength="40" required />
        </label>
      {/snippet}
    </ReferenceListPanel>

    <SettingsPanel baseJumps={data.settings.baseJumps} />
  </div>
</div>

<style>
  .tab-button {
    flex: 1;
    appearance: none;
    border: 1px solid var(--line);
    background: var(--panel);
    color: var(--ink-soft);
    font-family: var(--font-sans);
    font-weight: 700;
    font-size: 14px;
    padding: 10px;
    border-radius: 10px;
    cursor: pointer;
  }

  .tab-button[aria-selected='true'] {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--canvas);
  }
</style>
