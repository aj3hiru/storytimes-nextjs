"use client";

import { useState } from "react";

/** Ports the .hc-sec collapsible accordion pattern (toggleSec() in the
 *  original) — reused across the customizer settings pages. */
export function AccordionSection({
  id,
  icon,
  iconBg,
  iconColor,
  title,
  defaultOpen = false,
  children,
}: {
  id: string;
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`hc-sec${open ? " open" : ""}`} id={id}>
      <button type="button" className="hc-sec-hd" onClick={() => setOpen((v) => !v)}>
        <span className="sec-title">
          <span className="sec-ico" style={{ background: iconBg, color: iconColor }}>
            <i className={`fas ${icon}`} />
          </span>
          {title}
        </span>
        <i className="fas fa-chevron-down sec-arrow" />
      </button>
      <div className="hc-sec-bd">{children}</div>
    </div>
  );
}
