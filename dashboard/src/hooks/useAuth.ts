import { useCallback, useEffect, useState } from "react";
import { apiGetMe } from "@/lib/api-superusers";
import { getToken, clearToken } from "@/lib/api-client";
import type { Superuser } from "@/lib/api-types";

/** Extended user type with role for UI compatibility. */
export interface AuthUser extends Superuser {
  role: "superuser" | "operator";
}

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
      .then((res) => setUser({ ...res.user, role: "superuser" as const }))
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
