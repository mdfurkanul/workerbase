import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import Modal from "@/components/Modal";
import { useCollections } from "@/hooks/useCollections";
import {
  apiCreateToken,
  apiListTokens,
  apiRevokeToken,
  apiUpdateToken,
  type ApiTokenMeta,
  type ApiTokenScope,
} from "@/lib/api-tokens";
import { Card, Field } from "./primitives";

const SCOPE_OPTIONS: { value: ApiTokenScope; label: string; hint: string }[] = [
  { value: "read", label: "Read", hint: "GET only (list + view)" },
  { value: "write", label: "Write", hint: "Read + POST + PATCH" },
  { value: "admin", label: "Admin", hint: "Everything including DELETE" },
];

function formatDate(ms: number | null): string {
  if (ms == null) return "—";
  return new Date(ms).toLocaleString();
}

function relativeExpiry(expiresAt: number | null): string {
  if (expiresAt == null) return "never";
  const diff = expiresAt - Date.now();
  if (diff <= 0) return "expired";
  const days = Math.floor(diff / 86_400_000);
  if (days >= 1) return `${days}d left`;
  const hours = Math.floor(diff / 3_600_000);
  return `${hours}h left`;
}

interface ConfirmState {
  id: string;
  name: string;
  permanent: boolean;
}

