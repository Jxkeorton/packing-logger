import { describe, expect, it } from 'vitest';
import { csvEscape, parseCsvLine, parseCsvRows } from './csv';

describe('csvEscape', () => {
  it('leaves plain values unquoted', () => {
    expect(csvEscape('Langar')).toBe('Langar');
    expect(csvEscape('')).toBe('');
  });

  it('quotes a value containing a comma', () => {
    expect(csvEscape('Smith, Jane')).toBe('"Smith, Jane"');
  });

  it('quotes and doubles embedded quotes', () => {
    expect(csvEscape('She said "hi"')).toBe('"She said ""hi"""');
  });

  it('quotes a value containing a newline or carriage return', () => {
    expect(csvEscape('line one\nline two')).toBe('"line one\nline two"');
    expect(csvEscape('line one\r\nline two')).toBe('"line one\r\nline two"');
  });
});

describe('parseCsvLine', () => {
  it('splits plain comma-separated fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps a trailing empty field', () => {
    expect(parseCsvLine('a,b,')).toEqual(['a', 'b', '']);
  });

  it('unquotes a quoted field and preserves the comma inside it', () => {
    expect(parseCsvLine('a,"Smith, Jane",c')).toEqual(['a', 'Smith, Jane', 'c']);
  });

  it('un-doubles an escaped quote inside a quoted field', () => {
    expect(parseCsvLine('a,"She said ""hi""",c')).toEqual(['a', 'She said "hi"', 'c']);
  });

  it('preserves an embedded newline inside a quoted field', () => {
    expect(parseCsvLine('a,"line one\nline two",c')).toEqual(['a', 'line one\nline two', 'c']);
  });

  it('round-trips every escapable character through csvEscape', () => {
    const original = 'Tricky, "quoted"\nvalue';
    const line = ['before', csvEscape(original), 'after'].join(',');
    expect(parseCsvLine(line)).toEqual(['before', original, 'after']);
  });
});

describe('parseCsvRows', () => {
  it('splits plain rows on newlines', () => {
    expect(parseCsvRows('a,b\nc,d\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a quoted newline inside one field instead of splitting the row', () => {
    // The bug this function exists for: split('\n') would tear this record
    // in two and both halves would then be discarded as unparseable.
    expect(parseCsvRows('2026-08-01,"line one\nline two",at-1\n')).toEqual([
      ['2026-08-01', 'line one\nline two', 'at-1'],
    ]);
  });

  it('handles quoted commas and doubled quotes', () => {
    expect(parseCsvRows('"Smith, Jane","She said ""hi"""\n')).toEqual([['Smith, Jane', 'She said "hi"']]);
  });

  it('handles \\r\\n line endings', () => {
    expect(parseCsvRows('a,b\r\nc,d\r\n')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps a final row that has no trailing newline', () => {
    expect(parseCsvRows('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('is empty for empty input', () => {
    expect(parseCsvRows('')).toEqual([]);
  });
});
