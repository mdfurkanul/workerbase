/**
 * Dummy auth — frontend-only session scaffold.
 *
 * No real backend calls. Every form submission against /login, /magic-login,
 * or /forgot-password succeeds. A real /api/auth/* integration will replace
 * this module once the visual design is locked in.
 */

const SESSION_KEY = "workerbase.session";

export interface SessionUser {
  id: string;
  email: string;
  role: "superuser" | "operator";
}

interface StoredSession {
  user: SessionUser;
  issuedAt: number;
}

/** Sign in with any credentials. Returns a fake session. */
export function signIn(email: string, _password: string): SessionUser {
  const user: SessionUser = {
    id: `usr_${Math.random().toString(36).slice(2, 12)}`,
    email: email.trim().toLowerCase(),
    role: email.toLowerCase().startsWith("admin") ? "superuser" : "operator",
  };
  persist(user);
  return user;
}

/** Magic-link flow — also creates a session immediately (dummy behaviour). */
export function completeMagicLogin(email: string): SessionUser {
  return signIn(email, "magic-link");
}

export function logout(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}

export function getCurrentUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession;
    return parsed?.user ?? null;
  } catch {
    return null;
  }
}

function persist(user: SessionUser): void {
  const session: StoredSession = { user, issuedAt: Date.now() };
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    /* ignore */
  }
}
