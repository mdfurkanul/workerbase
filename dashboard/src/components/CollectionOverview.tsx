import { useEffect, useMemo, useRef, useState } from "react";
import { Link2, Plus, Minus, Shield, X } from "lucide-react";
import TypeBadge from "@/components/TypeBadge";
import type { Collection } from "@/lib/types";
import { collectionTypeMeta } from "@/lib/collectionTypes";
import { useAuth, isAdmin } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onClose: () => void;
  collections: Collection[];
}

const CARD_W = 260;
const HEADER_H = 38;
const FIELD_H = 26;
const FOOTER_H = 24;

interface RelationEdge {
  from: string;
  fromField: string;
  to: string;
  toField: string;
}

/**
 * Derive FK edges by scanning every collection's schema for fields of
 * type "relation" with an `options.targetCollection`. The target's PK
 * ("id") is the implied `toField` — the dashboard doesn't yet model
 * composite targets.
 *
 * `toField` defaults to "id" because that's the only PK the backend
 * auto-creates on every collection (see renderCreateTable).
 */
function deriveRelations(
  collections: Collection[],
  visibleNames: Set<string>,
): RelationEdge[] {
  const out: RelationEdge[] = [];
  for (const c of collections) {
    if (!visibleNames.has(c.name)) continue;
    for (const f of c.schema ?? []) {
      if (f.type !== "relation") continue;
      const opts = (f as unknown as { options?: { targetCollection?: string } }).options;
      const target = opts?.targetCollection;
      if (!target || !visibleNames.has(target)) continue;
      out.push({ from: c.name, fromField: f.name, to: target, toField: "id" });
    }
  }
  return out;
}

/**
 * System tables are anything prefixed with "_" (e.g. _superusers,
 * _externalAuths) plus the "logs" table. They are already injected into
 * the `collections` prop by `useCollections`, so no synthesis is needed.
 */
function isSystem(c: { name: string }): boolean {
  return c.name.startsWith("_") || c.name === "logs";
}

interface Pt { x: number; y: number; }

