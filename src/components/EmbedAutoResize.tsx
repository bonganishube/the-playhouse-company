"use client";

import { useEffect } from "react";

/**
 * Keeps the host page's iframe sized to the portal's content, so the embedded
 * booking portal never shows an inner scrollbar.
 *
 * The height is published to the parent window with postMessage. The parent
 * (public/embed.js) verifies the message origin before acting on it.
 */
export function EmbedAutoResize() {
  useEffect(() => {
    if (window.parent === window) return; // not framed

    const publish = () => {
      const height = Math.ceil(
        document.documentElement.getBoundingClientRect().height,
      );
      window.parent.postMessage(
        { source: "playhouse-booking", type: "resize", height },
        "*",
      );
    };

    publish();

    const observer = new ResizeObserver(publish);
    observer.observe(document.documentElement);

    // Anchor navigations inside the portal change height after paint.
    window.addEventListener("load", publish);

    return () => {
      observer.disconnect();
      window.removeEventListener("load", publish);
    };
  }, []);

  return null;
}

/**
 * Breaks the customer out of the iframe to complete checkout on the booking
 * platform itself. Payment providers refuse to be framed, so checkout must run
 * at the top level.
 */
export function BreakoutLink({
  href,
  children,
  className,
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={href} target="_top" rel="noopener" className={className}>
      {children}
    </a>
  );
}
