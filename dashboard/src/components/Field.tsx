import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  hint?: ReactNode;
  error?: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
}

/** Underline-only form field — no boxes, editorial style. */
export default function Field({ label, hint, error, onChange, onBlur, ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`field-input mt-2 ${error ? "border-err" : ""}`}
      />
      {error ? (
        <div className="mt-1.5 text-err text-[12px]">{error}</div>
      ) : hint ? (
        <div className="mt-2 text-[12px] text-ink-faint">{hint}</div>
      ) : null}
    </label>
  );
}
