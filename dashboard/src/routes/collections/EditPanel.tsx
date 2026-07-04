import { useRef, useState } from "react";
import SchemaEditor, { type SchemaData, type Field as SchemaField } from "@/components/SchemaEditor";
import AuthConfig, { DEFAULT_AUTH_SETTINGS, type AuthSettings } from "@/components/AuthConfig";
import EmailTemplatesEditor, { DEFAULT_TEMPLATES, type EmailTemplates } from "@/components/EmailTemplates";
import { type Collection } from "@/lib/mockData";
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
  const schemaData = useRef<SchemaData>({
    fields: buildEditFields(collection),
    indexes: [],
    constraints: [],
  });

  async function handleSave(): Promise<boolean | void> {
    // For view collections, persist the SQL query via PATCH.
    if (collection.type === "view") {
      const trimmed = viewQuery.trim();
      if (!trimmed) {
        setViewError("View query cannot be empty.");
        return false;
      }
      // No-op if the query hasn't changed.
      if (trimmed === (collection.query ?? "").trim()) {
        onSaved();
        return true;
      }
      setViewSaving(true);
      setViewError(null);
      try {
        await apiClient.patch(
          `/api/core/collections/${encodeURIComponent(collection.name)}`,
          { query: trimmed },
        );
        onSaved();
        return true;
      } catch (err) {
        const msg =
          err instanceof ApiError
            ? (typeof err.detail === "string"
                ? err.detail
                : (err.detail as { message?: string; error?: string } | null)?.message
                  ?? (err.detail as { error?: string } | null)?.error
                  ?? err.message)
            : err instanceof Error
              ? err.message
              : "Failed to save view query";
        setViewError(msg);
        return false;
      } finally {
        setViewSaving(false);
      }
    }
    // NOTE: schema/name edits for base/user collections are not yet persisted
    // (no PATCH coverage for column add/drop). The schema editor remains in
    // the UI as a draft view; onSaved() just closes the panel.
    onSaved();
  }

  registerSave(handleSave);

  return (
    <div className="px-5 py-5 space-y-5">
      {/* Name */}
      <section className="space-y-2">
        <span className="label-mono">Collection name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          pattern="[a-zA-Z][a-zA-Z0-9_]*"
          className="field-input font-mono"
          placeholder="collection_name"
        />
      </section>

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
