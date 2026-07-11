import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AppShell from "@/components/AppShell";
import { apiClient } from "@/lib/api-client";
import { usePrefs } from "@/hooks/usePrefs";
import {
  apiGetLogsSummary,
  apiGetLogsTimeseries,
  type LogsSummary,
  type TimeBucket,
  type TimeSeriesData,
} from "@/lib/api-logs";
import type { LogEntry, LogLevel } from "@/lib/api-types";

interface LogsResponse {
  items: LogEntry[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

const PER_PAGE = 50;

const LEVEL_META: Record<LogLevel, { colorVar: string; textClass: string }> = {
  info: { colorVar: "var(--ok)", textClass: "text-ok" },
  warn: { colorVar: "var(--warn)", textClass: "text-warn" },
  error: { colorVar: "var(--err)", textClass: "text-err" },
};

const METHOD_COLORS: Record<string, string> = {
  GET: "var(--ok)",
  POST: "var(--brand)",
  PATCH: "var(--warn)",
  PUT: "var(--warn)",
  DELETE: "var(--err)",
};

/** Build stepped-area SVG paths for a set of series. */
function SteppedChart({
  buckets,
  series,
  activeIndex,
  onHover,
  onClick,
}: {
  buckets: TimeBucket[];
  series: { key: string; color: string; vals: number[]; max: number }[];
  activeIndex: number | null;
  onHover: (i: number | null) => void;
  onClick: (i: number) => void;
}) {
  const N = buckets.length;
  return (
    <div
      className="absolute inset-0"
      onMouseLeave={() => onHover(null)}
    >
      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${N} 100`} preserveAspectRatio="none">
        {series.map((s) => {
          const ys = s.vals.map((v) => 100 - (v / s.max) * 100);
          let line = `M 0,${ys[0]}`;
          for (let j = 1; j < N; j++) line += ` H ${j} V ${ys[j]}`;
          line += ` H ${N}`;
          const area = `${line} L ${N},100 L 0,100 Z`;
          return (
            <g key={s.key}>
              <path d={area} fill={s.color} opacity={0.1} />
              <path
                d={line}
                fill="none"
                stroke={s.color}
                strokeWidth={1.8}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          );
        })}
      </svg>

      {/* Invisible click+hover zones — one per bucket, no visual separation */}
      <div className="absolute inset-0 flex">
        {buckets.map((b, i) => (
          <div
            key={i}
            className="flex-1 cursor-pointer"
            onMouseEnter={() => onHover(i)}
            onClick={() => onClick(i)}
          />
        ))}
      </div>

      {/* Hover cursor line */}
      {activeIndex !== null && activeIndex >= 0 && (
        <div
          className="absolute top-0 bottom-0 w-px pointer-events-none"
          style={{
            left: `${((activeIndex + 0.5) / N) * 100}%`,
            background: "var(--ink-muted)",
            opacity: 0.3,
          }}
        />
      )}
    </div>
  );
}

export default function Logs() {
  const [rows, setRows] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState<LogLevel | "">("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [summary, setSummary] = useState<LogsSummary>({ total: 0, info: 0, warn: 0, error: 0 });
  const [range, setRange] = useState<"24h" | "7d">("24h");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [series, setSeries] = useState<TimeSeriesData | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  // Time-range filter from clicking a bucket — {since, until, label} or null.
  const [timeFilter, setTimeFilter] = useState<{ since: number; until?: number; label: string } | null>(null);
  const { formatDateTime } = usePrefs();

  const sentinelRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isLoadingRef = useRef(false);

  const load = useCallback(async (pageNum: number, lvl: LogLevel | "", append: boolean, tf?: { since: number; until?: number; label?: string } | null) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setRows([]);
    }
    setError(null);
    try {
      const query: Record<string, unknown> = { page: pageNum, perPage: PER_PAGE };
      if (lvl) query.level = lvl;
      if (tf) {
        query.since = tf.since;
        if (tf.until !== undefined) query.until = tf.until;
      }
      const res = await apiClient.get<LogsResponse>("/api/core/logs", query);
      const items = res.items ?? [];
      setRows((prev) => (append ? [...prev, ...items] : items));
      setTotalPages(res.totalPages ?? 1);
      setHasMore(pageNum < (res.totalPages ?? 1));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load logs");
    } finally {
      setLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
    }
  }, []);

  const loadSummary = useCallback(async () => {
    try { setSummary(await apiGetLogsSummary()); } catch { /* */ }
  }, []);

  const loadSeries = useCallback(async (r: "24h" | "7d" | "day", date?: string) => {
    try { setSeries(await apiGetLogsTimeseries(r, date)); } catch { setSeries(null); }
  }, []);

  // Compute the effective table time filter as derived state.
  // Priority: clicked-bucket timeFilter > selectedDay > range-based filter.
  const tableFilter = useMemo<{ since: number; until?: number; label: string } | null>(() => {
    if (timeFilter) return timeFilter;
    if (selectedDay) {
      const dayStart = new Date(selectedDay + "T00:00:00Z").getTime();
      return { since: dayStart, until: dayStart + 86_400_000, label: selectedDay };
    }
    const now = Date.now();
    if (range === "24h") return { since: now - 86_400_000, label: "24h" };
    if (range === "7d") return { since: now - 7 * 86_400_000, label: "7d" };
    return null;
  }, [timeFilter, selectedDay, range]);

  // Reload table when level or tableFilter changes.
  useEffect(() => {
    setPage(1);
    isLoadingRef.current = true;
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    void load(1, level, false, tableFilter);
    void loadSummary();
  }, [level, tableFilter, load, loadSummary]);

  // Load chart data.
  useEffect(() => {
    if (selectedDay) void loadSeries("day", selectedDay);
    else void loadSeries(range);
  }, [range, selectedDay, loadSeries]);

  // Infinite scroll — observe sentinel within the scroll container.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const scrollContainer = scrollRef.current;
    if (!sentinel || !scrollContainer) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasMore && !isLoadingRef.current) {
          isLoadingRef.current = true;
          const nextPage = page + 1;
          setPage(nextPage);
          void load(nextPage, level, true, tableFilter);
        }
      },
      { root: scrollContainer, rootMargin: "120px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, page, level, tableFilter, load]);

  function resetFilters() {
    setLevel("");
    setTimeFilter(null);
    setRange("24h");
    setSelectedDay(null);
  }

  function refreshAll() {
    setPage(1);
    isLoadingRef.current = true;
    void load(1, level, false, tableFilter);
    void loadSummary();
    if (selectedDay) void loadSeries("day", selectedDay);
    else void loadSeries(range);
  }

  // Compute time range for a clicked bucket.
  function handleBucketClick(idx: number) {
    if (!buckets[idx]) return;
    const N = buckets.length;
    const now = Date.now();
    const HOUR = 3_600_000;
    const DAY = 86_400_000;

    let since: number;
    let until: number;

    if (selectedDay) {
      // Specific day — 24 hourly buckets.
      const dayStart = new Date(selectedDay + "T00:00:00Z").getTime();
      since = dayStart + idx * HOUR;
      until = since + HOUR;
    } else if (range === "7d") {
      // 7 daily buckets.
      const startOfToday = Math.floor(now / DAY) * DAY;
      since = startOfToday - (N - 1 - idx) * DAY;
      until = since + DAY;
    } else {
      // 24 hourly buckets.
      const startOfHour = Math.floor(now / HOUR) * HOUR;
      since = startOfHour - (N - 1 - idx) * HOUR;
      until = since + HOUR;
    }

    setTimeFilter({ since, until, label: buckets[idx].label });
    setHoverIdx(null);
  }

  const buckets: TimeBucket[] = series?.buckets ?? [];
  const maxCount = Math.max(1, ...buckets.map((b) => b.count));
  const maxDuration = Math.max(1, ...buckets.map((b) => b.totalDuration));
  const grandTotalDuration = buckets.reduce((sum, b) => sum + b.totalDuration, 0);

  // When a level is selected, chart shows only that level's series.
  const chartSeries = level
    ? [{
        key: level,
        color: LEVEL_META[level].colorVar,
        vals: buckets.map((b) => b[level] as number),
        max: maxCount,
      }]
    : [
        { key: "total", color: "var(--brand)", vals: buckets.map((b) => b.count), max: maxCount },
        { key: "success", color: "var(--ok)", vals: buckets.map((b) => b.count - b.error), max: maxCount },
        { key: "error", color: "var(--err)", vals: buckets.map((b) => b.error), max: maxCount },
        { key: "duration", color: "var(--brand-soft)", vals: buckets.map((b) => b.totalDuration), max: maxDuration },
      ];

  const dayOptions: { value: string; label: string }[] = (() => {
    const now = Date.now();
    const out: { value: string; label: string }[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(now - i * 86_400_000);
      out.push({
        value: d.toISOString().slice(0, 10),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      });
    }
    return out;
  })();

  const labelInterval = buckets.length > 12 ? Math.ceil(buckets.length / 8) : 1;
  const hoveredBucket = hoverIdx !== null ? buckets[hoverIdx] : null;

  return (
    <AppShell>
      <div className="flex flex-col h-screen pt-3">
        {/* ══════ TOP 40% — CHART ══════ */}
        <div className="h-[40vh] min-h-[200px] px-6 pb-2 flex-shrink-0">
          <div className="bg-surface border border-line rounded-lg h-full flex flex-col overflow-hidden">
            {/* Chart only — no header controls */}
            <div className="flex-1 flex flex-col px-4 py-3 min-h-0 relative">
              {buckets.length === 0 ? (
                <div className="flex-1 flex items-center justify-center text-[13px] text-ink-faint">
                  No data for this period.
                </div>
              ) : (
                <>
                  {/* Legend */}
                  <div className="flex items-center gap-4 mb-2 flex-shrink-0">
                    {(level
                      ? [{ label: level, color: LEVEL_META[level].colorVar }]
                      : [
                          { label: "Total", color: "var(--brand)" },
                          { label: "Success", color: "var(--ok)" },
                          { label: "Errors", color: "var(--err)" },
                          { label: "Duration", color: "var(--brand-soft)" },
                        ]
                    ).map((item) => (
                      <div key={item.label} className="flex items-center gap-1.5">
                        <div className="w-3 h-[3px] rounded-full" style={{ background: item.color }} />
                        <span className="text-[10px] text-ink-muted font-mono">{item.label}</span>
                      </div>
                    ))}
                  </div>

                  {/* Chart area */}
                  <div className="flex-1 relative min-h-0">
                    {/* Grid lines */}
                    {[0, 25, 50, 75, 100].map((pct) => (
                      <div key={pct} className="absolute left-0 right-0 border-t"
                        style={{ bottom: `${pct}%`, borderColor: "var(--line)", opacity: 0.3 }} />
                    ))}

                    {/* Stepped chart with hover/click */}
                    <SteppedChart
                      buckets={buckets}
                      series={chartSeries}
                      activeIndex={hoverIdx}
                      onHover={setHoverIdx}
                      onClick={handleBucketClick}
                    />

                    {/* Hover tooltip */}
                    {hoveredBucket && (
                      <div
                        className="absolute z-30 pointer-events-none bg-surface-2 border rounded-lg px-3 py-2 text-[11px] font-mono whitespace-nowrap shadow-2xl"
                        style={{
                          borderColor: "var(--line-strong)",
                          left: `${Math.min(Math.max(((hoverIdx! + 0.5) / buckets.length) * 100, 15), 85)}%`,
                          transform: "translateX(-50%)",
                          top: "8px",
                        }}
                      >
                        <div className="text-ink font-bold mb-1 text-[12px]">{hoveredBucket.label}</div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ background: "var(--brand)" }} />
                            <span className="text-ink-muted">{hoveredBucket.count} total</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ background: "var(--ok)" }} />
                            <span className="text-ink-muted">{hoveredBucket.count - hoveredBucket.error} success</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ background: "var(--err)" }} />
                            <span className="text-ink-muted">{hoveredBucket.error} error</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-sm" style={{ background: "var(--brand-soft)" }} />
                            <span className="text-ink-muted">{hoveredBucket.totalDuration.toLocaleString()} ms</span>
                          </div>
                        </div>
                        <div className="text-[9px] text-ink-faint mt-1.5 pt-1 border-t" style={{ borderColor: "var(--line)" }}>
                          Click to filter table
                        </div>
                      </div>
                    )}
                  </div>

                  {/* X-axis labels */}
                  <div className="flex pt-1.5 flex-shrink-0">
                    {buckets.map((b, i) => (
                      <div key={i} className="flex-1 text-center text-[9px] text-ink-faint font-mono">
                        {i % labelInterval === 0 ? b.label : ""}
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* ══════ BOTTOM 60% — TABLE ══════ */}
        <div className="flex-1 flex flex-col px-6 pb-4 min-h-0">
          {error ? (
            <div className="bg-err-bg border border-err/40 text-err rounded-lg px-4 py-3 text-[13px] font-mono">
              {error}
            </div>
          ) : (
            <div className="bg-surface border border-line rounded-lg flex flex-col overflow-hidden flex-1 min-h-0">
              {/* ── Fixed filter toolbar ── */}
              <div className="px-4 py-2 hairline-b flex items-center justify-between gap-3 flex-wrap bg-surface-2 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <select
                    value={range}
                    onChange={(e) => { setRange(e.target.value as "24h" | "7d"); setSelectedDay(null); }}
                    className="field-input text-[12px]"
                    style={{ padding: "4px 8px", width: "auto" }}
                  >
                    <option value="24h">Last 24 hours</option>
                    <option value="7d">Last 7 days</option>
                  </select>
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value as LogLevel | "")}
                    className="field-input text-[12px]"
                    style={{ padding: "4px 8px", width: "auto" }}
                  >
                    <option value="">All levels</option>
                    <option value="info">Info</option>
                    <option value="warn">Warn</option>
                    <option value="error">Error</option>
                  </select>
                  {range === "7d" && (
                    <div className="flex items-center gap-0.5">
                      {dayOptions.map((d) => (
                        <button
                          key={d.value}
                          onClick={() => setSelectedDay((p) => (p === d.value ? null : d.value))}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition ${
                            selectedDay === d.value ? "text-white" : "text-ink-muted hover:bg-surface"
                          }`}
                          style={selectedDay === d.value ? { background: "var(--brand)" } : undefined}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {timeFilter && (
                    <button
                      onClick={() => setTimeFilter(null)}
                      className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md border"
                      style={{ borderColor: "var(--brand)", background: "var(--brand-dim)", color: "var(--brand)" }}
                    >
                      {timeFilter.label}
                      <span className="text-[13px] leading-none">×</span>
                    </button>
                  )}
                  {(level || timeFilter || range !== "24h" || selectedDay) && (
                    <button
                      onClick={resetFilters}
                      className="text-[11px] text-ink-muted hover:text-err transition px-2 py-0.5 rounded-md"
                      title="Reset all filters to defaults"
                    >
                      Reset
                    </button>
                  )}
                  <button
                    onClick={refreshAll}
                    className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink transition px-2 py-0.5 rounded-md border border-line hover:border-line-strong"
                  >
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 12a9 9 0 1 1-9-9c2.5 0 4.8 1 6.5 2.6L21 8" />
                      <path d="M21 3v5h-5" />
                    </svg>
                    Refresh
                  </button>
                </div>
              </div>

              {/* ── Fixed table header ── */}
              <div className="grid grid-cols-[90px_70px_1fr_60px_70px_160px_180px] px-4 py-2 hairline-b label-mono flex-shrink-0">
                <span>Level</span>
                <span>Method</span>
                <span>Path</span>
                <span>Status</span>
                <span>Duration</span>
                <span>Request by</span>
                <span>Timestamp</span>
              </div>

              {/* ── Scrollable rows ── */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto min-h-0">
                {loading ? (
                  <div className="px-4 py-10 text-center text-ink-faint text-[13px]">Loading…</div>
                ) : rows.length === 0 ? (
                  <div className="px-4 py-10 text-center text-ink-faint text-[13px]">No log entries.</div>
                ) : (
                  rows.map((e, i) => {
                    const lvl = (e.level ?? "info") as LogLevel;
                    const status = e.status ?? 0;
                    const duration = e.durationMs ?? 0;
                    const at = e.createdAt ? formatDateTime(e.createdAt) : "";
                    const by = e.requestBy ?? "anonymous";
                    const isAnon = by === "anonymous";
                    const meta = LEVEL_META[lvl] ?? LEVEL_META.info;
                    const methodColor = METHOD_COLORS[(e.method ?? "GET").toUpperCase()] ?? "var(--ink-muted)";
                    return (
                      <div
                        key={e.id ?? i}
                        className="grid grid-cols-[90px_70px_1fr_60px_70px_160px_180px] px-4 py-2 hairline-b last:border-b-0 hover:bg-surface-2 transition-colors text-[12px] font-mono"
                      >
                        <span className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: meta.colorVar }} />
                          <span className={meta.textClass}>{lvl}</span>
                        </span>
                        <span style={{ color: methodColor }} className="font-bold">{e.method ?? ""}</span>
                        <span className="text-ink-muted truncate" title={e.path}>{e.path ?? ""}</span>
                        <span className={status >= 500 ? "text-err" : status >= 400 ? "text-warn" : "text-ink"}>{status}</span>
                        <span className="text-ink-faint">{duration}ms</span>
                        <span className={isAnon ? "text-ink-faint italic" : "text-ink-muted truncate"} title={by}>{by}</span>
                        <span className="text-ink-faint">{at}</span>
                      </div>
                    );
                  })
                )}

                {loadingMore && <div className="px-4 py-3 text-center text-ink-faint text-[12px]">Loading more…</div>}
                {!loading && !loadingMore && !hasMore && rows.length > 0 && (
                  <div className="px-4 py-3 text-center text-ink-faint text-[12px]">— End of logs —</div>
                )}
                <div ref={sentinelRef} className="h-1" />
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
