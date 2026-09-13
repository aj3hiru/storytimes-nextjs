"use client";

/**
 * Real bug fixed here: every "Copy" button in the post editor showed
 * "Copied!" success feedback unconditionally, even when the actual
 * `navigator.clipboard.writeText()` call had silently failed (permission
 * denied, document not focused, insecure context, older browser) — the
 * failure was caught and swallowed with no fallback attempted at all.
 * This tries the Clipboard API first, falls back to the older
 * `document.execCommand('copy')` via a temporary offscreen textarea if
 * that fails, and returns a real boolean so callers only show success
 * feedback when a copy genuinely happened.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (!text) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through to the execCommand fallback below.
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
