"use client";

import { useState, useTransition } from "react";
import { toggleAiKey, deleteAiKey, editAiKey } from "@/lib/aiKeyAdmin";
import { useAdminDialogs } from "./AdminDialogProvider";

/** Ported to the exact .aif-key-row/.key-info/.aif-btn flex-row markup
 *  from admin/ai-features.php's "API Keys" panel — an earlier pass used a
 *  plain <table> here instead. */
export function AiKeyRow({
  id,
  label,
  maskedKey,
  cfAccountId,
  successCount,
  failCount,
  isActive,
  targetUserId,
  isCloudflare,
}: {
  id: number;
  label: string | null;
  maskedKey: string;
  cfAccountId: string | null;
  successCount: number;
  failCount: number;
  isActive: boolean;
  targetUserId: number;
  isCloudflare: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const { confirm } = useAdminDialogs();

  return (
    <>
      <div className="aif-key-row">
        <div className="key-info">
          <span className={`aif-status ${isActive ? "active" : "inactive"}`}>{isActive ? "Active" : "Disabled"}</span>
          <span className="key-label-text">{label ?? "(no label)"}</span>
          <span className="key-masked">{maskedKey}</span>
          <span style={{ fontSize: "0.72rem", color: "var(--gray-400)" }}>
            {successCount} ok / {failCount} fail
          </span>
        </div>
        <div style={{ display: "flex", gap: "6px" }}>
          <button type="button" className="aif-btn sm" onClick={() => setEditing((v) => !v)}>
            <i className="fas fa-edit" />
          </button>
          <button type="button" className="aif-btn sm" disabled={isPending} onClick={() => startTransition(() => toggleAiKey(id, !isActive, targetUserId))}>
            <i className={`fas ${isActive ? "fa-pause" : "fa-play"}`} />
          </button>
          <button
            type="button"
            className="aif-btn sm danger"
            disabled={isPending}
            onClick={async () => {
              if (await confirm("Is API key ko permanently delete karna hai?")) startTransition(() => deleteAiKey(id, targetUserId));
            }}
          >
            <i className="fas fa-trash" />
          </button>
        </div>
      </div>
      {editing && (
        <form
          action={async (formData) => {
            await editAiKey(id, formData);
            setEditing(false);
          }}
          className="aif-add-form"
          style={{ marginTop: 0, paddingTop: "0.5rem", borderTop: "none" }}
        >
          <input type="hidden" name="targetUserId" value={targetUserId} />
          <input name="label" className="aif-input" placeholder="Label" defaultValue={label ?? ""} style={{ width: 110 }} />
          {isCloudflare && (
            <input name="cfAccountId" className="aif-input" placeholder="Account ID" defaultValue={cfAccountId ?? ""} style={{ width: 160 }} />
          )}
          <input name="apiKey" className="aif-input" placeholder="New key (leave blank to keep current)" style={{ flex: 1, minWidth: 180 }} />
          <button type="submit" className="aif-btn primary">
            Save
          </button>
        </form>
      )}
    </>
  );
}
