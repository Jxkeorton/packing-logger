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

/** Splits one CSV line into fields, honouring quoted commas/quotes/newlines. */
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
