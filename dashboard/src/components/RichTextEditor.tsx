import { useEffect, useRef, useState } from "react";
import {
  Bold,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  MousePointerClick,
  Redo,
  RemoveFormatting,
  Strikethrough,
  Underline,
  Undo,
} from "lucide-react";

/**
 * Minimal email-friendly rich text editor.
 *
 * Built on a contentEditable div + document.execCommand. execCommand is
 * technically deprecated but remains universally supported and outputs
 * the simple inline-tag HTML that travels well through email clients
 * (Gmail / Outlook / Apple Mail).
 *
 * No external deps — keeps the dashboard bundle small.
 *
 * The value/onChange interface mirrors a controlled textarea; the parent
 * owns the HTML string, and we only write into the contentEditable when
 * the value differs from what we'd emit on input (avoids cursor jumps).
 */

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
}

interface ToolbarBtnProps {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
}

function ToolbarBtn({ onClick, title, children, active, disabled }: ToolbarBtnProps) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        // Prevent the editor from losing the selection when the
        // toolbar button is clicked.
        e.preventDefault();
      }}
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center w-7 h-7 rounded text-ink-muted",
        "transition hover:bg-surface-2 hover:text-ink",
        "disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-muted",
        active ? "bg-surface-2 text-ink" : "",
      ].join(" ")}
    >
      {children}
    </button>
  );
}

const BTN_STYLE = { width: 14, height: 14 } as const;

function Divider() {
  return <span className="w-px h-5 bg-line-strong mx-1 inline-block" />;
}

export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 280,
}: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  // Write incoming value into the contentEditable ONLY when it differs
  // from the last value we emitted. This prevents cursor resets while
  // typing.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  function emit() {
    const el = ref.current;
    if (!el) return;
    const html = el.innerHTML;
    if (html !== value) {
      onChange(html);
    }
  }

  function exec(command: string, arg?: string) {
    // Refocus the editor in case the toolbar click stole focus.
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }

  function insertHtml(html: string) {
    ref.current?.focus();
    document.execCommand("insertHTML", false, html);
    emit();
  }

  function handleLink() {
    const url = window.prompt("Link URL");
    if (!url) return;
    exec("createLink", url);
  }

  function handleImage() {
    const url = window.prompt("Image URL");
    if (!url) return;
    exec("insertImage", url);
  }

  function handleButton() {
    const url = window.prompt("Button link URL");
    if (!url) return;
    const label = window.prompt("Button label", "Click here") || "Click here";
    insertHtml(
      `<a href="${escapeAttr(url)}" target="_blank" style="display:inline-block;padding:14px 36px;background-color:#F38020;color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;border-radius:8px;margin:8px 0;">${escapeHtml(label)}</a><p><br/></p>`,
    );
  }

  function handleClear() {
    exec("removeFormat");
  }

  const isEmpty = !value || value === "<br>" || value === "<p><br></p>";

  return (
    <div
      className={[
        "rounded border bg-surface transition",
        isFocused ? "border-[var(--brand)]" : "border-line",
      ].join(" ")}
    >
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 hairline-b bg-surface-2/40">
        <ToolbarBtn title="Bold (Ctrl+B)" onClick={() => exec("bold")}>
          <Bold style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Italic (Ctrl+I)" onClick={() => exec("italic")}>
          <Italic style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Underline (Ctrl+U)" onClick={() => exec("underline")}>
          <Underline style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Strikethrough" onClick={() => exec("strikeThrough")}>
          <Strikethrough style={BTN_STYLE} />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Heading 1" onClick={() => exec("formatBlock", "<h1>")}>
          <Heading1 style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 2" onClick={() => exec("formatBlock", "<h2>")}>
          <Heading2 style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading 3" onClick={() => exec("formatBlock", "<h3>")}>
          <Heading3 style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Paragraph" onClick={() => exec("formatBlock", "<p>")}>
          <span className="text-[11px] font-mono">¶</span>
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Bulleted list" onClick={() => exec("insertUnorderedList")}>
          <List style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => exec("insertOrderedList")}>
          <ListOrdered style={BTN_STYLE} />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Insert link" onClick={handleLink}>
          <LinkIcon style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Insert image" onClick={handleImage}>
          <ImageIcon style={BTN_STYLE} />
        </ToolbarBtn>
        <ToolbarBtn title="Insert CTA button" onClick={handleButton}>
          <MousePointerClick style={BTN_STYLE} />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn title="Clear formatting" onClick={handleClear}>
          <RemoveFormatting style={BTN_STYLE} />
        </ToolbarBtn>

        <div className="ml-auto flex items-center">
          <ToolbarBtn title="Undo" onClick={() => exec("undo")}>
            <Undo style={BTN_STYLE} />
          </ToolbarBtn>
          <ToolbarBtn title="Redo" onClick={() => exec("redo")}>
            <Redo style={BTN_STYLE} />
          </ToolbarBtn>
        </div>
      </div>

      {/* Editable area */}
      <div className="relative">
        {isEmpty && (
          <div
            className="absolute top-3 left-4 text-[13px] text-ink-faint pointer-events-none"
            style={{ minHeight: 20 }}
          >
            {placeholder ?? "Start writing…"}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={() => {
            emit();
            setIsFocused(false);
          }}
          onFocus={() => setIsFocused(true)}
          className="outline-none px-4 py-3 text-[13px] leading-relaxed text-ink prose-rte"
          style={{ minHeight }}
        />
      </div>
    </div>
  );
}

/* ── HTML escape helpers ──────────────────────────────────────────── */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;");
}
