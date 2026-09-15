"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Some direct/legacy ad networks still ship document.write()-based tags.
 * Calling document.write() from a script that runs AFTER the page has
 * already finished loading implicitly calls document.open() first in
 * every browser — which wipes the entire current page, not just the ad
 * slot. AdminHtml.tsx detects this specific pattern and routes the block
 * here instead, so document.write only ever touches this iframe's own
 * private document.
 *
 * The iframe height tracks its own content via ResizeObserver — this is
 * NOT "fixing the ad's size"; it's the frame following whatever size the
 * ad naturally rendered at, exactly the same as if the tag were placed
 * directly on the page. `allow-same-origin` is included alongside
 * `allow-scripts` specifically so ResizeObserver can read the iframe's
 * own contentDocument.
 */
export function SafeAdFrame({ html }: { html: string }) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(2);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    let observer: ResizeObserver | null = null;
    let cancelled = false;

    function attach() {
      if (cancelled) return;
      const doc = iframe!.contentDocument;
      const body = doc?.body;
      if (!body) {
        // Same-origin srcDoc document not ready yet on this tick — retry.
        requestAnimationFrame(attach);
        return;
      }
      const update = () => setHeight(Math.max(body.scrollHeight, 2));
      update();
      observer = new ResizeObserver(update);
      observer.observe(body);
    }
    attach();

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [html]);

  const doc = `<!DOCTYPE html><html><head><base target="_parent"><style>html,body{margin:0;padding:0;}</style></head><body>${html}</body></html>`;

  return (
    <iframe
      ref={iframeRef}
      srcDoc={doc}
      title="Advertisement"
      scrolling="no"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      style={{ display: "block", width: "100%", border: "none", height }}
    />
  );
}
