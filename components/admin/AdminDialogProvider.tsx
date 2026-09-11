"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

/**
 * React port of window.adminConfirm()/window.adminNotice() — the custom
 * styled confirm/alert dialogs used everywhere in the admin panel instead
 * of the browser's native confirm()/alert(). An earlier pass of this port
 * used native window.confirm()/window.alert() throughout (in every
 * Delete*Button, row-action, etc.), which is a real, visible design
 * difference from the original — native dialogs look completely
 * different from a styled in-app modal. This provider + hook replaces
 * all of those call sites with the same look/behavior as the original.
 */

interface ConfirmOptions {
  title?: string;
  confirmText?: string;
  cancelText?: string;
  /** Defaults to true (red/danger styling), matching the original's
   *  `options.danger !== false` default — most confirms in an admin
   *  panel are for destructive actions. */
  danger?: boolean;
}

interface NoticeOptions {
  title?: string;
  type?: "success" | "error" | "info";
  /** ms before auto-close; 0 disables auto-close. Defaults to 4000. */
  autoClose?: number;
}

interface AdminDialogContextValue {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
  notice: (message: string, options?: NoticeOptions) => void;
}

const AdminDialogContext = createContext<AdminDialogContextValue | null>(null);

export function useAdminDialogs(): AdminDialogContextValue {
  const ctx = useContext(AdminDialogContext);
  if (!ctx) {
    // Fail soft rather than crash a page that forgot the provider —
    // falls back to the native dialogs so functionality still works
    // even if styling doesn't match.
    return {
      confirm: (message: string) => Promise.resolve(window.confirm(message)),
      notice: (message: string) => window.alert(message),
    };
  }
  return ctx;
}

interface ConfirmState {
  message: string;
  options: ConfirmOptions;
  resolve: (result: boolean) => void;
}

interface NoticeState {
  message: string;
  options: NoticeOptions;
}

const NOTICE_ICONS: Record<NonNullable<NoticeOptions["type"]>, React.ReactNode> = {
  success: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  ),
  error: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="8" x2="12" y2="12" />
      <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  ),
  info: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="16" x2="12" y2="12" />
      <line x1="12" y1="8" x2="12.01" y2="8" />
    </svg>
  ),
};

export function AdminDialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [noticeState, setNoticeState] = useState<NoticeState | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const confirm = useCallback((message: string, options: ConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ message, options, resolve });
    });
  }, []);

  const notice = useCallback((message: string, options: NoticeOptions = {}) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNoticeState({ message, options });
    const autoCloseMs = options.autoClose === 0 ? 0 : (options.autoClose ?? 4000);
    if (autoCloseMs > 0) {
      noticeTimer.current = setTimeout(() => setNoticeState(null), autoCloseMs);
    }
  }, []);

  function closeConfirm(result: boolean) {
    confirmState?.resolve(result);
    setConfirmState(null);
  }

  const isDanger = confirmState?.options.danger !== false;
  const noticeType = noticeState?.options.type ?? "info";

  return (
    <AdminDialogContext.Provider value={{ confirm, notice }}>
      {children}

      {confirmState && (
        <div
          id="acm-overlay"
          className="acm-overlay acm-open"
          role="dialog"
          aria-modal="true"
          aria-labelledby="acm-title"
          onClick={(e) => e.target === e.currentTarget && closeConfirm(false)}
        >
          <div className="acm-box">
            <div className={`acm-icon${isDanger ? " acm-danger" : ""}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <h3 className="acm-title" id="acm-title">
              {confirmState.options.title || "Please Confirm"}
            </h3>
            <p className="acm-message" id="acm-message">
              {confirmState.message}
            </p>
            <div className="acm-actions">
              <button type="button" className="acm-btn acm-btn-cancel" onClick={() => closeConfirm(false)}>
                {confirmState.options.cancelText || "Cancel"}
              </button>
              <button
                type="button"
                className={`acm-btn acm-btn-confirm${isDanger ? " acm-danger" : ""}`}
                onClick={() => closeConfirm(true)}
                autoFocus
              >
                {confirmState.options.confirmText || "Confirm"}
              </button>
            </div>
            <button type="button" className="acm-close" aria-label="Close" onClick={() => closeConfirm(false)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {noticeState && (
        <div
          id="anm-overlay"
          className="anm-overlay anm-open"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="anm-title"
          onClick={(e) => e.target === e.currentTarget && setNoticeState(null)}
        >
          <div className="anm-box">
            <div className={`anm-icon anm-${noticeType}`}>{NOTICE_ICONS[noticeType]}</div>
            <h3 className="anm-title" id="anm-title">
              {noticeState.options.title || (noticeType === "error" ? "Something Went Wrong" : noticeType === "success" ? "Success" : "Notice")}
            </h3>
            <p className="anm-message" id="anm-message">
              {noticeState.message}
            </p>
            <button type="button" className="anm-ok" onClick={() => setNoticeState(null)}>
              OK
            </button>
            <button type="button" className="anm-close" aria-label="Close" onClick={() => setNoticeState(null)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </AdminDialogContext.Provider>
  );
}
