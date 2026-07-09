/**
 * Rich text editor for `editor` fields, built on TipTap.
 *
 * Outputs HTML. Reads HTML from the parent (controlled). The toolbar is
 * minimal (bold / italic / heading / link / lists / undo) on purpose to
 * stay tight against the Worker 1MB budget.
 */

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import { useEffect } from "react";
import { Bold, Heading2, Italic, Link as LinkIcon, List, ListOrdered, Redo, Undo } from "lucide-react";

interface EditorFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarBtn({
  onClick,
  title,
  active,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault()}
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

export function EditorField({ value, onChange, placeholder }: EditorFieldProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Keep the bundle small: disable unused starter-kit nodes.
        codeBlock: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Image,
    ],
    content: value || "",
    onUpdate({ editor: ed }) {
      onChange(ed.getHTML());
    },
    editorProps: {
      attributes: {
        class: "outline-none px-3 py-2 text-[13px] leading-relaxed text-ink min-h-[140px] prose-rte",
      },
    },
  });

  // Push external value changes into the editor without cursor jumps.
  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    const current = editor.getHTML();
    if (value !== current) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  if (!editor) {
    return <div className="field-input min-h-[140px] text-ink-muted">Loading editor…</div>;
  }

  const ed = editor;

  function addLink() {
    const previous = ed.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link URL", previous ?? "https://");
    if (url === null) return;
    if (url === "") {
      ed.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    ed.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  }

  return (
    <div className="rounded border border-line bg-surface focus-within:border-[var(--brand)] transition">
      <div className="flex flex-wrap items-center gap-0.5 px-1.5 py-1 hairline-b bg-surface-2/40">
        <ToolbarBtn title="Bold (Ctrl+B)" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Italic (Ctrl+I)" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Heading" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          <Heading2 size={14} />
        </ToolbarBtn>
        <span className="w-px h-5 bg-line-strong mx-1 inline-block" />
        <ToolbarBtn title="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={14} />
        </ToolbarBtn>
        <ToolbarBtn title="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={14} />
        </ToolbarBtn>
        <span className="w-px h-5 bg-line-strong mx-1 inline-block" />
        <ToolbarBtn title="Insert / edit link" active={editor.isActive("link")} onClick={addLink}>
          <LinkIcon size={14} />
        </ToolbarBtn>
        <div className="ml-auto flex items-center">
          <ToolbarBtn title="Undo" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
            <Undo size={14} />
          </ToolbarBtn>
          <ToolbarBtn title="Redo" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
            <Redo size={14} />
          </ToolbarBtn>
        </div>
      </div>
      <div className="relative">
        {(editor.isEmpty || value === "") && (
          <div className="absolute top-2 left-3 text-[13px] text-ink-faint pointer-events-none">
            {placeholder ?? "Start writing…"}
          </div>
        )}
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
