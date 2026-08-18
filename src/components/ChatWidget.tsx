"use client";

import { useEffect, useRef, useState } from "react";
import { ChatText } from "./ChatText";

/**
 * The booking assistant, as a panel anchored to the corner of every page.
 *
 * Deliberately not a takeover. Someone who wants the ordinary booking form
 * should never have to dismiss a chat window to reach it, so this stays out of
 * the way until it is opened and returns focus to the launcher when closed.
 */

type Message = { role: "user" | "bot"; text: string };

const OPENING: Message = {
  role: "bot",
  text:
    "Hello. I can help you find a venue, check dates and make a booking. " +
    "What sort of event are you planning?",
};

export function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [viewport, setViewport] = useState<{ inset: number; height: number } | null>(
    null,
  );

  const launcher = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const log = useRef<HTMLDivElement>(null);

  // The thread lives on the server, so reopening the panel, or coming back
  // tomorrow, continues where the customer left off.
  useEffect(() => {
    if (!open || loaded) return;
    let cancelled = false;
    fetch("/api/bot/chat")
      .then((r) => r.json())
      .then((data: { messages: Message[] }) => {
        if (cancelled) return;
        setMessages(data.messages.length > 0 ? data.messages : [OPENING]);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setMessages([OPENING]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, loaded]);

  /**
   * Follow the on-screen keyboard.
   *
   * A phone does not resize the layout viewport when the keyboard opens; it
   * covers the bottom of it. `position: fixed` is laid out against that
   * unchanged viewport, so the panel, and with it the box being typed into,
   * ends up underneath the keyboard, and the page scrolls about trying to
   * reveal it. `100vh` has the same blind spot. Only the visual viewport knows
   * what is actually on screen, so the panel is measured against that and sat
   * directly on top of the keyboard while it is open.
   */
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    if (!vv) return;

    const measure = () => {
      const covered = window.innerHeight - vv.height - vv.offsetTop;
      setViewport({ inset: Math.max(0, Math.round(covered)), height: vv.height });
    };
    measure();
    vv.addEventListener("resize", measure);
    vv.addEventListener("scroll", measure);
    return () => {
      vv.removeEventListener("resize", measure);
      vv.removeEventListener("scroll", measure);
      setViewport(null);
    };
  }, [open]);

  // Keep the newest message in view without yanking the whole page around.
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    // Focusing on a phone throws the keyboard up before the customer has read
    // anything, and shrinks the panel to a sliver in the process. Pointer
    // rather than width, so a small window on a laptop still gets focus.
    if (window.matchMedia("(pointer: fine)").matches) input.current?.focus();
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  async function send(event: React.FormEvent) {
    event.preventDefault();
    const text = draft.trim();
    if (!text || busy) return;

    setDraft("");
    setMessages((m) => [...m, { role: "user", text }]);
    setBusy(true);

    try {
      const response = await fetch("/api/bot/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const data = (await response.json()) as { reply?: string; error?: string };
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text:
            data.reply ??
            data.error ??
            "I did not catch that. Please try again.",
        },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "bot",
          text: "I could not reach the booking system. Please try again in a moment.",
        },
      ]);
    } finally {
      setBusy(false);
      // Keeping focus keeps the keyboard up, which is what someone in the
      // middle of a conversation wants; it is only the opening jolt that is
      // unwelcome.
      input.current?.focus();
    }
  }

  // A keyboard covers a good part of a phone screen, so treat anything less as
  // the browser's toolbar sliding away rather than a keyboard opening.
  const keyboardUp = (viewport?.inset ?? 0) > 80;
  const GAP = 12;
  const panelAboveKeyboard = viewport
    ? {
        bottom: viewport.inset + GAP,
        height: `min(34rem, ${viewport.height - GAP * 2}px)`,
      }
    : undefined;

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Booking assistant"
          // Sits above the launcher, which itself clears the back-to-top
          // square. The height allows for both, so the panel never runs off
          // the top of a short window.
          // Full width on a phone, a corner panel from small screens up. The
          // height is dvh rather than vh so the browser's own collapsing
          // toolbar does not leave the panel hanging off the screen.
          className="fixed inset-x-3 bottom-28 z-50 flex h-[min(34rem,calc(100dvh-9rem))] flex-col border border-parchment-300 bg-white shadow-2xl sm:inset-x-auto sm:bottom-32 sm:right-6 sm:w-96"
          style={keyboardUp ? panelAboveKeyboard : undefined}
        >
          <header className="flex items-center justify-between border-b border-parchment-300 bg-brand-600 px-4 py-3 text-white">
            <div>
              <p className="font-display text-base leading-tight">Booking assistant</p>
              <p className="text-xs text-white/70">The Playhouse Company</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                launcher.current?.focus();
              }}
              aria-label="Close the booking assistant"
              className="-mr-1 px-2 py-1 text-xl leading-none text-white/80 hover:text-white"
            >
              &times;
            </button>
          </header>

          <div
            ref={log}
            className="flex-1 space-y-3 overflow-y-auto bg-parchment-50 px-4 py-4"
            aria-live="polite"
            aria-atomic="false"
          >
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "flex justify-end" : "flex justify-start"}
              >
                <p
                  className={`max-w-[85%] whitespace-pre-wrap px-3 py-2 text-sm ${
                    m.role === "user"
                      ? "bg-brand-600 text-white"
                      : "border border-parchment-300 bg-white text-ink-900"
                  }`}
                >
                  <ChatText text={m.text} tone={m.role} />
                </p>
              </div>
            ))}

            {busy && (
              <div className="flex justify-start">
                <p className="border border-parchment-300 bg-white px-3 py-2 text-sm text-ink-500">
                  Checking…
                </p>
              </div>
            )}
          </div>

          <form
            onSubmit={send}
            className="flex gap-2 border-t border-parchment-300 bg-white p-3"
          >
            <input
              ref={input}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Ask about a venue or a date"
              maxLength={1000}
              disabled={busy}
              aria-label="Message"
              // 16px on a phone, deliberately. Safari zooms into any field
              // with smaller text when it is focused, scaling the page up and
              // leaving the panel and its spacing visibly wrong for the rest
              // of the conversation. There is no way to undo that zoom, so the
              // text is sized to avoid triggering it; the desktop size is
              // restored from the breakpoint up, where the rule does not apply.
              className="min-w-0 flex-1 border border-parchment-300 px-3 py-2 text-base focus:border-brand-600 focus:outline-none sm:text-sm"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length === 0}
              className="bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>

          <p className="border-t border-parchment-200 bg-white px-3 pb-3 pt-2 text-[11px] leading-snug text-ink-500">
            An assistant, not a person. It can hold dates and start a booking; payment
            always happens through a secure link.
          </p>
        </div>
      )}

      <button
        ref={launcher}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close the booking assistant" : "Open the booking assistant"}
        // Lifted clear of the back-to-top square, which is pinned flush to the
        // corner. Sitting at bottom-6 put the two on top of each other, so one
        // was unreachable depending on which drew last.
        className={`fixed bottom-16 right-4 z-50 items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-brand-700 sm:right-6 ${
          // The panel is full width on a phone, so the launcher would sit on
          // top of it. Close is in the panel's own header there.
          open ? "hidden sm:flex" : "flex"
        }`}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M21 11.5a8.38 8.38 0 0 1-9 8.4 9.6 9.6 0 0 1-3.2-.5L3 21l1.6-4.6A8.4 8.4 0 0 1 12 3.1a8.38 8.38 0 0 1 9 8.4z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {open ? "Close" : "Ask about booking"}
      </button>
    </>
  );
}
