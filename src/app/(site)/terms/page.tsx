import type { Metadata } from "next";
import { PageHero } from "@/components/PageHero";
import { Alert } from "@/components/ui";

export const metadata: Metadata = { title: "Terms of use" };

/**
 * Placeholder terms of use and conditions of hire.
 *
 * The checkout asks customers to accept "the conditions of hire", and the
 * footer links here, so the route must exist. The content is explicitly marked
 * as not yet in force. Customers are currently accepting a document that has
 * not been supplied, which is a live compliance gap, not a cosmetic one.
 */
export default function TermsPage() {
  return (
    <>
      <PageHero title="Terms of use" />

      <div className="mx-auto max-w-3xl px-4 py-10">
        <Alert tone="error" title="Awaiting approval, not yet in force">
          These terms are a placeholder prepared by the service provider. The
          checkout currently asks customers to accept the conditions of hire,
          but the approved document has not yet been supplied. It must be in
          place before the platform accepts live bookings.
        </Alert>

        <div className="mt-8 space-y-6 text-[15px] leading-relaxed text-ink-700">
          <section>
            <h2 className="mb-2 text-xl text-ink-900">Scope</h2>
            <p>
              These terms will govern the hire of venues from The Playhouse
              Company through this platform, and the use of the platform itself.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink-900">
              What the approved document must cover
            </h2>
            <ul className="list-disc space-y-1 pl-5">
              <li>
                Cancellation and refund terms, including notice periods and any
                sliding scale of charges.
              </li>
              <li>
                Deposit terms and the date by which the balance falls due.
              </li>
              <li>
                What venue hire includes, and what is charged separately:
                technical staffing, equipment, catering and box-office services.
              </li>
              <li>
                Access times, including any period reserved for setting up and
                clearing the venue.
              </li>
              <li>
                Liability, insurance and indemnity obligations of the hirer.
              </li>
              <li>
                Grounds on which The Playhouse Company may decline or cancel a
                booking, and the consequences for payments already made.
              </li>
              <li>Conduct, licensing and health-and-safety requirements.</li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink-900">Rates and VAT</h2>
            <p>
              Rates published on this platform are inclusive of value-added tax
              at the prevailing statutory rate. A tax invoice is issued on
              payment.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-xl text-ink-900">Enquiries</h2>
            <p>
              Venue hire enquiries:{" "}
              <a
                href="mailto:bookings@playhousecompany.com"
                className="text-brand-600 underline"
              >
                bookings@playhousecompany.com
              </a>{" "}
              or +27 31 369 9461.
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
