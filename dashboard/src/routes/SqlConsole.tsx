import { useEffect, useRef, useState } from "react";
import { CornerDownLeft, Loader2, Pencil, Play, Plus, Save, Trash2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { apiClient } from "@/lib/api-client";
import { useAuth, canEdit } from "@/hooks/useAuth";

/* ─── Types ──────────────────────────────────────────────────────── */
interface SavedQuery {
  id: string;
  title: string;
  sql: string;
  created_by?: string;
  last_run_at?: number;
  created_at: number;
  updated_at: number;
}

interface ExecuteResult {
  ok: boolean;
  columns?: string[];
  rows?: Record<string, unknown>[];
  rowCount?: number;
  error?: string;
}

export default function SqlConsole() {
  const { user } = useAuth();
  const allowSave = canEdit(user);
  const [saved, setSaved] = useState<SavedQuery[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);

  const [query, setQuery] = useState("SELECT name, type FROM _collections ORDER BY name;");
  const [result, setResult] = useState<ExecuteResult | null>(null);
  const [running, setRunning] = useState(false);

  // Inline title editing.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Drag-and-drop into editor.
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const active = saved.find((q) => q.id === activeId) ?? null;

  /** Auto-generate a title like "Query 1", "Query 2", etc. based on
   *  existing saved titles. Used as a placeholder when the user hasn't
   *  typed a custom title yet. */
  function nextAutoTitle(): string {
    let max = 0;
    for (const q of saved) {
      const m = q.title.match(/^Query (\d+)$/i);
      if (m) max = Math.max(max, parseInt(m[1]!, 10));
    }
    return `Query ${max + 1}`;
  }

  // The visible title: explicit custom title > saved title > auto-generated.
  // `customTitle` is non-null only when the user has typed something.
  const [customTitle, setCustomTitle] = useState<string | null>(null);
  const editorTitle = active?.title ?? customTitle ?? nextAutoTitle();
  const isCustom = customTitle !== null && customTitle.trim() !== "";

  /* ─── Load saved queries from API ──────────────────────────────── */
  async function loadSaved() {
    setSavedLoading(true);
    try {
      const res = await apiClient.get<{ queries: SavedQuery[] }>("/api/core/sql/queries");
      setSaved(res.queries ?? []);
    } catch {
      setSaved([]);
    } finally {
      setSavedLoading(false);
    }
  }

  useEffect(() => {
    void loadSaved();
  }, []);

  /* ─── Execute query against D1 ─────────────────────────────────── */
  async function run() {
    setRunning(true);
    setResult(null);
    try {
      const res = await apiClient.post<ExecuteResult>("/api/core/sql/execute", { sql: query });
      setResult(res);

      // Update lastRunAt on the active saved query.
      if (activeId) {
        try {
          await apiClient.patch(`/api/core/sql/queries/${activeId}`, { lastRunAt: Date.now() });
        } catch { /* non-fatal */ }
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : "Failed to execute query",
      });
    } finally {
      setRunning(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
  }

  /* ─── Save / rename / new ──────────────────────────────────────── */

  async function handleSave() {
    // If editing an existing query, update it in place. Use the custom
    // title if set, otherwise keep the existing saved title.
    if (activeId) {
      try {
        const next = isCustom ? customTitle!.trim() : (active?.title ?? nextAutoTitle());
        await apiClient.patch(`/api/core/sql/queries/${activeId}`, {
          title: next || nextAutoTitle(),
          sql: query,
        });
        await loadSaved();
      } catch { /* ignore */ }
      return;
    }
    // Otherwise create a new one. If the user typed a custom title, use it;
    // fall back to the auto-generated "Query N".
    const title = isCustom ? customTitle!.trim() || nextAutoTitle() : nextAutoTitle();
    try {
      const res = await apiClient.post<{ id: string }>("/api/core/sql/queries", { title, sql: query });
      setActiveId(res.id);
      setCustomTitle(null);
      await loadSaved();
    } catch { /* ignore */ }
  }

  function startEditTitle() {
    setTitleDraft(editorTitle);
    setEditingTitle(true);
  }

  async function commitTitle() {
    const next = titleDraft.trim();
    if (activeId) {
      // Persist rename on an existing saved query.
      try {
        await apiClient.patch(`/api/core/sql/queries/${activeId}`, {
          title: next || nextAutoTitle(),
        });
        await loadSaved();
      } catch { /* ignore */ }
      setCustomTitle(null);
    } else {
      // Stash the user's title for when the unsaved query gets Saved.
      setCustomTitle(next || null);
    }
    setEditingTitle(false);
  }

  function handleNewQuery() {
    setQuery("");
    setActiveId(null);
    setResult(null);
    setTitleDraft("");
    setCustomTitle(null);
  }

  async function handleOpen(q: SavedQuery) {
    setQuery(q.sql);
    setActiveId(q.id);
    setResult(null);
    setCustomTitle(null);
  }

  async function handleDelete(id: string) {
    try {
      await apiClient.del(`/api/core/sql/queries/${id}`);
      if (activeId === id) {
        setActiveId(null);
        setQuery("");
        setResult(null);
      }
      await loadSaved();
    } catch { /* ignore */ }
  }

  /* ─── Drag-and-drop collection name ────────────────────────────── */
  function onDrop(e: React.DragEvent) {
    const name =
      e.dataTransfer.getData("application/x-workerbase-collection") ||
      e.dataTransfer.getData("text/plain");
    setDragOver(false);
    if (!name) return;
    e.preventDefault();
    const template = `Select * from ${name} Order by id`;
    setQuery(template);
    setActiveId(null);
    requestAnimationFrame(() => {
      if (taRef.current) {
        taRef.current.focus();
        taRef.current.selectionStart = taRef.current.selectionEnd = template.length;
      }
    });
  }

  function onDragOver(e: React.DragEvent) {
    if (
      e.dataTransfer.types.includes("application/x-workerbase-collection") ||
      e.dataTransfer.types.includes("text/plain")
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      setDragOver(true);
    }
  }

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<span>SQL console</span>]}
        actions={
          <>
            {allowSave && (
              <button onClick={handleSave} className="btn-ghost text-[12px]" title="Save query">
                <Save size={13} /> Save
              </button>
            )}
            <button onClick={() => void run()} disabled={running} className="btn-primary text-[12px]">
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Run
            </button>
          </>
        }
      />

      <div className="flex-1 flex min-h-0">
        {/* Saved queries — from API */}
        <aside className="w-52 shrink-0 bg-bg-elev hairline-r overflow-y-auto">
          <div className="px-3 pt-4 pb-2 flex items-center justify-between">
            <span className="label-mono">Saved</span>
            <div className="flex items-center gap-0.5">
              <span className="label-mono text-ink-faint mr-1">{saved.length}</span>
              {allowSave && (
                <button onClick={handleNewQuery} className="btn-icon" title="New query">
                  <Plus size={13} />
                </button>
              )}
            </div>
          </div>
          {savedLoading ? (
            <div className="px-3 py-3 text-[12px] text-ink-faint">Loading…</div>
          ) : saved.length === 0 ? (
            <div className="px-3 py-3 text-[12px] text-ink-faint">
              No saved queries yet.
            </div>
          ) : (
            <ul className="px-2 space-y-0.5">
              {saved.map((q) => (
                <li key={q.id}>
                  <div
                    className={[
                      "group flex items-center rounded transition",
                      q.id === activeId
                        ? "bg-surface-2 text-ink"
                        : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                    ].join(" ")}
                  >
                    <button
                      onClick={() => handleOpen(q)}
                      className="flex-1 text-left px-2 py-1.5 text-[13px] truncate"
                      title={q.title}
                    >
                      {q.title}
                    </button>
                    {allowSave && (
                      <button
                        onClick={() => handleDelete(q.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-ink-faint hover:text-err transition"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor + results */}
        <section className="flex flex-col min-w-0 flex-1">
          <div
            className={`hairline-b bg-bg-elev transition-colors ${dragOver ? "ring-2 ring-brand ring-inset bg-brand/5" : ""}`}
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={() => setDragOver(false)}
          >
            <div className="px-4 py-2 flex items-center justify-between gap-3 hairline-b">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? "bg-brand" : "bg-ink-faint"}`}
                />
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); commitTitle(); }
                      else if (e.key === "Escape") setEditingTitle(false);
                    }}
                    placeholder="Query title"
                    className="font-display text-[18px] bg-transparent border-b border-brand outline-none flex-1 min-w-0 text-ink"
                  />
                ) : (
                  <button onClick={startEditTitle} title="Rename" className="group inline-flex items-center gap-1.5 min-w-0">
                    <span
                      className={`font-display text-[18px] truncate ${
                        active || isCustom ? "text-ink" : "text-ink-faint italic"
                      }`}
                    >
                      {editorTitle}
                    </span>
                    {active && <span className="label-mono text-ink-faint shrink-0">· saved</span>}
                    <Pencil size={12} className="text-ink-faint opacity-0 group-hover:opacity-100 transition shrink-0" />
                  </button>
                )}
              </div>
              <span className="label-mono inline-flex items-center gap-1 shrink-0">
                <CornerDownLeft size={11} /> ⌘↵ to run
              </span>
            </div>
            <textarea
              ref={taRef}
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveId(null); }}
              onKeyDown={onKeyDown}
              rows={6}
              spellCheck={false}
              className="w-full px-4 pb-4 pt-3 bg-bg-elev border-0 font-mono text-[13px] text-ink leading-relaxed resize-y focus:outline-none"
              placeholder="SELECT name FROM _collections;  ·  drag a collection from the left to build a query"
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto p-4">
            {!result && !running && <EmptyState />}
            {running && (
              <div className="flex items-center gap-2 text-[12px] text-ink-muted">
                <Loader2 size={13} className="animate-spin text-brand" /> Running query…
              </div>
            )}
            {result && !result.ok && (
              <div className="bg-err-bg border border-err/40 text-err rounded px-4 py-3 text-[13px] font-mono">
                {result.error}
              </div>
            )}
            {result && result.ok && <ResultPanel result={result} />}
          </div>
        </section>
      </div>
    </AppShell>
  );
}


function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center text-ink-faint">
      <CornerDownLeft size={28} />
      <p className="mt-3 text-[13px]">Run a query to see results here.</p>
      <p className="text-[12px] text-ink-faint mt-1">
        Write a SELECT and hit Run (or ⌘↵).
      </p>
    </div>
  );
}

function ResultPanel({ result }: { result: ExecuteResult }) {
  const columns = result.columns ?? [];
  const rows = result.rows ?? [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px] text-ink-muted">
        <span>
          <span className="text-ok">●</span>{" "}
          Success · {result.rowCount ?? 0} {(result.rowCount ?? 0) === 1 ? "row" : "rows"}
        </span>
      </div>
      {rows.length === 0 ? (
        <div className="text-[13px] text-ink-faint text-center py-8">Query returned no rows.</div>
      ) : (
        <div className="bg-surface border border-line rounded overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="hairline-b bg-surface-2">
                {columns.map((c) => (
                  <th key={c} className="text-left px-3 py-2 font-semibold font-mono text-[12px] text-ink-muted whitespace-nowrap">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={i} className="hairline-b last:border-b-0 hover:bg-surface-2">
                  {columns.map((col) => {
                    const cell = row[col];
                    return (
                      <td key={col} className="px-3 py-2 align-middle">
                        {cell === null || cell === undefined ? (
                          <span className="text-ink-faint">NULL</span>
                        ) : typeof cell === "boolean" ? (
                          cell ? <span className="badge badge-ok">true</span> : <span className="badge badge-muted">false</span>
                        ) : (
                          <span className="font-mono text-ink">{String(cell)}</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
