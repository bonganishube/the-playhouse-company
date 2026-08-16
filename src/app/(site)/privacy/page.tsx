import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Privacy notice" };

/**
 * Placeholder privacy notice.
 *
 * The footer links here, so the route must exist rather than 404. The content
 * is explicitly marked as not yet in force: a placeholder presented as a real
 * policy would be worse than none, because a reader would believe undertakings
 * that The Playhouse Company has not actually made.
 */
export default function PrivacyPage() {
  return (
    <>
      <PageHero title="Privacy notice" />

      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert tone="warning" title="Awaiting approval, not yet in force">
          This notice is a placeholder prepared by the service provider. It has
          not been reviewed or approved by The Playhouse Company&apos;s
          information officer and must be replaced with the approved text before
          the platform goes live.
        </Alert>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-700">
          <section>
            <h2 className="mb-2 text-xl text-ink-900">What this covers</h2>
            <p>
              This notice will describe how The Playhouse Company collects, uses
              and protects personal information submitted through the venue
              booking platform, in accordance with the Protection of Personal
              Information Act 4 of 2013 (POPIA).
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink-900">
              Information the platform collects
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Contact details supplied when making a booking: name, email
                address, telephone number and organisation.
              </li>
              <li>
                Booking records, including the venues, dates and amounts
                involved.
              </li>
              <li>
                Payment records. Card details are handled by the payment
                provider and are never stored by this platform.
              </li>
              <li>
                Newsletter sign-ups, where consent has been given, together with
                the date that consent was recorded.
              </li>
              <li>
                Technical records kept for security and audit purposes,
                including the IP address from which a payment confirmation was
                received.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink-900">Your rights</h2>
            <p>
              Under POPIA you may request access to the personal information
              held about you, ask that it be corrected or deleted, object to its
              processing, and withdraw consent to direct marketing at any time.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink-900">Still to be confirmed</h2>
            <p className="mb-2">
              The following must be supplied by The Playhouse Company before
              this notice can be published:
            </p>
            <ul className="list-disc space-y-1 pl-5">
              <li>The information officer&apos;s name and contact details.</li>
              <li>Retention periods for booking and marketing records.</li>
              <li>
                Any third parties with whom personal information is shared.
              </li>
              <li>The complaints procedure and Information Regulator details.</li>
            </ul>
          </section>
        </div>
      </div>
    </>
  );
}
