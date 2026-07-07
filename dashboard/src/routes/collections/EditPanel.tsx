import { useRef, useState } from "react";
import SchemaEditor, { type SchemaData, type Field as SchemaField } from "@/components/SchemaEditor";
import AuthConfig, { DEFAULT_AUTH_SETTINGS, type AuthSettings } from "@/components/AuthConfig";
import EmailTemplatesEditor, { DEFAULT_TEMPLATES, type EmailTemplates } from "@/components/EmailTemplates";
import { type Collection } from "@/lib/types";
import { apiClient, ApiError } from "@/lib/api-client";

/* ─── SlideOver panel: edit collection (name + full schema editor) ── */

/**
 * Build the editable field list for the EditPanel.
 *
 * - Locked system fields (`id`, `created`, `updated`) get the `locked` flag.
 * - For `type="user"` collections, the backend-managed auth columns are surfaced
 *   as locked rows so users see they exist and can't add duplicates:
 *     • `email` — real column returned by backend → promoted to locked + authField.
 *     • `password` — virtual (input-only; hashed into password_hash + password_salt).
 *   Both are stripped from any future PATCH payload — the backend owns them.
 *
 * NOTE: This must be a pure function of `collection` so the `EditPanel`'s
 * `key={collection.id}` remount strategy keeps things fresh on switch.
 */
export function buildEditFields(collection: Collection): SchemaField[] {
  const baseFields: SchemaField[] = collection.schema.map((f, i) => ({
    cid: `existing_${i}`,
    name: f.name,
    type: (f.type as SchemaField["type"]) ?? "text",
    required: false,
    unique: false,
    hidden: false,
    options: {},
    locked: ["id", "created", "updated", "created_at"].includes(f.name),
    primaryKey: f.name === "id",
    auto: f.name === "created" || f.name === "updated",
  }));

  if (collection.type !== "user") return baseFields;

  const existing = new Set(baseFields.map((f) => f.name));
  const out = baseFields.map((f) =>
    f.name === "email"
      ? { ...f, locked: true, auto: true, authField: true, required: true, unique: true }
      : f,
  );

  if (!existing.has("email")) {
    out.push({
      cid: "auth_email",
      name: "email",
      type: "text",
      required: true,
      unique: true,
      hidden: false,
      options: {},
      locked: true,
      auto: true,
      authField: true,
    });
  }
  if (!existing.has("password")) {
    out.push({
      cid: "auth_password",
      name: "password",
      type: "text",
      required: true,
      unique: false,
      hidden: true,
      options: {},
      locked: true,
      auto: true,
      authField: true,
    });
  }
  return out;
}

