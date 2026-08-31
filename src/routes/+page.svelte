<script lang="ts">
  // Full port of index.astro + AppTabs.astro + the three tabs/*.astro
  // files. One root route, one client-side tab switch (Packing / Work
  // jumps / Logbook — "Work jumps" is AppTabs' display label for what's
  // still the 'tandems' tab everywhere else) — deliberately not three
  // SvelteKit routes, to keep this a
  // faithful migration of the existing UX rather than a redesign. Packing
  // still has its own Pack/Timer sub-tabs, the same pattern one level down.
  //
  // Settings used to be split two ways — invoice details tacked onto the
  // bottom of Tandems, everything else behind a "Settings" sub-tab buried
  // inside Logbook — which made it genuinely unclear where to go to
  // change a default. It's now one place, reached the same way from
  // every tab: the cog button next to AppTabs toggles `settingsOpen`,
  // which swaps out whichever tab's content is showing for the settings
  // view below, grouped as "Config" (which tabs even show — see
  // tab-visibility.ts), "Logbook options", then "Work jumps" — the
  // latter holds both the section-visibility toggles and invoice
  // details, since both are about that one tab.
  import AppTabs from '$lib/components/AppTabs.svelte';
  import ConfigSettingsPanel from '$lib/components/ConfigSettingsPanel.svelte';
  import PackCategoryCards from '$lib/components/packing/PackCategoryCards.svelte';
  import PackHistoryPanel from '$lib/components/packing/PackHistoryPanel.svelte';
  import PackTimerView from '$lib/components/packing/PackTimerView.svelte';
  import TandemCategoryCards from '$lib/components/tandems/TandemCategoryCards.svelte';
  import TandemHistoryPanel from '$lib/components/tandems/TandemHistoryPanel.svelte';
  import InvoiceSettingsPanel from '$lib/components/tandems/InvoiceSettingsPanel.svelte';
  import WorkJumpsSettingsPanel from '$lib/components/tandems/WorkJumpsSettingsPanel.svelte';
  import LogForm from '$lib/components/LogForm.svelte';
  import ReferenceListBody from '$lib/components/ReferenceListBody.svelte';
  import RigBuilderPanel from '$lib/components/RigBuilderPanel.svelte';
  import SettingsPanel from '$lib/components/SettingsPanel.svelte';
  import SettingsRow from '$lib/components/SettingsRow.svelte';
  import BurbleSyncPanel from '$lib/components/BurbleSyncPanel.svelte';
  import PendingJumpsMenu from '$lib/components/PendingJumpsMenu.svelte';
  import BurbleSettingsPanel from '$lib/components/BurbleSettingsPanel.svelte';
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
    ICON_BUTTON,
    SETTINGS_TITLE,
    SETTINGS_GROUP_LABEL,
    SETTINGS_GROUP,
  } from '$lib/ui-classes';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  // Packing is the traditional default, but only when it's actually
  // showing — a deployment that's turned it off under Settings > Config
  // shouldn't land on a tab with no button to reach it. Deliberately a
  // one-time snapshot at mount, not a $derived — activeAppTab is
  // ordinary mutable state the tab buttons reassign directly, same as
  // every other page before Config existed; the $effect right below is
  // what keeps it honest afterward, mirroring SettingsPanel.svelte's
  // baseJumps for the same "seed once, correct separately" split.
  let activeAppTab = $state<'packing' | 'tandems' | 'logbook'>(
    data.tabVisibility.packing ? 'packing' : data.tabVisibility.tandems ? 'tandems' : 'logbook',
  );
  let packingSubTab = $state<'pack' | 'timer'>('pack');
  let settingsOpen = $state(false);

  // Catches the tab you're currently on being hidden out from under you
  // — most directly, unchecking it in Settings > Config right now, but
  // also another device/tab changing it and this one's data refreshing.
  // activeAppTab is plain $state, not derived from data, so nothing else
  // corrects it.
  $effect(() => {
    if ((activeAppTab === 'packing' || activeAppTab === 'tandems') && !data.tabVisibility[activeAppTab]) {
      activeAppTab = data.tabVisibility.packing ? 'packing' : data.tabVisibility.tandems ? 'tandems' : 'logbook';
    }
  });

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
  const jumpsLabel = (n: number) => `${n.toLocaleString('en-GB')} jump${n === 1 ? '' : 's'}`;

  // A component's headline number is its whole working life: the jumps it
  // already had when it was added (baseJumps) plus the ones logged here.
  // The split is spelled out when there's a base, so the figure can be
  // checked against a rigger's card rather than just trusted.
  const componentItems = (
    list: { id: string; name: string; baseJumps: number }[],
    field: 'canopy' | 'lineset' | 'pilotChute' | 'container',
  ) =>
    list.map((c) => {
      const logged = jumpsOn(field, c.name);
      const detail =
        c.baseJumps > 0
          ? `${jumpsLabel(c.baseJumps + logged)} (${c.baseJumps.toLocaleString('en-GB')} before + ${logged.toLocaleString('en-GB')} logged)`
          : jumpsLabel(logged);
      return { id: c.id, name: c.name, detail };
    });
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
  <PendingJumpsMenu pending={data.burblePending} />

  <div class="flex gap-2">
    <div class="flex-1">
      <AppTabs bind:activeTab={activeAppTab} visibility={data.tabVisibility} onSelect={() => (settingsOpen = false)} />
    </div>
    <button
      type="button"
      class={ICON_BUTTON}
      aria-label="Settings"
      aria-pressed={settingsOpen}
      onclick={() => (settingsOpen = !settingsOpen)}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28Z"
        />
        <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    </button>
  </div>

  <!-- Settings — reached from any tab via the cog button above -->
  <div class="{APP_VIEW} settings-scope" hidden={!settingsOpen}>
    <div class="flex items-center gap-3">
      <button type="button" class={ICON_BUTTON} aria-label="Back" onclick={() => (settingsOpen = false)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
      </button>
      <h1 class={SETTINGS_TITLE}>Settings</h1>
    </div>

    <h2 class={SETTINGS_GROUP_LABEL}>Config</h2>
    <div class={SETTINGS_GROUP}>
      <SettingsRow label="Visible tabs" iconColor="var(--gold)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <rect x="3" y="7" width="18" height="10" rx="5" />
            <circle cx="9" cy="12" r="3" fill="currentColor" stroke="none" />
          </svg>
        {/snippet}
        {#snippet children()}
          <ConfigSettingsPanel visibility={data.tabVisibility} />
        {/snippet}
      </SettingsRow>
    </div>

    <h2 class={SETTINGS_GROUP_LABEL}>Logbook options</h2>
    <div class={SETTINGS_GROUP}>
      <SettingsRow label="Starting jump count" iconColor="var(--gold)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" d="M9 4 7 20M17 4l-2 16M4 9h16M3.5 15h16" />
          </svg>
        {/snippet}
        {#snippet children()}
          <SettingsPanel baseJumps={data.logbookSettings.baseJumps} />
        {/snippet}
      </SettingsRow>

      <SettingsRow label="Dropzones" iconColor="var(--tandem)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 21s7-7.2 7-12a7 7 0 1 0-14 0c0 4.8 7 12 7 12Z" />
            <circle cx="12" cy="9" r="2.3" />
          </svg>
        {/snippet}
        {#snippet children()}
          <ReferenceListBody
            hint="The starred one is pre-selected whenever you start a new jump."
            items={places}
            emptyText="No dropzones saved yet."
            category="place"
            categoryLabel="dropzone"
            defaultId={data.logbookSettings.defaultPlaceId}
            addAction="?/addPlace"
            removeAction="?/removePlace"
            submitLabel="Save dropzone"
          >
            {#snippet fields()}
              <label class="{FIELD_LABEL} mt-2.5 mb-0">
                <span>Name</span>
                <input type="text" name="name" class={FIELD_INPUT} placeholder="e.g. Langar" autocomplete="off" maxlength="80" required />
              </label>
            {/snippet}
          </ReferenceListBody>
        {/snippet}
      </SettingsRow>

      <SettingsRow label="Rig builder" iconColor="var(--videographer)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2 2.6-2.6Z"
            />
          </svg>
        {/snippet}
        {#snippet children()}
          <RigBuilderPanel
            {canopies}
            {linesets}
            {pilotChutes}
            {containers}
            {rigs}
            defaultRigId={data.logbookSettings.defaultRigId}
          />
        {/snippet}
      </SettingsRow>

      <SettingsRow label="Aircraft" iconColor="var(--sport)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path stroke-linecap="round" stroke-linejoin="round" d="M21 3 3 10.5l7 2.5 2.5 7L21 3Z" />
          </svg>
        {/snippet}
        {#snippet children()}
          <ReferenceListBody
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
          </ReferenceListBody>
        {/snippet}
      </SettingsRow>

      <SettingsRow label="Jump types" iconColor="var(--instructor)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M11.5 3.5H5a1.5 1.5 0 0 0-1.5 1.5v6.5a1.5 1.5 0 0 0 .44 1.06l8.5 8.5a1.5 1.5 0 0 0 2.12 0l6.44-6.44a1.5 1.5 0 0 0 0-2.12l-8.5-8.5a1.5 1.5 0 0 0-1.06-.44Z"
            />
            <circle cx="8" cy="8" r="1.4" />
          </svg>
        {/snippet}
        {#snippet children()}
          <ReferenceListBody
            hint={`The starred one is pre-selected whenever you start a new jump. "Tandem Instructor" and "Tandem Camera" are added here automatically the first time you log one from the Work jumps tab.`}
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
          </ReferenceListBody>
        {/snippet}
      </SettingsRow>

      <SettingsRow label="Manifest sync" iconColor="var(--camera)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M4 12a8 8 0 0 1 14.5-4.5M20 12a8 8 0 0 1-14.5 4.5M18.5 3.5v4h-4M5.5 20.5v-4h4"
            />
          </svg>
        {/snippet}
        {#snippet children()}
          <BurbleSettingsPanel
            enabled={data.logbookSettings.burble.enabled}
            dzId={data.logbookSettings.burble.dzId}
            myNames={data.logbookSettings.burble.myNames}
            pollSeconds={data.logbookSettings.burble.pollSeconds}
            codeMap={data.logbookSettings.burble.codeMap}
            unmappedCodes={data.burbleUnmappedCodes}
          />
        {/snippet}
      </SettingsRow>
    </div>

    <h2 class={SETTINGS_GROUP_LABEL}>Work jumps</h2>
    <div class={SETTINGS_GROUP}>
      <SettingsRow label="Visible sections" iconColor="var(--tandem)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M2.25 12S5.75 5.5 12 5.5 21.75 12 21.75 12 18.25 18.5 12 18.5 2.25 12 2.25 12Z"
            />
            <circle cx="12" cy="12" r="2.8" />
          </svg>
        {/snippet}
        {#snippet children()}
          <WorkJumpsSettingsPanel visibility={data.tandemVisibility} />
        {/snippet}
      </SettingsRow>

      <SettingsRow label="Invoice details" iconColor="var(--student)">
        {#snippet icon()}
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M7 3.5h10v17l-2.5-1.6-2.5 1.6-2.5-1.6-2.5 1.6v-17ZM9 8h6M9 11.5h6M9 15h4"
            />
          </svg>
        {/snippet}
        {#snippet children()}
          <InvoiceSettingsPanel invoiceSettings={data.invoiceSettings} />
        {/snippet}
      </SettingsRow>
    </div>
  </div>

  <!-- Packing -->
  <div class={APP_VIEW} hidden={activeAppTab !== 'packing' || settingsOpen}>
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
  <div class={APP_VIEW} hidden={activeAppTab !== 'tandems' || settingsOpen}>
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

    <TandemCategoryCards tandemState={data.tandemState} visibility={data.tandemVisibility} />

    <TandemHistoryPanel dayRows={data.tandemDayRows} weekRows={data.tandemWeekRows} monthRows={data.tandemMonthRows} />

    <footer class={FOOT}>
      <DownloadButton href="/api/tandem-export.csv" filename="tandem-log.csv" label="Download full tandem log (.csv)" />
    </footer>
  </div>

  <!-- Logbook -->
  <div class={APP_VIEW} hidden={activeAppTab !== 'logbook' || settingsOpen}>
    <BurbleSyncPanel
      enabled={data.logbookSettings.burble.enabled}
      autoPoll={data.logbookSettings.burble.autoPoll}
      pollSeconds={data.logbookSettings.burble.pollSeconds}
      pendingCount={data.burblePending.length}
      unmappedCodes={data.burbleUnmappedCodes}
      lastSyncAt={data.burbleLastSyncAt}
    />

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
