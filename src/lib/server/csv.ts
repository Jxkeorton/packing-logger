// Minimal CSV quoting/parsing, shared by every ledger that has a free-text
// field (a customer's name, a jump's place/description, …) that could
// contain a comma, quote, or line break. Dates, counts and ids never need
// this — they're the one column per row that's safe to just join with ','.

/** Quotes a value only if it needs it, doubling any embedded quotes. */
export function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Splits a whole CSV document into rows of fields.
 *
 * Use this rather than `raw.split('\n').map(parseCsvLine)` for any ledger
 * with a field that can contain a line break. A quoted newline is a legal
 * part of one record, so splitting the text on '\n' first tears that record
 * in half — and both halves then fail the "does this look like a data row"
 * check and get skipped, silently losing the entry. That was a real
 * data-loss bug: saving a logbook jump whose description had a newline in it
 * made the whole jump disappear on the next read.
 *
 * Handles \n and \r\n line endings, and a final row with no trailing newline.
 */
export function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else if (ch === '\n' || ch === '\r') {
      // Consume \r\n as a single break; a lone \r ends the row too.
      if (ch === '\r' && text[i + 1] === '\n') i++;
      fields.push(current);
      rows.push(fields);
      fields = [];
      current = '';
    } else {
      current += ch;
    }
  }

  // Trailing partial row (no newline at end of file).
  if (current.length > 0 || fields.length > 0) {
    fields.push(current);
    rows.push(fields);
  }

  return rows;
}

/**
 * Splits one CSV line into fields, honouring quoted commas/quotes.
 *
 * Only safe for a line you already know is a complete record — prefer
 * `parseCsvRows` on the whole document, which cannot split a quoted newline.
 */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      fields.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}
