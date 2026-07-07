import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api-client";
import {
  getPinnedCollections,
  setPinnedCollectionsLocal,
} from "@/lib/collectionStore";

interface PrefsResponse {
  prefs: { pinnedCollections?: string[] };
}

/**
 * Pinned collections — backend-backed with localStorage as a fast cache.
 *
 * Strategy:
 *   1. Initialise state synchronously from localStorage so the sidebar
 *      renders instantly on first paint.
 *   2. On mount, fetch the canonical list from
 *      `GET /api/core/superusers/me/prefs`. If it differs from local,
 *      remote wins — write through to localStorage and state.
 *   3. On toggle, optimistically update local + state, then PATCH the
 *      backend. If the PATCH fails, surface the error but KEEP the
 *      optimistic state (offline-friendly; will reconcile next load).
 *
 * The backend is the source of truth across devices/browsers; localStorage
 * only buys us snappy first paint and graceful degradation when the API
 * is unreachable.
 */
export function usePinnedCollections() {
  const [pinned, setPinned] = useState<string[]>(() => getPinnedCollections());
  const [loading, setLoading] = useState(true);

  // Pull from backend on mount.
  useEffect(() => {
    let cancelled = false;
    apiClient
      .get<PrefsResponse>("/api/core/superusers/me/prefs")
      .then((res) => {
        if (cancelled) return;
        const remote = res.prefs?.pinnedCollections ?? [];
        setPinned((cur) => {
          // Only write through if remote differs — avoids unnecessary writes.
          if (sameList(cur, remote)) return cur;
          setPinnedCollectionsLocal(remote);
          return remote;
        });
      })
      .catch(() => {
        // Offline / unauthenticated — keep local cache as the working set.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function toggle(name: string): Promise<void> {
    const next = pinned.includes(name)
      ? pinned.filter((n) => n !== name)
      : [...pinned, name];

    // Optimistic update.
    setPinned(next);
    setPinnedCollectionsLocal(next);

    try {
      const res = await apiClient.patch<PrefsResponse>(
        "/api/core/superusers/me/prefs",
        { pinnedCollections: next },
      );
      // Reconcile with the server's authoritative view.
      const remote = res.prefs?.pinnedCollections ?? [];
      setPinned(remote);
      setPinnedCollectionsLocal(remote);
    } catch {
      // Leave the optimistic state in place — local cache will be the
      // source of truth until the next successful sync.
    }
  }

  return { pinned, loading, toggle };
}

function sameList(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  for (const x of b) if (!sa.has(x)) return false;
  return true;
}
