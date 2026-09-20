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
import { toHistoryRow as toTandemHistoryRow, zeroCounts as zeroTandemCounts } from '$lib/tandem';
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
import { totalGroundSchoolEarnings } from '$lib/ground-school';
import {
  loadTodayEntries as loadGroundSchoolToday,
  readHistory as readGroundSchoolHistory,
} from '$lib/server/ground-school';
import { formatDateKey, invoiceMonthOf, mondayOf, parseDateKey } from '$lib/server/periods';
import { packingActions } from '$lib/server/actions/packing';
import { tandemActions } from '$lib/server/actions/tandem';
import { logbookActions } from '$lib/server/actions/logbook';
import { configActions } from '$lib/server/actions/config';
import { ratesActions } from '$lib/server/actions/rates';
import { groundSchoolActions } from '$lib/server/actions/ground-school';

/** Same week-bucket key groupTandemByWeek uses internally (history-buckets.ts), so a ground school session lands in the same row as any jump earned the same week. */
function weekKeyFor(date: string): string {
  return formatDateKey(mondayOf(parseDateKey(date)));
}

/** Same invoice-month bucket key groupTandemByInvoiceMonth uses internally, so a ground school session lands in the same row as any jump earned the same invoice period. */
function monthKeyFor(date: string): string {
  const { year, month } = invoiceMonthOf(parseDateKey(date));
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

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
    groundSchoolEntries,
    groundSchoolHistory,
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
    loadGroundSchoolToday(),
    readGroundSchoolHistory(),
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
  const { state: tandemState, history: tandemFullHistory, dayJumps: tandemDayJumpsFull } = tandemBundle;

  // Ground school doesn't fit the tandem Jump model (see $lib/ground-school.ts's
  // doc comment) so it lives in its own ledger — but its earnings still
  // belong in the work-jumps History tab, folded into whichever day/week/
  // month they were earned in, the same way a handy-cam bonus rides along
  // with its jump. Without this, a day that was *only* ground school (no
  // instructor/videographer/AFF jump alongside it) would never appear in
  // History at all: tandemFullHistory only ever gets a row when a jump is
  // logged.
  const today = todayKey();
  const groundSchoolByDay = new Map<string, typeof groundSchoolHistory>();
  const groundSchoolEarningsByDay = new Map<string, number>();
  const groundSchoolEarningsByWeek = new Map<string, number>();
  const groundSchoolEarningsByMonth = new Map<string, number>();
  for (const entry of groundSchoolHistory) {
    groundSchoolByDay.set(entry.date, [...(groundSchoolByDay.get(entry.date) ?? []), entry]);
    groundSchoolEarningsByDay.set(entry.date, (groundSchoolEarningsByDay.get(entry.date) ?? 0) + entry.amount);
    const weekKey = weekKeyFor(entry.date);
    groundSchoolEarningsByWeek.set(weekKey, (groundSchoolEarningsByWeek.get(weekKey) ?? 0) + entry.amount);
    const monthKey = monthKeyFor(entry.date);
    groundSchoolEarningsByMonth.set(monthKey, (groundSchoolEarningsByMonth.get(monthKey) ?? 0) + entry.amount);
  }
  // Today's own sessions (loaded separately, same split as the jump ledger's
  // own today/history divide) still belong in the current week/month total.
  const todayGroundSchoolTotal = totalGroundSchoolEarnings(groundSchoolEntries);
  if (todayGroundSchoolTotal > 0) {
    const weekKey = weekKeyFor(today);
    groundSchoolEarningsByWeek.set(weekKey, (groundSchoolEarningsByWeek.get(weekKey) ?? 0) + todayGroundSchoolTotal);
    const monthKey = monthKeyFor(today);
    groundSchoolEarningsByMonth.set(monthKey, (groundSchoolEarningsByMonth.get(monthKey) ?? 0) + todayGroundSchoolTotal);
  }

  // A day with a ground school session but no jump of its own isn't in
  // tandemFullHistory yet — give it a zero-jump placeholder row so it
  // survives the "was anything logged" filter below and gets bucketed into
  // its week/month like any other day.
  const groundSchoolOnlyRows = [...groundSchoolByDay.keys()]
    .filter((date) => !tandemFullHistory.some((r) => r.date === date))
    .map((date) => ({ date, counts: zeroTandemCounts(), totalJumps: 0, totalEarnings: 0 }));

  const tandemNonEmptyHistory = [...tandemFullHistory, ...groundSchoolOnlyRows]
    .filter((r) => r.totalJumps > 0 || (groundSchoolEarningsByDay.get(r.date) ?? 0) > 0)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const tandemDayRows = tandemNonEmptyHistory.slice(0, 14).map((row) => ({
    ...row,
    totalEarnings: row.totalEarnings + (groundSchoolEarningsByDay.get(row.date) ?? 0),
  }));
  // The individual jumps behind the Day tab's rows, narrowed to just the
  // dates it actually renders — tandemDayJumpsFull carries one entry per
  // date in the wider 400-day window loaded for the week/month rollups,
  // most of which never reach the page. Ground school sessions ride along
  // the same way, keyed the same way, for the same reason.
  const tandemDayJumps = Object.fromEntries(
    tandemDayRows.map((row) => [row.date, tandemDayJumpsFull[row.date] ?? []]),
  );
  const groundSchoolDayEntries = Object.fromEntries(
    tandemDayRows.map((row) => [row.date, groundSchoolByDay.get(row.date) ?? []]),
  );
  const tandemCombined = [...tandemNonEmptyHistory, toTandemHistoryRow(tandemState, rateSettings.tandem)];
  const tandemWeekRows = groupTandemByWeek(tandemCombined, rateSettings.tandem)
    .map((r) => ({ ...r, totalEarnings: r.totalEarnings + (groundSchoolEarningsByWeek.get(r.key) ?? 0) }))
    .filter((r) => r.isCurrent || r.totalJumps > 0 || (groundSchoolEarningsByWeek.get(r.key) ?? 0) > 0)
    .slice(0, 12);
  const tandemMonthRows = groupTandemByInvoiceMonth(tandemCombined, rateSettings.tandem)
    .map((r) => ({ ...r, totalEarnings: r.totalEarnings + (groundSchoolEarningsByMonth.get(r.key) ?? 0) }))
    .filter((r) => r.isCurrent || r.totalJumps > 0 || (groundSchoolEarningsByMonth.get(r.key) ?? 0) > 0)
    .slice(0, 12);

  // Manifest sync state (burbleState, read above) is *read* on a page
  // load, never polled — a page load must not reach out to Burble.
  // Checking the board is an explicit action. Each pending jump carries
  // its own "how sure are we it flew" line, so the confirmation list can
  // be rendered without re-deriving it client-side. /api/burble-pending
  // returns this same shape for the open app to re-poll cheaply.
  const burblePending = pendingForClient(burbleState);

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
    tandemDayJumps,
    tandemWeekRows,
    tandemMonthRows,
    groundSchoolEntries,
    groundSchoolDayEntries,
    invoiceSettings,
    tandemVisibility,
    tabVisibility,
    rateSettings,
    logbookEntries,
    nextLogbookNumber,
    logbookSettings,
    burblePending,
    burbleUnmappedCodes: burbleState.unmappedCodes,
    showLogout: authEnabled(),
  };
};

export const actions: Actions = {
  ...packingActions,
  ...tandemActions,
  ...logbookActions,
  ...configActions,
  ...ratesActions,
  ...groundSchoolActions,
};
