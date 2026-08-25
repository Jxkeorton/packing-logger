<script lang="ts">
  // Full port of index.astro + AppTabs.astro + the three tabs/*.astro
  // files. One root route, one client-side tab switch (Packing / Tandems
  // / Logbook) — deliberately not three SvelteKit routes, to keep this a
  // faithful migration of the existing UX rather than a redesign. Each
  // tab's own sub-tabs (Pack/Timer, Log/Settings) are the same pattern,
  // one level down.
  import AppTabs from '$lib/components/AppTabs.svelte';
  import PackCategoryCards from '$lib/components/packing/PackCategoryCards.svelte';
  import PackHistoryPanel from '$lib/components/packing/PackHistoryPanel.svelte';
  import PackTimerView from '$lib/components/packing/PackTimerView.svelte';
  import TandemCategoryCards from '$lib/components/tandems/TandemCategoryCards.svelte';
  import TandemHistoryPanel from '$lib/components/tandems/TandemHistoryPanel.svelte';
  import InvoiceSettingsPanel from '$lib/components/tandems/InvoiceSettingsPanel.svelte';
  import LogForm from '$lib/components/LogForm.svelte';
  import ReferenceListPanel from '$lib/components/ReferenceListPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import DownloadButton from '$lib/components/DownloadButton.svelte';
  import { totalEarnings as packingTotalEarnings, totalPacks } from '$lib/packing';
  import { totalEarnings as tandemTotalEarnings, totalJumps } from '$lib/tandem';
  import {
    APP_VIEW,
    MASTHEAD,
    STAMP,
    STAMP_LABEL,
    STAMP_DATE,
    TOTALS,
    TOTALS_BLOCK,
    TOTALS_BLOCK_FLEX,
    TOTALS_VALUE_GOLD,
    TOTALS_VALUE_INK,
    TOTALS_LABEL,
    TOTALS_DIVIDER,
    FOOT,
    FIELD_LABEL,
    FIELD_LABEL_NARROW,
    FIELD_INPUT,
    FIELD_SELECT,
  } from '$lib/ui-classes';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let activeAppTab = $state<'packing' | 'tandems' | 'logbook'>('packing');
  let packingSubTab = $state<'pack' | 'timer'>('pack');
  let logbookSubTab = $state<'log' | 'settings'>('log');

  const subTabClass =
    'flex-1 appearance-none border border-line bg-panel text-ink-soft font-sans font-bold text-sm p-2.5 rounded-[10px] cursor-pointer aria-selected:bg-ink aria-selected:border-ink aria-selected:text-canvas';

  const money = (n: number) => `£${n.toFixed(2)}`;

  // ReferenceListPanel wants each list pre-shaped to a generic
  // {id, name, detail?} row, same as the real app's ReferenceListPanel.astro.
  // $derived (not computed once) so these stay current after any action
  // re-runs `load` — no separate "refresh" step anywhere.
  const places = $derived(data.logbookSettings.places.map((p) => ({ id: p.id, name: p.name })));
  const aircraft = $derived(data.logbookSettings.aircraft.map((ac) => ({ id: ac.id, name: ac.plate })));
  const jumpTypes = $derived(data.logbookSettings.jumpTypes.map((jt) => ({ id: jt.id, name: jt.name })));

  // A component's lifetime jump count is just how many logged entries
  // mention its name against this part — entries store the name a rig's
  // component resolved to at the time (see logbook-settings.ts's Rig),
  // not a live reference, so this stays correct even if that component's
  // rig is later retired.
  function jumpsOn(field: 'canopy' | 'lineset' | 'pilotChute' | 'container' | 'rig', name: string): number {
    return data.logbookEntries.filter((e) => e[field] === name).length;
  }
  const jumpsLabel = (n: number) => `${n} jump${n === 1 ? '' : 's'}`;

  const componentItems = (list: { id: string; name: string }[], field: 'canopy' | 'lineset' | 'pilotChute' | 'container') =>
    list.map((c) => ({ id: c.id, name: c.name, detail: jumpsLabel(jumpsOn(field, c.name)) }));
  const canopies = $derived(componentItems(data.logbookSettings.canopies, 'canopy'));
  const linesets = $derived(componentItems(data.logbookSettings.linesets, 'lineset'));
  const pilotChutes = $derived(componentItems(data.logbookSettings.pilotChutes, 'pilotChute'));
  const containers = $derived(componentItems(data.logbookSettings.containers, 'container'));

  const componentName = (list: { id: string; name: string }[], id: string | null) =>
    list.find((c) => c.id === id)?.name ?? '';
  const rigs = $derived(
    data.logbookSettings.rigs.map((rig) => {
      const parts = [
        componentName(data.logbookSettings.canopies, rig.canopyId),
        componentName(data.logbookSettings.linesets, rig.linesetId),
        componentName(data.logbookSettings.pilotChutes, rig.pilotChuteId),
        componentName(data.logbookSettings.containers, rig.containerId),
      ].filter(Boolean);
      const composition = parts.length > 0 ? parts.join(' · ') : 'No components selected';
      return { id: rig.id, name: rig.name, detail: `${composition} — ${jumpsLabel(jumpsOn('rig', rig.name))}` };
    }),
  );
