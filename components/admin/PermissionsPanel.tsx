"use client";

import { useState } from "react";
import {
  type Permissions,
  PERMISSION_GROUP_ICONS,
  PERMISSION_GROUP_LABELS,
  PERMISSION_GROUP_ORDER,
  PERMISSION_LABELS,
} from "@/lib/permissions";

/**
 * Renders the same grouped checkbox grid as the reference's
 * renderPermissionsPanel(), behind a collapsible "Advance Access" toggle.
 * Fully controlled: the parent owns `permissions` state so that changing
 * the Role <select> can reset every checkbox to that role's defaults
 * (exactly what applyRoleDefaults() does in the original — role changes
 * always overwrite the panel, they don't try to preserve prior custom
 * picks, matching newbase's actual behavior).
 */
export function PermissionsPanel({
  permissions,
  onChange,
  visibleKeys,
}: {
  permissions: Permissions;
  onChange: (next: Permissions) => void;
  /** Dotted keys ("blogs.create", "dashboard_access") this actor may
   *  grant. Omitted entirely for admins. Anything not listed is hidden
   *  rather than shown-and-disabled, because the server strips it on
   *  save anyway — a checkbox that silently does nothing reads as a bug,
   *  not as a boundary. */
  visibleKeys?: string[];
}) {
  const [open, setOpen] = useState(false);
  const allowed = visibleKeys ? new Set(visibleKeys) : null;
  const canShow = (key: string) => !allowed || allowed.has(key);

  function toggleFlag(key: keyof Permissions) {
    onChange({ ...permissions, [key]: !permissions[key] } as Permissions);
  }

  function toggleSub<K extends keyof Permissions>(key: K, subKey: keyof Permissions[K]) {
    const section = permissions[key] as Record<string, boolean>;
    onChange({
      ...permissions,
      [key]: { ...section, [subKey as string]: !section[subKey as string] },
    } as Permissions);
  }

  return (
    <>
      <div
        className={`adv-toggle${open ? " open" : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setOpen((v) => !v)}
      >
        <span>
          <i className="fas fa-shield-alt" /> Advance Access
        </span>
        <i className="fas fa-chevron-down chev" />
      </div>
      <div className={`adv-panel${open ? " open" : ""}`}>
        <div className="perm-panel">
          {PERMISSION_GROUP_ORDER.map((key) => {
            const icon = PERMISSION_GROUP_ICONS[key];
            const val = permissions[key];

            if (typeof val === "boolean") {
              if (!canShow(key)) return null;
              return (
                <div className="perm-group" key={key}>
                  <div className="perm-grid">
                    <label className={`perm-item${val ? " checked" : ""}`}>
                      <input
                        type="checkbox"
                        name={`permissions[${key}]`}
                        checked={val}
                        onChange={() => toggleFlag(key)}
                      />
                      <i className={`fas ${icon}`} style={{ fontSize: ".7rem", marginRight: ".2rem" }} />
                      {PERMISSION_LABELS[key] as string}
                    </label>
                  </div>
                </div>
              );
            }

            const section = val as Record<string, boolean>;
            const subLabels = PERMISSION_LABELS[key] as Record<string, string>;
            const visibleSubKeys = Object.keys(section).filter((s) => canShow(`${key}.${s}`));
            // A group with nothing grantable in it is dropped entirely,
            // rather than rendering an empty titled box.
            if (visibleSubKeys.length === 0) return null;
            return (
              <div className="perm-group" key={key}>
                <div className="perm-group-title">
                  <i className={`fas ${icon}`} /> {PERMISSION_GROUP_LABELS[key]}
                </div>
                <div className="perm-grid">
                  {visibleSubKeys.map((subKey) => {
                    const checked = section[subKey];
                    return (
                      <label className={`perm-item${checked ? " checked" : ""}`} key={subKey}>
                        <input
                          type="checkbox"
                          name={`permissions[${key}][${subKey}]`}
                          checked={checked}
                          onChange={() => toggleSub(key, subKey as never)}
                        />
                        {subLabels[subKey]}
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