export function EditPanel({
  collection,
  onSaved,
  registerSave,
}: {
  collection: Collection;
  onSaved: () => void;
  registerSave: (fn: () => boolean | Promise<boolean | void>) => void;
}) {
  const [name, setName] = useState(collection.name);
  const [authSettings, setAuthSettings] = useState<AuthSettings>(DEFAULT_AUTH_SETTINGS);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplates>(DEFAULT_TEMPLATES);
  const [editTab, setEditTab] = useState<"schema" | "auth" | "templates">("schema");
  // For view collections: editable SQL SELECT query.
  const [viewQuery, setViewQuery] = useState<string>(collection.query ?? "");
  const [viewSaving, setViewSaving] = useState(false);
  const [viewError, setViewError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [migrationInfo, setMigrationInfo] = useState<string | null>(null);
  const schemaData = useRef<SchemaData>({
    fields: buildEditFields(collection),
    indexes: [],
    constraints: [],
  });

  /** Build the PATCH payload shape from the current draft state. Mirrors
   *  the shape produced by NewCollection.tsx so the backend's patchBase/
   *  patchUser schemas accept it. */
  function buildPayload(): Record<string, unknown> {
    const payload: Record<string, unknown> = {};

    // Include rename only when the name actually changed.
    if (name.trim() && name !== collection.name) {
      payload.name = name.trim();
    }

    const fields = schemaData.current.fields
      .filter((f) => f.name && !f.authField)
      .flatMap((f) => {
        if (f.type === "geo") {
          const base = {
            required: f.required,
            unique: false,
            hidden: f.hidden,
            options: f.options ?? {},
          };
          return [
            { id: `${f.cid}_latitude`, name: `${f.name}_latitude`, type: "real", ...base },
            { id: `${f.cid}_longitude`, name: `${f.name}_longitude`, type: "real", ...base },
          ];
        }
        return [{
          id: f.cid,
          name: f.name,
          type: f.type,
          required: f.required,
          unique: f.unique,
          hidden: f.hidden,
          options: f.options ?? {},
          ...(f.defaultValue ? { default: f.defaultValue } : {}),
        }];
      });

    payload.schema = fields;
    payload.indexes = schemaData.current.indexes.map((i) => ({
      name: i.name,
      columns: i.columns,
      unique: i.unique,
    }));
    payload.constraints = schemaData.current.constraints.map((c) => ({
      columns: c.columns,
    }));

    if (collection.type === "user") {
      payload.authConfig = authSettings;
      payload.emailTemplates = emailTemplates;
    }

    return payload;
  }

  function formatError(err: unknown, fallback: string): string {
    if (err instanceof ApiError) {
      const detail = err.detail;
      if (typeof detail === "string") return detail;
      const obj = detail as { message?: string; error?: string; issues?: { fieldErrors?: Record<string, string[]> } } | null;
      if (obj?.message) return obj.message;
      if (obj?.error) return obj.error;
      // Zod flatten: surface the first field error.
      const fe = obj?.issues?.fieldErrors;
      if (fe) {
        const first = Object.values(fe).flat()[0];
        if (first) return first;
      }
      return err.message;
    }
    return err instanceof Error ? err.message : fallback;
  }

  async function handleSave(): Promise<boolean | void> {
    setSaveError(null);
    setMigrationInfo(null);

    // ── View collections: only the SQL query is editable ──
    if (collection.type === "view") {
      const trimmed = viewQuery.trim();
      if (!trimmed) {
        setViewError("View query cannot be empty.");
        return false;
      }
      if (trimmed === (collection.query ?? "").trim() && !name.trim()) {
        onSaved();
        return true;
      }
      setViewSaving(true);
      setViewError(null);
      try {
        const body: Record<string, unknown> = { query: trimmed };
        if (name.trim() && name !== collection.name) body.name = name.trim();
        await apiClient.patch(
          `/api/core/collections/${encodeURIComponent(collection.name)}`,
          body,
        );
        onSaved();
        return true;
      } catch (err) {
        setViewError(formatError(err, "Failed to save view"));
        return false;
      } finally {
        setViewSaving(false);
      }
    }

    // ── base / user collections ──
    setSaving(true);
    try {
      const payload = buildPayload();
      const res = await apiClient.patch<{
        migrations?: { applied: number; errors: string[] };
        renamedFrom?: string;
        name?: string;
      }>(`/api/core/collections/${encodeURIComponent(collection.name)}`, payload);

      const parts: string[] = [];
      const applied = res.migrations?.applied ?? 0;
      const errs = res.migrations?.errors ?? [];
      if (applied > 0) parts.push(`${applied} migration(s) applied`);
      if (errs.length > 0) parts.push(`${errs.length} error(s): ${errs.join("; ")}`);
      if (res.renamedFrom) parts.push(`renamed from ${res.renamedFrom}`);
      setMigrationInfo(parts.join(" · ") || "Saved");

      onSaved();
      return true;
    } catch (err) {
      setSaveError(formatError(err, "Failed to save collection"));
      return false;
    } finally {
      setSaving(false);
    }
  }

  registerSave(handleSave);

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Name */}
      <section className="space-y-2">
        <span className="label-mono">Collection name</span>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaveError(null);
          }}
          pattern="[a-zA-Z][a-zA-Z0-9_]*"
          className="field-input font-mono"
          placeholder="collection_name"
        />
        {name !== collection.name && (
          <p className="text-[11px] text-warn font-mono">
            Renaming updates the table name. Other collections that reference
            this one (relation fields or view queries) must be updated first —
            the backend refuses the rename otherwise.
          </p>
        )}
      </section>

      {/* Status banners for the base/user save flow */}
      {collection.type !== "view" && (saveError || migrationInfo || saving) && (
        <div
          className={`text-[12px] font-mono px-3 py-2 rounded border ${
            saveError
              ? "bg-err-bg text-err border-line-strong"
              : "bg-surface-2 text-ink-muted border-line"
          }`}
        >
          {saveError ?? (saving ? "Saving…" : migrationInfo)}
        </div>
      )}

      {/* View query editor (view collections only) */}
      {collection.type === "view" && (
        <section className="space-y-2">
          <span className="label-mono">SQL view query</span>
          <p className="text-[12px] text-ink-muted">
            The SELECT statement that backs this view. Editing the query here will replace the
            underlying view definition on save.
          </p>
          <textarea
            value={viewQuery}
            onChange={(e) => {
              setViewQuery(e.target.value);
              setViewError(null);
            }}
            spellCheck={false}
            rows={12}
            className="field-input font-mono text-[12px] whitespace-pre resize-y"
            placeholder="SELECT id, email, created_at FROM users WHERE verified = 1"
          />
          {viewSaving && (
            <p className="text-[12px] text-ink-muted">Saving…</p>
          )}
          {viewError && (
            <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
              {viewError}
            </div>
          )}
        </section>
      )}

      {/* Tab bar — Schema | Auth | Email templates (auth collections only) */}
      {collection.type === "user" && (
        <div className="flex items-center gap-1 hairline-b">
          <button
            type="button"
            onClick={() => setEditTab("schema")}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition ${
              editTab === "schema" ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Schema
          </button>
          <button
            type="button"
            onClick={() => setEditTab("auth")}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition ${
              editTab === "auth" ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Auth
          </button>
          <button
            type="button"
            onClick={() => setEditTab("templates")}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 transition ${
              editTab === "templates" ? "border-brand text-ink" : "border-transparent text-ink-muted hover:text-ink"
            }`}
          >
            Email templates
          </button>
        </div>
      )}

      {/* Schema editor (base collections, or the Schema tab on auth collections) */}
      {(collection.type === "base" ||
        (collection.type === "user" && editTab === "schema")) && (
        <SchemaEditor
          initialFields={schemaData.current.fields}
          initialIndexes={schemaData.current.indexes}
          initialConstraints={schemaData.current.constraints}
          onDataChange={(data) => {
            schemaData.current = data;
          }}
        />
      )}

      {/* Auth config (auth collections only) */}
      {collection.type === "user" && editTab === "auth" && (
        <AuthConfig settings={authSettings} onChange={setAuthSettings} />
      )}

      {/* Email templates (auth collections only) */}
      {collection.type === "user" && editTab === "templates" && (
        <EmailTemplatesEditor templates={emailTemplates} onChange={setEmailTemplates} />
      )}
    </div>
  );
}
