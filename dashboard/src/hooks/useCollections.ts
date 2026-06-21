import { useCallback, useEffect, useState } from "react";
import type { Collection, CollectionsResponse } from "@/lib/mockData";
import { applyOverrides } from "@/lib/collectionStore";

interface UseCollections {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * Fetch the collections index. Defaults to the bundled dummy JSON; when the
 * real backend is ready, set `VITE_COLLECTIONS_URL=/api/collections` (or a
 * full URL) and the same shape is consumed.
 */
const ENDPOINT = import.meta.env.VITE_COLLECTIONS_URL ?? "/mock/collections.json";

export function useCollections(): UseCollections {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(ENDPOINT, { headers: { Accept: "application/json" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as CollectionsResponse;
      const list = Array.isArray(data?.collections) ? data.collections : [];
      // Apply localStorage-backed overrides (deletes + edited schemas).
      const merged = applyOverrides(list);
      // Surface names alphabetically for a stable sidebar.
      merged.sort((a, b) => a.name.localeCompare(b.name));
      setCollections(merged);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setCollections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { collections, loading, error, refresh };
}
