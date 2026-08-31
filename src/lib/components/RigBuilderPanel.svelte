<script lang="ts">
  // Canopy/Lineset/Pilot Chute/Container/Rig used to be five separate
  // top-level toggles in Logbook settings — each one collapsed by
  // default, so building a rig meant opening and closing four small
  // lists in turn before finally reaching the form that used them. This
  // groups all five under one "Rig builder" row instead, in the order
  // you'd actually work through them: add the parts you have, then
  // combine them into a rig.
  //
  // The row chrome (icon, label, chevron, expand/collapse) lives in
  // SettingsRow.svelte, which wraps this in +page.svelte — this
  // component only ever renders its own content.
  import { PANEL_HINT, FIELD_LABEL, FIELD_LABEL_NARROW, FIELD_INPUT, FIELD_SELECT } from '$lib/ui-classes';
  import ReferenceListBody from './ReferenceListBody.svelte';

  interface Item {
    id: string;
    name: string;
    detail?: string;
  }

  let {
    canopies,
    linesets,
    pilotChutes,
    containers,
    rigs,
    defaultRigId,
  }: {
    canopies: Item[];
    linesets: Item[];
    pilotChutes: Item[];
    containers: Item[];
    rigs: Item[];
    defaultRigId: string | null;
  } = $props();

  const hasAnyComponent = $derived(
    canopies.length > 0 || linesets.length > 0 || pilotChutes.length > 0 || containers.length > 0,
  );
</script>

<div class="flex flex-col gap-4">
  <p class={PANEL_HINT}>
        Add the parts you have below, then build a rig by combining one of
        each — that's what you pick when logging a jump. Each part's jump
        count is how many logged jumps used a rig built with it. If you
        swap a part later, build a new rig instead of editing this one,
        so the parts you're keeping carry on counting and the retired one
        keeps its history.
      </p>

      <div class="step">
        <h3 class="step-heading">Canopies</h3>
        <ReferenceListBody
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
            <label class="{FIELD_LABEL_NARROW} mt-2.5 mb-0">
              <span>Jumps before adding</span>
              <input type="number" inputmode="numeric" name="baseJumps" class="{FIELD_INPUT} min-w-0" placeholder="0" min="0" step="1" />
            </label>
          {/snippet}
        </ReferenceListBody>
      </div>

      <div class="step">
        <h3 class="step-heading">Linesets</h3>
        <ReferenceListBody
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
            <label class="{FIELD_LABEL_NARROW} mt-2.5 mb-0">
              <span>Jumps before adding</span>
              <input type="number" inputmode="numeric" name="baseJumps" class="{FIELD_INPUT} min-w-0" placeholder="0" min="0" step="1" />
            </label>
          {/snippet}
        </ReferenceListBody>
      </div>

      <div class="step">
        <h3 class="step-heading">Pilot chutes</h3>
        <ReferenceListBody
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
            <label class="{FIELD_LABEL_NARROW} mt-2.5 mb-0">
              <span>Jumps before adding</span>
              <input type="number" inputmode="numeric" name="baseJumps" class="{FIELD_INPUT} min-w-0" placeholder="0" min="0" step="1" />
            </label>
          {/snippet}
        </ReferenceListBody>
      </div>

      <div class="step">
        <h3 class="step-heading">Containers</h3>
        <ReferenceListBody
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
            <label class="{FIELD_LABEL_NARROW} mt-2.5 mb-0">
              <span>Jumps before adding</span>
              <input type="number" inputmode="numeric" name="baseJumps" class="{FIELD_INPUT} min-w-0" placeholder="0" min="0" step="1" />
            </label>
          {/snippet}
        </ReferenceListBody>
      </div>

      <div class="step step-build">
        <h3 class="step-heading">Build a rig</h3>
        {#if !hasAnyComponent}
          <p class="step-note">Add at least one part above first — a rig needs something to build it from.</p>
        {/if}
        <ReferenceListBody
          items={rigs}
          emptyText="No rigs built yet."
          category="rig"
          categoryLabel="rig"
          defaultId={defaultRigId}
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
                  {#each canopies as c (c.id)}
                    <option value={c.id}>{c.name}</option>
                  {/each}
                </select>
              </label>
              <label class="{FIELD_LABEL} mt-2.5 mb-0">
                <span>Lineset</span>
                <select name="linesetId" class={FIELD_SELECT}>
                  <option value="">No lineset selected</option>
                  {#each linesets as l (l.id)}
                    <option value={l.id}>{l.name}</option>
                  {/each}
                </select>
              </label>
              <label class="{FIELD_LABEL} mt-2.5 mb-0">
                <span>Pilot chute</span>
                <select name="pilotChuteId" class={FIELD_SELECT}>
                  <option value="">No pilot chute selected</option>
                  {#each pilotChutes as pc (pc.id)}
                    <option value={pc.id}>{pc.name}</option>
                  {/each}
                </select>
              </label>
              <label class="{FIELD_LABEL} mt-2.5 mb-0">
                <span>Container</span>
                <select name="containerId" class={FIELD_SELECT}>
                  <option value="">No container selected</option>
                  {#each containers as ctn (ctn.id)}
                    <option value={ctn.id}>{ctn.name}</option>
                  {/each}
                </select>
              </label>
            </div>
          {/snippet}
        </ReferenceListBody>
      </div>
</div>

<style>
  .step {
    padding-top: 14px;
    border-top: 1px solid var(--line);
  }

  .step:first-of-type {
    padding-top: 0;
    border-top: none;
  }

  .step-heading {
    margin: 0 0 4px;
    font-family: var(--font-display);
    font-size: 13px;
    font-weight: 700;
    letter-spacing: -0.01em;
  }

  /* The build-a-rig step is the payoff of the four above it — a
     stronger rule sets it apart as "now assemble what you just added",
     not just a fifth item in the same list. */
  .step-build {
    margin-top: 4px;
    padding-top: 16px;
    border-top: 2px solid var(--line-strong);
  }

  .step-note {
    margin: 0 0 10px;
    font-size: 12.5px;
    color: var(--ink-soft);
    font-style: italic;
  }
</style>
