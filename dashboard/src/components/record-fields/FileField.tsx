/**
 * File upload widgets for `file` and `files` fields.
 *
 * Uses POST /api/core/storage/upload (admin/editor only). The stored
 * record value is the R2 key string (`file`) or a JSON array of keys
 * (`files`). The parent state is a string for both, so `files` is
 * JSON-stringified here on every change.
 */

import { useRef, useState } from "react";
import { File as FileIcon, Loader2, Trash2, UploadCloud } from "lucide-react";
import { uploadFile, objectUrl, isImageKey, type UploadedFile } from "@/lib/api-storage";

interface FileFieldProps {
  value: string;
  onChange: (v: string) => void;
  multiple?: boolean;
}

export function FileField({ value, onChange, multiple }: FileFieldProps) {
  if (multiple) return <FilesFieldImpl value={value} onChange={onChange} />;
  return <SingleFileFieldImpl value={value} onChange={onChange} />;
}

function SingleFileFieldImpl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setBusy(true);
    try {
      const res = await uploadFile(files[0]!);
      onChange(res.key);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-1">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {value ? (
        <div className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5">
          <PreviewOrIcon k={value} />
          <span className="font-mono text-[12px] truncate flex-1" title={value}>{value}</span>
          <a
            href={objectUrl(value)}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-brand hover:underline"
          >
            open
          </a>
          <button
            type="button"
            title="Remove"
            onClick={() => onChange("")}
            className="btn-icon h-6 w-6"
          >
            <Trash2 size={12} className="text-err" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="w-full flex items-center justify-center gap-2 rounded border border-dashed border-line-strong bg-surface px-3 py-4 text-[12px] text-ink-muted hover:border-[var(--brand)] hover:text-ink transition"
        >
          {busy ? <Loader2 size={14} className="animate-spin text-brand" /> : <UploadCloud size={14} />}
          {busy ? "Uploading…" : "Upload a file"}
        </button>
      )}
      {err && <div className="text-err text-[12px] mt-1">{err}</div>}
    </div>
  );
}

function FilesFieldImpl({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  let keys: string[] = [];
  try {
    const parsed = value ? JSON.parse(value) : [];
    keys = Array.isArray(parsed) ? parsed.filter((k) => typeof k === "string") : [];
  } catch {
    keys = [];
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setErr(null);
    setBusy(true);
    try {
      const next: UploadedFile[] = [];
      for (const f of Array.from(files)) {
        next.push(await uploadFile(f));
      }
      onChange(JSON.stringify([...keys, ...next.map((n) => n.key)]));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  function removeAt(i: number) {
    const next = keys.slice();
    next.splice(i, 1);
    onChange(JSON.stringify(next));
  }

  return (
    <div className="mt-1 space-y-1.5">
      {keys.map((k, i) => (
        <div key={`${k}-${i}`} className="flex items-center gap-2 rounded border border-line bg-surface px-2 py-1.5">
          <PreviewOrIcon k={k} />
          <span className="font-mono text-[12px] truncate flex-1" title={k}>{k}</span>
          <a
            href={objectUrl(k)}
            target="_blank"
            rel="noreferrer"
            className="text-[12px] text-brand hover:underline"
          >
            open
          </a>
          <button
            type="button"
            title="Remove"
            onClick={() => removeAt(i)}
            className="btn-icon h-6 w-6"
          >
            <Trash2 size={12} className="text-err" />
          </button>
        </div>
      ))}
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="w-full flex items-center justify-center gap-2 rounded border border-dashed border-line-strong bg-surface px-3 py-3 text-[12px] text-ink-muted hover:border-[var(--brand)] hover:text-ink transition"
      >
        {busy ? <Loader2 size={14} className="animate-spin text-brand" /> : <UploadCloud size={14} />}
        {busy ? "Uploading…" : "Add files"}
      </button>
      {err && <div className="text-err text-[12px] mt-1">{err}</div>}
    </div>
  );
}

function PreviewOrIcon({ k }: { k: string }) {
  if (isImageKey(k)) {
    return (
      <img
        src={objectUrl(k)}
        alt=""
        className="w-7 h-7 rounded object-cover border border-line flex-shrink-0"
      />
    );
  }
  return <FileIcon size={14} className="text-ink-muted flex-shrink-0" />;
}
