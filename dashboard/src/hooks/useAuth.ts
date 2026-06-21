import { useCallback, useEffect, useState } from "react";
import { getCurrentUser, logout as clearSession, type SessionUser } from "@/lib/dummyAuth";

interface UseAuth {
  user: SessionUser | null;
  loading: boolean;
  setUser: (user: SessionUser | null) => void;
  logout: () => void;
}

export function useAuth(): UseAuth {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setUser(getCurrentUser());
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
  }, []);

  return { user, loading, setUser, logout };
}
