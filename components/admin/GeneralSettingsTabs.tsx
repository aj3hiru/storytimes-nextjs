"use client";

import { useState } from "react";

const TABS = [
  { key: "gs-identity", label: "Identity", title: "Site Identity", sub: "Title, tagline, URL & email", icon: "fa-globe", color: "#7c3aed" },
  { key: "gs-logo", label: "Logo & Favicon", title: "Logo & Favicon", sub: "Site logo & browser tab icon", icon: "fa-image", color: "#059669" },
  { key: "gs-locale", label: "Language & Region", title: "Language & Region", sub: "Language, timezone, date & time", icon: "fa-language", color: "#d97706" },
] as const;

/** Client-side rail-nav tab switcher — ports the gsSwitchTab() JS from
 *  admin/general-settings.php. All 3 panels are still part of the SAME
 *  form (they submit together), this only controls which is visible. */
export function GeneralSettingsTabs({
  identityPanel,
  logoPanel,
  localePanel,
}: {
  identityPanel: React.ReactNode;
  logoPanel: React.ReactNode;
  localePanel: React.ReactNode;
}) {
  const [active, setActive] = useState<(typeof TABS)[number]["key"]>("gs-identity");
  const panels = { "gs-identity": identityPanel, "gs-logo": logoPanel, "gs-locale": localePanel };

  return (
    <div className="gs-shell">
      <nav className="gs-rail">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`gs-rail-item${active === tab.key ? " active" : ""}`}
            style={{ "--rc": tab.color } as React.CSSProperties}
            onClick={() => setActive(tab.key)}
          >
            <span className="gs-rail-ico">
              <i className={`fas ${tab.icon}`} />
            </span>
            <span className="gs-rail-item-label">{tab.label}</span>
            <span className="gs-rail-txt">
              <strong>{tab.title}</strong>
              <small>{tab.sub}</small>
            </span>
          </button>
        ))}
      </nav>
      <div className="gs-panels">
        {TABS.map((tab) => (
          <section key={tab.key} className={`gs-panel${active === tab.key ? " active" : ""}`}>
            <div className="gs-panel-card">
              <div className="gs-panel-hd">
                <div className="gs-panel-ico" style={{ "--rc": tab.color } as React.CSSProperties}>
                  <i className={`fas ${tab.icon}`} />
                </div>
                <div>
                  <h3>{tab.title}</h3>
                  <p>{tab.sub}</p>
                </div>
              </div>
              <div className="gs-panel-bd">{panels[tab.key]}</div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
