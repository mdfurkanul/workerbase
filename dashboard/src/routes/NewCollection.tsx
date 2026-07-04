import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";
import { DEFAULT_AUTH_SETTINGS, type AuthSettings } from "@/components/AuthConfig";
import EmailTemplatesEditor, { DEFAULT_TEMPLATES, type EmailTemplates } from "@/components/EmailTemplates";
import { COLLECTION_TYPES, collectionTypeMeta } from "@/lib/collectionTypes";
import type { CollectionType } from "@/lib/mockData";
import { useCollections } from "@/hooks/useCollections";
import type { IndexDef, ConstraintDef } from "@/components/fields";

import { makeSystemFields } from "./new-collection/fieldFactories";
import { useFieldEditor } from "./new-collection/useFieldEditor";
import { TabBtn } from "./new-collection/TabBtn";
import { SchemaEditorTab } from "./new-collection/SchemaEditorTab";
import { ViewQueryTab } from "./new-collection/ViewQueryTab";
import { AuthConfigTab } from "./new-collection/AuthConfigTab";
import { RulesEditor } from "./new-collection/RulesEditor";
import type { Field } from "@/components/fields";

export default function NewCollection() {
  const navigate = useNavigate();
  const { refresh: refreshCollections } = useCollections();
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionType>("base");
  const [viewQuery, setViewQuery] = useState("");
  const [fields, setFields] = useState<Field[]>(makeSystemFields);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [indexes, setIndexes] = useState<IndexDef[]>([]);
  const [constraints, setConstraints] = useState<ConstraintDef[]>([]);
  const [tab, setTab] = useState<"schema" | "auth" | "templates" | "rules">("schema");
  const [authSettings, setAuthSettings] = useState<AuthSettings>(DEFAULT_AUTH_SETTINGS);
  const [emailTemplates, setEmailTemplates] = useState<EmailTemplates>(DEFAULT_TEMPLATES);
  const [perms, setPerms] = useState<Record<string, string>>({
    view: "authenticated",
    list: "authenticated",
    read: "authenticated",
    write: "superuser",
    delete: "superuser",
  });

  const ops = useFieldEditor({
    fields,
    setFields,
    expanded,
    setExpanded,
    setType,
    indexes,
    setIndexes,
    constraints,
    setConstraints,
  });

  /* ─── Submit ────────────────────────────────────────────────────── */
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitError(null);

    // Build the payload matching the backend's expected shape.
    const payload: Record<string, unknown> = {
      name,
      type,
      listRule: perms.list ?? "authenticated",
      viewRule: perms.view ?? "authenticated",
      createRule: perms.write ?? "superuser",
      updateRule: perms.write ?? "superuser",
      deleteRule: perms.delete ?? "superuser",
    };

    if (type === "view") {
      payload.query = viewQuery;
    } else {
      // Map the internal Field type to the backend's FieldDefinition shape.
      // Auth fields (email, password) are visual-only — backend auto-injects them.
      // Geo fields expand to two real columns: `<name>_lat` and `<name>_lng`.
      payload.schema = fields
        .filter((f) => f.name && !f.authField)
        .flatMap((f) => {
          if (f.type === "geo") {
            const base = {
              required: f.required,
              unique: false,
              hidden: f.hidden,
              options: {},
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
            options: f.options,
            ...(f.defaultValue ? { default: f.defaultValue } : {}),
          }];
        });
      payload.indexes = indexes.map((i) => ({
        name: i.name,
        columns: i.columns,
        unique: i.unique,
      }));
      payload.constraints = constraints.map((c) => ({ columns: c.columns }));
    }

    if (type === "user") {
      payload.authConfig = authSettings;
      payload.emailTemplates = emailTemplates;
    }

    setSubmitting(true);
    try {
      const { apiClient } = await import("@/lib/api-client");
      await apiClient.post(`/api/core/collections`, payload);
      await refreshCollections();
      navigate(name ? `/collections?collections=${encodeURIComponent(name)}` : "/collections");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create collection";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const fieldNames = fields.map((f) => f.name).filter(Boolean);

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          <Link to="/collections" className="hover:text-ink">Collections</Link>,
          <span>New</span>,
        ]}
      />

      <div className="flex-1 overflow-y-auto">
        <form onSubmit={handleSubmit} className="max-w-3xl px-6 py-6 space-y-6">
          {/* Identity — name + type on the same row */}
          <section className="space-y-3">
            <span className="label-mono">Identity</span>
            <div className="grid grid-cols-[2fr_1fr] gap-3">
              <label className="block">
                <span className="label-mono">
                  Name <span className="text-err">*</span>
                </span>
                <input
                  required
                  pattern="[a-zA-Z][a-zA-Z0-9_]*"
                  title="Alphanumeric + underscore, leading letter"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="posts"
                  className="field-input mt-1 font-mono"
                />
              </label>
              <label className="block">
                <span className="label-mono">
                  Type <span className="text-err">*</span>
                </span>
                <select
                  value={type}
                  onChange={(e) => ops.handleTypeChange(e.target.value as CollectionType)}
                  className="field-input mt-1"
                >
                  {COLLECTION_TYPES.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[12px] text-ink-faint">
              {collectionTypeMeta(type).description}
            </p>
          </section>

          {/* Tab bar */}
          <div className="flex items-center gap-1 hairline-b">
            <TabBtn active={tab === "schema"} onClick={() => setTab("schema")}>
              Schema
            </TabBtn>
            {type === "user" && (
              <TabBtn active={tab === "auth"} onClick={() => setTab("auth")}>
                Auth
              </TabBtn>
            )}
            {type === "user" && (
              <TabBtn active={tab === "templates"} onClick={() => setTab("templates")}>
                Email templates
              </TabBtn>
            )}
            <TabBtn active={tab === "rules"} onClick={() => setTab("rules")}>
              API rules
            </TabBtn>
          </div>

          {tab === "schema" && (type === "view" ? (
            <ViewQueryTab viewQuery={viewQuery} setViewQuery={setViewQuery} />
          ) : (
            <SchemaEditorTab
              type={type}
              fields={fields}
              expanded={expanded}
              setExpanded={setExpanded}
              indexes={indexes}
              constraints={constraints}
              fieldNames={fieldNames}
              ops={ops}
            />
          ))} {/* end schema tab */}

          {tab === "auth" && type === "user" && (
            <AuthConfigTab settings={authSettings} onChange={setAuthSettings} />
          )}

          {tab === "templates" && type === "user" && (
            <EmailTemplatesEditor templates={emailTemplates} onChange={setEmailTemplates} />
          )}

          {tab === "rules" && (
            <RulesEditor perms={perms} onChange={setPerms} collectionType={type} />
          )}

          {submitError && (
            <div className="px-3 py-2 rounded bg-err-bg text-err text-[12px] font-mono border border-line-strong">
              {submitError}
            </div>
          )}

          <div className="flex items-center justify-between pt-4 hairline-t">
            <Link to="/collections" className="btn-ghost">
              ← Cancel
            </Link>
            <button type="submit" disabled={submitting} className="btn-primary">
              {submitting ? "Creating…" : (<><Plus size={14} /> Create {collectionTypeMeta(type).label.replace(" Collection", "")}</>)}
            </button>
          </div>
        </form>
      </div>
    </AppShell>
  );
}
