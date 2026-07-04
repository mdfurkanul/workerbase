/**
 * Minimal RFC 4180 CSV parser.
 *
 * - Handles quoted fields containing commas, newlines, and double quotes.
 * - Returns an array of rows, where each row is an array of string values.
 * - The first row is treated as the header row.
 *
 * No external dependencies — kept small for the Worker bundle.
 */

/**
 * Parse CSV text into rows of string arrays.
 * Does NOT assume a header row — caller decides.
 */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;

  // Normalize CRLF → LF, but keep CR within quoted fields working.
  const src = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  while (i < src.length) {
    const ch = src[i]!;

    if (inQuotes) {
      if (ch === '"') {
        // Check for escaped quote ("")
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        // End of quoted field
        inQuotes = false;
        i++;
        continue;
      }
      // Inside quotes — include everything (newlines, commas, etc.)
      field += ch;
      i++;
      continue;
    }

    // Not in quotes
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      row.push(field);
      field = "";
      i++;
      continue;
    }

    if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  // Flush the last field + row (if there's pending data).
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Remove trailing empty row (from a final newline).
  if (rows.length > 0) {
    const last = rows[rows.length - 1]!;
    if (last.length === 1 && last[0] === "") {
      rows.pop();
    }
  }

  return rows;
}

/**
 * Parse CSV text into an array of objects using the first row as headers.
 * Returns `[]` if the CSV has fewer than 2 rows (header + at least 1 data row).
 */
export function parseCSVToObjects(text: string): Record<string, unknown>[] {
  const rows = parseCSV(text);
  if (rows.length < 2) return [];

  const headers = rows[0]!;
  const result: Record<string, unknown>[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < headers.length; c++) {
      const key = headers[c] ?? `col_${c}`;
      obj[key] = row[c] ?? "";
    }
    result.push(obj);
  }

  return result;
}
