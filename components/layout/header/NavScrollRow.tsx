"use client";

import { useEffect, useRef, useState } from "react";
import type { NavItem } from "@/lib/navigation";

export function NavScrollRow({ navItems }: { navItems: NavItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showButtons, setShowButtons] = useState(false);
  const [fadeLeft, setFadeLeft] = useState(false);
  const [fadeRight, setFadeRight] = useState(true);
  const [action, setAction] = useState<"next" | "prev">("next");
  const scrollingRef = useRef(false);

  useEffect(() => {
    const sc = scrollRef.current;
    if (!sc) return;

    function update() {
      if (!sc) return;
      const max = sc.scrollWidth - sc.clientWidth;
      const needsScroll = max > 5;
      const atStart = sc.scrollLeft <= 5;
      const atEnd = sc.scrollLeft >= max - 5;

      setShowButtons(needsScroll);
      if (needsScroll) {
        setAction(atEnd ? "prev" : "next");
        setFadeLeft(!atStart);
        setFadeRight(!atEnd);
      }
    }

    update();
    sc.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      sc.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  function handleScrollClick() {
    const sc = scrollRef.current;
    if (!sc || scrollingRef.current) return;
    scrollingRef.current = true;
    const max = sc.scrollWidth - sc.clientWidth;
    if (action === "next") {
      sc.scrollTo({ left: Math.min(max, sc.scrollLeft + 300), behavior: "smooth" });
    } else {
      sc.scrollTo({ left: 0, behavior: "smooth" });
    }
    setTimeout(() => {
      scrollingRef.current = false;
    }, 500);
  }

  return (
    <div className="nav-wrap">
      <div className="nav-container">
        <div className="nav-scroll-container" ref={scrollRef}>
          <nav aria-label="Main Menu">
            <ul className="nav-content">
              {navItems.map((item) => (
                <li key={item.url}>
                  <a href={item.url}>{item.label}</a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
        <div className={`nav-fade-left${fadeLeft ? " show" : ""}`} />
        <div className={`nav-fade-right${!fadeRight ? " hide" : ""}`} />
      </div>

      <div className={`nav-buttons${showButtons ? " show" : ""}`}>
        <button
          className="nav-btn"
          aria-label={action === "next" ? "Next" : "Previous"}
          onClick={handleScrollClick}
          type="button"
        >
          {action === "next" ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
