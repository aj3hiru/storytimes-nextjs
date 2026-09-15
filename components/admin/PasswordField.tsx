"use client";

import { useState } from "react";

/**
 * Password input with a working show/hide eye button. Handled as React
 * state rather than a DOM listener for the same reason as the login
 * form's own toggle (see components/AdminLoginForm.tsx): a browser
 * autofilling a saved password can replace the input element, which
 * silently breaks any listener bound to the original node.
 */
export function PasswordField({
  name,
  required,
  autoComplete,
  placeholder,
}: {
  name: string;
  required?: boolean;
  autoComplete?: string;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <span className="pwd-field">
      <input
        type={show ? "text" : "password"}
        name={name}
        className="form-control"
        required={required}
        autoComplete={autoComplete}
        placeholder={placeholder}
      />
      <button
        type="button"
        className="pwd-field-toggle"
        tabIndex={-1}
        aria-label={show ? "Hide password" : "Show password"}
        onClick={() => setShow((v) => !v)}
      >
        <i className={`fas ${show ? "fa-eye-slash" : "fa-eye"}`} />
      </button>
    </span>
  );
}
