/**
 * Minimal SVG charts — no deps, theme-token aware, ~120 LOC total.
 */

interface LineChartProps {
  /** Series values (numbers). Will be normalised to the chart height. */
  data: number[];
  /** Optional labels for the x-axis ticks. */
  labels?: string[];
  height?: number;
  /** Optional second series to overlay (e.g. errors over requests). */
  overlay?: number[];
}

/** Smooth line chart with optional overlay series + light gridlines. */
export function LineChart({ data, labels, height = 140, overlay }: LineChartProps) {
  const width = 600;
  const pad = 8;
  const max = Math.max(1, ...data, ...(overlay ?? []));
  const points = (series: number[]) =>
    series
      .map((v, i) => {
        const x = pad + (i * (width - pad * 2)) / Math.max(1, series.length - 1);
        const y = height - pad - (v / max) * (height - pad * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none" role="img">
      {/* horizontal gridlines */}
      {[0.25, 0.5, 0.75].map((g) => (
        <line
          key={g}
          x1={pad}
          x2={width - pad}
          y1={height - pad - g * (height - pad * 2)}
          y2={height - pad - g * (height - pad * 2)}
          stroke="var(--line)"
          strokeDasharray="2 4"
          strokeWidth="1"
        />
      ))}

      {overlay && overlay.length > 0 && (
        <polyline
          points={points(overlay)}
          fill="none"
          stroke="var(--err)"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
      <polyline
        points={points(data)}
        fill="none"
        stroke="var(--brand)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {labels && (
        <g>
          {labels.map((label, i) => {
            const x = pad + (i * (width - pad * 2)) / Math.max(1, labels.length - 1);
            return (
              <text
                key={i}
                x={x}
                y={height - 1}
                textAnchor={i === 0 ? "start" : i === labels.length - 1 ? "end" : "middle"}
                fontSize="9"
                fontFamily="var(--font-mono)"
                fill="var(--ink-faint)"
              >
                {label}
              </text>
            );
          })}
        </g>
      )}
    </svg>
  );
}

interface BarChartProps {
  /** [{ label, value, color? }] */
  data: { label: string; value: number; color?: string }[];
  height?: number;
}

/** Horizontal bar chart — each bar is a labelled row. */
export function BarChart({ data, height }: BarChartProps) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="space-y-2" style={{ minHeight: height }}>
      {data.map((d) => {
        const pct = (d.value / max) * 100;
        return (
          <div key={d.label} className="grid grid-cols-[100px_1fr_auto] items-center gap-3 text-[12px]">
            <span className="font-mono text-ink-muted truncate">{d.label}</span>
            <div className="h-3 rounded bg-surface-2 overflow-hidden">
              <div
                className="h-full rounded"
                style={{ width: `${pct}%`, background: d.color ?? "var(--brand)" }}
              />
            </div>
            <span className="font-mono text-ink w-10 text-right">{d.value}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Donut chart for status-code share. */
export function Donut({
  data,
  size = 120,
  thickness = 14,
}: {
  data: { label: string; value: number; color: string }[];
  size?: number;
  thickness?: number;
}) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;

  return (
    <div className="flex items-center gap-4">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <g transform={`translate(${size / 2}, ${size / 2}) rotate(-90)`}>
          <circle
            r={r}
            fill="none"
            stroke="var(--surface-2)"
            strokeWidth={thickness}
          />
          {data.map((d) => {
            const frac = d.value / total;
            const dash = frac * c;
            const seg = (
              <circle
                key={d.label}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-offset}
              />
            );
            offset += dash;
            return seg;
          })}
          <text
            x="0"
            y="0"
            textAnchor="middle"
            dominantBaseline="central"
            transform="rotate(90)"
            fontFamily="var(--font-mono)"
            fontSize="14"
            fill="var(--ink)"
          >
            {total}
          </text>
        </g>
      </svg>
      <ul className="space-y-1 text-[12px]">
        {data.map((d) => (
          <li key={d.label} className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm shrink-0"
              style={{ background: d.color }}
            />
            <span className="font-mono text-ink-muted">{d.label}</span>
            <span className="ml-auto font-mono text-ink">
              {d.value}
              <span className="text-ink-faint ml-1">
                ({Math.round((d.value / total) * 100)}%)
              </span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
