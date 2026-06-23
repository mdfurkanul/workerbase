import { useRef, useState } from "react";
import { CornerDownLeft, Loader2, Pencil, Play, Plus, Save, Trash2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import {
  deleteQuery,
  listSavedQueries,
  renameQuery,
  saveQuery,
  seedIfEmpty,
  type SavedQuery,
} from "@/lib/sqlStore";

/**
 * Full-page SQL console — runs (dummy) read-only queries against D1.
 * Reachable from the top bar at /sql, before Settings.
 */

interface ColumnMeta {
  name: string;
}
interface ResultTable {
  columns: ColumnMeta[];
  rows: unknown[][];
}
interface RunResult {
  ok: boolean;
  ms: number;
  rowCount?: number;
  table?: ResultTable;
  error?: string;
}

const DUMMY_RESULT: ResultTable = {
  columns: [
    { name: "name" },
    { name: "type" },
    { name: "count" },
    { name: "created" },
  ],
  rows: [
    ["users", "user", 3, "2026-06-21 18:42:11"],
    ["clients", "base", 24, "2026-06-20 09:14:02"],
    ["posts", "base", 87, "2026-06-18 12:01:55"],
    ["invoices", "base", 142, "2026-06-15 23:30:00"],
    ["top_posts", "view", 12, "2026-06-22 07:11:09"],
  ],
};

export default function SqlConsole() {
  // Seed starter queries on first visit, then load.
  const [saved, setSaved] = useState<SavedQuery[]>(() => {
    seedIfEmpty();
    return listSavedQueries();
  });
  const [query, setQuery] = useState("SELECT name, type FROM _collections ORDER BY name;");
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Inline title editing state.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");

  // Drag-over highlight + textarea ref for inserting dropped names at cursor.
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const active = saved.find((q) => q.id === activeId) ?? null;
  const editorTitle = active?.title ?? "Untitled query";

  function reload() {
    setSaved(listSavedQueries());
  }

  function startEditTitle() {
    setTitleDraft(editorTitle);
    setEditingTitle(true);
  }

  function commitTitle() {
    const next = titleDraft.trim() || "Untitled query";
    if (activeId) {
      renameQuery(activeId, next);
      reload();
    } else {
      // Promote the current query to a new saved entry.
      const entry = saveQuery(next, query);
      setActiveId(entry.id);
      reload();
    }
    setEditingTitle(false);
  }

  function cancelEditTitle() {
    setEditingTitle(false);
  }

  function handleNewQuery() {
    setQuery("");
    setActiveId(null);
    setResult(null);
    setTitleDraft("");
    setEditingTitle(true);
  }

  function onDrop(e: React.DragEvent) {
    const name =
      e.dataTransfer.getData("application/x-workerbase-collection") ||
      e.dataTransfer.getData("text/plain");
    setDragOver(false);
    if (!name) return;
    e.preventDefault();

    // Dropping a collection generates a full SELECT template.
    const template = `Select * from ${name} Order by id`;
    setQuery(template);
    setActiveId(null);
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.selectionStart = ta.selectionEnd = template.length;
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

  async function run() {
    setRunning(true);
    setResult(null);
    const started = performance.now();
    await new Promise((r) => setTimeout(r, 320));
    const ms = Math.round(performance.now() - started);
    setRunning(false);

    // Reject anything that isn't a SELECT (cheap guard; real check is server-side).
    const trimmed = query.trim();
    if (!/^SELECT\b/i.test(trimmed)) {
      setResult({ ok: false, ms, error: "Only read-only SELECT statements are allowed." });
      return;
    }
    setResult({
      ok: true,
      ms,
      rowCount: DUMMY_RESULT.rows.length,
      table: DUMMY_RESULT,
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void run();
    }
  }

  function handleSave() {
    const title = window.prompt("Save query as…", deriveTitle(query));
    if (title === null) return;
    const entry = saveQuery(title, query);
    setSaved(listSavedQueries());
    setActiveId(entry.id);
  }

  function handleOpen(q: SavedQuery) {
    setQuery(q.sql);
    setActiveId(q.id);
  }

  function handleDelete(id: string) {
    deleteQuery(id);
    setSaved(listSavedQueries());
    if (activeId === id) setActiveId(null);
  }

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<span>SQL console</span>]}
        actions={
          <>
            <button onClick={handleSave} className="btn-ghost text-[12px]" title="Save current query locally">
              <Save size={13} /> Save
            </button>
            <button onClick={() => void run()} disabled={running} className="btn-primary text-[12px]">
              {running ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              Run
            </button>
          </>
        }
      />

      <div className="flex-1 flex min-h-0">
        {/* Saved queries — titles only */}
        <aside className="w-52 shrink-0 bg-bg-elev hairline-r overflow-y-auto">
          <div className="px-3 pt-4 pb-2 flex items-center justify-between">
            <span className="label-mono">Saved</span>
            <div className="flex items-center gap-1">
              <span className="label-mono text-ink-faint mr-1">{saved.length}</span>
              <button
                onClick={handleNewQuery}
                className="btn-icon"
                title="New query"
                aria-label="New query"
              >
                <Plus size={13} />
              </button>
            </div>
          </div>
          {saved.length === 0 ? (
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
                    <button
                      onClick={() => handleDelete(q.id)}
                      className="opacity-0 group-hover:opacity-100 p-1 mr-1 text-ink-faint hover:text-err transition"
                      title="Delete"
                      aria-label={`Delete ${q.title}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Editor + results */}
        <section className="flex flex-col min-w-0 flex-1">
          {/* Editor */}
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
                      if (e.key === "Enter") {
                        e.preventDefault();
                        commitTitle();
                      } else if (e.key === "Escape") {
                        e.preventDefault();
                        cancelEditTitle();
                      }
                    }}
                    placeholder="Untitled query"
                    className="font-display text-[18px] bg-transparent border-b border-brand outline-none flex-1 min-w-0 text-ink"
                  />
                ) : (
                  <button
                    onClick={startEditTitle}
                    title="Rename"
                    className="group inline-flex items-center gap-1.5 min-w-0"
                  >
                    <span className="font-display text-[18px] text-ink truncate">
                      {editorTitle}
                    </span>
                    {active && (
                      <span className="label-mono text-ink-faint shrink-0">· saved</span>
                    )}
                    <Pencil
                      size={12}
                      className="text-ink-faint opacity-0 group-hover:opacity-100 transition shrink-0"
                    />
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
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveId(null);
              }}
              onKeyDown={onKeyDown}
              rows={6}
              spellCheck={false}
              className="w-full px-4 pb-4 pt-3 bg-bg-elev border-0 font-mono text-[13px] text-ink leading-relaxed resize-y focus:outline-none"
              placeholder="SELECT name FROM _collections;  ·  drag a collection from the left to build a query"
            />
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto p-4">
            {!result && !running && (
              <EmptyState />
            )}

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

            {result && result.ok && (
              <ResultPanel result={result} />
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

/** Derive a default title from a SQL body — first non-keyword line, trimmed. */
function deriveTitle(sql: string): string {
  const firstLine = sql.trim().split("\n")[0]?.trim() ?? "";
  return firstLine.length > 0 ? firstLine.replace(/;$/, "") : "Untitled query";
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

function ResultPanel({ result }: { result: RunResult }) {
  if (!result.table) return null;
  const { columns, rows } = result.table;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-[12px] text-ink-muted">
        <span>
          <span className="text-ok">●</span>{" "}
          Success · {result.rowCount ?? 0} {result.rowCount === 1 ? "row" : "rows"} in {result.ms} ms
        </span>
        <span className="font-mono">{result.rowCount ?? 0} / {result.rowCount ?? 0}</span>
      </div>

      <div className="bg-surface border border-line rounded overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="hairline-b bg-surface-2">
              {columns.map((c) => (
                <th
                  key={c.name}
                  className="text-left px-3 py-2 font-semibold font-mono text-[12px] text-ink-muted whitespace-nowrap"
                >
                  {c.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="hairline-b last:border-b-0 hover:bg-surface-2">
                {row.map((cell, j) => (
                  <td key={j} className="px-3 py-2 align-middle">
                    {cell === null || cell === undefined ? (
                      <span className="text-ink-faint">NULL</span>
                    ) : typeof cell === "boolean" ? (
                      cell ? (
                        <span className="badge badge-ok">true</span>
                      ) : (
                        <span className="badge badge-muted">false</span>
                      )
                    ) : (
                      <span className="font-mono text-ink">{String(cell)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
