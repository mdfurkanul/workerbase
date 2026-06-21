import type { InputHTMLAttributes, ReactNode } from "react";

interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> {
  label: string;
  hint?: ReactNode;
  onChange: (value: string) => void;
}

/** Underline-only form field — no boxes, editorial style. */
export default function Field({ label, hint, onChange, ...rest }: FieldProps) {
  return (
    <label className="block">
      <span className="label-mono">{label}</span>
      <input
        {...rest}
        onChange={(e) => onChange(e.target.value)}
        className="field-input mt-2"
      />
      {hint && <div className="mt-2 text-[12px] text-ink-faint">{hint}</div>}
    </label>
  );
}
