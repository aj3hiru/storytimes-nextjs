"use client";

import { useRef, useState } from "react";

/** Ports admin/code-snippets.php's initEditor(): a line-number gutter that
 *  stays in sync with the textarea's content/scroll, and Tab inserting
 *  4 spaces instead of moving focus. */
export function SnippetEditor({
  id,
  name,
  placeholder,
  defaultValue,
}: {
  id: string;
  name: string;
  placeholder: string;
  defaultValue: string;
}) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const [lineCount, setLineCount] = useState(Math.max(defaultValue.split("\n").length, 1));

  function renderLines() {
    const ta = taRef.current;
    if (!ta) return;
    setLineCount(Math.max(ta.value.split("\n").length, 1));
    if (gutterRef.current) gutterRef.current.scrollTop = ta.scrollTop;
  }

  function handleScroll() {
    if (taRef.current && gutterRef.current) gutterRef.current.scrollTop = taRef.current.scrollTop;
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = e.currentTarget;
      const s = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.substring(0, s) + "    " + ta.value.substring(end);
      ta.selectionStart = ta.selectionEnd = s + 4;
      renderLines();
    }
  }

  return (
    <div className="sc-editor">
      <div className="sc-gutter" ref={gutterRef}>
        {Array.from({ length: lineCount }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <textarea
        ref={taRef}
        className="sc-textarea"
        name={name}
        id={id}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        defaultValue={defaultValue}
        onInput={renderLines}
        onScroll={handleScroll}
        onKeyDown={handleKeyDown}
      />
    </div>
  );
}
