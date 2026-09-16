"use client";

import { useState } from "react";
import { saveStoryDefaultAction, saveMyStoryOverrideAction } from "@/lib/aiStorySettingsAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

interface Settings {
  chapterCount: number;
  introWords: number;
  chapterWords: number;
}

/**
 * New feature — no PHP equivalent, see AiFeaturesTabs.tsx's comment.
 * Two independent sections:
 *  - "Site Default" (admin only): what every user's generations use
 *    unless they've set their own override.
 *  - "My Settings" (everyone): this person's own override, defaulting to
 *    whatever the effective (resolved) values currently are, so the
 *    fields start pre-filled with what they'd actually get rather than
 *    blank.
 */
export function StorySettingsPanel({
  isAdmin,
  siteDefault,
  myOverride,
  effective,
}: {
  isAdmin: boolean;
  siteDefault: Settings;
  /** Only the fields this person has explicitly overridden — the rest
   *  are null, meaning "inherits the site default". */
  myOverride: { chapterCount: number | null; introWords: number | null; chapterWords: number | null };
  /** What this person's next generation will actually use right now. */
  effective: Settings;
}) {
  const { notice, confirm } = useAdminDialogs();
  const [savingDefault, setSavingDefault] = useState(false);
  const [savingMine, setSavingMine] = useState(false);

  async function handleDefaultSubmit(formData: FormData) {
    setSavingDefault(true);
    try {
      await saveStoryDefaultAction(formData);
      notice("Site-wide default saved. Applies to every user who hasn't set their own override.", { type: "success" });
    } catch (err) {
      notice(err instanceof Error ? err.message : "Failed to save.", { type: "error" });
    } finally {
      setSavingDefault(false);
    }
  }

  async function handleMineSubmit(formData: FormData) {
    setSavingMine(true);
    try {
      await saveMyStoryOverrideAction(formData);
      notice("Your settings saved. Leave a field blank to go back to using the site default for it.", { type: "success" });
    } catch (err) {
      notice(err instanceof Error ? err.message : "Failed to save.", { type: "error" });
    } finally {
      setSavingMine(false);
    }
  }

  async function handleClearMine() {
    if (!(await confirm("Clear all your overrides? You'll go back to using the site default for everything.", { title: "Clear My Settings", confirmText: "Clear" })))
      return;
    const fd = new FormData();
    // Sending nothing for each field clears it — saveMyStoryOverrideAction
    // treats a blank string the same as an absent field.
    await saveMyStoryOverrideAction(fd);
    notice("Cleared. You're now using the site default for everything.", { type: "success" });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {isAdmin && (
        <div className="card" style={{ padding: "1.25rem" }}>
          <div className="form-section-title" style={{ marginBottom: "0.25rem" }}>
            <i className="fas fa-globe" /> Site Default
          </div>
          <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)", margin: "0 0 1rem" }}>
            What every user gets unless they set their own override below.
          </p>
          <form action={handleDefaultSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Chapters</label>
                <input type="number" name="chapterCount" className="form-control" min={1} max={10} defaultValue={siteDefault.chapterCount} required />
              </div>
              <div className="form-group">
                <label>
                  Intro words <span className="form-hint">— target, e.g. 475 for a 450–500 word intro</span>
                </label>
                <input type="number" name="introWords" className="form-control" min={150} max={800} defaultValue={siteDefault.introWords} required />
              </div>
              <div className="form-group">
                <label>
                  Words per chapter <span className="form-hint">— target</span>
                </label>
                <input type="number" name="chapterWords" className="form-control" min={300} max={1200} defaultValue={siteDefault.chapterWords} required />
              </div>
            </div>
            <button type="submit" className="btn btn-primary" disabled={savingDefault}>
              <i className="fas fa-save" /> {savingDefault ? "Saving…" : "Save Site Default"}
            </button>
          </form>
        </div>
      )}

      <div className="card" style={{ padding: "1.25rem" }}>
        <div className="form-section-title" style={{ marginBottom: "0.25rem" }}>
          <i className="fas fa-user" /> My Settings
        </div>
        <p style={{ fontSize: "0.8125rem", color: "var(--gray-500)", margin: "0 0 1rem" }}>
          Your own override. Leave a field blank to use the site default for it instead — right now
          you&apos;d get {effective.chapterCount} chapters, a ~{effective.introWords}-word intro, and
          ~{effective.chapterWords} words per chapter.
        </p>
        <form action={handleMineSubmit}>
          <div className="form-row">
            <div className="form-group">
              <label>Chapters</label>
              <input type="number" name="chapterCount" className="form-control" min={1} max={10} defaultValue={myOverride.chapterCount ?? ""} placeholder={String(siteDefault.chapterCount)} />
            </div>
            <div className="form-group">
              <label>Intro words</label>
              <input type="number" name="introWords" className="form-control" min={150} max={800} defaultValue={myOverride.introWords ?? ""} placeholder={String(siteDefault.introWords)} />
            </div>
            <div className="form-group">
              <label>Words per chapter</label>
              <input type="number" name="chapterWords" className="form-control" min={300} max={1200} defaultValue={myOverride.chapterWords ?? ""} placeholder={String(siteDefault.chapterWords)} />
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.6rem" }}>
            <button type="submit" className="btn btn-primary" disabled={savingMine}>
              <i className="fas fa-save" /> {savingMine ? "Saving…" : "Save My Settings"}
            </button>
            <button type="button" className="btn btn-secondary" onClick={handleClearMine}>
              <i className="fas fa-undo" /> Use Site Default
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
