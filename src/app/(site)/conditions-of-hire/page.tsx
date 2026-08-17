import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Alert } from "@/components/ui";
import {
  CONDITIONS_OF_HIRE,
  CURRENT_TERMS_VERSION,
  TERMS_ARE_DRAFT,
  TERMS_EFFECTIVE_DATE,
  outstandingDecisions,
} from "@/lib/terms";

export const metadata: Metadata = { title: "Conditions of hire" };

export default function ConditionsOfHirePage() {
  const decisions = outstandingDecisions();

  return (
    <>
      <PageHero
        eyebrow={`Version ${CURRENT_TERMS_VERSION}`}
        title="Conditions of hire"
        lead={`In effect from ${TERMS_EFFECTIVE_DATE}`}
      />

      <div className="mx-auto max-w-3xl px-4 py-10">
        {/* Stated at the top, not in a footnote. A customer is asked to accept
            this at checkout, so if it is not yet approved they are entitled to
            know that before they agree to it. */}
        {TERMS_ARE_DRAFT && (
          <div className="mb-8">
            <Alert tone="warning" title="Draft pending approval">
              This wording is a working draft prepared for The Playhouse Company
              and has not yet been approved. Several commercial terms, including
              the cancellation scale, are still to be confirmed and are marked
              below. Please contact{" "}
              <a
                href="mailto:bookings@playhousecompany.com"
                className="underline hover:text-brand-600"
              >
                bookings@playhousecompany.com
              </a>{" "}
              before relying on any clause.
            </Alert>
          </div>
        )}

        <div className="space-y-8">
          {CONDITIONS_OF_HIRE.map((clause) => (
            <section key={clause.heading}>
              <h2 className="font-display text-xl text-ink-900">{clause.heading}</h2>
              {clause.paragraphs.map((paragraph, i) => (
                <p key={i} className="mt-3 text-ink-700">
                  {paragraph}
                </p>
              ))}

              {clause.toConfirm && clause.toConfirm.length > 0 && (
                <div className="mt-4 border-l-4 border-amber-300 bg-amber-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-900">
                    To be confirmed by The Playhouse Company
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                    {clause.toConfirm.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          ))}
        </div>

        {decisions.length > 0 && (
          <div className="mt-12 border-t border-parchment-300 pt-6">
            <h2 className="font-display text-lg">
              Summary: {decisions.length} points awaiting confirmation
            </h2>
            <p className="mt-2 text-sm text-ink-500">
              These are the decisions needed before this document can be
              published as final. Until then bookings record their acceptance
              against version{" "}
              <span className="font-mono">{CURRENT_TERMS_VERSION}</span>, so a
              later revision cannot be applied retrospectively.
            </p>
          </div>
        )}
      </div>
    </>
  );
}
