"use client";

import { useEffect, useState } from "react";

export function DarkModeToggle() {
  // Initialized from the DOM attribute the blocking inline script in
  // app/layout.tsx already set before first paint, so this never causes a
  // mismatch flash on mount.
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // This is exactly React's own sanctioned "synchronize with an external
    // system" pattern: reading the data-theme attribute the blocking
    // inline script in app/layout.tsx already applied to <html> before
    // hydration, so the toggle icon matches reality on first interaction.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsDark(document.documentElement.getAttribute("data-theme") === "dark");
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute("data-theme", "dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.setItem("theme", "light");
    }
  }

  return (
    <button
      className="search-btn dark-toggle-btn"
      aria-label="Toggle dark mode"
      onClick={toggle}
      type="button"
    >
      {isDark ? (
        <svg
          className="icon-moon"
          xmlns="http://www.w3.org/2000/svg"
          height="22"
          width="22"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ display: "block", margin: "auto" }}
        >
          <path
            strokeWidth="2"
            strokeLinejoin="round"
            d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z"
          />
        </svg>
      ) : (
        <svg
          className="icon-sun"
          xmlns="http://www.w3.org/2000/svg"
          height="22"
          width="22"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          style={{ display: "block", margin: "auto" }}
        >
          <circle cx="12" cy="12" r="4" strokeWidth="2" />
          <path
            strokeWidth="2"
            strokeLinecap="round"
            d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
          />
        </svg>
      )}
    </button>
  );
}
