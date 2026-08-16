"use client";

import { useActionState } from "react";
import { subscribeAction, type SubscribeState } from "@/app/actions/newsletter";

const initialState: SubscribeState = { ok: true };

/**
 * Footer newsletter sign-up.
 *
 * The consent line is not decoration: sign-up stores personal information for
 * direct marketing, which under POPIA requires informed consent and a stated
 * means of withdrawing it.
 */
export function NewsletterForm() {
  const [state, formAction, pending] = useActionState(subscribeAction, initialState);

  return (
    <div className="bg-sunflower-500/70 px-4 py-5 sm:px-8">
      <form
        action={formAction}
        className="flex flex-wrap items-center justify-center gap-3"
      >
        <label
          htmlFor="newsletter-name"
          className="text-lg font-bold whitespace-nowrap text-ink-900"
        >
          Subscribe:
        </label>

        <input
          id="newsletter-name"
          name="name"
          placeholder="Name"
          autoComplete="name"
          className="min-w-0 flex-1 basis-48 border border-black/10 bg-white px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-ink-900 focus:outline-none"
        />

        <input
          type="email"
          name="email"
          required
          placeholder="Email"
          autoComplete="email"
          aria-label="Email address"
          className="min-w-0 flex-1 basis-48 border border-black/10 bg-white px-4 py-2.5 text-sm text-ink-900 placeholder:text-ink-500/70 focus:border-ink-900 focus:outline-none"
        />

        <button
          type="submit"
          disabled={pending}
          className="bg-ink-900 px-7 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-60"
        >
          {pending ? "Sending…" : "Submit"}
        </button>
      </form>

      <p
        // Left-aligned on medium and smaller screens, where the line wraps and
        // a centred ragged edge is harder to read. Centred only once it sits on
        // one or two full-width lines.
        className="mt-3 text-left text-xs text-ink-900/70 lg:text-center"
        role={state.message ? "status" : undefined}
        aria-live="polite"
      >
        {state.message ?? (
          <>
            By subscribing you consent to The Playhouse Company contacting you
            about events and venue hire. You may withdraw consent at any time.
          </>
        )}
      </p>
    </div>
  );
}
