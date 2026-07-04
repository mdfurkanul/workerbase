/**
 * Client-side export format converters.
 *
 * The backend returns a single JSON payload (collections + rows); these
 * helpers turn that payload into JSON / CSV / SQL / XLSX downloads.
 *
 * XLSX uses SheetJS loaded via dynamic import from esm.sh — keeps the
 * dashboard bundle small and only loads the lib when actually needed.
 */

export interface ExportedCollection {
  name: string;
  type: string;
  schema: { name: string; type: string }[];
  rowCount: number;
  rows: Record<string, unknown>[];
}

export interface ExportPayload {
  meta: {
    exportedAt: string;
    limit: number;
    includeSystem: boolean;
    collectionCount: number;
  };
  collections: ExportedCollection[];
}

export type ExportFormat = "json" | "csv" | "xlsx" | "sql";

/** Trigger a browser download for a Blob. */
function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke on next tick so Safari has time to read the URL.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/** Sanitize a collection name for use as a filename component. */
function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, "_");
}

function timestamp(): string {
  return new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
}

/* ── JSON ────────────────────────────────────────────────────────── */
export function exportJSON(payload: ExportPayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  download(blob, `workerbase-export-${timestamp()}.json`);
}

/* ── CSV (zip via native CompressionStream when available) ───────── */
/**
 * Each collection becomes a CSV file. If there's exactly one collection,
 * we download it as a single .csv. If there are multiple, we bundle them
 * as a .zip using a hand-rolled ZIP writer (store-only, no compression
 * dependency — keeps bundle size minimal).
 */
export function exportCSV(payload: ExportPayload) {
  const files = payload.collections.map((c) => ({
    name: `${safeName(c.name)}.csv`,
    content: collectionToCSV(c),
  }));

  if (files.length === 1) {
    const blob = new Blob([files[0]!.content], { type: "text/csv;charset=utf-8" });
    download(blob, files[0]!.name);
    return;
  }

  // Multiple files → minimal ZIP (store method, no compression).
  const zipBlob = buildStoreZip(files);
  download(zipBlob, `workerbase-export-${timestamp()}.zip`);
}

function collectionToCSV(c: ExportedCollection): string {
  if (c.rows.length === 0) return "";
  // Use the union of keys across rows so we don't lose sparse fields.
  const keys = Array.from(
    c.rows.reduce<Set<string>>((set, r) => {
      Object.keys(r).forEach((k) => set.add(k));
      return set;
    }, new Set()),
  );
  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "object" ? JSON.stringify(v) : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  const header = keys.join(",");
  const body = c.rows.map((r) => keys.map((k) => escape(r[k])).join(",")).join("\n");
  return `${header}\n${body}`;
}

/**
 * Build a "store-only" ZIP file (no DEFLATE). This is valid ZIP —
 * every consumer (macOS Finder, Windows Explorer, browsers, etc.)
 * reads method-0 entries. Avoids pulling in a zip library.
 */
function buildStoreZip(files: { name: string; content: string }[]): Blob {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  // CRC-32 lookup table (generated once).
  const crcTable = (() => {
    const t = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[i] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes: Uint8Array): number {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) {
      const byte = bytes[i] ?? 0;
      c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8);
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  for (const f of files) {
    const data = encoder.encode(f.content);
    const nameBytes = encoder.encode(f.name);
    const crc = crc32(data);

    // Local file header (30 bytes + name).
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // signature
    lh.setUint16(4, 20, true); // version needed
    lh.setUint16(6, 0, true); // flags
    lh.setUint16(8, 0, true); // method = store
    lh.setUint16(10, 0, true); // mod time
    lh.setUint16(12, 0, true); // mod date
    lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); // compressed size
    lh.setUint32(22, data.length, true); // uncompressed size
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true); // extra length
    parts.push(new Uint8Array(lh.buffer), nameBytes, data);

    // Central directory record.
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true); // version made by
    cd.setUint16(6, 20, true); // version needed
    cd.setUint16(8, 0, true); // flags
    cd.setUint16(10, 0, true); // method
    cd.setUint16(12, 0, true); // mod time
    cd.setUint16(14, 0, true); // mod date
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint16(30, 0, true); // extra
    cd.setUint16(32, 0, true); // comment
    cd.setUint16(34, 0, true); // disk number
    cd.setUint16(36, 0, true); // internal attrs
    cd.setUint32(38, 0, true); // external attrs
    cd.setUint32(42, offset, true); // local header offset
    central.push(new Uint8Array(cd.buffer));
    central.push(nameBytes);

    offset += 30 + nameBytes.length + data.length;
  }

  // End-of-central-directory record.
  const cdSize = central.reduce((n, a) => n + a.length, 0);
  const cdOffset = offset;
  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(4, 0, true); // disk
  eocd.setUint16(6, 0, true); // disk with cd
  eocd.setUint16(8, files.length, true);
  eocd.setUint16(10, files.length, true);
  eocd.setUint32(12, cdSize, true);
  eocd.setUint32(16, cdOffset, true);
  eocd.setUint16(20, 0, true); // comment length

  return new Blob(
    [...parts, ...central, new Uint8Array(eocd.buffer)] as BlobPart[],
    { type: "application/zip" },
  );
}

