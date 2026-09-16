"use client";

import { useState } from "react";

const TABS = [
  { key: "keys", label: "API Keys", icon: "fa-key" },
  { key: "settings", label: "Feature Toggles", icon: "fa-sliders-h" },
  // Genuinely new — the reference PHP has no equivalent of this tab, since
  // configurable chapter-count/word-length settings didn't exist as a
  // feature there. Added per explicit request. Every OTHER tab here is
  // still a verified port of the real admin/ai-features.php; this one
  // deliberately isn't, so it shouldn't be mistaken for one later.
  { key: "story", label: "Story Settings", icon: "fa-book-open" },
  { key: "stats", label: "Fail Rate", icon: "fa-chart-bar" },
  { key: "cleanup", label: "Cleanup", icon: "fa-broom" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** Client-side tab switcher — ports the .aif-tabs/.aif-panel click
 *  handler from admin/ai-features.php exactly (no page reload between
 *  tabs). Panels are passed as named children so the server component
 *  above still does all the data fetching per panel. */
export function AiFeaturesTabs({
  keysPanel,
  settingsPanel,
  storyPanel,
  statsPanel,
  cleanupPanel,
  showStats,
}: {
  keysPanel: React.ReactNode;
  settingsPanel: React.ReactNode;
  storyPanel: React.ReactNode;
  statsPanel?: React.ReactNode;
  cleanupPanel?: React.ReactNode;
  showStats: boolean;
}) {
  const [active, setActive] = useState<TabKey>("keys");

  const visibleTabs = showStats ? TABS : TABS.filter((t) => t.key !== "stats" && t.key !== "cleanup");

  return (
    <>
      <div className="aif-tabs">
        {visibleTabs.map((tab) => (
          <button key={tab.key} type="button" className={`aif-tab${active === tab.key ? " active" : ""}`} onClick={() => setActive(tab.key)}>
            <i className={`fas ${tab.icon}`} /> {tab.label}
          </button>
        ))}
      </div>

      <div className={`aif-panel${active === "keys" ? " active" : ""}`}>{keysPanel}</div>
      <div className={`aif-panel${active === "settings" ? " active" : ""}`}>{settingsPanel}</div>
      <div className={`aif-panel${active === "story" ? " active" : ""}`}>{storyPanel}</div>
      {showStats && <div className={`aif-panel${active === "stats" ? " active" : ""}`}>{statsPanel}</div>}
      {showStats && <div className={`aif-panel${active === "cleanup" ? " active" : ""}`}>{cleanupPanel}</div>}
    </>
  );
}
