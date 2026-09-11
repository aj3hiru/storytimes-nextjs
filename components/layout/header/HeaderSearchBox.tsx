"use client";

import { useRef } from "react";

/**
 * Replaces the msb-mobile-search / msb-classic-search inline <script>
 * blocks in the original header designs: on mobile (<=560px) the search
 * icon click doesn't submit the form, it toggles a `mobile-search-active`
 * class on the ANCESTOR <header> element instead (CSS in site.css keys off
 * that class to show/hide the full-width row) — kept as the same
 * imperative DOM toggle as the original rather than lifting state through
 * both HeaderModern and HeaderClassic, since both designs share this exact
 * behavior and only the ancestor element differs.
 */
export function HeaderSearchBox() {
  const rootRef = useRef<HTMLDivElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);

  function isMobile() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches;
  }

  function openMobileSearch() {
    const header = rootRef.current?.closest("header");
    header?.classList.add("mobile-search-active");
    setTimeout(() => mobileInputRef.current?.focus(), 250);
  }

  function closeMobileSearch() {
    const header = rootRef.current?.closest("header");
    header?.classList.remove("mobile-search-active");
  }

  function handleTopbarSubmit(e: React.MouseEvent<HTMLButtonElement>) {
    if (isMobile()) {
      e.preventDefault();
      openMobileSearch();
    }
  }

  return (
    <div ref={rootRef} style={{ display: "contents" }}>
      <form action="/search" method="GET" className="topbar-search" role="search">
        <input type="text" name="q" placeholder="Type keywords...." autoComplete="off" />
        <button type="submit" aria-label="Search" onClick={handleTopbarSubmit}>
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
      </form>

      <div className="mobile-search-row">
        <form action="/search" method="GET" role="search">
          <input
            ref={mobileInputRef}
            type="text"
            name="q"
            placeholder="Type keywords...."
            autoComplete="off"
          />
          <button type="submit" aria-label="Search">
            <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>
          <button type="button" aria-label="Close search" onClick={closeMobileSearch}>
            &#10005;
          </button>
        </form>
      </div>
    </div>
  );
}
