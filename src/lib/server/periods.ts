// Pure date/period math shared by every worked-jobs log (packing, tandem
// jumps, …). No dependency on what's being counted, so both logs' invoice
// groupings stay in lockstep by construction rather than by two copies
// happening to agree.
//
// Invoice months don't follow the calendar: each one runs from the day
// after the previous cutoff through this month's cutoff, where the cutoff
// is the Sunday before the last Tuesday of the month. Because every cutoff
// falls on a Sunday, these periods always start on a Monday and end on a
// Sunday — i.e. they're exactly a whole number of Monday–Sunday weeks.

export function parseDateKey(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

export function formatDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Rejects both malformed strings and dates that don't actually exist (e.g.
 * 2026-02-30, which `Date` would otherwise silently roll into March) —
 * used by the "backfill a past day" endpoints (api/set-day.ts,
 * api/tandem-set-day.ts) to validate a date before writing it.
 */
export function isValidCalendarDate(date: string): boolean {
  if (!DATE_KEY_RE.test(date)) return false;
  const d = parseDateKey(date);
  return !Number.isNaN(d.getTime()) && formatDateKey(d) === date;
}

export function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

export function shortDate(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function rangeLabel(start: Date, end: Date): string {
  return `${shortDate(start)} – ${shortDate(end)}`;
}

/** The Monday (start of week) containing `d`. */
export function mondayOf(d: Date): Date {
  const daysSinceMonday = (d.getDay() + 6) % 7; // Mon=0 ... Sun=6
  return addDays(d, -daysSinceMonday);
}

/** The last Tuesday of the given month (monthIndex0 is 0-based, like Date). */
export function lastTuesdayOfMonth(year: number, monthIndex0: number): Date {
  const lastDay = new Date(year, monthIndex0 + 1, 0); // day 0 of next month = last day of this one
  const offsetFromTuesday = (lastDay.getDay() - 2 + 7) % 7;
  return addDays(lastDay, -offsetFromTuesday);
}

/** The invoice cutoff for a month: the Sunday before its last Tuesday. */
export function invoiceCutoff(year: number, monthIndex0: number): Date {
  return addDays(lastTuesdayOfMonth(year, monthIndex0), -2);
}

/** Which invoice month (year + 0-based month) a date's work counts towards. */
export function invoiceMonthOf(d: Date): { year: number; month: number } {
  const year = d.getFullYear();
  const month = d.getMonth();
  const cutoff = invoiceCutoff(year, month);
  if (d.getTime() <= cutoff.getTime()) return { year, month };
  return month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 };
}
