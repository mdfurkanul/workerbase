import { useCallback, useEffect, useState } from "react";
import type { Collection } from "@/lib/mockData";
import { applyOverrides } from "@/lib/collectionStore";
import { apiListCollections } from "@/lib/api-collections";

interface UseCollections {
  collections: Collection[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/**
 * System tables that always exist in D1 but aren't tracked in `_collections`.
 * Injected so the sidebar + collection view can navigate to them.
 */
const SYSTEM_TABLES: Collection[] = [
  {
    id: "sys__superusers",
    name: "_superusers",
    type: "user",
    count: 0,
    schema: [
      { name: "id", type: "text" },
      { name: "email", type: "text" },
      { name: "password_hash", type: "text" },
      { name: "password_salt", type: "text" },
      { name: "token_key", type: "text" },
      { name: "verified", type: "bool" },
      { name: "created_at", type: "datetime" },
      { name: "updated_at", type: "datetime" },
    ],
  },
  {
    id: "sys__externalAuths",
    name: "_externalAuths",
    type: "base",
    count: 0,
    schema: [
      { name: "id", type: "text" },
      { name: "collection_ref", type: "text" },
      { name: "record_ref", type: "text" },
      { name: "provider", type: "text" },
      { name: "provider_id", type: "text" },
      { name: "access_token", type: "text" },
      { name: "refresh_token", type: "text" },
      { name: "expires_at", type: "datetime" },
      { name: "created_at", type: "datetime" },
      { name: "updated_at", type: "datetime" },
    ],
  },
  {
    id: "sys__logs",
    name: "logs",
    type: "base",
    count: 0,
    schema: [
      { name: "id", type: "text" },
      { name: "level", type: "text" },
      { name: "method", type: "text" },
      { name: "path", type: "text" },
      { name: "status", type: "integer" },
      { name: "duration_ms", type: "integer" },
      { name: "ip", type: "text" },
      { name: "user_agent", type: "text" },
      { name: "error", type: "text" },
      { name: "created_at", type: "datetime" },
    ],
  },
];

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
    query: (raw.query ?? null) as string | null,
    list_rule: (raw.list_rule ?? null) as string | null,
    create_rule: (raw.create_rule ?? null) as string | null,
  };
}

export function useCollections(): UseCollections {
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
      const merged = applyOverrides(list);
      // Inject system tables (they exist in D1 but aren't tracked in _collections).
      const withSystem = [...merged, ...SYSTEM_TABLES];
      withSystem.sort((a, b) => a.name.localeCompare(b.name));
      setCollections(withSystem);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load collections");
      // Still show system tables even if the API fails.
      setCollections(SYSTEM_TABLES);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { collections, loading, error, refresh };
}
