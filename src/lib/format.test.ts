import { describe, expect, it } from 'vitest';
import { dayLabel } from './format';

describe('dayLabel', () => {
  // Fixed so "today"/"yesterday" don't depend on when the suite runs — a
  // Wednesday, well clear of a year boundary.
  const now = new Date('2026-09-16T12:00:00Z');

  it('labels a jump from today as "Today"', () => {
    expect(dayLabel('2026-09-16T07:30:00Z', now)).toBe('Today');
  });

  it('labels a jump from just after midnight as "Today", not "Yesterday"', () => {
    expect(dayLabel('2026-09-16T00:05:00Z', now)).toBe('Today');
  });

  it('labels yesterday distinctly from today', () => {
    expect(dayLabel('2026-09-15T20:00:00Z', now)).toBe('Yesterday');
  });

  it('names the day for anything older, without a year — the common case for a backlog inside the same year', () => {
    expect(dayLabel('2026-08-29T10:00:00Z', now)).toBe('Sat 29 Aug');
  });

  it('names the year too once a pending jump has survived into a new one', () => {
    // Confirmed exactly by never purging pending jumps (see burble/sync.ts)
    // — a months-old sighting is expected to still be sitting there.
    expect(dayLabel('2025-12-20T10:00:00Z', now)).toBe('Sat, 20 Dec 2025');
  });
});
