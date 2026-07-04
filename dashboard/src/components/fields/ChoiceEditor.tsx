import { useState } from "react";
import { Plus, X } from "lucide-react";

/**
 * Tag editor for the `select` field's choice list.
 * Choices are stored as a plain string array on `options.choices`.
 */
export function ChoiceEditor({
  choices,
  onChange,
}: {
  choices: string[];
  onChange: (c: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  function commit() {
    const v = draft.trim();
    if (!v) return;
    if (choices.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...choices, v]);
    setDraft("");
  }

  return (
    <div className="space-y-2">
      <span className="label-mono">Choices</span>
      <div className="flex flex-wrap gap-1.5">
        {choices.map((c) => (
          <span
            key={c}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-full bg-surface-2 border border-line text-[12px] font-mono"
          >
            {c}
            <button
              type="button"
              onClick={() => onChange(choices.filter((x) => x !== c))}
              className="text-ink-faint hover:text-err"
              aria-label={`Remove ${c}`}
            >
              <X size={11} />
            </button>
          </span>
        ))}
        {choices.length === 0 && (
          <span className="text-[12px] text-ink-faint italic">
            No choices yet — add one below.
          </span>
        )}
      </div>
      <div className="flex gap-1.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            }
          }}
          placeholder="add choice"
          className="field-input text-[13px] flex-1"
        />
        <button
          type="button"
          onClick={commit}
          className="btn-ghost text-[12px]"
        >
          <Plus size={12} /> Add
        </button>
      </div>
    </div>
  );
}
