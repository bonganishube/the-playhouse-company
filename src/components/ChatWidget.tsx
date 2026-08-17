"use client";

import { useEffect, useRef, useState } from "react";

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
    input.current?.focus();
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
      input.current?.focus();
    }
  }

  return (
    <>
      {open && (
        <div
          role="dialog"
          aria-label="Booking assistant"
          className="fixed bottom-24 right-4 z-50 flex h-[min(34rem,calc(100vh-9rem))] w-[min(24rem,calc(100vw-2rem))] flex-col border border-parchment-300 bg-white shadow-2xl sm:right-6"
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
                  {m.text}
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
              className="min-w-0 flex-1 border border-parchment-300 px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
            />
            <button
              type="submit"
              disabled={busy || draft.trim().length === 0}
              className="bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
            >
              Send
            </button>
          </form>

          <p className="border-t border-parchment-200 bg-white px-3 pb-3 text-[11px] leading-snug text-ink-500">
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
        className="fixed bottom-6 right-4 z-50 flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-medium text-white shadow-lg transition-colors hover:bg-brand-700 sm:right-6"
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
