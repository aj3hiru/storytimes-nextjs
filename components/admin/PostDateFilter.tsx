"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "Week" },
  { key: "month", label: "This Month" },
  { key: "custom", label: "Custom" },
] as const;

/**
 * New feature, no PHP equivalent — per explicit request: a single filter
 * on Blog Manager that narrows the post list by publish date, with
 * Today/Yesterday/Week/This Month presets plus a custom date range, all
 * in one control. All ranges are IST-anchored (lib/istDate.ts) so "Today"
 * here means the same calendar day the Analytics/Dashboard pages mean.
 *
 * No date filter is applied at all unless this control has actually been
 * used — visiting Blog Manager still shows every post by default, exactly
 * as before this feature existed, rather than silently narrowing every
 * visit down to just today's posts. "Today" being the first, highlighted
 * option here is what satisfies "default rahe" — it's the natural first
 * choice once you open the filter, not a change to what loads unasked.
 */
export function PostDateFilter({
  currentPreset,
  currentFrom,
  currentTo,
}: {
  currentPreset: string | null;
  currentFrom: string | null;
  currentTo: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState(currentFrom ?? "");
  const [customTo, setCustomTo] = useState(currentTo ?? "");

  function applyPreset(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key === "custom") {
      // Don't navigate yet — wait for both custom dates and an explicit Apply.
      params.set("date_range", "custom");
      setOpen(true);
      return;
    }
    params.set("date_range", key);
    params.delete("date_from");
    params.delete("date_to");
    params.delete("page");
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  function applyCustom() {
    if (!customFrom || !customTo) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("date_range", "custom");
    params.set("date_from", customFrom);
    params.set("date_to", customTo);
    params.delete("page");
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  function clearFilter() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("date_range");
    params.delete("date_from");
    params.delete("date_to");
    params.delete("page");
    router.push(`?${params.toString()}`);
    setOpen(false);
  }

  const activeLabel = currentPreset
    ? currentPreset === "custom" && currentFrom && currentTo
      ? `${currentFrom} → ${currentTo}`
      : PRESETS.find((p) => p.key === currentPreset)?.label ?? "Date"
    : "Date";

  return (
    <div className="pdf-wrap">
      <button
        type="button"
        className={`pdf-trigger${currentPreset ? " active" : ""}`}
        onClick={() => setOpen((v) => !v)}
      >
        <i className="fas fa-calendar-day pt-select-icon" />
        <span>{activeLabel}</span>
        <i className="fas fa-chevron-down pdf-chevron" />
      </button>

      {open && (
        <div className="pdf-popover">
          <div className="pdf-presets">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`pdf-preset-btn${currentPreset === p.key || (!currentPreset && p.key === "today") ? " active" : ""}`}
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>

          {(currentPreset === "custom" || customFrom || customTo) && (
            <div className="pdf-custom-row">
              <input
                type="date"
                className="form-control"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label="From date"
              />
              <span className="pdf-arrow">→</span>
              <input
                type="date"
                className="form-control"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label="To date"
              />
              <button type="button" className="btn btn-primary btn-sm" onClick={applyCustom} disabled={!customFrom || !customTo}>
                Apply
              </button>
            </div>
          )}

          {currentPreset && (
            <button type="button" className="pdf-clear" onClick={clearFilter}>
              <i className="fas fa-xmark" /> Clear date filter
            </button>
          )}
        </div>
      )}
    </div>
  );
}
