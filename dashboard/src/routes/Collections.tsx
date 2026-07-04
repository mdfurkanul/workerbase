import { Link } from "react-router-dom";
import { ChevronRight, Plus } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { useCollections } from "@/hooks/useCollections";
import { useAuth, isAdmin } from "@/hooks/useAuth";
import { buildCollectionUrl } from "@/lib/collectionUrl";
import { useSearchParams } from "react-router-dom";
import { CollectionView } from "./collections/CollectionView";

/**
 * Single router for every collection URL. The sub-view is chosen by
 * query params:
 *
 *   ?collections=NAME                  → records table
 *   ?collections=NAME&action=new       → new record form
 *   ?collections=NAME&action=edit      → edit schema
 *   ?collections=NAME&action=settings  → permissions
 *   ?collections=NAME&record=ID        → record detail
 */
export default function Collections() {
  const [params] = useSearchParams();
  const selected = params.get("collections");

  if (!selected) return <CollectionsIndex />;

  return <CollectionView name={selected} />;
}

/* ─── Collections index (no collection selected) ───────────────────── */
function CollectionsIndex() {
  const { collections, loading, error, refresh } = useCollections();
  const { user } = useAuth();

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[<span>Collections</span>]}
        actions={
          isAdmin(user) ? (
            <Link to="/collections/new" className="btn-primary text-[12px]">
              <Plus size={13} /> New collection
            </Link>
          ) : undefined
        }
      />
      <div className="flex-1 overflow-y-auto">
      <div className="px-6 py-4">
        {error && (
          <div className="mb-3 px-3 py-2 rounded border border-line-strong bg-err-bg text-err text-[12px] font-mono">
            {error}
          </div>
        )}
        <div className="bg-surface border border-line rounded">
          {loading ? (
            <div className="p-4 space-y-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-8 rounded bg-surface-2 animate-pulse"
                  style={{ opacity: 1 - i * 0.1 }}
                />
              ))}
            </div>
          ) : collections.length === 0 ? (
            <div className="p-8 text-center text-ink-muted text-[13px]">
              No collections yet.{" "}
              {isAdmin(user) ? (
                <Link to="/collections/new" className="text-brand hover:underline">
                  Create one →
                </Link>
              ) : (
                "Ask an admin to create one."
              )}
            </div>
          ) : (
            <ul>
              {collections.map((c) => (
                <li key={c.id ?? c.name}>
                  <Link
                    to={buildCollectionUrl(c.name)}
                    className="flex items-center justify-between px-4 py-2.5 hairline-b last:border-b-0 hover:bg-surface-2 transition"
                  >
                    <span className="font-mono text-[13px] text-ink">{c.name}</span>
                    <ChevronRight size={14} className="text-ink-faint" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button onClick={() => void refresh()} className="btn-ghost mt-3 text-[12px]">
          Refresh
        </button>
      </div>
      </div>
    </AppShell>
  );
}
