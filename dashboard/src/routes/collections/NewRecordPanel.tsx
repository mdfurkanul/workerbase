import { useState } from "react";
import { type Collection, type CollectionField } from "@/lib/types";
import { apiClient, ApiError } from "@/lib/api-client";
import { usePrefs } from "@/hooks/usePrefs";
import { RecordField } from "@/components/record-fields/RecordField";
import { GeoField, validateGeo } from "@/components/record-fields/GeoField";
import { groupFieldsForForm } from "@/components/record-fields/grouping";
import { coerceForPayload } from "@/components/record-fields/coerce";

/* ─── SlideOver panel: new record ─────────────────────────────────── */
export function NewRecordPanel({
  schema,
  collectionName,
  collectionType,
  onCreated,
  registerSave,
}: {
  schema: CollectionField[];
  collectionName: string;
  collectionType: Collection["type"];
  onCreated: () => void;
  registerSave: (fn: () => void) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { timezone } = usePrefs();

  // Filter out system / auth-managed columns. For type=user collections we
  // surface a synthetic `password` field — the backend hashes it into
  // password_hash + password_salt automatically (the raw columns are hidden).
  const PROTECTED = new Set(["id", "created", "updated", "created_at", "updated_at", "rowid", "token_key", "password_hash", "password_salt", "verified"]);
  const userFields = schema.filter((f) => !PROTECTED.has(f.name));
  const fields: CollectionField[] =
    collectionType === "user"
      ? [{ id: "_password", name: "password", type: "password", required: true }, ...userFields]
      : userFields;

  const slots = groupFieldsForForm(fields);

  async function handleSave() {
    setSubmitError(null);

    // Validate each field by type. The RecordField component reports
    // errors via onErrorChange into `errors` already; here we only block
    // on whatever is currently set.
    const errs: Record<string, string> = {};
    for (const [k, v] of Object.entries(errors)) {
      if (v) errs[k] = v;
    }

    // Geo validation runs separately because each pair has TWO inputs.
    for (const s of slots) {
      if (s.kind !== "geo") continue;
      const lat = (values[`${s.base}_latitude`] ?? "").trim();
      const lon = (values[`${s.base}_longitude`] ?? "").trim();
      const required = s.latField.required || s.lonField.required;
      if (required && lat === "" && lon === "") {
        errs[`${s.base}_latitude`] = `${s.base} is required`;
      } else {
        const g = validateGeo(lat, lon);
        if (g.lat) errs[`${s.base}_latitude`] = g.lat;
        if (g.lon) errs[`${s.base}_longitude`] = g.lon;
      }
    }

    if (Object.keys(errs).filter((k) => errs[k]).length > 0) {
      setErrors(errs);
      return;
    }

    setBusy(true);
    try {
      // Build payload — only include non-empty values.
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const v = (values[f.name] ?? "").trim();
        if (v === "") continue;
        payload[f.name] = coerceForPayload(f.type, v, timezone);
      }

      await apiClient.post(`/api/core/collections/${encodeURIComponent(collectionName)}/records`, payload);
      onCreated();
    } catch (err) {
      if (err instanceof ApiError) {
        const body = err.detail as
          | { fieldErrors?: Record<string, string>; detail?: string }
          | string
          | null;
        if (body && typeof body === "object" && body.fieldErrors) {
          setErrors(body.fieldErrors);
          const count = Object.keys(body.fieldErrors).length;
          setSubmitError(
            `${count} field${count === 1 ? "" : "s"} failed validation — see inline errors below.`,
          );
        } else {
          setErrors({});
          const detail =
            typeof body === "string"
              ? body
              : body?.detail ?? err.message;
          setSubmitError(detail || "Failed to create record");
        }
      } else {
        setErrors({});
        setSubmitError(err instanceof Error ? err.message : "Failed to create record");
      }
    } finally {
      setBusy(false);
    }
  }

  registerSave(handleSave);

  return (
    <div className="px-5 py-5 space-y-4">
      {submitError && (
        <div className="bg-err-bg text-err text-[12px] border border-line-strong rounded px-3 py-2 font-mono">
          {submitError}
        </div>
      )}
      {slots.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          This collection has no editable fields yet.
        </p>
      ) : (
        slots.map((slot) => {
          if (slot.kind === "geo") {
            const latKey = `${slot.base}_latitude`;
            const lonKey = `${slot.base}_longitude`;
            const lat = values[latKey] ?? "";
            const lon = values[lonKey] ?? "";
            const gErr = validateGeo(lat, lon);
            return (
              <GeoField
                key={`geo-${slot.base}`}
                label={slot.base}
                required={slot.latField.required || slot.lonField.required}
                lat={lat}
                lon={lon}
                onLatChange={(v) => {
                  setValues((s) => ({ ...s, [latKey]: v }));
                  setErrors((e) => ({ ...e, [latKey]: gErr.lat ?? "" }));
                  setSubmitError(null);
                }}
                onLonChange={(v) => {
                  setValues((s) => ({ ...s, [lonKey]: v }));
                  setErrors((e) => ({ ...e, [lonKey]: gErr.lon ?? "" }));
                  setSubmitError(null);
                }}
                errorLat={errors[latKey] || undefined}
                errorLon={errors[lonKey] || undefined}
              />
            );
          }
          const f = slot.field;
          return (
            <RecordField
              key={f.id ?? f.name}
              field={f}
              value={values[f.name] ?? ""}
              onChange={(v) => {
                setValues((s) => ({ ...s, [f.name]: typeof v === "string" ? v : String(v) }));
                setSubmitError(null);
              }}
              onErrorChange={(err) => {
                setErrors((e) => {
                  const next = { ...e };
                  if (err) next[f.name] = err;
                  else delete next[f.name];
                  return next;
                });
              }}
              error={errors[f.name] || undefined}
            />
          );
        })
      )}
      {busy && <p className="text-[12px] text-ink-muted">Creating…</p>}
    </div>
  );
}