export default function CollectionOverview({ open, onClose, collections }: Props) {
  const { user } = useAuth();
  const adminOnly = isAdmin(user);
  const [showSystem, setShowSystem] = useState(false);
  const [tab, setTab] = useState<"fields" | "rules">("fields");
  const [zoom, setZoom] = useState(1);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  const visible = useMemo(() => {
    const userTables = collections.filter((c) => !isSystem(c));
    if (!showSystem) return userTables;
    // System tables are part of the `collections` list (injected by
    // `useCollections`) — just include them.
    const systemTables = collections.filter((c) => isSystem(c));
    return [...userTables, ...systemTables];
  }, [collections, showSystem]);

  // Derive FK edges from live schema metadata — recomputed when the
  // visible collection set changes.
  const visibleNames = useMemo(
    () => new Set(visible.map((c) => c.name)),
    [visible],
  );
  const RELATIONS = useMemo(
    () => deriveRelations(collections, visibleNames),
    [collections, visibleNames],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col"
      style={{ background: "var(--overlay)" }}
      onClick={onClose}
    >
      <div
        className="bg-bg-elev flex-1 m-4 rounded-lg shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className="px-5 py-3 hairline-b flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="font-display italic text-xl">Collection overview</span>
            <span className="label-mono text-ink-faint">
              {visible.length} of {collections.length} shown · {RELATIONS.length} relations
            </span>
          </div>
          <div className="flex items-center gap-3">
            {adminOnly && (
              <button
                onClick={() => setShowSystem((v) => !v)}
                className={`btn-ghost text-[12px] ${showSystem ? "border-brand text-brand" : ""}`}
                title={showSystem ? "Hide system collections" : "Show system collections"}
                aria-pressed={showSystem}
              >
                <Shield size={12} />
                {showSystem ? "Hide system" : "Show system"}
              </button>
            )}
            <button onClick={onClose} className="btn-icon" aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="px-5 hairline-b flex items-center gap-1">
          <TabBtn active={tab === "fields"} onClick={() => setTab("fields")}>
            Fields and relations
          </TabBtn>
          <TabBtn active={tab === "rules"} onClick={() => setTab("rules")}>
            Rules
          </TabBtn>
        </div>

        {/* Body */}
        <div className="flex-1 relative overflow-hidden bg-bg">
          {tab === "fields" ? (
            <FieldsDiagram collections={visible} relations={RELATIONS} zoom={zoom} />
          ) : (
            <RulesList collections={visible} />
          )}

          {/* Zoom controls */}
          {tab === "fields" && (
            <div className="absolute bottom-4 right-4 flex flex-col gap-1">
              <ZoomBtn onClick={() => setZoom((z) => Math.min(1.8, z + 0.1))} title="Zoom in">
                <Plus size={14} />
              </ZoomBtn>
              <ZoomBtn onClick={() => setZoom((z) => Math.max(0.5, z - 0.1))} title="Zoom out">
                <Minus size={14} />
              </ZoomBtn>
              <ZoomBtn onClick={() => setZoom(1)} title="Reset zoom">
                <span className="font-mono text-[10px]">1:1</span>
              </ZoomBtn>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Tabs / Zoom primitives ──────────────────────────────────────── */
function TabBtn({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2.5 text-[13px] font-medium border-b-2 transition ${
        active ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function ZoomBtn({
  onClick, title, children,
}: { onClick: () => void; title: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="w-8 h-8 rounded-full bg-surface border border-line-strong text-ink hover:bg-surface-2 flex items-center justify-center shadow-lg"
    >
      {children}
    </button>
  );
}

/* ─── Fields diagram (draggable cards + relations) ────────────────── */
function FieldsDiagram({
  collections,
  relations,
  zoom,
}: {
  collections: Collection[];
  relations: RelationEdge[];
  zoom: number;
}) {
  // Initialise a deterministic grid layout; persists for the modal's lifetime.
  const [positions, setPositions] = useState<Record<string, Pt>>(() => {
    const cols = 3;
    const gapX = CARD_W + 60;
    const gapY = 320;
    const out: Record<string, Pt> = {};
    collections.forEach((c, i) => {
      out[c.name] = { x: 40 + (i % cols) * gapX, y: 40 + Math.floor(i / cols) * gapY };
    });
    return out;
  });

  // Whenever the visible set changes (e.g. toggling System), assign positions
  // to any tables that don't have one yet — appended after the existing grid
  // so nothing overlaps.
  useEffect(() => {
    setPositions((prev) => {
      const cols = 3;
      const gapX = CARD_W + 60;
      const gapY = 320;
      const existing = Object.keys(prev);
      let nextIndex = existing.length;
      let changed = false;
      const next = { ...prev };
      for (const c of collections) {
        if (!next[c.name]) {
          next[c.name] = {
            x: 40 + (nextIndex % cols) * gapX,
            y: 40 + Math.floor(nextIndex / cols) * gapY,
          };
          nextIndex++;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [collections]);

  // Drag state — captured via refs so global listeners don't churn.
  const draggingRef = useRef<{
    name: string;
    mouseX: number;
    mouseY: number;
    cardX: number;
    cardY: number;
  } | null>(null);
  const [draggingName, setDraggingName] = useState<string | null>(null);

  useEffect(() => {
    if (!draggingName) return;
    function onMove(e: MouseEvent) {
      const start = draggingRef.current;
      if (!start) return;
      const dx = (e.clientX - start.mouseX) / zoom;
      const dy = (e.clientY - start.mouseY) / zoom;
      setPositions((prev) => ({
        ...prev,
        [start.name]: { x: start.cardX + dx, y: start.cardY + dy },
      }));
    }
    function onUp() {
      draggingRef.current = null;
      setDraggingName(null);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingName, zoom]);

  function startDrag(e: React.MouseEvent, name: string) {
    e.preventDefault();
    const pos = positions[name] ?? { x: 0, y: 0 };
    draggingRef.current = {
      name,
      mouseX: e.clientX,
      mouseY: e.clientY,
      cardX: pos.x,
      cardY: pos.y,
    };
    setDraggingName(name);
  }

  // Filter relations to those whose endpoints are both visible.
  const visibleNames = new Set(collections.map((c) => c.name));
  const visibleRelations = relations.filter(
    (r) => visibleNames.has(r.from) && visibleNames.has(r.to),
  );

  // Compute canvas bounds.
  const bounds = useMemo(() => {
    let maxX = 0, maxY = 0;
    for (const name of Object.keys(positions)) {
      const p = positions[name];
      if (!p) continue;
      const card = collections.find((c) => c.name === name);
      const h = HEADER_H + (card?.schema?.length ?? 1) * FIELD_H + FOOTER_H;
      if (p.x + CARD_W > maxX) maxX = p.x + CARD_W;
      if (p.y + h > maxY) maxY = p.y + h;
    }
    return { w: maxX + 120, h: maxY + 120 };
  }, [positions, collections]);

  // Compute anchor points for each end of every relation.
  const fieldCenterY = (cardName: string, fieldName: string) => {
    const card = collections.find((c) => c.name === cardName);
    if (!card) return 0;
    const idx = (card.schema ?? []).findIndex((f) => f.name === fieldName);
    return HEADER_H + (idx >= 0 ? idx : 0) * FIELD_H + FIELD_H / 2;
  };

  if (collections.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-ink-faint text-[13px]">
        No collections to display.
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-auto">
      <div
        className="relative origin-top-left"
        style={{
          transform: `scale(${zoom})`,
          width: bounds.w,
          height: bounds.h,
        }}
      >
        {/* Relation layer — SVG behind cards */}
        <svg
          className="absolute inset-0 pointer-events-none"
          width={bounds.w}
          height={bounds.h}
        >
          <defs>
            <marker
              id="rel-arrow"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--brand)" />
            </marker>
          </defs>

          {visibleRelations.map((r, i) => {
            const from = positions[r.from];
            const to = positions[r.to];
            if (!from || !to) return null;
            const fromY = from.y + fieldCenterY(r.from, r.fromField);
            const toY = to.y + fieldCenterY(r.to, r.toField);

            // Connect right-edge of source → left-edge of target.
            const x1 = from.x + CARD_W;
            const y1 = fromY;
            const x2 = to.x;
            const y2 = toY;

            // If the target is to the left of source, flip the anchors.
            const reverse = x2 < x1;
            const sx = reverse ? from.x : x1;
            const sy = fromY;
            const tx = reverse ? to.x + CARD_W : x2;
            const ty = toY;

            const dx = Math.abs(tx - sx) * 0.5;
            const c1x = sx + (reverse ? -dx : dx);
            const c2x = tx + (reverse ? dx : -dx);

            return (
              <g key={i}>
                <path
                  d={`M ${sx} ${sy} C ${c1x} ${sy}, ${c2x} ${ty}, ${tx} ${ty}`}
                  fill="none"
                  stroke="var(--brand)"
                  strokeWidth="1.5"
                  strokeOpacity="0.55"
                  markerEnd="url(#rel-arrow)"
                />
                <circle cx={sx} cy={sy} r="3" fill="var(--brand)" />
                <circle cx={tx} cy={ty} r="3" fill="var(--brand)" />
              </g>
            );
          })}
        </svg>

        {/* Cards */}
        {collections.map((c) => (
          <CollectionCard
            key={c.id ?? c.name}
            collection={c}
            relations={visibleRelations}
            position={positions[c.name] ?? { x: 0, y: 0 }}
            onDragStart={(e) => startDrag(e, c.name)}
            dragging={draggingName === c.name}
          />
        ))}
      </div>
    </div>
  );
}

function CollectionCard({
  collection,
  relations,
  position,
  onDragStart,
  dragging,
}: {
  collection: Collection;
  relations: RelationEdge[];
  position: Pt;
  onDragStart: (e: React.MouseEvent) => void;
  dragging: boolean;
}) {
  const system = isSystem(collection);
  const fields = collection.schema ?? [];

  return (
    <div
      className="absolute select-none"
      style={{ left: position.x, top: position.y, width: CARD_W }}
    >
      <div
        className={`bg-surface border rounded shadow-md transition-shadow ${
          dragging ? "shadow-2xl border-brand" : "border-line"
        }`}
      >
        {/* Header — orange for system, surface-2 for user */}
        <header
          onMouseDown={onDragStart}
          className={`px-3 flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing ${
            system
              ? "bg-brand text-white"
              : "bg-surface-2 text-ink hairline-b"
          }`}
          style={{ height: HEADER_H }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {(() => {
              const m = collectionTypeMeta(collection.type);
              const Icon = m.Icon;
              return (
                <span className={system ? "text-white" : "text-brand"}>
                  <Icon size={13} />
                </span>
              );
            })()}
            <span className={`font-mono text-[13px] truncate ${system ? "text-white" : "text-ink"}`}>
              {collection.name}
            </span>
          </div>
          <span className={system ? "opacity-90" : ""}>
            <TypeBadge type={collection.type} />
          </span>
        </header>

        {/* Fields */}
        <ul>
          {fields.length === 0 && (
            <li className="px-3 py-2 text-[12px] text-ink-faint italic">No fields defined.</li>
          )}
          {fields.map((f) => {
            const isRel = relations.some(
              (r) =>
                (r.from === collection.name && r.fromField === f.name) ||
                (r.to === collection.name && r.toField === f.name),
            );
            return (
              <li
                key={f.name}
                className="px-3 flex items-center gap-2 text-[12px] hairline-b last:border-b-0"
                style={{ height: FIELD_H }}
              >
                <FieldTypeIcon type={f.type} />
                <span className="font-mono text-ink flex-1 truncate">{f.name}</span>
                {isRel && (
                  <Link2 size={11} className="text-brand" />
                )}
                <span className="text-[10px] uppercase tracking-widest text-ink-faint font-mono">
                  {f.type}
                </span>
              </li>
            );
          })}
        </ul>

        {/* Footer meta */}
        <footer
          className={`px-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest ${
            system ? "bg-brand-dim text-white/80" : "bg-surface-2 text-ink-faint"
          }`}
          style={{ height: FOOTER_H }}
        >
          <span>{fields.length} fields</span>
          {collection.type === "view" && collection.query && (
            <span className="inline-flex items-center gap-1" title={collection.query}>
              <Link2 size={10} /> view
            </span>
          )}
          {system && <span>system</span>}
        </footer>
      </div>
    </div>
  );
}

/** Glyph per SQLite field type. */
function FieldTypeIcon({ type }: { type: string }) {
  const cls = "w-4 text-[10px] font-mono text-center";
  if (type === "text" || type === "url" || type === "file")
    return <span className={`${cls} text-ink-muted`}>T</span>;
  if (type === "integer" || type === "real")
    return <span className={`${cls} text-brand`}>#</span>;
  if (type === "bool") return <span className={`${cls} text-ok`}>B</span>;
  if (type === "date") return <span className={`${cls} text-warn`}>D</span>;
  if (type === "blob") return <span className={`${cls} text-ink-muted`}>□</span>;
  return <span className={`${cls} text-ink-faint`}>?</span>;
}

/* ─── Rules tab ───────────────────────────────────────────────────── */
function RulesList({ collections }: { collections: Collection[] }) {
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl space-y-3">
        <p className="text-[13px] text-ink-muted">
          Per-collection API rules. Configured from each collection's{" "}
          <span className="text-ink">Settings → Permissions</span> page.
        </p>
        {collections.map((c) => {
          const system = isSystem(c);
          return (
            <div
              key={c.id ?? c.name}
              className={`bg-surface border rounded p-3 flex items-center justify-between gap-3 ${
                system ? "border-brand/50" : "border-line"
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-mono text-[13px] text-ink truncate">{c.name}</span>
                <TypeBadge type={c.type} />
                {system && <span className="badge badge-warn">SYSTEM</span>}
              </div>
              <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-ink-faint">
                <span>view: auth</span>
                <span>·</span>
                <span>list: auth</span>
                <span>·</span>
                <span>write: super</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
