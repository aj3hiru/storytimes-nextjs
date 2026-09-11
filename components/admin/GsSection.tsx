"use client";

import { useState } from "react";

/** Same accordion pattern as AccordionSection but with the .gs-section/
 *  .gs-sec-* classes used by Homepage/Sidebar/Performance Settings
 *  (admin/*-settings.php all share this exact pattern, distinct from
 *  header-customizer.php's .hc-sec naming). */
export function GsSection({
  icon,
  iconBg,
  iconColor,
  title,
  defaultOpen = false,
  children,
}: {
  icon: string;
  iconBg: string;
  iconColor: string;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`gs-section${open ? " open" : ""}`}>
      <button type="button" className="gs-sec-hd" onClick={() => setOpen((v) => !v)}>
        <span className="gs-sec-ico" style={{ background: iconBg, color: iconColor }}>
          <i className={`fas ${icon}`} />
        </span>
        <strong>{title}</strong>
        <i className="fas fa-chevron-down gs-sec-arrow" />
      </button>
      <div className="gs-sec-bd">{children}</div>
    </div>
  );
}
