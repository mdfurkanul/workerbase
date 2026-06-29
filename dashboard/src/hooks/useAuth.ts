import { useCallback, useEffect, useState } from "react";
import { apiGetMe } from "@/lib/api-superusers";
import { getToken, clearToken } from "@/lib/api-client";
import type { Superuser, SuperuserRole } from "@/lib/api-types";

/** Authenticated user — extends Superuser with the role used for UI gating. */
export type AuthUser = Superuser;

interface UseAuth {
  user: AuthUser | null;
  loading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => void;
}

/**
 * Auth hook backed by the real API.
 * On mount, validates any stored token via GET /api/core/superusers/me.
 */
export function useAuth(): UseAuth {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    apiGetMe()
      .then((res) => setUser(res.user))
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
    // Force a full page load so every useAuth instance resets.
    window.location.href = "/login";
  }, []);

  return { user, loading, setUser, logout };
}

/* ─── Role predicates ────────────────────────────────────────────── */

/** True if the user has the `admin` role (full power). */
export function isAdmin(user: { role: SuperuserRole } | null | undefined): boolean {
  return user?.role === "admin";
}

/** True if the user may edit records (admin or editor). */
export function canEdit(user: { role: SuperuserRole } | null | undefined): boolean {
  return user?.role === "admin" || user?.role === "editor";
}

/** True if the user may manage dashboard users (admin only). */
export function canManageUsers(user: { role: SuperuserRole } | null | undefined): boolean {
  return user?.role === "admin";
}
