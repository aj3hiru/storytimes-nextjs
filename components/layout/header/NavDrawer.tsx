"use client";

import { optimizedImage } from "@/lib/urls";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/lib/navigation";

interface NavDrawerContextValue {
  isOpen: boolean;
  toggle: () => void;
  close: () => void;
}

const NavDrawerContext = createContext<NavDrawerContextValue | null>(null);

export function NavDrawerProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);
  const close = useCallback(() => setIsOpen(false), []);

  return (
    <NavDrawerContext.Provider value={{ isOpen, toggle, close }}>
      {children}
    </NavDrawerContext.Provider>
  );
}

function useNavDrawer(): NavDrawerContextValue {
  const ctx = useContext(NavDrawerContext);
  if (!ctx) {
    throw new Error("useNavDrawer must be used within a NavDrawerProvider");
  }
  return ctx;
}

/** The hamburger (☰) button rendered inside the header markup itself. */
export function MenuToggleButton() {
  const { isOpen, toggle } = useNavDrawer();
  return (
    <button
      className="menu-toggle"
      id="menuToggle"
      aria-label="Open Menu"
      aria-expanded={isOpen}
      onClick={toggle}
      type="button"
    >
      &#9776;
    </button>
  );
}

export interface DrawerCategory {
  name: string;
  url: string;
  count: number;
}

function iconFor(item: NavItem): string {
  const k = `${item.label} ${item.url}`.toLowerCase();
  if (item.url === "/" || /\bhome\b/.test(k)) return "fa-house";
  if (k.includes("categor")) return "fa-table-cells-large";
  if (k.includes("about")) return "fa-circle-info";
  if (k.includes("contact")) return "fa-envelope";
  if (k.includes("privacy") || k.includes("policy") || k.includes("terms")) return "fa-shield-halved";
  if (k.includes("search")) return "fa-magnifying-glass";
  if (k.includes("tag")) return "fa-tags";
  return "fa-file-lines";
}

function isActive(pathname: string, url: string): boolean {
  if (/^https?:/i.test(url)) return false;
  const path = url.split(/[?#]/)[0] || "/";
  return path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");
}

/**
 * Mobile menu in the style of the sriandaltraders.co.in drawer: slides in
 * from the left — brand + close, a greeting block with two quick buttons,
 * icon rows with chevrons (current page highlighted with a side bar),
 * Categories opening in place, dark mode at the bottom.
 */
export function NavDrawerPanel({
  navItems,
  siteName,
  siteTagline,
  logoUrl,
  categories,
  showDarkmode,
}: {
  navItems: NavItem[];
  siteName: string;
  siteTagline: string;
  logoUrl: string;
  categories: DrawerCategory[];
  showDarkmode: boolean;
}) {
  const { isOpen, close } = useNavDrawer();
  const pathname = usePathname() || "/";
  const [catsOpen, setCatsOpen] = useState(false);
  const [dark, setDark] = useState(false);

  // Close on navigation and Escape; lock page scroll while open.
  useEffect(() => close(), [pathname, close]);
  useEffect(() => {
    if (!isOpen) return;
    setDark(document.documentElement.getAttribute("data-theme") === "dark");
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [isOpen, close]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.setAttribute("data-theme", "dark");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
  };

  return (
    <>
      <div className={`mnav-overlay${isOpen ? " open" : ""}`} role="presentation" onClick={close} />
      <aside className={`mnav${isOpen ? " open" : ""}`} aria-label="Mobile Navigation" aria-hidden={!isOpen} inert={!isOpen}>
        <div className="mnav-top">
          <a href="/" className="mnav-brand" onClick={close}>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={optimizedImage(logoUrl, 384)} alt={siteName} width={180} height={36} />
            ) : (
              <span>{siteName}</span>
            )}
          </a>
          <button type="button" className="mnav-close" aria-label="Close menu" onClick={close}>
            <i className="fas fa-xmark" />
          </button>
        </div>

        <div className="mnav-hello">
          <div className="mnav-hello-row">
            <span className="mnav-avatar">
              <i className="fas fa-book-open" />
            </span>
            <div className="mnav-hello-text">
              <p className="mnav-hello-title">Hello, Reader</p>
              <p className="mnav-hello-sub">{siteTagline || "Discover new stories every day"}</p>
            </div>
          </div>
          <div className="mnav-hello-btns">
            <a href="/search" className="mnav-btn outline" onClick={close}>
              <i className="fas fa-magnifying-glass" /> Search
            </a>
            <a href="/categories" className="mnav-btn solid" onClick={close}>
              <i className="fas fa-table-cells-large" /> Categories
            </a>
          </div>
        </div>
        <div className="mnav-gap" aria-hidden />

        <nav className="mnav-list" role="navigation" aria-label="Menu">
          <ul>
            {navItems.map((item) => {
              const active = isActive(pathname, item.url);
              const hasCats = item.url.replace(/\/+$/, "") === "/categories" && categories.length > 0;
              const external = /^https?:/i.test(item.url);
              return (
                <li key={item.url + item.label} className={active ? "active" : undefined}>
                  <div className="mnav-row">
                    <a href={item.url} onClick={close} className="mnav-link" target={external ? "_blank" : undefined} rel={external ? "noopener noreferrer" : undefined}>
                      <i className={`fas ${iconFor(item)} mnav-icon`} />
                      <span>{item.label}</span>
                    </a>
                    {hasCats ? (
                      <button
                        type="button"
                        className={`mnav-chev${catsOpen ? " open" : ""}`}
                        aria-label={catsOpen ? "Hide categories" : "Show categories"}
                        aria-expanded={catsOpen}
                        onClick={() => setCatsOpen((v) => !v)}
                      >
                        <i className="fas fa-chevron-down" />
                      </button>
                    ) : (
                      <i className="fas fa-chevron-right mnav-arrow" aria-hidden />
                    )}
                  </div>
                  {hasCats && (
                    <ul className={`mnav-sub${catsOpen ? " open" : ""}`}>
                      {categories.map((c) => (
                        <li key={c.url} className={isActive(pathname, c.url) ? "active" : undefined}>
                          <a href={c.url} onClick={close}>
                            <span>{c.name}</span>
                            <span className="mnav-count">{c.count}</span>
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        {showDarkmode && (
          <div className="mnav-foot">
            <button type="button" className="mnav-dark" onClick={toggleDark} aria-pressed={dark}>
              <i className={`fas ${dark ? "fa-sun" : "fa-moon"} mnav-icon`} />
              <span>{dark ? "Light mode" : "Dark mode"}</span>
              <span className={`mnav-switch${dark ? " on" : ""}`} aria-hidden />
            </button>
          </div>
        )}
      </aside>
    </>
  );
}
