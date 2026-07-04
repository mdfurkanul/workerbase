import { useEffect, useMemo, useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useCollections } from "@/hooks/useCollections";
import { apiClient, ApiError } from "@/lib/api-client";
import { parseCSVToObjects } from "@/lib/csv";
import { Card, Field } from "./primitives";

export type ImportFormat = "json" | "csv";
export type ImportTargetMode = "existing" | "new";
export type ImportNewType = "base" | "user";

export interface ImportMapping {
  sourceColumn: string;
  targetColumn: string | null;
}

export interface ImportResult {
  imported: number;
  collection: string;
  created: boolean;
  errors: string[];
}

export function ImportForm() {
  const { collections, refresh } = useCollections();

  // Step state
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Parsed data
  const [format, setFormat] = useState<ImportFormat>("json");
  const [rows, setRows] = useState<Record<string, unknown>[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [exportCollectionNames, setExportCollectionNames] = useState<string[] | null>(null);
  const [selectedExportCol, setSelectedExportCol] = useState<string>("");

  // Target
  const [targetMode, setTargetMode] = useState<ImportTargetMode>("existing");
  const [existingTarget, setExistingTarget] = useState<string>("");
  const [newName, setNewName] = useState<string>("");
  const [newType, setNewType] = useState<ImportNewType>("base");

  // Mappings
  const [mappings, setMappings] = useState<ImportMapping[]>([]);

  // Result
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement | null>(null);

  /* ── Derived: source columns from parsed rows ── */
  const sourceColumns = useMemo(() => {
    if (rows.length === 0) return [];
    const set = new Set<string>();
    for (const r of rows) {
      for (const k of Object.keys(r)) set.add(k);
    }
    return Array.from(set);
  }, [rows]);

  /* ── Derived: target collection name ── */
  const targetCollection = targetMode === "existing" ? existingTarget : newName;

  /* ── Derived: target columns (existing schema or new from mappings) ── */
  const targetSchema = useMemo<{ name: string; type: string }[]>(() => {
    if (targetMode === "existing") {
      const col = collections.find((c) => c.name === existingTarget);
      return col?.schema ?? [];
    }
    // For new collections, derive from non-null target columns in mappings.
    const mapped = mappings
      .filter((m) => m.targetColumn !== null && m.targetColumn !== "")
      .map((m) => m.targetColumn!)
      .filter((v, i, arr) => arr.indexOf(v) === i);
    return mapped.map((name) => ({ name, type: "text" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetMode, existingTarget, collections]);

  /* ── Auto-match columns when source or target changes ── */
  useEffect(() => {
    if (sourceColumns.length === 0) return;
    const targetColNames = targetSchema.map((s) => s.name.toLowerCase());
    setMappings(
      sourceColumns.map((src) => {
        const idx = targetColNames.indexOf(src.toLowerCase());
        return {
          sourceColumn: src,
          targetColumn: idx >= 0 ? targetSchema[idx]!.name : null,
        };
      }),
    );
  }, [sourceColumns, targetSchema]);

  /* ── Reset state when picking a new file ── */
  function resetState() {
    setRows([]);
    setFileName("");
    setParseError(null);
    setExportCollectionNames(null);
    setSelectedExportCol("");
    setStep(1);
    setResult(null);
    setError(null);
    setMappings([]);
  }

  /* ── Handle file selection ── */
  function handleFile(file: File) {
    resetState();
    setFileName(file.name);
    const ext = file.name.split(".").pop()?.toLowerCase();
    const fmt: ImportFormat = ext === "csv" ? "csv" : "json";
    setFormat(fmt);

    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      try {
        if (fmt === "csv") {
          const parsed = parseCSVToObjects(text);
          if (parsed.length === 0) {
            setParseError("CSV file has no data rows.");
            return;
          }
          setRows(parsed);
        } else {
          const json = JSON.parse(text);
          let extracted: Record<string, unknown>[] = [];
          let exportCols: string[] | null = null;

          if (Array.isArray(json)) {
            extracted = json as Record<string, unknown>[];
          } else if (json && typeof json === "object") {
            // Export payload: { collections: [...] }
            if (Array.isArray(json.collections)) {
              exportCols = (json.collections as { name: string }[]).map((c) => c.name);
              if (exportCols.length > 0) {
                const first = (json.collections as { rows: Record<string, unknown>[] }[])[0]!;
                extracted = first.rows ?? [];
                setSelectedExportCol(exportCols[0]!);
              }
            } else if (Array.isArray(json.rows)) {
              extracted = json.rows as Record<string, unknown>[];
            } else if (Array.isArray(json.data)) {
              extracted = json.data as Record<string, unknown>[];
            } else {
              setParseError("JSON must be an array or have a rows/data/collections key.");
              return;
            }
          } else {
            setParseError("JSON root must be an array or object.");
            return;
          }

          if (extracted.length === 0) {
            setParseError("No rows found in the file.");
            return;
          }
          setRows(extracted);
          setExportCollectionNames(exportCols);
        }
        setStep(2);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setParseError(`Failed to parse: ${msg}`);
      }
    };
    reader.onerror = () => setParseError("Failed to read file.");
    reader.readAsText(file);
  }

  /* ── Drag and drop handlers ── */
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  /* ── Execute the import ── */
  async function handleImport() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const payload = {
        format,
        target: {
          mode: targetMode,
          collection: targetCollection,
          ...(targetMode === "new" ? { type: newType } : {}),
        },
        mappings,
        data: rows,
      };
      const res = await apiClient.post<ImportResult>(`/api/core/import`, payload);
      setResult(res);
      setStep(4);
      if (res.imported > 0) {
        await refresh();
      }
    } catch (err) {
      const msg =
        err instanceof ApiError
          ? typeof err.detail === "string"
            ? err.detail
            : (err.detail as { error?: string } | null)?.error ?? err.message
          : err instanceof Error
            ? err.message
            : "Import failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  /* ── Validation ── */
  const canProceedToMapping =
    rows.length > 0 &&
    (targetMode === "existing"
      ? !!existingTarget
      : newName.length > 0 && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(newName));

  const hasMappedColumns = mappings.some((m) => m.targetColumn !== null && m.targetColumn !== "");

  /* ── Step 1: Upload ── */
  if (step === 1) {
    return (
      <Card title="Import collections">
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => inputRef.current?.click()}
          className="border-2 border-dashed border-line-strong rounded p-8 text-center cursor-pointer hover:border-brand hover:bg-surface-2 transition"
        >
          <Upload size={28} className="mx-auto text-ink-faint" />
          <p className="mt-3 text-[13px] text-ink">Drop a .json or .csv file here</p>
          <p className="text-[12px] text-ink-faint mt-1">or click to browse</p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,.csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFile(file);
            }}
          />
        </div>
        {parseError && (
          <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
            {parseError}
          </div>
        )}
        <div className="text-[12px] text-ink-faint space-y-1">
          <div>
            <strong>JSON</strong> — array of objects, or an export payload from this app's Export feature.
          </div>
          <div>
            <strong>CSV</strong> — first row is treated as column headers.
          </div>
        </div>
      </Card>
    );
  }

  /* ── Steps 2-4 share the same layout ── */
  return (
    <div className="space-y-6">
      {/* Header bar: file info + reset */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded bg-surface-2 border border-line text-[11px] font-mono text-ink-muted">
            {format.toUpperCase()}
          </span>
          <span className="font-mono text-[12px] text-ink-muted truncate max-w-[200px]">{fileName}</span>
          <span className="text-[12px] text-ink-faint">{rows.length} rows</span>
        </div>
        <button onClick={resetState} className="btn-ghost text-[12px]">
          <Upload size={12} /> New file
        </button>
      </div>

      {/* Export payload collection selector */}
      {exportCollectionNames && exportCollectionNames.length > 0 && (
        <Card title="Export payload detected">
          <Field label="Collection to import from">
            <select
              value={selectedExportCol}
              onChange={(e) => setSelectedExportCol(e.target.value)}
              className="field-input"
            >
              {exportCollectionNames.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </Field>
          <p className="text-[12px] text-ink-faint">
            Note: only the first selected collection's rows are imported in this version.
          </p>
        </Card>
      )}

      {/* Step 2: Target selection */}
      {step === 2 && (
        <Card title="Target">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input
                type="radio"
                name="import-target-mode"
                checked={targetMode === "existing"}
                onChange={() => setTargetMode("existing")}
                className="accent-[var(--brand)]"
              />
              Existing collection
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-[13px]">
              <input
                type="radio"
                name="import-target-mode"
                checked={targetMode === "new"}
                onChange={() => setTargetMode("new")}
                className="accent-[var(--brand)]"
              />
              Create new collection
            </label>
          </div>

          {targetMode === "existing" ? (
            <Field label="Collection" required>
              <select
                value={existingTarget}
                onChange={(e) => setExistingTarget(e.target.value)}
                className="field-input"
              >
                <option value="">— Select —</option>
                {collections
                  .filter(
                    (c) =>
                      c.source !== "system" &&
                      !c.name.startsWith("_") &&
                      c.type !== "view",
                  )
                  .map((c) => (
                    <option key={c.id ?? c.name} value={c.name}>
                      {c.name} ({c.type})
                    </option>
                  ))}
              </select>
            </Field>
          ) : (
            <>
              <Field label="Collection name" required hint="Letters, digits, underscores. Must start with a letter.">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="my_collection"
                  className="field-input font-mono"
                />
              </Field>
              <Field label="Type">
                <div className="flex gap-2">
                  {(["base", "user"] as ImportNewType[]).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setNewType(t)}
                      className={`px-3 py-1.5 rounded border text-[13px] font-mono transition ${
                        newType === t
                          ? "border-brand bg-brand/5 text-ink"
                          : "border-line text-ink-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      {t === "user" ? "user (auth)" : t}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {/* Preview of target schema */}
          {targetMode === "existing" && existingTarget && (
            <div>
              <span className="label-mono">Target schema</span>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {targetSchema.map((s) => (
                  <span key={s.name} className="px-2 py-0.5 rounded bg-surface-2 text-[11px] font-mono text-ink-muted">
                    {s.name}: {s.type}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button onClick={() => setStep(1)} className="btn-ghost text-[12px]">← Back</button>
            <button
              onClick={() => setStep(3)}
              disabled={!canProceedToMapping}
              className="btn-primary disabled:opacity-50"
            >
              Map columns →
            </button>
          </div>
        </Card>
      )}

      {/* Step 3: Column mapping */}
      {step === 3 && (
        <Card title="Column mapping">
          <div className="space-y-2">
            {mappings.map((m, idx) => (
              <div key={m.sourceColumn} className="grid grid-cols-[1fr_1fr] gap-2 items-center">
                <div className="font-mono text-[12px] text-ink truncate">{m.sourceColumn}</div>
                <select
                  value={m.targetColumn ?? "__skip__"}
                  onChange={(e) => {
                    const val = e.target.value;
                    setMappings((prev) =>
                      prev.map((mm, i) =>
                        i === idx
                          ? { ...mm, targetColumn: val === "__skip__" ? null : val }
                          : mm,
                      ),
                    );
                  }}
                  className="field-input text-[12px] py-1"
                >
                  <option value="__skip__">— Skip —</option>
                  {targetSchema.map((s) => (
                    <option key={s.name} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {/* Preview of first mapped row */}
          {rows.length > 0 && (
            <div>
              <span className="label-mono">Preview (first mapped row)</span>
              <div className="mt-2 border border-line rounded bg-surface overflow-x-auto">
                <table className="w-full text-[12px] font-mono">
                  <thead className="bg-surface-2 hairline-b">
                    <tr>
                      {mappings.filter((m) => m.targetColumn).map((m) => (
                        <th key={m.sourceColumn} className="text-left px-2 py-1 text-ink-muted">{m.targetColumn}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="hairline-b">
                      {mappings.filter((m) => m.targetColumn).map((m) => {
                        const val = (rows[0] as Record<string, unknown>)?.[m.sourceColumn];
                        return (
                          <td key={m.sourceColumn} className="px-2 py-1 text-ink">
                            {val === undefined || val === null ? "" : typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </td>
                        );
                      })}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-2">
            <button onClick={() => setStep(2)} className="btn-ghost text-[12px]">← Back</button>
            <button
              onClick={handleImport}
              disabled={!hasMappedColumns || busy}
              className="btn-primary disabled:opacity-50"
            >
              <Upload size={14} /> {busy ? "Importing…" : `Import ${rows.length} rows`}
            </button>
          </div>
        </Card>
      )}

      {/* Step 4: Result */}
      {step === 4 && result && (
        <Card title="Import result">
          <div className="space-y-3">
            <div className="grid grid-cols-3 gap-3 text-[13px]">
              <div className="bg-surface-2 rounded px-3 py-2">
                <div className="label-mono">Imported</div>
                <div className="font-mono text-ink text-lg">{result.imported}</div>
              </div>
              <div className="bg-surface-2 rounded px-3 py-2">
                <div className="label-mono">Errors</div>
                <div className={`font-mono text-lg ${result.errors.length > 0 ? "text-err" : "text-ink"}`}>
                  {result.errors.length}
                </div>
              </div>
              <div className="bg-surface-2 rounded px-3 py-2">
                <div className="label-mono">Collection</div>
                <div className="font-mono text-ink text-[13px] truncate">{result.collection}</div>
                {result.created && <span className="text-[11px] text-ok font-mono">created</span>}
              </div>
            </div>

            {result.errors.length > 0 && (
              <div>
                <span className="label-mono">Per-row errors</span>
                <ul className="mt-2 max-h-48 overflow-y-auto border border-line rounded bg-surface text-[12px] font-mono">
                  {result.errors.map((e, i) => (
                    <li key={i} className="px-3 py-1 text-err hairline-b last:border-b-0">{e}</li>
                  ))}
                </ul>
              </div>
            )}

            <button onClick={resetState} className="btn-ghost text-[12px]">
              <Upload size={12} /> Import another file
            </button>
          </div>
        </Card>
      )}

      {/* Error banner (steps 2-4) */}
      {error && (
        <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
          {error}
        </div>
      )}
    </div>
  );
}
