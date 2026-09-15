"use client";

import { useState } from "react";

/**
 * Real bug fixed here: the show/hide-password eye button used to be wired
 * up by an inline `<script dangerouslySetInnerHTML>` block on the login
 * page that ran `addEventListener` once, at parse time. That breaks in
 * two ways this project actually hit — a browser autofilling a saved
 * password can replace the input element React rendered, leaving the
 * listener bound to a node no longer in the document; and any React
 * re-render of that subtree does the same. Reported as "password save
 * hai to fill ho jaata hai, then eye view button work nahi kar raha."
 * Handling it as real React state instead means the button works no
 * matter how the field got filled.
 */
export function AdminLoginForm({ redirectTo }: { redirectTo: string }) {
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  return (
    <form
      method="POST"
      action="/api/admin/login"
      autoComplete="on"
      onSubmit={(e) => {
        const form = e.currentTarget;
        const u = (form.elements.namedItem("username") as HTMLInputElement)?.value.trim();
        const p = (form.elements.namedItem("password") as HTMLInputElement)?.value;
        if (!u || !p) {
          e.preventDefault();
          return;
        }
        setSubmitting(true);
      }}
    >
      <input type="hidden" name="redirect_to" value={redirectTo} />

      <p className="wp-login-field">
        <label htmlFor="username">Username or Email Address</label>
        <input
          type="text"
          id="username"
          name="username"
          required
          autoComplete="username"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </p>

      <p className="wp-login-field">
        <label htmlFor="password">Password</label>
        <span className="wp-pwd-wrap">
          <input
            type={showPassword ? "text" : "password"}
            id="password"
            name="password"
            required
            autoComplete="current-password"
          />
          <button
            type="button"
            className="wp-pwd-toggle"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
          >
            <i className={`fas ${showPassword ? "fa-eye-slash" : "fa-eye"}`} />
          </button>
        </span>
      </p>

      <p className="wp-login-remember">
        <label>
          <input type="checkbox" name="remember" defaultChecked />
          Remember Me
        </label>
      </p>

      <p className="wp-login-submit">
        <button type="submit" disabled={submitting} className={submitting ? "loading" : undefined}>
          {submitting ? <span className="wp-spinner" /> : <span className="wp-btn-text">Log In</span>}
        </button>
      </p>
    </form>
  );
}
