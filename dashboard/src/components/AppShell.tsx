import { useMemo, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import {
  ChevronDown,
  ChevronRight,
  Code2,
  FileText,
  Network,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Settings as SettingsIcon,
  Shield,
  Terminal,
  User,
  X,
} from "lucide-react";
import { SYSTEM_LINKS, APP_VERSION } from "@/lib/mockData";
import type { Collection } from "@/lib/mockData";
import { collectionTypeMeta } from "@/lib/collectionTypes";
import { useAuth } from "@/hooks/useAuth";
import { useCollections } from "@/hooks/useCollections";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import { getPinnedCollections, togglePinned } from "@/lib/collectionStore";
import ThemeToggle from "@/components/ThemeToggle";
import CollectionOverview from "@/components/CollectionOverview";

/**
 * Dashboard chrome — orange top bar + optional Collections sidebar.
 * Pass `hideSidebar` for routes (e.g. Settings) that ship their own
 * sub-sidebar.
 */
export default function AppShell({
  children,
  hideSidebar = false,
}: {
  children: ReactNode;
  hideSidebar?: boolean;
}) {
  return (
    <div className="h-screen overflow-hidden flex flex-col bg-bg text-ink">
      <TopBar />
      <div className="flex-1 flex min-h-0">
        {!hideSidebar && <Sidebar />}
        <main className="flex-1 min-w-0 flex flex-col min-h-0">
          {children}
        </main>
      </div>
    </div>
  );
}

/* ─── Top bar ──────────────────────────────────────────────────────── */
function TopBar() {
  const { user, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  const navItem = (to: string, label: string, icon: ReactNode) => {
    const active = location.pathname.startsWith(to);
    return (
      <Link
        to={to}
        className={`inline-flex items-center gap-1.5 px-3 py-1 rounded text-[13px] font-medium transition ${
          active
            ? "bg-white/15 text-white"
            : "text-white/85 hover:text-white hover:bg-white/10"
        }`}
      >
        {icon}
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <header className="bg-brand text-white">
      <div className="px-4 h-11 flex items-center justify-between gap-4">
        {/* Left — brand + nav */}
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-2 font-semibold tracking-tight">
            <CloudflareMark />
            <span>Workerbase</span>
            <span className="ml-1 text-[10px] font-mono uppercase tracking-widest bg-white/20 px-1.5 py-0.5 rounded">
              beta
            </span>
          </Link>
          <nav className="hidden sm:flex items-center gap-1">
            {navItem("/api-preview", "API", <Code2 size={14} />)}
            {navItem("/logs", "Logs", <Terminal size={14} />)}
            {navItem("/sql", "SQL", <FileText size={14} />)}
            {navItem("/settings", "Settings", <SettingsIcon size={14} />)}
          </nav>
        </div>

        {/* Right — refresh, theme, user */}
        <div className="flex items-center gap-2">
          <button
            className="p-1.5 rounded hover:bg-white/15 transition"
            title="Refresh"
            onClick={() => window.location.reload()}
          >
            <RefreshCw size={14} />
          </button>
          <ThemeToggle inverted />
          <div className="relative">
            <button
              onClick={() => setMenuOpen((o) => !o)}
              className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/15 transition text-[13px]"
            >
              <span className="w-6 h-6 rounded-full bg-white/25 flex items-center justify-center">
                <User size={13} />
              </span>
              <span className="hidden sm:inline max-w-[180px] truncate">{user?.email}</span>
              <ChevronDown size={14} />
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 mt-1 w-52 bg-surface border border-line-strong rounded-md shadow-2xl z-40 py-1 text-ink">
                  <div className="px-3 py-2 hairline-b">
                    <div className="text-[12px] text-ink-muted">Signed in as</div>
                    <div className="text-[13px] truncate">{user?.email}</div>
                    <div className="label-mono mt-1">
                      {user?.role === "superuser" ? "Superuser" : "Operator"}
                    </div>
                  </div>
                  <Link
                    to="/settings"
                    onClick={() => setMenuOpen(false)}
                    className="block px-3 py-2 text-[13px] hover:bg-surface-2"
                  >
                    Settings
                  </Link>
                  <button
                    onClick={logout}
                    className="w-full text-left px-3 py-2 text-[13px] hover:bg-surface-2 border-t border-line"
                  >
                    Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

function CloudflareMark() {
  return (
    <svg viewBox="0 0 308 308" className="w-5 h-5" aria-hidden>
      <path
        fill="currentColor"
        d="M231.06 196.18c2.73-9.86 1.7-18.86-2.7-25.6-3.97-6.06-10.6-9.55-18.78-10.05l-152.7-1.97a3.7 3.7 0 0 1-2.92-1.48 4.16 4.16 0 0 1-.5-3.4c.7-3.18 4.4-5.46 8.16-5.46l154.2-1.97c18.27-.84 38.06-15.66 44.97-33.66l8.78-22.86a5.32 5.32 0 0 0 .25-3.05c-9.86-44.74-49.46-78.18-97.05-78.18-43.86 0-81.16 28.4-94.4 67.92-8.6-6.46-21.78-8.34-34.46-6.6-11.7 1.6-21.27 8.96-25.34 19.96 13.43 4.04 23.74 13.66 27.5 26.94-2.07 1.46-3.86 3.2-5.34 5.18C20.9 132.6 19.74 156 28.32 178.06c1.1 2.78 2.32 5.46 3.7 8.06a51.7 51.7 0 0 1 31.4-13.34h140.32c8.92 0 16.46 7.18 16.46 16.1l-.04 7.3z"
      />
    </svg>
  );
}

/* ─── Sidebar ──────────────────────────────────────────────────────── */
function Sidebar() {
  const { collections, loading, error } = useCollections();
  const [query, setQuery] = useState("");
  const [pinned, setPinned] = useState<string[]>(() => getPinnedCollections());
  const [systemOpen, setSystemOpen] = useState(true);
  const [overviewOpen, setOverviewOpen] = useState(false);

  // Filter by query (case-insensitive substring on name).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return collections;
    return collections.filter((c) => c.name.toLowerCase().includes(q));
  }, [collections, query]);

  // Split into user collections (top) vs system tables (bottom group).
  const SYSTEM_NAMES = new Set(SYSTEM_LINKS.map((s) => s.name));
  const isSystemName = (name: string) => name.startsWith("_") || SYSTEM_NAMES.has(name) || name === "logs";

  const userCollections = filtered.filter((c) => !isSystemName(c.name));
  const systemCollections = filtered.filter((c) => isSystemName(c.name));

  const pinnedSet = new Set(pinned);
  const pinnedList = userCollections.filter((c) => pinnedSet.has(c.name));
  const restList = userCollections.filter((c) => !pinnedSet.has(c.name));

  function handleTogglePin(name: string) {
    setPinned(togglePinned(name));
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
          <Link to="/collections/new" className="btn-icon" title="New collection">
            <Plus size={14} />
          </Link>
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

function SidebarGroup({ label, children }: { label?: string; children: ReactNode }) {
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

function SidebarSkeleton() {
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

function SidebarItem({
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

function CollectionIcon({ type }: { type: "base" | "user" | "view" }) {
  const m = collectionTypeMeta(type);
  const Icon = m.Icon;
  return <Icon size={13} />;
}

/* ─── Page header ──────────────────────────────────────────────────── */
export function PageHeader({
  breadcrumbs,
  actions,
}: {
  breadcrumbs: ReactNode[];
  actions?: ReactNode;
}) {
  return (
    <div className="px-6 py-3 hairline-b flex items-center justify-between gap-4 bg-bg-elev">
      <nav className="flex items-center gap-2 text-[14px] min-w-0">
        {breadcrumbs.map((b, i) => (
          <span key={i} className="flex items-center gap-2 min-w-0">
            {i > 0 && <span className="text-ink-faint">/</span>}
            <span className={i === breadcrumbs.length - 1 ? "text-ink truncate" : "text-ink-muted truncate"}>{b}</span>
          </span>
        ))}
      </nav>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

/* ─── Empty-state placeholder ──────────────────────────────────────── */
export function EmptyState({
  icon,
  title,
  hint,
}: {
  icon: ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-12 h-12 rounded-full bg-surface-2 flex items-center justify-center text-ink-muted mb-3">
        {icon}
      </div>
      <h3 className="text-[15px] font-medium text-ink">{title}</h3>
      {hint && <p className="text-[13px] text-ink-muted mt-1 max-w-sm">{hint}</p>}
    </div>
  );
}

/* re-export for convenience */
export { FileText };
