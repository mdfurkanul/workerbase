import { useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Network,
  Pin,
  PinOff,
  Plus,
  Search,
  Shield,
} from "lucide-react";
import { APP_VERSION } from "@/lib/types";
import { collectionTypeMeta } from "@/lib/collectionTypes";
import { useAuth, isAdmin } from "@/hooks/useAuth";
import { useCollections } from "@/hooks/useCollections";
import { usePinnedCollections } from "@/hooks/usePinnedCollections";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import CollectionOverview from "@/components/CollectionOverview";

/* ─── Sidebar ──────────────────────────────────────────────────────── */
export function Sidebar() {
  const { collections, loading, error } = useCollections();
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const { pinned, toggle: togglePin } = usePinnedCollections();
  const [systemOpen, setSystemOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);

  // Filter by query (case-insensitive substring on name).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, query]);

  // Split into user collections (top) vs system tables (bottom group).
  // The backend tags every table with `source: "system" | "data"` based on
  // which D1 database it lives in (workerbase-system vs workerbase-data).
  const userCollections = filtered.filter((c) => c.source !== "system");
  const systemCollections = filtered.filter((c) => c.source === "system");

  const pinnedSet = new Set(pinned);
  const pinnedList = userCollections.filter((c) => pinnedSet.has(c.name));
  const restList = userCollections.filter((c) => !pinnedSet.has(c.name));

  function handleTogglePin(name: string) {
    void togglePin(name);
  }

  return (
    <aside className="w-60 shrink-0 bg-bg-elev hairline-r flex flex-col">
      {/* Header row */}
      <div className="px-3 pt-4 pb-2 flex items-center justify-between">
        <span className="label-mono">Collections</span>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setOverviewOpen(true)}
            className="btn-icon"
            title="Collection overview"
            aria-label="Collection overview"
          >
            <Network size={14} />
          </button>
          {isAdmin(user) && (
            <Link to="/collections/new" className="btn-icon" title="New collection">
              <Plus size={14} />
            </Link>
          )}
        </div>
      </div>

      {/* Filter input */}
      <div className="px-3 pb-2 shrink-0">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter collections"
            className="field-input pl-7 py-1.5 text-[12px] font-mono"
            aria-label="Filter collections"
          />
        </div>
      </div>

      {/* Unified scroll area — Collections + System together */}
      <div className="flex-1 overflow-y-auto">
      <nav className="px-2 space-y-0.5">
        {loading ? (
          <SidebarSkeleton />
        ) : error ? (
          <div className="px-2 py-3 text-[12px] text-err font-mono">
            failed to load: {error}
          </div>
        ) : userCollections.length === 0 && systemCollections.length === 0 ? (
          <div className="px-2 py-3 text-[12px] text-ink-faint">
            {query ? `No matches for "${query}".` : "No collections yet."}
          </div>
        ) : (
          <>
            {pinnedList.length > 0 && (
              <SidebarGroup label="Pinned">
                {pinnedList.map((c) => (
                  <SidebarItem
                    key={`p-${c.id ?? c.name}`}
                    to={buildCollectionUrl(c.name)}
                    label={c.name}
                    icon={<CollectionIcon type={c.type} />}
                    pinned
                    onTogglePin={() => handleTogglePin(c.name)}
                  />
                ))}
              </SidebarGroup>
            )}

            {restList.length > 0 && (
              <SidebarGroup label={pinnedList.length > 0 ? "All" : undefined}>
                {restList.map((c) => (
                  <SidebarItem
                    key={c.id ?? c.name}
                    to={buildCollectionUrl(c.name)}
                    label={c.name}
                    icon={<CollectionIcon type={c.type} />}
                    pinned={pinnedSet.has(c.name)}
                    onTogglePin={() => handleTogglePin(c.name)}
                  />
                ))}
              </SidebarGroup>
            )}
          </>
        )}
      </nav>

      {/* System — collapsible group (real system tables from the loaded list) */}
      {systemCollections.length > 0 && (
        <div className="px-3 pt-4 pb-1">
          <button
            onClick={() => setSystemOpen((v) => !v)}
            className="w-full flex items-center justify-between rounded hover:bg-surface-2 transition px-1 py-0.5 group"
            aria-expanded={systemOpen}
          >
            <span className="label-mono inline-flex items-center gap-1.5">
              {systemOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
              System
            </span>
            <span className="label-mono text-ink-faint">{systemCollections.length}</span>
          </button>
        </div>
      )}
      {systemOpen && systemCollections.length > 0 && (
        <nav className="px-2 space-y-0.5 pb-3">
          {systemCollections.map((c) => (
            <SidebarItem
              key={c.id ?? c.name}
              to={buildCollectionUrl(c.name)}
              label={c.name}
              icon={<Shield size={13} />}
            />
          ))}
        </nav>
      )}
      </div>

      {/* Collection overview modal */}
      <CollectionOverview
        open={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        collections={collections}
      />

      {/* Footer — version */}
      <div className="px-3 py-3 hairline-t shrink-0">
        <div className="flex items-center justify-between">
          <Link to="/" className="label-mono hover:text-ink transition">
            ◆ Workerbase
          </Link>
          <span className="label-mono">{APP_VERSION}</span>
        </div>
      </div>
    </aside>
  );
}

export function SidebarGroup({ label, children }: { label?: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      {label && (
        <div className="px-2 pt-2 pb-1">
          <span className="label-mono text-ink-faint">{label}</span>
        </div>
      )}
      {children}
    </div>
  );
}

export function SidebarSkeleton() {
  return (
    <div className="space-y-1 px-1">
      {Array.from({ length: 7 }).map((_, i) => (
        <div
          key={i}
          className="h-6 rounded bg-surface-2 animate-pulse"
          style={{ opacity: 1 - i * 0.1 }}
        />
      ))}
    </div>
  );
}

export function SidebarItem({
  to,
  label,
  icon,
  pinned = false,
  onTogglePin,
}: {
  to: string;
  label: string;
  icon: ReactNode;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  // NavLink matches on pathname only, which would mark every
  // /collections?... item as active. Compute the active state ourselves
  // by comparing the `collections` query param.
  const location = useLocation();
  const targetParams = new URLSearchParams(to.split("?")[1] ?? "");
  const currentParams = new URLSearchParams(location.search);
  const targetName = targetParams.get("collections");
  const currentName = currentParams.get("collections");
  const targetPath = to.split("?")[0];
  const isActive =
    location.pathname === targetPath &&
    (targetName ? targetName === currentName : !currentName);

  return (
    <NavLink
      to={to}
      title={label}
      draggable
      onDragStart={(e) => {
        // Payload used by the SQL editor drop-zone.
        e.dataTransfer.setData("application/x-workerbase-collection", label);
        e.dataTransfer.setData("text/plain", label);
        e.dataTransfer.effectAllowed = "copy";
      }}
      className={[
        "group flex items-center gap-2 px-2 py-1.5 rounded text-[13px] font-mono transition-colors duration-120",
        isActive
          ? "bg-surface-2 text-ink"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      ].join(" ")}
    >
      <span className="opacity-80">{icon}</span>
      <span className="truncate flex-1">{label}</span>
      {onTogglePin && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onTogglePin();
          }}
          title={pinned ? "Unpin" : "Pin to top"}
          aria-label={pinned ? "Unpin collection" : "Pin collection"}
          className={[
            "shrink-0 rounded p-0.5 transition",
            pinned
              ? "opacity-100 text-ink hover:text-ink"
              : "opacity-0 group-hover:opacity-100 text-ink-faint hover:text-ink",
          ].join(" ")}
        >
          {pinned ? <PinOff size={12} /> : <Pin size={12} />}
        </button>
      )}
    </NavLink>
  );
}

export function CollectionIcon({ type }: { type: "base" | "user" | "view" }) {
  const m = collectionTypeMeta(type);
  const Icon = m.Icon;
  return <Icon size={13} />;
}
