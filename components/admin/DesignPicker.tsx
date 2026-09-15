"use client";

import { useState } from "react";

/** Ports selectDesign() from admin/header-customizer.php — the clicked
 *  card highlights immediately (client state), not just after save. */
export function DesignPicker({ initial }: { initial: string }) {
  const [selected, setSelected] = useState(initial);
  const options = [
    { key: "modern", name: "Modern", desc: "Two-bar layout with scrollable category nav" },
    { key: "classic", name: "Classic", desc: "Original single-bar header from the old script" },
  ];

  return (
    <div className="design-grid">
      {options.map((d) => (
        <label key={d.key} className={`design-card${selected === d.key ? " active" : ""}`}>
          <input type="radio" name="headerDesign" value={d.key} checked={selected === d.key} onChange={() => setSelected(d.key)} style={{ display: "none" }} />
          {d.key === "modern" ? (
            <div className="design-thumb design-thumb-modern">
              <div className="dt-row dt-row-top">
                <span className="dt-goback" />
                <span className="dt-logo-c" />
                <span className="dt-dot" />
              </div>
              <div className="dt-row dt-row-bottom">
                <span className="dt-home" />
                <span className="dt-pill" />
                <span className="dt-pill" />
                <span className="dt-pill" />
              </div>
            </div>
          ) : (
            <div className="design-thumb design-thumb-classic">
              <div className="dt-row">
                <span className="dt-logo" />
                <span className="dt-pill" />
                <span className="dt-pill" />
                <span className="dt-pill" />
                <span className="dt-dot" />
              </div>
            </div>
          )}
          <div className="design-card-info">
            <span className="dc-name">{d.name}</span>
            <span className="dc-desc">{d.desc}</span>
          </div>
          <span className="dc-check">
            <i className="fas fa-check-circle" />
          </span>
        </label>
      ))}
    </div>
  );
}
