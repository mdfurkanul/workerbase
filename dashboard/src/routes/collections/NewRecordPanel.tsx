import { useState } from "react";
import { type Collection } from "@/lib/types";
import { apiClient, ApiError } from "@/lib/api-client";
import { usePrefs } from "@/hooks/usePrefs";
import { wallClockToEpochMs } from "@/lib/dateTimeFormat";

/* ─── SlideOver panel: new record ─────────────────────────────────── */
export function NewRecordPanel({
  schema,
  collectionName,
  collectionType,
  onCreated,
  registerSave,
}: {
  schema: { name: string; type: string }[];
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
  const fields: { name: string; type: string; required?: boolean }[] =
    collectionType === "user"
      ? [{ name: "password", type: "password", required: true }, ...userFields]
      : userFields;

  async function handleSave() {
    setSubmitError(null);

    // Validate each field based on its type.
    const errs: Record<string, string> = {};
    for (const f of fields) {
      const raw = (values[f.name] ?? "").trim();
      const isRequired = f.required === true;
      if (raw === "") {
        if (isRequired) errs[f.name] = `${f.name} is required`;
        continue;
      }

      switch (f.type) {
        case "integer":
          if (!/^-?\d+$/.test(raw)) errs[f.name] = `${f.name} must be a whole number`;
          break;
        case "real":
          if (isNaN(Number(raw))) errs[f.name] = `${f.name} must be a valid number`;
          break;
        case "email":
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) errs[f.name] = `${f.name} must be a valid email address`;
          break;
        case "url":
          if (!/^https?:\/\/.+/.test(raw)) errs[f.name] = `${f.name} must be a valid URL (starting with http:// or https://)`;
          break;
        case "password":
          if (raw.length < 8) errs[f.name] = `Password must be at least 8 characters`;
          break;
        case "bool":
          if (!["true", "false", "1", "0"].includes(raw.toLowerCase())) errs[f.name] = `${f.name} must be true or false`;
          break;
      }
    }

    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});

    setBusy(true);
    try {
      // Build payload — only include non-empty values.
      const payload: Record<string, unknown> = {};
      for (const f of fields) {
        const v = (values[f.name] ?? "").trim();
        if (v !== "") {
          if (f.type === "integer") payload[f.name] = parseInt(v, 10);
          else if (f.type === "real") payload[f.name] = parseFloat(v);
          else if (f.type === "bool") payload[f.name] = v === "true" || v === "1";
          else if (f.type === "datetime") {
            // Wall-clock value typed in the user's TZ → epoch ms.
            const ms = wallClockToEpochMs(v, timezone);
            payload[f.name] = ms ?? v;
          }
          else if (f.type === "date") {
            payload[f.name] = v.slice(0, 10);
          }
          else payload[f.name] = v;
        }
      }

      await apiClient.post(`/api/core/collections/${encodeURIComponent(collectionName)}/records`, payload);
      onCreated();
    } catch (err) {
      // The backend returns { error, fieldErrors?, detail? } on validation
      // failures. ApiError already extracts `detail`; fieldErrors comes
      // through as part of the raw response body which we re-fetch here.
      if (err instanceof ApiError) {
        // err.detail is the raw body — for validation_failed it's
        // { fieldErrors: {...} }, otherwise a string detail.
        const body = err.detail as
          | { fieldErrors?: Record<string, string>; detail?: string }
          | string
          | null;
        if (body && typeof body === "object" && body.fieldErrors) {
          setErrors(body.fieldErrors);
          // Still surface a top-line summary so the user sees something
          // even if the offending field is scrolled out of view.
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
      {fields.length === 0 ? (
        <p className="text-[13px] text-ink-muted">
          This collection has no editable fields yet.
        </p>
      ) : (
        fields.map((f) => {
          const inputType =
            f.type === "integer" || f.type === "real"
              ? "number"
              : f.type === "password"
                ? "password"
                : f.type === "datetime"
                  ? "datetime-local"
                  : f.type === "date"
                    ? "date"
                    : "text";
          const requiredMark = f.required ? " *" : "";
          return (
          <label key={f.name} className="block">
            <span className="label-mono">
              {f.name}{requiredMark}{" "}
              <span className="text-ink-faint normal-case font-normal">· {f.type}</span>
            </span>
            {f.type === "bool" ? (
              <select
                value={values[f.name] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setErrors((er) => ({ ...er, [f.name]: "" }));
                  setSubmitError(null);
                }}
                className="field-input mt-1"
              >
                <option value="">— unset —</option>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input
                type={inputType}
                value={values[f.name] ?? ""}
                onChange={(e) => {
                  setValues((v) => ({ ...v, [f.name]: e.target.value }));
                  setErrors((er) => ({ ...er, [f.name]: "" }));
                  setSubmitError(null);
                }}
                placeholder={
                  f.type === "password"
                    ? "At least 8 characters"
                    : `Enter ${f.type} value`
                }
                className={`field-input mt-1 ${errors[f.name] ? "border-err" : ""}`}
              />
            )}
            {errors[f.name] && (
              <div className="text-err text-[12px] mt-1">{errors[f.name]}</div>
            )}
          </label>
          );
        })
      )}
      {busy && <p className="text-[12px] text-ink-muted">Creating…</p>}
    </div>
  );
}
