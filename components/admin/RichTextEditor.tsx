"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import { useRef, useState } from "react";
import { MediaLibraryModal, type MediaLibraryItem } from "./MediaLibraryModal";
import { uploadImageFast } from "@/lib/clientUpload";
import { useAdminDialogs } from "./AdminDialogProvider";

export function RichTextEditor({
  name,
  defaultValue,
  minHeight = 400,
}: {
  name: string;
  defaultValue?: string;
  minHeight?: number;
}) {
  const [html, setHtml] = useState(defaultValue ?? "");
  const [uploading, setUploading] = useState(false);
  const { notice } = useAdminDialogs();
  const [libraryOpen, setLibraryOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    // Next.js renders once on the server and once on the client during
    // hydration; Tiptap's DOM-dependent editor instance can only exist on
    // the client, so this must be false to avoid a hydration mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4, 5, 6] },
      }),
      Image,
      Link.configure({ openOnClick: false }),
    ],
    content: defaultValue ?? "",
    editorProps: {
      attributes: {
        class: "rte-content",
      },
    },
    onUpdate: ({ editor }) => {
      setHtml(editor.getHTML());
    },
  });

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    setUploading(true);
    try {
      const result = await uploadImageFast(file, "post");
      editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
    } catch (err) {
      notice(err instanceof Error ? err.message : "Image upload failed.", { type: "error" });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleLibrarySelect(item: MediaLibraryItem) {
    if (!editor) return;
    editor.chain().focus().setImage({ src: `/${item.path.replace(/^\/+/, "")}` }).run();
  }

  function setLink() {
    if (!editor) return;
    const previousUrl = editor.getAttributes("link").href as string | undefined;
    const url = window.prompt("URL", previousUrl ?? "https://");
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().unsetLink().run();
      return;
    }
    editor.chain().focus().setLink({ href: url }).run();
  }

  if (!editor) {
    return <div className="form-control" style={{ minHeight }} />;
  }

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar">
        <ToolbarButton active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Chapter break (H1)">
          H1
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
          H2
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
          H3
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <s>S</s>
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          • List
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          1. List
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          Quote
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive("link")} onClick={setLink}>
          Link
        </ToolbarButton>
        <ToolbarButton onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? "Uploading…" : "Upload Image"}
        </ToolbarButton>
        <ToolbarButton onClick={() => setLibraryOpen(true)}>Media Library</ToolbarButton>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />
        <span className="rte-sep" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()}>Undo</ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()}>Redo</ToolbarButton>
      </div>
      <div style={{ minHeight }}>
        <EditorContent editor={editor} />
      </div>
      <input type="hidden" name={name} value={html} />
      <MediaLibraryModal open={libraryOpen} onClose={() => setLibraryOpen(false)} onSelect={handleLibrarySelect} />
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  disabled,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button type="button" className={`rte-btn${active ? " active" : ""}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  );
}
