"use client";

import { useState } from "react";
import { copyToClipboard } from "@/lib/clipboard";

export function CronCopyBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="cron-pre-wrap">
      <pre className="cron-pre">{text}</pre>
      <button
        type="button"
        className="cron-copy"
        onClick={async () => {
          await copyToClipboard(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        <i className={`fas ${copied ? "fa-check" : "fa-copy"}`} /> {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}