/* ── SQL ─────────────────────────────────────────────────────────── */
/**
 * Emit one CREATE TABLE statement per collection (best-effort type
 * mapping from the stored schema) followed by INSERT INTO rows.
 */
export function exportSQL(payload: ExportPayload) {
  const lines: string[] = [
    `-- WorkerBase export`,
    `-- Generated: ${payload.meta.exportedAt}`,
    `-- Collections: ${payload.meta.collectionCount}`,
    `-- Row limit per collection: ${payload.meta.limit}`,
    ``,
  ];

  for (const c of payload.collections) {
    lines.push(`-- ──────────────────────────────────────────────────────`);
    lines.push(`-- Collection: ${c.name} (${c.type}) — ${c.rowCount} row(s)`);
    lines.push(`-- ──────────────────────────────────────────────────────`);

    // Use the schema from the export if available; otherwise infer from
    // the first row's keys.
    const schema = c.schema.length
      ? c.schema
      : c.rows[0]
        ? Object.keys(c.rows[0]).map((k) => ({ name: k, type: "text" }))
        : [];

    const cols = schema.map((f) => `"${f.name}" ${sqlType(f.type)}`).join(", ");
    lines.push(`CREATE TABLE IF NOT EXISTS "${c.name}" (${cols});`);

    if (c.rows.length === 0) {
      lines.push(`-- (no rows)`);
      lines.push(``);
      continue;
    }

    const colNames = schema.map((f) => `"${f.name}"`).join(", ");
    for (const r of c.rows) {
      const vals = schema.map((f) => sqlLiteral(r[f.name])).join(", ");
      lines.push(`INSERT INTO "${c.name}" (${colNames}) VALUES (${vals});`);
    }
    lines.push(``);
  }

  const blob = new Blob([lines.join("\n")], { type: "text/sql;charset=utf-8" });
  download(blob, `workerbase-export-${timestamp()}.sql`);
}

function sqlType(t: string): string {
  const lc = (t || "").toLowerCase();
  if (lc === "integer" || lc === "int" || lc === "bool" || lc === "boolean") return "INTEGER";
  if (lc === "real" || lc === "float" || lc === "double" || lc === "number") return "REAL";
  if (lc === "blob") return "BLOB";
  return "TEXT";
}

function sqlLiteral(v: unknown): string {
  if (v == null) return "NULL";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "NULL";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

/* ── XLSX (SheetJS via dynamic import from CDN) ──────────────────── */
export async function exportXLSX(payload: ExportPayload) {
  // Load SheetJS lazily so the dashboard bundle stays small.
  // The CDN URL is opaque to TS — cast through unknown.
  const XLSX = (await import(
    /* @vite-ignore */ "https://esm.sh/xlsx@0.18.5" as string
  ).catch(() => null)) as unknown as {
    utils: {
      book_new: () => unknown;
      json_to_sheet: (rows: Record<string, unknown>[]) => unknown;
      book_append_sheet: (wb: unknown, ws: unknown, name: string) => void;
    };
    write: (wb: unknown, opts: { bookType: string; type: string }) => unknown;
  } | null;

  if (!XLSX) {
    throw new Error(
      "Failed to load the spreadsheet library (network blocked?). Try JSON or CSV instead.",
    );
  }

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const c of payload.collections) {
    // Sheet names are limited to 31 chars and can't contain : \ / ? * [ ]
    let sheetName = safeName(c.name).slice(0, 31) || "Sheet";
    let n = 1;
    while (usedNames.has(sheetName.toLowerCase())) {
      const suffix = `_${n++}`;
      sheetName = safeName(c.name).slice(0, 31 - suffix.length) + suffix;
    }
    usedNames.add(sheetName.toLowerCase());

    const ws = XLSX.utils.json_to_sheet(c.rows.length ? c.rows : [{}]);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
  }

  const out = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([out], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  download(blob, `workerbase-export-${timestamp()}.xlsx`);
}
