import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Collection } from "@/lib/types";
import { apiListCollections } from "@/lib/api-collections";

interface UseCollections {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Parse JSON string fields from D1 into real objects/arrays.
 * D1 stores JSON as TEXT — the API returns them as strings.
 */
function tryParse<T>(val: unknown, fallback: T): T {
  if (val == null) return fallback;
  if (typeof val === "string") {
    try { return JSON.parse(val) as T; } catch { return fallback; }
  }
  return val as T;
}

function normalizeCollection(raw: Record<string, unknown>): Collection {
  return {
    id: (raw.id ?? raw.name) as string,
    name: raw.name as string,
    type: (raw.type ?? "base") as Collection["type"],
    count: (raw.count ?? 0) as number,
    schema: tryParse<Collection["schema"]>(raw.schema, []),
    source: (raw.source === "system" ? "system" : "data") as Collection["source"],
    query: (raw.query ?? null) as string | null,
    list_rule: (raw.list_rule ?? null) as string | null,
    create_rule: (raw.create_rule ?? null) as string | null,
    idType: (raw.idType ?? raw.id_type ?? "uuid") as Collection["idType"],
    idStart: (raw.idStart ?? raw.id_start ?? null) as Collection["idStart"],
  };
}

/* ───────────────────────────────────────────────────────────────────
 *  Shared collections state via React Context.
 *
 *  Previously every component calling `useCollections()` got its own
 *  independent state — so the sidebar wouldn't update when a collection
 *  was created/deleted from another component. The provider below holds
 *  a SINGLE source of truth; any `refresh()` call propagates to all
 *  consumers.
 * ─────────────────────────────────────────────────────────────────── */

const CollectionsContext = createContext<UseCollections | null>(null);

export function CollectionsProvider({ children }: { children: ReactNode }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiListCollections();
      const rawList = Array.isArray(res.collections) ? res.collections : [];
      const list = rawList.map((r) => normalizeCollection(r as unknown as Record<string, unknown>));
      list.sort((a, b) => a.name.localeCompare(b.name));
      setCollections(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collections");
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo<UseCollections>(
    () => ({ collections, loading, error, refresh }),
    [collections, loading, error, refresh],
  );

  return (
    <CollectionsContext.Provider value={value}>
      {children}
    </CollectionsContext.Provider>
  );
}

export function useCollections(): UseCollections {
  const ctx = useContext(CollectionsContext);
  if (!ctx) {
    throw new Error("useCollections must be used within a <CollectionsProvider>");
  }
  return ctx;
}
