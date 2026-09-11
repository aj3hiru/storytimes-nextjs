"use client";

import { useState } from "react";

/** Ports the .ps-section accordion pattern from admin/performance-settings.php. */
export function PsSection({
  icon,
  iconBg,
  iconColor,
  title,
  desc,
  defaultOpen = false,
  children,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`ps-section${open ? " open" : ""}`}>
      <button type="button" className="ps-section-header" onClick={() => setOpen((v) => !v)}>
        <span className="ps-sec-icon" style={{ background: iconBg, color: iconColor }}>
          <i className={`fas ${icon}`} />
        </span>
        <span style={{ flex: 1 }}>
          <span className="ps-sec-title" style={{ display: "block" }}>
            {title}
          </span>
          <span className="ps-sec-desc">{desc}</span>
        </span>
        <i className="fas fa-chevron-down ps-sec-arrow" />
      </button>
      <div className="ps-section-body">{children}</div>
    </div>
  );
}
