"use client";

import { useState } from "react";

const TABS = [
  { key: "keys", label: "API Keys", icon: "fa-key" },
  { key: "settings", label: "Feature Toggles", icon: "fa-sliders-h" },
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
  statsPanel,
  cleanupPanel,
  showStats,
}: {
  keysPanel: React.ReactNode;
  settingsPanel: React.ReactNode;
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
      {showStats && <div className={`aif-panel${active === "stats" ? " active" : ""}`}>{statsPanel}</div>}
      {showStats && <div className={`aif-panel${active === "cleanup" ? " active" : ""}`}>{cleanupPanel}</div>}
    </>
  );
}
