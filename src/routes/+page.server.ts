// The whole app's data + mutations, composed from three per-tab action
// groups (lib/server/actions/{packing,tandem,logbook}.ts) rather than
// one huge file. `load` mirrors the main app's src/pages/index.astro
// frontmatter almost line for line — same shape of "load everything for
// all three tabs up front" this app has always done, kept that way here
// for a fair migration rather than folded into per-tab routes (a real
// improvement worth doing separately, once this is proven out).
import type { Actions, PageServerLoad } from './$types';
import { toHistoryRow, todayKey, type DayState } from '$lib/packing';
import { loadTodayState, readHistory } from '$lib/server/packing';
import { groupByInvoiceMonth, groupByWeek } from '$lib/server/invoice';
import {
  loadTodayState as loadTodayTandemState,
  readHistory as readTandemHistory,
} from '$lib/server/tandem';
import { toHistoryRow as toTandemHistoryRow } from '$lib/tandem';
import { groupByInvoiceMonth as groupTandemByInvoiceMonth, groupByWeek as groupTandemByWeek } from '$lib/server/tandem-invoice';
import { readInvoiceSettings } from '$lib/server/invoice-settings';
import { readTandemVisibility } from '$lib/server/tandem-visibility';
import { readTabVisibility } from '$lib/server/tab-visibility';
import { readLogbook, nextJumpNumber } from '$lib/server/logbook';
import { readLogbookSettings } from '$lib/server/logbook-settings';
import { flightHint, pendingJumps, readSyncState } from '$lib/server/burble/sync';
import { readFastestFive } from '$lib/server/times';
import { authEnabled } from '$lib/server/auth';
import { packingActions } from '$lib/server/actions/packing';
import { tandemActions } from '$lib/server/actions/tandem';
import { logbookActions } from '$lib/server/actions/logbook';
import { configActions } from '$lib/server/actions/config';

export const load: PageServerLoad = async () => {
  const state = await loadTodayState();
  const topTimes = await readFastestFive();

  // A wider window of history feeds the week/month rollups; the
  // day-by-day table only shows the most recent slice of it.
  const fullHistory = await readHistory(400);
  const dayRows = fullHistory.slice(0, 14);

  // Today isn't in the CSV-backed history yet (it's still being logged),
  // but it belongs in this week's and this invoice month's running totals.
  const combined = [...fullHistory, toHistoryRow(state)];
  const weekRows = groupByWeek(combined).slice(0, 12);
  const monthRows = groupByInvoiceMonth(combined).slice(0, 12);

  // Same shape again, for the separate tandem-jump log.
  const tandemState = await loadTodayTandemState();
  const tandemFullHistory = await readTandemHistory(400);
  const tandemDayRows = tandemFullHistory.slice(0, 14);
  const tandemCombined = [...tandemFullHistory, toTandemHistoryRow(tandemState)];
  const tandemWeekRows = groupTandemByWeek(tandemCombined).slice(0, 12);
  const tandemMonthRows = groupTandemByInvoiceMonth(tandemCombined).slice(0, 12);

  const invoiceSettings = await readInvoiceSettings();
  const tandemVisibility = await readTandemVisibility();
  const tabVisibility = await readTabVisibility();

  // The personal jump logbook — a separate ledger again, numbered from a
  // configurable starting offset rather than a running daily count.
  const logbookSettings = await readLogbookSettings();
  const logbookEntries = await readLogbook(logbookSettings.baseJumps);
  const nextLogbookNumber = await nextJumpNumber(logbookSettings.baseJumps);

  // Manifest sync state is *read* here, never polled — a page load must
  // not reach out to Burble. Checking the board is an explicit action.
  const burbleState = await readSyncState();
  // Each pending jump carries its own "how sure are we it flew" line, so
  // the confirmation list can be rendered without re-deriving it client-side.
  const burblePending = pendingJumps(burbleState).map((jump) => ({ ...jump, hint: flightHint(jump) }));

  const today = todayKey();
  const dateDisplay = new Date(`${today}T00:00:00`).toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return {
    state: state as DayState,
    dateDisplay,
    today,
    topTimes,
    dayRows,
    weekRows,
    monthRows,
    tandemState,
    tandemDayRows,
    tandemWeekRows,
    tandemMonthRows,
    invoiceSettings,
    tandemVisibility,
    tabVisibility,
    logbookEntries,
    nextLogbookNumber,
    logbookSettings,
    burblePending,
    burbleUnmappedCodes: burbleState.unmappedCodes,
    burbleLastSyncAt: burbleState.lastSyncAt,
    showLogout: authEnabled(),
  };
};

export const actions: Actions = {
  ...packingActions,
  ...tandemActions,
  ...logbookActions,
  ...configActions,
};
