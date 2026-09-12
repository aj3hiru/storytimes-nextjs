"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Ports the "Display Options" dropdown from the actual dashboard.php —
 * lets the admin show/hide each dashboard card, remembered per browser
 * (localStorage, matching the original's own "remembered per browser"
 * comment — this is a pure display preference, not account data, so
 * localStorage is the right fit even though artifacts elsewhere in this
 * project avoid it). Was entirely missing from an earlier pass, which
 * invented a different, non-existent stat-card dashboard section instead.
 */
const WIDGETS = [
  { key: "traffic", label: "Traffic Overview" },
  { key: "trendchart", label: "Traffic Chart" },
  { key: "countrytraffic", label: "Traffic by Country" },
  { key: "todaysposts", label: "Today's Posts" },
] as const;

const STORAGE_KEY = "db_widget_visibility";

export function useDashboardWidgetVisibility() {
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Reading localStorage can only happen after mount (it doesn't exist
    // during server rendering) — this is exactly the "sync from an
    // external system" case effects are for, so a lint suppression here
    // is correct rather than a workaround.
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setHidden(new Set(JSON.parse(saved)));
    } catch {
      // ignore malformed/missing localStorage value
    }
  }, []);

  function toggle(key: string, visible: boolean) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (visible) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {
        // ignore write failures (private browsing, storage full, etc.)
      }
      return next;
    });
  }

  return { hidden, toggle };
}

export function DisplayOptionsDropdown({
  hidden,
  onToggle,
}: {
  hidden: Set<string>;
  onToggle: (key: string, visible: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="db-display-wrap" ref={ref}>
      <button className="db-action-btn db-action-ghost" type="button" onClick={() => setOpen((v) => !v)}>
        <i className="fas fa-sliders-h" /> Display Options <i className={`fas fa-chevron-down${open ? " is-open" : ""}`} />
      </button>
      <div className={`db-display-panel${open ? " open" : ""}`}>
        {WIDGETS.map((w) => (
          <label className="db-display-check" key={w.key}>
            <input
              type="checkbox"
              checked={!hidden.has(w.key)}
              onChange={(e) => onToggle(w.key, e.target.checked)}
            />
            {w.label}
          </label>
        ))}
      </div>
    </div>
  );
}
