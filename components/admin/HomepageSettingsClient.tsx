"use client";

import { useMemo, useState } from "react";
import { saveHomepageSettings } from "@/lib/homepageSettingsAdmin";
import { GsSection } from "./GsSection";

/**
 * Real gap fixed here (item #15): this page previously had no live
 * preview at all (its own earlier comment admitted as much: "NOT
 * ported: the live mini-preview boxes"). Converted to a client
 * component so the two mockup boxes from the reference — the "Story"
 * bar preview (title updates as you type, disappears entirely when the
 * toggle is off) and the Posts Per Page grid preview (placeholder
 * cards capped at 9 with a "+N more" chip, pagination dots computed
 * from the same sample-25-posts demo math as the reference) — can
 * genuinely react live to the same state driving the form inputs.
 * Still submits via the existing saveHomepageSettings Server Action
 * (hidden inputs kept in sync with this component's own state) rather
 * than changing that action's contract, since it already works exactly
 * as every other settings page in this project expects.
 */
export function HomepageSettingsClient({
  initialBreadcrumbEnabled,
  initialBreadcrumbText,
  initialPostsPerPage,
  successMessage,
}: {
  initialBreadcrumbEnabled: boolean;
  initialBreadcrumbText: string;
  initialPostsPerPage: number;
  successMessage: string | null;
}) {
  const [breadcrumbEnabled, setBreadcrumbEnabled] = useState(initialBreadcrumbEnabled);
  const [breadcrumbText, setBreadcrumbText] = useState(initialBreadcrumbText);
  const [postsPerPage, setPostsPerPage] = useState(initialPostsPerPage);

  const clampedCount = useMemo(() => {
    const v = Math.round(postsPerPage);
    if (Number.isNaN(v)) return 9;
    return Math.max(1, Math.min(30, v));
  }, [postsPerPage]);

  // Same demo math as the reference's own preview: a sample total of 25 posts.
  const pagiPages = useMemo(() => Math.max(1, Math.ceil(25 / clampedCount)), [clampedCount]);
  const shownCards = Math.min(clampedCount, 9);
  const extra = clampedCount > 9 ? clampedCount - 9 : 0;
  const maxDots = Math.min(pagiPages, 5);
  const hasMoreDots = pagiPages > maxDots;

  return (
    <div className="gs-wrap">
      <form action={saveHomepageSettings}>
        <div className="gs-savebar">
          <h2>
            <i className="fas fa-house" style={{ color: "var(--primary)", marginRight: 7 }} /> Homepage Settings
          </h2>
          <button type="submit" className="gs-save-btn">
            <i className="fas fa-save" /> Save Changes
          </button>
        </div>

        {successMessage && (
          <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
            <i className="fas fa-check-circle" /> {successMessage}
          </div>
        )}

        <p className="hps-note">
          <i className="fas fa-circle-info" /> These settings only affect the homepage.
        </p>

        <GsSection icon="fa-heading" iconBg="#ede9fe" iconColor="#6366f1" title='"Story" Bar' defaultOpen>
          <div className="gs-f">
            <div className="gs-f-row">
              <label style={{ margin: 0 }}>
                <i className="fas fa-eye" style={{ marginRight: 5, color: "#6366f1" }} /> Show Story Bar
              </label>
              <label className="gs-sw">
                <input
                  type="checkbox"
                  name="breadcrumbEnabled"
                  checked={breadcrumbEnabled}
                  onChange={(e) => setBreadcrumbEnabled(e.target.checked)}
                />
                <span className="gs-sl" />
              </label>
            </div>
            <p className="hint">When off, this entire bar (title + search box) is hidden from the homepage.</p>
          </div>
          <div className={`gs-f hps-sub${breadcrumbEnabled ? "" : " dim"}`}>
            <label>&#8618; Bar text</label>
            <input
              type="text"
              className="gs-inp"
              name="breadcrumbText"
              maxLength={40}
              value={breadcrumbText}
              placeholder="Story"
              onChange={(e) => setBreadcrumbText(e.target.value)}
            />
            <p className="hint">Shown as the heading on the left of the bar. Max 40 characters.</p>
          </div>

          <div className="hps-preview">
            <div className="hps-preview-lbl">Live preview</div>
            <div className="hps-preview-body">
              <div className={`hps-preview-bar${breadcrumbEnabled ? "" : " w-off"}`}>
                <h4 className="hps-preview-title">{breadcrumbText.trim() || "Story"}</h4>
                <div className="hps-preview-search" />
              </div>
            </div>
          </div>
        </GsSection>

        <GsSection icon="fa-table-cells" iconBg="#d1fae5" iconColor="#059669" title="Posts Per Page" defaultOpen>
          <div className="gs-f">
            <label>Posts per page</label>
            <input
              type="number"
              className="gs-inp"
              name="postsPerPage"
              min={1}
              max={30}
              value={postsPerPage}
              onChange={(e) => setPostsPerPage(Number(e.target.value))}
              style={{ maxWidth: 140 }}
            />
            <p className="hint">1–30 posts. Once a page has this many posts, older posts move to page 2, 3, etc.</p>
          </div>

          <div className="hps-preview">
            <div className="hps-preview-lbl">Live preview (posts on page 1)</div>
            <div className="hps-preview-body">
              <div className="hps-preview-grid">
                {Array.from({ length: shownCards }).map((_, i) => (
                  <div className="hps-preview-card" key={i} />
                ))}
                {extra > 0 && <div className="hps-preview-card dim more">+{extra} more</div>}
              </div>
              <div className="hps-preview-pagi">
                {Array.from({ length: maxDots }).map((_, i) => (
                  <span key={i} className={i === 0 ? "active" : ""}>
                    {i + 1}
                  </span>
                ))}
                {hasMoreDots && <span>&hellip;</span>}
              </div>
            </div>
          </div>
        </GsSection>
      </form>
    </div>
  );
}
