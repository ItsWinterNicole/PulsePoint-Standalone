import { useEffect } from "react";
import { Bold, Italic, List, ListOrdered, RotateCcw, RotateCw } from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { canonicalTextToEditorHtml, editorJsonToCanonicalText, richTextToCanonicalText } from "@/lib/richText";

function ToolbarButton({ active = false, disabled = false, onClick, title, children }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`rounded-md p-1.5 transition-colors disabled:opacity-40 ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

export default function RichTextEditor({ value, onChange, placeholder = "Add notes...", minHeight = "min-h-[92px]" }) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({ placeholder }),
    ],
    content: canonicalTextToEditorHtml(value),
    editorProps: {
      attributes: {
        class: `${minHeight} px-3 py-2 text-sm leading-relaxed focus:outline-none`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      onChange(currentEditor.isEmpty ? "" : editorJsonToCanonicalText(currentEditor.getJSON()));
    },
  });

  useEffect(() => {
    if (!editor) return;
    const nextHtml = canonicalTextToEditorHtml(value);
    const currentText = editor.isEmpty ? "" : editorJsonToCanonicalText(editor.getJSON());
    const nextText = richTextToCanonicalText(value);
    if (currentText === nextText) return;
    const currentHtml = editor.isEmpty ? "" : editor.getHTML();
    if (nextHtml !== currentHtml) editor.commands.setContent(nextHtml, { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return null;

  return (
    <div className="rounded-lg border border-border bg-background focus-within:ring-1 focus-within:ring-primary">
      <div className="flex items-center gap-0.5 border-b border-border bg-muted/25 px-2 py-1">
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <Bold className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <Italic className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bulleted list">
          <List className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarButton>
        <span className="mx-1 h-4 border-l border-border" />
        <ToolbarButton disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <RotateCcw className="h-3.5 w-3.5" />
        </ToolbarButton>
        <ToolbarButton disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <RotateCw className="h-3.5 w-3.5" />
        </ToolbarButton>
      </div>
      <div className="min-h-[92px] resize-y overflow-auto">
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}
