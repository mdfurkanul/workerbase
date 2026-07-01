import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Trash2, UserPlus } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import Modal from "@/components/Modal";
import { useAuth, isAdmin } from "@/hooks/useAuth";
import { useCollections } from "@/hooks/useCollections";
import {
  apiCreateSuperuser,
  apiDeleteUser,
  apiListUsers,
  apiUpdateUserRole,
} from "@/lib/api-superusers";
import { ApiError } from "@/lib/api-client";
import type { Superuser, SuperuserRole } from "@/lib/api-types";

const ROLES: SuperuserRole[] = ["admin", "editor", "viewer"];

function formatDate(ms?: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

export default function Users() {
  const { user: currentUser, loading } = useAuth();

  // Wait for auth to load before deciding — otherwise a momentary `null`
  // user during navigation would trip the redirect.
  if (loading) {
    return (
      <AppShell>
        <div className="flex-1 flex items-center justify-center text-ink-muted text-[13px]">
          <Loader2 size={16} className="animate-spin text-brand mr-2" /> Loading…
        </div>
      </AppShell>
    );
  }

  // Non-admins shouldn't reach this page (nav link is hidden) — but if they
  // type the URL directly, bounce them home rather than rendering a 403 wall.
  if (!isAdmin(currentUser)) {
    return <Navigate to="/" replace />;
  }

  return <UsersAdmin />;
}

function UsersAdmin() {
  const { user: currentUser } = useAuth();
  const { refresh: refreshCollections } = useCollections();
  const [users, setUsers] = useState<Superuser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite-form state.
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<SuperuserRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  // Delete-confirmation state.
  const [deleteTarget, setDeleteTarget] = useState<Superuser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiListUsers();
      setUsers(res.users ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function handleInvite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);
    setInviteMsg(null);
    setBusy(true);
    try {
      const res = await apiCreateSuperuser(email.trim(), password, role);
      void refreshCollections();
      setInviteMsg(
        `Invited ${res.user.email} as ${res.user.role}. A verification link has been generated.`,
      );
      setEmail("");
      setPassword("");
      setRole("viewer");
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setFormError(err.status === 409 ? "That email is already registered." : err.message);
      } else {
        setFormError("Network error. Is the backend running?");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleChangeRole(id: string, next: SuperuserRole) {
    try {
      await apiUpdateUserRole(id, next);
      setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, role: next } : u)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update role");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDeleteUser(deleteTarget.id);
      void refreshCollections();
      setDeleteTarget(null);
      await load();
    } catch (err) {
      if (err instanceof ApiError) {
        setDeleteError(
          err.status === 400 ? "Cannot delete this user (last admin or self)." : err.message,
        );
      } else {
        setDeleteError("Network error. Is the backend running?");
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell>
      <PageHeader breadcrumbs={[<span>Users</span>]} />

      <div className="flex-1 overflow-y-auto">
        <div className="px-6 py-4 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
          {/* Invite form */}
          <section className="bg-surface border border-line rounded p-4">
            <h2 className="font-display text-[16px] text-ink mb-1 flex items-center gap-2">
              <UserPlus size={15} /> Invite dashboard user
            </h2>
            <p className="text-[12px] text-ink-muted mb-4">
              New users default to least-privilege <code className="font-mono">viewer</code>.
            </p>

            <form onSubmit={handleInvite} className="space-y-3">
              <label className="block">
                <span className="label-mono">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="teammate@domain.com"
                  className="field-input mt-1"
                  autoComplete="email"
                />
              </label>
              <label className="block">
                <span className="label-mono">Temporary password</span>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="field-input mt-1"
                  autoComplete="new-password"
                />
              </label>
              <label className="block">
                <span className="label-mono">Role</span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as SuperuserRole)}
                  className="field-input mt-1"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </label>

              {formError && (
                <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
                  {formError}
                </div>
              )}
              {inviteMsg && (
                <div className="bg-ok-bg text-ok text-[12px] border border-line-strong rounded px-3 py-2">
                  {inviteMsg}
                </div>
              )}

              <button type="submit" disabled={busy} className="btn-primary w-full text-[12px]">
                {busy ? <Loader2 size={13} className="animate-spin" /> : <UserPlus size={13} />}
                Create user
              </button>
            </form>
          </section>

          {/* Users table */}
          <section className="bg-surface border border-line rounded">
            {error && (
              <div className="m-4 bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
                {error}
              </div>
            )}
            {loading ? (
              <div className="p-6 text-[13px] text-ink-muted flex items-center gap-2">
                <Loader2 size={14} className="animate-spin text-brand" /> Loading users…
              </div>
            ) : users.length === 0 ? (
              <div className="p-6 text-[13px] text-ink-muted">No dashboard users yet.</div>
            ) : (
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="hairline-b bg-surface-2 text-left">
                    <th className="px-3 py-2 label-mono">Email</th>
                    <th className="px-3 py-2 label-mono">Role</th>
                    <th className="px-3 py-2 label-mono">Created</th>
                    <th className="px-3 py-2 label-mono text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => {
                    const isSelf = u.id === currentUser?.id;
                    return (
                      <tr key={u.id} className="hairline-b last:border-b-0">
                        <td className="px-3 py-2.5">
                          <span className="font-mono text-ink">{u.email}</span>
                          {isSelf && (
                            <span className="ml-2 badge badge-muted">you</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleChangeRole(u.id, e.target.value as SuperuserRole)
                            }
                            className="field-input py-0.5 px-1.5 text-[12px] font-mono w-28"
                            title="Change role"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>{r}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2.5 text-ink-muted">
                          {formatDate(u.createdAt)}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <button
                            onClick={() => setDeleteTarget(u)}
                            disabled={isSelf}
                            className="btn-ghost text-[12px] border-err text-err hover:bg-err-bg disabled:opacity-30 disabled:cursor-not-allowed"
                            title={isSelf ? "You can't delete yourself" : "Delete user"}
                          >
                            <Trash2 size={12} /> Delete
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </div>
      </div>

      {/* Delete confirmation */}
      <Modal
        open={deleteTarget !== null}
        title={<>Delete <span className="font-mono">{deleteTarget?.email}</span>?</>}
        onClose={() => { setDeleteTarget(null); setDeleteError(null); }}
        footer={
          <>
            <button
              onClick={() => { setDeleteTarget(null); setDeleteError(null); }}
              className="btn-ghost"
              disabled={deleting}
            >
              Cancel
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="btn-primary"
              style={{ background: "var(--err)", color: "#fff" }}
            >
              {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
              Delete user
            </button>
          </>
        }
      >
        {deleteError ? (
          <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono mb-3">
            {deleteError}
          </div>
        ) : null}
        <p>
          This permanently removes the user's dashboard access. They will need to be re-invited
          to sign in again.
        </p>
      </Modal>
    </AppShell>
  );
}
