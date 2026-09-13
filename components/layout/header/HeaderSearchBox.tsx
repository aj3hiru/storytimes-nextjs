"use client";

import { useRef } from "react";

/**
 * Real structural bug fixed here, found by comparing the actual DOM
 * position of `.mobile-search-row` in the reference against this
 * project's: the reference places it as a DIRECT SIBLING of
 * `.container` (itself a direct child of `<header>`) — OUTSIDE the
 * flex row that holds the logo/nav/header-actions entirely, closed
 * before `.mobile-search-row` even starts. This project instead
 * rendered both the inline search button AND the full-width mobile row
 * from ONE component nested INSIDE `.header-actions`, which is itself
 * inside `.container`'s `display: flex`. Because that shared wrapper
 * used `display: contents` (so its own children became direct flex
 * items of `.container`), `.mobile-search-row` — even with its own
 * `width: 100%` — was constrained to squeeze in ALONGSIDE the logo/nav
 * as a flex item, instead of dropping to its own full-width line below
 * everything. Split into two components rendered from two different,
 * correct DOM positions in HeaderModern.tsx/HeaderClassic.tsx:
 * `HeaderSearchToggle` (the small inline button, stays inside
 * `.header-actions`) and `HeaderMobileSearchRow` (the full-width
 * dropdown, now rendered as a sibling AFTER `.container` closes,
 * matching the reference exactly). Both still coordinate purely via
 * the same imperative `.mobile-search-active` class toggle on the
 * ancestor `<header>` the reference itself uses — no React state
 * needed between them.
 */
export function HeaderSearchToggle() {
  const formRef = useRef<HTMLFormElement>(null);

  function isMobile() {
    return typeof window !== "undefined" && window.matchMedia("(max-width: 560px)").matches;
  }

  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    if (!isMobile()) return;
    e.preventDefault();
    const header = formRef.current?.closest("header");
    header?.classList.add("mobile-search-active");
    setTimeout(() => {
      header?.querySelector<HTMLInputElement>(".mobile-search-row input")?.focus();
    }, 250);
  }

  return (
    <form ref={formRef} action="/search" method="GET" className="topbar-search" role="search">
      <input type="text" name="q" placeholder="Type keywords...." autoComplete="off" />
      <button type="submit" aria-label="Search" onClick={handleClick}>
        <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    </form>
  );
}

export function HeaderMobileSearchRow() {
  const rootRef = useRef<HTMLDivElement>(null);

  function handleClose() {
    rootRef.current?.closest("header")?.classList.remove("mobile-search-active");
  }

  return (
    <div ref={rootRef} className="mobile-search-row">
      <form action="/search" method="GET" role="search">
        <input type="text" name="q" placeholder="Type keywords...." autoComplete="off" />
        <button type="submit" aria-label="Search">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </button>
        <button type="button" id="mobileSearchClose" aria-label="Close search" onClick={handleClose}>
          &#10005;
        </button>
      </form>
    </div>
  );
}
