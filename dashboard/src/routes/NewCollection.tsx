import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import AppShell, { PageHeader } from "@/components/AppShell";

type FieldType = "text" | "integer" | "real" | "blob" | "bool" | "date" | "url" | "file";
type CollType = "base" | "user" | "view";

interface Field {
  id: string;
  name: string;
  type: FieldType;
  required: boolean;
  unique: boolean;
}

const TYPES: FieldType[] = ["text", "integer", "real", "blob", "bool", "date", "url", "file"];

export default function NewCollection() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [type, setType] = useState<CollType>("base");
  const [viewQuery, setViewQuery] = useState("");
  const [fields, setFields] = useState<Field[]>([
    { id: crypto.randomUUID(), name: "title", type: "text", required: true, unique: false },
  ]);

  function addField() {
    setFields((f) => [
      ...f,
      { id: crypto.randomUUID(), name: "", type: "text", required: false, unique: false },
    ]);
  }

  function removeField(id: string) {
    setFields((f) => f.filter((x) => x.id !== id));
  }

  function patch(id: string, patch: Partial<Field>) {
    setFields((f) => f.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Dummy — just navigate to the new collection's records page.
    navigate(name ? `/collections/${name}` : "/");
  }

  return (
    <AppShell>
      <PageHeader
        breadcrumbs={[
          <Link to="/" className="hover:text-ink">Collections</Link>,
          <span>New</span>,
        ]}
      />

      <form onSubmit={handleSubmit} className="max-w-2xl px-6 py-6 space-y-6">
        <section className="space-y-3">
          <span className="label-mono">Identity</span>
          <div className="grid grid-cols-[2fr_1fr] gap-3">
            <label className="block">
              <span className="label-mono">Name</span>
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
              <span className="label-mono">Type</span>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as CollType)}
                className="field-input mt-1"
              >
                <option value="base">Base — custom schema</option>
                <option value="user">User — auth pool</option>
                <option value="view">View — SQL query</option>
              </select>
            </label>
          </div>
        </section>

        {type === "view" ? (
          <section className="space-y-2">
            <span className="label-mono">SQL query</span>
            <textarea
              required
              value={viewQuery}
              onChange={(e) => setViewQuery(e.target.value)}
              placeholder="SELECT id, title FROM posts WHERE views > 100 ORDER BY views DESC"
              rows={5}
              className="field-input font-mono text-[13px]"
            />
            <p className="text-[12px] text-ink-faint">
              Read-only single SELECT. No DDL/DML. Validated server-side.
            </p>
          </section>
        ) : (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="label-mono">
                {type === "user" ? "Profile fields (auth columns auto-added)" : "Schema"}
              </span>
              <button type="button" onClick={addField} className="btn-ghost text-[12px]">
                <Plus size={12} /> Add field
              </button>
            </div>
            <div className="space-y-2">
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="grid grid-cols-[2fr_1fr_auto_auto_auto] gap-2 items-center bg-surface border border-line rounded p-2"
                >
                  <input
                    required
                    pattern="[a-zA-Z_][a-zA-Z0-9_]*"
                    placeholder="field_name"
                    value={f.name}
                    onChange={(e) => patch(f.id, { name: e.target.value })}
                    className="field-input font-mono text-[13px]"
                  />
                  <select
                    value={f.type}
                    onChange={(e) => patch(f.id, { type: e.target.value as FieldType })}
                    className="field-input text-[13px]"
                  >
                    {TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <label className="text-[12px] text-ink-muted flex items-center gap-1 px-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.required}
                      onChange={(e) => patch(f.id, { required: e.target.checked })}
                      className="accent-brand"
                    />
                    Required
                  </label>
                  <label className="text-[12px] text-ink-muted flex items-center gap-1 px-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={f.unique}
                      onChange={(e) => patch(f.id, { unique: e.target.checked })}
                      className="accent-brand"
                    />
                    Unique
                  </label>
                  <button
                    type="button"
                    onClick={() => removeField(f.id)}
                    className="btn-icon"
                    title="Remove"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="flex items-center justify-between pt-4 hairline-t">
          <Link to="/" className="btn-ghost">
            <ArrowLeft size={14} /> Cancel
          </Link>
          <button type="submit" className="btn-primary">
            <Plus size={14} /> Create collection
          </button>
        </div>
      </form>
    </AppShell>
  );
}
