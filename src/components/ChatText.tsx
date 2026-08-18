"use client";

import type { ReactNode } from "react";

/**
 * A chat message, with its links made clickable.
 *
 * The text is written by a language model, so it is parsed into React elements
 * rather than injected as HTML. There is no arrangement of
 * dangerouslySetInnerHTML that is safe to point at model output: a single
 * crafted reply, or a venue description echoed back from the database, would
 * be enough to run script in the customer's session.
 *
 * Two shapes are understood, because both occur. `[phrase](url)` is what the
 * assistant is told to write, and is what puts a link behind a short phrase.
 * Bare URLs are matched as well, since older messages in the transcript
 * contain them and a model does not follow an instruction every single time.
 */

/** A markdown link, or failing that a bare URL. */
const LINK =
  /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()]*[^\s<>().,;:!?'"])/g;

/**
 * The address to navigate to, or null to leave the text alone.
 *
 * Only http and https survive. The scheme is the whole point of the check:
 * `javascript:` and `data:` URLs are ordinary strings until something puts
 * them in an href, and this is the last place that decision is made.
 */
function safeHref(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.toString();
}

/** A bare URL shortened to something readable, without losing what it is. */
function shorten(href: string): string {
  const url = new URL(href);
  const tail = `${url.pathname}${url.search}`.replace(/\/$/, "");
  const label = `${url.host}${tail}`;
  return label.length > 44 ? `${label.slice(0, 43)}…` : label;
}

/**
 * The host, when the link leaves this site.
 *
 * A payment link goes to the gateway, not to us, and a customer being asked to
 * pay deserves to see where the button actually leads before they press it.
 * Same-site links say nothing, because naming our own domain on every link
 * would be noise that trains people to stop reading it.
 */
function externalHost(href: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const { host } = new URL(href);
    return host === window.location.host ? null : host;
  } catch {
    return null;
  }
}

export function ChatText({
  text,
  tone,
}: {
  text: string;
  /** Which bubble this sits in, so the link stays legible on its background. */
  tone: "user" | "bot";
}): ReactNode {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  for (const match of text.matchAll(LINK)) {
    const [whole, phrase, phraseUrl, bareUrl] = match;
    const at = match.index;
    const href = safeHref(phraseUrl ?? bareUrl ?? "");

    // Anything that is not a usable link is left exactly as it was written.
    if (!href) continue;

    if (at > cursor) parts.push(text.slice(cursor, at));
    cursor = at + whole.length;

    const host = externalHost(href);
    parts.push(
      <a
        key={key++}
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        // The full address on hover, so a short phrase is never the only
        // account of where the link goes.
        title={href}
        className={`underline underline-offset-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
          tone === "user"
            ? "font-medium text-white decoration-white/60 hover:decoration-white focus-visible:ring-white"
            : "font-medium text-brand-700 decoration-brand-300 hover:decoration-brand-600 focus-visible:ring-brand-600"
        }`}
      >
        {phrase ?? shorten(href)}
      </a>,
    );
    if (host) {
      parts.push(
        <span
          key={key++}
          className={tone === "user" ? "text-white/70" : "text-ink-500"}
        >
          {` (${host})`}
        </span>,
      );
    }
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts.length > 0 ? parts : text;
}
