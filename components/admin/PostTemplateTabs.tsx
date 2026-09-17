"use client";

import { useState } from "react";
import type { ReactNode } from "react";

const TABS = [
  { key: "content", label: "Content & Layout", icon: "fa-align-left" },
  { key: "sidebar", label: "Sidebar", icon: "fa-table-columns" },
  { key: "recommendations", label: "Recommendations", icon: "fa-thumbs-up" },
  { key: "social", label: "Social Sharing", icon: "fa-share-nodes" },
  { key: "redirect", label: "404 Redirect", icon: "fa-route" },
  { key: "typography", label: "Typography", icon: "fa-font" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/**
 * New feature, no PHP equivalent — per explicit request: reorganizes
 * Post Template's settings (previously one long, undifferentiated
 * stacked list) into a WordPress Customizer-style vertical tab layout.
 *
 * All panels stay mounted in the DOM at all times — only shown/hidden
 * via a CSS class, never conditionally unmounted — because every field
 * across every tab submits together through the ONE surrounding
 * `<form>` in page.tsx when Save is pressed. A panel that gets removed
 * from the DOM while its tab isn't active would silently drop its
 * fields from that submission — switching tabs would mean losing
 * whatever wasn't visible at Save time. This is exactly the same
 * always-mounted pattern AiFeaturesTabs.tsx already uses for the same
 * reason.
 */
export function PostTemplateTabs({
  content,
  sidebar,
  recommendations,
  social,
  redirect,
  typography,
}: {
  content: ReactNode;
  sidebar: ReactNode;
  recommendations: ReactNode;
  social: ReactNode;
  redirect: ReactNode;
  typography: ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("content");
  const panels: Record<TabKey, ReactNode> = { content, sidebar, recommendations, social, redirect, typography };

  return (
    <div className="ptt-layout">
      <nav className="ptt-nav">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`ptt-nav-item${active === tab.key ? " active" : ""}`}
            onClick={() => setActive(tab.key)}
          >
            <i className={`fas ${tab.icon}`} />
            <span>{tab.label}</span>
            <i className="fas fa-chevron-right ptt-nav-chevron" />
          </button>
        ))}
      </nav>
      <div className="ptt-content">
        {TABS.map((tab) => (
          <div key={tab.key} className={`ptt-panel${active === tab.key ? " active" : ""}`}>
            {panels[tab.key]}
          </div>
        ))}
      </div>
    </div>
  );
}
