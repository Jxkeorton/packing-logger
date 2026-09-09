// The whole app's data + mutations, composed from three per-tab action
// groups (lib/server/actions/{packing,tandem,logbook}.ts) rather than
// one huge file. `load` mirrors the main app's src/pages/index.astro
// frontmatter almost line for line — same shape of "load everything for
// all three tabs up front" this app has always done, kept that way here
// for a fair migration rather than folded into per-tab routes (a real
// improvement worth doing separately, once this is proven out).
import type { Actions, PageServerLoad } from './$types';
import { toHistoryRow, todayKey, totalPacks, type DayState } from '$lib/packing';
import { loadTodayStateForRender, readHistory } from '$lib/server/packing';
import { groupByInvoiceMonth, groupByWeek } from '$lib/server/invoice';
import { loadTodayStateAndHistory as loadTandemStateAndHistory } from '$lib/server/tandem';
import { toHistoryRow as toTandemHistoryRow } from '$lib/tandem';
import { groupByInvoiceMonth as groupTandemByInvoiceMonth, groupByWeek as groupTandemByWeek } from '$lib/server/tandem-invoice';
import { readInvoiceSettings } from '$lib/server/invoice-settings';
import { readTandemVisibility } from '$lib/server/tandem-visibility';
import { readTabVisibility } from '$lib/server/tab-visibility';
import { readRateSettings } from '$lib/server/rate-settings';
import { readLogbookAndNextNumber } from '$lib/server/logbook';
import { readLogbookSettings } from '$lib/server/logbook-settings';
import { pendingForClient, readSyncState } from '$lib/server/burble/sync';
import { readFastestFive } from '$lib/server/times';
import { authEnabled } from '$lib/server/auth';
import { packingActions } from '$lib/server/actions/packing';
import { tandemActions } from '$lib/server/actions/tandem';
import { logbookActions } from '$lib/server/actions/logbook';
import { configActions } from '$lib/server/actions/config';
import { ratesActions } from '$lib/server/actions/rates';

export const load: PageServerLoad = async () => {
  // One parallel wave rather than ~10 serial R2 round-trips: every read
  // below is independent, and doing them one after another both slowed
  // the render and multiplied the odds that a single transient R2 blip
  // (each `readText` throws on a non-404 error, by design) took the whole
  // page down as a 500. Only the logbook's jump numbers depend on
  // another read (logbookSettings.baseJumps), so that stays a second step.
  const [
    { state, unflushed },
    topTimes,
    rateSettings,
    packingHistory,
    tandemBundle,
    invoiceSettings,
    tandemVisibility,
    tabVisibility,
    logbookSettings,
    burbleState,
  ] = await Promise.all([
    loadTodayStateForRender(),
    readFastestFive(),
    readRateSettings(),
    readHistory(400),
    loadTandemStateAndHistory(400),
    readInvoiceSettings(),
    readTandemVisibility(),
    readTabVisibility(),
    readLogbookSettings(),
    readSyncState(),
  ]);

  const { entries: logbookEntries, nextNumber: nextLogbookNumber } = await readLogbookAndNextNumber(
    logbookSettings.baseJumps,
  );

  // A wider window of history feeds the week/month rollups; the
  // day-by-day table only shows the most recent slice of it. A day
  // nothing was packed on is noise, not history — day rollover writes a
  // zero row for whatever day the app is next opened on regardless of
  // whether anything actually happened, so these do turn up for real,
  // not just in theory. Filtered here rather than in PackHistoryPanel
  // so it never has to think about it.
  const csvHistory = packingHistory.filter((r) => r.totalPacks > 0);
  // If a day rollover couldn't be persisted this render (see
  // loadTodayStateForRender), that day's counts aren't in the CSV yet —
  // fold it back in here, newest-first, so History doesn't briefly drop
  // yesterday until the next write flushes it for real.
  const unflushedRow =
    unflushed && totalPacks(unflushed.counts) > 0 ? toHistoryRow(unflushed, rateSettings.packing) : null;
  const fullHistory =
    unflushedRow && !csvHistory.some((r) => r.date === unflushedRow.date)
      ? [unflushedRow, ...csvHistory]
      : csvHistory;
  const dayRows = fullHistory.slice(0, 14);

  // Today isn't in the CSV-backed history yet (it's still being logged),
  // but it belongs in this week's and this invoice month's running
  // totals. Same zero filter as above, except for the current
  // (isCurrent) bucket — that one stays visible even at 0 so far, as a
  // live "nothing yet this week" indicator rather than a historical
  // record of an empty one; the day table has no equivalent "still
  // filling" row to protect, since today's own entry is never in
  // fullHistory to begin with (readHistory excludes it outright).
  const combined = [...fullHistory, toHistoryRow(state, rateSettings.packing)];
  const weekRows = groupByWeek(combined, rateSettings.packing)
    .filter((r) => r.isCurrent || r.totalPacks > 0)
    .slice(0, 12);
  const monthRows = groupByInvoiceMonth(combined, rateSettings.packing)
    .filter((r) => r.isCurrent || r.totalPacks > 0)
    .slice(0, 12);

  // Same shape again, for the separate tandem-jump log — one read of
  // tandem-jumps.csv for both state and history, not two. A day/week/
  // month with zero jumps can't actually occur here the way it can for
  // packing (tandem-jumps.csv only ever gets a row when a jump is
  // logged, no day-rollover phantom entry) — the filter's just here for
  // symmetry with packing and as a no-cost guard if that ever changes.
  const { state: tandemState, history: tandemFullHistory } = tandemBundle;
  const tandemNonEmptyHistory = tandemFullHistory.filter((r) => r.totalJumps > 0);
  const tandemDayRows = tandemNonEmptyHistory.slice(0, 14);
  const tandemCombined = [...tandemNonEmptyHistory, toTandemHistoryRow(tandemState, rateSettings.tandem)];
  const tandemWeekRows = groupTandemByWeek(tandemCombined, rateSettings.tandem)
    .filter((r) => r.isCurrent || r.totalJumps > 0)
    .slice(0, 12);
  const tandemMonthRows = groupTandemByInvoiceMonth(tandemCombined, rateSettings.tandem)
    .filter((r) => r.isCurrent || r.totalJumps > 0)
    .slice(0, 12);

  // Manifest sync state (burbleState, read above) is *read* on a page
  // load, never polled — a page load must not reach out to Burble.
  // Checking the board is an explicit action. Each pending jump carries
  // its own "how sure are we it flew" line, so the confirmation list can
  // be rendered without re-deriving it client-side. /api/burble-pending
  // returns this same shape for the open app to re-poll cheaply.
  const burblePending = pendingForClient(burbleState);

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
    rateSettings,
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
  ...ratesActions,
};
