"use client";

import { useState, useTransition } from "react";
import { saveAdjustmentRule, toggleAdjustmentRule, deleteAdjustmentRule } from "@/lib/analyticsAdjustmentAdmin";
import { flagEmoji } from "@/lib/flagEmoji";
import { useAdminDialogs } from "./AdminDialogProvider";

export interface AdjustmentRule {
  id: number;
  country: string | null;
  countryName: string | null;
  /** New feature, no PHP equivalent — see the form's own "Scope: All
   *  Countries" option below. */
  isGlobal: boolean;
  excludedCountries: string | null;
  reductionPercent: number;
  scope: string;
  userId: number | null;
  username: string | null;
  enabled: boolean;
}

/** 1:1 port of admin/analytics-adjustment.php's form + table: the "Edit"
 *  button fills the form from in-memory row data with no page reload
 *  (matches the original's data-rule + vanilla-JS approach), while
 *  Create/Update still does a full-page action + redirect like the PHP
 *  version's POST-then-Location-redirect flow. */
export function TrafficAdjustmentPanel({
  rules,
  countryEntries,
  affectedUsers,
  allowedPercents,
}: {
  rules: AdjustmentRule[];
  countryEntries: [string, string][];
  affectedUsers: { id: number; username: string; role: string }[];
  allowedPercents: number[];
}) {
  const [editing, setEditing] = useState<AdjustmentRule | null>(null);
  const [scope, setScope] = useState<"all" | "user">("all");
  const [isGlobal, setIsGlobal] = useState(false);
  const [isPending, startTransition] = useTransition();
  const { confirm } = useAdminDialogs();

  function startEdit(rule: AdjustmentRule) {
    setEditing(rule);
    setScope(rule.scope === "user" ? "user" : "all");
    setIsGlobal(rule.isGlobal);
    document.getElementById("ta-form-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function cancelEdit() {
    setEditing(null);
    setScope("all");
    setIsGlobal(false);
  }

  return (
    <div className="ta-layout">
      <div className="card ta-form-card" style={{ padding: "1.5rem" }} id="ta-form-card">
        <div className="ta-card-title">
          <i className={`fas ${editing ? "fa-pen" : "fa-plus-circle"}`} /> {editing ? "Edit Adjustment Rule" : "Add Adjustment Rule"}
        </div>
        <p className="ta-card-desc">Pick a country, choose who it applies to, and how much of their click count should be hidden from their own view.</p>

        <form action={saveAdjustmentRule} style={{ display: "contents" }} key={editing?.id ?? "new"}>
          <input type="hidden" name="editId" value={editing?.id ?? 0} />

          <div className="form-group ta-form-row">
            <label>Country Scope</label>
            {/* New feature, no PHP equivalent — per explicit request: a rule
                can target all countries at once instead of always needing
                one specific country, with an exclude-list for exceptions
                (e.g. "All Countries except India"). */}
            <div className="ta-scope-options">
              <label className={`ta-scope-option${!isGlobal ? " checked" : ""}`}>
                <input type="radio" name="isGlobalRadio" checked={!isGlobal} onChange={() => setIsGlobal(false)} />
                <span>Single country</span>
              </label>
              <label className={`ta-scope-option${isGlobal ? " checked" : ""}`}>
                <input type="radio" name="isGlobalRadio" checked={isGlobal} onChange={() => setIsGlobal(true)} />
                <span>All countries</span>
              </label>
            </div>
            {/* The actual submitted flag — a checkbox so "on"/absent matches
                the server action's formData.get("isGlobal") === "on" check,
                kept in sync with the radio pair above rather than exposed
                directly (a checkbox pair reads oddly; two radios read
                naturally as one either/or choice). */}
            <input type="checkbox" name="isGlobal" checked={isGlobal} onChange={() => {}} hidden />
          </div>

          {!isGlobal ? (
            <div className="form-group ta-form-row">
              <label htmlFor="ta-country">Country</label>
              <select id="ta-country" name="country" className="form-control" defaultValue={editing?.country ?? ""} required={!isGlobal}>
                <option value="">Select country</option>
                {countryEntries.map(([code, name]) => (
                  <option key={code} value={code}>
                    {name} ({code})
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="form-group ta-form-row">
              <label htmlFor="ta-excluded">Exclude (optional)</label>
              <input
                id="ta-excluded"
                name="excludedCountries"
                className="form-control"
                placeholder="e.g. IN, US"
                defaultValue={editing?.excludedCountries ?? ""}
              />
              <span className="form-hint">Comma-separated 2-letter country codes this rule should skip — e.g. IN to reduce every country except India.</span>
            </div>
          )}

          <div className="form-group ta-form-row">
            <label htmlFor="ta-percent">Reduction</label>
            <select id="ta-percent" name="reductionPercent" className="form-control" defaultValue={editing?.reductionPercent ?? allowedPercents[0]}>
              {allowedPercents.map((p) => (
                <option key={p} value={p}>
                  {p}% fewer clicks shown
                </option>
              ))}
            </select>
            <span className="form-hint">The user&apos;s own dashboard will show this much less for the selected country.</span>
          </div>

          <div className="form-group ta-form-row">
            <label>Applies to</label>
            <div className="ta-scope-options">
              <label className={`ta-scope-option${scope === "all" ? " checked" : ""}`}>
                <input type="radio" name="scope" value="all" checked={scope === "all"} onChange={() => setScope("all")} />
                <span>All users (every editor &amp; author)</span>
              </label>
              <label className={`ta-scope-option${scope === "user" ? " checked" : ""}`}>
                <input type="radio" name="scope" value="user" checked={scope === "user"} onChange={() => setScope("user")} />
                <span>Specific user only</span>
              </label>
            </div>
            <div className={`ta-user-select${scope === "user" ? " show" : ""}`}>
              <select name="userId" className="form-control" defaultValue={editing?.userId ?? ""}>
                <option value="">Select user</option>
                {affectedUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.username} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="ta-enabled-row">
            <input type="checkbox" name="enabled" id="ta-enabled" defaultChecked={editing?.enabled ?? true} />
            <label htmlFor="ta-enabled">Rule enabled</label>
          </div>

          <div className="ta-form-actions">
            <button type="submit" className="btn btn-primary">
              <i className={`fas ${editing ? "fa-save" : "fa-plus"}`} /> {editing ? "Update Rule" : "Add Rule"}
            </button>
            {editing && (
              <button type="button" className="btn btn-secondary" onClick={cancelEdit}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </div>

      <div className="card" style={{ overflow: "hidden" }}>
        <div className="ta-list-header">
          <div>
            <h3>Active Rules</h3>
            <p>Newest first. Toggle off to pause a rule without deleting it.</p>
          </div>
        </div>

        {rules.length === 0 ? (
          <div className="empty-state" style={{ boxShadow: "none", border: "none", borderRadius: 0 }}>
            <div className="empty-icon">
              <i className="fas fa-filter" />
            </div>
            <h3>No adjustment rules yet</h3>
            <p>Create your first rule using the form to reduce a specific country&apos;s traffic on non-admin dashboards.</p>
          </div>
        ) : (
          <div className="table-responsive">
            <table>
              <thead>
                <tr>
                  <th>Country</th>
                  <th>Reduction</th>
                  <th>Applies to</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <div className="ta-country-cell">
                        {r.isGlobal ? (
                          <>
                            <span className="ta-country-flag">🌍</span>
                            <div>
                              <div className="ta-country-name">All Countries</div>
                              {r.excludedCountries && <div className="ta-country-code">except {r.excludedCountries}</div>}
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="ta-country-flag">{flagEmoji(r.country ?? "")}</span>
                            <div>
                              <div className="ta-country-name">{r.countryName}</div>
                              <div className="ta-country-code">{r.country}</div>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="ta-pct-badge">
                        <i className="fas fa-arrow-down" /> {r.reductionPercent}%
                      </span>
                    </td>
                    <td>
                      {r.scope === "all" ? (
                        <span className="badge badge-info">All users</span>
                      ) : (
                        <span className="badge" style={{ background: "var(--warning-light)", color: "#92400e" }}>
                          {r.username ?? `User #${r.userId}`}
                        </span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`badge ta-toggle-btn ${r.enabled ? "badge-active" : "badge-inactive"}`}
                        disabled={isPending}
                        onClick={() => startTransition(() => toggleAdjustmentRule(r.id))}
                      >
                        {r.enabled ? "Enabled" : "Disabled"}
                      </button>
                    </td>
                    <td>
                      <div className="ta-row-actions">
                        <button type="button" className="ta-icon-btn ta-edit-btn" title="Edit" onClick={() => startEdit(r)}>
                          <i className="fas fa-pen" />
                        </button>
                        <button
                          type="button"
                          className="ta-icon-btn danger"
                          title="Delete"
                          disabled={isPending}
                          onClick={async () => {
                            if (await confirm("Delete this rule?")) startTransition(() => deleteAdjustmentRule(r.id));
                          }}
                        >
                          <i className="fas fa-trash" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
