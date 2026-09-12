"use client";

import { useState } from "react";

/**
 * Real production bug fix: app/admin-login/page.tsx is (and must stay) a
 * server component — it does async data fetching (checkLockout(),
 * resolveSiteConfig()) directly in the component body, which server
 * components can do and client components cannot without extra
 * plumbing. But it previously had an `onError` handler directly on an
 * `<img>` tag inside that server component, which Next.js rejects at
 * runtime with "Event handlers cannot be passed to Client Component
 * props" — a server component's JSX can only pass serializable props,
 * never functions/closures, to a plain DOM element. This tiny client
 * component isolates just the "image with a JS fallback on load error"
 * behavior so the rest of the login page can stay server-rendered.
 */
export function AdminLoginLogo({ src, alt }: { src: string; alt: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <LogoSvgFallback />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} onError={() => setFailed(true)} />
  );
}

export function LogoSvgFallback() {
  return (
    <svg className="logo-svg" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M12 2L4 5.5V11c0 5.25 3.4 9.9 8 11 4.6-1.1 8-5.75 8-11V5.5L12 2Z"
        stroke="white"
        strokeWidth={1.6}
        strokeLinejoin="round"
      />
      <path d="M9 12.2l2.1 2.1L15.5 10" stroke="white" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
