import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient } from "@/lib/api-client";
import {
  getTimezonePrefs,
  setTimezonePrefsLocal,
} from "@/lib/collectionStore";
import {
  formatDateTime as fmt,
  formatRelative as fmtRel,
  resolveTimezone,
  DATE_TIME_FORMATS,
  type DateTimeFormat,
  type DateTimePrefs,
} from "@/lib/dateTimeFormat";
import type { AppSettings } from "@/lib/api-types";

/**
 * System-wide date/time preferences.
 *
 * Source of truth: the `_settings` table (one row per key). Read via
 * `GET /api/core/settings`, written via `PATCH /api/core/settings`
 * (admin-only). Every signed-in dashboard user — admin, editor, viewer
 * — sees the SAME timezone and format. There is no per-user override.
 *
 * Storage strategy:
 *   1. Initialise state synchronously from localStorage so the first
 *      paint uses the configured zone/format, not a UTC default flash.
 *   2. On mount, fetch canonical settings from `/api/core/settings`.
 *      Remote wins — write through to localStorage and state.
 *   3. On patch (admin only), optimistically update local + state, then
 *      PATCH the backend. Reconcile with the server's response.
 */

interface PrefsContextValue {
  prefs: DateTimePrefs;
  loading: boolean;
  /** True when the caller is allowed to change system settings (admin). */
  canEdit: boolean;
  /** Optimistic patch — fires to the backend and reconciles on response. */
  patch: (next: Partial<DateTimePrefs>) => Promise<void>;
  /** Format a timestamp using the current prefs. */
  formatDateTime: (input: unknown) => string;
  /** Format a relative "X ago" string using the current prefs. */
  formatRelative: (input: unknown) => string;
  /** Convenience: resolved IANA zone or undefined for browser default. */
  timezone: string | undefined;
}

const DEFAULTS: DateTimePrefs = {
  timezone: "",
  dateTimeFormat: "iso8601",
  customDateTimePattern: "",
};

const PrefsContext = createContext<PrefsContextValue | null>(null);

interface SettingsResponse {
  settings: AppSettings;
}

/** Read the three datetime keys out of an `AppSettings` blob. */
function fromSettings(s: AppSettings | null | undefined): DateTimePrefs {
  if (!s) return DEFAULTS;
  const format = DATE_TIME_FORMATS.includes(
    (s.dateTimeFormat ?? "iso8601") as DateTimeFormat,
  )
    ? ((s.dateTimeFormat ?? "iso8601") as DateTimeFormat)
    : "iso8601";
  return {
    timezone: typeof s.timezone === "string" ? s.timezone : "",
    dateTimeFormat: format,
    customDateTimePattern:
      typeof s.customDateTimePattern === "string"
        ? s.customDateTimePattern
        : "",
  };
}

/**
 * Read localStorage cache synchronously and coerce into a well-typed
 * `DateTimePrefs`. Defends against malformed cached JSON by validating
 * each field and falling back to defaults on anything unexpected.
 */
function loadFromCache(): DateTimePrefs {
  const cached = getTimezonePrefs();
  if (!cached) return DEFAULTS;
  return fromSettings(cached as AppSettings);
}

export function PrefsProvider({ children }: { children: ReactNode }) {
  // 1. Synchronous init from localStorage — instant correct first paint.
  const [prefs, setPrefs] = useState<DateTimePrefs>(() => loadFromCache());
  const [loading, setLoading] = useState(true);
  const [canEdit, setCanEdit] = useState(false);

  // 2. Pull canonical settings from backend on mount; remote wins.
  //    Also fetch `/me` so we know whether the caller can patch.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      apiClient.get<SettingsResponse>("/api/core/settings"),
      apiClient.get<{ user: { role?: string } | null }>(
        "/api/core/superusers/me",
      ),
    ])
      .then(([settingsRes, meRes]) => {
        if (cancelled) return;
        const remote = fromSettings(settingsRes.settings);
        setPrefs((cur) => {
          if (samePrefs(cur, remote)) return cur;
          setTimezonePrefsLocal(remote);
          return remote;
        });
        setCanEdit(meRes.user?.role === "admin");
      })
      .catch(() => {
        // Offline / unauthenticated — keep the cached/local values.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 3. Optimistic patch + write-through.
  const patch = useCallback(
    async (next: Partial<DateTimePrefs>) => {
      setPrefs((cur) => {
        const merged = { ...cur, ...next };
        setTimezonePrefsLocal(merged); // mirror to localStorage immediately
        return merged;
      });
      try {
        const res = await apiClient.patch<SettingsResponse>(
          "/api/core/settings",
          next,
        );
        const remote = fromSettings(res.settings);
        setPrefs(remote);
        setTimezonePrefsLocal(remote);
      } catch {
        // Keep the optimistic local state; will reconcile on next load.
      }
    },
    [],
  );

  const formatDateTime = useCallback(
    (input: unknown) => fmt(input, prefs),
    [prefs],
  );

  const formatRelative = useCallback(
    (input: unknown) => fmtRel(input, prefs),
    [prefs],
  );

  const value = useMemo<PrefsContextValue>(
    () => ({
      prefs,
      loading,
      canEdit,
      patch,
      formatDateTime,
      formatRelative,
      timezone: resolveTimezone(prefs.timezone),
    }),
    [prefs, loading, canEdit, patch, formatDateTime, formatRelative],
  );

  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): PrefsContextValue {
  const ctx = useContext(PrefsContext);
  if (!ctx) {
    throw new Error("usePrefs must be used inside <PrefsProvider>");
  }
  return ctx;
}

/** Shallow structural compare — used to skip spurious writes. */
function samePrefs(a: DateTimePrefs, b: DateTimePrefs): boolean {
  return (
    a.timezone === b.timezone &&
    a.dateTimeFormat === b.dateTimeFormat &&
    a.customDateTimePattern === b.customDateTimePattern
  );
}
