import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@/lib/mockData";
import { applyOverrides } from "@/lib/collectionStore";
import { apiListCollections } from "@/lib/api-collections";
import { apiClient } from "@/lib/api-client";

interface UseCollections {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

const MOCK_ENDPOINT = "/mock/collections.json";

export function useCollections(): UseCollections {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Try the real API first.
      const res = await apiListCollections();
      const list = Array.isArray(res.collections) ? res.collections : [];
      const merged = applyOverrides(list as unknown as Collection[]);
      merged.sort((a, b) => a.name.localeCompare(b.name));
      setCollections(merged);
    } catch {
      // Fall back to the mock JSON (so the dashboard still works without a backend).
      try {
        const data = await apiClient.get<{ collections: Collection[] }>(MOCK_ENDPOINT);
        const list = Array.isArray(data?.collections) ? data.collections : [];
        const merged = applyOverrides(list);
        merged.sort((a, b) => a.name.localeCompare(b.name));
        setCollections(merged);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        setCollections([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { collections, loading, error, refresh };
}