export function ApiTokensForm() {
  const { collections } = useCollections();
  const [tokens, setTokens] = useState<ApiTokenMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [createdRaw, setCreatedRaw] = useState<{ token: string; meta: ApiTokenMeta } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setTokens(await apiListTokens());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tokens");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // User-created collections only — system tables are not addressable via
  // the public records API by name with an API token anyway.
  const collectionNames = useMemo(
    () =>
      collections
        .filter((c) => c.source !== "system" && !c.name.startsWith("_"))
        .map((c) => c.name)
        .sort(),
    [collections],
  );

  // Open the custom confirm modal instead of window.confirm.
  function requestRevoke(token: ApiTokenMeta, permanent: boolean) {
    setConfirm({ id: token.id, name: token.name, permanent });
  }

  async function executeRevoke() {
    if (!confirm) return;
    setConfirmBusy(true);
    try {
      await apiRevokeToken(confirm.id, { permanent: confirm.permanent });
      setConfirm(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Revoke failed");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleScopeChange(id: string, scopes: ApiTokenScope) {
    try {
      await apiUpdateToken(id, { scopes });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Update failed");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => setError("Could not copy to clipboard"));
  }

  return (
    <div className="space-y-6">
      <Card title="API tokens">
        <p className="text-[13px] text-ink-muted leading-relaxed">
          Personal Access Tokens (PATs) grant programmatic access to the public
          records API at <code className="font-mono text-ink">/api/collections/*</code>.
          Pass the token in the <code className="font-mono text-ink">Authorization: Bearer</code> header.
          Tokens are shown <strong>once</strong> at creation — store them safely.
        </p>

        <div className="flex items-center justify-between">
          <span className="text-[12px] text-ink-faint">
            {tokens.length} token{tokens.length === 1 ? "" : "s"}
          </span>
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="btn-primary text-[12px]"
          >
            <Plus size={13} /> New token
          </button>
        </div>

        {error && (
          <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-[12px] text-ink-faint">Loading…</div>
        ) : tokens.length === 0 ? (
          <div className="text-[12px] text-ink-faint py-6 text-center border border-dashed border-line rounded">
            No tokens yet. Create one to start using the API.
          </div>
        ) : (
          <ul className="border border-line rounded divide-y divide-line">
            {tokens.map((t) => (
              <TokenRow
                key={t.id}
                token={t}
                collectionNames={collectionNames}
                onRevoke={requestRevoke}
                onScopeChange={handleScopeChange}
              />
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateDialog
          collectionNames={collectionNames}
          onClose={() => setShowCreate(false)}
          onCreated={(token, meta) => {
            setCreatedRaw({ token, meta });
            setShowCreate(false);
            void load();
          }}
          onError={(msg) => {
            setError(msg);
            setShowCreate(false);
          }}
        />
      )}

      {createdRaw && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-surface border border-line-strong rounded-lg max-w-xl w-full p-6 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
                  <Key size={15} /> Token created
                </h3>
                <p className="text-[12px] text-ink-muted mt-0.5">
                  Copy it now — you won't see this again.
                </p>
              </div>
              <button
                onClick={() => setCreatedRaw(null)}
                className="text-ink-muted hover:text-ink"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-surface-2 border border-line rounded px-3 py-2.5 flex items-center gap-2">
              <code className="font-mono text-[12px] text-ink flex-1 break-all">
                {createdRaw.token}
              </code>
              <button
                onClick={() => copyToClipboard(createdRaw.token)}
                className="btn-ghost text-[12px] shrink-0"
              >
                {copied ? <Check size={13} className="text-ok" /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy"}
              </button>
            </div>

            <div className="text-[12px] text-ink-muted bg-warn-bg/40 border border-warn/30 rounded px-3 py-2 flex items-start gap-2">
              <AlertTriangle size={13} className="text-warn mt-0.5 shrink-0" />
              <span>
                Store this token securely. Treat it like a password — anyone with
                it can access your records API with <strong>{createdRaw.meta.scopes}</strong> scope.
              </span>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCreatedRaw(null)}
                className="btn-primary text-[12px]"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={confirm !== null}
        onClose={() => (confirmBusy ? undefined : setConfirm(null))}
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle size={15} className={confirm?.permanent ? "text-err" : "text-warn"} />
            {confirm?.permanent ? "Delete token permanently?" : "Revoke token?"}
          </span>
        }
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirm(null)}
              disabled={confirmBusy}
              className="btn-ghost text-[12px]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeRevoke}
              disabled={confirmBusy}
              className={`btn-primary text-[12px] disabled:opacity-50 ${
                confirm?.permanent
                  ? "border-err bg-err text-white hover:bg-err"
                  : "border-warn bg-warn text-white hover:bg-warn"
              }`}
            >
              {confirmBusy
                ? "Working…"
                : confirm?.permanent
                  ? "Delete forever"
                  : "Revoke"}
            </button>
          </>
        }
      >
        {confirm && (
          <div className="space-y-2">
            <p className="text-[13px] text-ink">
              {confirm.permanent ? (
                <>This will <strong>permanently remove</strong> the token</>
              ) : (
                <>This will <strong>revoke</strong> the token</>
              )}{" "}
              <code className="font-mono text-[12px] bg-surface-2 px-1.5 py-0.5 rounded">
                {confirm.name}
              </code>
              .
            </p>
            <p className="text-[12px] text-ink-muted">
              {confirm.permanent
                ? "The row is removed from the database. Any script still using this token will immediately receive 401 errors."
                : "The token stops working immediately, but its metadata stays in the list. You can hard-delete it afterwards if needed."}
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function TokenRow({
  token,
  collectionNames,
  onRevoke,
  onScopeChange,
}: {
  token: ApiTokenMeta;
  collectionNames: string[];
  onRevoke: (token: ApiTokenMeta, permanent: boolean) => void;
  onScopeChange: (id: string, scopes: ApiTokenScope) => void;
}) {
  const revoked = token.revoked_at != null;
  const expired = token.expires_at != null && token.expires_at < Date.now();
  const stale = revoked || expired;

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-mono text-[13px] text-ink">{token.name}</span>
            {revoked && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-err-bg text-err border border-err/40">
                revoked
              </span>
            )}
            {expired && !revoked && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-warn-bg text-warn border border-warn/40">
                expired
              </span>
            )}
            <span className="font-mono text-[11px] text-ink-faint">
              wbs_••••{token.prefix}…
            </span>
          </div>
          <div className="text-[11px] text-ink-faint font-mono mt-1 space-x-2">
            <span>scope: {token.scopes}</span>
            <span>·</span>
            <span>{token.collection_scope ? `only: ${token.collection_scope}` : "all collections"}</span>
            <span>·</span>
            <span>last used: {formatDate(token.last_used_at)}</span>
            <span>·</span>
            <span>expires: {relativeExpiry(token.expires_at)}</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {!stale && (
            <>
              <select
                value={token.scopes}
                onChange={(e) => onScopeChange(token.id, e.target.value as ApiTokenScope)}
                className="field-input text-[11px] font-mono py-1"
                title="Change scope"
              >
                {SCOPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onRevoke(token, false)}
                className="btn-ghost text-[11px] border-warn/60 text-warn hover:bg-warn-bg"
                title="Revoke (soft)"
              >
                Revoke
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => onRevoke(token, true)}
            className="btn-ghost text-[11px] border-err text-err hover:bg-err-bg"
            title="Delete permanently"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </li>
  );
}

function CreateDialog({
  collectionNames,
  onClose,
  onCreated,
  onError,
}: {
  collectionNames: string[];
  onClose: () => void;
  onCreated: (token: string, meta: ApiTokenMeta) => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiTokenScope>("read");
  const [useCollectionScope, setUseCollectionScope] = useState(false);
  const [collectionScope, setCollectionScope] = useState<string>("");
  const [useExpiry, setUseExpiry] = useState(false);
  const [expiresInDays, setExpiresInDays] = useState(30);
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const canCreate =
    !busy &&
    name.trim().length >= 1 &&
    name.trim().length <= 80 &&
    (!useCollectionScope || collectionScope.length > 0) &&
    (!useExpiry || (expiresInDays >= 1 && expiresInDays <= 3650));

  async function submit() {
    if (!canCreate) return;
    setBusy(true);
    setLocalError(null);
    try {
      const res = await apiCreateToken({
        name: name.trim(),
        scopes: scope,
        collectionScope: useCollectionScope ? collectionScope : null,
        expiresInDays: useExpiry ? expiresInDays : undefined,
      });
      onCreated(res.token, res.tokenMeta);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create failed";
      setLocalError(msg);
      onError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface border border-line-strong rounded-lg max-w-md w-full p-6 space-y-4">
        <div className="flex items-start justify-between">
          <h3 className="text-[15px] font-semibold text-ink flex items-center gap-2">
            <Plus size={15} /> New API token
          </h3>
          <button onClick={onClose} className="text-ink-muted hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <Field label="Name" required hint="A label to identify this token later.">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. CI runner, mobile app"
            className="field-input font-mono"
            autoFocus
          />
        </Field>

        <Field label="Scope" required>
          <div className="grid grid-cols-3 gap-2">
            {SCOPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setScope(opt.value)}
                className={`text-left px-3 py-2 rounded border transition ${
                  scope === opt.value
                    ? "border-brand bg-brand/5 text-ink"
                    : "border-line text-ink-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <div className="font-mono text-[12px]">{opt.label}</div>
                <div className="text-[10px] text-ink-faint mt-0.5">{opt.hint}</div>
              </button>
            ))}
          </div>
        </Field>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-[13px]">
            <input
              type="checkbox"
              checked={useCollectionScope}
              onChange={(e) => setUseCollectionScope(e.target.checked)}
              className="accent-[var(--brand)] w-3.5 h-3.5"
            />
            Restrict to one collection
          </label>
          {useCollectionScope && (
            <div className="mt-2">
              <select
                value={collectionScope}
                onChange={(e) => setCollectionScope(e.target.value)}
                className="field-input font-mono"
              >
                <option value="">Select a collection…</option>
                {collectionNames.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="flex items-center gap-2 cursor-pointer text-[13px]">
            <input
              type="checkbox"
              checked={useExpiry}
              onChange={(e) => setUseExpiry(e.target.checked)}
              className="accent-[var(--brand)] w-3.5 h-3.5"
            />
            Expire after N days
          </label>
          {useExpiry && (
            <div className="mt-2">
              <input
                type="number"
                min={1}
                max={3650}
                value={expiresInDays}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setExpiresInDays(isNaN(n) ? 1 : Math.max(1, Math.min(3650, n)));
                }}
                className="field-input font-mono w-32"
              />
              <span className="text-[11px] text-ink-faint ml-2">days (1–3650)</span>
            </div>
          )}
        </div>

        {localError && (
          <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
            {localError}
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={onClose} className="btn-ghost text-[12px]">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canCreate}
            className="btn-primary text-[12px] disabled:opacity-50"
          >
            {busy ? "Creating…" : "Create token"}
          </button>
        </div>
      </div>
    </div>
  );
}