</script>

<div
  class="max-w-140 mx-auto px-4 pt-5 [padding-bottom:calc(40px+env(safe-area-inset-bottom))] flex flex-col gap-5.5"
>
  <AppTabs bind:activeTab={activeAppTab} />

  <!-- Packing -->
  <div class={APP_VIEW} hidden={activeAppTab !== 'packing'}>
    <div class="flex gap-2 mb-0.5" role="tablist" aria-label="Packing view">
      <button
        type="button"
        class={subTabClass}
        role="tab"
        aria-selected={packingSubTab === 'pack'}
        onclick={() => (packingSubTab = 'pack')}
      >
        Pack
      </button>
      <button
        type="button"
        class={subTabClass}
        role="tab"
        aria-selected={packingSubTab === 'timer'}
        onclick={() => (packingSubTab = 'timer')}
      >
        Timer
      </button>
    </div>

    <div class={APP_VIEW} hidden={packingSubTab !== 'pack'}>
      <header class={MASTHEAD}>
        <div class={STAMP} aria-hidden="false">
          <span class={STAMP_LABEL}>Manifest</span>
          <span class={STAMP_DATE}>{data.dateDisplay}</span>
        </div>
        <div class={TOTALS}>
          <div class={TOTALS_BLOCK}>
            <span class={TOTALS_VALUE_GOLD}>{money(packingTotalEarnings(data.state.counts))}</span>
            <span class={TOTALS_LABEL}>earned today</span>
          </div>
          <div class={TOTALS_DIVIDER} aria-hidden="true"></div>
          <div class={TOTALS_BLOCK_FLEX}>
            <span class={TOTALS_VALUE_INK}>{totalPacks(data.state.counts)}</span>
            <span class={TOTALS_LABEL}>packs today</span>
          </div>
        </div>
      </header>

      <PackCategoryCards counts={data.state.counts} />

      <PackHistoryPanel dayRows={data.dayRows} weekRows={data.weekRows} monthRows={data.monthRows} />

      <footer class={FOOT}>
        <DownloadButton href="/api/export.csv" filename="packing-log.csv" label="Download full log (.csv)" />
      </footer>
    </div>

    <div class={APP_VIEW} hidden={packingSubTab !== 'timer'}>
      <PackTimerView topTimes={data.topTimes} />
    </div>
  </div>

  <!-- Tandems -->
  <div class={APP_VIEW} hidden={activeAppTab !== 'tandems'}>
    <header class={MASTHEAD}>
      <div class={STAMP} aria-hidden="false">
        <span class={STAMP_LABEL}>Tandem Log</span>
        <span class={STAMP_DATE}>{data.dateDisplay}</span>
      </div>
      <div class={TOTALS}>
        <div class={TOTALS_BLOCK}>
          <span class={TOTALS_VALUE_GOLD}>{money(tandemTotalEarnings(data.tandemState.counts))}</span>
          <span class={TOTALS_LABEL}>earned today</span>
        </div>
        <div class={TOTALS_DIVIDER} aria-hidden="true"></div>
        <div class={TOTALS_BLOCK_FLEX}>
          <span class={TOTALS_VALUE_INK}>{totalJumps(data.tandemState.counts)}</span>
          <span class={TOTALS_LABEL}>jumps today</span>
        </div>
      </div>
    </header>

    <TandemCategoryCards tandemState={data.tandemState} />

    <TandemHistoryPanel dayRows={data.tandemDayRows} weekRows={data.tandemWeekRows} monthRows={data.tandemMonthRows} />

    <InvoiceSettingsPanel invoiceSettings={data.invoiceSettings} />

    <footer class={FOOT}>
      <DownloadButton href="/api/tandem-export.csv" filename="tandem-log.csv" label="Download full tandem log (.csv)" />
    </footer>
  </div>

  <!-- Logbook -->
  <div class={APP_VIEW} hidden={activeAppTab !== 'logbook'}>
    <div class="flex gap-2 mb-0.5" role="tablist" aria-label="Logbook view">
      <button
        type="button"
        class={subTabClass}
        role="tab"
        aria-selected={logbookSubTab === 'log'}
        onclick={() => (logbookSubTab = 'log')}
      >
        Log
      </button>
      <button
        type="button"
        class={subTabClass}
        role="tab"
        aria-selected={logbookSubTab === 'settings'}
        onclick={() => (logbookSubTab = 'settings')}
      >
        Settings
      </button>
    </div>

    <div class={APP_VIEW} hidden={logbookSubTab !== 'log'}>
      <LogForm
        entries={data.logbookEntries}
        nextNumber={data.nextLogbookNumber}
        settings={data.logbookSettings}
        today={data.today}
        dateDisplay={data.dateDisplay}
      />

      <footer class={FOOT}>
        <DownloadButton href="/api/logbook-export.csv" filename="logbook.csv" label="Download full logbook (.csv)" />
      </footer>
    </div>

    <div class={APP_VIEW} hidden={logbookSubTab !== 'settings'}>
      <ReferenceListPanel
        label="Places"
        hint="The starred one is pre-selected whenever you start a new jump."
        items={places}
        emptyText="No places saved yet."
        category="place"
        categoryLabel="place"
        defaultId={data.logbookSettings.defaultPlaceId}
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
        label="Canopies"
        hint="Each canopy's jump count is how many logged jumps used a rig built with it."
        items={canopies}
        emptyText="No canopies saved yet."
        allowDefault={false}
        addAction="?/addCanopy"
        removeAction="?/removeCanopy"
        submitLabel="Save canopy"
      >
        {#snippet fields()}
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Name</span>
            <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Sabre2 190" autocomplete="off" maxlength="80" required />
          </label>
        {/snippet}
      </ReferenceListPanel>

      <ReferenceListPanel
        label="Linesets"
        hint="Each lineset's jump count is how many logged jumps used a rig built with it."
        items={linesets}
        emptyText="No linesets saved yet."
        allowDefault={false}
        addAction="?/addLineset"
        removeAction="?/removeLineset"
        submitLabel="Save lineset"
      >
        {#snippet fields()}
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Name</span>
            <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Dacron, fitted Jan 2026" autocomplete="off" maxlength="80" required />
          </label>
        {/snippet}
      </ReferenceListPanel>

      <ReferenceListPanel
        label="Pilot chutes"
        hint="Each pilot chute's jump count is how many logged jumps used a rig built with it."
        items={pilotChutes}
        emptyText="No pilot chutes saved yet."
        allowDefault={false}
        addAction="?/addPilotChute"
        removeAction="?/removePilotChute"
        submitLabel="Save pilot chute"
      >
        {#snippet fields()}
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Name</span>
            <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. PD reserve pilot chute" autocomplete="off" maxlength="80" required />
          </label>
        {/snippet}
      </ReferenceListPanel>

      <ReferenceListPanel
        label="Containers"
        hint="Each container's jump count is how many logged jumps used a rig built with it."
        items={containers}
        emptyText="No containers saved yet."
        allowDefault={false}
        addAction="?/addContainer"
        removeAction="?/removeContainer"
        submitLabel="Save container"
      >
        {#snippet fields()}
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Name</span>
            <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Wings X 190" autocomplete="off" maxlength="80" required />
          </label>
        {/snippet}
      </ReferenceListPanel>

      <ReferenceListPanel
        label="Rigs"
        hint={`Build a rig from the components above. The starred one is pre-selected whenever you start a new jump. If you swap a part later, build a new rig instead of editing this one — that keeps each component's jump count accurate.`}
        items={rigs}
        emptyText="No rigs built yet."
        category="rig"
        categoryLabel="rig"
        defaultId={data.logbookSettings.defaultRigId}
        addAction="?/addRig"
        removeAction="?/removeRig"
        submitLabel="Build rig"
      >
        {#snippet fields()}
          <label class="{FIELD_LABEL} mt-2.5 mb-0">
            <span>Name</span>
            <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Main rig" autocomplete="off" maxlength="80" required />
          </label>
          <div class="grid grid-cols-2 gap-x-2.5 gap-y-0 max-[420px]:grid-cols-1">
            <label class="{FIELD_LABEL} mt-2.5 mb-0">
              <span>Canopy</span>
              <select name="canopyId" class={FIELD_SELECT}>
                <option value="">No canopy selected</option>
                {#each data.logbookSettings.canopies as c (c.id)}
                  <option value={c.id}>{c.name}</option>
                {/each}
              </select>
            </label>
            <label class="{FIELD_LABEL} mt-2.5 mb-0">
              <span>Lineset</span>
              <select name="linesetId" class={FIELD_SELECT}>
                <option value="">No lineset selected</option>
                {#each data.logbookSettings.linesets as l (l.id)}
                  <option value={l.id}>{l.name}</option>
                {/each}
              </select>
            </label>
            <label class="{FIELD_LABEL} mt-2.5 mb-0">
              <span>Pilot chute</span>
              <select name="pilotChuteId" class={FIELD_SELECT}>
                <option value="">No pilot chute selected</option>
                {#each data.logbookSettings.pilotChutes as pc (pc.id)}
                  <option value={pc.id}>{pc.name}</option>
                {/each}
              </select>
            </label>
            <label class="{FIELD_LABEL} mt-2.5 mb-0">
              <span>Container</span>
              <select name="containerId" class={FIELD_SELECT}>
                <option value="">No container selected</option>
                {#each data.logbookSettings.containers as ctn (ctn.id)}
                  <option value={ctn.id}>{ctn.name}</option>
                {/each}
              </select>
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
        defaultId={data.logbookSettings.defaultAircraftId}
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
        hint={`The starred one is pre-selected whenever you start a new jump. "Tandem Instructor" and "Tandem Camera" are added here automatically the first time you log one from the Tandems tab.`}
        items={jumpTypes}
        emptyText="No jump types saved yet."
        category="jumpType"
        categoryLabel="jump type"
        defaultId={data.logbookSettings.defaultJumpTypeId}
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

      <SettingsPanel baseJumps={data.logbookSettings.baseJumps} />
    </div>
  </div>

  {#if data.showLogout}
    <footer class="text-center">
      <form class="mt-2.5" method="POST" action="/api/logout">
        <button
          type="submit"
          class="appearance-none border-0 bg-transparent text-ink-soft font-[inherit] text-[12.5px] cursor-pointer p-0 hover:text-danger"
        >
          Log out
        </button>
      </form>
    </footer>
  {/if}
</div>
