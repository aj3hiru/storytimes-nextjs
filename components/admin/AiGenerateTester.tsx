"use client";

import { useState } from "react";

interface GenerateResponse {
  success: boolean;
  message?: string;
  title?: string;
  content?: string;
  metaDescription?: string;
  metaKeywords?: string;
  imagePrompt?: string;
  fbDescription?: string;
  thumbnailPrompt?: string;
  thumbnailBase64?: string | null;
}

function CopyField({ label, value, multiline }: { label: string; value: string; multiline?: boolean }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // best-effort only
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <strong style={{ fontSize: "0.85rem" }}>{label}</strong>
        <button type="button" className="btn-action btn-edit" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {multiline ? (
        <textarea readOnly className="form-control" rows={label === "Content HTML" ? 8 : 3} value={value} style={{ fontSize: "0.8rem" }} />
      ) : (
        <input readOnly className="form-control" value={value} style={{ fontSize: "0.85rem" }} />
      )}
    </div>
  );
}

export function AiGenerateTester() {
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GenerateResponse | null>(null);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/ai/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const data: GenerateResponse = await res.json();
      setResult(data);
    } catch {
      setResult({ success: false, message: "Request failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div className="form-group">
        <label htmlFor="ai-shotlist">
          Video Shot-List / Prompt{" "}
          <span className="form-hint">
            — paste your scene-by-scene shot list (camera angles, dialogue/voice lines, SFX cues, visual descriptions)
          </span>
        </label>
        <textarea
          id="ai-shotlist"
          className="form-control"
          rows={6}
          placeholder="Scene 1: Wide shot, kitchen. Mom: 'Where were you last night?' ..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>
      <div>
        <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={loading}>
          {loading ? "Generating… (can take up to a few minutes)" : "Generate Story"}
        </button>
      </div>

      {result && !result.success && (
        <div className="alert alert-error">
          <i className="fas fa-exclamation-circle" /> {result.message}
        </div>
      )}

      {result?.success && (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem", border: "1px solid var(--gray-200)", borderRadius: 8, padding: "1rem" }}>
          <CopyField label="Title" value={result.title ?? ""} />
          {result.thumbnailBase64 && (
            <div>
              <strong style={{ fontSize: "0.85rem", display: "block", marginBottom: "0.3rem" }}>Generated Thumbnail</strong>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`data:image/webp;base64,${result.thumbnailBase64}`} alt="Generated thumbnail" style={{ maxWidth: 300, borderRadius: 8 }} />
            </div>
          )}
          <CopyField label="Meta Description" value={result.metaDescription ?? ""} multiline />
          <CopyField label="Meta Keywords" value={result.metaKeywords ?? ""} />
          <CopyField label="Facebook Description" value={result.fbDescription ?? ""} multiline />
          <CopyField label="Thumbnail Prompt" value={result.thumbnailPrompt ?? ""} multiline />
          <CopyField label="Image Prompt (quick)" value={result.imagePrompt ?? ""} multiline />
          <CopyField label="Content HTML" value={result.content ?? ""} multiline />
          <p style={{ fontSize: "0.75rem", color: "var(--gray-500)" }}>
            Copy the fields you need into a new post at{" "}
            <a href="/admin/post-manager/new" target="_blank" rel="noopener noreferrer">
              Post Manager → New Post
            </a>
            .
          </p>
        </div>
      )}
    </div>
  );
}
