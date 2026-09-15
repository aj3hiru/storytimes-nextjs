"use client";

import { useState, useTransition } from "react";
import { useAdminDialogs } from "./AdminDialogProvider";
import { saveAdInserterBlocks, saveAdsTxt } from "@/lib/adInserterAdmin";
import {
  AD_INSERTION_OPTIONS,
  AD_ALIGNMENT_OPTIONS,
  AD_PAGE_OPTIONS,
  type AdBlock,
  type AdInserterConfig,
  type AdPageType,
} from "@/lib/adInserterTypes";

/**
 * Full rebuild of the Ad Inserter admin page to match the reference
 * exactly (explicit request — the previous version was a drastically
 * simplified "Global header/footer + Homepage Top Ad + basic in-content
 * blocks with just a paragraph number" page): three tabs (Blocks /
 * Header-Footer / Ads.txt), 16 numbered block sub-tabs each with its
 * own enable toggle, code editor, page-type checkboxes, insertion-point
 * and alignment selects, and a paragraph-number field that only shows
 * for the two insertion types where it's meaningful — plus a single
 * "Save Settings 1-16" action, matching the reference's own save-all-
 * blocks-at-once behavior rather than per-block saving.
 */
export function AdInserterClient({
  initialConfig,
  initialAdsTxtContent,
}: {
  initialConfig: AdInserterConfig;
  initialAdsTxtContent: string;
}) {
  const { notice } = useAdminDialogs();
  const [tab, setTab] = useState<"blocks" | "headerfooter" | "adstxt">("blocks");
  const [activeBlock, setActiveBlock] = useState(1);
  const [blocks, setBlocks] = useState<AdBlock[]>(initialConfig.blocks);
  const [globalHeader, setGlobalHeader] = useState(initialConfig.globalHeader);
  const [globalFooter, setGlobalFooter] = useState(initialConfig.globalFooter);
  const [adsTxtEnabled, setAdsTxtEnabled] = useState(initialConfig.adsTxtEnabled);
  const [adsTxtContent, setAdsTxtContent] = useState(initialAdsTxtContent);
  const [isPending, startTransition] = useTransition();
  // Real UX fix, per explicit request: saving used to fire a modal popup
  // ("Success — Settings saved successfully!") that had to be dismissed
  // before you could keep working. An inline confirmation right next to
  // the button you just pressed says the same thing without interrupting
  // anything. Errors still use the modal, since those genuinely need
  // acknowledging rather than fading away unnoticed.
  const [savedNote, setSavedNote] = useState<string | null>(null);

  function flashSaved(text: string) {
    setSavedNote(text);
    setTimeout(() => setSavedNote(null), 3000);
  }

  const current = blocks[activeBlock - 1];

  function updateCurrentBlock(patch: Partial<AdBlock>) {
    setBlocks((prev) => prev.map((b, i) => (i === activeBlock - 1 ? { ...b, ...patch } : b)));
  }

  function togglePage(page: AdPageType) {
    const has = current.pages.includes(page);
    updateCurrentBlock({ pages: has ? current.pages.filter((p) => p !== page) : [...current.pages, page] });
  }

  function handleSaveBlocks() {
    const formData = new FormData();
    formData.set("configJson", JSON.stringify({ blocks, globalHeader, globalFooter, adsTxtEnabled }));
    startTransition(async () => {
      const result = await saveAdInserterBlocks(formData);
      if (result.success) flashSaved(result.message);
      else notice(result.message, { type: "error" });
    });
  }

  function handleSaveAdsTxt() {
    const formData = new FormData();
    formData.set("adstxtContent", adsTxtContent);
    formData.set("adstxtEnabled", adsTxtEnabled ? "1" : "0");
    startTransition(async () => {
      const result = await saveAdsTxt(formData);
      if (result.success) flashSaved(result.message);
      else notice(result.message, { type: "error" });
    });
  }

  const showParagraphField = current.insertion === "before_paragraph" || current.insertion === "after_paragraph";

  return (
    <div>
      <div className="toolbar">
        <h2 className="toolbar-title">Ad Inserter</h2>
      </div>

      <div className="ai-tabs">
        <button type="button" className={`ai-tab${tab === "blocks" ? " active" : ""}`} onClick={() => setTab("blocks")}>
          Blocks
        </button>
        <button type="button" className={`ai-tab${tab === "headerfooter" ? " active" : ""}`} onClick={() => setTab("headerfooter")}>
          Header / Footer
        </button>
        <button type="button" className={`ai-tab${tab === "adstxt" ? " active" : ""}`} onClick={() => setTab("adstxt")}>
          Ads.txt
        </button>
      </div>

      {tab === "blocks" && (
        <div className="card ai-card">
          <div className="ai-block-tabs">
            {blocks.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`ai-block-tab${activeBlock === b.id ? " active" : ""}${b.enabled ? " enabled" : ""}`}
                onClick={() => setActiveBlock(b.id)}
              >
                {b.id}
              </button>
            ))}
          </div>

          <div className="ai-block-header">
            <h3>{current.label}</h3>
            <label className="ai-toggle">
              <input type="checkbox" checked={current.enabled} onChange={(e) => updateCurrentBlock({ enabled: e.target.checked })} />
              <span className="ai-toggle-track" aria-hidden="true" />
              Enabled
            </label>
          </div>

          <textarea
            className="form-control ai-code"
            rows={8}
            placeholder="Ad network code (AdSense, script, widget, etc.)"
            value={current.code}
            onChange={(e) => updateCurrentBlock({ code: e.target.value })}
          />

          <div className="ai-pages-row">
            {AD_PAGE_OPTIONS.map((opt) => (
              <label key={opt.value} className="ai-page-check">
                <input type="checkbox" checked={current.pages.includes(opt.value)} onChange={() => togglePage(opt.value)} />
                {opt.label}
              </label>
            ))}
          </div>

          <div className="ai-settings-row">
            <div className="form-group">
              <label>Insertion</label>
              <select
                className="form-control"
                value={current.insertion}
                onChange={(e) => updateCurrentBlock({ insertion: e.target.value as AdBlock["insertion"] })}
              >
                {AD_INSERTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label>Alignment</label>
              <select
                className="form-control"
                value={current.alignment}
                onChange={(e) => updateCurrentBlock({ alignment: e.target.value as AdBlock["alignment"] })}
              >
                {AD_ALIGNMENT_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {showParagraphField && (
              <div className="form-group ai-paragraph-field">
                <label>Paragraph #</label>
                <input
                  type="number"
                  min={1}
                  className="form-control"
                  value={current.paragraph}
                  onChange={(e) => updateCurrentBlock({ paragraph: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                />
              </div>
            )}
          </div>

          <div className="ai-save-row">
            <button type="button" className="btn btn-primary" onClick={handleSaveBlocks} disabled={isPending}>
              {isPending ? "Saving…" : "Save Settings 1 - 16"}
            </button>
            {savedNote && (
              <span className="ai-saved-note">
                <i className="fas fa-check-circle" /> {savedNote}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "headerfooter" && (
        <div className="card ai-card">
          <div className="ai-hf-grid">
            <div className="form-group">
              <label htmlFor="globalHeader">Header (every page)</label>
              <textarea
                id="globalHeader"
                className="form-control ai-code"
                rows={8}
                value={globalHeader}
                onChange={(e) => setGlobalHeader(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label htmlFor="globalFooter">Footer (every page)</label>
              <textarea
                id="globalFooter"
                className="form-control ai-code"
                rows={8}
                value={globalFooter}
                onChange={(e) => setGlobalFooter(e.target.value)}
              />
            </div>
          </div>
          <div className="ai-save-row">
            <button type="button" className="btn btn-primary" onClick={handleSaveBlocks} disabled={isPending}>
              {isPending ? "Saving…" : "Save Settings 1 - 16"}
            </button>
            {savedNote && (
              <span className="ai-saved-note">
                <i className="fas fa-check-circle" /> {savedNote}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "adstxt" && (
        <div className="card ai-card">
          <label className="ai-toggle" style={{ marginBottom: "1rem" }}>
            <input type="checkbox" checked={adsTxtEnabled} onChange={(e) => setAdsTxtEnabled(e.target.checked)} />
            <span className="ai-toggle-track" aria-hidden="true" />
            Serve /ads.txt
          </label>
          <textarea
            className="form-control ai-code"
            rows={12}
            placeholder="google.com, pub-0000000000000000, DIRECT, f08c47fec0942fa0"
            value={adsTxtContent}
            onChange={(e) => setAdsTxtContent(e.target.value)}
          />
          <div className="ai-save-row">
            <button type="button" className="btn btn-primary" onClick={handleSaveAdsTxt} disabled={isPending}>
              {isPending ? "Saving…" : "Save Ads.txt"}
            </button>
            {savedNote && (
              <span className="ai-saved-note">
                <i className="fas fa-check-circle" /> {savedNote}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
