"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
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

/** The sliding sidebar + backdrop overlay, rendered once outside the header
 *  (matches the original's <div id="overlay"> + <aside id="sidebar"> that
 *  sit as siblings right after </header> in components/header.php). */
export function NavDrawerPanel({ navItems }: { navItems: NavItem[] }) {
  const { isOpen, close } = useNavDrawer();

  return (
    <>
      <div
        className={`overlay${isOpen ? " active" : ""}`}
        role="presentation"
        onClick={close}
      />
      <aside
        className={`sidebar${isOpen ? " active" : ""}`}
        aria-label="Sidebar Navigation"
      >
        <div className="sidebar-header">
          <h2>Menu</h2>
          <button className="close-btn" aria-label="Close Menu" onClick={close} type="button">
            &#10005;
          </button>
        </div>
        <nav role="navigation">
          <ul>
            {navItems.map((item) => (
              <li key={item.url}>
                <a href={item.url} onClick={close}>
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </aside>
    </>
  );
}
