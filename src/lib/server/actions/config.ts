// Config tab actions — unlike packing/tandem/logbook, this isn't
// scoped to one tab of the app; it's the settings that decide which
// tabs even show (see tab-visibility.ts), so it gets its own small
// actions file rather than being tacked onto one of the three others.
import { fail, type Action } from '@sveltejs/kit';
import { setTabVisibility, type AppTab } from '$lib/server/tab-visibility';

const VALID_TABS: AppTab[] = ['packing', 'tandems'];

export const configActions: Record<string, Action> = {
  // A checkbox per tab on the Settings > Config row — auto-submitted on
  // change (see ConfigSettingsPanel.svelte), one request per toggle
  // rather than a whole-form Save button.
  saveTabVisibility: async ({ request }) => {
    const formData = await request.formData();
    const tab = String(formData.get('tab') ?? '');
    if (!VALID_TABS.includes(tab as AppTab)) return fail(400, { error: 'Unknown tab' });

    const visible = formData.get('visible') === 'on';
    await setTabVisibility(tab as AppTab, visible);
  },
};
