"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Real structural bug fixed here, found by comparing the actual
 * post_mannager.php's full DOM tree directly: its modals
 * (#faq-modal/#asset-view-modal/#fbcomment-modal/#ai-modal) are all
 * siblings of `<main>`, direct children of `<body>` — placed OUTSIDE
 * the form/editor-layout entirely. This project's modals were instead
 * rendered deep inside PostFormClient's own JSX tree (inside `<form>` →
 * `.editor-layout` → ... → `.main-content`), several levels of nested
 * containers away from body. `position: fixed` is supposed to be
 * viewport-relative regardless of DOM depth, but real-world layout
 * (flex/grid contexts, stacking contexts, and any ancestor a future
 * change might give a transform/filter/contain property) makes deeply
 * nested "fixed" elements fragile in exactly the way reported: modal
 * position drifting or clipping relative to scroll instead of staying
 * pinned to a fixed screen position. A React portal renders the modal's
 * DOM node directly under `<body>` — matching the reference's actual
 * structure exactly and removing any dependency on intermediate
 * ancestors' CSS entirely, which is the actually robust fix rather than
 * chasing individual CSS properties one at a time.
 */
export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // Portals need `document.body` to exist, which isn't available
    // during server rendering — this "mount flag" pattern is the
    // standard, intentional way to defer portal creation to the client
    // only, exactly the "sync with an external system after mount" case
    // effects are for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
