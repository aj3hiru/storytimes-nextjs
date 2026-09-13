"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useEffect, useRef, useState } from "react";
import { MediaLibraryModal, type MediaLibraryItem } from "./MediaLibraryModal";
import { uploadImageFast } from "@/lib/clientUpload";
import { useAdminDialogs } from "./AdminDialogProvider";

type BlockType = "paragraph" | "h1" | "h2" | "h3" | "h4";
const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: "Paragraph",
  h1: "Heading 1",
  h2: "Heading 2",
  h3: "Heading 3",
  h4: "Heading 4",
};

/**
 * Rebuilt to match the actual newbase.fast2tricks.com reference exactly
 * (verified against its screenshots) — an earlier pass here used a
 * completely different, invented toolbar (H1/H2/H3/B/I/S/•List/1.List/
 * Quote/Link/Upload Image/Media Library/Undo/Redo, all as flat always-
 * visible buttons) instead of the reference's actual layout: a
 * "Paragraph" block-type dropdown, Bold/Italic/Underline, bullet/
 * numbered list toggles, Link, text-align left/center/right, Undo/Redo,
 * a "..." overflow menu for less-common actions (Blockquote, Upload
 * Image, Media Library — moved here to match the reference's compact
 * toolbar), and Visual/Text tabs to switch between the WYSIWYG view and
 * raw HTML source editing.
 *
 * Also fixes a real UX bug: the editor's content area used to grow
 * taller as more text was typed (no capped height) — the reference has
 * a FIXED-height editor with its own internal scrollbar once content
 * exceeds that height, which is what `overflow-y: auto` + a fixed
 * `height` (not `min-height`) on `.rte-content` now does.
 */
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
  const [moreOpen, setMoreOpen] = useState(false);
  const [blockMenuOpen, setBlockMenuOpen] = useState(false);
  const [mode, setMode] = useState<"visual" | "text">("visual");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (toolbarRef.current && !toolbarRef.current.contains(e.target as Node)) {
        setBlockMenuOpen(false);
        setMoreOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const editor = useEditor({
    // Next.js renders once on the server and once on the client during
    // hydration; Tiptap's DOM-dependent editor instance can only exist on
    // the client, so this must be false to avoid a hydration mismatch.
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
      }),
      Image,
      Link.configure({ openOnClick: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
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

  function currentBlockType(): BlockType {
    if (!editor) return "paragraph";
    for (const level of [1, 2, 3, 4] as const) {
      if (editor.isActive("heading", { level })) return `h${level}` as BlockType;
    }
    return "paragraph";
  }

  function setBlockType(type: BlockType) {
    if (!editor) return;
    if (type === "paragraph") {
      editor.chain().focus().setParagraph().run();
    } else {
      const level = Number(type.slice(1)) as 1 | 2 | 3 | 4;
      editor.chain().focus().toggleHeading({ level }).run();
    }
    setBlockMenuOpen(false);
  }

  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setHtml(e.target.value);
    editor?.commands.setContent(e.target.value);
  }

  if (!editor) {
    return <div className="form-control" style={{ minHeight }} />;
  }

  const wordCount = editor.state.doc.textContent.trim() ? editor.state.doc.textContent.trim().split(/\s+/).length : 0;

  return (
    <div className="rte-wrap">
      <div className="rte-toolbar" ref={toolbarRef}>
        <div className="rte-block-select">
          <button type="button" className="rte-btn rte-block-btn" onClick={() => setBlockMenuOpen((v) => !v)}>
            {BLOCK_LABELS[currentBlockType()]} <i className="fas fa-chevron-down" style={{ fontSize: "0.65rem" }} />
          </button>
          {blockMenuOpen && (
            <div className="rte-dropdown">
              {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
                <button type="button" key={type} className="rte-dropdown-item" onClick={() => setBlockType(type)}>
                  {BLOCK_LABELS[type]}
                </button>
              ))}
            </div>
          )}
        </div>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
          <strong>B</strong>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
          <em>I</em>
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline">
          <u>U</u>
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list">
          <i className="fas fa-list-ul" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list">
          <i className="fas fa-list-ol" />
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive("link")} onClick={setLink} title="Link">
          <i className="fas fa-link" />
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton active={editor.isActive({ textAlign: "left" })} onClick={() => editor.chain().focus().setTextAlign("left").run()} title="Align left">
          <i className="fas fa-align-left" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "center" })} onClick={() => editor.chain().focus().setTextAlign("center").run()} title="Align center">
          <i className="fas fa-align-center" />
        </ToolbarButton>
        <ToolbarButton active={editor.isActive({ textAlign: "right" })} onClick={() => editor.chain().focus().setTextAlign("right").run()} title="Align right">
          <i className="fas fa-align-right" />
        </ToolbarButton>
        <span className="rte-sep" />
        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} title="Undo">
          <i className="fas fa-undo" />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} title="Redo">
          <i className="fas fa-redo" />
        </ToolbarButton>
        <span className="rte-sep" />
        <div className="rte-block-select">
          <ToolbarButton onClick={() => setMoreOpen((v) => !v)} title="More">
            <i className="fas fa-ellipsis-h" />
          </ToolbarButton>
          {moreOpen && (
            <div className="rte-dropdown">
              <button type="button" className="rte-dropdown-item" onClick={() => { editor.chain().focus().toggleBlockquote().run(); setMoreOpen(false); }}>
                <i className="fas fa-quote-right" /> Blockquote
              </button>
              <button type="button" className="rte-dropdown-item" onClick={() => { fileInputRef.current?.click(); setMoreOpen(false); }}>
                <i className="fas fa-upload" /> {uploading ? "Uploading…" : "Upload Image"}
              </button>
              <button type="button" className="rte-dropdown-item" onClick={() => { setLibraryOpen(true); setMoreOpen(false); }}>
                <i className="fas fa-images" /> Media Library
              </button>
            </div>
          )}
        </div>
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImageUpload} style={{ display: "none" }} />

        <div className="rte-mode-tabs">
          <button type="button" className={`rte-mode-tab${mode === "visual" ? " active" : ""}`} onClick={() => setMode("visual")}>
            Visual
          </button>
          <button type="button" className={`rte-mode-tab${mode === "text" ? " active" : ""}`} onClick={() => setMode("text")}>
            Text
          </button>
        </div>
      </div>

      {mode === "visual" ? (
        <div className="rte-content-wrap" style={{ height: minHeight }}>
          <EditorContent editor={editor} />
        </div>
      ) : (
        <textarea className="rte-html-source" style={{ height: minHeight }} value={html} onChange={handleTextChange} />
      )}

      <div className="rte-footer">
        <span>{mode === "visual" ? "P" : "HTML"}</span>
        <span>{wordCount} WORDS</span>
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
